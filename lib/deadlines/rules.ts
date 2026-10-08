import { effectiveDueAt } from "@/lib/domain/overdue";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import type {
  DeadlineOrder,
  DeadlineSettings,
  PlannedNotification,
  ReplacementCandidate,
} from "@/lib/deadlines/types";

const MS_PER_MINUTE = 60_000;

const DEADLINE_STATUSES: readonly WorkOrderStatus[] = [
  "issued",
  "queued",
  "accepted",
  "in_progress",
  "paused",
  "rework",
];

function virtualMinutes(fromMs: number, toMs: number, settings: DeadlineSettings): number {
  return ((toMs - fromMs) / MS_PER_MINUTE) * Math.max(settings.timeScale, 1);
}

function base(order: DeadlineOrder) {
  return {
    orderId: order.id,
    overdueMinutes: 0,
    minutesLeft: 0,
    waitingMinutes: 0,
    replacement: null,
  };
}

function reminder(
  order: DeadlineOrder,
  dueMs: number,
  nowMs: number,
  settings: DeadlineSettings,
): PlannedNotification[] {
  const left = virtualMinutes(nowMs, dueMs, settings);
  if (!order.assigneeId || left <= 0 || left > settings.reminderMinutes) {
    return [];
  }
  return [
    {
      ...base(order),
      kind: "deadline_reminder",
      recipient: { kind: "employee", employeeId: order.assigneeId },
      dedupeKey: `deadline_reminder:${order.id}`,
      urgent: order.priority === "emergency",
      minutesLeft: Math.ceil(left),
    },
  ];
}

function overdue(
  order: DeadlineOrder,
  dueMs: number,
  nowMs: number,
  settings: DeadlineSettings,
): PlannedNotification[] {
  const late = virtualMinutes(dueMs, nowMs, settings);
  if (late <= 0) {
    return [];
  }
  const bucket = Math.floor(late / settings.repeatIntervalMinutes);
  const overdueMinutes = Math.floor(late);
  const recipients = [order.assigneeId, order.masterId].filter((id): id is string => id !== null);
  const personal = [...new Set(recipients)].map((employeeId): PlannedNotification => ({
    ...base(order),
    kind: "overdue",
    recipient: { kind: "employee", employeeId },
    dedupeKey: `overdue:${order.id}:${employeeId}:${bucket}`,
    urgent: true,
    overdueMinutes,
  }));
  const managers: PlannedNotification[] =
    late >= settings.managerEscalationMinutes
      ? [
          {
            ...base(order),
            kind: "manager_overdue",
            recipient: { kind: "managers" },
            dedupeKey: `manager_overdue:${order.id}`,
            urgent: true,
            overdueMinutes,
          },
        ]
      : [];
  return [...personal, ...managers];
}

function acceptEscalation(
  order: DeadlineOrder,
  nowMs: number,
  settings: DeadlineSettings,
  replacement: ReplacementCandidate | null,
): PlannedNotification[] {
  if (order.status !== "issued") {
    return [];
  }
  const timeout =
    order.priority === "emergency"
      ? settings.acceptTimeoutEmergencyMinutes
      : settings.acceptTimeoutMinutes;
  const waiting = virtualMinutes(new Date(order.issuedAt).getTime(), nowMs, settings);
  if (waiting < timeout) {
    return [];
  }
  const bucket = Math.floor((waiting - timeout) / settings.repeatIntervalMinutes);
  return [
    {
      ...base(order),
      kind: "accept_escalation",
      recipient: { kind: "employee", employeeId: order.masterId },
      dedupeKey: `accept_escalation:${order.id}:${bucket}`,
      urgent: true,
      waitingMinutes: Math.floor(waiting),
      replacement,
    },
  ];
}

export function pickReplacement(
  order: DeadlineOrder,
  candidates: readonly ReplacementCandidate[],
): ReplacementCandidate | null {
  const available = candidates.filter(
    (candidate) =>
      candidate.onShift && !candidate.busy && candidate.employeeId !== order.assigneeId,
  );
  const sameSpecialty = available.find(
    (candidate) => candidate.specialty === order.assigneeSpecialty,
  );
  return sameSpecialty ?? available[0] ?? null;
}

export function planDeadlineNotifications(
  orders: readonly DeadlineOrder[],
  candidates: readonly ReplacementCandidate[],
  settings: DeadlineSettings,
  now: Date,
): PlannedNotification[] {
  const nowMs = now.getTime();
  return orders
    .filter((order) => DEADLINE_STATUSES.includes(order.status))
    .flatMap((order) => {
      const due = effectiveDueAt(order);
      const timed = due
        ? [
            ...reminder(order, due.getTime(), nowMs, settings),
            ...overdue(order, due.getTime(), nowMs, settings),
          ]
        : [];
      return [
        ...timed,
        ...acceptEscalation(order, nowMs, settings, pickReplacement(order, candidates)),
      ];
    });
}
