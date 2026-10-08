import { isFailure, pairKey, peersOf, type AnalysisContext } from "@/lib/analytics/dataset";
import { chip, type InsightOf, type RcaState } from "@/lib/analytics/insight";
import { MS_PER_DAY, poissonUpperTail, round, significanceOfP, sum } from "@/lib/analytics/stats";
import type { OrderFact } from "@/lib/analytics/types";

export const REPEAT_WINDOW_DAYS = 30;
export const REPEAT_MIN_OCCURRENCES = 3;
export const REPEAT_MAX_P = 0.01;
export const REPEAT_RCA_MAX_P = 0.001;
export const REPEAT_SEVERE_P = 1e-4;
export const REPEAT_SEVERE_COUNT = 6;
export const REPEAT_EXPECTED_FLOOR = 0.2;

export interface RepeatCluster {
  orders: OrderFact[];
  spanDays: number;
  minGapDays: number;
  maxGapDays: number;
}

export function latestCluster(
  failures: readonly OrderFact[],
  recentFrom: number,
  windowMs = REPEAT_WINDOW_DAYS * MS_PER_DAY,
): RepeatCluster | null {
  const sorted = [...failures].sort((a, b) => a.issuedAt - b.issuedAt);
  let best: OrderFact[] = [];
  for (let end = 0; end < sorted.length; end += 1) {
    const last = sorted[end] as OrderFact;
    if (last.issuedAt < recentFrom) continue;
    const members = sorted
      .slice(0, end + 1)
      .filter((candidate) => last.issuedAt - candidate.issuedAt <= windowMs);
    if (members.length >= best.length) best = members;
  }
  if (best.length < 2) return null;
  const gaps = best
    .slice(1)
    .map((item, index) => (item.issuedAt - (best[index] as OrderFact).issuedAt) / MS_PER_DAY);
  return {
    orders: best,
    spanDays: round(
      ((best.at(-1) as OrderFact).issuedAt - (best[0] as OrderFact).issuedAt) / MS_PER_DAY,
      1,
    ),
    minGapDays: round(Math.min(...gaps), 1),
    maxGapDays: round(Math.max(...gaps), 1),
  };
}

function expectedPer30(
  context: AnalysisContext,
  equipmentId: string,
  faultCodeId: string,
  failures: readonly OrderFact[],
): number {
  const equipment = context.index.equipment.get(equipmentId);
  if (!equipment) return REPEAT_EXPECTED_FLOOR;
  const peers = peersOf(context, equipment);
  if (peers.length === 0) return REPEAT_EXPECTED_FLOOR;
  const peerIds = new Set(peers.map((peer) => peer.id));
  const peerCount = failures.filter(
    (order) => order.faultCodeId === faultCodeId && peerIds.has(order.equipmentId),
  ).length;
  const rate = (peerCount / peers.length / context.historyDays) * REPEAT_WINDOW_DAYS;
  return Math.max(rate, REPEAT_EXPECTED_FLOOR);
}

function rcaStateFor(
  context: AnalysisContext,
  key: string,
): { id: string | null; state: RcaState } {
  const open = context.index.openRcaByPair.get(key);
  if (!open) return { id: null, state: "none" };
  return { id: open.id, state: open.status === "in_progress" ? "in_progress" : "open" };
}

export function findRepeatFaults(context: AnalysisContext): InsightOf<"repeat_fault">[] {
  const failures = context.dataset.orders.filter(
    (order) => isFailure(order) && order.faultCodeId !== null,
  );
  const groups = new Map<string, OrderFact[]>();
  for (const order of failures) {
    const key = pairKey(order.equipmentId, order.faultCodeId);
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }
  const recentFrom = context.window.end - REPEAT_WINDOW_DAYS * MS_PER_DAY;
  return [...groups.entries()].flatMap(([key, orders]) => {
    const first = orders[0] as OrderFact;
    const faultCodeId = first.faultCodeId as string;
    const lastClosed = context.index.lastClosedRcaByPair.get(key)?.closedAt ?? null;
    const fresh =
      lastClosed === null ? orders : orders.filter((order) => order.issuedAt > lastClosed);
    const rca = rcaStateFor(context, key);
    const tracked = rca.state !== "none";
    const cluster = latestCluster(fresh, recentFrom);
    if (!cluster || cluster.orders.length < (tracked ? 2 : REPEAT_MIN_OCCURRENCES)) return [];
    const occurrences = cluster.orders.length;
    const expected = expectedPer30(context, first.equipmentId, faultCodeId, failures);
    const p = poissonUpperTail(occurrences, expected);
    if (!tracked && p > REPEAT_MAX_P) return [];
    const equipment = context.index.equipment.get(first.equipmentId);
    const fault = context.index.faults.get(faultCodeId);
    if (!equipment || !fault) return [];
    const severity =
      p <= REPEAT_SEVERE_P || occurrences >= REPEAT_SEVERE_COUNT
        ? 3
        : p <= REPEAT_RCA_MAX_P || tracked
          ? 2
          : 1;
    const downtimeCost = Math.round(sum(cluster.orders.map((order) => order.downtimeCost)));
    return [
      {
        kind: "repeat_fault" as const,
        entityType: "equipment" as const,
        entityId: equipment.id,
        severity: severity as 1 | 2 | 3,
        significance: significanceOfP(p),
        siteId: equipment.siteId,
        equipmentId: equipment.id,
        faultCodeId: fault.id,
        relatedOrderIds: cluster.orders.map((order) => order.id),
        rcaCaseId: rca.id,
        params: {
          equipment: equipment.name,
          faultCode: fault.code,
          faultName: fault.name,
          faultCategory: fault.category,
          occurrences,
          spanDays: cluster.spanDays,
          minGapDays: cluster.minGapDays,
          maxGapDays: cluster.maxGapDays,
          expected: round(expected, 1),
          rcaState: rca.state,
        },
        chips: [
          chip("occurrences", occurrences, "count"),
          chip("spanDays", cluster.spanDays, "days"),
          chip("expected", round(expected, 1), "number"),
          chip("pValue", p, "pvalue"),
          chip("downtimeCost", downtimeCost, "money"),
        ],
        stats: { p, expected, downtimeCost },
      },
    ];
  });
}

export function needsRootCause(insight: InsightOf<"repeat_fault">): boolean {
  return (
    insight.params.rcaState === "none" &&
    insight.params.occurrences >= REPEAT_MIN_OCCURRENCES &&
    (insight.stats.p ?? 1) <= REPEAT_RCA_MAX_P
  );
}
