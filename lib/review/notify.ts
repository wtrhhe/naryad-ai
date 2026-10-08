import type { Json } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/config";
import { reviewTranslator } from "@/lib/review/text";
import type { FinalReview } from "@/lib/review/types";

export const REVIEW_READY_KIND = "review_ready";
export const REVIEW_RESULT_KIND = "review_result";

export interface ReviewRecipient {
  id: string;
  locale: Locale;
}

export interface ReviewNotificationInput {
  orderId: string;
  orderNumber: number;
  revision: number;
  equipmentName: string;
  review: Pick<FinalReview, "verdict" | "score" | "needsMasterReview" | "usedLlm">;
  master: ReviewRecipient | null;
  workers: readonly ReviewRecipient[];
}

export interface ReviewNotificationRow {
  recipient_id: string;
  kind: string;
  title: string;
  body: string;
  work_order_id: string;
  payload: NonNullable<Json>;
  is_urgent: boolean;
  dedupe_key: string;
}

export function masterOrderUrl(orderId: string): string {
  return `/master/orders/${orderId}`;
}

export function workerOrderUrl(orderId: string): string {
  return `/worker/orders/${orderId}`;
}

function payloadOf(input: ReviewNotificationInput, url: string): NonNullable<Json> {
  return {
    url,
    order_number: input.orderNumber,
    revision: input.revision,
    verdict: input.review.verdict,
    score: input.review.score,
    used_llm: input.review.usedLlm,
  };
}

function masterRow(input: ReviewNotificationInput, master: ReviewRecipient): ReviewNotificationRow {
  const t = reviewTranslator(master.locale);
  const needsReview = input.review.needsMasterReview || input.review.verdict === "rework";
  return {
    recipient_id: master.id,
    kind: REVIEW_READY_KIND,
    title: t("notification.masterTitle", { number: input.orderNumber }),
    body: t("notification.masterBody", {
      verdict: input.review.verdict,
      score: input.review.score,
      equipment: input.equipmentName,
      review: needsReview ? "yes" : "no",
    }),
    work_order_id: input.orderId,
    payload: payloadOf(input, masterOrderUrl(input.orderId)),
    is_urgent: input.review.verdict === "rework",
    dedupe_key: `${REVIEW_READY_KIND}:${input.orderId}:${input.revision}:${master.id}`,
  };
}

function workerRow(input: ReviewNotificationInput, worker: ReviewRecipient): ReviewNotificationRow {
  const t = reviewTranslator(worker.locale);
  return {
    recipient_id: worker.id,
    kind: REVIEW_RESULT_KIND,
    title: t("notification.workerTitle", { number: input.orderNumber }),
    body: t("notification.workerBody", {
      verdict: input.review.verdict,
      score: input.review.score,
    }),
    work_order_id: input.orderId,
    payload: payloadOf(input, workerOrderUrl(input.orderId)),
    is_urgent: false,
    dedupe_key: `${REVIEW_RESULT_KIND}:${input.orderId}:${input.revision}:${worker.id}`,
  };
}

export function buildReviewNotifications(input: ReviewNotificationInput): ReviewNotificationRow[] {
  const workers = input.workers.filter(
    (worker, index, all) =>
      worker.id !== input.master?.id && all.findIndex((item) => item.id === worker.id) === index,
  );
  return [
    ...(input.master ? [masterRow(input, input.master)] : []),
    ...workers.map((worker) => workerRow(input, worker)),
  ];
}
