import type { SeedContext } from "./context";
import { PLANNED_REPAIR_HOURS_BY_TYPE } from "./data-fault-weights";
import { standardHoursFor } from "./norms";
import type { Rng } from "./random";
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, plantMidnightMs } from "./time";
import { reserveIssueTime, type OrderSlot } from "./slots-common";
import { describeFailure, GLAND_LEAK_CODE, isPrimaryCrusher, isPumpN4 } from "./slots-unplanned";
import type { EquipmentRow } from "./types";

export const CRUSHER_REPAIR_DAYS_AGO: readonly number[] = [82, 64, 46, 29, 11];
export const CRUSHER_REPAIR_FAULT = "М-01";
export const CRUSHER_FAILURE_CODES: ReadonlyArray<readonly [string, number]> = [
  ["М-02", 30],
  ["М-07", 25],
  ["М-01", 15],
  ["Г-01", 10],
  ["Э-01", 10],
  ["С-03", 10],
];

const REPAIR_JITTER_DAYS = 1.5;
const REPAIR_START_HOUR = 9;
const GLAND_FIRST_DAYS_AGO = [30, 34] as const;
const GLAND_REPEAT_GAP_DAYS = [5.3, 8.7] as const;
const GLAND_OCCURRENCES = 3;
const FAILURE_LEAD_MINUTES = [5, 25] as const;

function crusherRepairSlots(context: SeedContext, crusher: EquipmentRow, rng: Rng): OrderSlot[] {
  const standardHours = PLANNED_REPAIR_HOURS_BY_TYPE.crusher;
  return CRUSHER_REPAIR_DAYS_AGO.flatMap((daysAgo, ordinal) => {
    const dayStart = plantMidnightMs(
      context.nowMs - (daysAgo + rng.float(-REPAIR_JITTER_DAYS, REPAIR_JITTER_DAYS)) * MS_PER_DAY,
    );
    const issuedAtMs = reserveIssueTime(context, {
      equipmentId: crusher.id,
      kind: "planned",
      standardHours,
      desiredMs: dayStart + REPAIR_START_HOUR * MS_PER_HOUR,
    });
    if (issuedAtMs === null) return [];
    return [
      {
        key: `scripted:crusher-repair:${ordinal}`,
        kind: "planned" as const,
        priority: "planned" as const,
        equipmentId: crusher.id,
        faultCode: CRUSHER_REPAIR_FAULT,
        issuedAtMs,
        failureAtMs: null,
        standardHours,
        description: `Плановый ремонт (ППР): ${crusher.name}, ревизия конуса, замена футеровки, проверка подшипниковых узлов`,
        tag: "crusher-repair" as const,
        avoidAssigneeId: null,
      },
    ];
  });
}

function glandLeakSlots(context: SeedContext, pump: EquipmentRow, rng: Rng): OrderSlot[] {
  const standardHours = standardHoursFor(3, pump.equipment_type);
  const firstMs = context.nowMs - rng.float(...GLAND_FIRST_DAYS_AGO) * MS_PER_DAY;
  const desiredTimes = Array.from({ length: GLAND_OCCURRENCES }, (_, ordinal) => ordinal).reduce<
    number[]
  >(
    (times, ordinal) =>
      ordinal === 0
        ? [firstMs]
        : [...times, (times.at(-1) as number) + rng.float(...GLAND_REPEAT_GAP_DAYS) * MS_PER_DAY],
    [],
  );
  return desiredTimes.flatMap((desiredMs, ordinal) => {
    const issuedAtMs = reserveIssueTime(context, {
      equipmentId: pump.id,
      kind: "unplanned",
      standardHours,
      desiredMs,
    });
    if (issuedAtMs === null) return [];
    return [
      {
        key: `scripted:gland-leak:${ordinal}`,
        kind: "unplanned" as const,
        priority: "high" as const,
        equipmentId: pump.id,
        faultCode: GLAND_LEAK_CODE,
        issuedAtMs,
        failureAtMs: issuedAtMs - Math.round(rng.float(...FAILURE_LEAD_MINUTES) * MS_PER_MINUTE),
        standardHours,
        description: describeFailure(GLAND_LEAK_CODE, pump.name, rng),
        tag: "gland-leak" as const,
        avoidAssigneeId: null,
      },
    ];
  });
}

export function generateScriptedSlots(context: SeedContext): OrderSlot[] {
  const rng = context.rng.fork("slots:scripted");
  const crusher = context.catalog.equipment.find(isPrimaryCrusher);
  const pump = context.catalog.equipment.find(isPumpN4);
  return [
    ...(crusher ? crusherRepairSlots(context, crusher, rng.fork("crusher")) : []),
    ...(pump ? glandLeakSlots(context, pump, rng.fork("gland")) : []),
  ];
}
