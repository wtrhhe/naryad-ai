import { buildCheck, finding, round, skipCheck } from "@/lib/review/checks/result";
import type {
  AcousticPeak,
  CheckResult,
  ReviewAcousticSample,
  ReviewContext,
} from "@/lib/review/types";

export const ACOUSTIC_IMPROVED_DB = 3;
export const ACOUSTIC_WORSE_DB = 3;
export const PEAK_FREQUENCY_TOLERANCE = 0.03;
const FAULT_LABEL = /BPFO|BPFI|BSF|FTF/i;

export function latestSample(
  samples: readonly ReviewAcousticSample[],
  kind: ReviewAcousticSample["kind"],
): ReviewAcousticSample | null {
  return samples
    .filter((sample) => sample.kind === kind)
    .reduce<ReviewAcousticSample | null>(
      (latest, sample) =>
        latest === null || Date.parse(sample.recordedAt) >= Date.parse(latest.recordedAt)
          ? sample
          : latest,
      null,
    );
}

export function rmsDeltaDb(
  before: ReviewAcousticSample,
  after: ReviewAcousticSample,
): number | null {
  if (before.rms <= 0 || after.rms <= 0) {
    return null;
  }
  return 20 * Math.log10(after.rms / before.rms);
}

export function matchPeak(peak: AcousticPeak, peaks: readonly AcousticPeak[]): AcousticPeak | null {
  const byLabel = peak.label
    ? peaks.find((candidate) => candidate.label === peak.label)
    : undefined;
  if (byLabel) {
    return byLabel;
  }
  return (
    peaks.find(
      (candidate) => Math.abs(candidate.f - peak.f) / peak.f <= PEAK_FREQUENCY_TOLERANCE,
    ) ?? null
  );
}

interface PeakChange {
  peak: AcousticPeak;
  delta: number;
}

function peakChanges(before: ReviewAcousticSample, after: ReviewAcousticSample): PeakChange[] {
  const floor = after.peaks.length > 0 ? Math.min(...after.peaks.map((peak) => peak.db)) : null;
  return before.peaks
    .filter((peak) => peak.label !== undefined && FAULT_LABEL.test(peak.label) && peak.f > 0)
    .sort((left, right) => right.db - left.db)
    .map((peak) => {
      const matched = matchPeak(peak, after.peaks);
      if (matched) {
        return { peak, delta: matched.db - peak.db };
      }
      const drop =
        floor === null ? ACOUSTIC_IMPROVED_DB : Math.max(ACOUSTIC_IMPROVED_DB, peak.db - floor);
      return { peak, delta: -drop };
    });
}

function peakValues(change: PeakChange, db: number) {
  return { label: change.peak.label ?? "", frequency: round(change.peak.f, 1), db: round(db, 1) };
}

export function checkAcoustic(context: ReviewContext): CheckResult {
  const before = latestSample(context.acoustic, "before");
  const after = latestSample(context.acoustic, "after");
  if (!before || !after) {
    return skipCheck("acoustic", "acoustic_none");
  }
  const changes = peakChanges(before, after);
  const main = changes[0];
  if (main) {
    const persisting = changes
      .filter((change) => change.delta > -ACOUSTIC_IMPROVED_DB)
      .sort((left, right) => right.delta - left.delta);
    const worst = persisting[0];
    if (!worst) {
      return buildCheck("acoustic", "acoustic_improved", peakValues(main, -main.delta), []);
    }
    return buildCheck(
      "acoustic",
      "acoustic_persisting",
      peakValues(worst, worst.delta),
      persisting.map((change) =>
        finding("peak_persisting", "warn", "medium", peakValues(change, change.delta)),
      ),
    );
  }
  const rms = rmsDeltaDb(before, after);
  if (rms === null) {
    return skipCheck("acoustic", "acoustic_none");
  }
  return buildCheck(
    "acoustic",
    "acoustic_rms",
    { db: round(rms, 1) },
    rms >= ACOUSTIC_WORSE_DB ? [finding("rms_up", "warn", "low", { db: round(rms, 1) })] : [],
  );
}
