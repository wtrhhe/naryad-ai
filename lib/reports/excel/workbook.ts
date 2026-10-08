import ExcelJS from "exceljs";
import type {
  CellValue,
  ColumnFormat,
  ReportColumn,
  ReportDocument,
  ReportRow,
  ReportSection,
} from "@/lib/reports/document";
import { formatCell, toExcelLocalDate } from "@/lib/reports/format";

const COLORS = {
  accent: "FFB45309",
  accentSoft: "FFFDF1E2",
  header: "FF1A2230",
  headerText: "FFFFFFFF",
  muted: "FF4B5868",
  border: "FFCFD6E0",
  stripe: "FFF3F5F8",
};

const MIN_WIDTH = 8;
const MAX_WIDTH = 60;
const SHEET_NAME_LIMIT = 31;
const HEADER_ROW = 4;

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

export function excelNumberFormat(format: ColumnFormat, hoursUnit: string): string | undefined {
  switch (format) {
    case "money":
      return '#,##0 "₸"';
    case "hours":
      return `0.0 "${hoursUnit.replace(/"/g, "")}"`;
    case "percent":
      return '0.0"%"';
    case "integer":
      return "#,##0";
    case "number":
      return "#,##0.00";
    case "datetime":
      return "dd.mm.yyyy hh:mm";
    case "date":
      return "dd.mm.yyyy";
    default:
      return undefined;
  }
}

export function sheetName(title: string, taken: Set<string>): string {
  const cleaned =
    title
      .replace(/[[\]:*?/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Sheet";
  const base = cleaned.slice(0, SHEET_NAME_LIMIT);
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    candidate = `${base.slice(0, SHEET_NAME_LIMIT - suffix.length)}${suffix}`;
    counter += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function excelValue(value: CellValue, format: ColumnFormat): ExcelJS.CellValue {
  if (value === null || value === "") return null;
  if ((format === "datetime" || format === "date") && typeof value === "string") {
    const time = Date.parse(value);
    return Number.isNaN(time) ? value : toExcelLocalDate(value);
  }
  return value;
}

function displayLength(value: CellValue, format: ColumnFormat, doc: ReportDocument): number {
  const text = formatCell(value, format, doc.locale, doc.labels.hoursUnit);
  return Math.max(...text.split("\n").map((line) => line.length));
}

export function autosizeWidths(
  columns: readonly ReportColumn[],
  rows: readonly ReportRow[],
  doc: ReportDocument,
): number[] {
  return columns.map((column) => {
    const longest = rows.reduce(
      (max, row) => Math.max(max, displayLength(row[column.key] ?? null, column.format, doc)),
      column.label.length,
    );
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 2));
  });
}

function writeTitle(sheet: ExcelJS.Worksheet, title: string, doc: ReportDocument, span: number) {
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = title;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: COLORS.accent } };
  titleRow.height = 22;
  const meta = sheet.getRow(2);
  meta.getCell(1).value = `${doc.labels.company} · ${doc.labels.period}: ${doc.periodLabel}`;
  meta.getCell(1).font = { size: 9, color: { argb: COLORS.muted } };
  if (span > 1) {
    sheet.mergeCells(1, 1, 1, span);
    sheet.mergeCells(2, 1, 2, span);
  }
}

function styleHeader(row: ExcelJS.Row, count: number) {
  row.height = 30;
  for (let index = 1; index <= count; index += 1) {
    const cell = row.getCell(index);
    cell.font = { bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.header } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  }
}

function writeTable(
  sheet: ExcelJS.Worksheet,
  columns: readonly ReportColumn[],
  rows: readonly ReportRow[],
  doc: ReportDocument,
  totals?: ReportRow,
) {
  const header = sheet.getRow(HEADER_ROW);
  columns.forEach((column, index) => {
    header.getCell(index + 1).value = column.label;
  });
  styleHeader(header, columns.length);
  const all = totals ? [...rows, totals] : rows;
  all.forEach((values, rowIndex) => {
    const row = sheet.getRow(HEADER_ROW + 1 + rowIndex);
    const isTotals = totals !== undefined && rowIndex === rows.length;
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      cell.value = excelValue(values[column.key] ?? null, column.format);
      const numFmt = excelNumberFormat(column.format, doc.labels.hoursUnit);
      if (numFmt) cell.numFmt = numFmt;
      cell.border = thinBorder;
      cell.alignment = { vertical: "top", wrapText: column.format === "text" };
      if (isTotals) {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.accentSoft } };
      } else if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.stripe } };
      }
    });
  });
  autosizeWidths(columns, all, doc).forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 0 }];
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: HEADER_ROW + rows.length, column: columns.length },
    };
  }
}

function sectionTable(section: ReportSection): {
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
} {
  switch (section.type) {
    case "table":
      return { columns: section.columns, rows: section.rows, totals: section.totals };
    case "fields":
      return {
        columns: [
          { key: "label", label: section.title, format: "text" },
          { key: "value", label: "", format: "text" },
        ],
        rows: section.items.map((item) => ({ label: item.label, value: item.value })),
      };
    case "bars":
      return {
        columns: [
          { key: "label", label: section.title, format: "text" },
          { key: "value", label: "", format: section.format },
        ],
        rows: section.items.map((item) => ({ label: item.label, value: item.value })),
      };
    case "text":
      return {
        columns: [{ key: "text", label: section.title, format: "text" }],
        rows: [...section.paragraphs, ...(section.note ? [section.note] : [])].map((text) => ({
          text,
        })),
      };
  }
}

function writeSummary(sheet: ExcelJS.Worksheet, doc: ReportDocument) {
  writeTitle(sheet, doc.title, doc, 2);
  let rowIndex = HEADER_ROW;
  const put = (label: string, value: ExcelJS.CellValue, numFmt?: string, bold = false) => {
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = label;
    row.getCell(1).font = { color: { argb: COLORS.muted } };
    row.getCell(2).value = value;
    if (numFmt) row.getCell(2).numFmt = numFmt;
    if (bold) row.getCell(2).font = { bold: true, size: 12 };
    row.getCell(2).alignment = { horizontal: "left", wrapText: true };
    rowIndex += 1;
  };
  if (doc.subtitle) put(doc.title, doc.subtitle);
  put(doc.labels.period, doc.periodLabel);
  put(doc.labels.generated, doc.generatedAt);
  doc.filters.forEach((filter) => put(filter.label, filter.value));
  rowIndex += 1;
  doc.kpis.forEach((kpi) =>
    put(kpi.label, kpi.value, excelNumberFormat(kpi.format, doc.labels.hoursUnit), true),
  );
  const labels = [
    doc.labels.period,
    doc.labels.generated,
    ...doc.filters.map((filter) => filter.label),
    ...doc.kpis.map((kpi) => kpi.label),
  ];
  sheet.getColumn(1).width = Math.min(MAX_WIDTH, Math.max(16, ...labels.map((l) => l.length + 2)));
  sheet.getColumn(2).width = Math.min(
    MAX_WIDTH,
    Math.max(
      20,
      doc.periodLabel.length + 2,
      ...doc.filters.map((filter) => filter.value.length + 2),
      ...(doc.subtitle ? [doc.subtitle.length + 2] : []),
    ),
  );
}

export function buildReportWorkbook(doc: ReportDocument): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = doc.labels.company;
  workbook.title = doc.title;
  workbook.created = new Date();
  const taken = new Set<string>();
  writeSummary(workbook.addWorksheet(sheetName(doc.labels.summarySheet, taken)), doc);
  for (const section of doc.sections) {
    const sheet = workbook.addWorksheet(sheetName(section.title, taken));
    const table = sectionTable(section);
    writeTitle(sheet, section.title, doc, table.columns.length);
    writeTable(sheet, table.columns, table.rows, doc, table.totals);
  }
  return workbook;
}

export async function renderReportXlsx(doc: ReportDocument): Promise<Buffer> {
  const data = await buildReportWorkbook(doc).xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}
