export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const TREND_WINDOW_DAYS = 30;

export type RiskReasonCode = "frequent" | "growing" | "repeat" | "rca" | "critical" | "insight";

export interface RiskReason {
  code: RiskReasonCode;
  value: number;
}

export interface RiskSignals {
  unplannedRecent: number;
  unplannedPrevious: number;
  repeatMax: number;
  openRca: number;
  criticality: number;
  insightSeverity?: number | null;
  insightScore?: number | null;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: RiskReason[];
}

export interface TrendSource {
  kind: "planned" | "unplanned";
  issuedAt: string;
  status?: string;
}

const MS_PER_DAY = 86_400_000;
const HIGH_THRESHOLD = 60;
const MEDIUM_THRESHOLD = 30;
const INSIGHT_FLOOR: Record<number, number> = { 1: 15, 2: 45, 3: 75 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function levelForScore(score: number): RiskLevel {
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MEDIUM_THRESHOLD) return "medium";
  return "low";
}

export function levelForSeverity(severity: number): RiskLevel {
  if (severity >= 3) return "high";
  if (severity === 2) return "medium";
  return "low";
}

export function unplannedTrend(
  orders: readonly TrendSource[],
  now: Date,
  windowDays = TREND_WINDOW_DAYS,
): { recent: number; previous: number } {
  const nowMs = now.getTime();
  const windowMs = windowDays * MS_PER_DAY;
  return orders.reduce(
    (trend, order) => {
      if (order.kind !== "unplanned" || order.status === "cancelled") return trend;
      const age = nowMs - new Date(order.issuedAt).getTime();
      if (age < 0) return trend;
      if (age <= windowMs) return { ...trend, recent: trend.recent + 1 };
      if (age <= 2 * windowMs) return { ...trend, previous: trend.previous + 1 };
      return trend;
    },
    { recent: 0, previous: 0 },
  );
}

export interface RepeatSource extends TrendSource {
  faultCodeId: string | null;
}

export function repeatCounts(
  orders: readonly RepeatSource[],
  now: Date,
  windowDays: number,
): Map<string, number> {
  const since = now.getTime() - windowDays * MS_PER_DAY;
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.kind !== "unplanned" || order.status === "cancelled" || !order.faultCodeId) continue;
    const issued = new Date(order.issuedAt).getTime();
    if (issued < since || issued > now.getTime()) continue;
    counts.set(order.faultCodeId, (counts.get(order.faultCodeId) ?? 0) + 1);
  }
  return counts;
}

export function maxRepeat(orders: readonly RepeatSource[], now: Date, windowDays: number): number {
  return Math.max(0, ...repeatCounts(orders, now, windowDays).values());
}

export interface RiskInsight {
  id: string;
  kind: string;
  entityId: string;
  severity: number;
  score: number | null;
  summary: string;
  recommendation: string | null;
  createdAt: string;
}

export function isRiskInsightKind(kind: string): boolean {
  return kind.includes("risk");
}

export function latestRiskInsights(insights: readonly RiskInsight[]): Map<string, RiskInsight> {
  const latest = new Map<string, RiskInsight>();
  for (const insight of insights) {
    if (!isRiskInsightKind(insight.kind)) continue;
    const current = latest.get(insight.entityId);
    if (!current || Date.parse(insight.createdAt) > Date.parse(current.createdAt)) {
      latest.set(insight.entityId, insight);
    }
  }
  return latest;
}

export function normalizeInsightScore(value: unknown): number | null {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(clamp(numeric <= 1 ? numeric * 100 : numeric, 0, 100));
}

export function assessRisk(signals: RiskSignals): RiskAssessment {
  const reasons: RiskReason[] = [];
  const frequent = Math.min(40, signals.unplannedRecent * 8);
  if (signals.unplannedRecent > 0) {
    reasons.push({ code: "frequent", value: signals.unplannedRecent });
  }
  const delta = signals.unplannedRecent - signals.unplannedPrevious;
  const trend = delta > 0 ? Math.min(20, delta * 5) : -Math.min(10, Math.abs(delta) * 2);
  if (delta > 0 && signals.unplannedRecent >= 2) {
    reasons.push({ code: "growing", value: delta });
  }
  const repeat = signals.repeatMax >= 3 ? 20 : signals.repeatMax === 2 ? 10 : 0;
  if (repeat > 0) reasons.push({ code: "repeat", value: signals.repeatMax });
  const rca = signals.openRca > 0 ? 10 : 0;
  if (rca > 0) reasons.push({ code: "rca", value: signals.openRca });
  const critical = signals.criticality >= 3 ? 10 : signals.criticality === 2 ? 5 : 0;
  if (signals.criticality >= 3 && frequent + repeat + rca > 0) {
    reasons.push({ code: "critical", value: signals.criticality });
  }
  const computed = clamp(frequent + Math.max(trend, -frequent) + repeat + rca + critical, 0, 100);
  const severity = signals.insightSeverity ?? null;
  const insightFloor = Math.max(
    severity !== null ? (INSIGHT_FLOOR[clamp(Math.round(severity), 1, 3)] ?? 0) : 0,
    signals.insightScore ?? 0,
  );
  if (insightFloor > computed) {
    reasons.unshift({ code: "insight", value: severity ?? 0 });
  }
  const score = Math.round(Math.max(computed, insightFloor));
  return { level: levelForScore(score), score, reasons };
}
