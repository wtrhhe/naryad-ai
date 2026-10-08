import { create } from "qrcode";

export const QR_QUIET_ZONE = 2;

export interface QrGlyph {
  size: number;
  path: string;
}

export function qrGlyph(text: string): QrGlyph {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  const segments: string[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    let column = 0;
    while (column < modules.size) {
      if (!modules.get(row, column)) {
        column += 1;
        continue;
      }
      const start = column;
      while (column < modules.size && modules.get(row, column)) {
        column += 1;
      }
      segments.push(`M${start} ${row}h${column - start}v1h-${column - start}z`);
    }
  }
  return { size: modules.size, path: segments.join("") };
}
