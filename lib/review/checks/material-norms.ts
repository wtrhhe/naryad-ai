import { buildCheck, finding, round, skipCheck } from "@/lib/review/checks/result";
import type {
  CheckFinding,
  CheckResult,
  ReviewContext,
  ReviewMaterialLine,
  ReviewSettings,
} from "@/lib/review/types";

export const MIN_HISTORY_SAMPLES = 5;
export const FAIL_TOLERANCE_MULTIPLIER = 4;

export function overPercent(quantity: number, reference: number): number {
  return Math.round((quantity / reference - 1) * 100);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function normFinding(line: ReviewMaterialLine, tolerance: number): CheckFinding | null {
  if (!line.norm || line.norm.max <= 0 || line.quantity <= line.norm.max) {
    return null;
  }
  const percent = overPercent(line.quantity, line.norm.max);
  if (percent <= tolerance) {
    return null;
  }
  const values = {
    name: line.name,
    unit: line.unit,
    quantity: round(line.quantity, 3),
    max: round(line.norm.max, 3),
    percent,
  };
  return percent > tolerance * FAIL_TOLERANCE_MULTIPLIER
    ? finding("over_max", "fail", "high", values)
    : finding("over_max", "warn", "medium", values);
}

function historyFinding(line: ReviewMaterialLine, tolerance: number): CheckFinding | null {
  if (
    line.historyMedian === null ||
    line.historyMedian <= 0 ||
    line.historyCount < MIN_HISTORY_SAMPLES ||
    (line.norm !== null && line.quantity <= line.norm.typical)
  ) {
    return null;
  }
  const percent = overPercent(line.quantity, line.historyMedian);
  return percent > tolerance
    ? finding("over_median", "warn", "low", {
        name: line.name,
        unit: line.unit,
        quantity: round(line.quantity, 3),
        median: round(line.historyMedian, 3),
        percent,
      })
    : null;
}

function lineFinding(line: ReviewMaterialLine, tolerance: number): CheckFinding | null {
  return normFinding(line, tolerance) ?? historyFinding(line, tolerance);
}

function isComparable(line: ReviewMaterialLine): boolean {
  return (
    (line.norm !== null && line.norm.max > 0) ||
    (line.historyMedian !== null && line.historyCount >= MIN_HISTORY_SAMPLES)
  );
}

export function checkMaterialNorms(context: ReviewContext, settings: ReviewSettings): CheckResult {
  if (context.materials.length === 0) {
    return skipCheck("material_norms", "materials_none");
  }
  if (!context.materials.some(isComparable)) {
    return skipCheck("material_norms", "materials_no_norm", { count: context.materials.length });
  }
  const findings = context.materials
    .map((line) => lineFinding(line, settings.materialOverusePercent))
    .filter((item): item is CheckFinding => item !== null);
  return buildCheck(
    "material_norms",
    findings.length > 0 ? "materials_over" : "materials_ok",
    { count: findings.length > 0 ? findings.length : context.materials.length },
    findings,
  );
}
