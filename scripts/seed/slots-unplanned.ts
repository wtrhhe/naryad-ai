import type { SeedContext } from "./context";
import { CONVEYOR_K3_NAME, PUMP_N4_NAME } from "./data-equipment";
import { FAULT_SPEC_BY_CODE } from "./data-faults";
import { FAULT_WEIGHTS_BY_TYPE } from "./data-fault-weights";
import { standardHoursFor } from "./norms";
import type { Rng, WeightedEntry } from "./random";
import { MS_PER_MINUTE } from "./time";
import { reserveIssueTime, type OrderSlot } from "./slots-common";
import type { EquipmentRow, EquipmentType, WorkOrderPriority } from "./types";

export const GLAND_LEAK_CODE = "М-05";
export const BEARING_WEAR_CODE = "М-02";

const K3_BEARING_SHARE = 70;
const K3_OTHER_WEIGHTS: ReadonlyArray<WeightedEntry<string>> = [
  ["М-03", 5],
  ["М-04", 8],
  ["М-07", 4],
  ["Э-01", 5],
  ["Э-03", 4],
  ["С-01", 2],
  ["С-02", 2],
];
const K3_TARGET_MULTIPLIER = 3.3;
const CONVEYOR_TARGET_RANGE = [13, 15] as const;
const BASELINE_TARGETS: Readonly<Record<EquipmentType, readonly [number, number]>> = {
  crusher: [9, 9],
  conveyor: CONVEYOR_TARGET_RANGE,
  pump: [12, 14],
  screen: [11, 13],
  mill: [8, 10],
  classifier: [10, 12],
  feeder: [11, 13],
  fan: [9, 11],
  compressor: [9, 11],
  other: [7, 9],
};
const CRUSHER_PRIMARY_BASELINE = 1;
const PUMP_N4_BASELINE = 10;
const FAILURE_LEAD_MINUTES = [5, 25] as const;

const PRIORITY_WEIGHTS: Readonly<
  Record<1 | 2 | 3, ReadonlyArray<WeightedEntry<WorkOrderPriority>>>
> = {
  3: [
    ["emergency", 35],
    ["high", 45],
    ["normal", 20],
  ],
  2: [
    ["emergency", 10],
    ["high", 40],
    ["normal", 50],
  ],
  1: [
    ["emergency", 3],
    ["high", 20],
    ["normal", 77],
  ],
};

export function isConveyorK3(equipment: EquipmentRow): boolean {
  return equipment.name === CONVEYOR_K3_NAME;
}

export function isPumpN4(equipment: EquipmentRow): boolean {
  return equipment.name === PUMP_N4_NAME;
}

export function isPrimaryCrusher(equipment: EquipmentRow): boolean {
  return equipment.inventory_number === "ДР-001";
}

export function faultWeightsFor(equipment: EquipmentRow): ReadonlyArray<WeightedEntry<string>> {
  if (isConveyorK3(equipment)) return [[BEARING_WEAR_CODE, K3_BEARING_SHARE], ...K3_OTHER_WEIGHTS];
  const weights = FAULT_WEIGHTS_BY_TYPE[equipment.equipment_type];
  return isPumpN4(equipment) ? weights.filter(([code]) => code !== GLAND_LEAK_CODE) : weights;
}

export function describeFailure(faultCode: string, equipmentName: string, rng: Rng): string {
  const spec = FAULT_SPEC_BY_CODE.get(faultCode);
  return `${equipmentName}: ${spec ? rng.pick(spec.symptoms) : faultCode}`;
}

function baselineTarget(equipment: EquipmentRow, rng: Rng): number {
  if (isPrimaryCrusher(equipment)) return CRUSHER_PRIMARY_BASELINE;
  if (isPumpN4(equipment)) return PUMP_N4_BASELINE;
  const [low, high] = BASELINE_TARGETS[equipment.equipment_type];
  return rng.int(low, high);
}

export function unplannedTargets(
  equipment: readonly EquipmentRow[],
  rng: Rng,
): Map<string, number> {
  const targets = new Map(
    equipment
      .filter((unit) => !isConveyorK3(unit))
      .map((unit) => [unit.id, baselineTarget(unit, rng)]),
  );
  const conveyorCounts = equipment
    .filter((unit) => unit.equipment_type === "conveyor" && !isConveyorK3(unit))
    .map((unit) => targets.get(unit.id) ?? 0);
  const conveyorMean =
    conveyorCounts.reduce((sum, count) => sum + count, 0) / Math.max(conveyorCounts.length, 1);
  const k3 = equipment.find(isConveyorK3);
  if (k3) targets.set(k3.id, Math.round(conveyorMean * K3_TARGET_MULTIPLIER));
  return targets;
}

export function faultCodesFor(equipment: EquipmentRow, count: number, rng: Rng): string[] {
  if (!isConveyorK3(equipment))
    return Array.from({ length: count }, () => rng.weighted(faultWeightsFor(equipment)));
  const bearingCount = Math.round((count * K3_BEARING_SHARE) / 100);
  const others = Array.from({ length: count - bearingCount }, () => rng.weighted(K3_OTHER_WEIGHTS));
  return rng.shuffle([...Array.from({ length: bearingCount }, () => BEARING_WEAR_CODE), ...others]);
}

function buildSlot(
  context: SeedContext,
  equipment: EquipmentRow,
  ordinal: number,
  faultCode: string,
  rng: Rng,
): OrderSlot | null {
  const spec = FAULT_SPEC_BY_CODE.get(faultCode);
  if (!spec) throw new Error(`Unknown fault code ${faultCode}`);
  const standardHours = standardHoursFor(spec.standardHours, equipment.equipment_type);
  const issuedAtMs = reserveIssueTime(context, {
    equipmentId: equipment.id,
    kind: "unplanned",
    standardHours,
    desiredMs: rng.float(context.windowStartMs, context.windowEndMs),
  });
  if (issuedAtMs === null) return null;
  return {
    key: `unplanned:${equipment.inventory_number}:${ordinal}`,
    kind: "unplanned",
    priority: rng.weighted(PRIORITY_WEIGHTS[equipment.criticality as 1 | 2 | 3]),
    equipmentId: equipment.id,
    faultCode,
    issuedAtMs,
    failureAtMs: issuedAtMs - Math.round(rng.float(...FAILURE_LEAD_MINUTES) * MS_PER_MINUTE),
    standardHours,
    description: describeFailure(faultCode, equipment.name, rng),
    tag: "regular",
    avoidAssigneeId: null,
  };
}

export function generateUnplannedSlots(context: SeedContext): OrderSlot[] {
  const rng = context.rng.fork("slots:unplanned");
  const targets = unplannedTargets(context.catalog.equipment, rng.fork("targets"));
  return context.catalog.equipment.flatMap((equipment) => {
    const equipmentRng = rng.fork(equipment.inventory_number);
    const faultCodes = faultCodesFor(equipment, targets.get(equipment.id) ?? 0, equipmentRng);
    return faultCodes
      .map((faultCode, ordinal) => buildSlot(context, equipment, ordinal, faultCode, equipmentRng))
      .filter((slot): slot is OrderSlot => slot !== null);
  });
}
