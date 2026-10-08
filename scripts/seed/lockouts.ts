import { reachedDone, wasStarted, type OrderFacts } from "./facts";
import type { Rng } from "./random";
import { MS_PER_MINUTE } from "./time";
import type { LockoutRow } from "./types";

const LOCK_BEFORE_START_MINUTES = [3, 12] as const;
const RELEASE_AFTER_DONE_MINUTES = [1, 8] as const;
const TAG_CONFIDENCE_RANGE = [0.82, 0.99] as const;

export function buildLockout(facts: OrderFacts, rng: Rng): LockoutRow | null {
  if (!facts.equipment.requires_lockout || !wasStarted(facts) || facts.startedAtMs === null)
    return null;
  const lockedAtMs =
    facts.startedAtMs - Math.round(rng.float(...LOCK_BEFORE_START_MINUTES) * MS_PER_MINUTE);
  const finished =
    facts.finalStatus === "done" ||
    facts.finalStatus === "ai_review" ||
    facts.finalStatus === "closed" ||
    facts.finalStatus === "rework";
  const releasedAtMs =
    finished && reachedDone(facts)
      ? (facts.completionsMs.at(-1) as number) +
        Math.round(rng.float(...RELEASE_AFTER_DONE_MINUTES) * MS_PER_MINUTE)
      : null;
  return {
    id: rng.uuid(),
    equipment_id: facts.equipment.id,
    work_order_id: facts.orderId,
    locked_by: facts.executor.id,
    tag_photo_path: `${facts.orderId}/loto-1.webp`,
    ai_check: {
      tag_visible: true,
      lock_visible: true,
      confidence: Number(rng.float(...TAG_CONFIDENCE_RANGE).toFixed(3)),
    },
    locked_at: new Date(lockedAtMs).toISOString(),
    released_at: releasedAtMs === null ? null : new Date(releasedAtMs).toISOString(),
    released_by: releasedAtMs === null ? null : facts.executor.id,
    created_at: new Date(lockedAtMs).toISOString(),
  };
}
