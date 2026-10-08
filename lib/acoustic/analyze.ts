import type { AcousticSampleData, DefectBand, Kinematics } from "@/lib/acoustic/types";
import { binSpectrum, SPECTRUM_MAX_HZ } from "@/lib/acoustic/bins";
import { defectBands } from "@/lib/acoustic/bearing";
import { welch } from "@/lib/acoustic/welch";
import { detectPeaks, toStoredPeaks, type DetectedPeak } from "@/lib/acoustic/peaks";
import { spectralKurtosis } from "@/lib/acoustic/kurtosis";
import { clippingRatio, rms, roundTo } from "@/lib/acoustic/signal";
import { acousticHealth, type AcousticHealth } from "@/lib/acoustic/health";

export interface AnalysisRequest {
  samples: ArrayLike<number>;
  sampleRate: number;
  kinematics?: Kinematics | null;
}

export interface AcousticAnalysis extends AcousticSampleData {
  spectralKurtosis: number;
  sampleRate: number;
  durationSeconds: number;
  bands: DefectBand[];
  peakDetails: DetectedPeak[];
  health: AcousticHealth;
  clipping: number;
  silent: boolean;
}

export interface SampleColumns {
  spectrum: AcousticSampleData["spectrum"];
  peaks: AcousticSampleData["peaks"];
  rms: number;
  spectral_kurtosis: number;
  sample_rate: number;
  duration_seconds: number;
}

export type AnalysisErrorCode = "invalid_rate" | "too_short";

export class AcousticAnalysisError extends Error {
  constructor(readonly code: AnalysisErrorCode) {
    super(`acoustic analysis failed: ${code}`);
    this.name = "AcousticAnalysisError";
  }
}

export const MIN_SAMPLE_RATE = 8_000;
export const MAX_SAMPLE_RATE = 192_000;
export const MIN_ANALYSIS_SECONDS = 1;
export const SILENCE_RMS = 1e-4;
const NO_KINEMATICS: Kinematics = { rpm: null, bearing: null };

export function analyzeSignal({
  samples,
  sampleRate,
  kinematics,
}: AnalysisRequest): AcousticAnalysis {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < MIN_SAMPLE_RATE ||
    sampleRate > MAX_SAMPLE_RATE
  ) {
    throw new AcousticAnalysisError("invalid_rate");
  }
  if (samples.length < sampleRate * MIN_ANALYSIS_SECONDS) {
    throw new AcousticAnalysisError("too_short");
  }
  const maxHz = Math.min(SPECTRUM_MAX_HZ, sampleRate / 2);
  const bands = defectBands(kinematics ?? NO_KINEMATICS, { maxHz });
  const psd = welch(samples, sampleRate);
  const peakDetails = detectPeaks(psd, { bands, maxHz });
  const level = rms(samples);
  const data = {
    spectrum: binSpectrum(psd),
    peaks: toStoredPeaks(peakDetails),
    rms: roundTo(level, 6),
    spectralKurtosis: roundTo(spectralKurtosis(samples, sampleRate, { maxHz }), 4),
  };
  return {
    ...data,
    sampleRate,
    durationSeconds: roundTo(samples.length / sampleRate, 2),
    bands,
    peakDetails,
    health: acousticHealth(data, bands),
    clipping: roundTo(clippingRatio(samples), 4),
    silent: level < SILENCE_RMS,
  };
}

export function toSampleColumns(analysis: AcousticAnalysis): SampleColumns {
  return {
    spectrum: analysis.spectrum,
    peaks: analysis.peaks,
    rms: analysis.rms,
    spectral_kurtosis: analysis.spectralKurtosis,
    sample_rate: Math.round(analysis.sampleRate),
    duration_seconds: analysis.durationSeconds,
  };
}
