import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import { round } from "@/lib/review/checks/result";
import { lateMinutes, standardHoursOf, workSeconds } from "@/lib/review/checks/time";
import {
  CHECK_KEYS,
  CHECK_SEVERITIES,
  CHECK_STATUSES,
  FINDING_CODES,
  LEGACY_CHECK_KEYS,
  REVIEW_VERDICTS,
  SUMMARY_CODES,
  type CheckFinding,
  type CheckKey,
  type CheckSeverity,
  type CheckStatus,
  type CheckValues,
  type LegacyCheckKey,
  type OrderEvent,
  type ReviewVerdict,
  type SummaryCode,
} from "@/lib/review/types";

export type AiReviewRow = Database["public"]["Tables"]["ai_reviews"]["Row"];

export type KnownCheckKey = CheckKey | LegacyCheckKey;

export interface ReviewCheckView {
  key: string;
  knownKey: KnownCheckKey | null;
  label: string;
  status: CheckStatus;
  severity: CheckSeverity;
  code: SummaryCode | null;
  values: CheckValues;
  findings: CheckFinding[];
  detail: string;
}

export interface MasterDecisionView {
  masterId: string | null;
  verdict: ReviewVerdict | null;
  score: number | null;
  rating: number | null;
  comment: string | null;
  decidedAt: string;
  changed: boolean;
}

export interface ReviewView {
  id: string;
  revision: number;
  verdict: ReviewVerdict | null;
  score: number | null;
  rating: number | null;
  confidence: number | null;
  needsMasterReview: boolean;
  usedLlm: boolean;
  model: string | null;
  createdAt: string;
  checks: ReviewCheckView[];
  strengths: string[];
  improvements: string[];
  workerExplanation: string | null;
  masterExplanation: string | null;
  master: MasterDecisionView | null;
}

export interface ReviewTiming {
  actualHours: number | null;
  standardHours: number | null;
  percent: number | null;
  dueAt: string | null;
  doneAt: string | null;
  lateMinutes: number | null;
}

export interface OrderReviewData {
  orderId: string;
  status: WorkOrderStatus;
  revision: number;
  timing: ReviewTiming;
  review: ReviewView | null;
  history: ReviewView[];
  pending: boolean;
}

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([...CHECK_KEYS, ...LEGACY_CHECK_KEYS]);
const checkValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const valuesSchema = z.record(z.string(), checkValue).catch({});

const findingSchema = z.object({
  code: z.enum(FINDING_CODES),
  status: z.enum(["warn", "fail"]),
  severity: z.enum(CHECK_SEVERITIES).catch("low"),
  values: valuesSchema,
});

const storedCheckSchema = z.object({
  key: z.string(),
  label: z.string().catch(""),
  status: z.enum(CHECK_STATUSES).optional().catch(undefined),
  passed: z.boolean().optional().catch(undefined),
  severity: z.enum(CHECK_SEVERITIES).optional().catch(undefined),
  code: z.enum(SUMMARY_CODES).optional().catch(undefined),
  values: valuesSchema.optional(),
  findings: z.array(z.unknown()).optional().catch(undefined),
  detail: z.string().catch(""),
});

function parseFindings(items: readonly unknown[] | undefined): CheckFinding[] {
  return (items ?? []).flatMap((item) => {
    const parsed = findingSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function toCheckView(raw: unknown): ReviewCheckView | null {
  const parsed = storedCheckSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const check = parsed.data;
  const status: CheckStatus = check.status ?? (check.passed === false ? "fail" : "pass");
  return {
    key: check.key,
    knownKey: KNOWN_KEYS.has(check.key) ? (check.key as KnownCheckKey) : null,
    label: check.label,
    status,
    severity: check.severity ?? (status === "fail" ? "high" : "none"),
    code: check.code ?? null,
    values: check.values ?? {},
    findings: parseFindings(check.findings),
    detail: check.detail,
  };
}

export function toChecksView(raw: unknown): ReviewCheckView[] {
  return Array.isArray(raw)
    ? raw.map(toCheckView).filter((check): check is ReviewCheckView => check !== null)
    : [];
}

const verdictSchema = z.enum(REVIEW_VERDICTS).nullable().catch(null);

function toMasterView(row: AiReviewRow): MasterDecisionView | null {
  if (!row.master_decided_at) {
    return null;
  }
  return {
    masterId: row.master_id,
    verdict: verdictSchema.parse(row.master_verdict),
    score: row.master_score,
    rating: row.master_rating,
    comment: row.master_comment,
    decidedAt: row.master_decided_at,
    changed:
      (row.master_score !== null && row.master_score !== row.score) ||
      (row.master_verdict !== null && row.master_verdict !== row.verdict),
  };
}

export function toReviewView(row: AiReviewRow): ReviewView {
  return {
    id: row.id,
    revision: row.revision,
    verdict: verdictSchema.parse(row.verdict),
    score: row.score,
    rating: row.rating,
    confidence: row.confidence === null ? null : Number(row.confidence),
    needsMasterReview: row.needs_master_review,
    usedLlm: row.used_llm,
    model: row.model,
    createdAt: row.created_at,
    checks: toChecksView(row.checks),
    strengths: row.strengths,
    improvements: row.improvements,
    workerExplanation: row.worker_explanation,
    masterExplanation: row.master_explanation,
    master: toMasterView(row),
  };
}

export interface TimingOrderRow {
  standard_hours: number | null;
  due_at: string | null;
  started_at: string | null;
  done_at: string | null;
  paused_seconds: number;
  fault_code: { standard_hours: number } | null;
}

export function toTiming(order: TimingOrderRow, events: readonly OrderEvent[]): ReviewTiming {
  const seconds = workSeconds({
    startedAt: order.started_at,
    doneAt: order.done_at,
    pausedSeconds: order.paused_seconds,
    events,
  });
  const standard = standardHoursOf(
    { standardHours: order.standard_hours === null ? null : Number(order.standard_hours) },
    order.fault_code ? { standardHours: Number(order.fault_code.standard_hours) } : null,
  );
  const hours = seconds === null ? null : seconds / 3600;
  return {
    actualHours: hours === null ? null : round(hours, 1),
    standardHours: standard,
    percent: hours === null || standard === null ? null : Math.round((hours / standard) * 100),
    dueAt: order.due_at,
    doneAt: order.done_at,
    lateMinutes: lateMinutes(order.due_at, order.done_at),
  };
}

export const REVIEWABLE_STATUSES: readonly WorkOrderStatus[] = ["done", "ai_review"];

export function toOrderReviewData(
  order: TimingOrderRow & { id: string; status: WorkOrderStatus; rework_count: number },
  reviews: readonly AiReviewRow[],
  events: readonly OrderEvent[],
): OrderReviewData {
  const history = [...reviews]
    .sort((left, right) => right.revision - left.revision)
    .map(toReviewView);
  const latest = history[0] ?? null;
  return {
    orderId: order.id,
    status: order.status,
    revision: order.rework_count,
    timing: toTiming(order, events),
    review: latest,
    history,
    pending:
      REVIEWABLE_STATUSES.includes(order.status) &&
      (latest === null || latest.revision < order.rework_count),
  };
}

export function effectiveScore(review: ReviewView): number | null {
  return review.master?.score ?? review.score;
}

export function effectiveVerdict(review: ReviewView): ReviewVerdict | null {
  return review.master?.verdict ?? review.verdict;
}
