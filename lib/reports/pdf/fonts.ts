import { readFileSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const REPORT_FONT_FAMILY = "IBM Plex Sans";

export const REPORT_FONT_FILES = {
  regular: "IBMPlexSans-Regular.ttf",
  semibold: "IBMPlexSans-SemiBold.ttf",
} as const;

let registered = false;

function fontDataUrl(file: string): string {
  const bytes = readFileSync(path.join(process.cwd(), "lib", "reports", "fonts", file));
  return `data:font/ttf;base64,${bytes.toString("base64")}`;
}

export function registerReportFonts(): void {
  if (registered) return;
  Font.register({
    family: REPORT_FONT_FAMILY,
    fonts: [
      { src: fontDataUrl(REPORT_FONT_FILES.regular), fontWeight: 400 },
      { src: fontDataUrl(REPORT_FONT_FILES.semibold), fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
