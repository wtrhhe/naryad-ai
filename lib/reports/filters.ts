import { z } from "zod";
import { currentShiftWindow } from "@/lib/board/shift";
import { LOCAL_OFFSET_HOURS, MS_PER_DAY, MS_PER_HOUR, localDateKey } from "@/lib/reports/format";

export const PERIOD_PRESETS = ["shift", "day", "week", "month", "custom"] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const MAX_CUSTOM_DAYS = 366;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const optionalId = z.uuid().optional().catch(undefined);

const optionalDate = z
  .string()
  .regex(DATE_PATTERN)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
  .optional()
  .catch(undefined);

export const reportFiltersSchema = z.object({
  period: z.enum(PERIOD_PRESETS).catch("shift"),
  from: optionalDate,
  to: optionalDate,
  site: optionalId,
  equipment: optionalId,
  assignee: optionalId,
  brigade: optionalId,
});

export const orderIdSchema = z.uuid();

export interface ReportPeriod {
  preset: PeriodPreset;
  start: Date;
  end: Date;
}

export interface ReportFilters {
  period: ReportPeriod;
  siteId?: string;
  equipmentId?: string;
  assigneeId?: string;
  brigadeId?: string;
}

export type SearchParamsInput =
  URLSearchParams | Record<string, string | string[] | undefined> | undefined;

export function firstValues(input: SearchParamsInput): Record<string, string> {
  if (!input) return {};
  if (input instanceof URLSearchParams) {
    const values: Record<string, string> = {};
    input.forEach((value, key) => {
      if (!(key in values)) values[key] = value;
    });
    return values;
  }
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") values[key] = first;
  }
  return values;
}

function localMidnight(date: Date): number {
  const shifted = date.getTime() + LOCAL_OFFSET_HOURS * MS_PER_HOUR;
  return Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY - LOCAL_OFFSET_HOURS * MS_PER_HOUR;
}

function localDateStart(key: string): number {
  return Date.parse(`${key}T00:00:00Z`) - LOCAL_OFFSET_HOURS * MS_PER_HOUR;
}

export function resolvePeriod(
  preset: PeriodPreset,
  now: Date,
  from?: string,
  to?: string,
): ReportPeriod {
  const today = localMidnight(now);
  switch (preset) {
    case "shift": {
      const shift = currentShiftWindow(now);
      return { preset, start: shift.start, end: shift.end };
    }
    case "day":
      return { preset, start: new Date(today), end: new Date(today + MS_PER_DAY) };
    case "week":
      return { preset, start: new Date(today - 6 * MS_PER_DAY), end: new Date(today + MS_PER_DAY) };
    case "month":
      return {
        preset,
        start: new Date(today - 29 * MS_PER_DAY),
        end: new Date(today + MS_PER_DAY),
      };
    case "custom": {
      const todayKey = localDateKey(now);
      const first = localDateStart(from ?? to ?? todayKey);
      const last = localDateStart(to ?? from ?? todayKey);
      const start = Math.min(first, last);
      const end = Math.min(Math.max(first, last), start + (MAX_CUSTOM_DAYS - 1) * MS_PER_DAY);
      return { preset, start: new Date(start), end: new Date(end + MS_PER_DAY) };
    }
  }
}

export function parseReportFilters(input: SearchParamsInput, now: Date): ReportFilters {
  const parsed = reportFiltersSchema.parse(firstValues(input));
  return {
    period: resolvePeriod(parsed.period, now, parsed.from, parsed.to),
    siteId: parsed.site,
    equipmentId: parsed.equipment,
    assigneeId: parsed.assignee,
    brigadeId: parsed.brigade,
  };
}

export function periodHours(period: ReportPeriod): number {
  return (period.end.getTime() - period.start.getTime()) / MS_PER_HOUR;
}

export function lastIncludedDay(period: ReportPeriod): Date {
  return new Date(period.end.getTime() - 1);
}

export function filtersToSearchParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams({ period: filters.period.preset });
  if (filters.period.preset === "custom") {
    params.set("from", localDateKey(filters.period.start));
    params.set("to", localDateKey(lastIncludedDay(filters.period)));
  }
  const ids: [string, string | undefined][] = [
    ["site", filters.siteId],
    ["equipment", filters.equipmentId],
    ["assignee", filters.assigneeId],
    ["brigade", filters.brigadeId],
  ];
  for (const [key, value] of ids) {
    if (value) params.set(key, value);
  }
  return params;
}
