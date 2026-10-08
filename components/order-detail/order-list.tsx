import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PriorityBadge, type WorkOrderPriority } from "@/components/work-orders/priority-badge";
import { StatusBadge } from "@/components/work-orders/status-badge";
import { effectiveDueAt, isOverdue } from "@/lib/domain/overdue";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import { cn } from "@/lib/utils";

export interface OrderListItem {
  id: string;
  number: number;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  description: string;
  issuedAt: string;
  dueAt: string | null;
  standardHours: number | null;
  equipmentName: string;
  assigneeName: string | null;
  queuePosition: number | null;
}

export async function OrderList({
  items,
  hrefBase,
  emptyLabel,
}: {
  items: OrderListItem[];
  hrefBase: string;
  emptyLabel: string;
}) {
  const [t, format] = await Promise.all([getTranslations("workerApp"), getFormatter()]);
  const workOrder = await getTranslations("workOrder");
  const now = new Date();
  if (items.length === 0) {
    return (
      <p className="border-border text-muted rounded-xl border-2 border-dashed p-6 text-center">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const overdue = isOverdue(item, now);
        const due = effectiveDueAt(item);
        return (
          <li key={item.id}>
            <Link
              href={`${hrefBase}/${item.id}`}
              className={cn(
                "bg-surface hover:border-accent flex flex-col gap-2 rounded-xl border-2 p-4 transition-colors",
                item.priority === "emergency" ? "border-status-emergency" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold">
                  {workOrder("number", { number: item.number })}
                </span>
                <PriorityBadge priority={item.priority} />
                <StatusBadge status={item.status} overdue={overdue} />
                {item.status === "queued" && item.queuePosition ? (
                  <span className="text-muted text-xs">
                    {t("queuePosition", { position: item.queuePosition })}
                  </span>
                ) : null}
              </div>
              <span className="font-semibold">{item.equipmentName}</span>
              <span className="text-muted line-clamp-2 text-sm">{item.description}</span>
              <span className="text-muted flex flex-wrap justify-between gap-2 text-xs">
                <span>{item.assigneeName ?? t("nobody")}</span>
                {due ? (
                  <span className={cn("font-mono", overdue && "text-danger font-bold")}>
                    {t("dueShort", {
                      time: format.dateTime(due, {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
