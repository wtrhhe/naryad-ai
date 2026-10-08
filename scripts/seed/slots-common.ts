import type { SeedContext } from "./context";
import { MS_PER_HOUR, MS_PER_MINUTE } from "./time";
import type { WorkOrderKind, WorkOrderPriority } from "./types";

export type SlotTag =
  "regular" | "crusher-repair" | "crusher-failure" | "gland-leak" | "repeat-follow-up";

export type OrderSlot = {
  readonly key: string;
  readonly kind: WorkOrderKind;
  readonly priority: WorkOrderPriority;
  readonly equipmentId: string;
  readonly faultCode: string;
  readonly issuedAtMs: number;
  readonly failureAtMs: number | null;
  readonly standardHours: number;
  readonly description: string;
  readonly tag: SlotTag;
  readonly avoidAssigneeId: string | null;
};

export const RESERVATION_LEAD_MS = 30 * MS_PER_MINUTE;
export const CALENDAR_MARGIN_MS = 2 * MS_PER_HOUR;
export const WINDOW_END_BUFFER_MS = 3 * MS_PER_HOUR;

const UNPLANNED_HOURS_FACTOR = 2.2;
const UNPLANNED_FIXED_HOURS = 3;
const PLANNED_HOURS_FACTOR = 1.6;
const PLANNED_FIXED_HOURS = 4;

export function reservationDurationMs(kind: WorkOrderKind, standardHours: number): number {
  const hours =
    kind === "unplanned"
      ? standardHours * UNPLANNED_HOURS_FACTOR + UNPLANNED_FIXED_HOURS
      : standardHours * PLANNED_HOURS_FACTOR + PLANNED_FIXED_HOURS;
  return Math.round(hours * MS_PER_HOUR);
}

export function latestIssueMs(
  context: SeedContext,
  kind: WorkOrderKind,
  standardHours: number,
): number {
  return context.windowEndMs - reservationDurationMs(kind, standardHours);
}

export function reserveIssueTime(
  context: SeedContext,
  request: {
    readonly equipmentId: string;
    readonly kind: WorkOrderKind;
    readonly standardHours: number;
    readonly desiredMs: number;
    readonly latestMs?: number;
  },
): number | null {
  const durationMs = reservationDurationMs(request.kind, request.standardHours);
  const latest = Math.min(
    request.latestMs ?? Number.POSITIVE_INFINITY,
    latestIssueMs(context, request.kind, request.standardHours),
  );
  const desired = Math.round(Math.min(request.desiredMs, latest));
  const start = context.calendar.findStart(
    request.equipmentId,
    desired,
    durationMs + RESERVATION_LEAD_MS,
    latest,
  );
  if (start === null) return null;
  context.calendar.reserve(request.equipmentId, start - RESERVATION_LEAD_MS, start + durationMs);
  return start;
}
