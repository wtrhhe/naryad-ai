import { TIME_ZONE, type Locale } from "@/i18n/config";
import type { CellValue, ColumnFormat } from "@/lib/reports/document";

export const LOCAL_OFFSET_HOURS = 5;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export function intlLocale(locale: Locale): string {
  return locale === "kk" ? "kk-KZ" : "ru-RU";
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatNumber(value: number, locale: Locale, digits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatMoney(value: number, locale: Locale): string {
  return `${formatNumber(Math.round(value), locale)} ₸`;
}

export function formatHours(value: number, locale: Locale, unit: string): string {
  return `${formatNumber(value, locale, 1)} ${unit}`;
}

export function formatPercent(value: number, locale: Locale): string {
  return `${formatNumber(value, locale, 1)}%`;
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function localDateKey(date: Date): string {
  return new Date(date.getTime() + LOCAL_OFFSET_HOURS * MS_PER_HOUR).toISOString().slice(0, 10);
}

export function toExcelLocalDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + LOCAL_OFFSET_HOURS * MS_PER_HOUR);
}

export function formatCell(
  value: CellValue,
  format: ColumnFormat,
  locale: Locale,
  hoursUnit: string,
): string {
  if (value === null || value === "") return "—";
  if (typeof value === "string") {
    if (format === "datetime") return formatDateTime(value, locale);
    if (format === "date") return formatDate(value, locale);
    return value;
  }
  switch (format) {
    case "money":
      return formatMoney(value, locale);
    case "hours":
      return formatHours(value, locale, hoursUnit);
    case "percent":
      return formatPercent(value, locale);
    case "number":
      return formatNumber(value, locale, 2);
    case "integer":
      return formatNumber(value, locale, 0);
    default:
      return String(value);
  }
}
