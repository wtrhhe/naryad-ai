import { z } from "zod";

export const GHOST_MIN_ALIGNMENT_KEY = "ghost.min_alignment";
export const DEFAULT_MIN_ALIGNMENT = 0.7;
const MIN_ALLOWED = 0.3;
const MAX_ALLOWED = 0.95;

export const FORCED_REASON_MIN = 3;
export const FORCED_REASON_MAX = 500;
export const FORCED_REASON_CODES = [
  "lighting",
  "angle",
  "replaced",
  "obstructed",
  "other",
] as const;
export type ForcedReasonCode = (typeof FORCED_REASON_CODES)[number];

export const GHOST_SCORE_WINDOW_MINUTES = 30;

export function parseMinAlignment(value: unknown): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return DEFAULT_MIN_ALIGNMENT;
  return Math.min(MAX_ALLOWED, Math.max(MIN_ALLOWED, numeric));
}

export function composeForcedReason(label: string, details: string): string {
  const note = details.trim();
  return (note ? `${label}: ${note}` : label).slice(0, FORCED_REASON_MAX);
}

export const ghostScoreInputSchema = z
  .object({
    photoId: z.uuid(),
    score: z.number().min(0).max(1).nullable(),
    forcedReason: z.string().trim().min(FORCED_REASON_MIN).max(FORCED_REASON_MAX).nullable(),
  })
  .refine((input) => input.score !== null || input.forcedReason !== null, {
    path: ["forcedReason"],
    message: "A reason is required when there is no alignment score",
  });

export type GhostScoreInput = z.infer<typeof ghostScoreInputSchema>;

export function isWithinScoreWindow(createdAt: string, now: Date = new Date()): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  const elapsed = now.getTime() - created;
  return elapsed >= -60_000 && elapsed <= GHOST_SCORE_WINDOW_MINUTES * 60_000;
}

export interface ScorablePhoto {
  author_id: string | null;
  kind: string;
  ghost_score: number | null;
  forced_reason: string | null;
  created_at: string;
}

export function canRecordGhostScore(
  photo: ScorablePhoto,
  employeeId: string,
  now: Date = new Date(),
): boolean {
  return (
    photo.author_id === employeeId &&
    photo.kind === "after" &&
    photo.ghost_score === null &&
    photo.forced_reason === null &&
    isWithinScoreWindow(photo.created_at, now)
  );
}
