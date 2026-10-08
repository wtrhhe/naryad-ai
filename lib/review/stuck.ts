export const STUCK_AFTER_MS = 2 * 60_000;
export const MAX_REVIEWS_PER_RUN = 3;

export interface PendingOrderRow {
  id: string;
  status: string;
  rework_count: number;
  done_at: string | null;
  review_started_at: string | null;
  updated_at: string;
}

export interface ExistingReviewRow {
  work_order_id: string;
  revision: number;
}

export function waitingSince(order: PendingOrderRow): string {
  if (order.status === "ai_review") {
    return order.review_started_at ?? order.done_at ?? order.updated_at;
  }
  return order.done_at ?? order.updated_at;
}

export function pickStuckOrders(
  orders: readonly PendingOrderRow[],
  reviews: readonly ExistingReviewRow[],
  now: Date,
  limit = MAX_REVIEWS_PER_RUN,
  stuckAfterMs = STUCK_AFTER_MS,
): string[] {
  const reviewed = new Set(reviews.map((review) => `${review.work_order_id}:${review.revision}`));
  return orders
    .filter((order) => order.status === "done" || order.status === "ai_review")
    .filter((order) => !reviewed.has(`${order.id}:${order.rework_count}`))
    .map((order) => ({ id: order.id, since: Date.parse(waitingSince(order)) }))
    .filter((order) => now.getTime() - order.since >= stuckAfterMs)
    .sort((left, right) => left.since - right.since)
    .slice(0, limit)
    .map((order) => order.id);
}
