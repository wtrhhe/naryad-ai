import { describe, expect, it } from "vitest";
import {
  formatCell,
  formatDate,
  formatDateTime,
  formatHours,
  formatMoney,
  formatPercent,
  localDateKey,
  roundTo,
  toExcelLocalDate,
} from "@/lib/reports/format";

const NBSP = " ";

describe("number formatting", () => {
  it("formats tenge, hours and percents with Russian separators", () => {
    expect(formatMoney(1234567.6, "ru")).toBe(`1${NBSP}234${NBSP}568 ₸`);
    expect(formatHours(2.25, "ru", "ч")).toBe("2,3 ч");
    expect(formatPercent(12.345, "kk")).toBe("12,3%");
    expect(roundTo(1.005, 1)).toBe(1);
  });
});

describe("date formatting", () => {
  it("uses the plant time zone", () => {
    expect(formatDateTime("2026-10-08T19:30:00Z", "ru")).toBe("09.10.2026, 00:30");
    expect(formatDate("2026-10-08T19:30:00Z", "kk")).toBe("09.10.2026");
    expect(localDateKey(new Date("2026-10-08T19:30:00Z"))).toBe("2026-10-09");
    expect(toExcelLocalDate("2026-10-08T19:30:00Z").toISOString()).toBe("2026-10-09T00:30:00.000Z");
  });
});

describe("formatCell", () => {
  it("formats every column type", () => {
    expect(formatCell(null, "money", "ru", "ч")).toBe("—");
    expect(formatCell("", "text", "ru", "ч")).toBe("—");
    expect(formatCell("Насос", "text", "ru", "ч")).toBe("Насос");
    expect(formatCell("2026-10-08T03:00:00Z", "datetime", "ru", "ч")).toBe("08.10.2026, 08:00");
    expect(formatCell("2026-10-08T03:00:00Z", "date", "ru", "ч")).toBe("08.10.2026");
    expect(formatCell(1500, "money", "ru", "ч")).toBe(`1${NBSP}500 ₸`);
    expect(formatCell(1.25, "hours", "kk", "сағ")).toBe("1,3 сағ");
    expect(formatCell(50, "percent", "ru", "ч")).toBe("50%");
    expect(formatCell(1.256, "number", "ru", "ч")).toBe("1,26");
    expect(formatCell(1234, "integer", "ru", "ч")).toBe(`1${NBSP}234`);
    expect(formatCell(7, "text", "ru", "ч")).toBe("7");
  });
});
