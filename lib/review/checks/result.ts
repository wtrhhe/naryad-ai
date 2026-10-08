import { reviewTranslator, type ReviewTranslator } from "@/lib/review/text";
import type {
  CheckFinding,
  CheckKey,
  CheckResult,
  CheckSeverity,
  CheckStatus,
  CheckValues,
  FindingCode,
  SummaryCode,
} from "@/lib/review/types";

const SEVERITY_RANK: Record<CheckSeverity, number> = { none: 0, low: 1, medium: 2, high: 3 };

export function maxSeverity(severities: readonly CheckSeverity[]): CheckSeverity {
  return severities.reduce<CheckSeverity>(
    (worst, current) => (SEVERITY_RANK[current] > SEVERITY_RANK[worst] ? current : worst),
    "none",
  );
}

export function finding(
  code: FindingCode,
  status: CheckFinding["status"],
  severity: CheckSeverity,
  values: CheckValues = {},
): CheckFinding {
  return { code, status, severity: status === "fail" ? "high" : severity, values };
}

export function statusOf(findings: readonly CheckFinding[]): CheckStatus {
  if (findings.some((item) => item.status === "fail")) return "fail";
  return findings.length > 0 ? "warn" : "pass";
}

export const EMPTY_VALUE = "—";

export function messageValues(values: CheckValues): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      value === null ? EMPTY_VALUE : typeof value === "boolean" ? String(value) : value,
    ]),
  );
}

export function renderSummary(t: ReviewTranslator, code: SummaryCode, values: CheckValues): string {
  return t(`summary.${code}`, messageValues(values));
}

export function renderFinding(t: ReviewTranslator, item: CheckFinding): string {
  return t(`finding.${item.code}`, messageValues(item.values));
}

export function renderDetail(
  t: ReviewTranslator,
  code: SummaryCode,
  values: CheckValues,
  findings: readonly CheckFinding[],
): string {
  const summary = renderSummary(t, code, values);
  if (findings.length === 0) {
    return summary;
  }
  const head = summary.endsWith(".") ? summary : `${summary}.`;
  return `${head} ${findings.map((item) => renderFinding(t, item)).join("; ")}`;
}

export function buildCheck(
  key: CheckKey,
  code: SummaryCode,
  values: CheckValues,
  findings: readonly CheckFinding[],
  forcedStatus?: CheckStatus,
): CheckResult {
  const t = reviewTranslator("ru");
  const status = forcedStatus ?? statusOf(findings);
  const severity =
    status === "fail"
      ? "high"
      : status === "warn"
        ? maxSeverity(findings.map((item) => item.severity))
        : "none";
  return {
    key,
    label: t(`label.${key}`),
    status,
    passed: status === "pass" || status === "skip",
    severity,
    code,
    values,
    findings: [...findings],
    detail: renderDetail(t, code, values, findings),
  };
}

export function skipCheck(key: CheckKey, code: SummaryCode, values: CheckValues = {}): CheckResult {
  return buildCheck(key, code, values, [], "skip");
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function minutesBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / 60_000);
}
