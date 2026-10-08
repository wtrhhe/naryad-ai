import type { AcousticSampleData, DefectBand, DefectKey } from "@/lib/acoustic/types";
import { overallLevel, prominenceAt } from "@/lib/acoustic/spectrum";
import { acousticHealth, defectPeaks, explainedByShaft } from "@/lib/acoustic/health";
import { roundTo } from "@/lib/acoustic/signal";

export const COMPARISON_VERDICTS = [
  "resolved",
  "improved",
  "persists",
  "worsened",
  "no_defect",
  "new_defect",
] as const;

export type ComparisonVerdict = (typeof COMPARISON_VERDICTS)[number];

export type ComparisonRecommendation = "accept" | "monitor" | "rework";

export interface LevelChange {
  f: number;
  label?: string;
  key?: DefectKey;
  harmonic?: number;
  beforeDb: number;
  afterDb: number;
  deltaDb: number;
  beforeProminenceDb: number;
  afterProminenceDb: number;
}

export interface AcousticComparison {
  verdict: ComparisonVerdict;
  recommendation: ComparisonRecommendation;
  target: LevelChange | null;
  bands: LevelChange[];
  peaks: LevelChange[];
  rmsDeltaDb: number | null;
  kurtosisDelta: number | null;
  overallDeltaDb: number | null;
  healthBefore: number;
  healthAfter: number;
}

export const PROMINENT_DB = 10;
export const SIGNIFICANT_DROP_DB = 6;
export const CHANGE_DB = 3;

const RECOMMENDATIONS: Record<ComparisonVerdict, ComparisonRecommendation> = {
  resolved: "accept",
  no_defect: "accept",
  improved: "monitor",
  persists: "rework",
  worsened: "rework",
  new_defect: "rework",
};

type ChangeTag = Pick<LevelChange, "label" | "key" | "harmonic">;

function changeAt(
  before: AcousticSampleData,
  after: AcousticSampleData,
  frequency: number,
  tag: ChangeTag,
): LevelChange | null {
  const was = prominenceAt(before.spectrum, frequency);
  const now = prominenceAt(after.spectrum, frequency);
  if (!was || !now) return null;
  const change: LevelChange = {
    f: roundTo(frequency, 2),
    beforeDb: roundTo(was.levelDb, 2),
    afterDb: roundTo(now.levelDb, 2),
    deltaDb: roundTo(now.levelDb - was.levelDb, 2),
    beforeProminenceDb: roundTo(was.prominenceDb, 2),
    afterProminenceDb: roundTo(now.prominenceDb, 2),
  };
  if (tag.label !== undefined) change.label = tag.label;
  if (tag.key !== undefined) change.key = tag.key;
  if (tag.harmonic !== undefined) change.harmonic = tag.harmonic;
  return change;
}

const present = <T>(value: T | null): value is T => value !== null;

function strongest(
  changes: readonly LevelChange[],
  pick: (change: LevelChange) => number,
): LevelChange | null {
  return changes.reduce<LevelChange | null>(
    (best, change) => (best === null || pick(change) > pick(best) ? change : best),
    null,
  );
}

function commonOverallDelta(before: AcousticSampleData, after: AcousticSampleData): number | null {
  const afterByFrequency = new Map(after.spectrum.map((bin) => [bin.f, bin.db]));
  const shared = before.spectrum.filter((bin) => afterByFrequency.has(bin.f));
  const was = overallLevel(shared);
  const now = overallLevel(
    shared.map((bin) => ({ f: bin.f, db: afterByFrequency.get(bin.f) as number })),
  );
  return was === null || now === null ? null : roundTo(now - was, 2);
}

function classify(target: LevelChange): ComparisonVerdict {
  const drop = -target.deltaDb;
  const remaining = target.afterProminenceDb >= PROMINENT_DB;
  if (drop >= SIGNIFICANT_DROP_DB && !remaining) return "resolved";
  if (drop >= CHANGE_DB) return "improved";
  if (drop <= -CHANGE_DB) return "worsened";
  return "persists";
}

export function compareSamples(
  before: AcousticSampleData,
  after: AcousticSampleData,
  bands: readonly DefectBand[],
): AcousticComparison {
  const bandChanges = bands
    .map((band) =>
      changeAt(before, after, band.frequency, {
        label: band.label,
        key: band.key,
        harmonic: band.harmonic,
      }),
    )
    .filter(present);
  const peakChanges = before.peaks
    .map((peak) => changeAt(before, after, peak.f, { label: peak.label }))
    .filter(present);
  const afterPeakChanges = after.peaks
    .map((peak) => changeAt(before, after, peak.f, { label: peak.label }))
    .filter(present);
  const defectChanges = bandChanges.filter((change) => change.key !== "shaft");
  const attributed = (sample: AcousticSampleData) =>
    defectChanges.filter((change) => !explainedByShaft(sample, change.f));
  const candidates = [...attributed(before), ...defectPeaks(peakChanges, bands)];
  const prominentBefore = candidates.filter((change) => change.beforeProminenceDb >= PROMINENT_DB);
  const strongestBefore = strongest(prominentBefore, (change) => change.beforeProminenceDb);
  const emerging = strongest(
    [...attributed(after), ...defectPeaks(afterPeakChanges, bands)].filter(
      (change) =>
        change.afterProminenceDb >= PROMINENT_DB &&
        change.afterProminenceDb - change.beforeProminenceDb >= CHANGE_DB,
    ),
    (change) => change.afterProminenceDb,
  );
  const verdict: ComparisonVerdict = strongestBefore
    ? classify(strongestBefore)
    : emerging
      ? "new_defect"
      : "no_defect";
  const rmsDeltaDb =
    before.rms > 0 && after.rms > 0 ? roundTo(20 * Math.log10(after.rms / before.rms), 2) : null;
  const kurtosisDelta =
    before.spectralKurtosis !== null && after.spectralKurtosis !== null
      ? roundTo(after.spectralKurtosis - before.spectralKurtosis, 2)
      : null;
  return {
    verdict,
    recommendation: RECOMMENDATIONS[verdict],
    target: strongestBefore ?? emerging,
    bands: bandChanges,
    peaks: peakChanges,
    rmsDeltaDb,
    kurtosisDelta,
    overallDeltaDb: commonOverallDelta(before, after),
    healthBefore: acousticHealth(before, bands).score,
    healthAfter: acousticHealth(after, bands).score,
  };
}
