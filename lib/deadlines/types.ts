import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import type { WorkOrderPriority } from "@/components/work-orders/priority-badge";

export interface DeadlineOrder {
  id: string;
  number: number;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  issuedAt: string;
  statusSince: string;
  dueAt: string | null;
  standardHours: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeSpecialty: string | null;
  masterId: string;
  equipmentName: string;
  siteName: string;
  lastComment: string | null;
}

export interface DeadlineSettings {
  reminderMinutes: number;
  acceptTimeoutMinutes: number;
  acceptTimeoutEmergencyMinutes: number;
  repeatIntervalMinutes: number;
  managerEscalationMinutes: number;
  timeScale: number;
}

export type DeadlineNotificationKind =
  "deadline_reminder" | "overdue" | "accept_escalation" | "manager_overdue";

export type DeadlineRecipient = { kind: "employee"; employeeId: string } | { kind: "managers" };

export interface ReplacementCandidate {
  employeeId: string;
  fullName: string;
  specialty: string | null;
  onShift: boolean;
  busy: boolean;
}

export interface PlannedNotification {
  kind: DeadlineNotificationKind;
  orderId: string;
  recipient: DeadlineRecipient;
  dedupeKey: string;
  urgent: boolean;
  overdueMinutes: number;
  minutesLeft: number;
  waitingMinutes: number;
  replacement: ReplacementCandidate | null;
}

export const DEFAULT_DEADLINE_SETTINGS: DeadlineSettings = {
  reminderMinutes: 30,
  acceptTimeoutMinutes: 10,
  acceptTimeoutEmergencyMinutes: 3,
  repeatIntervalMinutes: 15,
  managerEscalationMinutes: 120,
  timeScale: 1,
};
