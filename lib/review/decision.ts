import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { ratingFor, verdictFor } from "@/lib/review/score";
import { REVIEW_VERDICTS, type ReviewVerdict } from "@/lib/review/types";

export const MIN_COMMENT_LENGTH = 2;
export const MAX_COMMENT_LENGTH = 2000;

export const decideReviewSchema = z.object({
  orderId: z.uuid(),
  agree: z.boolean(),
  score: z.number().int().min(0).max(100).optional(),
  verdict: z.enum(REVIEW_VERDICTS).optional(),
  comment: z.string().trim().max(MAX_COMMENT_LENGTH).optional(),
});

export type DecideReviewInput = z.infer<typeof decideReviewSchema>;

export interface ReviewSnapshot {
  verdict: ReviewVerdict | null;
  score: number | null;
}

export interface MasterFields {
  master_verdict: ReviewVerdict | null;
  master_score: number | null;
  master_rating: number | null;
  master_comment: string | null;
}

export type DecisionPlan =
  | {
      ok: true;
      action: "approve" | "return_rework";
      comment: string | null;
      master: MasterFields | null;
      payload: Json;
    }
  | { ok: false; error: "comment_required" | "validation" };

function commentOf(input: DecideReviewInput): string | null {
  const comment = input.comment?.trim() ?? "";
  return comment.length >= MIN_COMMENT_LENGTH ? comment : null;
}

function finalVerdict(input: DecideReviewInput, review: ReviewSnapshot): ReviewVerdict | null {
  if (input.agree) {
    return review.verdict;
  }
  if (input.verdict) {
    return input.verdict;
  }
  return input.score !== undefined ? verdictFor(input.score) : review.verdict;
}

function transitionPayload(
  comment: string | null,
  review: ReviewSnapshot | null,
  master: MasterFields | null,
  agree: boolean,
): Json {
  return {
    expected_status: "ai_review",
    ...(comment ? { comment } : {}),
    review: {
      agreed: agree,
      ai_verdict: review?.verdict ?? null,
      ai_score: review?.score ?? null,
      master_verdict: master?.master_verdict ?? null,
      master_score: master?.master_score ?? null,
    },
  };
}

export function planDecision(
  input: DecideReviewInput,
  review: ReviewSnapshot | null,
): DecisionPlan {
  const comment = commentOf(input);
  if (!review) {
    const action = !input.agree && input.verdict === "rework" ? "return_rework" : "approve";
    if (action === "return_rework" && !comment) {
      return { ok: false, error: "comment_required" };
    }
    return {
      ok: true,
      action,
      comment,
      master: null,
      payload: transitionPayload(comment, null, null, input.agree),
    };
  }
  if (!input.agree && !comment) {
    return { ok: false, error: "comment_required" };
  }
  const verdict = finalVerdict(input, review);
  if (verdict === null) {
    return { ok: false, error: "validation" };
  }
  const score = input.agree ? review.score : (input.score ?? review.score);
  const action = verdict === "rework" ? "return_rework" : "approve";
  if (action === "return_rework" && !comment) {
    return { ok: false, error: "comment_required" };
  }
  const master: MasterFields = {
    master_verdict: verdict,
    master_score: score,
    master_rating: score === null ? null : ratingFor(score),
    master_comment: comment,
  };
  return {
    ok: true,
    action,
    comment,
    master,
    payload: transitionPayload(comment, review, master, input.agree),
  };
}
