export interface SplitDuration {
  hours: number;
  minutes: number;
}

export function splitMinutes(total: number): SplitDuration {
  const rounded = Math.max(0, Math.round(total));
  return { hours: Math.floor(rounded / 60), minutes: rounded % 60 };
}

export function durationKey(duration: SplitDuration): "minutes" | "hours" | "hoursMinutes" {
  if (duration.hours === 0) return "minutes";
  return duration.minutes === 0 ? "hours" : "hoursMinutes";
}

export function sharePercent(part: number, total: number): number {
  return total <= 0 ? 0 : Math.round((part / total) * 100);
}

export function compactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "kk" ? "kk-KZ" : "ru-RU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatHours(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "kk" ? "kk-KZ" : "ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}
