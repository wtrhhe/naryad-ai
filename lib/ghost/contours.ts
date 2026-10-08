import { boxBlur, normalizeEdges, rgbaToGray, sobelMagnitude } from "@/lib/ghost/alignment";

export type Rgb = readonly [number, number, number];

export const DEFAULT_CONTOUR_COLOR: Rgb = [245, 165, 36];
const LOW_EDGE = 0.3;
const HIGH_EDGE = 0.75;

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function renderContours(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  color: Rgb = DEFAULT_CONTOUR_COLOR,
): Uint8ClampedArray<ArrayBuffer> {
  const edges = normalizeEdges(sobelMagnitude(boxBlur(rgbaToGray(rgba, width, height), 1)));
  const output = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < edges.data.length; index += 1) {
    const offset = index * 4;
    output[offset] = color[0];
    output[offset + 1] = color[1];
    output[offset + 2] = color[2];
    output[offset + 3] = Math.round(smoothstep(LOW_EDGE, HIGH_EDGE, edges.data[index] ?? 0) * 255);
  }
  return output;
}

export function parseCssColor(value: string, fallback: Rgb = DEFAULT_CONTOUR_COLOR): Rgb {
  const trimmed = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(trimmed);
  if (rgb) {
    return [channel(rgb[1]), channel(rgb[2]), channel(rgb[3])];
  }
  return fallback;
}

function channel(value: string | undefined): number {
  return Math.min(255, Number(value ?? 0));
}
