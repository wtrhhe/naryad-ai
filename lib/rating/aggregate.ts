import {
  computeRating,
  refusalPenalty,
  type RatingComponents,
  type RatingResult,
  type RatingWeights,
} from "@/lib/rating/formula";

export const REPEAT_FAILURE_DAYS = 7;
export const COMPLEXITY_BY_PRIORITY: Readonly<Record<string, number>> = {
  emergency: 1.5,
  high: 1.25,
  normal: 1,
  planned: 1,
};

export interface ClosedOrderFact {
  orderId: string;
  assigneeId: string;
  brigadeId: string | null;
  equipmentId: string;
  faultCodeId: string | null;
  priority: string;
  closedAt: string;
  dueAt: string | null;
  doneAt: string | null;
  standardHours: number;
  score: number | null;
  reworkCount: number;
}

export interface FollowUpFact {
  orderId: string;
  equipmentId: string;
  faultCodeId: string | null;
  issuedAt: string;
  kind: string;
}

export interface RefusalFact {
  employeeId: string;
  brigadeId: string | null;
  isValidExcuse: boolean;
}

export interface SubjectRating extends RatingResult {
  subjectId: string;
  closedCount: number;
  onTimeCount: number;
  cleanCount: number;
  repeatCount: number;
  reworkedCount: number;
  workload: number;
  unexcusedRefusals: number;
}

const MS_PER_DAY = 86_400_000;

export function repeatFailureIds(
  facts: readonly ClosedOrderFact[],
  later: readonly FollowUpFact[],
): Set<string> {
  const repeated = new Set<string>();
  for (const fact of facts) {
    const closedMs = new Date(fact.closedAt).getTime();
    const followUp = later.some((candidate) => {
      if (candidate.kind !== "unplanned") return false;
      if (candidate.orderId === fact.orderId || candidate.equipmentId !== fact.equipmentId)
        return false;
      if (fact.faultCodeId && candidate.faultCodeId && candidate.faultCodeId !== fact.faultCodeId)
        return false;
      const issuedMs = new Date(candidate.issuedAt).getTime();
      return issuedMs > closedMs && issuedMs - closedMs <= REPEAT_FAILURE_DAYS * MS_PER_DAY;
    });
    if (followUp) repeated.add(fact.orderId);
  }
  return repeated;
}

function isOnTime(fact: ClosedOrderFact): boolean {
  if (!fact.dueAt) return true;
  const finished = new Date(fact.doneAt ?? fact.closedAt).getTime();
  return finished <= new Date(fact.dueAt).getTime();
}

function workloadOf(fact: ClosedOrderFact): number {
  return fact.standardHours * (COMPLEXITY_BY_PRIORITY[fact.priority] ?? 1);
}

function share(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}

interface Tally {
  closed: ClosedOrderFact[];
  refusals: number;
}

function rate(
  subjectId: string,
  tally: Tally,
  repeated: ReadonlySet<string>,
  maxWorkload: number,
  weights: RatingWeights,
): SubjectRating {
  const scored = tally.closed.filter((fact) => fact.score !== null);
  const quality =
    scored.length === 0
      ? 0
      : scored.reduce((sum, fact) => sum + (fact.score ?? 0), 0) / scored.length;
  const onTimeCount = tally.closed.filter(isOnTime).length;
  const reworkedCount = tally.closed.filter((fact) => fact.reworkCount > 0).length;
  const repeatCount = tally.closed.filter((fact) => repeated.has(fact.orderId)).length;
  const cleanCount = tally.closed.filter(
    (fact) => fact.reworkCount === 0 && !repeated.has(fact.orderId),
  ).length;
  const workload = tally.closed.reduce((sum, fact) => sum + workloadOf(fact), 0);
  const components: RatingComponents = {
    quality,
    onTime: share(onTimeCount, tally.closed.length),
    noRework: share(cleanCount, tally.closed.length),
    volume: maxWorkload === 0 ? 0 : (workload / maxWorkload) * 100,
    refusalPenalty: refusalPenalty(tally.refusals, weights),
  };
  return {
    ...computeRating(components, weights),
    subjectId,
    closedCount: tally.closed.length,
    onTimeCount,
    cleanCount,
    repeatCount,
    reworkedCount,
    workload: Math.round(workload * 100) / 100,
    unexcusedRefusals: tally.refusals,
  };
}

function rankBy(
  key: (fact: ClosedOrderFact) => string | null,
  refusalKey: (fact: RefusalFact) => string | null,
  facts: readonly ClosedOrderFact[],
  refusals: readonly RefusalFact[],
  repeated: ReadonlySet<string>,
  weights: RatingWeights,
  subjects: readonly string[],
): SubjectRating[] {
  const tallies = new Map<string, Tally>(subjects.map((id) => [id, { closed: [], refusals: 0 }]));
  const tallyOf = (id: string) => {
    const existing = tallies.get(id);
    if (existing) return existing;
    const created: Tally = { closed: [], refusals: 0 };
    tallies.set(id, created);
    return created;
  };
  for (const fact of facts) {
    const id = key(fact);
    if (id) tallyOf(id).closed.push(fact);
  }
  for (const refusal of refusals) {
    const id = refusalKey(refusal);
    if (id && !refusal.isValidExcuse) tallyOf(id).refusals += 1;
  }
  const maxWorkload = Math.max(
    0,
    ...[...tallies.values()].map((tally) =>
      tally.closed.reduce((sum, fact) => sum + workloadOf(fact), 0),
    ),
  );
  return [...tallies.entries()]
    .map(([id, tally]) => rate(id, tally, repeated, maxWorkload, weights))
    .sort((a, b) => b.score - a.score || b.closedCount - a.closedCount);
}

export interface RatingInput {
  facts: readonly ClosedOrderFact[];
  followUps: readonly FollowUpFact[];
  refusals: readonly RefusalFact[];
  weights: RatingWeights;
  employeeIds?: readonly string[];
  brigadeIds?: readonly string[];
}

export function rateEmployees(input: RatingInput): SubjectRating[] {
  const repeated = repeatFailureIds(input.facts, input.followUps);
  return rankBy(
    (fact) => fact.assigneeId,
    (refusal) => refusal.employeeId,
    input.facts,
    input.refusals,
    repeated,
    input.weights,
    input.employeeIds ?? [],
  );
}

export function rateBrigades(input: RatingInput): SubjectRating[] {
  const repeated = repeatFailureIds(input.facts, input.followUps);
  return rankBy(
    (fact) => fact.brigadeId,
    (refusal) => refusal.brigadeId,
    input.facts,
    input.refusals,
    repeated,
    input.weights,
    input.brigadeIds ?? [],
  );
}
