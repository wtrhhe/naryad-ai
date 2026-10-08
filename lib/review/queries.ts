import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toOrderReviewData, type OrderReviewData, type TimingOrderRow } from "@/lib/review/view";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";

const ORDER_COLUMNS =
  "id, status, rework_count, standard_hours, due_at, started_at, done_at, paused_seconds, fault_code:fault_codes!work_orders_fault_code_id_fkey(standard_hours)";

type OrderRow = TimingOrderRow & { id: string; status: WorkOrderStatus; rework_count: number };

export async function loadReviewForOrder(orderId: string): Promise<OrderReviewData | null> {
  const supabase = await createSupabaseServerClient();
  const [order, reviews, events] = await Promise.all([
    supabase.from("work_orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle(),
    supabase
      .from("ai_reviews")
      .select("*")
      .eq("work_order_id", orderId)
      .order("revision", { ascending: false }),
    supabase
      .from("work_order_events")
      .select("action, occurred_at")
      .eq("work_order_id", orderId)
      .in("action", ["start", "complete"])
      .order("occurred_at"),
  ]);
  const failure = order.error ?? reviews.error ?? events.error;
  if (failure) {
    throw new Error(`Failed to load the order review: ${failure.message}`);
  }
  if (!order.data) {
    return null;
  }
  return toOrderReviewData(
    order.data as unknown as OrderRow,
    reviews.data ?? [],
    (events.data ?? []).map((event) => ({ action: event.action, occurredAt: event.occurred_at })),
  );
}
