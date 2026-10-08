import { z } from "zod";
import type { Locale } from "@/i18n/config";
import {
  isOnTime,
  rateBrigades,
  rateEmployees,
  repeatFailureIds,
  type ClosedOrderFact,
  type FollowUpFact,
  type RefusalFact,
  type SubjectRating,
} from "@/lib/rating/aggregate";
import { RATING_COMPONENT_KEYS, type RatingBenchmark } from "@/lib/rating/explain";
import type { RatingWeights } from "@/lib/rating/formula";

const numeric = z.coerce.number();

export const factRowSchema = z.object({
  order_id: z.string(),
  order_number: numeric,
  assignee_id: z.string().nullable(),
  brigade_id: z.string().nullable(),
  site_id: z.string(),
  equipment_id: z.string(),
  equipment_name: z.string(),
  fault_code_id: z.string().nullable(),
  fault_code: z.string().nullable(),
  priority: z.string(),
  kind: z.string(),
  closed_at: z.string(),
  due_at: z.string().nullable(),
  done_at: z.string().nullable(),
  standard_hours: numeric,
  score: numeric.nullable(),
  rework_count: numeric,
});

export const followUpRowSchema = z.object({
  order_id: z.string(),
  equipment_id: z.string(),
  fault_code_id: z.string().nullable(),
  issued_at: z.string(),
  kind: z.string(),
});

export const refusalRowSchema = z.object({
  event_id: z.string(),
  work_order_id: z.string(),
  employee_id: z.string(),
  brigade_id: z.string().nullable(),
  occurred_at: z.string(),
  reason_code: z.string().nullable(),
  is_valid_excuse: z.boolean(),
});

export type FactRow = z.infer<typeof factRowSchema>;
export type FollowUpRow = z.infer<typeof followUpRowSchema>;
export type RefusalRow = z.infer<typeof refusalRowSchema>;

export interface OrderFact extends ClosedOrderFact {
  number: number;
  siteId: string;
  equipmentName: string;
  faultCode: string | null;
  kind: string;
}

export interface PersonRecord {
  id: string;
  fullName: string;
  role: string;
  brigadeId: string | null;
  isActive: boolean;
  locale: Locale;
  siteIds: readonly string[];
}

export interface BrigadeRecord {
  id: string;
  name: string;
  siteId: string | null;
  isActive: boolean;
}

export interface RatedEmployee extends SubjectRating {
  place: number;
  name: string | null;
  brigadeId: string | null;
  brigadeName: string | null;
  siteIds: string[];
  locale: Locale;
}

export interface RatedBrigade extends SubjectRating {
  place: number;
  name: string | null;
  siteId: string | null;
  memberCount: number;
}

export interface RatedOrder {
  orderId: string;
  number: number;
  assigneeId: string | null;
  brigadeId: string | null;
  siteId: string;
  equipmentName: string;
  faultCode: string | null;
  priority: string;
  closedAt: string;
  score: number | null;
  reworkCount: number;
  repeated: boolean;
  onTime: boolean;
}

export interface RatingTables {
  employees: RatedEmployee[];
  brigades: RatedBrigade[];
  orders: RatedOrder[];
  benchmarks: { employee: RatingBenchmark | null; brigade: RatingBenchmark | null };
}

export interface RatingFilter {
  siteId?: string;
  brigadeId?: string;
}

export function toOrderFact(row: FactRow): OrderFact {
  return {
    orderId: row.order_id,
    number: row.order_number,
    assigneeId: row.assignee_id,
    brigadeId: row.brigade_id,
    siteId: row.site_id,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment_name,
    faultCodeId: row.fault_code_id,
    faultCode: row.fault_code,
    priority: row.priority,
    kind: row.kind,
    closedAt: row.closed_at,
    dueAt: row.due_at,
    doneAt: row.done_at,
    standardHours: row.standard_hours,
    score: row.score,
    reworkCount: row.rework_count,
  };
}

export function toFollowUp(row: FollowUpRow): FollowUpFact {
  return {
    orderId: row.order_id,
    equipmentId: row.equipment_id,
    faultCodeId: row.fault_code_id,
    issuedAt: row.issued_at,
    kind: row.kind,
  };
}

export function toRefusal(row: RefusalRow): RefusalFact {
  return {
    employeeId: row.employee_id,
    brigadeId: row.brigade_id,
    isValidExcuse: row.is_valid_excuse,
  };
}

function compareRatings(a: SubjectRating, b: SubjectRating): number {
  return b.score - a.score || b.closedCount - a.closedCount;
}

export function withPlaces<T extends SubjectRating>(list: readonly T[]): (T & { place: number })[] {
  const sorted = [...list].sort(compareRatings);
  return sorted.map((item, index) => {
    const firstEqual = sorted.findIndex((other) => compareRatings(other, item) === 0);
    return { ...item, place: (firstEqual === -1 ? index : firstEqual) + 1 };
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

export function peerBenchmark(list: readonly SubjectRating[]): RatingBenchmark | null {
  const active = list.filter((item) => item.closedCount > 0);
  if (active.length < 2) return null;
  const entries = RATING_COMPONENT_KEYS.map(
    (key) =>
      [key, Math.round(median(active.map((item) => item.contributions[key])) * 10) / 10] as const,
  );
  return Object.fromEntries(entries) as RatingBenchmark;
}

export interface BuildRatingInput {
  facts: readonly OrderFact[];
  followUps: readonly FollowUpFact[];
  refusals: readonly RefusalFact[];
  weights: RatingWeights;
  people: readonly PersonRecord[];
  brigades: readonly BrigadeRecord[];
}

export function buildRatingTables(input: BuildRatingInput): RatingTables {
  const people = new Map(input.people.map((person) => [person.id, person]));
  const brigades = new Map(input.brigades.map((brigade) => [brigade.id, brigade]));
  const activeWorkers = input.people.filter(
    (person) => person.role === "worker" && person.isActive,
  );
  const ratingInput = {
    facts: input.facts,
    followUps: input.followUps,
    refusals: input.refusals,
    weights: input.weights,
    employeeIds: activeWorkers.map((person) => person.id),
    brigadeIds: input.brigades.filter((brigade) => brigade.isActive).map((brigade) => brigade.id),
  };
  const workedSites = new Map<string, Set<string>>();
  for (const fact of input.facts) {
    if (!fact.assigneeId) continue;
    const sites = workedSites.get(fact.assigneeId) ?? new Set<string>();
    sites.add(fact.siteId);
    workedSites.set(fact.assigneeId, sites);
  }
  const employees = withPlaces(
    rateEmployees(ratingInput).map((rating) => {
      const person = people.get(rating.subjectId);
      const brigade = person?.brigadeId ? brigades.get(person.brigadeId) : undefined;
      const siteIds = new Set<string>([
        ...(person?.siteIds ?? []),
        ...(brigade?.siteId ? [brigade.siteId] : []),
        ...(workedSites.get(rating.subjectId) ?? []),
      ]);
      return {
        ...rating,
        name: person?.fullName ?? null,
        brigadeId: person?.brigadeId ?? null,
        brigadeName: brigade?.name ?? null,
        siteIds: [...siteIds],
        locale: person?.locale ?? "ru",
      };
    }),
  );
  const brigadeRatings = withPlaces(
    rateBrigades(ratingInput).map((rating) => {
      const brigade = brigades.get(rating.subjectId);
      return {
        ...rating,
        name: brigade?.name ?? null,
        siteId: brigade?.siteId ?? null,
        memberCount: activeWorkers.filter((person) => person.brigadeId === rating.subjectId).length,
      };
    }),
  );
  const repeated = repeatFailureIds(input.facts, input.followUps);
  const orders = [...input.facts]
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    .map((fact) => ({
      orderId: fact.orderId,
      number: fact.number,
      assigneeId: fact.assigneeId,
      brigadeId: fact.brigadeId,
      siteId: fact.siteId,
      equipmentName: fact.equipmentName,
      faultCode: fact.faultCode,
      priority: fact.priority,
      closedAt: fact.closedAt,
      score: fact.score,
      reworkCount: fact.reworkCount,
      repeated: repeated.has(fact.orderId),
      onTime: isOnTime(fact),
    }));
  return {
    employees,
    brigades: brigadeRatings,
    orders,
    benchmarks: { employee: peerBenchmark(employees), brigade: peerBenchmark(brigadeRatings) },
  };
}

export function filterEmployees(
  list: readonly RatedEmployee[],
  filter: RatingFilter,
): RatedEmployee[] {
  return withPlaces(
    list.filter(
      (employee) =>
        (!filter.siteId || employee.siteIds.includes(filter.siteId)) &&
        (!filter.brigadeId || employee.brigadeId === filter.brigadeId),
    ),
  );
}

export function filterBrigades(
  list: readonly RatedBrigade[],
  filter: RatingFilter,
): RatedBrigade[] {
  return withPlaces(
    list.filter(
      (brigade) =>
        (!filter.siteId || brigade.siteId === filter.siteId) &&
        (!filter.brigadeId || brigade.subjectId === filter.brigadeId),
    ),
  );
}

export interface RatingSummary {
  closed: number;
  onTimeShare: number | null;
  average: number | null;
  leader: { name: string | null; score: number } | null;
}

export function summarize(
  list: readonly (SubjectRating & { name: string | null })[],
): RatingSummary {
  const active = list.filter((item) => item.closedCount > 0);
  const closed = active.reduce((sum, item) => sum + item.closedCount, 0);
  const onTime = active.reduce((sum, item) => sum + item.onTimeCount, 0);
  const leader = [...active].sort(compareRatings)[0];
  return {
    closed,
    onTimeShare: closed === 0 ? null : Math.round((onTime / closed) * 100),
    average:
      active.length === 0
        ? null
        : Math.round((active.reduce((sum, item) => sum + item.score, 0) / active.length) * 10) / 10,
    leader: leader ? { name: leader.name, score: leader.score } : null,
  };
}

export interface WorkerRatingView {
  me: RatedEmployee | null;
  benchmark: RatingBenchmark | null;
  place: number | null;
  total: number;
  brigade: RatedBrigade | null;
  brigadePlace: number | null;
  brigadeTotal: number;
  orders: RatedOrder[];
}

export const WORKER_ORDERS_LIMIT = 8;

export function workerView(
  tables: RatingTables,
  employeeId: string,
  brigadeId: string | null,
): WorkerRatingView {
  const ranked = withPlaces(tables.employees.filter((item) => item.closedCount > 0));
  const rankedBrigades = withPlaces(tables.brigades.filter((item) => item.closedCount > 0));
  const me = tables.employees.find((item) => item.subjectId === employeeId) ?? null;
  const brigade = brigadeId
    ? (tables.brigades.find((item) => item.subjectId === brigadeId) ?? null)
    : null;
  return {
    me,
    benchmark: tables.benchmarks.employee,
    place: ranked.find((item) => item.subjectId === employeeId)?.place ?? null,
    total: ranked.length,
    brigade,
    brigadePlace: brigade
      ? (rankedBrigades.find((item) => item.subjectId === brigade.subjectId)?.place ?? null)
      : null,
    brigadeTotal: rankedBrigades.length,
    orders: tables.orders
      .filter((order) => order.assigneeId === employeeId)
      .slice(0, WORKER_ORDERS_LIMIT),
  };
}

export interface SnapshotRow {
  subject_type: "employee" | "brigade";
  subject_id: string;
  period_start: string;
  period_end: string;
  score: number;
  components: {
    preset: string;
    place: number;
    components: SubjectRating["components"];
    contributions: SubjectRating["contributions"];
    closedCount: number;
    onTimeCount: number;
    cleanCount: number;
    repeatCount: number;
    reworkedCount: number;
    workload: number;
    unexcusedRefusals: number;
  };
  explanation: string | null;
}

function hasActivity(rating: SubjectRating): boolean {
  return rating.closedCount > 0 || rating.unexcusedRefusals > 0;
}

function snapshotOf(
  type: SnapshotRow["subject_type"],
  rating: SubjectRating & { place: number },
  period: { preset: string; start: Date; end: Date },
  explanation: string | null,
): SnapshotRow {
  return {
    subject_type: type,
    subject_id: rating.subjectId,
    period_start: period.start.toISOString(),
    period_end: period.end.toISOString(),
    score: rating.score,
    components: {
      preset: period.preset,
      place: rating.place,
      components: rating.components,
      contributions: rating.contributions,
      closedCount: rating.closedCount,
      onTimeCount: rating.onTimeCount,
      cleanCount: rating.cleanCount,
      repeatCount: rating.repeatCount,
      reworkedCount: rating.reworkedCount,
      workload: rating.workload,
      unexcusedRefusals: rating.unexcusedRefusals,
    },
    explanation,
  };
}

export function snapshotRows(
  tables: RatingTables,
  period: { preset: string; start: Date; end: Date },
  explain: (
    rating: RatedEmployee | RatedBrigade,
    locale: Locale,
    benchmark: RatingBenchmark | null,
  ) => string | null,
): SnapshotRow[] {
  return [
    ...tables.employees
      .filter(hasActivity)
      .map((rating) =>
        snapshotOf(
          "employee",
          rating,
          period,
          explain(rating, rating.locale, tables.benchmarks.employee),
        ),
      ),
    ...tables.brigades
      .filter(hasActivity)
      .map((rating) =>
        snapshotOf("brigade", rating, period, explain(rating, "ru", tables.benchmarks.brigade)),
      ),
  ];
}

export function shortName(fullName: string | null): string | null {
  if (!fullName) return null;
  const [surname, ...rest] = fullName.trim().split(/\s+/);
  if (!surname || rest.length === 0) return fullName.trim();
  return `${surname} ${rest.map((part) => `${part.charAt(0)}.`).join(" ")}`;
}
