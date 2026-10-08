import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { loadActionReferences, loadOrderBundle } from "@/lib/orders/detail";
import { loadReviewForOrder } from "@/lib/review/queries";
import { OrderView } from "@/components/order-detail/order-view";
import { OrderActions } from "@/components/order-detail/order-actions";
import { WorkerReviewReport } from "@/components/review/worker-review-report";
import { ReviewPending } from "@/components/review/review-pending";
import { LiveRefresh } from "@/components/board/live-refresh";

export async function generateMetadata() {
  const t = await getTranslations("workerApp");
  return { title: t("orderTitle") };
}

export default async function WorkerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("worker");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const bundle = await loadOrderBundle(id);
  if (!bundle) notFound();
  const [references, review] = await Promise.all([loadActionReferences(), loadReviewForOrder(id)]);
  const { order } = bundle;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <LiveRefresh channel={`worker-order-${id}`} />
      <OrderView bundle={bundle} />
      {review?.review ? <WorkerReviewReport data={review} /> : null}
      {review && !review.review && review.pending ? <ReviewPending audience="worker" /> : null}
      <OrderActions
        role="worker"
        references={references}
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
