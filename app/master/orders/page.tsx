import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { loadOrders, OPEN_LIST_STATUSES } from "@/lib/orders/list";
import { OrderList } from "@/components/order-detail/order-list";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

const GROUPS = ["open", "closed"] as const;

export async function generateMetadata() {
  const t = await getTranslations("workerApp");
  return { title: t("ordersTitle") };
}

export default async function MasterOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  await requireRole("master");
  const { group: raw } = await searchParams;
  const group = raw === "closed" ? "closed" : "open";
  const t = await getTranslations("workerApp");
  const items = await loadOrders({
    statuses: group === "open" ? OPEN_LIST_STATUSES : ["closed", "cancelled"],
    limit: 100,
  });
  return (
    <>
      <PageHeader title={t("ordersTitle")} />
      <div className="mb-4 flex gap-2">
        {GROUPS.map((item) => (
          <Link
            key={item}
            href={`/master/orders?group=${item}`}
            className={cn(
              "min-h-11 rounded-lg border-2 px-4 py-2 font-semibold",
              item === group ? "border-accent bg-accent/15" : "border-border",
            )}
          >
            {t(`groups.${item}`)}
          </Link>
        ))}
      </div>
      <OrderList items={items} hrefBase="/master/orders" emptyLabel={t("emptyOrders")} />
    </>
  );
}
