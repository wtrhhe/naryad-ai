import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { FileSearch } from "lucide-react";
import type { RcaRow } from "@/lib/dashboard/kpi";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { cn } from "@/lib/utils";

export function OpenRca({ items, hrefBase }: { items: RcaRow[]; hrefBase: string }) {
  const t = useTranslations("dashboard.rca");
  const statuses = useTranslations("equipment.rca.status");
  const format = useFormatter();
  return (
    <Panel title={t("title")}>
      {items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${hrefBase}/${item.equipmentId}`}
                className="border-border hover:border-accent flex min-h-14 items-start gap-3 rounded-lg border-2 px-3 py-2 transition-colors"
              >
                <FileSearch className="text-status-queue mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.equipmentName}</span>
                  {item.faultCode ? (
                    <span className="block truncate text-sm">
                      <span className="font-mono font-semibold">{item.faultCode}</span>
                      {" · "}
                      {item.faultName}
                    </span>
                  ) : null}
                  <span className="text-muted block text-xs">
                    {t("opened", {
                      date: format.dateTime(new Date(item.openedAt), {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      }),
                    })}
                    {" · "}
                    {t("orders", { count: item.relatedOrders })}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md border-2 px-2 py-0.5 text-xs font-bold uppercase",
                    item.status === "open"
                      ? "border-status-queue text-status-queue"
                      : "border-status-busy text-status-busy",
                  )}
                >
                  {statuses(item.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
