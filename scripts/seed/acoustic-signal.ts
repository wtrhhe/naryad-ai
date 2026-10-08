import { bearingDefectFrequencies } from "./bearing";
import type { BearingSpec } from "./data-equipment";
import type { Rng } from "./random";

export type SpectrumBin = { readonly f: number; readonly db: number };
export type SpectrumPeak = { readonly f: number; readonly db: number; readonly label?: string };

export type AcousticMeasurement = {
  readonly spectrum: readonly SpectrumBin[];
  readonly peaks: readonly SpectrumPeak[];
  readonly rms: number;
  readonly spectralKurtosis: number;
};

export const SAMPLE_RATE_HZ = 48_000;
export const SAMPLE_DURATION_SECONDS = 10;

const BIN_COUNT = 64;
const LOWEST_HZ = 20;
const HIGHEST_HZ = 20_000;
const FLOOR_DB = 34;
const FLOOR_SLOPE_DB_PER_DECADE = 7;
const BIN_NOISE_DB = 1.2;
const LINE_WIDTH_DECADES = 0.035;
const RESONANCE_CENTER_HZ = 3_500;
const RESONANCE_WIDTH_DECADES = 0.25;
const RESONANCE_GAIN_DB = 14;
const MAX_REPORTED_PEAKS = 5;
const LABEL_TOLERANCE_DECADES = 0.03;
const BASE_RMS = 0.012;
const RMS_GAIN = 0.2;
const RMS_SEVERITY_EXPONENT = 1.6;
const HEALTHY_KURTOSIS = 3;
const KURTOSIS_GAIN = 9;
const KURTOSIS_NOISE = 0.35;
const RMS_RELATIVE_NOISE = 0.05;

type DefectLine = { readonly f: number; readonly label: string; readonly amplitudeDb: number };

const roundTo = (value: number, digits: number): number => Number(value.toFixed(digits));
const gaussian = (distance: number, width: number): number =>
  Math.exp(-(distance ** 2) / (2 * width ** 2));
const decades = (f: number, reference: number): number => Math.log10(f / reference);

function defectLines(bearing: BearingSpec, severity: number): DefectLine[] {
  const frequencies = bearingDefectFrequencies(bearing);
  return [
    { f: frequencies.outerRace, label: "BPFO", amplitudeDb: 10 + 26 * severity },
    { f: frequencies.outerRace * 2, label: "2xBPFO", amplitudeDb: 4 + 16 * severity },
    { f: frequencies.innerRace, label: "BPFI", amplitudeDb: 2 + 10 * severity ** 2 },
    { f: frequencies.shaft, label: "1x", amplitudeDb: 6 + 3 * severity },
  ];
}

function binFrequencies(): number[] {
  const span = HIGHEST_HZ / LOWEST_HZ;
  return Array.from(
    { length: BIN_COUNT },
    (_, index) => LOWEST_HZ * span ** (index / (BIN_COUNT - 1)),
  );
}

function binLevel(f: number, lines: readonly DefectLine[], severity: number, rng: Rng): number {
  const floor = FLOOR_DB - FLOOR_SLOPE_DB_PER_DECADE * decades(f, LOWEST_HZ);
  const resonance =
    severity *
    RESONANCE_GAIN_DB *
    gaussian(decades(f, RESONANCE_CENTER_HZ), RESONANCE_WIDTH_DECADES);
  const linesLevel = lines.reduce(
    (sum, line) => sum + line.amplitudeDb * gaussian(decades(f, line.f), LINE_WIDTH_DECADES),
    0,
  );
  return floor + resonance + linesLevel + rng.normal(0, BIN_NOISE_DB);
}

function labelFor(f: number, lines: readonly DefectLine[]): string | undefined {
  return lines.find((line) => Math.abs(decades(f, line.f)) <= LABEL_TOLERANCE_DECADES)?.label;
}

function findPeaks(spectrum: readonly SpectrumBin[], lines: readonly DefectLine[]): SpectrumPeak[] {
  return spectrum
    .filter((bin, index) => {
      const left = spectrum[index - 1];
      const right = spectrum[index + 1];
      return (left === undefined || bin.db > left.db) && (right === undefined || bin.db > right.db);
    })
    .sort((a, b) => b.db - a.db)
    .slice(0, MAX_REPORTED_PEAKS)
    .map((bin) => {
      const label = labelFor(bin.f, lines);
      return label === undefined ? { f: bin.f, db: bin.db } : { f: bin.f, db: bin.db, label };
    });
}

export function synthesizeMeasurement(
  bearing: BearingSpec,
  severity: number,
  rng: Rng,
): AcousticMeasurement {
  const lines = defectLines(bearing, severity);
  const spectrum = binFrequencies().map((f) => ({
    f: roundTo(f, 2),
    db: roundTo(binLevel(f, lines, severity, rng), 2),
  }));
  const rms =
    (BASE_RMS + RMS_GAIN * severity ** RMS_SEVERITY_EXPONENT) *
    (1 + rng.normal(0, RMS_RELATIVE_NOISE));
  const spectralKurtosis =
    HEALTHY_KURTOSIS + KURTOSIS_GAIN * severity + rng.normal(0, KURTOSIS_NOISE);
  return {
    spectrum,
    peaks: findPeaks(spectrum, lines),
    rms: roundTo(Math.max(rms, 0.001), 6),
    spectralKurtosis: roundTo(spectralKurtosis, 4),
  };
}
