import { assembleBundle, type OrderBundle } from "./assemble";
import type { SeedContext } from "./context";
import { FAULT_SPEC_BY_CODE } from "./data-faults";
import { FAULT_WEIGHTS_BY_TYPE } from "./data-fault-weights";
import { specialtiesFor, speedFactorOf } from "./flow";
import { standardHoursFor } from "./norms";
import { hasValidPermits, requiredPermitTypeIds } from "./permits";
import type { Rng, WeightedEntry } from "./random";
import type { OrderSlot } from "./slots-common";
import { describeFailure } from "./slots-unplanned";
import { crewOnShift, MS_PER_HOUR, MS_PER_MINUTE, shiftStartAt } from "./time";
import { planTimeline, type StopPoint } from "./timeline";
import type {
  EmployeeRow,
  EquipmentRow,
  FaultCodeRow,
  WorkOrderKind,
  WorkOrderPriority,
} from "./types";

type OpenScenario = {
  readonly stage: StopPoint;
  readonly inventoryNumber: string;
  readonly kind: WorkOrderKind;
  readonly priority: WorkOrderPriority;
  readonly sameExecutorAs?: number;
};

export const OPEN_SCENARIOS: readonly OpenScenario[] = [
  { stage: "issued", inventoryNumber: "ОБ-007", kind: "unplanned", priority: "high" },
  { stage: "issued", inventoryNumber: "ДР-002", kind: "unplanned", priority: "emergency" },
  { stage: "accepted", inventoryNumber: "ДР-006", kind: "unplanned", priority: "normal" },
  { stage: "in_progress", inventoryNumber: "ДР-007", kind: "unplanned", priority: "high" },
  {
    stage: "queued",
    inventoryNumber: "ОБ-009",
    kind: "unplanned",
    priority: "normal",
    sameExecutorAs: 3,
  },
  { stage: "in_progress", inventoryNumber: "ОБ-003", kind: "unplanned", priority: "normal" },
  { stage: "paused", inventoryNumber: "ОБ-001", kind: "unplanned", priority: "high" },
  { stage: "in_progress", inventoryNumber: "РМЦ-001", kind: "planned", priority: "planned" },
];

const RESERVED_BEFORE_NOW_MS = 14 * MS_PER_HOUR;
const RESERVED_AFTER_NOW_MS = 13 * MS_PER_HOUR;
const LAST_EVENT_AGO_MINUTES = [3, 20] as const;
const SHIFT_START_GUARD_MS = MS_PER_MINUTE;
const MIN_SCALE = 0.05;
const QUEUE_WAIT_MS = 30 * MS_PER_MINUTE;
const FAILURE_LEAD_MINUTES = [5, 25] as const;
const PLANNED_FAULT_CHOICES: ReadonlyArray<WeightedEntry<string>> = [
  ["С-01", 1],
  ["Э-05", 1],
  ["Э-01", 1],
  ["М-02", 1],
];
const PLANNED_DESCRIPTION = "Плановое обслуживание";

export function reserveOpenWindows(context: SeedContext): void {
  for (const scenario of OPEN_SCENARIOS) {
    const equipment = context.index.equipmentByInventory.get(scenario.inventoryNumber);
    if (equipment)
      context.calendar.reserve(
        equipment.id,
        context.nowMs - RESERVED_BEFORE_NOW_MS,
        context.nowMs + RESERVED_AFTER_NOW_MS,
      );
  }
}

function canServe(
  context: SeedContext,
  equipment: EquipmentRow,
  fault: FaultCodeRow,
  executor: EmployeeRow | null,
): boolean {
  const now = new Date(context.nowMs);
  const crew = crewOnShift(now);
  const required = requiredPermitTypeIds(context.catalog, equipment.equipment_type, fault.category);
  return context.index.workers.some(
    (worker) =>
      worker.crew === crew &&
      worker.specialty === fault.required_specialty &&
      (executor === null || worker.id === executor.id) &&
      hasValidPermits(context.permits, worker.id, required, now),
  );
}

function pickFault(
  context: SeedContext,
  scenario: OpenScenario,
  equipment: EquipmentRow,
  executor: EmployeeRow | null,
  rng: Rng,
): FaultCodeRow {
  const candidates =
    scenario.kind === "planned"
      ? PLANNED_FAULT_CHOICES
      : FAULT_WEIGHTS_BY_TYPE[equipment.equipment_type];
  const fits = candidates.filter(([code]) => {
    const fault = context.index.faultByCode.get(code);
    return fault !== undefined && canServe(context, equipment, fault, executor);
  });
  const chosen = rng.weighted(fits.length > 0 ? fits : candidates);
  return context.index.faultByCode.get(chosen) as FaultCodeRow;
}

function assignExecutor(
  context: SeedContext,
  equipment: EquipmentRow,
  fault: FaultCodeRow,
  shared: EmployeeRow | null,
): EmployeeRow {
  if (shared) return shared;
  return context.assigner.assign({
    issuedAtMs: context.nowMs,
    crew: crewOnShift(new Date(context.nowMs)),
    specialties: specialtiesFor(fault),
    requiredPermitTypeIds: requiredPermitTypeIds(
      context.catalog,
      equipment.equipment_type,
      fault.category,
    ),
    excludeIds: [],
  }).worker;
}

function buildOpenBundle(
  context: SeedContext,
  scenario: OpenScenario,
  index: number,
  shared: EmployeeRow | null,
): OrderBundle | null {
  const equipment = context.index.equipmentByInventory.get(scenario.inventoryNumber);
  if (!equipment) return null;
  const rng = context.rng.fork(`open:${index}`);
  const fault = pickFault(context, scenario, equipment, shared, rng);
  const executor = assignExecutor(context, equipment, fault, shared);
  const spec = FAULT_SPEC_BY_CODE.get(fault.code);
  const standardHours = standardHoursFor(spec?.standardHours ?? 2, equipment.equipment_type);
  const plan = planTimeline(
    {
      kind: scenario.kind,
      priority: scenario.priority,
      standardHours,
      speedFactor: speedFactorOf(executor, rng),
      queueWaitMs: scenario.stage === "queued" ? QUEUE_WAIT_MS : 0,
      rejected: false,
      cancelled: false,
      pauseCount: scenario.stage === "paused" ? 1 : 0,
      reworkCount: 0,
      escalateTo: null,
      stopAt: scenario.stage,
    },
    rng,
  );
  const lastAgoMs = Math.round(rng.float(...LAST_EVENT_AGO_MINUTES) * MS_PER_MINUTE);
  const availableMs =
    context.nowMs -
    lastAgoMs -
    (shiftStartAt(new Date(context.nowMs)).getTime() + SHIFT_START_GUARD_MS);
  const scale = plan.totalMs > availableMs ? Math.max(MIN_SCALE, availableMs / plan.totalMs) : 1;
  const issuedAtMs = context.nowMs - lastAgoMs - Math.round(plan.totalMs * scale);
  const slot: OrderSlot = {
    key: `open:${index}`,
    kind: scenario.kind,
    priority: scenario.priority,
    equipmentId: equipment.id,
    faultCode: fault.code,
    issuedAtMs,
    failureAtMs:
      scenario.kind === "unplanned"
        ? issuedAtMs - Math.round(rng.float(...FAILURE_LEAD_MINUTES) * MS_PER_MINUTE)
        : null,
    standardHours,
    description:
      scenario.kind === "unplanned"
        ? describeFailure(fault.code, equipment.name, rng)
        : `${PLANNED_DESCRIPTION}: ${equipment.name}`,
    tag: "regular",
    avoidAssigneeId: null,
  };
  return assembleBundle(context, {
    slot,
    initial: executor,
    executor,
    steps: plan.steps,
    pausedMs: plan.pausedMs,
    scale,
    escalateTo: null,
    rng,
  });
}

export function buildOpenBundles(context: SeedContext): OrderBundle[] {
  return OPEN_SCENARIOS.reduce<OrderBundle[]>((bundles, scenario, index) => {
    const shared =
      scenario.sameExecutorAs === undefined
        ? null
        : (bundles[scenario.sameExecutorAs]?.facts.executor ?? null);
    const bundle = buildOpenBundle(context, scenario, index, shared);
    return bundle ? [...bundles, bundle] : bundles;
  }, []);
}
