import { describe, expect, it } from "vitest";
import { bearingDefectFrequencies } from "./bearing";
import { synthesizeMeasurement } from "./acoustic-signal";
import { createRng } from "./random";

const motorBearing = {
  rpm: 1480,
  rollingElements: 8,
  ballDiameterMm: 22.225,
  pitchDiameterMm: 96.5,
  contactAngleDeg: 0,
};

describe("bearingDefectFrequencies", () => {
  it("computes shaft, outer race, inner race, ball and cage frequencies", () => {
    const frequencies = bearingDefectFrequencies(motorBearing);
    expect(frequencies.shaft).toBeCloseTo(24.667, 2);
    expect(frequencies.outerRace).toBeCloseTo(75.94, 1);
    expect(frequencies.innerRace).toBeCloseTo(121.4, 1);
    expect(frequencies.ball).toBeCloseTo(50.71, 1);
    expect(frequencies.cage).toBeCloseTo(9.49, 1);
  });

  it("accounts for the contact angle", () => {
    const straight = bearingDefectFrequencies(motorBearing);
    const angled = bearingDefectFrequencies({ ...motorBearing, contactAngleDeg: 40 });
    expect(angled.outerRace).toBeGreaterThan(straight.outerRace);
    expect(angled.innerRace).toBeLessThan(straight.innerRace);
  });

  it("keeps outer plus inner race frequency equal to the rolling element count times shaft speed", () => {
    const frequencies = bearingDefectFrequencies(motorBearing);
    expect(frequencies.outerRace + frequencies.innerRace).toBeCloseTo(
      motorBearing.rollingElements * frequencies.shaft,
      6,
    );
  });
});

describe("synthesizeMeasurement", () => {
  const measure = (severity: number, seed: number) =>
    synthesizeMeasurement(motorBearing, severity, createRng(seed));
  const maxDb = (severity: number) => {
    const values = Array.from({ length: 30 }, (_, index) =>
      Math.max(...measure(severity, index).spectrum.map((bin) => bin.db)),
    );
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  it("builds log-spaced bins from 20 Hz to 20 kHz", () => {
    const { spectrum } = measure(0.3, 1);
    expect(spectrum.length).toBe(64);
    expect(spectrum[0]?.f).toBeCloseTo(20, 1);
    expect(spectrum.at(-1)?.f).toBeCloseTo(20_000, 0);
    const ratios = spectrum.slice(1).map((bin, index) => bin.f / (spectrum[index]?.f as number));
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.01);
  });

  it("raises the peak level, kurtosis and rms with severity", () => {
    expect(maxDb(0.85)).toBeGreaterThan(maxDb(0.12) + 12);
    const average = (severity: number, pick: (m: ReturnType<typeof measure>) => number) =>
      Array.from({ length: 30 }, (_, index) => pick(measure(severity, index))).reduce(
        (sum, value) => sum + value,
        0,
      ) / 30;
    expect(average(0.85, (m) => m.spectralKurtosis)).toBeGreaterThan(
      average(0.12, (m) => m.spectralKurtosis) + 4,
    );
    expect(average(0.85, (m) => m.rms)).toBeGreaterThan(average(0.12, (m) => m.rms) * 2);
  });

  it("reports at most five peaks sorted by level and labels the outer race line when worn", () => {
    const { peaks } = measure(0.85, 3);
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks.length).toBeLessThanOrEqual(5);
    const levels = peaks.map((peak) => peak.db);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(peaks.some((peak) => peak.label === "BPFO")).toBe(true);
  });

  it("is deterministic for the same stream", () => {
    expect(measure(0.5, 9)).toEqual(measure(0.5, 9));
  });
});
