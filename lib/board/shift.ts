const SHIFT_OFFSET_HOURS = 5;
const DAY_START_HOUR = 8;
const NIGHT_START_HOUR = 20;
const MS_PER_HOUR = 3_600_000;

export interface ShiftWindow {
  start: Date;
  end: Date;
  period: "day" | "night";
}

export function currentShiftWindow(now: Date): ShiftWindow {
  const local = new Date(now.getTime() + SHIFT_OFFSET_HOURS * MS_PER_HOUR);
  const hour = local.getUTCHours();
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const toUtc = (localMs: number) => new Date(localMs - SHIFT_OFFSET_HOURS * MS_PER_HOUR);
  if (hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR) {
    return {
      start: toUtc(midnightLocal + DAY_START_HOUR * MS_PER_HOUR),
      end: toUtc(midnightLocal + NIGHT_START_HOUR * MS_PER_HOUR),
      period: "day",
    };
  }
  const nightStart = hour >= NIGHT_START_HOUR ? midnightLocal : midnightLocal - 24 * MS_PER_HOUR;
  return {
    start: toUtc(nightStart + NIGHT_START_HOUR * MS_PER_HOUR),
    end: toUtc(nightStart + (24 + DAY_START_HOUR) * MS_PER_HOUR),
    period: "night",
  };
}
