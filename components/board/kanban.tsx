import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { BOARD_COLUMNS, type BoardColumn, type BoardOrder } from "@/lib/board/model";
import { effectiveDueAt } from "@/lib/domain/overdue";
import { PriorityBadge } from "@/components/work-orders/priority-badge";
import { StatusBadge } from "@/components/work-orders/status-badge";
import { cn } from "@/lib/utils";

function OrderCard({ order, overdue }: { order: BoardOrder; overdue: boolean }) {
  const t = useTranslations("board.card");
  const workOrder = useTranslations("workOrder");
  const format = useFormatter();
  const due = effectiveDueAt(order);
  return (
    <Link
      href={`/master/orders/${order.id}`}
      className={cn(
        "bg-surface hover:border-accent flex flex-col gap-2 rounded-lg border-2 p-3 transition-colors",
        order.priority === "emergency"
          ? "border-status-emergency"
          : overdue
            ? "border-danger/70"
            : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold">
          {workOrder("number", { number: order.number })}
        </span>
        <PriorityBadge priority={order.priority} />
      </div>
      <span className="text-sm leading-snug font-semibold">{order.equipmentName}</span>
      <span className="text-muted text-xs">{order.assigneeName ?? t("noAssignee")}</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={order.status} overdue={overdue} />
        {due ? (
          <span
            className={cn("font-mono text-xs", overdue ? "text-danger font-bold" : "text-muted")}
          >
            {t("due", {
              time: format.dateTime(due, {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              }),
            })}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function Kanban({ columns }: { columns: Record<BoardColumn, BoardOrder[]> }) {
  const t = useTranslations("board");
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      {BOARD_COLUMNS.map((column) => (
        <section
          key={column}
          aria-labelledby={`column-${column}`}
          className={cn(
            "bg-surface-raised/40 flex w-72 shrink-0 snap-start flex-col gap-2 rounded-xl border-2 p-2",
            column === "overdue" && columns.overdue.length > 0
              ? "border-danger/60"
              : "border-border",
          )}
        >
          <h2
            id={`column-${column}`}
            className="flex items-center justify-between px-1 py-1 text-sm font-bold uppercase"
          >
            {t(`columns.${column}`)}
            <span className="bg-surface rounded-md px-2 font-mono">{columns[column].length}</span>
          </h2>
          {columns[column].length === 0 ? (
            <p className="text-muted px-1 py-4 text-center text-sm">{t("emptyColumn")}</p>
          ) : null}
          {columns[column].map((order) => (
            <OrderCard key={order.id} order={order} overdue={column === "overdue"} />
          ))}
        </section>
      ))}
    </div>
  );
}
