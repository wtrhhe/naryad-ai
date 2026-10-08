import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderReportPdf } from "@/lib/reports/pdf/render";
import { pageLabel, isNumericFormat } from "@/lib/reports/pdf/blocks";
import { REPORT_FONT_FILES } from "@/lib/reports/pdf/fonts";
import { KAZAKH_LETTERS, sampleDocument } from "@/lib/reports/test-fixtures";

interface GlyphFont {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

interface FontkitModule {
  create(buffer: Uint8Array): GlyphFont;
}

describe("report fonts", () => {
  it.each(Object.values(REPORT_FONT_FILES))(
    "%s covers Kazakh letters and the tenge sign",
    async (file) => {
      const fontkit = (await import("fontkit" as string)) as FontkitModule;
      const font = fontkit.create(
        readFileSync(path.join(process.cwd(), "lib", "reports", "fonts", file)),
      );
      const missing = [...`${KAZAKH_LETTERS}₸№`.replace(/\s/g, "")].filter(
        (letter) => !font.hasGlyphForCodePoint(letter.codePointAt(0) ?? 0),
      );
      expect(missing).toEqual([]);
    },
  );
});

describe("renderReportPdf", () => {
  it("renders a multi page document with Kazakh text to a PDF buffer", async () => {
    const buffer = await renderReportPdf(sampleDocument());
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5_000);
    const raw = buffer.toString("latin1");
    expect(raw).toContain("IBMPlexSans");
    expect((raw.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  }, 30_000);

  it("renders a document without sections or KPIs", async () => {
    const buffer = await renderReportPdf(
      sampleDocument({ kpis: [], sections: [], subtitle: undefined, filters: [] }),
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});

describe("pdf helpers", () => {
  it("fills the page label template", () => {
    expect(pageLabel("Стр. {page} из {total}", 2, 5)).toBe("Стр. 2 из 5");
  });

  it("aligns only numeric formats to the right", () => {
    expect(isNumericFormat("money")).toBe(true);
    expect(isNumericFormat("text")).toBe(false);
    expect(isNumericFormat("datetime")).toBe(false);
  });
});
