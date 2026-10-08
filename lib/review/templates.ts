import { messageValues } from "@/lib/review/checks/result";
import { reviewTranslator } from "@/lib/review/text";
import type { Locale } from "@/i18n/config";
import type {
  CheckFinding,
  CheckResult,
  FinalReview,
  ReviewVerdict,
  RulesOutcome,
} from "@/lib/review/types";

export const MAX_STRENGTHS = 4;
export const MAX_IMPROVEMENTS = 6;

export function uniqueTexts(texts: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const text of texts) {
    const normalized = text.trim();
    const key = normalized.toLowerCase();
    if (normalized.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

export function strengthsFor(checks: readonly CheckResult[], locale: Locale = "ru"): string[] {
  const t = reviewTranslator(locale);
  return uniqueTexts(
    checks.filter((check) => check.status === "pass").map((check) => t(`strength.${check.key}`)),
    MAX_STRENGTHS,
  );
}

function orderedFindings(checks: readonly CheckResult[], status: CheckFinding["status"]) {
  return checks.flatMap((check) => check.findings.filter((item) => item.status === status));
}

export function improvementsFor(checks: readonly CheckResult[], locale: Locale = "ru"): string[] {
  const t = reviewTranslator(locale);
  const findings = [...orderedFindings(checks, "fail"), ...orderedFindings(checks, "warn")];
  return uniqueTexts(
    findings.map((item) => t(`improve.${item.code}`, messageValues(item.values))),
    MAX_IMPROVEMENTS,
  );
}

export function failedImprovements(
  checks: readonly CheckResult[],
  locale: Locale = "ru",
): string[] {
  const t = reviewTranslator(locale);
  return uniqueTexts(
    orderedFindings(checks, "fail").map((item) =>
      t(`improve.${item.code}`, messageValues(item.values)),
    ),
    MAX_IMPROVEMENTS,
  );
}

function stripPeriod(text: string): string {
  return text.replace(/[.!]+$/, "");
}

export function workerExplanationFor(
  verdict: ReviewVerdict,
  score: number,
  improvements: readonly string[],
  locale: Locale = "ru",
): string {
  const t = reviewTranslator(locale);
  const remarks =
    improvements.length > 0
      ? t("templates.workerRemarks", { list: improvements.map(stripPeriod).join("; ") })
      : t("templates.workerNoRemarks");
  return [
    `${t("templates.verdict", { verdict })}.`,
    t("templates.workerScore", { score }),
    remarks,
    t("templates.workerFinal"),
  ].join(" ");
}

function labelsWith(checks: readonly CheckResult[], status: CheckResult["status"]): string[] {
  return checks.filter((check) => check.status === status).map((check) => check.label);
}

export function masterExplanationFor(
  rules: RulesOutcome,
  checks: readonly CheckResult[],
  locale: Locale = "ru",
): string {
  const t = reviewTranslator(locale);
  const failed = labelsWith(checks, "fail");
  const warned = labelsWith(checks, "warn");
  const time = checks.find((check) => check.key === "time" && check.status !== "skip");
  return [
    t("templates.masterIntro", { score: rules.score }),
    failed.length > 0 ? t("templates.masterFailed", { list: failed.join(", ") }) : null,
    warned.length > 0 ? t("templates.masterWarned", { list: warned.join(", ") }) : null,
    failed.length === 0 && warned.length === 0 ? t("templates.masterClean") : null,
    time ? t("templates.masterTime", { detail: stripPeriod(time.detail) }) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

export function capNoteFor(checks: readonly CheckResult[], locale: Locale = "ru"): string {
  return reviewTranslator(locale)("templates.capNote", {
    list: labelsWith(checks, "fail").join(", "),
  });
}

export function mismatchNote(locale: Locale = "ru"): string {
  return reviewTranslator(locale)("templates.mismatchNote");
}

export function rulesOnlyReview(rules: RulesOutcome, checks: readonly CheckResult[]): FinalReview {
  const improvements = improvementsFor(checks);
  return {
    verdict: rules.verdict,
    score: rules.score,
    rating: rules.rating,
    confidence: null,
    needsMasterReview: rules.verdict !== "accepted",
    usedLlm: false,
    model: null,
    strengths: strengthsFor(checks),
    improvements,
    workerExplanation: workerExplanationFor(rules.verdict, rules.score, improvements),
    masterExplanation: masterExplanationFor(rules, checks),
    problemMatchesWork: null,
    notes: null,
  };
}
