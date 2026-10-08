import { z } from "zod";

export const INSIGHT_KINDS = [
  "failure_risk",
  "problem_equipment",
  "repeat_fault",
  "post_maintenance_failure",
  "worker_repeat_failures",
  "brigade_repeat_failures",
  "material_overuse",
  "shift_effect",
  "problem_site",
] as const;

export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const INSIGHT_ENTITY_TYPES = [
  "equipment",
  "site",
  "employee",
  "brigade",
  "shift",
  "material",
] as const;

export type InsightEntityType = (typeof INSIGHT_ENTITY_TYPES)[number];

export type Severity = 1 | 2 | 3;

export const CHIP_UNITS = [
  "count",
  "percent",
  "hours",
  "money",
  "ratio",
  "number",
  "days",
  "score",
  "pvalue",
  "db",
] as const;

export type ChipUnit = (typeof CHIP_UNITS)[number];

export const CHIP_KEYS = [
  "unplanned",
  "peerRatio",
  "faultShare",
  "downtimeHours",
  "downtimeCost",
  "costShare",
  "occurrences",
  "spanDays",
  "expected",
  "pValue",
  "followed",
  "medianGap",
  "baseline",
  "repeatRate",
  "teamRate",
  "zScore",
  "overuse",
  "excessCost",
  "orders",
  "riskScore",
  "peakSlope",
  "kurtosis",
  "share",
  "expectedShare",
  "forecast",
] as const;

export type ChipKey = (typeof CHIP_KEYS)[number];

export const chipSchema = z.object({
  key: z.enum(CHIP_KEYS),
  value: z.number().finite(),
  unit: z.enum(CHIP_UNITS),
});

export type InsightChip = z.infer<typeof chipSchema>;

const label = z.string().min(1).max(200);
const count = z.number().int().min(0);
const value = z.number().finite();
const faultCategory = z.enum(["mechanical", "electrical", "hydraulic", "pneumatic", "lubrication"]);

export const SHIFT_DIMENSIONS = ["period", "crew", "time_of_day"] as const;
export const MATERIAL_DIMENSIONS = [
  "site_period",
  "site",
  "period",
  "crew",
  "worker",
  "brigade",
  "fault",
] as const;
export const RISK_FACTORS = ["acoustic", "frequency", "trend"] as const;
export const RCA_STATES = ["none", "created", "open", "in_progress"] as const;

export const PARAM_SCHEMAS = {
  failure_risk: z.object({
    equipment: label,
    score: value,
    level: z.enum(["high", "elevated", "moderate"]),
    acoustic: z
      .object({
        peakSlope: value,
        kurtosisFrom: value,
        kurtosisTo: value,
        samples: count,
      })
      .nullable(),
    unplanned30: count,
    peerRatio: value,
    trendPer30: value.nullable(),
    expectedNext30: value,
    topFaultCode: z.string().nullable(),
    topFaultName: z.string().nullable(),
    topFaultCategory: faultCategory.nullable(),
    factors: z.array(z.enum(RISK_FACTORS)),
  }),
  problem_equipment: z.object({
    equipment: label,
    unplanned: count,
    days: count,
    peerMedian: value,
    peerRatio: value,
    topFaultCode: z.string().nullable(),
    topFaultName: z.string().nullable(),
    topFaultCount: count,
    topFaultCategory: faultCategory.nullable(),
    downtimeHours: value,
    downtimeCost: value,
  }),
  repeat_fault: z.object({
    equipment: label,
    faultCode: label,
    faultName: label,
    faultCategory: faultCategory.nullable(),
    occurrences: count,
    spanDays: value,
    minGapDays: value,
    maxGapDays: value,
    expected: value,
    rcaState: z.enum(RCA_STATES),
  }),
  post_maintenance_failure: z.object({
    equipment: label,
    maintenances: count,
    followed: count,
    medianGapDays: value,
    baselinePercent: value,
    topFaultCode: z.string().nullable(),
    topFaultName: z.string().nullable(),
    topFaultCategory: faultCategory.nullable(),
  }),
  worker_repeat_failures: z.object({
    worker: label,
    personnelNumber: z.string(),
    repairs: count,
    repeats: count,
    rate: value,
    teamRate: value,
    z: value,
  }),
  brigade_repeat_failures: z.object({
    brigade: label,
    repairs: count,
    repeats: count,
    rate: value,
    teamRate: value,
    z: value,
  }),
  material_overuse: z.object({
    dimension: z.enum(MATERIAL_DIMENSIONS),
    site: z.string().nullable(),
    period: z.enum(["day", "night"]).nullable(),
    crew: z.string().nullable(),
    worker: z.string().nullable(),
    brigade: z.string().nullable(),
    faultCode: z.string().nullable(),
    faultName: z.string().nullable(),
    orders: count,
    overusePercent: value,
    vsRestPercent: value,
    excessCost: value,
    topMaterial: z.string().nullable(),
    topMaterialPercent: value.nullable(),
    z: value,
  }),
  shift_effect: z.object({
    measure: z.enum(["failure_share", "repeat_rate"]),
    dimension: z.enum(SHIFT_DIMENSIONS),
    group: label,
    count,
    total: count,
    share: value,
    expectedShare: value,
    z: value,
  }),
  problem_site: z.object({
    site: label,
    unplanned: count,
    days: count,
    downtimeHours: value,
    downtimeCost: value,
    costShare: value,
    rateRatio: value,
    rateSignificant: z.boolean(),
    topEquipment: z.array(label).max(3),
  }),
} satisfies Record<InsightKind, z.ZodType>;

export type InsightParams = { [K in InsightKind]: z.infer<(typeof PARAM_SCHEMAS)[K]> };

export type MaterialDimension = (typeof MATERIAL_DIMENSIONS)[number];
export type ShiftDimension = (typeof SHIFT_DIMENSIONS)[number];
export type RcaState = (typeof RCA_STATES)[number];

export interface InsightOf<K extends InsightKind> {
  kind: K;
  entityType: InsightEntityType | null;
  entityId: string | null;
  severity: Severity;
  significance: number;
  siteId: string | null;
  equipmentId: string | null;
  faultCodeId: string | null;
  relatedOrderIds: string[];
  rcaCaseId: string | null;
  params: InsightParams[K];
  chips: InsightChip[];
  stats: Record<string, number | null>;
}

export type Insight = { [K in InsightKind]: InsightOf<K> }[InsightKind];

export type InsightText = { summary: string; recommendation: string };

export function parseInsightParams<K extends InsightKind>(
  kind: K,
  params: unknown,
): InsightParams[K] | null {
  const parsed = PARAM_SCHEMAS[kind].safeParse(params);
  return parsed.success ? (parsed.data as InsightParams[K]) : null;
}

export function isInsightKind(value: unknown): value is InsightKind {
  return typeof value === "string" && (INSIGHT_KINDS as readonly string[]).includes(value);
}

export function chip(key: ChipKey, value: number, unit: ChipUnit): InsightChip {
  return { key, value: Number.isFinite(value) ? value : 0, unit };
}
