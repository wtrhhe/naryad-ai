import type { AcousticKind, AcousticSampleData, DefectBand } from "@/lib/acoustic/types";
import { acousticHealth } from "@/lib/acoustic/health";
import { roundTo } from "@/lib/acoustic/signal";

export interface HealthPoint {
  recordedAt: string;
  score: number;
  kind?: AcousticKind;
}

export type TrendDirection = "improving" | "stable" | "degrading" | "insufficient";

export type RiskLevel = "low" | "medium" | "high";

export interface AcousticTrend {
  points: HealthPoint[];
  slopePerDay: number | null;
  slopePer30Days: number | null;
  r2: number | null;
  currentScore: number | null;
  averageScore: number | null;
  direction: TrendDirection;
  daysToCritical: number | null;
  risk: number;
  riskLevel: RiskLevel;
}

export interface TrendOptions {
  now?: number;
  windowDays?: number;
  criticalScore?: number;
}

export interface Regression {
  slope: number;
  intercept: number;
  r2: number;
}

export interface HistorySample extends AcousticSampleData {
  recordedAt: string;
  kind: AcousticKind;
}

export const CRITICAL_SCORE = 40;
export const TREND_WINDOW_DAYS = 90;
export const MIN_TREND_POINTS = 3;
export const STABLE_SLOPE_PER_30_DAYS = 3;
export const RISK_HEALTH_WEIGHT = 0.7;
export const MAX_TREND_RISK = 30;
const MEDIUM_RISK = 34;
const HIGH_RISK = 67;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30;

export function linearRegression(xs: readonly number[], ys: readonly number[]): Regression | null {
  const count = Math.min(xs.length, ys.length);
  if (count < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < count; index += 1) {
    sumX += xs[index] as number;
    sumY += ys[index] as number;
  }
  const meanX = sumX / count;
  const meanY = sumY / count;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = (xs[index] as number) - meanX;
    const dy = (ys[index] as number) - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0) return null;
  const slope = covariance / varianceX;
  const intercept = meanY - slope * meanX;
  const r2 = varianceY === 0 ? 1 : (covariance * covariance) / (varianceX * varianceY);
  return { slope, intercept, r2 };
}

export function riskLevel(risk: number): RiskLevel {
  if (risk >= HIGH_RISK) return "high";
  if (risk >= MEDIUM_RISK) return "medium";
  return "low";
}

function riskFrom(currentScore: number | null, slopePer30Days: number | null): number {
  if (currentScore === null) return 0;
  const degradation =
    slopePer30Days !== null && slopePer30Days < 0 ? Math.min(MAX_TREND_RISK, -slopePer30Days) : 0;
  return Math.round(
    Math.min(100, Math.max(0, RISK_HEALTH_WEIGHT * (100 - currentScore) + degradation)),
  );
}

export function acousticTrend(
  history: readonly HealthPoint[],
  {
    now = Date.now(),
    windowDays = TREND_WINDOW_DAYS,
    criticalScore = CRITICAL_SCORE,
  }: TrendOptions = {},
): AcousticTrend {
  const since = now - windowDays * MS_PER_DAY;
  const points = history
    .map((point) => ({ point, at: Date.parse(point.recordedAt) }))
    .filter(({ at }) => Number.isFinite(at) && at >= since && at <= now)
    .sort((a, b) => a.at - b.at);
  const scores = points.map(({ point }) => point.score);
  const averageScore =
    scores.length > 0
      ? roundTo(scores.reduce((sum, score) => sum + score, 0) / scores.length, 1)
      : null;
  const latest = scores.at(-1) ?? null;
  const first = points[0]?.at ?? now;
  const regression =
    points.length >= MIN_TREND_POINTS
      ? linearRegression(
          points.map(({ at }) => (at - first) / MS_PER_DAY),
          scores,
        )
      : null;
  if (!regression) {
    const risk = riskFrom(latest, null);
    return {
      points: points.map(({ point }) => point),
      slopePerDay: null,
      slopePer30Days: null,
      r2: null,
      currentScore: latest,
      averageScore,
      direction: "insufficient",
      daysToCritical: latest !== null && latest <= criticalScore ? 0 : null,
      risk,
      riskLevel: riskLevel(risk),
    };
  }
  const lastDay = ((points.at(-1)?.at ?? first) - first) / MS_PER_DAY;
  const fitted = Math.min(100, Math.max(0, regression.intercept + regression.slope * lastDay));
  const slopePer30Days = regression.slope * DAYS_PER_MONTH;
  const direction: TrendDirection =
    slopePer30Days <= -STABLE_SLOPE_PER_30_DAYS
      ? "degrading"
      : slopePer30Days >= STABLE_SLOPE_PER_30_DAYS
        ? "improving"
        : "stable";
  const daysToCritical =
    fitted <= criticalScore
      ? 0
      : regression.slope < 0
        ? Math.round((fitted - criticalScore) / -regression.slope)
        : null;
  const currentScore = Math.round(fitted);
  const risk = riskFrom(currentScore, slopePer30Days);
  return {
    points: points.map(({ point }) => point),
    slopePerDay: roundTo(regression.slope, 3),
    slopePer30Days: roundTo(slopePer30Days, 1),
    r2: roundTo(regression.r2, 3),
    currentScore,
    averageScore,
    direction,
    daysToCritical,
    risk,
    riskLevel: riskLevel(risk),
  };
}

export function healthHistory(
  samples: readonly HistorySample[],
  bands: readonly DefectBand[],
): HealthPoint[] {
  return samples.map((sample) => ({
    recordedAt: sample.recordedAt,
    kind: sample.kind,
    score: acousticHealth(sample, bands).score,
  }));
}

export function buildAcousticTrend(
  samples: readonly HistorySample[],
  bands: readonly DefectBand[],
  options: TrendOptions = {},
): AcousticTrend {
  return acousticTrend(healthHistory(samples, bands), options);
}
