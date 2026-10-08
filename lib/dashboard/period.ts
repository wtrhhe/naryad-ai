export const PERIOD_OPTIONS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];
export const DEFAULT_PERIOD: PeriodDays = 30;

export const LOCAL_OFFSET_HOURS = 5;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const OFFSET_MS = LOCAL_OFFSET_HOURS * MS_PER_HOUR;

export interface PeriodWindow {
  days: PeriodDays;
  start: Date;
  end: Date;
}

export function parsePeriod(value: unknown): PeriodDays {
  const numeric = typeof value === "string" ? Number(value) : value;
  return (PERIOD_OPTIONS as readonly unknown[]).includes(numeric)
    ? (numeric as PeriodDays)
    : DEFAULT_PERIOD;
}

function localMidnight(ms: number): number {
  return Math.floor((ms + OFFSET_MS) / MS_PER_DAY) * MS_PER_DAY - OFFSET_MS;
}

export function periodWindow(now: Date, days: PeriodDays): PeriodWindow {
  const start = localMidnight(now.getTime()) - (days - 1) * MS_PER_DAY;
  return { days, start: new Date(start), end: now };
}

export function localDayKey(value: Date | string | number): string {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

export function dayStartMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`) - OFFSET_MS;
}

export function dayKeys(window: PeriodWindow): string[] {
  return Array.from({ length: window.days }, (_, index) =>
    localDayKey(window.start.getTime() + index * MS_PER_DAY),
  );
}
