import { describe, expect, it } from "vitest";
import {
  GAUSSIAN_KURTOSIS,
  kurtosisSegmentSize,
  spectralKurtosis,
  spectralKurtosisProfile,
} from "@/lib/acoustic/kurtosis";
import { synthesize } from "@/lib/acoustic/synth";

const RATE = 22_050;

describe("kurtosisSegmentSize", () => {
  it("uses windows of about four milliseconds", () => {
    expect(kurtosisSegmentSize(48_000)).toBe(256);
    expect(kurtosisSegmentSize(22_050)).toBe(128);
    expect(kurtosisSegmentSize(8_000)).toBe(64);
    expect(kurtosisSegmentSize(192_000)).toBe(1_024);
  });
});

describe("spectralKurtosis", () => {
  it("reads about 3 for stationary Gaussian noise", () => {
    const noise = synthesize({ sampleRate: RATE, durationSeconds: 8, seed: 13, noiseRms: 0.05 });
    expect(spectralKurtosis(noise, RATE)).toBeCloseTo(GAUSSIAN_KURTOSIS, 0);
    expect(Math.abs(spectralKurtosis(noise, RATE) - GAUSSIAN_KURTOSIS)).toBeLessThan(0.3);
  });

  it("drops to about -1 excess at a pure tone line", () => {
    const tone = Float64Array.from(
      { length: RATE * 4 },
      (_, n) => 0.3 * Math.sin((2 * Math.PI * 1_722.65625 * n) / RATE),
    );
    const profile = spectralKurtosisProfile(tone, RATE);
    const line = Math.round(1_722.65625 / profile.resolution);
    expect(profile.values[line]).toBeCloseTo(-1, 1);
  });

  it("rises well above 3 for a train of bearing impacts", () => {
    const impacts = synthesize({
      sampleRate: RATE,
      durationSeconds: 8,
      seed: 17,
      noiseRms: 0.02,
      impulses: [
        { rateHz: 76, resonanceHz: 3_500, amplitude: 0.3, decaySeconds: 0.0006, spread: 0.35 },
      ],
    });
    expect(spectralKurtosis(impacts, RATE)).toBeGreaterThan(5);
  });

  it("only searches inside the requested band", () => {
    const impacts = synthesize({
      sampleRate: RATE,
      durationSeconds: 4,
      seed: 19,
      noiseRms: 0.02,
      impulses: [{ rateHz: 50, resonanceHz: 6_000, amplitude: 0.4, decaySeconds: 0.0004 }],
    });
    const full = spectralKurtosis(impacts, RATE);
    const low = spectralKurtosis(impacts, RATE, { maxHz: 1_500 });
    expect(full).toBeGreaterThan(low + 1);
  });

  it("treats silence as zero excess and rejects short or malformed input", () => {
    expect(spectralKurtosis(new Float64Array(RATE), RATE)).toBe(GAUSSIAN_KURTOSIS);
    expect(() => spectralKurtosisProfile(new Float64Array(500), RATE)).toThrow(RangeError);
    expect(() => spectralKurtosisProfile(new Float64Array(RATE), RATE, 100)).toThrow(RangeError);
  });

  it("returns the Gaussian baseline when the band holds no lines", () => {
    const noise = synthesize({ sampleRate: RATE, durationSeconds: 2, seed: 2, noiseRms: 0.05 });
    expect(spectralKurtosis(noise, RATE, { minHz: 9_000, maxHz: 9_001 })).toBe(GAUSSIAN_KURTOSIS);
  });
});
