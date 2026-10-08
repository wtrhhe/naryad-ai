import {
  failureCountsByEquipment,
  isFailure,
  peerDailyRate,
  topBy,
  type AnalysisContext,
} from "@/lib/analytics/dataset";
import { chip, type InsightOf } from "@/lib/analytics/insight";
import { MS_PER_DAY, clamp, linearRegression, mean, median, round } from "@/lib/analytics/stats";
import type { AcousticFact, EquipmentInfo } from "@/lib/analytics/types";

export const RISK_WEIGHTS = { acoustic: 0.45, frequency: 0.35, trend: 0.2 } as const;
export const RISK_REPORT_MIN = 40;
export const RISK_HIGH = 70;
export const RISK_ELEVATED = 55;
export const ACOUSTIC_MIN_SAMPLES = 6;
export const ACOUSTIC_MIN_T = 3;
export const PEAK_SLOPE_FULL_DB = 4;
export const KURTOSIS_SLOPE_FULL = 1.5;
export const KURTOSIS_EXCESS_FULL = 4;
export const RECENT_DAYS = 30;
export const TREND_CHANGE_FULL = 1.5;

export interface AcousticTrend {
  samples: number;
  peakSlope30: number;
  kurtosisSlope30: number;
  kurtosisFrom: number;
  kurtosisTo: number;
  score: number;
}

export interface RiskAssessment {
  equipment: EquipmentInfo;
  score: number;
  components: { acoustic: number; frequency: number; trend: number };
  acoustic: AcousticTrend | null;
  unplanned30: number;
  peerRatio: number;
  trendPer30: number | null;
  expectedNext30: number;
  topFaultCodeId: string | null;
}

export function acousticTrend(
  samples: readonly AcousticFact[],
  since: number,
  fleetKurtosis: number,
): AcousticTrend | null {
  const usable = samples
    .filter((sample) => sample.peakDb !== null && sample.kurtosis !== null)
    .sort((a, b) => a.recordedAt - b.recordedAt);
  if (usable.length < ACOUSTIC_MIN_SAMPLES) return null;
  const x = (sample: AcousticFact) => (sample.recordedAt - since) / MS_PER_DAY;
  const peakFit = linearRegression(
    usable.map((sample) => ({ x: x(sample), y: sample.peakDb as number })),
  );
  const kurtosisFit = linearRegression(
    usable.map((sample) => ({ x: x(sample), y: sample.kurtosis as number })),
  );
  const peakSlope30 = peakFit.slope * 30;
  const kurtosisSlope30 = kurtosisFit.slope * 30;
  const peakScore =
    peakFit.slopeT >= ACOUSTIC_MIN_T ? clamp(peakSlope30 / PEAK_SLOPE_FULL_DB, 0, 1) : 0;
  const kurtosisScore =
    kurtosisFit.slopeT >= ACOUSTIC_MIN_T ? clamp(kurtosisSlope30 / KURTOSIS_SLOPE_FULL, 0, 1) : 0;
  const trending = kurtosisFit.slopeT >= ACOUSTIC_MIN_T;
  const first = usable[0] as AcousticFact;
  const last = usable.at(-1) as AcousticFact;
  const kurtosisTo = trending
    ? kurtosisFit.intercept + kurtosisFit.slope * x(last)
    : mean(usable.slice(-3).map((sample) => sample.kurtosis as number));
  const kurtosisFrom = trending
    ? kurtosisFit.intercept + kurtosisFit.slope * x(first)
    : mean(usable.slice(0, 3).map((sample) => sample.kurtosis as number));
  const levelScore = clamp((kurtosisTo - fleetKurtosis) / KURTOSIS_EXCESS_FULL, 0, 1);
  return {
    samples: usable.length,
    peakSlope30: round(peakSlope30, 1),
    kurtosisSlope30: round(kurtosisSlope30, 2),
    kurtosisFrom: round(kurtosisFrom, 1),
    kurtosisTo: round(kurtosisTo, 1),
    score: 0.6 * Math.max(peakScore, kurtosisScore) + 0.4 * levelScore,
  };
}

export function assessFailureRisk(context: AnalysisContext): RiskAssessment[] {
  const { dataset } = context;
  const failures = dataset.orders.filter(isFailure);
  const historyCounts = failureCountsByEquipment(dataset.orders, dataset.since, dataset.now);
  const recentFrom = dataset.now - RECENT_DAYS * MS_PER_DAY;
  const fleetKurtosis = median(
    dataset.acoustic.flatMap((sample) => (sample.kurtosis === null ? [] : [sample.kurtosis])),
  );
  const weeks = Math.max(2, Math.floor(context.historyDays / 7));
  return dataset.equipment.map((equipment) => {
    const own = failures.filter((order) => order.equipmentId === equipment.id);
    const unplanned30 = own.filter((order) => order.issuedAt >= recentFrom).length;
    const expected30 = Math.max(peerDailyRate(context, equipment, historyCounts) * RECENT_DAYS, 1);
    const peerRatio = unplanned30 / expected30;
    const frequency = unplanned30 >= 3 ? clamp((peerRatio - 1) / 1.5, 0, 1) : 0;
    const weekly = Array.from({ length: weeks }, (_, week) => {
      const end = dataset.now - (weeks - 1 - week) * 7 * MS_PER_DAY;
      return {
        x: week,
        y: own.filter((order) => order.issuedAt > end - 7 * MS_PER_DAY && order.issuedAt <= end)
          .length,
      };
    });
    const fit = linearRegression(weekly);
    const slopePer30 = (fit.slope * 30) / 7;
    const relativeChange =
      (fit.slope * (weeks - 1)) / Math.max(mean(weekly.map((point) => point.y)), 0.5);
    const trending = fit.slopeT >= 2 && fit.slope > 0;
    const trend = trending ? clamp(relativeChange / TREND_CHANGE_FULL, 0, 1) : 0;
    const acoustic = acousticTrend(
      dataset.acoustic.filter((sample) => sample.equipmentId === equipment.id),
      dataset.since,
      fleetKurtosis,
    );
    const acousticScore = acoustic?.score ?? 0;
    const score = Math.round(
      100 *
        (RISK_WEIGHTS.acoustic * acousticScore +
          RISK_WEIGHTS.frequency * frequency +
          RISK_WEIGHTS.trend * trend),
    );
    return {
      equipment,
      score,
      components: { acoustic: acousticScore, frequency, trend },
      acoustic,
      unplanned30,
      peerRatio: round(peerRatio, 1),
      trendPer30: trending ? round(slopePer30, 1) : null,
      expectedNext30: round(Math.max(0, unplanned30 + (trending ? slopePer30 : 0)), 1),
      topFaultCodeId: topBy(own, (order) => order.faultCodeId).key,
    };
  });
}

export function riskLevel(score: number): "high" | "elevated" | "moderate" {
  return score >= RISK_HIGH ? "high" : score >= RISK_ELEVATED ? "elevated" : "moderate";
}

export function findFailureRisks(context: AnalysisContext): InsightOf<"failure_risk">[] {
  return assessFailureRisk(context).flatMap((risk) => {
    if (risk.score < RISK_REPORT_MIN) return [];
    const level = riskLevel(risk.score);
    const fault = risk.topFaultCodeId ? context.index.faults.get(risk.topFaultCodeId) : undefined;
    const factors = (["acoustic", "frequency", "trend"] as const).filter(
      (factor) => risk.components[factor] >= 0.25,
    );
    return [
      {
        kind: "failure_risk" as const,
        entityType: "equipment" as const,
        entityId: risk.equipment.id,
        severity: level === "high" ? 3 : level === "elevated" ? 2 : 1,
        significance: round(risk.score / 5, 1),
        siteId: risk.equipment.siteId,
        equipmentId: risk.equipment.id,
        faultCodeId: fault?.id ?? null,
        relatedOrderIds: [],
        rcaCaseId: null,
        params: {
          equipment: risk.equipment.name,
          score: risk.score,
          level,
          acoustic:
            risk.acoustic && risk.components.acoustic > 0
              ? {
                  peakSlope: risk.acoustic.peakSlope30,
                  kurtosisFrom: risk.acoustic.kurtosisFrom,
                  kurtosisTo: risk.acoustic.kurtosisTo,
                  samples: risk.acoustic.samples,
                }
              : null,
          unplanned30: risk.unplanned30,
          peerRatio: risk.peerRatio,
          trendPer30: risk.trendPer30,
          expectedNext30: risk.expectedNext30,
          topFaultCode: fault?.code ?? null,
          topFaultName: fault?.name ?? null,
          topFaultCategory: fault?.category ?? null,
          factors,
        },
        chips: [
          chip("riskScore", risk.score, "score"),
          ...(risk.acoustic && risk.components.acoustic > 0
            ? [
                chip("peakSlope", risk.acoustic.peakSlope30, "db"),
                chip("kurtosis", risk.acoustic.kurtosisTo, "number"),
              ]
            : []),
          chip("unplanned", risk.unplanned30, "count"),
          chip("peerRatio", risk.peerRatio, "ratio"),
          chip("forecast", risk.expectedNext30, "number"),
        ],
        stats: {
          acoustic: round(risk.components.acoustic, 3),
          frequency: round(risk.components.frequency, 3),
          trend: round(risk.components.trend, 3),
        },
      },
    ];
  });
}
