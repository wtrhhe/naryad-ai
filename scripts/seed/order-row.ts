import type { FaultSpec } from "./data-faults";
import { FAULT_SPEC_BY_CODE } from "./data-faults";
import type { OrderFacts } from "./facts";
import type { Rng } from "./random";
import type { OrderSlot } from "./slots-common";
import { MS_PER_HOUR, MS_PER_MINUTE, crewOnShift } from "./time";
import type { PlacedStep } from "./timeline";
import type { EmployeeRow, FaultCodeRow, WorkOrderPriority, WorkOrderRow } from "./types";

const UNPLANNED_DUE_FACTOR = 1.5;
const UNPLANNED_DUE_EXTRA_HOURS = 1;
const PLANNED_DUE_FACTOR = 1.4;
const PLANNED_DUE_EXTRA_HOURS = 3;
const DOWNTIME_END_MINUTES = [10, 30] as const;
const SUGGESTION_ACCURACY = 0.85;
const SUGGESTION_CONFIDENCE = [0.6, 0.97] as const;
const EMERGENCY_COMMENT_CHANCE = 0.4;
const REGULAR_COMMENT_CHANCE = 0.1;
const CLOSE_COMMENT_CHANCE = 0.25;
const EMERGENCY_COMMENTS = [
  "Остановлена технологическая линия, приступить немедленно",
  "Срочно, простой оборудования",
];
const REGULAR_COMMENTS = [
  "Согласовать остановку с технологом",
  "После выполнения доложить мастеру",
  "Приложить фото до и после",
];
const CLOSE_COMMENTS = ["Принято", "Работа принята, оборудование в эксплуатации", "Замечаний нет"];
const WORK_DONE_STATUSES = ["done", "ai_review", "closed", "rework"];

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const lastAt = (steps: readonly PlacedStep[], action: PlacedStep["action"]): number | null =>
  steps.filter((step) => step.action === action).at(-1)?.atMs ?? null;
const firstAt = (steps: readonly PlacedStep[], action: PlacedStep["action"]): number | null =>
  steps.find((step) => step.action === action)?.atMs ?? null;

export type OrderRowInput = {
  readonly slot: OrderSlot;
  readonly facts: OrderFacts;
  readonly faultRows: readonly FaultCodeRow[];
  readonly executor: EmployeeRow;
  readonly finalPriority: WorkOrderPriority;
  readonly rng: Rng;
};

function suggestionFor(input: OrderRowInput, spec: FaultSpec) {
  const { rng, faultRows, facts } = input;
  const sameCategory = faultRows.filter(
    (fault) => fault.category === spec.category && fault.code !== spec.code,
  );
  const suggested =
    rng.chance(SUGGESTION_ACCURACY) || sameCategory.length === 0
      ? faultRows.find((fault) => fault.code === spec.code)
      : rng.pick(sameCategory);
  return {
    suggested_fault_code_id: suggested?.id ?? null,
    suggested_standard_hours: suggested
      ? (FAULT_SPEC_BY_CODE.get(suggested.code)?.standardHours ?? facts.standardHours)
      : null,
    suggestion: suggested
      ? {
          fault_code: suggested.code,
          confidence: Number(rng.float(...SUGGESTION_CONFIDENCE).toFixed(2)),
          source: "description",
        }
      : null,
  };
}

function downtimeFor(input: OrderRowInput) {
  const { slot, facts, rng } = input;
  if (slot.kind !== "unplanned" || slot.failureAtMs === null || facts.finalStatus === "cancelled") {
    return { downtime_started_at: null, downtime_ended_at: null, downtime_cost: null };
  }
  const finished = WORK_DONE_STATUSES.includes(facts.finalStatus) && facts.completionsMs.length > 0;
  const endMs = finished
    ? (facts.completionsMs.at(-1) as number) +
      Math.round(rng.float(...DOWNTIME_END_MINUTES) * MS_PER_MINUTE)
    : null;
  const hours = endMs === null ? null : (endMs - slot.failureAtMs) / MS_PER_HOUR;
  return {
    downtime_started_at: iso(slot.failureAtMs),
    downtime_ended_at: iso(endMs),
    downtime_cost:
      hours === null
        ? null
        : Number((hours * (facts.equipment.downtime_cost_per_hour ?? 0)).toFixed(2)),
  };
}

function masterComment(slot: OrderSlot, rng: Rng): string | null {
  if (slot.kind === "planned") return null;
  const emergency = slot.priority === "emergency";
  if (!rng.chance(emergency ? EMERGENCY_COMMENT_CHANCE : REGULAR_COMMENT_CHANCE)) return null;
  return rng.pick(emergency ? EMERGENCY_COMMENTS : REGULAR_COMMENTS);
}

export function buildOrderRow(input: OrderRowInput): WorkOrderRow {
  const { slot, facts, executor, rng } = input;
  const spec = FAULT_SPEC_BY_CODE.get(slot.faultCode);
  const workDone = WORK_DONE_STATUSES.includes(facts.finalStatus) && facts.fault !== null;
  const lastStepMs = facts.steps.at(-1)?.atMs ?? slot.issuedAtMs;
  const dueHours =
    slot.kind === "unplanned"
      ? slot.standardHours * UNPLANNED_DUE_FACTOR + UNPLANNED_DUE_EXTRA_HOURS
      : slot.standardHours * PLANNED_DUE_FACTOR + PLANNED_DUE_EXTRA_HOURS;
  const lastComment =
    facts.steps.filter((step) => step.comment !== undefined).at(-1)?.comment ?? null;
  const closed = facts.finalStatus === "closed";
  return {
    id: facts.orderId,
    kind: slot.kind,
    priority: input.finalPriority,
    status: facts.finalStatus,
    description: slot.description,
    comment: masterComment(slot, rng),
    site_id: facts.equipment.site_id,
    equipment_id: facts.equipment.id,
    assignee_id: executor.id,
    brigade_id: executor.brigade_id ?? null,
    master_id: facts.master.id,
    due_at: iso(slot.issuedAtMs + Math.round(dueHours * MS_PER_HOUR)),
    standard_hours: slot.standardHours,
    queue_position: facts.finalStatus === "queued" ? 1 : null,
    ...(slot.kind === "unplanned" && spec
      ? suggestionFor(input, spec)
      : { suggested_fault_code_id: null, suggested_standard_hours: null, suggestion: null }),
    fault_code_id: workDone ? (facts.fault?.id ?? null) : null,
    work_performed: workDone && spec ? rng.pick(spec.works) : null,
    close_comment: closed && rng.chance(CLOSE_COMMENT_CHANCE) ? rng.pick(CLOSE_COMMENTS) : null,
    last_comment: lastComment,
    shift_crew: crewOnShift(new Date(slot.issuedAtMs)),
    shift_period: facts.period,
    rework_count: facts.steps.filter((step) => step.action === "return_rework").length,
    paused_seconds: Math.round(facts.pausedMs / 1000),
    issued_at: iso(slot.issuedAtMs) as string,
    queued_at: iso(firstAt(facts.steps, "queue")),
    accepted_at: iso(lastAt(facts.steps, "accept")),
    rejected_at: iso(lastAt(facts.steps, "reject")),
    started_at: iso(firstAt(facts.steps, "start")),
    paused_at: facts.finalStatus === "paused" ? iso(lastAt(facts.steps, "pause")) : null,
    done_at: iso(lastAt(facts.steps, "complete")),
    review_started_at: iso(lastAt(facts.steps, "submit_review")),
    closed_at: iso(lastAt(facts.steps, "approve")),
    cancelled_at: iso(lastAt(facts.steps, "cancel")),
    ...downtimeFor(input),
    created_at: iso(slot.issuedAtMs) as string,
    updated_at: iso(lastStepMs) as string,
  };
}
