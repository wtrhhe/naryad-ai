import { describe, expect, it } from "vitest";
import { clippingRatio, mean, median, rms, roundTo } from "@/lib/acoustic/signal";

describe("signal statistics", () => {
  it("computes the mean", () => {
    expect(mean([1, 2, 3, 6])).toBe(3);
    expect(mean([])).toBe(0);
  });

  it("computes the RMS of a sine as amplitude over root two", () => {
    const sine = Array.from(
      { length: 48_000 },
      (_, n) => 0.5 * Math.sin((2 * Math.PI * 440 * n) / 48_000),
    );
    expect(rms(sine)).toBeCloseTo(0.5 / Math.SQRT2, 4);
  });

  it("removes the DC offset before computing RMS", () => {
    const sine = Array.from(
      { length: 4_800 },
      (_, n) => 0.3 + 0.2 * Math.sin((2 * Math.PI * n) / 48),
    );
    expect(rms(sine)).toBeCloseTo(0.2 / Math.SQRT2, 4);
    expect(rms([0.7, 0.7, 0.7])).toBeCloseTo(0, 12);
    expect(rms([])).toBe(0);
  });

  it("measures the share of clipped samples", () => {
    expect(clippingRatio([1, -1, 0.5, 0])).toBe(0.5);
    expect(clippingRatio([0.9, 0.95], 0.9)).toBe(1);
    expect(clippingRatio([])).toBe(0);
  });

  it("finds the median of odd and even sets", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it("rounds to a number of digits", () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
    expect(roundTo(-2.5551, 3)).toBe(-2.555);
    expect(roundTo(12.5, 0)).toBe(13);
  });
});
