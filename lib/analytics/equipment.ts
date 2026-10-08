import {
  failureCountsByEquipment,
  inWindow,
  isFailure,
  peerDailyRate,
  topBy,
  type AnalysisContext,
} from "@/lib/analytics/dataset";
import { chip, type InsightOf } from "@/lib/analytics/insight";
import { poissonUpperTail, round, significanceOfP, sum } from "@/lib/analytics/stats";
import type { OrderFact } from "@/lib/analytics/types";

export const PROBLEM_MIN_COUNT = 4;
export const PROBLEM_MIN_RATIO = 1.8;
export const PROBLEM_MAX_P = 0.001;
export const PROBLEM_SEVERE_RATIO = 2.5;
export const SITE_MIN_COST_SHARE = 0.3;

function windowFailures(context: AnalysisContext): OrderFact[] {
  return context.dataset.orders.filter(
    (order) => isFailure(order) && inWindow(order.issuedAt, context.window),
  );
}

export function findProblemEquipment(context: AnalysisContext): InsightOf<"problem_equipment">[] {
  const failures = windowFailures(context);
  const historyCounts = failureCountsByEquipment(
    context.dataset.orders,
    context.dataset.since,
    context.dataset.now,
  );
  return context.dataset.equipment.flatMap((equipment) => {
    const own = failures.filter((order) => order.equipmentId === equipment.id);
    const dailyRate = peerDailyRate(context, equipment, historyCounts);
    const expectedWindow = Math.max(dailyRate * context.window.days, 1);
    const expectedHistory = Math.max(dailyRate * context.historyDays, 1);
    const ratio = own.length / expectedWindow;
    const pWindow = poissonUpperTail(own.length, expectedWindow);
    const pHistory = poissonUpperTail(historyCounts.get(equipment.id) ?? 0, expectedHistory);
    const p = Math.min(pWindow, pHistory);
    if (own.length < PROBLEM_MIN_COUNT || ratio < PROBLEM_MIN_RATIO || p > PROBLEM_MAX_P) {
      return [];
    }
    const top = topBy(own, (order) => order.faultCodeId);
    const fault = top.key ? context.index.faults.get(top.key) : undefined;
    const downtimeHours = round(sum(own.map((order) => order.downtimeHours)), 1);
    const downtimeCost = Math.round(sum(own.map((order) => order.downtimeCost)));
    const faultShare = own.length === 0 ? 0 : top.count / own.length;
    return [
      {
        kind: "problem_equipment" as const,
        entityType: "equipment" as const,
        entityId: equipment.id,
        severity:
          ratio >= PROBLEM_SEVERE_RATIO || (ratio >= 2 && equipment.criticality >= 3) ? 3 : 2,
        significance: significanceOfP(p),
        siteId: equipment.siteId,
        equipmentId: equipment.id,
        faultCodeId: fault?.id ?? null,
        relatedOrderIds: own.map((order) => order.id),
        rcaCaseId: null,
        params: {
          equipment: equipment.name,
          unplanned: own.length,
          days: context.window.days,
          peerMedian: round(expectedWindow, 1),
          peerRatio: round(ratio, 1),
          topFaultCode: fault?.code ?? null,
          topFaultName: fault?.name ?? null,
          topFaultCount: fault ? top.count : 0,
          topFaultCategory: fault?.category ?? null,
          downtimeHours,
          downtimeCost,
        },
        chips: [
          chip("unplanned", own.length, "count"),
          chip("peerRatio", round(ratio, 1), "ratio"),
          ...(fault ? [chip("faultShare", round(faultShare * 100), "percent")] : []),
          chip("downtimeHours", downtimeHours, "hours"),
          chip("downtimeCost", downtimeCost, "money"),
        ],
        stats: {
          pWindow,
          pHistory,
          expectedWindow,
          historyCount: historyCounts.get(equipment.id) ?? 0,
        },
      },
    ];
  });
}

export function findProblemSite(context: AnalysisContext): InsightOf<"problem_site">[] {
  const failures = windowFailures(context);
  const totalCost = sum(failures.map((order) => order.downtimeCost));
  if (totalCost <= 0) return [];
  const stats = context.dataset.sites.map((site) => {
    const own = failures.filter((order) => order.siteId === site.id);
    const units = context.dataset.equipment.filter((unit) => unit.siteId === site.id).length;
    return { site, own, units, cost: sum(own.map((order) => order.downtimeCost)) };
  });
  const top = [...stats].sort((a, b) => b.cost - a.cost)[0];
  if (!top || top.units === 0 || top.cost / totalCost < SITE_MIN_COST_SHARE) return [];
  const others = stats.filter((item) => item.site.id !== top.site.id);
  const otherUnits = sum(others.map((item) => item.units));
  const otherFailures = sum(others.map((item) => item.own.length));
  const otherRate = otherUnits === 0 ? 0 : otherFailures / otherUnits;
  const expected = Math.max(otherRate * top.units, 1);
  const p = poissonUpperTail(top.own.length, expected);
  const rateRatio = top.own.length / expected;
  const costByEquipment = new Map<string, number>();
  for (const order of top.own) {
    costByEquipment.set(
      order.equipmentId,
      (costByEquipment.get(order.equipmentId) ?? 0) + order.downtimeCost,
    );
  }
  const topEquipment = [...costByEquipment.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .flatMap(([id]) => {
      const name = context.index.equipment.get(id)?.name;
      return name ? [name] : [];
    });
  const downtimeHours = round(sum(top.own.map((order) => order.downtimeHours)), 1);
  const costShare = round((top.cost / totalCost) * 100);
  const rateSignificant = p <= 0.01 && rateRatio >= 1.2;
  return [
    {
      kind: "problem_site",
      entityType: "site",
      entityId: top.site.id,
      severity: rateSignificant ? 2 : 1,
      significance: significanceOfP(p),
      siteId: top.site.id,
      equipmentId: null,
      faultCodeId: null,
      relatedOrderIds: [],
      rcaCaseId: null,
      params: {
        site: top.site.name,
        unplanned: top.own.length,
        days: context.window.days,
        downtimeHours,
        downtimeCost: Math.round(top.cost),
        costShare,
        rateRatio: round(rateRatio, 1),
        rateSignificant,
        topEquipment,
      },
      chips: [
        chip("unplanned", top.own.length, "count"),
        chip("downtimeHours", downtimeHours, "hours"),
        chip("downtimeCost", Math.round(top.cost), "money"),
        chip("costShare", costShare, "percent"),
      ],
      stats: { p, expected, otherRate },
    },
  ];
}
