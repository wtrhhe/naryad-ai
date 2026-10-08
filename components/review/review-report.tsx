import { useFormatter, useTranslations } from "next-intl";
import { Bot, ShieldAlert, ThumbsUp, Wrench } from "lucide-react";
import type { OrderReviewData, ReviewView } from "@/lib/review/view";
import { CheckList } from "./check-list";
import { ReviewPending } from "./review-pending";
import { RatingStars, ScoreDisplay } from "./score-display";
import { TimeVsStandard } from "./time-vs-standard";
import { NoLlmBadge, VerdictBadge } from "./verdict-badge";

export function TextList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: readonly string[];
  empty?: string;
  tone: "good" | "improve";
}) {
  const Icon = tone === "good" ? ThumbsUp : Wrench;
  return (
    <section className="border-border bg-surface flex flex-col gap-2 rounded-lg border-2 p-4">
      <h3 className="flex items-center gap-2 font-bold">
        <Icon
          className={tone === "good" ? "text-status-free size-5" : "text-accent size-5"}
          aria-hidden
        />
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : empty ? (
        <p className="text-muted">{empty}</p>
      ) : null}
    </section>
  );
}

export function MasterDecisionNote({ review }: { review: ReviewView }) {
  const t = useTranslations("review.masterDecision");
  const master = review.master;
  if (!master) {
    return null;
  }
  return (
    <section className="border-accent bg-accent/10 flex flex-col gap-2 rounded-lg border-2 p-4">
      <h3 className="font-bold">{t("title")}</h3>
      <div className="flex flex-wrap items-center gap-3">
        {master.verdict ? <VerdictBadge verdict={master.verdict} /> : null}
        {master.rating !== null ? <RatingStars rating={master.rating} /> : null}
      </div>
      <p>
        {master.changed && master.score !== null
          ? t("changed", { score: master.score })
          : t("agreed")}
      </p>
      {master.comment ? (
        <p className="flex flex-wrap gap-x-2 text-sm">
          <span className="text-muted font-semibold">{t("comment")}</span>
          <span>{master.comment}</span>
        </p>
      ) : null}
    </section>
  );
}

function Confidence({ value }: { value: number | null }) {
  const t = useTranslations("review");
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-xs font-semibold tracking-wide uppercase">
        {t("confidence")}
      </span>
      <span className="font-mono text-3xl font-bold tabular-nums">
        {value === null
          ? t("confidenceUnknown")
          : format.number(value, { style: "percent", maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

function ReviewBody({ review, data }: { review: ReviewView; data: OrderReviewData }) {
  const t = useTranslations("review");
  const format = useFormatter();
  return (
    <>
      {review.needsMasterReview && data.status === "ai_review" ? (
        <div
          role="alert"
          className="border-status-busy bg-status-busy/10 flex gap-3 rounded-lg border-2 p-4"
        >
          <ShieldAlert className="text-status-busy size-7 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">{t("needsMasterReview.title")}</p>
            <p className="text-muted text-sm">{t("needsMasterReview.hint")}</p>
          </div>
        </div>
      ) : null}
      <div className="border-border bg-surface grid gap-4 rounded-lg border-2 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        {review.score !== null && review.rating !== null && review.verdict ? (
          <ScoreDisplay score={review.score} rating={review.rating} verdict={review.verdict} />
        ) : null}
        <div className="flex flex-wrap items-center gap-2 sm:self-center">
          {review.verdict ? <VerdictBadge verdict={review.verdict} /> : null}
          {review.usedLlm ? null : <NoLlmBadge />}
        </div>
        <Confidence value={review.confidence} />
      </div>
      <MasterDecisionNote review={review} />
      <TimeVsStandard timing={data.timing} />
      {review.masterExplanation ? (
        <section className="border-border bg-surface flex flex-col gap-2 rounded-lg border-2 p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <Bot className="text-accent size-5" aria-hidden />
            {t("masterExplanationTitle")}
          </h3>
          <p className="leading-relaxed">{review.masterExplanation}</p>
        </section>
      ) : null}
      <CheckList checks={review.checks} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextList title={t("strengthsTitle")} items={review.strengths} tone="good" />
        <TextList
          title={t("improvementsTitle")}
          items={review.improvements}
          empty={t("nothingToImprove")}
          tone="improve"
        />
      </div>
      <p className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          {t("checkedAt", {
            time: format.dateTime(new Date(review.createdAt), {
              dateStyle: "short",
              timeStyle: "short",
            }),
          })}
        </span>
        {review.model ? <span>{t("model", { model: review.model })}</span> : null}
      </p>
    </>
  );
}

export function ReviewReport({ data }: { data: OrderReviewData }) {
  const t = useTranslations("review");
  const review = data.review;
  return (
    <section aria-labelledby="review-report-title" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-report-title" className="text-xl font-bold">
          {t("title")}
        </h2>
        {review && review.revision > 0 ? (
          <span className="text-muted text-sm font-semibold">
            {t("revision", { revision: review.revision })}
          </span>
        ) : null}
      </header>
      {data.pending ? <ReviewPending /> : null}
      {review ? (
        <ReviewBody review={review} data={data} />
      ) : data.pending ? null : (
        <p className="text-muted">{t("pending.waiting")}</p>
      )}
    </section>
  );
}
