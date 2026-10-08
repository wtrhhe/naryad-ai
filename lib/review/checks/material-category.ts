import { buildCheck, finding, skipCheck } from "@/lib/review/checks/result";
import type {
  CheckResult,
  FaultCategory,
  ReviewContext,
  ReviewMaterialLine,
} from "@/lib/review/types";

export function isOffProfile(line: ReviewMaterialLine, category: FaultCategory): boolean {
  return line.norm === null && line.categories.length > 0 && !line.categories.includes(category);
}

export function checkMaterialCategory(context: ReviewContext): CheckResult {
  if (!context.faultCode) {
    return skipCheck("material_category", "category_skip");
  }
  if (context.materials.length === 0) {
    return skipCheck("material_category", "category_none");
  }
  const category = context.faultCode.category;
  const findings = context.materials
    .filter((line) => isOffProfile(line, category))
    .map((line) =>
      finding("category_mismatch", "warn", "medium", {
        name: line.name,
        materialCategory: line.categories[0] ?? null,
        category,
      }),
    );
  return findings.length > 0
    ? buildCheck(
        "material_category",
        "category_mismatch",
        { count: findings.length, category },
        findings,
      )
    : buildCheck("material_category", "category_ok", { category }, []);
}
