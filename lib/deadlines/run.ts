import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { planDeadlineNotifications } from "@/lib/deadlines/rules";
import { renderDeadlineNotification } from "@/lib/deadlines/messages";
import {
  localeOf,
  toDeadlineOrder,
  toDeadlineSettings,
  toReplacementCandidates,
  type EmployeeRow,
  type OrderRow,
} from "@/lib/deadlines/snapshot";
import type { DeadlineOrder, PlannedNotification } from "@/lib/deadlines/types";

const OPEN_STATUSES = ["issued", "queued", "accepted", "in_progress", "paused", "rework"] as const;

const ORDER_COLUMNS =
  "id, number, status, priority, issued_at, queued_at, accepted_at, started_at, paused_at, due_at, standard_hours, assignee_id, master_id, last_comment, updated_at, equipment:equipment_id(name), site:site_id(name)";

export interface DeadlineRunResult {
  planned: number;
  inserted: number;
}

async function loadSnapshot() {
  const admin = getSupabaseAdminClient();
  const [orders, employees, settings] = await Promise.all([
    admin
      .from("work_orders")
      .select(ORDER_COLUMNS)
      .in("status", [...OPEN_STATUSES]),
    admin.from("employees").select("id, full_name, role, specialty, on_shift, locale, is_active"),
    admin.from("settings").select("key, value").or("key.like.deadline.%,key.eq.demo.time_scale"),
  ]);
  const failure = orders.error ?? employees.error ?? settings.error;
  if (failure) {
    throw new Error(`deadline snapshot failed: ${failure.message}`);
  }
  return {
    orders: (orders.data ?? []) as unknown as OrderRow[],
    employees: (employees.data ?? []) as EmployeeRow[],
    settings: toDeadlineSettings(settings.data ?? []),
  };
}

function recipientsOf(planned: PlannedNotification, employees: readonly EmployeeRow[]): string[] {
  if (planned.recipient.kind === "employee") {
    return [planned.recipient.employeeId];
  }
  return employees
    .filter((employee) => employee.role === "manager" && employee.is_active)
    .map((employee) => employee.id);
}

function toRows(
  planned: PlannedNotification,
  order: DeadlineOrder,
  employees: readonly EmployeeRow[],
) {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return recipientsOf(planned, employees).map((recipientId) => {
    const text = renderDeadlineNotification(planned, order, localeOf(byId, recipientId));
    const payload: Json = {
      order_number: order.number,
      replacement_id: planned.replacement?.employeeId ?? null,
      url:
        planned.kind === "accept_escalation"
          ? `/master/orders/${order.id}?action=reassign`
          : `/worker/orders/${order.id}`,
    };
    return {
      recipient_id: recipientId,
      kind: planned.kind,
      title: text.title,
      body: text.body,
      work_order_id: order.id,
      payload,
      is_urgent: planned.urgent,
      dedupe_key:
        planned.recipient.kind === "managers"
          ? `${planned.dedupeKey}:${recipientId}`
          : planned.dedupeKey,
    };
  });
}

export async function runDeadlineWatcher(now: Date = new Date()): Promise<DeadlineRunResult> {
  const snapshot = await loadSnapshot();
  const employeesById = new Map(snapshot.employees.map((employee) => [employee.id, employee]));
  const orders = snapshot.orders.map((row) => toDeadlineOrder(row, employeesById));
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const candidates = toReplacementCandidates(snapshot.employees, snapshot.orders);
  const planned = planDeadlineNotifications(orders, candidates, snapshot.settings, now);
  const rows = planned.flatMap((item) => {
    const order = ordersById.get(item.orderId);
    return order ? toRows(item, order, snapshot.employees) : [];
  });
  if (rows.length === 0) {
    return { planned: 0, inserted: 0 };
  }
  const { data, error } = await getSupabaseAdminClient()
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) {
    throw new Error(`deadline notifications insert failed: ${error.message}`);
  }
  return { planned: rows.length, inserted: data?.length ?? 0 };
}
