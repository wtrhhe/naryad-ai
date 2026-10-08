import type { Locale } from "@/i18n/config";

export const REPORT_KINDS = [
  "order",
  "shift",
  "rating",
  "materials",
  "downtime",
  "anomalies",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export const PERIOD_REPORT_KINDS = REPORT_KINDS.filter(
  (kind): kind is Exclude<ReportKind, "order"> => kind !== "order",
);

export const REPORT_FORMATS = ["pdf", "xlsx"] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);
}

export type ColumnFormat =
  "text" | "integer" | "number" | "money" | "hours" | "percent" | "datetime" | "date";

export type CellValue = string | number | null;

export type ReportRow = Record<string, CellValue>;

export interface ReportColumn {
  key: string;
  label: string;
  format: ColumnFormat;
  weight?: number;
}

export type Tone = "default" | "good" | "bad" | "accent";

export interface ReportKpi {
  id: string;
  label: string;
  value: number | string | null;
  format: ColumnFormat;
  tone?: Tone;
}

export interface TableSection {
  type: "table";
  id: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
  empty: string;
}

export interface FieldsSection {
  type: "fields";
  id: string;
  title: string;
  items: { label: string; value: string }[];
}

export interface TextSection {
  type: "text";
  id: string;
  title: string;
  paragraphs: string[];
  note?: string;
  bullets?: boolean;
}

export interface BarsSection {
  type: "bars";
  id: string;
  title: string;
  format: ColumnFormat;
  items: { label: string; value: number }[];
  empty: string;
}

export type ReportSection = TableSection | FieldsSection | TextSection | BarsSection;

export interface ReportLabels {
  company: string;
  generated: string;
  period: string;
  page: string;
  hoursUnit: string;
  totals: string;
  summarySheet: string;
}

export interface ReportDocument {
  kind: ReportKind;
  locale: Locale;
  title: string;
  subtitle?: string;
  periodLabel: string;
  generatedAt: string;
  filters: { label: string; value: string }[];
  kpis: ReportKpi[];
  sections: ReportSection[];
  labels: ReportLabels;
  fileName: string;
}
