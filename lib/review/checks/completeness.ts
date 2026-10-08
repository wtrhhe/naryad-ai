import { buildCheck, finding } from "@/lib/review/checks/result";
import type { CheckFinding, CheckResult, ReviewContext } from "@/lib/review/types";

export const MIN_WORK_LENGTH = 3;
export const SHORT_WORK_LENGTH = 20;

function workFindings(workPerformed: string | null): CheckFinding[] {
  const length = (workPerformed ?? "").trim().length;
  if (length < MIN_WORK_LENGTH) {
    return [finding("no_work", "fail", "high")];
  }
  return length < SHORT_WORK_LENGTH ? [finding("short_work", "warn", "low", { length })] : [];
}

function faultCodeFindings(context: ReviewContext): CheckFinding[] {
  if (!context.faultCode) {
    return [finding("no_fault_code", "fail", "high")];
  }
  if (context.materials.length === 0 && context.requiredMaterials.length > 0) {
    return [finding("no_materials", "warn", "medium", { code: context.faultCode.code })];
  }
  return [];
}

function photoFindings(context: ReviewContext): CheckFinding[] {
  const hasAfter = context.photos.some((photo) => photo.kind === "after");
  return context.order.kind === "unplanned" && !hasAfter
    ? [finding("no_after_photo", "fail", "high")]
    : [];
}

export function checkCompleteness(context: ReviewContext): CheckResult {
  const findings = [
    ...workFindings(context.order.workPerformed),
    ...faultCodeFindings(context),
    ...photoFindings(context),
  ];
  return buildCheck(
    "completeness",
    findings.length > 0 ? "completeness_issues" : "completeness_ok",
    { count: findings.length },
    findings,
  );
}
