import { inWindow, isFailure, plantHour, type AnalysisContext } from "@/lib/analytics/dataset";
import { chip, type InsightOf, type ShiftDimension } from "@/lib/analytics/insight";
import { oneProportionZ, round, significanceOfZ } from "@/lib/analytics/stats";
import type { OrderFact } from "@/lib/analytics/types";

export const SHIFT_MIN_FAILURES = 40;
export const SHIFT_MIN_Z = 3.5;
export const SHIFT_MIN_LIFT = 1.25;

export const TIME_OF_DAY_BUCKETS = ["00-06", "06-12", "12-18", "18-24"] as const;

export function timeOfDayBucket(timestamp: number): string {
  return TIME_OF_DAY_BUCKETS[Math.floor(plantHour(timestamp) / 6)] as string;
}

function groupsOf(
  failures: readonly OrderFact[],
  dimension: ShiftDimension,
): { groups: Map<string, number>; expectedShare: number } {
  const groups = new Map<string, number>();
  const keyOf = (order: OrderFact): string | null =>
    dimension === "period"
      ? order.shiftPeriod
      : dimension === "crew"
        ? order.shiftCrew
        : timeOfDayBucket(order.issuedAt);
  for (const order of failures) {
    const key = keyOf(order);
    if (key) groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const expectedShare =
    dimension === "period" ? 0.5 : dimension === "crew" ? 1 / Math.max(groups.size, 1) : 0.25;
  return { groups, expectedShare };
}

export function findShiftFailureEffects(context: AnalysisContext): InsightOf<"shift_effect">[] {
  const failures = context.dataset.orders.filter(
    (order) => isFailure(order) && inWindow(order.issuedAt, context.window),
  );
  if (failures.length < SHIFT_MIN_FAILURES) return [];
  const dimensions: ShiftDimension[] = ["period", "crew", "time_of_day"];
  return dimensions.flatMap((dimension) => {
    const { groups, expectedShare } = groupsOf(failures, dimension);
    if (groups.size < 2) return [];
    return [...groups.entries()].flatMap(([key, count]) => {
      const share = count / failures.length;
      const z = oneProportionZ(count, failures.length, expectedShare);
      if (z < SHIFT_MIN_Z || share < SHIFT_MIN_LIFT * expectedShare) return [];
      return [
        {
          kind: "shift_effect" as const,
          entityType: "shift" as const,
          entityId: null,
          severity: z >= 5 ? 3 : 2,
          significance: significanceOfZ(z),
          siteId: null,
          equipmentId: null,
          faultCodeId: null,
          relatedOrderIds: [],
          rcaCaseId: null,
          params: {
            measure: "failure_share" as const,
            dimension,
            group: key,
            count,
            total: failures.length,
            share: round(share * 100),
            expectedShare: round(expectedShare * 100),
            z: round(z, 1),
          },
          chips: [
            chip("share", round(share * 100), "percent"),
            chip("expectedShare", round(expectedShare * 100), "percent"),
            chip("unplanned", count, "count"),
            chip("zScore", round(z, 1), "number"),
          ],
          stats: { z },
        },
      ];
    });
  });
}
