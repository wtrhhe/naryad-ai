import type { SeedContext } from "./context";
import { PLANNED_REPAIR_HOURS_BY_TYPE } from "./data-fault-weights";
import type { Rng } from "./random";
import { MS_PER_DAY, MS_PER_HOUR, plantMidnightMs } from "./time";
import { isPrimaryCrusher } from "./slots-unplanned";
import { reserveIssueTime, type OrderSlot } from "./slots-common";
import type { EquipmentRow, EquipmentType } from "./types";

type PlannedTemplate = {
  readonly key: string;
  readonly intervalDays: number;
  readonly standardHours: (type: EquipmentType) => number;
  readonly faultCode: (equipment: EquipmentRow) => string;
  readonly describe: (equipmentName: string) => string;
  readonly appliesTo: (equipment: EquipmentRow) => boolean;
};

const PREVENTIVE_REPAIR_FAULT_BY_TYPE: Readonly<Record<EquipmentType, string>> = {
  crusher: "М-01",
  conveyor: "М-04",
  pump: "М-02",
  screen: "М-01",
  mill: "М-01",
  classifier: "М-07",
  feeder: "М-07",
  fan: "М-02",
  compressor: "П-01",
  other: "Г-01",
};
const INSTRUMENTED_TYPES: readonly EquipmentType[] = [
  "crusher",
  "mill",
  "pump",
  "classifier",
  "compressor",
  "fan",
];
const OIL_CHANGE_TYPES: readonly EquipmentType[] = ["crusher", "mill", "compressor", "fan"];
const SCHEDULE_JITTER_DAYS = 1.5;
const EARLIEST_START_HOUR = 8.5;
const LATEST_START_HOUR = 13;

const PLANNED_TEMPLATES: readonly PlannedTemplate[] = [
  {
    key: "ppr",
    intervalDays: 30,
    standardHours: (type) => PLANNED_REPAIR_HOURS_BY_TYPE[type],
    faultCode: (equipment) => PREVENTIVE_REPAIR_FAULT_BY_TYPE[equipment.equipment_type],
    describe: (name) =>
      `Плановый ремонт (ППР): ${name}, ревизия узлов и замена изнашиваемых деталей`,
    appliesTo: (equipment) => !isPrimaryCrusher(equipment),
  },
  {
    key: "lubrication",
    intervalDays: 14,
    standardHours: () => 1.5,
    faultCode: () => "С-01",
    describe: (name) => `Плановая смазка узлов: ${name}, по карте смазки`,
    appliesTo: (equipment) => equipment.inventory_number !== "РМЦ-002",
  },
  {
    key: "instruments",
    intervalDays: 30,
    standardHours: () => 2,
    faultCode: () => "Э-05",
    describe: (name) => `Плановая поверка и калибровка датчиков: ${name}`,
    appliesTo: (equipment) => INSTRUMENTED_TYPES.includes(equipment.equipment_type),
  },
  {
    key: "electrical",
    intervalDays: 45,
    standardHours: () => 2.5,
    faultCode: () => "Э-01",
    describe: (name) =>
      `Плановый осмотр электрооборудования: ${name}, замер сопротивления изоляции`,
    appliesTo: () => true,
  },
  {
    key: "oil",
    intervalDays: 30,
    standardHours: () => 2,
    faultCode: () => "С-02",
    describe: (name) => `Плановая замена масла и фильтров: ${name}`,
    appliesTo: (equipment) => OIL_CHANGE_TYPES.includes(equipment.equipment_type),
  },
];

function occurrenceDays(intervalDays: number, windowDays: number, rng: Rng): number[] {
  const days: number[] = [];
  for (
    let day = rng.float(0, intervalDays);
    day < windowDays;
    day += intervalDays + rng.float(-SCHEDULE_JITTER_DAYS, SCHEDULE_JITTER_DAYS)
  ) {
    days.push(day);
  }
  return days;
}

function desiredStartMs(context: SeedContext, dayOffset: number, rng: Rng): number {
  const dayStart = plantMidnightMs(context.windowStartMs + dayOffset * MS_PER_DAY);
  return dayStart + Math.round(rng.float(EARLIEST_START_HOUR, LATEST_START_HOUR) * MS_PER_HOUR);
}

function buildPlannedSlot(
  context: SeedContext,
  equipment: EquipmentRow,
  template: PlannedTemplate,
  ordinal: number,
  dayOffset: number,
  rng: Rng,
): OrderSlot | null {
  const standardHours = template.standardHours(equipment.equipment_type);
  const issuedAtMs = reserveIssueTime(context, {
    equipmentId: equipment.id,
    kind: "planned",
    standardHours,
    desiredMs: desiredStartMs(context, dayOffset, rng),
  });
  if (issuedAtMs === null) return null;
  return {
    key: `planned:${equipment.inventory_number}:${template.key}:${ordinal}`,
    kind: "planned",
    priority: "planned",
    equipmentId: equipment.id,
    faultCode: template.faultCode(equipment),
    issuedAtMs,
    failureAtMs: null,
    standardHours,
    description: template.describe(equipment.name),
    tag: "regular",
    avoidAssigneeId: null,
  };
}

export function generatePlannedSlots(context: SeedContext): OrderSlot[] {
  const rng = context.rng.fork("slots:planned");
  const windowDays = (context.windowEndMs - context.windowStartMs) / MS_PER_DAY;
  return context.catalog.equipment.flatMap((equipment) =>
    PLANNED_TEMPLATES.filter((template) => template.appliesTo(equipment)).flatMap((template) => {
      const templateRng = rng.fork(`${equipment.inventory_number}:${template.key}`);
      return occurrenceDays(template.intervalDays, windowDays, templateRng)
        .map((dayOffset, ordinal) =>
          buildPlannedSlot(context, equipment, template, ordinal, dayOffset, templateRng),
        )
        .filter((slot): slot is OrderSlot => slot !== null);
    }),
  );
}
