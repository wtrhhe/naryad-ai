import { reachedDone, wasStarted, type OrderFacts } from "./facts";
import type { Rng } from "./random";
import { MS_PER_MINUTE } from "./time";
import type { PhotoRow } from "./types";

const GHOST_CHANCE = 0.03;
const GHOST_FORCED_CHANCE = 0.6;
const REGULAR_GHOST_RANGE = [0.02, 0.32] as const;
const GHOST_RANGE = [0.82, 0.99] as const;
const BEFORE_PHOTO_RANGE = [1, 3] as const;
const AFTER_PHOTO_RANGE = [1, 2] as const;
const SIZE_RANGE_BYTES = [90_000, 420_000] as const;
const PORTRAIT_CHANCE = 0.4;
const LATE_SYNC_CHANCE = 0.05;
const LATE_SYNC_MINUTES = [2, 90] as const;
const FORCED_REASONS = [
  "Оборудование уже закрыто кожухом, повторная съёмка невозможна",
  "Плохое освещение, снимок сделан с того же ракурса",
];

type PhotoDraft = {
  readonly kind: PhotoRow["kind"];
  readonly number: number;
  readonly takenAtMs: number;
};

function photoDrafts(facts: OrderFacts, rng: Rng): PhotoDraft[] {
  if (!wasStarted(facts) || facts.startedAtMs === null) return [];
  const startedAtMs = facts.startedAtMs;
  const beforeCount = rng.int(...BEFORE_PHOTO_RANGE);
  const before = Array.from({ length: beforeCount }, (_, index) => ({
    kind: "before" as const,
    number: index + 1,
    takenAtMs: startedAtMs - Math.round(rng.float(3, 25) * MS_PER_MINUTE),
  }));
  const loto = facts.equipment.requires_lockout
    ? [
        {
          kind: "loto" as const,
          number: 1,
          takenAtMs: startedAtMs - Math.round(rng.float(8, 30) * MS_PER_MINUTE),
        },
      ]
    : [];
  const after = reachedDone(facts)
    ? facts.completionsMs.flatMap((completedAtMs, round) =>
        Array.from({ length: rng.int(...AFTER_PHOTO_RANGE) }, (_, index) => ({
          kind: "after" as const,
          number: round * AFTER_PHOTO_RANGE[1] + index + 1,
          takenAtMs: completedAtMs - Math.round(rng.float(1, 10) * MS_PER_MINUTE),
        })),
      )
    : [];
  return [...before, ...loto, ...after];
}

function buildPhoto(facts: OrderFacts, draft: PhotoDraft, beforeHash: string, rng: Rng): PhotoRow {
  const portrait = rng.chance(PORTRAIT_CHANCE);
  const isGhost = draft.kind === "after" && draft.number === 1 && rng.chance(GHOST_CHANCE);
  const lateMs = rng.chance(LATE_SYNC_CHANCE)
    ? Math.round(rng.float(...LATE_SYNC_MINUTES) * MS_PER_MINUTE)
    : 0;
  const forced = isGhost && rng.chance(GHOST_FORCED_CHANCE);
  return {
    id: rng.uuid(),
    work_order_id: facts.orderId,
    kind: draft.kind,
    storage_path: `${facts.orderId}/${draft.kind}-${draft.number}.webp`,
    mime_type: "image/webp",
    size_bytes: rng.int(...SIZE_RANGE_BYTES),
    width: portrait ? 960 : 1280,
    height: portrait ? 1280 : 960,
    taken_at: new Date(draft.takenAtMs).toISOString(),
    received_at: new Date(
      draft.takenAtMs + lateMs + Math.round(rng.float(1, 20) * 1000),
    ).toISOString(),
    author_id: facts.executor.id,
    phash: isGhost || (draft.kind === "before" && draft.number === 1) ? beforeHash : rng.hex(16),
    ghost_score:
      draft.kind === "after"
        ? Number(
            (isGhost ? rng.float(...GHOST_RANGE) : rng.float(...REGULAR_GHOST_RANGE)).toFixed(3),
          )
        : null,
    forced_reason: forced ? rng.pick(FORCED_REASONS) : null,
    created_at: new Date(draft.takenAtMs + lateMs + 2000).toISOString(),
  };
}

export function buildPhotos(facts: OrderFacts, rng: Rng): PhotoRow[] {
  const beforeHash = rng.hex(16);
  return photoDrafts(facts, rng).map((draft) => buildPhoto(facts, draft, beforeHash, rng));
}
