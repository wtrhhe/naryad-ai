"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bot, Check, Minus, Pencil, Plus, Undo2 } from "lucide-react";
import { decideReview, requestOrderReview } from "@/app/actions/review";
import type { ActionErrorCode } from "@/lib/domain/action-result";
import type { OrderReviewData } from "@/lib/review/view";
import { ratingFor, verdictFor } from "@/lib/review/score";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RatingStars } from "./score-display";
import { VerdictBadge } from "./verdict-badge";

const CONFIRM_TIMEOUT_MS = 4000;
const SCORE_STEP = 5;
const DEFAULT_SCORE = 80;
const MIN_COMMENT = 2;

type Mode = "idle" | "score" | "rework";
type ConfirmKey = "agree" | "score" | "rework" | "close";
type Outcome = "closed" | "returned" | "reviewStarted";

function useConfirmTap() {
  const [armed, setArmed] = useState<ConfirmKey | null>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  const tap = (key: ConfirmKey, run: () => void) => {
    if (armed === key) {
      setArmed(null);
      run();
    } else {
      setArmed(key);
    }
  };
  return { armed, tap, reset: () => setArmed(null) };
}

function CommentField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
}) {
  const t = useTranslations("review.decision");
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {t("commentLabel")}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={2000}
        aria-invalid={invalid}
        placeholder={t("commentPlaceholder")}
        className="border-border-strong bg-surface text-foreground placeholder:text-muted focus:border-accent aria-invalid:border-danger min-h-touch w-full rounded-lg border-2 px-4 py-3 text-base focus:outline-none"
      />
      {invalid ? (
        <p role="alert" className="text-danger text-sm font-semibold">
          {t("commentRequired")}
        </p>
      ) : null}
    </div>
  );
}

function ScoreEditor({ score, onChange }: { score: number; onChange: (next: number) => void }) {
  const t = useTranslations("review.decision");
  const id = useId();
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="font-semibold">
        {t("scoreLabel")}
      </label>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          aria-label={t("decrease")}
          onClick={() => onChange(clamp(score - SCORE_STEP))}
          className="w-touch shrink-0 px-0"
        >
          <Minus className="size-6" aria-hidden />
        </Button>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={score}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          className="accent-accent h-touch min-w-0 flex-1"
        />
        <Button
          variant="secondary"
          aria-label={t("increase")}
          onClick={() => onChange(clamp(score + SCORE_STEP))}
          className="w-touch shrink-0 px-0"
        >
          <Plus className="size-6" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <output htmlFor={id} className="font-mono text-4xl font-bold tabular-nums">
          {score}
        </output>
        <VerdictBadge verdict={verdictFor(score)} />
        <RatingStars rating={ratingFor(score)} />
      </div>
    </div>
  );
}

export function ReviewDecisionPanel({ data }: { data: OrderReviewData }) {
  const t = useTranslations("review.decision");
  const errors = useTranslations("workOrder.errors");
  const router = useRouter();
  const review = data.review;
  const [mode, setMode] = useState<Mode>("idle");
  const [score, setScore] = useState(review?.score ?? DEFAULT_SCORE);
  const [comment, setComment] = useState("");
  const [commentMissing, setCommentMissing] = useState(false);
  const [error, setError] = useState<ActionErrorCode | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirmTap();

  if (outcome === "closed" || outcome === "returned") {
    return (
      <p role="status" className="border-status-free bg-status-free/10 rounded-lg border-2 p-4 font-bold">
        {t(outcome)}
      </p>
    );
  }
  if (data.status !== "ai_review" && data.status !== "done") {
    return null;
  }

  const aiVerdict = review?.verdict ?? null;
  const hasComment = comment.trim().length >= MIN_COMMENT;
  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setCommentMissing(false);
    confirm.reset();
  };
  const run = (input: Parameters<typeof decideReview>[0], needsComment: boolean) => {
    if (needsComment && !hasComment) {
      setCommentMissing(true);
      confirm.reset();
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await decideReview(input);
      if (!result.ok) {
        if (result.error === "comment_required") setCommentMissing(true);
        else setError(result.error);
        return;
      }
      setOutcome(result.data.status === "closed" ? "closed" : "returned");
      router.refresh();
    });
  };
  const startReview = () =>
    startTransition(async () => {
      setError(null);
      const result = await requestOrderReview(data.orderId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOutcome("reviewStarted");
      router.refresh();
    });
  const trimmed = comment.trim() || undefined;
  const agreeRework = aiVerdict === "rework";
  const scoreRework = verdictFor(score) === "rework";

  return (
    <section
      aria-labelledby="review-decision-title"
      className="border-border-strong bg-surface-raised flex flex-col gap-4 rounded-xl border-2 p-4"
    >
      <h2 id="review-decision-title" className="text-xl font-bold">
        {t("title")}
      </h2>
      {data.status === "done" || (data.pending && !review) ? (
        <Button variant="secondary" block onClick={startReview} disabled={isPending}>
          <Bot className="size-6" aria-hidden />
          {isPending ? t("running") : t("runReview")}
        </Button>
      ) : null}
      {outcome === "reviewStarted" ? (
        <p role="status" className="text-muted text-sm">
          {t("reviewStarted")}
        </p>
      ) : null}
      {data.status === "ai_review" && mode === "idle" ? (
        <div className="flex flex-col gap-3">
          {review && !agreeRework ? (
            <Button
              block
              variant={confirm.armed === "agree" ? "danger" : "primary"}
              disabled={isPending}
              onClick={() =>
                confirm.tap("agree", () => run({ orderId: data.orderId, agree: true }, false))
              }
            >
              <Check className="size-6" aria-hidden />
              {confirm.armed === "agree" ? t("confirm") : t("agreeClose")}
            </Button>
          ) : null}
          {review && agreeRework ? (
            <Button block disabled={isPending} onClick={() => switchMode("rework")}>
              <Undo2 className="size-6" aria-hidden />
              {t("agreeRework")}
            </Button>
          ) : null}
          {!review ? (
            <Button
              block
              variant={confirm.armed === "close" ? "danger" : "secondary"}
              disabled={isPending}
              onClick={() =>
                confirm.tap("close", () => run({ orderId: data.orderId, agree: true }, false))
              }
            >
              <Check className="size-6" aria-hidden />
              {confirm.armed === "close" ? t("confirm") : t("closeWithoutReview")}
            </Button>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {review ? (
              <Button variant="secondary" disabled={isPending} onClick={() => switchMode("score")}>
                <Pencil className="size-6" aria-hidden />
                {t("changeScore")}
              </Button>
            ) : null}
            {!agreeRework || !review ? (
              <Button variant="secondary" disabled={isPending} onClick={() => switchMode("rework")}>
                <Undo2 className="size-6" aria-hidden />
                {t("returnRework")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {data.status === "ai_review" && mode === "score" ? (
        <div className="flex flex-col gap-4">
          <ScoreEditor score={score} onChange={setScore} />
          <CommentField
            value={comment}
            onChange={(next) => {
              setComment(next);
              setCommentMissing(false);
            }}
            invalid={commentMissing}
          />
          <Button
            block
            variant={confirm.armed === "score" || scoreRework ? "danger" : "primary"}
            disabled={isPending}
            onClick={() =>
              confirm.tap("score", () =>
                run({ orderId: data.orderId, agree: false, score, comment: trimmed }, true),
              )
            }
          >
            {isPending
              ? t("saving")
              : confirm.armed === "score"
                ? t("confirm")
                : scoreRework
                  ? t("submitScoreRework", { score })
                  : t("submitScore", { score })}
          </Button>
          <Button variant="ghost" block disabled={isPending} onClick={() => switchMode("idle")}>
            {t("cancel")}
          </Button>
        </div>
      ) : null}
      {data.status === "ai_review" && mode === "rework" ? (
        <div className="flex flex-col gap-4">
          <CommentField
            value={comment}
            onChange={(next) => {
              setComment(next);
              setCommentMissing(false);
            }}
            invalid={commentMissing}
          />
          <Button
            block
            variant="danger"
            disabled={isPending}
            onClick={() =>
              confirm.tap("rework", () =>
                run(
                  agreeRework && review
                    ? { orderId: data.orderId, agree: true, comment: trimmed }
                    : { orderId: data.orderId, agree: false, verdict: "rework", comment: trimmed },
                  true,
                ),
              )
            }
          >
            <Undo2 className="size-6" aria-hidden />
            {isPending
              ? t("saving")
              : confirm.armed === "rework"
                ? t("confirmRework")
                : t("returnRework")}
          </Button>
          <Button variant="ghost" block disabled={isPending} onClick={() => switchMode("idle")}>
            {t("cancel")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className={cn("border-danger bg-danger/10 rounded-lg border-2 p-3 font-medium")}
        >
          {errors(error)}
        </p>
      ) : null}
    </section>
  );
}
