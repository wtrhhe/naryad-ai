import {
  inWindow,
  isFailure,
  repairFinishedAt,
  shortPersonName,
  type AnalysisContext,
} from "@/lib/analytics/dataset";
import { chip, type InsightOf } from "@/lib/analytics/insight";
import { MS_PER_DAY, round, significanceOfZ, twoProportionZ } from "@/lib/analytics/stats";
import type { OrderFact } from "@/lib/analytics/types";

export const REPEAT_AFTER_REPAIR_DAYS = 7;
export const RATE_MIN_REPAIRS = 8;
export const RATE_MIN_REPEATS = 4;
export const RATE_MIN_RATIO = 1.8;
export const RATE_MIN_Z = 3;
export const RATE_MAX_FINDINGS = 6;

type Dimension = "worker" | "brigade" | "crew" | "period";

export interface Repair {
  order: OrderFact;
  repeated: boolean;
  repeatOrderId: string | null;
  worker: string | null;
  brigade: string | null;
  crew: string | null;
  period: string;
}

export function collectRepairs(context: AnalysisContext): Repair[] {
  const failures = context.dataset.orders.filter(isFailure);
  const windowMs = REPEAT_AFTER_REPAIR_DAYS * MS_PER_DAY;
  return context.dataset.orders.flatMap((order) => {
    const finishedAt = repairFinishedAt(order);
    if (
      order.kind !== "unplanned" ||
      order.status !== "closed" ||
      finishedAt === null ||
      order.faultCodeId === null ||
      !inWindow(order.issuedAt, context.window)
    ) {
      return [];
    }
    const repeat = failures.find(
      (candidate) =>
        candidate.id !== order.id &&
        candidate.equipmentId === order.equipmentId &&
        candidate.faultCodeId === order.faultCodeId &&
        candidate.issuedAt > finishedAt &&
        candidate.issuedAt <= finishedAt + windowMs,
    );
    const assignee = order.assigneeId ? context.index.employees.get(order.assigneeId) : undefined;
    return [
      {
        order,
        repeated: repeat !== undefined,
        repeatOrderId: repeat?.id ?? null,
        worker: order.assigneeId,
        brigade: order.brigadeId ?? assignee?.brigadeId ?? null,
        crew: order.shiftCrew,
        period: order.shiftPeriod,
      },
    ];
  });
}

interface Candidate {
  dimension: Dimension;
  key: string;
  members: Repair[];
  repeats: number;
  rate: number;
  restRate: number;
  restSize: number;
  z: number;
}

function candidates(active: readonly Repair[]): Candidate[] {
  const totalRepeats = active.filter((repair) => repair.repeated).length;
  const dimensions: Dimension[] = ["worker", "brigade", "crew", "period"];
  return dimensions.flatMap((dimension) => {
    const groups = new Map<string, Repair[]>();
    for (const repair of active) {
      const key = repair[dimension];
      if (key) groups.set(key, [...(groups.get(key) ?? []), repair]);
    }
    return [...groups.entries()].flatMap(([key, members]) => {
      const repeats = members.filter((repair) => repair.repeated).length;
      const restSize = active.length - members.length;
      const restRepeats = totalRepeats - repeats;
      if (
        members.length < RATE_MIN_REPAIRS ||
        repeats < RATE_MIN_REPEATS ||
        restSize < RATE_MIN_REPAIRS
      ) {
        return [];
      }
      const rate = repeats / members.length;
      const restRate = restRepeats / restSize;
      const z = twoProportionZ(repeats, members.length, restRepeats, restSize);
      if (z < RATE_MIN_Z || rate < RATE_MIN_RATIO * Math.max(restRate, 0.02)) return [];
      return [{ dimension, key, members, repeats, rate, restRate, restSize, z }];
    });
  });
}

export type RepeatRateInsight =
  | InsightOf<"worker_repeat_failures">
  | InsightOf<"brigade_repeat_failures">
  | InsightOf<"shift_effect">;

function toInsight(context: AnalysisContext, candidate: Candidate): RepeatRateInsight | null {
  const severity = candidate.z >= 5 && candidate.rate >= 0.4 ? 3 : 2;
  const rate = round(candidate.rate * 100);
  const teamRate = round(candidate.restRate * 100);
  const z = round(candidate.z, 1);
  const base = {
    severity: severity as 2 | 3,
    significance: significanceOfZ(candidate.z),
    equipmentId: null,
    faultCodeId: null,
    relatedOrderIds: candidate.members
      .filter((repair) => repair.repeated)
      .flatMap((repair) => [repair.order.id, repair.repeatOrderId as string])
      .slice(0, 40),
    rcaCaseId: null,
    chips: [
      chip("repeatRate", rate, "percent"),
      chip("teamRate", teamRate, "percent"),
      chip("orders", candidate.members.length, "count"),
      chip("zScore", z, "number"),
    ],
    stats: { z: candidate.z, restSize: candidate.restSize },
  };
  if (candidate.dimension === "worker") {
    const employee = context.index.employees.get(candidate.key);
    if (!employee) return null;
    const brigade = employee.brigadeId ? context.index.brigades.get(employee.brigadeId) : undefined;
    return {
      ...base,
      kind: "worker_repeat_failures",
      entityType: "employee",
      entityId: employee.id,
      siteId: brigade?.siteId ?? null,
      params: {
        worker: shortPersonName(employee.fullName),
        personnelNumber: employee.personnelNumber,
        repairs: candidate.members.length,
        repeats: candidate.repeats,
        rate,
        teamRate,
        z,
      },
    };
  }
  if (candidate.dimension === "brigade") {
    const brigade = context.index.brigades.get(candidate.key);
    if (!brigade) return null;
    return {
      ...base,
      kind: "brigade_repeat_failures",
      entityType: "brigade",
      entityId: brigade.id,
      siteId: brigade.siteId,
      params: {
        brigade: brigade.name,
        repairs: candidate.members.length,
        repeats: candidate.repeats,
        rate,
        teamRate,
        z,
      },
    };
  }
  return {
    ...base,
    kind: "shift_effect",
    entityType: "shift",
    entityId: null,
    siteId: null,
    params: {
      measure: "repeat_rate",
      dimension: candidate.dimension,
      group: candidate.key,
      count: candidate.repeats,
      total: candidate.members.length,
      share: rate,
      expectedShare: teamRate,
      z,
    },
  };
}

export function findRepeatRateEffects(context: AnalysisContext): RepeatRateInsight[] {
  let active = collectRepairs(context);
  const findings: RepeatRateInsight[] = [];
  for (let step = 0; step < RATE_MAX_FINDINGS; step += 1) {
    const best = candidates(active).sort((a, b) => b.z - a.z)[0];
    if (!best) break;
    const insight = toInsight(context, best);
    if (insight) findings.push(insight);
    const explained = new Set(best.members.map((repair) => repair.order.id));
    active = active.filter((repair) => !explained.has(repair.order.id));
  }
  return findings;
}
