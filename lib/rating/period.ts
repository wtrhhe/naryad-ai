import { currentShiftWindow } from "@/lib/board/shift";

export const RATING_PRESETS = ["shift", "day", "week", "month", "custom"] as const;

export type RatingPreset = (typeof RATING_PRESETS)[number];

export const DEFAULT_RATING_PRESET: Exclude<RatingPreset, "custom"> = "week";

export const MAX_CUSTOM_DAYS = 366;

const LOCAL_OFFSET_MS = 5 * 3_600_000;
const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface RatingPeriod {
  preset: RatingPreset;
  start: Date;
  end: Date;
  from: string;
  to: string;
}

export interface RatingPeriodInput {
  period?: string | null;
  from?: string | null;
  to?: string | null;
}

export function isRatingPreset(value: unknown): value is RatingPreset {
  return typeof value === "string" && (RATING_PRESETS as readonly string[]).includes(value);
}

export function localDate(date: Date): string {
  return new Date(date.getTime() + LOCAL_OFFSET_MS).toISOString().slice(0, 10);
}

function localMidnight(now: Date): number {
  const local = now.getTime() + LOCAL_OFFSET_MS;
  return Math.floor(local / MS_PER_DAY) * MS_PER_DAY - LOCAL_OFFSET_MS;
}

export function parseLocalDate(value: string | null | undefined): number | null {
  if (!value || !DATE_PATTERN.test(value)) return null;
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return null;
  return utc - LOCAL_OFFSET_MS;
}

function build(preset: RatingPreset, startMs: number, endMs: number): RatingPeriod {
  return {
    preset,
    start: new Date(startMs),
    end: new Date(endMs),
    from: localDate(new Date(startMs)),
    to: localDate(new Date(endMs - 1)),
  };
}

function presetPeriod(preset: Exclude<RatingPreset, "custom">, now: Date): RatingPeriod {
  if (preset === "shift") {
    const shift = currentShiftWindow(now);
    return build(preset, shift.start.getTime(), shift.end.getTime());
  }
  const midnight = localMidnight(now);
  const days = preset === "day" ? 1 : preset === "week" ? 7 : 30;
  return build(preset, midnight - (days - 1) * MS_PER_DAY, midnight + MS_PER_DAY);
}

export function resolveRatingPeriod(input: RatingPeriodInput, now: Date): RatingPeriod {
  const preset = isRatingPreset(input.period) ? input.period : DEFAULT_RATING_PRESET;
  if (preset !== "custom") return presetPeriod(preset, now);
  const from = parseLocalDate(input.from);
  const to = parseLocalDate(input.to);
  if (from === null || to === null || to < from || (to - from) / MS_PER_DAY >= MAX_CUSTOM_DAYS) {
    return presetPeriod(DEFAULT_RATING_PRESET, now);
  }
  return build("custom", from, to + MS_PER_DAY);
}

export function ratingPeriodQuery(period: RatingPeriod): Record<string, string> {
  return period.preset === "custom"
    ? { period: "custom", from: period.from, to: period.to }
    : { period: period.preset };
}
