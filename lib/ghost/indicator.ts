export const FRAME_INTERVAL_MS = 300;
export const SCORE_SMOOTHING = 0.6;
export const ALIGNMENT_HYSTERESIS = 0.04;
export const NEAR_MARGIN = 0.2;

export type AlignmentLevel = "unknown" | "low" | "near" | "aligned";

export function smoothScore(
  previous: number | null,
  next: number,
  weight: number = SCORE_SMOOTHING,
): number {
  return previous === null ? next : weight * next + (1 - weight) * previous;
}

export function nextAligned(
  wasAligned: boolean,
  score: number | null,
  threshold: number,
  hysteresis: number = ALIGNMENT_HYSTERESIS,
): boolean {
  if (score === null) return false;
  return wasAligned ? score >= threshold - hysteresis : score >= threshold;
}

export function alignmentLevel(
  score: number | null,
  threshold: number,
  aligned: boolean,
): AlignmentLevel {
  if (score === null) return "unknown";
  if (aligned) return "aligned";
  return score >= threshold - NEAR_MARGIN ? "near" : "low";
}

export function scorePercent(score: number | null): number | null {
  return score === null ? null : Math.round(Math.min(1, Math.max(0, score)) * 100);
}

export function roundScore(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}

export interface ShutterState {
  hasReference: boolean;
  aligned: boolean;
  forcedReason: string | null;
  busy: boolean;
}

export function canShoot({ hasReference, aligned, forcedReason, busy }: ShutterState): boolean {
  if (busy) return false;
  return !hasReference || aligned || (forcedReason !== null && forcedReason.trim().length > 0);
}
