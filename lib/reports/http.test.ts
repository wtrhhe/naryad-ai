import { describe, expect, it } from "vitest";
import {
  asciiFileName,
  contentDisposition,
  encodeRfc5987,
  REPORT_MIME_TYPES,
  safeFileName,
} from "@/lib/reports/http";

describe("contentDisposition", () => {
  it("adds an ASCII fallback and an RFC 5987 UTF-8 file name", () => {
    const header = contentDisposition("Отчёт за смену 08.10.2026.pdf", "report-shift.pdf");
    expect(header).toBe(
      "attachment; filename=\"report-shift.pdf\"; filename*=UTF-8''%D0%9E%D1%82%D1%87%D1%91%D1%82%20%D0%B7%D0%B0%20%D1%81%D0%BC%D0%B5%D0%BD%D1%83%2008.10.2026.pdf",
    );
  });

  it("encodes Kazakh letters and reserved characters", () => {
    expect(encodeRfc5987("Есеп (ә)'*")).toBe("%D0%95%D1%81%D0%B5%D0%BF%20%28%D3%99%29%27%2A");
  });

  it("falls back when the name is empty after sanitising", () => {
    expect(contentDisposition("///", "report.xlsx")).toContain("filename*=UTF-8''report.xlsx");
  });
});

describe("file name helpers", () => {
  it("strips characters that are unsafe in file names", () => {
    expect(safeFileName('Наряд №12: "насос"\n/ход')).toBe("Наряд №12 насос ход");
  });

  it("builds an ASCII fallback", () => {
    expect(asciiFileName('Отчёт "x" report 2026.pdf')).toBe("x-report-2026.pdf");
    expect(asciiFileName("Отчёт")).toBe("report");
  });

  it("knows the MIME types", () => {
    expect(REPORT_MIME_TYPES.pdf).toBe("application/pdf");
    expect(REPORT_MIME_TYPES.xlsx).toContain("spreadsheetml");
  });
});
