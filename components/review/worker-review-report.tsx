import { useTranslations } from "next-intl";
import type { OrderReviewData } from "@/lib/review/view";
import { MasterDecisionNote, TextList } from "./review-report";
import { ReviewPending } from "./review-pending";
import { ScoreDisplay } from "./score-display";
import { TimeVsStandard } from "./time-vs-standard";
import { VerdictBadge } from "./verdict-badge";

export function WorkerReviewReport({ data }: { data: OrderReviewData }) {
  const t = useTranslations("review");
  const review = data.review;
  const score = review?.master?.score ?? review?.score ?? null;
  const rating = review?.master?.rating ?? review?.rating ?? null;
  const verdict = review?.master?.verdict ?? review?.verdict ?? null;
  return (
    <section aria-labelledby="worker-review-title" className="flex flex-col gap-4">
      <h2 id="worker-review-title" className="text-xl font-bold">
        {t("workerTitle")}
      </h2>
      {data.pending ? <ReviewPending audience="worker" /> : null}
      {review ? (
        <>
          <div className="border-border bg-surface flex flex-wrap items-end justify-between gap-4 rounded-lg border-2 p-4">
            {score !== null && rating !== null && verdict ? (
              <ScoreDisplay score={score} rating={rating} verdict={verdict} />
            ) : null}
            {verdict ? <VerdictBadge verdict={verdict} /> : null}
          </div>
          <MasterDecisionNote review={review} />
          {review.workerExplanation ? (
            <section className="border-border bg-surface flex flex-col gap-2 rounded-lg border-2 p-4">
              <h3 className="font-bold">{t("workerExplanationTitle")}</h3>
              <p className="leading-relaxed">{review.workerExplanation}</p>
            </section>
          ) : null}
          <TextList title={t("strengthsTitle")} items={review.strengths} tone="good" />
          <TextList
            title={t("improvementsTitle")}
            items={review.improvements}
            empty={t("nothingToImprove")}
            tone="improve"
          />
          <TimeVsStandard timing={data.timing} />
        </>
      ) : data.pending ? null : (
        <p className="text-muted">{t("pending.waiting")}</p>
      )}
    </section>
  );
}
