import type { SpectrumBin } from "@/lib/acoustic/types";
import { dbToPower, powerToDb } from "@/lib/acoustic/bins";
import { median } from "@/lib/acoustic/signal";

export const FLOOR_RADIUS_BINS = 5;
export const FLOOR_GUARD_BINS = 1;
const EDGE_TOLERANCE = 1.1;

export interface BinProminence {
  index: number;
  f: number;
  levelDb: number;
  floorDb: number;
  prominenceDb: number;
}

export function nearestBinIndex(spectrum: readonly SpectrumBin[], frequency: number): number {
  const first = spectrum[0];
  const last = spectrum.at(-1);
  if (!first || !last || !(frequency > 0)) return -1;
  if (frequency < first.f / EDGE_TOLERANCE || frequency > last.f * EDGE_TOLERANCE) return -1;
  const target = Math.log(frequency);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  spectrum.forEach((bin, index) => {
    const distance = Math.abs(Math.log(bin.f) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

export function levelAt(spectrum: readonly SpectrumBin[], frequency: number): number | null {
  const index = nearestBinIndex(spectrum, frequency);
  return index < 0 ? null : (spectrum[index] as SpectrumBin).db;
}

export function floorAt(
  spectrum: readonly SpectrumBin[],
  index: number,
  radius = FLOOR_RADIUS_BINS,
  guard = FLOOR_GUARD_BINS,
): number {
  const values: number[] = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    if (Math.abs(offset) <= guard) continue;
    const bin = spectrum[index + offset];
    if (bin) values.push(bin.db);
  }
  return values.length > 0 ? median(values) : Number.NaN;
}

export function prominenceAt(
  spectrum: readonly SpectrumBin[],
  frequency: number,
): BinProminence | null {
  const index = nearestBinIndex(spectrum, frequency);
  if (index < 0) return null;
  const bin = spectrum[index] as SpectrumBin;
  const floorDb = floorAt(spectrum, index);
  return {
    index,
    f: bin.f,
    levelDb: bin.db,
    floorDb,
    prominenceDb: Number.isFinite(floorDb) ? bin.db - floorDb : 0,
  };
}

export function overallLevel(spectrum: readonly SpectrumBin[]): number | null {
  if (spectrum.length === 0) return null;
  return powerToDb(spectrum.reduce((sum, bin) => sum + dbToPower(bin.db), 0));
}
