import { describe, expect, it } from "vitest";
import {
  binomialUpperTail,
  clamp,
  linearRegression,
  mean,
  median,
  normalUpperTail,
  oneProportionZ,
  poissonUpperTail,
  round,
  significanceOfP,
  significanceOfZ,
  sum,
  twoProportionZ,
  variance,
  welchZ,
} from "@/lib/analytics/stats";

describe("descriptive statistics", () => {
  it("handles empty and small samples", () => {
    expect(sum([])).toBe(0);
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(variance([5])).toBe(0);
  });

  it("computes mean, median and sample variance", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.571, 3);
  });

  it("clamps and rounds", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(round(3.14159, 2)).toBe(3.14);
  });
});

describe("distributions", () => {
  it("matches known normal tail values", () => {
    expect(normalUpperTail(0)).toBeCloseTo(0.5, 6);
    expect(normalUpperTail(1.96)).toBeCloseTo(0.025, 4);
    expect(normalUpperTail(-1.96)).toBeCloseTo(0.975, 4);
    expect(normalUpperTail(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalUpperTail(8)).toBeGreaterThan(0);
    expect(normalUpperTail(8)).toBeLessThan(1e-14);
  });

  it("computes poisson tails on both sides of the mean", () => {
    expect(poissonUpperTail(0, 3)).toBe(1);
    expect(poissonUpperTail(3, 0)).toBe(0);
    expect(poissonUpperTail(1, 2)).toBeCloseTo(1 - Math.exp(-2), 10);
    expect(poissonUpperTail(4, 1)).toBeCloseTo(0.01899, 4);
    expect(poissonUpperTail(14, 5.67)).toBeLessThan(0.005);
    expect(poissonUpperTail(48, 17)).toBeLessThan(1e-9);
  });

  it("computes binomial tails", () => {
    expect(binomialUpperTail(0, 5, 0.3)).toBe(1);
    expect(binomialUpperTail(6, 5, 0.3)).toBe(0);
    expect(binomialUpperTail(5, 5, 0.5)).toBeCloseTo(1 / 32, 10);
    expect(binomialUpperTail(2, 2, 0)).toBe(0);
    expect(binomialUpperTail(2, 2, 1)).toBe(1);
    expect(binomialUpperTail(3, 10, 0.2)).toBeCloseTo(0.3222, 3);
  });
});

describe("tests", () => {
  it("compares two proportions", () => {
    expect(twoProportionZ(26, 32, 52, 300)).toBeGreaterThan(7);
    expect(twoProportionZ(5, 10, 50, 100)).toBeCloseTo(0, 6);
    expect(twoProportionZ(0, 0, 1, 2)).toBe(0);
    expect(twoProportionZ(0, 10, 0, 10)).toBe(0);
  });

  it("tests a proportion against an expected share", () => {
    expect(oneProportionZ(60, 100, 0.5)).toBeCloseTo(2, 6);
    expect(oneProportionZ(1, 0, 0.5)).toBe(0);
    expect(oneProportionZ(1, 10, 1)).toBe(0);
  });

  it("compares means with unequal variances", () => {
    expect(welchZ([1.4, 1.5, 1.3, 1.45], [1, 1.02, 0.98, 1.01, 0.99])).toBeGreaterThan(8);
    expect(welchZ([1], [1, 2])).toBe(0);
    expect(welchZ([1, 1], [1, 1])).toBe(0);
  });

  it("converts p values and z scores to significance", () => {
    expect(significanceOfP(0.001)).toBe(3);
    expect(significanceOfP(0)).toBe(50);
    expect(significanceOfZ(0)).toBeCloseTo(0.3, 1);
  });
});

describe("linearRegression", () => {
  it("fits a perfect line", () => {
    const fit = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ]);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fit.slopeT).toBeGreaterThan(1000);
  });

  it("reports a weak noisy slope with a small t statistic", () => {
    const fit = linearRegression(
      [3, 5, 4, 6, 3, 5, 4, 5].map((y, x) => ({
        x,
        y,
      })),
    );
    expect(Math.abs(fit.slopeT)).toBeLessThan(2);
  });

  it("degrades gracefully on tiny or flat inputs", () => {
    expect(linearRegression([])).toMatchObject({ n: 0, slope: 0 });
    expect(linearRegression([{ x: 1, y: 2 }])).toMatchObject({ intercept: 2, slopeT: 0 });
    expect(
      linearRegression([
        { x: 1, y: 2 },
        { x: 1, y: 3 },
      ]),
    ).toMatchObject({ slope: 0, intercept: 2.5 });
    expect(
      linearRegression([
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toMatchObject({ slope: 1, slopeT: 0 });
    expect(
      linearRegression([
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ]),
    ).toMatchObject({ slope: 0, slopeT: 0, r2: 0 });
  });
});
