import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BoardOrder, BoardWorker } from "@/lib/board/model";
import type { ShiftWindow } from "@/lib/board/shift";

const OPEN = "(issued,queued,accepted,in_progress,paused,done,ai_review,rework)";

const ORDER_COLUMNS =
  "id, number, status, priority, kind, issued_at, due_at, standard_hours, closed_at, downtime_started_at, downtime_ended_at, site_id, equipment_id, assignee_id, equipment:equipment_id(name, downtime_cost_per_hour), assignee:employees!work_orders_assignee_id_fkey(full_name)";

interface OrderRecord {
  id: string;
  number: number;
  status: BoardOrder["status"];
  priority: BoardOrder["priority"];
  kind: BoardOrder["kind"];
  issued_at: string;
  due_at: string | null;
  standard_hours: number | null;
  closed_at: string | null;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  site_id: string;
  equipment_id: string;
  assignee_id: string | null;
  equipment: { name: string; downtime_cost_per_hour: number } | null;
  assignee: { full_name: string } | null;
}

function toBoardOrder(row: OrderRecord): BoardOrder {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    priority: row.priority,
    kind: row.kind,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    standardHours: row.standard_hours,
    closedAt: row.closed_at,
    downtimeStartedAt: row.downtime_started_at,
    downtimeEndedAt: row.downtime_ended_at,
    siteId: row.site_id,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment?.name ?? "",
    downtimeCostPerHour: Number(row.equipment?.downtime_cost_per_hour ?? 0),
    assigneeId: row.assignee_id,
    assigneeName: row.assignee?.full_name ?? null,
  };
}

export interface BoardData {
  orders: BoardOrder[];
  workers: BoardWorker[];
  sites: { id: string; name: string }[];
  equipment: { id: string; name: string; siteId: string }[];
}

export async function loadBoard(shift: ShiftWindow): Promise<BoardData> {
  const supabase = await createSupabaseServerClient();
  const [orders, workers, sites, equipment] = await Promise.all([
    supabase
      .from("work_orders")
      .select(ORDER_COLUMNS)
      .or(`status.in.${OPEN},closed_at.gte.${shift.start.toISOString()}`)
      .order("issued_at", { ascending: false })
      .limit(500),
    supabase.rpc("assignee_board", {}),
    supabase.from("sites").select("id, name").eq("is_active", true).order("name"),
    supabase.from("equipment").select("id, name, site_id").eq("is_active", true).order("name"),
  ]);
  const failure = orders.error ?? workers.error ?? sites.error ?? equipment.error;
  if (failure) {
    throw new Error(`Failed to load the shift board: ${failure.message}`);
  }
  return {
    orders: ((orders.data ?? []) as unknown as OrderRecord[]).map(toBoardOrder),
    workers: (workers.data ?? []).map((row) => ({
      id: row.employee_id,
      fullName: row.full_name,
      specialty: row.specialty,
      onShift: row.on_shift,
      activeOrderNumber: row.active_order_number,
      queueLength: row.queue_length,
    })),
    sites: sites.data ?? [],
    equipment: (equipment.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      siteId: item.site_id,
    })),
  };
}
