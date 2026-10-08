import { assembleBundle, type OrderBundle } from "./assemble";
import type { SeedContext } from "./context";
import { REPEAT_FAILURE_WORKER } from "./data-people";
import { requiredPermitTypeIds } from "./permits";
import type { Rng } from "./random";
import type { OrderSlot } from "./slots-common";
import { isConveyorK3 } from "./slots-unplanned";
import { crewOnShift, MS_PER_MINUTE } from "./time";
import { planTimeline, type TimelineOptions } from "./timeline";
import type {
  EmployeeRow,
  EquipmentRow,
  FaultCodeRow,
  Specialty,
  WorkOrderPriority,
} from "./types";

const CANCEL_CHANCE_UNPLANNED = 0.03;
const CANCEL_CHANCE_PLANNED = 0.02;
const REJECT_CHANCE = 0.06;
const REJECT_CHANCE_EMERGENCY = 0.02;
const ESCALATION_CHANCE = 0.04;
const REASSIGN_DELAY_MS = 15 * MS_PER_MINUTE;
const RELEASE_BUFFER_MS = 10 * MS_PER_MINUTE;
const FINISH_BUFFER_MS = 30 * MS_PER_MINUTE;
const MIN_SCALE = 0.2;
const BASE_SPEED = 1.3;
const SPEED_PER_GRADE = 0.07;
const SPEED_DEVIATION = 0.05;
const MIN_SPEED = 0.7;
const PAUSE_COUNT_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [0, 78],
  [1, 18],
  [2, 4],
];
const REWORK_COUNT_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [0, 91],
  [1, 8],
  [2, 1],
];

export function speedFactorOf(worker: EmployeeRow, rng: Rng): number {
  return Math.max(
    MIN_SPEED,
    BASE_SPEED - SPEED_PER_GRADE * (worker.grade ?? 3) + rng.normal(0, SPEED_DEVIATION),
  );
}

function exclusionsFor(context: SeedContext, slot: OrderSlot, equipment: EquipmentRow): string[] {
  const suspect = context.index.employeeByNumber.get(REPEAT_FAILURE_WORKER);
  const excluded = [
    ...(slot.avoidAssigneeId ? [slot.avoidAssigneeId] : []),
    ...(isConveyorK3(equipment) && suspect ? [suspect.id] : []),
  ];
  return excluded;
}

function drawOptions(slot: OrderSlot, speedFactor: number, rng: Rng): TimelineOptions {
  const cancelled = rng.chance(
    slot.kind === "unplanned"
      ? slot.priority === "emergency"
        ? 0
        : CANCEL_CHANCE_UNPLANNED
      : CANCEL_CHANCE_PLANNED,
  );
  const rejected =
    !cancelled &&
    rng.chance(slot.priority === "emergency" ? REJECT_CHANCE_EMERGENCY : REJECT_CHANCE);
  const escalateTo: WorkOrderPriority | null =
    !cancelled &&
    slot.kind === "unplanned" &&
    slot.priority === "normal" &&
    rng.chance(ESCALATION_CHANCE)
      ? "high"
      : null;
  return {
    kind: slot.kind,
    priority: slot.priority,
    standardHours: slot.standardHours,
    speedFactor,
    queueWaitMs: 0,
    rejected,
    cancelled,
    pauseCount: cancelled ? 0 : rng.weighted(PAUSE_COUNT_WEIGHTS),
    reworkCount: cancelled ? 0 : rng.weighted(REWORK_COUNT_WEIGHTS),
    escalateTo,
    stopAt: null,
  };
}

function chooseExecutors(
  context: SeedContext,
  slot: OrderSlot,
  equipment: EquipmentRow,
  fault: FaultCodeRow,
  rejected: boolean,
) {
  const request = {
    issuedAtMs: slot.issuedAtMs,
    crew: crewOnShift(new Date(slot.issuedAtMs)),
    specialties: specialtiesFor(fault),
    requiredPermitTypeIds: requiredPermitTypeIds(
      context.catalog,
      equipment.equipment_type,
      fault.category,
    ),
    excludeIds: exclusionsFor(context, slot, equipment),
  };
  const initial = context.assigner.assign(request);
  if (!rejected)
    return { initial: initial.worker, executor: initial.worker, waitMs: initial.waitMs };
  const replacement = context.assigner.assign({
    ...request,
    issuedAtMs: slot.issuedAtMs + REASSIGN_DELAY_MS,
    excludeIds: [...request.excludeIds, initial.worker.id],
  });
  return {
    initial: initial.worker,
    executor: replacement.worker,
    waitMs: replacement.waitMs > 0 ? replacement.waitMs + REASSIGN_DELAY_MS : 0,
  };
}

export function specialtiesFor(fault: FaultCodeRow): Specialty[] {
  const required = fault.required_specialty;
  const substitutes: Record<string, Specialty[]> = {
    lubricator: ["fitter"],
    hydraulic: ["fitter"],
    instrumentation: ["electrician"],
    welder: ["fitter"],
  };
  return [required, ...(substitutes[required] ?? [])];
}

export function buildHistoryBundle(context: SeedContext, slot: OrderSlot): OrderBundle {
  const rng = context.rng.fork(`order:${slot.key}`);
  const equipment = context.index.equipmentById.get(slot.equipmentId) as EquipmentRow;
  const fault = context.index.faultByCode.get(slot.faultCode) as FaultCodeRow;
  const baseOptions = drawOptions(slot, 1, rng);
  const executors = chooseExecutors(context, slot, equipment, fault, baseOptions.rejected);
  const options = {
    ...baseOptions,
    speedFactor: speedFactorOf(executors.executor, rng),
    queueWaitMs: baseOptions.cancelled ? 0 : executors.waitMs,
  };
  const plan = planTimeline(options, rng);
  const availableMs = context.nowMs - FINISH_BUFFER_MS - slot.issuedAtMs;
  const scale = plan.totalMs > availableMs ? Math.max(MIN_SCALE, availableMs / plan.totalMs) : 1;
  const bundle = assembleBundle(context, {
    slot,
    initial: executors.initial,
    executor: executors.executor,
    steps: plan.steps,
    pausedMs: plan.pausedMs,
    scale,
    escalateTo: options.escalateTo,
    rng,
  });
  const releasedAtMs = bundle.facts.completionsMs.at(-1);
  if (releasedAtMs !== undefined)
    context.assigner.markBusy(executors.executor.id, releasedAtMs + RELEASE_BUFFER_MS);
  return bundle;
}
