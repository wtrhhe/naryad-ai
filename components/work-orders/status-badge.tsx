import { useTranslations } from "next-intl";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<WorkOrderStatus, string> = {
  issued: "border-status-queue text-status-queue",
  queued: "border-status-queue bg-status-queue/15 text-status-queue",
  accepted: "border-status-busy text-status-busy",
  rejected: "border-danger text-danger",
  in_progress: "border-status-busy bg-status-busy/15 text-status-busy",
  paused: "border-status-off bg-status-off/15 text-muted",
  done: "border-status-free text-status-free",
  ai_review: "border-accent bg-accent/15 text-accent",
  closed: "border-status-free bg-status-free/15 text-status-free",
  rework: "border-danger bg-danger/15 text-danger",
  cancelled: "border-status-off text-muted line-through",
};

export function StatusBadge({
  status,
  overdue = false,
}: {
  status: WorkOrderStatus;
  overdue?: boolean;
}) {
  const t = useTranslations("workOrder");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex min-h-7 items-center rounded-md border-2 px-2 text-xs font-bold tracking-wide uppercase",
          STATUS_STYLES[status],
        )}
      >
        {t(`status.${status}`)}
      </span>
      {overdue ? (
        <span className="bg-danger text-danger-foreground inline-flex min-h-7 items-center rounded-md px-2 text-xs font-bold tracking-wide uppercase">
          {t("overdue")}
        </span>
      ) : null}
    </span>
  );
}
