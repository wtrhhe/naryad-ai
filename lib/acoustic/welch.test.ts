import { describe, expect, it } from "vitest";
import { chooseSegmentSize, totalPower, welch } from "@/lib/acoustic/welch";
import { synthesize } from "@/lib/acoustic/synth";

const RATE = 8_192;

function sine(frequency: number, amplitude: number, seconds: number, rate = RATE): Float64Array {
  return Float64Array.from(
    { length: Math.round(seconds * rate) },
    (_, n) => amplitude * Math.sin((2 * Math.PI * frequency * n) / rate),
  );
}

describe("chooseSegmentSize", () => {
  it("targets about 1.5 Hz resolution for long recordings", () => {
    expect(chooseSegmentSize(480_000, 48_000)).toBe(32_768);
    expect(chooseSegmentSize(176_400, 22_050)).toBe(16_384);
  });

  it("keeps at least eight overlapping segments for short recordings", () => {
    const size = chooseSegmentSize(48_000, 48_000);
    expect(size).toBe(8_192);
    expect(Math.floor((48_000 - size) / (size / 2)) + 1).toBeGreaterThanOrEqual(8);
  });

  it("never drops below 256 samples", () => {
    expect(chooseSegmentSize(300, 48_000)).toBe(256);
  });
});

describe("welch", () => {
  it("uses 50% overlapping segments", () => {
    const psd = welch(new Float64Array(4_096), RATE, { segmentSize: 1_024 });
    expect(psd.segmentCount).toBe(7);
    expect(psd.resolution).toBe(8);
    expect(psd.density.length).toBe(513);
  });

  it("supports a custom overlap", () => {
    const psd = welch(new Float64Array(4_096), RATE, { segmentSize: 1_024, overlap: 0 });
    expect(psd.segmentCount).toBe(4);
  });

  it("estimates a flat density for white noise and preserves its power", () => {
    const noise = synthesize({ sampleRate: RATE, durationSeconds: 20, seed: 4, noiseRms: 0.1 });
    const psd = welch(noise, RATE, { segmentSize: 512 });
    const expected = 0.01 / (RATE / 2);
    const inner = Array.from(psd.density.slice(10, 240));
    const average = inner.reduce((sum, value) => sum + value, 0) / inner.length;
    expect(average / expected).toBeGreaterThan(0.95);
    expect(average / expected).toBeLessThan(1.05);
    expect(totalPower(psd)).toBeCloseTo(0.01, 3);
  });

  it("puts a sine at its frequency with power A²/2", () => {
    const psd = welch(sine(1_000, 0.4, 4), RATE, { segmentSize: 2_048 });
    let peak = 0;
    psd.density.forEach((value, index) => {
      if (value > (psd.density[peak] as number)) peak = index;
    });
    expect(peak * psd.resolution).toBeCloseTo(1_000, 0);
    expect(totalPower(psd)).toBeCloseTo(0.08, 3);
  });

  it("removes the DC offset of each segment", () => {
    const plain = sine(500, 0.2, 2);
    const shifted = plain.map((value) => value + 0.5);
    const reference = welch(plain, RATE, { segmentSize: 1_024 });
    const psd = welch(shifted, RATE, { segmentSize: 1_024 });
    expect(psd.density[0]).toBeCloseTo(reference.density[0] as number, 10);
    expect(psd.density[0]).toBeLessThan(1e-6);
    expect(totalPower(psd)).toBeCloseTo(0.02, 3);
  });

  it("picks a segment size automatically", () => {
    const psd = welch(new Float64Array(RATE * 10), RATE);
    expect(psd.segmentSize).toBe(8_192);
    expect(psd.segmentCount).toBe(19);
  });

  it("rejects invalid input", () => {
    expect(() => welch(new Float64Array(100), RATE, { segmentSize: 256 })).toThrow(RangeError);
    expect(() => welch(new Float64Array(1_024), RATE, { segmentSize: 300 })).toThrow(RangeError);
    expect(() => welch(new Float64Array(1_024), RATE, { segmentSize: 256, overlap: 1 })).toThrow(
      RangeError,
    );
    expect(() => welch(new Float64Array(1_024), 0, { segmentSize: 256 })).toThrow(RangeError);
  });
});
