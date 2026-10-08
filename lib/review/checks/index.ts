import { checkAcoustic } from "@/lib/review/checks/acoustic";
import { checkCompleteness } from "@/lib/review/checks/completeness";
import { checkLockout } from "@/lib/review/checks/lockout";
import { checkMaterialCategory } from "@/lib/review/checks/material-category";
import { checkMaterialNorms } from "@/lib/review/checks/material-norms";
import { checkPhotos } from "@/lib/review/checks/photos";
import { checkTime } from "@/lib/review/checks/time";
import type { CheckResult, ReviewContext, ReviewSettings } from "@/lib/review/types";

export function runChecks(context: ReviewContext, settings: ReviewSettings): CheckResult[] {
  return [
    checkCompleteness(context),
    checkMaterialNorms(context, settings),
    checkMaterialCategory(context),
    checkTime(context),
    checkPhotos(context, settings),
    checkLockout(context),
    checkAcoustic(context),
  ];
}
