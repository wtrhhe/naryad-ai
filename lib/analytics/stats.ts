export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const polynomial =
    -z * z -
    1.26551223 +
    t *
      (1.00002368 +
        t *
          (0.37409196 +
            t *
              (0.09678418 +
                t *
                  (-0.18628806 +
                    t *
                      (0.27886807 +
                        t *
                          (-1.13520398 +
                            t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const result = t * Math.exp(polynomial);
  return x >= 0 ? result : 2 - result;
}

export function normalUpperTail(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 0 : 1;
  return clamp(0.5 * erfc(z / Math.SQRT2), 0, 1);
}

function logFactorial(n: number): number {
  let total = 0;
  for (let value = 2; value <= n; value += 1) total += Math.log(value);
  return total;
}

export function poissonUpperTail(k: number, lambda: number): number {
  if (k <= 0) return 1;
  if (lambda <= 0) return 0;
  if (k <= lambda) {
    let term = Math.exp(-lambda);
    let cumulative = term;
    for (let index = 1; index < k; index += 1) {
      term *= lambda / index;
      cumulative += term;
    }
    return clamp(1 - cumulative, 0, 1);
  }
  let term = Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
  let total = 0;
  for (let index = k; index < k + 2000; index += 1) {
    total += term;
    term *= lambda / (index + 1);
    if (term <= total * 1e-15) break;
  }
  return clamp(total, 0, 1);
}

export function binomialUpperTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const logP = Math.log(p);
  const logQ = Math.log(1 - p);
  const logFactorialN = logFactorial(n);
  let total = 0;
  for (let index = k; index <= n; index += 1) {
    total += Math.exp(
      logFactorialN -
        logFactorial(index) -
        logFactorial(n - index) +
        index * logP +
        (n - index) * logQ,
    );
  }
  return clamp(total, 0, 1);
}

export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const pooled = (x1 + x2) / (n1 + n2);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (standardError === 0) return 0;
  return (x1 / n1 - x2 / n2) / standardError;
}

export function oneProportionZ(x: number, n: number, p0: number): number {
  if (n === 0 || p0 <= 0 || p0 >= 1) return 0;
  return (x / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
}

export function welchZ(group: readonly number[], rest: readonly number[]): number {
  if (group.length < 2 || rest.length < 2) return 0;
  const standardError = Math.sqrt(variance(group) / group.length + variance(rest) / rest.length);
  if (standardError === 0) return 0;
  return (mean(group) - mean(rest)) / standardError;
}

export interface Regression {
  n: number;
  slope: number;
  intercept: number;
  r2: number;
  slopeT: number;
}

export function linearRegression(points: ReadonlyArray<{ x: number; y: number }>): Regression {
  const n = points.length;
  if (n < 2) {
    return { n, slope: 0, intercept: points[0]?.y ?? 0, r2: 0, slopeT: 0 };
  }
  const meanX = mean(points.map((point) => point.x));
  const meanY = mean(points.map((point) => point.y));
  const sxx = sum(points.map((point) => (point.x - meanX) ** 2));
  const sxy = sum(points.map((point) => (point.x - meanX) * (point.y - meanY)));
  const syy = sum(points.map((point) => (point.y - meanY) ** 2));
  if (sxx === 0) return { n, slope: 0, intercept: meanY, r2: 0, slopeT: 0 };
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const residual = sum(points.map((point) => (point.y - (intercept + slope * point.x)) ** 2));
  const r2 = syy === 0 ? 0 : clamp(1 - residual / syy, 0, 1);
  if (n < 3) return { n, slope, intercept, r2, slopeT: 0 };
  const standardError = Math.sqrt(residual / (n - 2) / sxx);
  const slopeT =
    standardError === 0 ? (slope === 0 ? 0 : Math.sign(slope) * 1e6) : slope / standardError;
  return { n, slope, intercept, r2, slopeT };
}

export function significanceOfP(p: number): number {
  return round(clamp(-Math.log10(Math.max(p, 1e-300)), 0, 50), 2);
}

export function significanceOfZ(z: number): number {
  return significanceOfP(normalUpperTail(z));
}
