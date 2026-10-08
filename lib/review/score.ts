import type { CheckResult, CheckSeverity, ReviewVerdict, RulesOutcome } from "@/lib/review/types";

export const ACCEPTED_SCORE = 80;
export const REMARKS_SCORE = 60;
export const MAX_REWORK_SCORE = REMARKS_SCORE - 1;
export const FAIL_PENALTY = 45;
export const WARN_PENALTY: Readonly<Record<CheckSeverity, number>> = {
  none: 0,
  low: 6,
  medium: 21,
  high: 30,
};

const RATING_THRESHOLDS: ReadonlyArray<readonly [number, number]> = [
  [90, 5],
  [80, 4],
  [70, 3],
  [55, 2],
];

const VERDICT_RANK: Readonly<Record<ReviewVerdict, number>> = {
  rework: 0,
  accepted_with_remarks: 1,
  accepted: 2,
};

export function clampScore(score: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(score)));
}

export function verdictFor(score: number): ReviewVerdict {
  if (score >= ACCEPTED_SCORE) return "accepted";
  return score >= REMARKS_SCORE ? "accepted_with_remarks" : "rework";
}

export function ratingFor(score: number): number {
  return RATING_THRESHOLDS.find(([threshold]) => score >= threshold)?.[1] ?? 1;
}

export function scoreBand(verdict: ReviewVerdict): readonly [number, number] {
  switch (verdict) {
    case "accepted":
      return [ACCEPTED_SCORE, 100];
    case "accepted_with_remarks":
      return [REMARKS_SCORE, ACCEPTED_SCORE - 1];
    case "rework":
      return [0, MAX_REWORK_SCORE];
  }
}

export function clampToVerdict(score: number, verdict: ReviewVerdict): number {
  const [min, max] = scoreBand(verdict);
  return clampScore(score, min, max);
}

export function lowerVerdict(left: ReviewVerdict, right: ReviewVerdict): ReviewVerdict {
  return VERDICT_RANK[left] <= VERDICT_RANK[right] ? left : right;
}

export function maxAllowedVerdict(checks: readonly CheckResult[]): ReviewVerdict {
  return checks.some((check) => check.status === "fail") ? "rework" : "accepted";
}

export function capVerdict(verdict: ReviewVerdict, checks: readonly CheckResult[]): ReviewVerdict {
  return lowerVerdict(verdict, maxAllowedVerdict(checks));
}

export function checkPenalty(check: CheckResult): number {
  if (check.status === "fail") return FAIL_PENALTY;
  return check.status === "warn" ? WARN_PENALTY[check.severity] : 0;
}

export function scoreChecks(checks: readonly CheckResult[]): RulesOutcome {
  const raw = 100 - checks.reduce((sum, check) => sum + checkPenalty(check), 0);
  const hasFail = checks.some((check) => check.status === "fail");
  const score = hasFail ? clampScore(raw, 0, MAX_REWORK_SCORE) : clampScore(raw, REMARKS_SCORE);
  return {
    score,
    verdict: hasFail ? "rework" : verdictFor(score),
    rating: ratingFor(score),
    hasFail,
  };
}
