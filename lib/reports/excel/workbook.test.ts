import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  autosizeWidths,
  buildReportWorkbook,
  excelNumberFormat,
  excelValue,
  renderReportXlsx,
  sheetName,
} from "@/lib/reports/excel/workbook";
import { sampleDocument } from "@/lib/reports/test-fixtures";

describe("excelNumberFormat", () => {
  it("uses tenge, hours and percent formats", () => {
    expect(excelNumberFormat("money", "ч")).toBe('#,##0 "₸"');
    expect(excelNumberFormat("hours", "сағ")).toBe('0.0 "сағ"');
    expect(excelNumberFormat("percent", "ч")).toBe('0.0"%"');
    expect(excelNumberFormat("datetime", "ч")).toBe("dd.mm.yyyy hh:mm");
    expect(excelNumberFormat("text", "ч")).toBeUndefined();
  });
});

describe("sheetName", () => {
  it("strips forbidden characters, truncates and keeps names unique", () => {
    const taken = new Set<string>();
    expect(sheetName("Материалы: по участкам / цехам", taken)).toBe("Материалы по участкам цехам");
    const long = "Очень длинное название раздела отчёта по простоям";
    const first = sheetName(long, taken);
    const second = sheetName(long, taken);
    expect(first).toHaveLength(31);
    expect(second.endsWith(" (2)")).toBe(true);
    expect(second.length).toBeLessThanOrEqual(31);
    expect(sheetName("  ", taken)).toBe("Sheet");
  });
});

describe("excelValue", () => {
  it("shifts timestamps to local wall clock time", () => {
    const value = excelValue("2026-10-08T09:05:00Z", "datetime");
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString()).toBe("2026-10-08T14:05:00.000Z");
    expect(excelValue(null, "money")).toBeNull();
    expect(excelValue(12.5, "hours")).toBe(12.5);
    expect(excelValue("n/a", "date")).toBe("n/a");
  });
});

describe("autosizeWidths", () => {
  it("sizes columns by the longest formatted value within bounds", () => {
    const doc = sampleDocument();
    const widths = autosizeWidths(
      [
        { key: "a", label: "A", format: "text" },
        { key: "b", label: "B", format: "money" },
      ],
      [{ a: "x".repeat(200), b: 1_000_000 }],
      doc,
    );
    expect(widths[0]).toBe(60);
    expect(widths[1]).toBeGreaterThanOrEqual(11);
  });
});

describe("buildReportWorkbook", () => {
  it("creates a summary sheet and one sheet per section", () => {
    const doc = sampleDocument();
    const workbook = buildReportWorkbook(doc);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Қорытынды",
      "Наряд карточкасы",
      "Жұмысшылардың жүктемесі",
      "Рейтинг",
      "Қорытынды (2)",
      "Бос кесте",
    ]);
    const table = workbook.getWorksheet("Жұмысшылардың жүктемесі");
    expect(table?.getRow(4).getCell(1).value).toBe("Орындаушы");
    expect(table?.getRow(4).getCell(1).font?.bold).toBe(true);
    expect(table?.getRow(5).getCell(3).numFmt).toBe('#,##0 "₸"');
    expect(table?.getRow(5).getCell(2).numFmt).toBe('0.0 "сағ"');
    expect(table?.getRow(65).getCell(1).value).toBe("Барлығы");
    expect(table?.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
  });

  it("writes a valid xlsx buffer that can be read back", async () => {
    const buffer = await renderReportXlsx(sampleDocument());
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const summary = workbook.worksheets[0];
    expect(summary?.getRow(1).getCell(1).value).toContain("әғқңөұүһі");
  });
});
