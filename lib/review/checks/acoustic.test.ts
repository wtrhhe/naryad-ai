import { describe, expect, it } from "vitest";
import { reviewContext } from "@/lib/review/__fixtures__/context";
import { checkAcoustic, latestSample, matchPeak, rmsDeltaDb } from "@/lib/review/checks/acoustic";
import type { ReviewAcousticSample } from "@/lib/review/types";

function sample(overrides: Partial<ReviewAcousticSample> = {}): ReviewAcousticSample {
  return {
    kind: "before",
    rms: 0.09,
    kurtosis: 7.9,
    peaks: [
      { f: 74.55, db: 54.8, label: "BPFO" },
      { f: 24.9, db: 41.3, label: "1x" },
      { f: 143.94, db: 38.76, label: "2xBPFO" },
      { f: 38.61, db: 32.3 },
    ],
    recordedAt: "2026-10-11T07:50:00+05:00",
    ...overrides,
  };
}

const after = (overrides: Partial<ReviewAcousticSample>) =>
  sample({ kind: "after", recordedAt: "2026-10-11T11:05:00+05:00", ...overrides });

describe("acoustic", () => {
  it("skips unless both before and after samples exist", () => {
    expect(checkAcoustic(reviewContext()).status).toBe("skip");
    expect(checkAcoustic(reviewContext({ acoustic: [sample()] })).code).toBe("acoustic_none");
  });

  it("passes when the fault peaks dropped by at least 3 dB", () => {
    const result = checkAcoustic(
      reviewContext({
        acoustic: [
          sample(),
          after({
            rms: 0.02,
            peaks: [
              { f: 74.55, db: 36.8, label: "BPFO" },
              { f: 143.94, db: 30.1, label: "2xBPFO" },
              { f: 24.9, db: 41, label: "1x" },
            ],
          }),
        ],
      }),
    );
    expect(result).toMatchObject({ status: "pass", code: "acoustic_improved" });
    expect(result.values).toEqual({ label: "BPFO", frequency: 74.6, db: 18 });
    expect(result.detail).toBe("Пик BPFO 74,6 Гц снизился на 18 дБ — дефект устранён");
  });

  it("treats a fault peak missing from the after spectrum as removed", () => {
    const result = checkAcoustic(
      reviewContext({
        acoustic: [sample(), after({ peaks: [{ f: 24.9, db: 40, label: "1x" }] })],
      }),
    );
    expect(result.status).toBe("pass");
    expect(result.values.db).toBe(14.8);
  });

  it("warns when a fault peak persists", () => {
    const result = checkAcoustic(
      reviewContext({
        acoustic: [
          sample(),
          after({
            peaks: [
              { f: 74.55, db: 55.7, label: "BPFO" },
              { f: 143.94, db: 30, label: "2xBPFO" },
            ],
          }),
        ],
      }),
    );
    expect(result).toMatchObject({
      status: "warn",
      severity: "medium",
      code: "acoustic_persisting",
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.values).toEqual({ label: "BPFO", frequency: 74.6, db: 0.9 });
  });

  it("falls back to the overall level when no fault peaks were labelled", () => {
    const unlabelled = sample({ peaks: [{ f: 50, db: 40 }] });
    const quieter = checkAcoustic(
      reviewContext({ acoustic: [unlabelled, after({ rms: 0.045, peaks: [] })] }),
    );
    expect(quieter).toMatchObject({ status: "pass", code: "acoustic_rms", values: { db: -6 } });
    const louder = checkAcoustic(
      reviewContext({ acoustic: [unlabelled, after({ rms: 0.18, peaks: [] })] }),
    );
    expect(louder).toMatchObject({ status: "warn", severity: "low" });
    expect(louder.findings[0]?.code).toBe("rms_up");
  });

  it("skips when the overall level cannot be compared", () => {
    const silent = sample({ rms: 0, peaks: [] });
    expect(checkAcoustic(reviewContext({ acoustic: [silent, after({ peaks: [] })] })).status).toBe(
      "skip",
    );
  });

  it("uses the latest sample of each kind", () => {
    const first = sample({ rms: 1, recordedAt: "2026-10-11T07:00:00+05:00" });
    const second = sample({ rms: 2, recordedAt: "2026-10-11T07:30:00+05:00" });
    expect(latestSample([second, first], "before")?.rms).toBe(2);
    expect(latestSample([first], "after")).toBeNull();
  });

  it("computes level change in decibels and matches peaks", () => {
    expect(rmsDeltaDb(sample({ rms: 0.1 }), after({ rms: 0.01 }))).toBeCloseTo(-20);
    expect(matchPeak({ f: 100, db: 1 }, [{ f: 102, db: 2 }])).toEqual({ f: 102, db: 2 });
    expect(matchPeak({ f: 100, db: 1 }, [{ f: 110, db: 2 }])).toBeNull();
  });
});
