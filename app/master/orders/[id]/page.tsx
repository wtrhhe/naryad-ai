import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadActionReferences, loadOrderBundle } from "@/lib/orders/detail";
import { loadReviewForOrder } from "@/lib/review/queries";
import { REVIEWABLE_STATUSES } from "@/lib/review/view";
import { OrderView } from "@/components/order-detail/order-view";
import { OrderActions, type WorkerOption } from "@/components/order-detail/order-actions";
import { ReviewReport } from "@/components/review/review-report";
import { ReviewDecisionPanel } from "@/components/review/review-decision-panel";
import { ReviewPending } from "@/components/review/review-pending";
import { LiveRefresh } from "@/components/board/live-refresh";

export async function generateMetadata() {
  const t = await getTranslations("workerApp");
  return { title: t("orderTitle") };
}

export default async function MasterOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("master");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const bundle = await loadOrderBundle(id);
  if (!bundle) notFound();
  const [references, review, t, supabase] = await Promise.all([
    loadActionReferences(),
    loadReviewForOrder(id),
    getTranslations("workerApp"),
    createSupabaseServerClient(),
  ]);
  const { data: board } = await supabase.rpc("assignee_board", {
    target_equipment_type: bundle.order.equipment.type,
  });
  const workers: WorkerOption[] = (board ?? [])
    .filter((row) => row.employee_id !== bundle.order.assigneeId)
    .map((row) => ({
      id: row.employee_id,
      name: row.full_name,
      hint: !row.on_shift
        ? t("worker.offShift")
        : row.active_order_number
          ? t("worker.busy", { number: row.active_order_number })
          : row.queue_length > 0
            ? t("worker.queue", { count: row.queue_length })
            : t("worker.free"),
    }));
  const { order } = bundle;
  const reviewing = REVIEWABLE_STATUSES.includes(order.status) || order.status === "closed";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <LiveRefresh channel={`order-${id}`} />
      <OrderView bundle={bundle} />
      {reviewing && review?.review ? <ReviewReport data={review} /> : null}
      {reviewing && review && !review.review && review.pending ? <ReviewPending /> : null}
      {order.status === "ai_review" && review ? <ReviewDecisionPanel data={review} /> : null}
      <OrderActions
        role="master"
        references={references}
        workers={workers}
        order={{
          id: order.id,
          status: order.status,
          kind: order.kind,
          priority: order.priority,
          suggestedFaultCodeId: order.suggestedFaultCodeId,
        }}
      />
    </div>
  );
}
