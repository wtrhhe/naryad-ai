import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/roles";
import type {
  AssistantGateway,
  EquipmentRef,
  FaultRef,
  InsightRecord,
  OrderRecord,
  RcaRecord,
  SiteRef,
  WorkerRecord,
} from "@/lib/assistant/types";

const OPEN_STATUSES = "(issued,queued,accepted,rejected,in_progress,paused,done,ai_review,rework)";
const ORDER_LIMIT = 2000;

const ORDER_COLUMNS =
  "id, number, kind, priority, status, description, site_id, equipment_id, issued_at, due_at, standard_hours, done_at, closed_at, rejected_at, cancelled_at, downtime_started_at, downtime_ended_at, site:site_id(name), equipment:equipment_id(name, downtime_cost_per_hour), assignee:employees!work_orders_assignee_id_fkey(full_name), fault:fault_codes!work_orders_fault_code_id_fkey(code, name)";

interface OrderRow {
  id: string;
  number: number;
  kind: OrderRecord["kind"];
  priority: OrderRecord["priority"];
  status: OrderRecord["status"];
  description: string;
  site_id: string;
  equipment_id: string;
  issued_at: string;
  due_at: string | null;
  standard_hours: number | null;
  done_at: string | null;
  closed_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  site: { name: string } | null;
  equipment: { name: string; downtime_cost_per_hour: number } | null;
  assignee: { full_name: string } | null;
  fault: FaultRef | null;
}

interface RcaRow {
  id: string;
  equipment_id: string;
  status: RcaRecord["status"];
  root_cause: string | null;
  opened_at: string;
  equipment: { name: string } | null;
  fault: FaultRef | null;
}

function toOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    priority: row.priority,
    status: row.status,
    description: row.description,
    siteId: row.site_id,
    siteName: row.site?.name ?? "",
    equipmentId: row.equipment_id,
    equipmentName: row.equipment?.name ?? "",
    downtimeCostPerHour: Number(row.equipment?.downtime_cost_per_hour ?? 0),
    assigneeName: row.assignee?.full_name ?? null,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    standardHours: row.standard_hours === null ? null : Number(row.standard_hours),
    doneAt: row.done_at,
    closedAt: row.closed_at,
    rejectedAt: row.rejected_at,
    cancelledAt: row.cancelled_at,
    downtimeStartedAt: row.downtime_started_at,
    downtimeEndedAt: row.downtime_ended_at,
    faultCode: row.fault,
  };
}

function check<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string,
): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data as T;
}

export interface GatewayViewer {
  id: string;
  role: AppRole;
}

export async function createRlsGateway(viewer: GatewayViewer): Promise<AssistantGateway> {
  const supabase = await createSupabaseServerClient();

  const orders = (rows: unknown) => ((rows ?? []) as OrderRow[]).map(toOrder);

  return {
    async sites(): Promise<SiteRef[]> {
      const data = check(
        await supabase.from("sites").select("id, name, code").eq("is_active", true).order("name"),
        "sites",
      );
      return data ?? [];
    },
    async equipment(): Promise<EquipmentRef[]> {
      const data = check(
        await supabase
          .from("equipment")
          .select("id, name, inventory_number, site_id, downtime_cost_per_hour")
          .eq("is_active", true)
          .order("name"),
        "equipment",
      );
      return (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        inventoryNumber: item.inventory_number,
        siteId: item.site_id,
        downtimeCostPerHour: Number(item.downtime_cost_per_hour),
      }));
    },
    async workers(): Promise<WorkerRecord[]> {
      const [board, brigades, links] = await Promise.all([
        supabase.rpc("assignee_board", {}),
        supabase.from("brigades").select("id, site_id"),
        supabase.from("employee_sites").select("employee_id, site_id"),
      ]);
      const rows = check(board, "assignee_board") ?? [];
      const brigadeSite = new Map(
        (check(brigades, "brigades") ?? []).map((brigade) => [brigade.id, brigade.site_id]),
      );
      const extraSites = (check(links, "employee_sites") ?? []).reduce((map, link) => {
        map.set(link.employee_id, [...(map.get(link.employee_id) ?? []), link.site_id]);
        return map;
      }, new Map<string, string[]>());
      return rows.map((row) => {
        const brigadeSiteId = row.brigade_id ? brigadeSite.get(row.brigade_id) : null;
        const siteIds = [
          ...(brigadeSiteId ? [brigadeSiteId] : []),
          ...(extraSites.get(row.employee_id) ?? []),
        ];
        return {
          id: row.employee_id,
          fullName: row.full_name,
          specialty: row.specialty,
          onShift: row.on_shift,
          activeOrderNumber: row.active_order_number,
          queueLength: row.queue_length,
          siteIds: [...new Set(siteIds)],
        };
      });
    },
    async openOrders(): Promise<OrderRecord[]> {
      return orders(
        check(
          await supabase
            .from("work_orders")
            .select(ORDER_COLUMNS)
            .filter("status", "in", OPEN_STATUSES)
            .order("issued_at", { ascending: false })
            .limit(ORDER_LIMIT),
          "open orders",
        ),
      );
    },
    async ordersActiveBetween(from: Date, to: Date): Promise<OrderRecord[]> {
      const start = from.toISOString();
      return orders(
        check(
          await supabase
            .from("work_orders")
            .select(ORDER_COLUMNS)
            .lt("issued_at", to.toISOString())
            .or(
              `and(closed_at.is.null,cancelled_at.is.null),closed_at.gte.${start},cancelled_at.gte.${start}`,
            )
            .order("issued_at", { ascending: false })
            .limit(ORDER_LIMIT),
          "shift orders",
        ),
      );
    },
    async ordersIssuedSince(since, scope): Promise<OrderRecord[]> {
      let query = supabase
        .from("work_orders")
        .select(ORDER_COLUMNS)
        .gte("issued_at", since.toISOString());
      if (scope.siteId) query = query.eq("site_id", scope.siteId);
      if (scope.equipmentId) query = query.eq("equipment_id", scope.equipmentId);
      return orders(
        check(
          await query.order("issued_at", { ascending: false }).limit(ORDER_LIMIT),
          "orders since",
        ),
      );
    },
    async insightsSince(since: Date): Promise<InsightRecord[]> {
      const data = check(
        await supabase
          .from("insights")
          .select("id, kind, severity, summary, recommendation, entity_type, entity_id, created_at")
          .gte("created_at", since.toISOString())
          .order("severity", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
        "insights",
      );
      return (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        severity: row.severity,
        summary: row.summary,
        recommendation: row.recommendation,
        entityType: row.entity_type,
        entityId: row.entity_id,
        createdAt: row.created_at,
      }));
    },
    async openRca(equipmentIds): Promise<RcaRecord[]> {
      if (equipmentIds.length === 0) {
        return [];
      }
      const data = check(
        await supabase
          .from("rca_cases")
          .select(
            "id, equipment_id, status, root_cause, opened_at, equipment:equipment_id(name), fault:fault_code_id(code, name)",
          )
          .neq("status", "closed")
          .in("equipment_id", [...equipmentIds])
          .order("opened_at", { ascending: false })
          .limit(20),
        "rca cases",
      );
      return ((data ?? []) as unknown as RcaRow[]).map((row) => ({
        id: row.id,
        equipmentId: row.equipment_id,
        equipmentName: row.equipment?.name ?? "",
        status: row.status,
        faultCode: row.fault,
        rootCause: row.root_cause,
        openedAt: row.opened_at,
      }));
    },
    async viewerSiteIds(): Promise<string[] | null> {
      if (viewer.role !== "master") {
        return null;
      }
      const data = check(
        await supabase.from("employee_sites").select("site_id").eq("employee_id", viewer.id),
        "viewer sites",
      );
      return (data ?? []).map((row) => row.site_id);
    },
  };
}
