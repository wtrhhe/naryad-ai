import { buildCheck, finding, minutesBetween, skipCheck } from "@/lib/review/checks/result";
import type { CheckResult, ReviewContext } from "@/lib/review/types";

export const LOCKOUT_GRACE_MS = 60_000;

export function checkLockout(context: ReviewContext): CheckResult {
  if (!context.equipment.requiresLockout) {
    return skipCheck("lockout", "lockout_not_required");
  }
  const lockedTimes = context.lockouts.map((lockout) => Date.parse(lockout.lockedAt));
  if (lockedTimes.length === 0) {
    return buildCheck("lockout", "lockout_missing", {}, [
      finding("lockout_missing", "fail", "high"),
    ]);
  }
  const firstLockedMs = Math.min(...lockedTimes);
  const startedAt = context.order.startedAt;
  const late =
    startedAt !== null && firstLockedMs > Date.parse(startedAt) + LOCKOUT_GRACE_MS
      ? [
          finding("lockout_late", "warn", "medium", {
            minutes: minutesBetween(Date.parse(startedAt), firstLockedMs),
          }),
        ]
      : [];
  return buildCheck(
    "lockout",
    "lockout_ok",
    { lockedAt: new Date(firstLockedMs).toISOString() },
    late,
  );
}
