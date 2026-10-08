import type { AcousticSampleData, DefectBand } from "@/lib/acoustic/types";
import { nearestBinIndex, prominenceAt } from "@/lib/acoustic/spectrum";
import { roundTo } from "@/lib/acoustic/signal";

export interface DominantComponent {
  f: number;
  label?: string;
  prominenceDb: number;
}

export interface AcousticHealth {
  score: number;
  defectProminenceDb: number;
  kurtosis: number | null;
  dominant: DominantComponent | null;
}

export const PROMINENCE_FREE_DB = 10;
export const PROMINENCE_FULL_DB = 35;
export const KURTOSIS_FREE = 3.5;
export const KURTOSIS_FULL = 11.5;
export const PROMINENCE_WEIGHT = 0.6;
export const KURTOSIS_WEIGHT = 0.4;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const SHAFT_LABEL = /^\d+x$/;
const SHAFT_LEAKAGE_BINS = 1;

export function isShaftLabel(label: string | undefined): boolean {
  return label !== undefined && SHAFT_LABEL.test(label);
}

export function bearingBands(bands: readonly DefectBand[]): DefectBand[] {
  return bands.filter((band) => band.key !== "shaft");
}

export function defectPeaks<T extends { label?: string }>(
  peaks: readonly T[],
  bands: readonly DefectBand[],
): T[] {
  return bearingBands(bands).length > 0
    ? peaks.filter((peak) => peak.label !== undefined && !isShaftLabel(peak.label))
    : peaks.filter((peak) => !isShaftLabel(peak.label));
}

export function explainedByShaft(
  sample: Pick<AcousticSampleData, "spectrum" | "peaks">,
  frequency: number,
): boolean {
  const index = nearestBinIndex(sample.spectrum, frequency);
  if (index < 0) return false;
  const located = sample.peaks.map((peak) => ({
    label: peak.label,
    offset: Math.abs(nearestBinIndex(sample.spectrum, peak.f) - index),
  }));
  return (
    located.some((peak) => peak.offset <= SHAFT_LEAKAGE_BINS && isShaftLabel(peak.label)) &&
    !located.some(
      (peak) => peak.offset === 0 && peak.label !== undefined && !isShaftLabel(peak.label),
    )
  );
}

export function dominantComponent(
  sample: Pick<AcousticSampleData, "spectrum" | "peaks">,
  bands: readonly DefectBand[],
): DominantComponent | null {
  const defectBands = bearingBands(bands);
  const targets =
    defectBands.length > 0
      ? defectBands
          .filter((band) => !explainedByShaft(sample, band.frequency))
          .map((band) => ({ f: band.frequency, label: band.label }))
      : defectPeaks(sample.peaks, bands).map((peak) => ({ f: peak.f, label: peak.label }));
  let best: DominantComponent | null = null;
  for (const target of targets) {
    const measured = prominenceAt(sample.spectrum, target.f);
    if (!measured) continue;
    if (best === null || measured.prominenceDb > best.prominenceDb) {
      best = {
        f: roundTo(target.f, 2),
        prominenceDb: roundTo(measured.prominenceDb, 2),
        ...(target.label === undefined ? {} : { label: target.label }),
      };
    }
  }
  return best;
}

export function acousticHealth(
  sample: AcousticSampleData,
  bands: readonly DefectBand[],
): AcousticHealth {
  const dominant = dominantComponent(sample, bands);
  const prominence = Math.max(0, dominant?.prominenceDb ?? 0);
  const prominencePenalty = clamp01(
    (prominence - PROMINENCE_FREE_DB) / (PROMINENCE_FULL_DB - PROMINENCE_FREE_DB),
  );
  const kurtosis =
    sample.spectralKurtosis !== null && Number.isFinite(sample.spectralKurtosis)
      ? sample.spectralKurtosis
      : null;
  const penalty =
    kurtosis === null
      ? prominencePenalty
      : PROMINENCE_WEIGHT * prominencePenalty +
        KURTOSIS_WEIGHT * clamp01((kurtosis - KURTOSIS_FREE) / (KURTOSIS_FULL - KURTOSIS_FREE));
  return {
    score: Math.round(100 * (1 - penalty)),
    defectProminenceDb: roundTo(prominence, 2),
    kurtosis,
    dominant,
  };
}
