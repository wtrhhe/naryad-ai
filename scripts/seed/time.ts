import type { Enums } from "../../lib/supabase/database.types";

export type ShiftPeriod = Enums<"shift_period">;
export type ShiftCrew = Enums<"shift_crew">;

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

const PLANT_UTC_OFFSET_HOURS = 5;
const DAY_SHIFT_START_HOUR = 8;
const DAY_SHIFT_END_HOUR = 20;
const SHIFT_HOURS = 12;
const ROTATION_DAYS = 8;
const CREW_ORDER: readonly ShiftCrew[] = ["A", "B", "C", "D"];
const NIGHT_PHASE_OFFSET_DAYS = 2;

const plantMs = (at: Date): number => at.getTime() + PLANT_UTC_OFFSET_HOURS * MS_PER_HOUR;

export const SHIFT_CREWS: readonly ShiftCrew[] = CREW_ORDER;

export function plantMidnightMs(utcMs: number): number {
  const offsetMs = PLANT_UTC_OFFSET_HOURS * MS_PER_HOUR;
  return Math.floor((utcMs + offsetMs) / MS_PER_DAY) * MS_PER_DAY - offsetMs;
}

export function plantHour(at: Date): number {
  return Math.floor((plantMs(at) % MS_PER_DAY) / MS_PER_HOUR);
}

export function shiftPeriodAt(at: Date): ShiftPeriod {
  const hour = plantHour(at);
  return hour >= DAY_SHIFT_START_HOUR && hour < DAY_SHIFT_END_HOUR ? "day" : "night";
}

export function shiftStartAt(at: Date): Date {
  const sinceDayStart = plantMs(at) - DAY_SHIFT_START_HOUR * MS_PER_HOUR;
  const dayStart = Math.floor(sinceDayStart / MS_PER_DAY) * MS_PER_DAY;
  const offsetIntoDay = sinceDayStart - dayStart;
  const shiftOffset = offsetIntoDay >= SHIFT_HOURS * MS_PER_HOUR ? SHIFT_HOURS * MS_PER_HOUR : 0;
  return new Date(
    dayStart +
      shiftOffset +
      DAY_SHIFT_START_HOUR * MS_PER_HOUR -
      PLANT_UTC_OFFSET_HOURS * MS_PER_HOUR,
  );
}

function rotationDay(at: Date): number {
  const shiftDay = Math.floor((plantMs(at) - DAY_SHIFT_START_HOUR * MS_PER_HOUR) / MS_PER_DAY);
  return ((shiftDay % ROTATION_DAYS) + ROTATION_DAYS) % ROTATION_DAYS;
}

export function crewOnShift(at: Date): ShiftCrew {
  const day = rotationDay(at);
  const phase =
    shiftPeriodAt(at) === "day"
      ? day
      : (day - NIGHT_PHASE_OFFSET_DAYS + ROTATION_DAYS) % ROTATION_DAYS;
  return CREW_ORDER[Math.floor(phase / 2)] as ShiftCrew;
}
