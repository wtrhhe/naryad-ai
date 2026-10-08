import { describe, expect, it } from "vitest";
import { detectPeaks, toStoredPeaks } from "@/lib/acoustic/peaks";
import { welch } from "@/lib/acoustic/welch";
import { powerToDb } from "@/lib/acoustic/bins";
import { defectBands } from "@/lib/acoustic/bearing";
import { synthesize } from "@/lib/acoustic/synth";

const RATE = 22_050;
const k3 = {
  rpm: 1480,
  bearing: {
    rpm: 1480,
    rollingElements: 8,
    ballDiameterMm: 22.225,
    pitchDiameterMm: 96.5,
    contactAngleDeg: 0,
  },
};

function tones(
  list: readonly { frequency: number; amplitude: number }[],
  noiseRms = 0.01,
  seconds = 8,
) {
  return synthesize({
    sampleRate: RATE,
    durationSeconds: seconds,
    seed: 21,
    noiseRms,
    tones: list.map((tone) => ({ ...tone, phase: 0 })),
  });
}

describe("detectPeaks", () => {
  it("locates tones with sub-bin accuracy and reports their power", () => {
    const psd = welch(
      tones([
        { frequency: 87, amplitude: 0.1 },
        { frequency: 1_234.5, amplitude: 0.05 },
      ]),
      RATE,
    );
    const peaks = detectPeaks(psd);
    expect(peaks).toHaveLength(2);
    const [first, second] = peaks;
    expect(first?.f).toBeCloseTo(87, 0);
    expect(Math.abs((first?.f ?? 0) - 87)).toBeLessThan(0.3);
    expect(first?.db).toBeCloseTo(powerToDb(0.005), 0);
    expect(Math.abs((second?.f ?? 0) - 1_234.5)).toBeLessThan(0.3);
    expect(second?.db).toBeCloseTo(powerToDb(0.00125), 0);
    expect(first?.prominenceDb).toBeGreaterThan(30);
  });

  it("finds nothing in plain noise", () => {
    expect(detectPeaks(welch(tones([], 0.05), RATE))).toEqual([]);
  });

  it("labels peaks that sit on defect frequencies", () => {
    const bands = defectBands(k3);
    const psd = welch(
      tones([
        { frequency: 75.94, amplitude: 0.05 },
        { frequency: 151.88, amplitude: 0.03 },
        { frequency: 24.67, amplitude: 0.03 },
        { frequency: 600, amplitude: 0.03 },
      ]),
      RATE,
    );
    const labels = Object.fromEntries(
      detectPeaks(psd, { bands }).map((peak) => [Math.round(peak.f), peak.label]),
    );
    expect(labels).toEqual({ 76: "BPFO", 152: "2xBPFO", 25: "1x", 600: undefined });
  });

  it("keeps the most prominent peaks and sorts them by level", () => {
    const list = [100, 200, 300, 400, 500, 700, 900].map((frequency, index) => ({
      frequency,
      amplitude: 0.01 * (index + 1),
    }));
    const peaks = detectPeaks(welch(tones(list), RATE), { maxPeaks: 3 });
    expect(peaks).toHaveLength(3);
    expect(peaks.map((peak) => Math.round(peak.f))).toEqual([900, 700, 500]);
    const levels = peaks.map((peak) => peak.db);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
  });

  it("honours the frequency range and the prominence threshold", () => {
    const psd = welch(
      tones([
        { frequency: 50, amplitude: 0.05 },
        { frequency: 5_000, amplitude: 0.002 },
      ]),
      RATE,
    );
    expect(detectPeaks(psd, { minHz: 100 }).map((peak) => Math.round(peak.f))).toEqual([5_000]);
    expect(detectPeaks(psd, { minProminenceDb: 25 }).map((peak) => Math.round(peak.f))).toEqual([
      50,
    ]);
  });
});

describe("toStoredPeaks", () => {
  it("keeps only the seed-compatible fields", () => {
    expect(
      toStoredPeaks([
        { f: 76, db: 60, prominenceDb: 30, label: "BPFO" },
        { f: 600, db: 50, prominenceDb: 20 },
      ]),
    ).toEqual([
      { f: 76, db: 60, label: "BPFO" },
      { f: 600, db: 50 },
    ]);
  });
});
