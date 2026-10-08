import { createContext } from "@/lib/analytics/dataset";
import { findProblemEquipment, findProblemSite } from "@/lib/analytics/equipment";
import type { Insight, InsightKind } from "@/lib/analytics/insight";
import { findPostMaintenanceFailures } from "@/lib/analytics/maintenance";
import { findMaterialOveruse } from "@/lib/analytics/materials";
import { findRepeatRateEffects } from "@/lib/analytics/people";
import { findRepeatFaults } from "@/lib/analytics/repeats";
import { findFailureRisks } from "@/lib/analytics/risk";
import { findShiftFailureEffects } from "@/lib/analytics/shifts";
import type { AnalysisWindow, AnalyticsDataset } from "@/lib/analytics/types";

export const ANALYSIS_WINDOWS = [30, 90] as const;
export type AnalysisWindowDays = (typeof ANALYSIS_WINDOWS)[number];
export const DEFAULT_WINDOW_DAYS: AnalysisWindowDays = 90;
export const MAX_INSIGHTS = 14;

export const MAX_PER_KIND: Readonly<Record<InsightKind, number>> = {
  failure_risk: 3,
  problem_equipment: 3,
  repeat_fault: 3,
  post_maintenance_failure: 3,
  worker_repeat_failures: 3,
  brigade_repeat_failures: 2,
  material_overuse: 3,
  shift_effect: 2,
  problem_site: 1,
};

export interface AnalysisResult {
  window: AnalysisWindow;
  insights: Insight[];
  found: number;
}

export function rankInsights(insights: readonly Insight[]): Insight[] {
  return [...insights].sort((a, b) => b.severity - a.severity || b.significance - a.significance);
}

export function capInsights(insights: readonly Insight[], maxInsights = MAX_INSIGHTS): Insight[] {
  const perKind = new Map<InsightKind, number>();
  const kept: Insight[] = [];
  for (const insight of rankInsights(insights)) {
    const used = perKind.get(insight.kind) ?? 0;
    if (used >= MAX_PER_KIND[insight.kind] || kept.length >= maxInsights) continue;
    perKind.set(insight.kind, used + 1);
    kept.push(insight);
  }
  return kept;
}

export function analyzeDataset(
  dataset: AnalyticsDataset,
  options: { windowDays: number; maxInsights?: number },
): AnalysisResult {
  const context = createContext(dataset, options.windowDays);
  const all: Insight[] = [
    ...findFailureRisks(context),
    ...findProblemEquipment(context),
    ...findRepeatFaults(context),
    ...findPostMaintenanceFailures(context),
    ...findRepeatRateEffects(context),
    ...findMaterialOveruse(context),
    ...findShiftFailureEffects(context),
    ...findProblemSite(context),
  ];
  return {
    window: context.window,
    insights: capInsights(all, options.maxInsights),
    found: all.length,
  };
}
