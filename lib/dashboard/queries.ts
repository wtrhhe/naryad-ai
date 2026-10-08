import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildDashboard,
  loadWindowStart,
  reviewScore,
  type DashboardEquipment,
  type DashboardModel,
  type DashboardOrder,
  type LockoutRow,
  type RcaRow,
} from "@/lib/dashboard/kpi";
import type { PeriodDays } from "@/lib/dashboard/period";
import { OPEN_STATUSES } from "@/lib/domain/work-order-machine";
import { toRiskInsight, type InsightRecord, type RiskInsight } from "@/lib/equipment/risk";

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const ORDER_COLUMNS =
  "id, number, kind, status, issued_at, accepted_at, started_at, done_at, closed_at, due_at, standard_hours, paused_seconds, downtime_started_at, downtime_ended_at, downtime_cost, equipment_id, fault_code_id, assignee_id, assignee:employees!work_orders_assignee_id_fkey(full_name), ai_reviews(revision, score, master_score)";

interface OrderRecord {
  id: string;
  number: number;
  kind: DashboardOrder["kind"];
  status: DashboardOrder["status"];
  issued_at: string;
  accepted_at: string | null;
  started_at: string | null;
  done_at: string | null;
  closed_at: string | null;
  due_at: string | null;
  standard_hours: number | null;
  paused_seconds: number;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  downtime_cost: number | null;
  equipment_id: string;
  fault_code_id: string | null;
  assignee_id: string | null;
  assignee: { full_name: string } | null;
  ai_reviews: { revision: number; score: number | null; master_score: number | null }[] | null;
}

interface EquipmentRecord {
  id: string;
  name: string;
  inventory_number: string;
  criticality: number;
  downtime_cost_per_hour: number;
  site: { name: string } | null;
}

interface LockoutRecord {
  id: string;
  equipment_id: string;
  locked_at: string;
  equipment: { name: string } | null;
  work_order: { number: number } | null;
  locker: { full_name: string } | null;
}

interface RcaRecord {
  id: string;
  equipment_id: string;
  status: "open" | "in_progress" | "closed";
  opened_at: string;
  related_order_ids: string[] | null;
  equipment: { name: string } | null;
  fault_code: { code: string; name: string } | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toOrder(row: OrderRecord): DashboardOrder {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    issuedAt: row.issued_at,
    acceptedAt: row.accepted_at,
    startedAt: row.started_at,
    doneAt: row.done_at,
    closedAt: row.closed_at,
    dueAt: row.due_at,
    standardHours: toNumber(row.standard_hours),
    pausedSeconds: row.paused_seconds ?? 0,
    downtimeStartedAt: row.downtime_started_at,
    downtimeEndedAt: row.downtime_ended_at,
    downtimeCost: toNumber(row.downtime_cost),
    equipmentId: row.equipment_id,
    faultCodeId: row.fault_code_id,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee?.full_name ?? null,
    score: reviewScore(
      (row.ai_reviews ?? []).map((review) => ({
        revision: review.revision,
        score: toNumber(review.score),
        masterScore: toNumber(review.master_score),
      })),
    ),
  };
}

async function loadOrders(since: Date): Promise<DashboardOrder[]> {
  const supabase = await createSupabaseServerClient();
  const from = since.toISOString();
  const filter = [
    `issued_at.gte.${from}`,
    `closed_at.gte.${from}`,
    `done_at.gte.${from}`,
    `downtime_ended_at.gte.${from}`,
    `status.in.(${OPEN_STATUSES.join(",")})`,
    "and(downtime_started_at.not.is.null,downtime_ended_at.is.null)",
  ].join(",");
  const rows: OrderRecord[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("work_orders")
      .select(ORDER_COLUMNS)
      .or(filter)
      .order("issued_at", { ascending: false })
      .order("id")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load dashboard orders: ${error.message}`);
    const batch = (data ?? []) as unknown as OrderRecord[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows.map(toOrder);
}

export async function loadRiskInsights(): Promise<RiskInsight[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("insights")
    .select("id, kind, entity_id, severity, metrics, summary, recommendation, created_at")
    .eq("entity_type", "equipment")
    .ilike("kind", "%risk%")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to load risk insights: ${error.message}`);
  return ((data ?? []) as InsightRecord[])
    .map(toRiskInsight)
    .filter((item): item is RiskInsight => item !== null);
}

export async function loadDashboard(days: PeriodDays, now: Date): Promise<DashboardModel> {
  const supabase = await createSupabaseServerClient();
  const [orders, equipment, lockouts, rca, insights] = await Promise.all([
    loadOrders(loadWindowStart(now, days)),
    supabase
      .from("equipment")
      .select("id, name, inventory_number, criticality, downtime_cost_per_hour, site:site_id(name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("lockouts")
      .select(
        "id, equipment_id, locked_at, equipment:equipment_id(name), work_order:work_order_id(number), locker:employees!lockouts_locked_by_fkey(full_name)",
      )
      .is("released_at", null)
      .order("locked_at", { ascending: false }),
    supabase
      .from("rca_cases")
      .select(
        "id, equipment_id, status, opened_at, related_order_ids, equipment:equipment_id(name), fault_code:fault_code_id(code, name)",
      )
      .neq("status", "closed")
      .order("opened_at", { ascending: false }),
    loadRiskInsights(),
  ]);
  const failure = equipment.error ?? lockouts.error ?? rca.error;
  if (failure) throw new Error(`Failed to load the dashboard: ${failure.message}`);
  const units: DashboardEquipment[] = ((equipment.data ?? []) as unknown as EquipmentRecord[]).map(
    (row) => ({
      id: row.id,
      name: row.name,
      inventoryNumber: row.inventory_number,
      siteName: row.site?.name ?? "",
      criticality: row.criticality,
      downtimeCostPerHour: Number(row.downtime_cost_per_hour ?? 0),
    }),
  );
  const lockoutRows: LockoutRow[] = ((lockouts.data ?? []) as unknown as LockoutRecord[]).map(
    (row) => ({
      id: row.id,
      equipmentId: row.equipment_id,
      equipmentName: row.equipment?.name ?? "",
      orderNumber: row.work_order?.number ?? null,
      lockedAt: row.locked_at,
      lockedBy: row.locker?.full_name ?? null,
    }),
  );
  const rcaRows: RcaRow[] = ((rca.data ?? []) as unknown as RcaRecord[])
    .filter((row) => row.status !== "closed")
    .map((row) => ({
      id: row.id,
      equipmentId: row.equipment_id,
      equipmentName: row.equipment?.name ?? "",
      faultCode: row.fault_code?.code ?? null,
      faultName: row.fault_code?.name ?? null,
      status: row.status === "in_progress" ? "in_progress" : "open",
      openedAt: row.opened_at,
      relatedOrders: row.related_order_ids?.length ?? 0,
    }));
  return buildDashboard(
    { orders, equipment: units, lockouts: lockoutRows, rca: rcaRows, insights },
    now,
    days,
  );
}
