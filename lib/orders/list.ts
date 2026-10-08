import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderListItem } from "@/components/order-detail/order-list";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";

const COLUMNS =
  "id, number, status, priority, description, issued_at, due_at, standard_hours, queue_position, equipment:equipment_id(name), assignee:employees!work_orders_assignee_id_fkey(full_name)";

const PRIORITY_RANK: Record<string, number> = { emergency: 0, high: 1, normal: 2, planned: 3 };

interface Row {
  id: string;
  number: number;
  status: WorkOrderStatus;
  priority: OrderListItem["priority"];
  description: string;
  issued_at: string;
  due_at: string | null;
  standard_hours: number | null;
  queue_position: number | null;
  equipment: { name: string } | null;
  assignee: { full_name: string } | null;
}

function toItem(row: Row): OrderListItem {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    priority: row.priority,
    description: row.description,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    standardHours: row.standard_hours === null ? null : Number(row.standard_hours),
    equipmentName: row.equipment?.name ?? "",
    assigneeName: row.assignee?.full_name ?? null,
    queuePosition: row.queue_position,
  };
}

export const OPEN_LIST_STATUSES: WorkOrderStatus[] = [
  "issued",
  "queued",
  "accepted",
  "in_progress",
  "paused",
  "rework",
  "done",
  "ai_review",
  "rejected",
];

export async function loadOrders(options: {
  statuses: WorkOrderStatus[];
  assigneeId?: string;
  limit?: number;
}): Promise<OrderListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("work_orders")
    .select(COLUMNS)
    .in("status", options.statuses)
    .order("issued_at", { ascending: false })
    .limit(options.limit ?? 100);
  if (options.assigneeId) query = query.eq("assignee_id", options.assigneeId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map(toItem);
}

const WORKER_STATUS_RANK: Partial<Record<WorkOrderStatus, number>> = {
  in_progress: 0,
  paused: 1,
  rework: 2,
  accepted: 3,
  issued: 4,
  queued: 5,
  done: 6,
  ai_review: 7,
};

export function sortForWorker(items: OrderListItem[]): OrderListItem[] {
  return [...items].sort(
    (a, b) =>
      (a.priority === "emergency" && a.status === "issued" ? -1 : 0) -
        (b.priority === "emergency" && b.status === "issued" ? -1 : 0) ||
      (WORKER_STATUS_RANK[a.status] ?? 9) - (WORKER_STATUS_RANK[b.status] ?? 9) ||
      (a.queuePosition ?? 0) - (b.queuePosition ?? 0) ||
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
  );
}
