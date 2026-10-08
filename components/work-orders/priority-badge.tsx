import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type WorkOrderPriority = Database["public"]["Enums"]["work_order_priority"];

const PRIORITY_STYLES: Record<WorkOrderPriority, string> = {
  emergency: "bg-status-emergency text-danger-foreground",
  high: "bg-accent text-accent-foreground",
  normal: "bg-surface-raised text-foreground",
  planned: "bg-surface-raised text-muted",
};

export function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  const t = useTranslations("workOrder");
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-bold tracking-wide uppercase",
        PRIORITY_STYLES[priority],
      )}
    >
      {priority === "emergency" ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
      {t(`priority.${priority}`)}
    </span>
  );
}
