import type { SpectrumBin } from "@/lib/acoustic/types";
import { logBins, type LogBinLayout } from "@/lib/acoustic/bins";

export const LIVE_FLOOR_DB = -120;
export const LIVE_CEILING_DB = -20;

export function liveSpectrum(
  frequencyData: ArrayLike<number>,
  sampleRate: number,
  layout: LogBinLayout = {},
): SpectrumBin[] {
  const lines = frequencyData.length;
  if (lines === 0 || !(sampleRate > 0)) return [];
  const resolution = sampleRate / (2 * lines);
  const nyquist = sampleRate / 2;
  return logBins(layout)
    .filter((bin) => bin.center < nyquist)
    .map((bin) => {
      const first = Math.max(0, Math.ceil(bin.low / resolution));
      const last = Math.min(lines - 1, Math.floor(bin.high / resolution));
      let level = Number.NEGATIVE_INFINITY;
      if (last < first) {
        level = frequencyData[Math.min(lines - 1, Math.round(bin.center / resolution))] as number;
      } else {
        for (let line = first; line <= last; line += 1) {
          level = Math.max(level, frequencyData[line] as number);
        }
      }
      return { f: bin.center, db: Number.isFinite(level) ? level : LIVE_FLOOR_DB };
    });
}

export function normalizeLevel(
  db: number,
  floor = LIVE_FLOOR_DB,
  ceiling = LIVE_CEILING_DB,
): number {
  return Math.min(1, Math.max(0, (db - floor) / (ceiling - floor)));
}

export function logPosition(frequency: number, minHz: number, maxHz: number): number {
  return Math.min(1, Math.max(0, Math.log(frequency / minHz) / Math.log(maxHz / minHz)));
}
