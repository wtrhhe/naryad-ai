const OFFSET_HOURS = 5;
const DAY_START_HOUR = 8;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export function productionDate(now: Date, offsetDays = 0): string {
  const local = now.getTime() + (OFFSET_HOURS - DAY_START_HOUR) * MS_PER_HOUR;
  return new Date(local + offsetDays * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function productionDayWindow(date: string): { start: Date; end: Date } {
  const start = new Date(
    Date.parse(`${date}T00:00:00Z`) + (DAY_START_HOUR - OFFSET_HOURS) * MS_PER_HOUR,
  );
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
}

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

export function overlapHours(
  startIso: string,
  endIso: string | null,
  windowStart: Date,
  windowEnd: Date,
): number {
  const start = Math.max(new Date(startIso).getTime(), windowStart.getTime());
  const end = Math.min(
    endIso ? new Date(endIso).getTime() : windowEnd.getTime(),
    windowEnd.getTime(),
  );
  return end > start ? (end - start) / MS_PER_HOUR : 0;
}
