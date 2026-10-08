import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { loadOrders } from "@/lib/orders/list";
import { OrderList } from "@/components/order-detail/order-list";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata() {
  const t = await getTranslations("workerApp");
  return { title: t("historyTitle") };
}

export default async function WorkerHistoryPage() {
  const employee = await requireRole("worker");
  const t = await getTranslations("workerApp");
  const items = await loadOrders({
    statuses: ["closed", "cancelled", "rejected"],
    assigneeId: employee.id,
    limit: 50,
  });
  return (
    <>
      <PageHeader title={t("historyTitle")} />
      <OrderList items={items} hrefBase="/worker/orders" emptyLabel={t("emptyHistory")} />
    </>
  );
}
