import { buildCheck, finding, minutesBetween } from "@/lib/review/checks/result";
import type {
  CheckFinding,
  CheckResult,
  PhotoMatch,
  ReviewContext,
  ReviewOrder,
  ReviewPhoto,
  ReviewSettings,
} from "@/lib/review/types";

export const PHOTO_WINDOW_MS = 10 * 60_000;
export const DUPLICATE_MAX_DISTANCE = 6;
const PHASH_PATTERN = /^[0-9a-f]{16}$/;
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

export function hammingDistance(left: string, right: string): number | null {
  if (!PHASH_PATTERN.test(left) || !PHASH_PATTERN.test(right)) {
    return null;
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const xor = parseInt(left.charAt(index), 16) ^ parseInt(right.charAt(index), 16);
    distance += NIBBLE_BITS[xor] ?? 0;
  }
  return distance;
}

function windowFinding(photo: ReviewPhoto, order: ReviewOrder): CheckFinding | null {
  const shotAt = photo.takenAt ?? photo.receivedAt;
  if (!order.startedAt || !order.doneAt) {
    return null;
  }
  const shotMs = Date.parse(shotAt);
  const opensMs = Date.parse(order.startedAt) - PHOTO_WINDOW_MS;
  const closesMs = Date.parse(order.doneAt) + PHOTO_WINDOW_MS;
  if (shotMs < opensMs) {
    return finding("outside_window", "warn", "medium", {
      minutes: minutesBetween(shotMs, Date.parse(order.startedAt)),
      direction: "before",
    });
  }
  if (shotMs > closesMs) {
    return finding("outside_window", "warn", "medium", {
      minutes: minutesBetween(Date.parse(order.doneAt), shotMs),
      direction: "after",
    });
  }
  return null;
}

function alignmentFinding(photo: ReviewPhoto, minAlignment: number): CheckFinding | null {
  if (photo.ghostScore === null || photo.ghostScore >= minAlignment) {
    return null;
  }
  const values = {
    score: Math.round(photo.ghostScore * 100),
    min: Math.round(minAlignment * 100),
  };
  const reason = photo.forcedReason?.trim();
  return reason
    ? finding("low_alignment_forced", "warn", "low", { ...values, reason })
    : finding("low_alignment", "warn", "medium", values);
}

function sameAsBefore(photo: ReviewPhoto, before: readonly ReviewPhoto[]): boolean {
  return before.some((candidate) => {
    if (!photo.phash || !candidate.phash) return false;
    const distance = hammingDistance(photo.phash, candidate.phash);
    return distance !== null && distance <= DUPLICATE_MAX_DISTANCE;
  });
}

export function closestMatches(
  matches: readonly PhotoMatch[],
  photoIds: ReadonlySet<string>,
): PhotoMatch[] {
  const best = new Map<string, PhotoMatch>();
  for (const match of matches) {
    if (!photoIds.has(match.photoId) || match.distance > DUPLICATE_MAX_DISTANCE) continue;
    const current = best.get(match.photoId);
    if (!current || match.distance < current.distance) best.set(match.photoId, match);
  }
  return [...best.values()];
}

export function checkPhotos(context: ReviewContext, settings: ReviewSettings): CheckResult {
  const after = context.photos.filter((photo) => photo.kind === "after");
  if (after.length === 0) {
    return buildCheck("photos", "photos_none", { count: 0 }, [finding("no_after", "warn", "low")]);
  }
  const before = context.photos.filter((photo) => photo.kind === "before");
  const perPhoto = after.flatMap((photo) =>
    [
      windowFinding(photo, context.order),
      alignmentFinding(photo, settings.ghostMinAlignment),
      sameAsBefore(photo, before) ? finding("same_as_before", "warn", "medium") : null,
    ].filter((item): item is CheckFinding => item !== null),
  );
  const duplicates = closestMatches(
    context.photoMatches,
    new Set(after.map((photo) => photo.id)),
  ).map((match) =>
    finding("duplicate", "fail", "high", {
      number: match.matchOrderNumber,
      distance: match.distance,
    }),
  );
  const findings = [...duplicates, ...perPhoto];
  return buildCheck(
    "photos",
    findings.length > 0 ? "photos_issues" : "photos_ok",
    { count: after.length },
    findings,
  );
}
