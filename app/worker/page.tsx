import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { loadOrders, sortForWorker } from "@/lib/orders/list";
import { OrderList } from "@/components/order-detail/order-list";
import { PageHeader } from "@/components/ui/page-header";
import { LiveRefresh } from "@/components/board/live-refresh";

export async function generateMetadata() {
  const t = await getTranslations("shell");
  return { title: t("pages.workerOrders") };
}

export default async function WorkerOrdersPage() {
  const employee = await requireRole("worker");
  const [t, shell] = await Promise.all([getTranslations("workerApp"), getTranslations("shell")]);
  const items = sortForWorker(
    await loadOrders({
      statuses: [
        "issued",
        "queued",
        "accepted",
        "in_progress",
        "paused",
        "rework",
        "done",
        "ai_review",
      ],
      assigneeId: employee.id,
    }),
  );
  return (
    <>
      <PageHeader
        title={shell("pages.workerOrders")}
        actions={<LiveRefresh channel="worker-orders" />}
      />
      <OrderList items={items} hrefBase="/worker/orders" emptyLabel={t("emptyMine")} />
    </>
  );
}
