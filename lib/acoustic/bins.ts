import type { SpectrumBin } from "@/lib/acoustic/types";
import type { PowerSpectralDensity } from "@/lib/acoustic/welch";
import { roundTo } from "@/lib/acoustic/signal";

export const SPECTRUM_BIN_COUNT = 64;
export const SPECTRUM_MIN_HZ = 20;
export const SPECTRUM_MAX_HZ = 20_000;
export const DB_REFERENCE_POWER = 1e-10;
const MIN_POWER = 1e-20;

export interface LogBin {
  center: number;
  low: number;
  high: number;
}

export interface LogBinLayout {
  count?: number;
  minHz?: number;
  maxHz?: number;
}

export function logBinCenters({
  count = SPECTRUM_BIN_COUNT,
  minHz = SPECTRUM_MIN_HZ,
  maxHz = SPECTRUM_MAX_HZ,
}: LogBinLayout = {}): number[] {
  if (count < 2 || !(minHz > 0) || !(maxHz > minHz)) {
    throw new RangeError("logBinCenters: invalid layout");
  }
  const span = maxHz / minHz;
  return Array.from({ length: count }, (_, index) => minHz * span ** (index / (count - 1)));
}

export function logBins(layout: LogBinLayout = {}): LogBin[] {
  const centers = logBinCenters(layout);
  const ratio = (centers[1] as number) / (centers[0] as number);
  const halfStep = Math.sqrt(ratio);
  return centers.map((center) => ({ center, low: center / halfStep, high: center * halfStep }));
}

export function powerToDb(power: number): number {
  return 10 * Math.log10(Math.max(power, MIN_POWER) / DB_REFERENCE_POWER);
}

export function dbToPower(db: number): number {
  return DB_REFERENCE_POWER * 10 ** (db / 10);
}

export function bandPower(psd: PowerSpectralDensity, lowHz: number, highHz: number): number {
  const resolution = psd.resolution;
  const last = psd.density.length - 1;
  const nyquist = last * resolution;
  const low = Math.max(0, lowHz);
  const high = Math.min(highHz, nyquist);
  if (!(high > low)) return 0;
  const first = Math.max(0, Math.floor(low / resolution + 0.5));
  const final = Math.min(last, Math.floor(high / resolution + 0.5));
  let power = 0;
  for (let bin = first; bin <= final; bin += 1) {
    const binLow = Math.max(0, (bin - 0.5) * resolution);
    const binHigh = Math.min(nyquist, (bin + 0.5) * resolution);
    const overlap = Math.min(high, binHigh) - Math.max(low, binLow);
    if (overlap > 0) power += (psd.density[bin] as number) * overlap;
  }
  return power;
}

export function binSpectrum(psd: PowerSpectralDensity, layout: LogBinLayout = {}): SpectrumBin[] {
  const nyquist = psd.sampleRate / 2;
  return logBins(layout)
    .filter((bin) => bin.center < nyquist)
    .map((bin) => ({
      f: roundTo(bin.center, 2),
      db: roundTo(powerToDb(bandPower(psd, bin.low, bin.high)), 2),
    }));
}
