import { inWindow, isFailure, topBy, type AnalysisContext } from "@/lib/analytics/dataset";
import { chip, type InsightOf } from "@/lib/analytics/insight";
import {
  MS_PER_DAY,
  binomialUpperTail,
  median,
  round,
  significanceOfP,
} from "@/lib/analytics/stats";
import type { OrderFact } from "@/lib/analytics/types";

export const POST_MAINTENANCE_DAYS = 7;
export const MAJOR_MIN_HOURS = 4;
export const MAJOR_MEDIAN_FACTOR = 1.5;
export const POST_MAINTENANCE_MAX_P = 0.02;

function maintenanceFinishedAt(order: OrderFact): number | null {
  return order.closedAt ?? order.doneAt;
}

export function majorMaintenance(orders: readonly OrderFact[]): OrderFact[] {
  const planned = orders.filter(
    (order) =>
      order.kind === "planned" &&
      order.status === "closed" &&
      maintenanceFinishedAt(order) !== null,
  );
  const threshold = Math.max(
    MAJOR_MIN_HOURS,
    MAJOR_MEDIAN_FACTOR * median(planned.map((order) => order.standardHours ?? 0)),
  );
  return planned.filter((order) => (order.standardHours ?? 0) >= threshold);
}

function coveredDays(
  starts: readonly number[],
  from: number,
  to: number,
  lengthMs: number,
): number {
  const intervals = starts
    .map((start) => [Math.max(start, from), Math.min(start + lengthMs, to)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursorEnd = -Infinity;
  for (const [start, end] of intervals) {
    if (start >= cursorEnd) {
      total += end - start;
      cursorEnd = end;
    } else if (end > cursorEnd) {
      total += end - cursorEnd;
      cursorEnd = end;
    }
  }
  return total / MS_PER_DAY;
}

export function findPostMaintenanceFailures(
  context: AnalysisContext,
): InsightOf<"post_maintenance_failure">[] {
  const windowMs = POST_MAINTENANCE_DAYS * MS_PER_DAY;
  const { now, since } = context.dataset;
  return context.dataset.equipment.flatMap((equipment) => {
    const own = context.dataset.orders.filter((order) => order.equipmentId === equipment.id);
    const failures = own.filter(isFailure).sort((a, b) => a.issuedAt - b.issuedAt);
    const maintenance = majorMaintenance(own);
    const finished = maintenance.map((order) => maintenanceFinishedAt(order) as number);
    const followUpOf = (end: number) =>
      failures.find((failure) => failure.issuedAt > end && failure.issuedAt <= end + windowMs);
    const outside = failures.filter(
      (failure) =>
        !finished.some((end) => failure.issuedAt > end && failure.issuedAt <= end + windowMs),
    );
    const uncovered = Math.max(
      context.historyDays - coveredDays(finished, since, now, windowMs),
      POST_MAINTENANCE_DAYS,
    );
    const baseline = 1 - Math.exp(-(outside.length / uncovered) * POST_MAINTENANCE_DAYS);
    const observed = maintenance.flatMap((order) => {
      const end = maintenanceFinishedAt(order) as number;
      if (!inWindow(end, context.window)) return [];
      const followUp = followUpOf(end);
      if (!followUp && end > now - windowMs) return [];
      return [{ order, end, followUp }];
    });
    const followed = observed.filter((item) => item.followUp !== undefined);
    if (observed.length < 2 || followed.length < 2 || followed.length / observed.length < 0.5) {
      return [];
    }
    const p = binomialUpperTail(followed.length, observed.length, baseline);
    if (p > POST_MAINTENANCE_MAX_P) return [];
    const followUps = followed.map((item) => item.followUp as OrderFact);
    const gaps = followed.map(
      (item) => ((item.followUp as OrderFact).issuedAt - item.end) / MS_PER_DAY,
    );
    const top = topBy(followUps, (order) => order.faultCodeId);
    const fault = top.key ? context.index.faults.get(top.key) : undefined;
    const medianGap = round(median(gaps), 1);
    const followedShare = round((followed.length / observed.length) * 100);
    return [
      {
        kind: "post_maintenance_failure" as const,
        entityType: "equipment" as const,
        entityId: equipment.id,
        severity: p <= 0.001 ? 3 : 2,
        significance: significanceOfP(p),
        siteId: equipment.siteId,
        equipmentId: equipment.id,
        faultCodeId: fault?.id ?? null,
        relatedOrderIds: followed.flatMap((item) => [
          item.order.id,
          (item.followUp as OrderFact).id,
        ]),
        rcaCaseId: null,
        params: {
          equipment: equipment.name,
          maintenances: observed.length,
          followed: followed.length,
          medianGapDays: medianGap,
          baselinePercent: round(baseline * 100),
          topFaultCode: fault?.code ?? null,
          topFaultName: fault?.name ?? null,
          topFaultCategory: fault?.category ?? null,
        },
        chips: [
          chip("followed", followedShare, "percent"),
          chip("medianGap", medianGap, "days"),
          chip("baseline", round(baseline * 100), "percent"),
          chip("pValue", p, "pvalue"),
        ],
        stats: { p, baseline, maxGapDays: round(Math.max(...gaps), 1) },
      },
    ];
  });
}
