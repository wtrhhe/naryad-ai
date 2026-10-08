import type { DefectBand, SpectrumPeak } from "@/lib/acoustic/types";
import type { PowerSpectralDensity } from "@/lib/acoustic/welch";
import { matchDefectBand, LABEL_TOLERANCE } from "@/lib/acoustic/bearing";
import { powerToDb, SPECTRUM_MAX_HZ, SPECTRUM_MIN_HZ } from "@/lib/acoustic/bins";
import { median, roundTo } from "@/lib/acoustic/signal";

export interface PeakOptions {
  minHz?: number;
  maxHz?: number;
  maxPeaks?: number;
  minProminenceDb?: number;
  bands?: readonly DefectBand[];
}

export interface DetectedPeak extends SpectrumPeak {
  prominenceDb: number;
}

export const MAX_PEAKS = 5;
export const MIN_PEAK_PROMINENCE_DB = 8;
const NEIGHBOURS = 2;
const GUARD_LINES = 3;
const MIN_FLOOR_LINES = 12;
const MAX_FLOOR_LINES = 64;
const FLOOR_FRACTION = 0.1;
const LOBE_LINES = 2;
const LABEL_RESOLUTION_FACTOR = 1.5;

function isLocalMaximum(levels: Float64Array, line: number): boolean {
  const level = levels[line] as number;
  for (let offset = 1; offset <= NEIGHBOURS; offset += 1) {
    if (!(level > (levels[line - offset] as number))) return false;
    if (!(level >= (levels[line + offset] as number))) return false;
  }
  return true;
}

function floorLevel(levels: Float64Array, line: number): number {
  const radius = Math.min(
    MAX_FLOOR_LINES,
    Math.max(MIN_FLOOR_LINES, Math.round(line * FLOOR_FRACTION)),
  );
  const values: number[] = [];
  const first = Math.max(1, line - radius);
  const last = Math.min(levels.length - 1, line + radius);
  for (let index = first; index <= last; index += 1) {
    if (Math.abs(index - line) > GUARD_LINES) values.push(levels[index] as number);
  }
  return median(values);
}

function refineOffset(levels: Float64Array, line: number): number {
  const left = levels[line - 1] as number;
  const centre = levels[line] as number;
  const right = levels[line + 1] as number;
  const denominator = left - 2 * centre + right;
  if (denominator === 0) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denominator));
}

function lobePower(psd: PowerSpectralDensity, line: number): number {
  let power = 0;
  const first = Math.max(0, line - LOBE_LINES);
  const last = Math.min(psd.density.length - 1, line + LOBE_LINES);
  for (let index = first; index <= last; index += 1) power += psd.density[index] as number;
  return power * psd.resolution;
}

export function detectPeaks(
  psd: PowerSpectralDensity,
  {
    minHz = SPECTRUM_MIN_HZ,
    maxHz = SPECTRUM_MAX_HZ,
    maxPeaks = MAX_PEAKS,
    minProminenceDb = MIN_PEAK_PROMINENCE_DB,
    bands = [],
  }: PeakOptions = {},
): DetectedPeak[] {
  const resolution = psd.resolution;
  const levels = psd.density.map((value) => powerToDb(value * resolution));
  const firstLine = Math.max(NEIGHBOURS, Math.ceil(minHz / resolution));
  const lastLine = Math.min(levels.length - 1 - NEIGHBOURS, Math.floor(maxHz / resolution));
  const candidates: { line: number; prominence: number }[] = [];
  for (let line = firstLine; line <= lastLine; line += 1) {
    if (!isLocalMaximum(levels, line)) continue;
    const prominence = (levels[line] as number) - floorLevel(levels, line);
    if (prominence >= minProminenceDb) candidates.push({ line, prominence });
  }
  return candidates
    .sort((a, b) => b.prominence - a.prominence)
    .slice(0, maxPeaks)
    .map(({ line, prominence }) => {
      const frequency = (line + refineOffset(levels, line)) * resolution;
      const band = matchDefectBand(
        frequency,
        bands,
        LABEL_TOLERANCE,
        LABEL_RESOLUTION_FACTOR * resolution,
      );
      const peak: DetectedPeak = {
        f: roundTo(frequency, 2),
        db: roundTo(powerToDb(lobePower(psd, line)), 2),
        prominenceDb: roundTo(prominence, 2),
      };
      if (band) peak.label = band.label;
      return peak;
    })
    .sort((a, b) => b.db - a.db);
}

export function toStoredPeaks(peaks: readonly DetectedPeak[]): SpectrumPeak[] {
  return peaks.map(({ f, db, label }) => (label === undefined ? { f, db } : { f, db, label }));
}
