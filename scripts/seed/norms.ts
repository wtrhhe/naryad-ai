import { HOURS_FACTOR_BY_TYPE } from "./data-fault-weights";
import type { EquipmentType } from "./types";

const QUARTER_HOUR_STEPS = 4;

export function roundToQuarterHour(hours: number): number {
  return Math.round(hours * QUARTER_HOUR_STEPS) / QUARTER_HOUR_STEPS;
}

export function standardHoursFor(faultStandardHours: number, type: EquipmentType): number {
  return roundToQuarterHour(faultStandardHours * (HOURS_FACTOR_BY_TYPE[type] ?? 1));
}
