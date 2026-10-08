import { resolveLocale, type Locale } from "@/i18n/config";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import type { WorkOrderPriority } from "@/components/work-orders/priority-badge";
import {
  DEFAULT_DEADLINE_SETTINGS,
  type DeadlineOrder,
  type DeadlineSettings,
  type ReplacementCandidate,
} from "@/lib/deadlines/types";

export interface OrderRow {
  id: string;
  number: number;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  issued_at: string;
  queued_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  due_at: string | null;
  standard_hours: number | null;
  assignee_id: string | null;
  master_id: string;
  last_comment: string | null;
  updated_at: string;
  equipment: { name: string } | null;
  site: { name: string } | null;
}

export interface EmployeeRow {
  id: string;
  full_name: string;
  role: string;
  specialty: string | null;
  on_shift: boolean;
  locale: string;
  is_active: boolean;
}

const BUSY_STATUSES: readonly WorkOrderStatus[] = ["accepted", "in_progress", "paused", "rework"];

export function statusSince(row: OrderRow): string {
  const byStatus: Partial<Record<WorkOrderStatus, string | null>> = {
    issued: row.issued_at,
    queued: row.queued_at,
    accepted: row.accepted_at,
    in_progress: row.paused_at ? row.updated_at : row.started_at,
    paused: row.paused_at,
  };
  return byStatus[row.status] ?? row.updated_at;
}

export function toDeadlineOrder(
  row: OrderRow,
  employees: ReadonlyMap<string, EmployeeRow>,
): DeadlineOrder {
  const assignee = row.assignee_id ? employees.get(row.assignee_id) : undefined;
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    priority: row.priority,
    issuedAt: row.issued_at,
    statusSince: statusSince(row),
    dueAt: row.due_at,
    standardHours: row.standard_hours,
    assigneeId: row.assignee_id,
    assigneeName: assignee?.full_name ?? null,
    assigneeSpecialty: assignee?.specialty ?? null,
    masterId: row.master_id,
    equipmentName: row.equipment?.name ?? "",
    siteName: row.site?.name ?? "",
    lastComment: row.last_comment,
  };
}

export function toReplacementCandidates(
  employees: readonly EmployeeRow[],
  orders: readonly OrderRow[],
): ReplacementCandidate[] {
  const busy = new Set(
    orders
      .filter((order) => BUSY_STATUSES.includes(order.status))
      .map((order) => order.assignee_id),
  );
  return employees
    .filter((employee) => employee.role === "worker" && employee.is_active)
    .map((employee) => ({
      employeeId: employee.id,
      fullName: employee.full_name,
      specialty: employee.specialty,
      onShift: employee.on_shift,
      busy: busy.has(employee.id),
    }));
}

const SETTING_KEYS: Record<string, keyof DeadlineSettings> = {
  "deadline.reminder_minutes": "reminderMinutes",
  "deadline.accept_timeout_minutes": "acceptTimeoutMinutes",
  "deadline.accept_timeout_emergency_minutes": "acceptTimeoutEmergencyMinutes",
  "deadline.repeat_interval_minutes": "repeatIntervalMinutes",
  "deadline.manager_escalation_minutes": "managerEscalationMinutes",
  "demo.time_scale": "timeScale",
};

export function toDeadlineSettings(
  rows: readonly { key: string; value: unknown }[],
): DeadlineSettings {
  return rows.reduce<DeadlineSettings>((settings, row) => {
    const field = SETTING_KEYS[row.key];
    const value = Number(row.value);
    return field && Number.isFinite(value) && value > 0
      ? { ...settings, [field]: value }
      : settings;
  }, DEFAULT_DEADLINE_SETTINGS);
}

export function localeOf(employees: ReadonlyMap<string, EmployeeRow>, id: string): Locale {
  return resolveLocale(employees.get(id)?.locale);
}
