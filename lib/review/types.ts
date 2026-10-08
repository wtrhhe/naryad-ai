import type { Database } from "@/lib/supabase/database.types";

export type ReviewVerdict = Database["public"]["Enums"]["review_verdict"];
export type FaultCategory = Database["public"]["Enums"]["fault_category"];
export type WorkOrderKind = Database["public"]["Enums"]["work_order_type"];
export type PhotoKind = Database["public"]["Enums"]["photo_kind"];

export const REVIEW_VERDICTS = ["accepted", "accepted_with_remarks", "rework"] as const;

export const CHECK_KEYS = [
  "completeness",
  "material_norms",
  "material_category",
  "time",
  "photos",
  "lockout",
  "acoustic",
] as const;

export type CheckKey = (typeof CHECK_KEYS)[number];

export const LEGACY_CHECK_KEYS = [
  "before_photos",
  "after_photos",
  "ghost",
  "work_description",
  "materials",
] as const;

export type LegacyCheckKey = (typeof LEGACY_CHECK_KEYS)[number];

export const CHECK_STATUSES = ["pass", "warn", "fail", "skip"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHECK_SEVERITIES = ["none", "low", "medium", "high"] as const;
export type CheckSeverity = (typeof CHECK_SEVERITIES)[number];

export const SUMMARY_CODES = [
  "completeness_ok",
  "completeness_issues",
  "materials_none",
  "materials_ok",
  "materials_over",
  "materials_no_norm",
  "category_skip",
  "category_none",
  "category_ok",
  "category_mismatch",
  "time_unknown",
  "time_actual",
  "time_no_standard",
  "photos_none",
  "photos_ok",
  "photos_issues",
  "lockout_not_required",
  "lockout_ok",
  "lockout_missing",
  "acoustic_none",
  "acoustic_improved",
  "acoustic_persisting",
  "acoustic_rms",
] as const;

export type SummaryCode = (typeof SUMMARY_CODES)[number];

export const FINDING_CODES = [
  "no_work",
  "short_work",
  "no_fault_code",
  "no_materials",
  "no_after_photo",
  "over_max",
  "over_median",
  "category_mismatch",
  "over_standard",
  "too_fast",
  "overdue",
  "no_after",
  "outside_window",
  "low_alignment",
  "low_alignment_forced",
  "same_as_before",
  "duplicate",
  "lockout_missing",
  "lockout_late",
  "peak_persisting",
  "rms_up",
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

export type CheckValue = string | number | boolean | null;
export type CheckValues = Record<string, CheckValue>;

export interface CheckFinding {
  code: FindingCode;
  status: "warn" | "fail";
  severity: CheckSeverity;
  values: CheckValues;
}

export interface CheckResult {
  key: CheckKey;
  label: string;
  status: CheckStatus;
  passed: boolean;
  severity: CheckSeverity;
  code: SummaryCode;
  values: CheckValues;
  findings: CheckFinding[];
  detail: string;
}

export interface ReviewSettings {
  materialOverusePercent: number;
  lowConfidenceThreshold: number;
  ghostMinAlignment: number;
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  materialOverusePercent: 25,
  lowConfidenceThreshold: 0.6,
  ghostMinAlignment: 0.7,
};

export interface ReviewOrder {
  id: string;
  number: number;
  kind: WorkOrderKind;
  description: string;
  workPerformed: string | null;
  closeComment: string | null;
  faultCodeId: string | null;
  standardHours: number | null;
  dueAt: string | null;
  startedAt: string | null;
  doneAt: string | null;
  pausedSeconds: number;
  reworkCount: number;
}

export interface ReviewFaultCode {
  id: string;
  code: string;
  name: string;
  category: FaultCategory;
  standardHours: number;
}

export interface MaterialNorm {
  min: number;
  typical: number;
  max: number;
}

export interface ReviewMaterialLine {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  categories: FaultCategory[];
  norm: MaterialNorm | null;
  historyMedian: number | null;
  historyCount: number;
}

export interface RequiredMaterial {
  materialId: string;
  name: string;
  min: number;
}

export interface ReviewPhoto {
  id: string;
  kind: PhotoKind;
  takenAt: string | null;
  receivedAt: string;
  phash: string | null;
  ghostScore: number | null;
  forcedReason: string | null;
}

export interface PhotoMatch {
  photoId: string;
  matchPhotoId: string;
  matchOrderId: string;
  matchOrderNumber: number | null;
  distance: number;
}

export interface ReviewLockout {
  lockedAt: string;
  releasedAt: string | null;
}

export interface AcousticPeak {
  f: number;
  db: number;
  label?: string;
}

export interface ReviewAcousticSample {
  kind: "before" | "after";
  rms: number;
  kurtosis: number | null;
  peaks: AcousticPeak[];
  recordedAt: string;
}

export interface OrderEvent {
  action: string;
  occurredAt: string;
}

export interface ReviewEquipment {
  name: string;
  type: string;
  requiresLockout: boolean;
}

export interface ReviewContext {
  order: ReviewOrder;
  equipment: ReviewEquipment;
  faultCode: ReviewFaultCode | null;
  materials: ReviewMaterialLine[];
  requiredMaterials: RequiredMaterial[];
  photos: ReviewPhoto[];
  photoMatches: PhotoMatch[];
  lockouts: ReviewLockout[];
  acoustic: ReviewAcousticSample[];
  events: OrderEvent[];
}

export interface RulesOutcome {
  score: number;
  verdict: ReviewVerdict;
  rating: number;
  hasFail: boolean;
}

export interface FinalReview {
  verdict: ReviewVerdict;
  score: number;
  rating: number;
  confidence: number | null;
  needsMasterReview: boolean;
  usedLlm: boolean;
  model: string | null;
  strengths: string[];
  improvements: string[];
  workerExplanation: string;
  masterExplanation: string;
  problemMatchesWork: boolean | null;
  notes: string | null;
}
