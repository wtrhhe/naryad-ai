import { buildCheck, finding, round, skipCheck } from "@/lib/review/checks/result";
import type {
  CheckFinding,
  CheckResult,
  OrderEvent,
  ReviewContext,
  ReviewFaultCode,
  ReviewOrder,
} from "@/lib/review/types";

export const TIME_TOLERANCE_RATIO = 1.25;
export const TIME_HIGH_RATIO = 2;
export const TOO_FAST_RATIO = 0.2;
const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;

export function reworkGapSeconds(events: readonly OrderEvent[]): number {
  const ordered = [...events].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  );
  let completedAt: number | null = null;
  let gap = 0;
  for (const event of ordered) {
    const at = Date.parse(event.occurredAt);
    if (event.action === "complete") {
      completedAt = at;
    } else if (event.action === "start" && completedAt !== null) {
      gap += Math.max(0, at - completedAt) / MS_PER_SECOND;
      completedAt = null;
    }
  }
  return gap;
}

export interface WorkTimeInput {
  startedAt: string | null;
  doneAt: string | null;
  pausedSeconds: number;
  events: readonly OrderEvent[];
}

export function workSeconds(input: WorkTimeInput): number | null {
  if (!input.startedAt || !input.doneAt) {
    return null;
  }
  const elapsed = (Date.parse(input.doneAt) - Date.parse(input.startedAt)) / MS_PER_SECOND;
  return Math.max(0, elapsed - input.pausedSeconds - reworkGapSeconds(input.events));
}

export function standardHoursOf(
  order: Pick<ReviewOrder, "standardHours">,
  faultCode: Pick<ReviewFaultCode, "standardHours"> | null,
): number | null {
  const hours = order.standardHours ?? faultCode?.standardHours ?? null;
  return hours !== null && hours > 0 ? hours : null;
}

export function lateMinutes(dueAt: string | null, doneAt: string | null): number | null {
  if (!dueAt || !doneAt) {
    return null;
  }
  const late = Math.ceil((Date.parse(doneAt) - Date.parse(dueAt)) / 60_000);
  return late > 0 ? late : 0;
}

function ratioFindings(hours: number, standard: number | null): CheckFinding[] {
  if (standard === null) {
    return [];
  }
  const ratio = hours / standard;
  if (ratio > TIME_TOLERANCE_RATIO) {
    return [
      finding("over_standard", "warn", ratio > TIME_HIGH_RATIO ? "high" : "medium", {
        percent: Math.round((ratio - 1) * 100),
      }),
    ];
  }
  return ratio < TOO_FAST_RATIO
    ? [finding("too_fast", "warn", "low", { percent: Math.round(ratio * 100) })]
    : [];
}

export function checkTime(context: ReviewContext): CheckResult {
  const { order } = context;
  const seconds = workSeconds({ ...order, events: context.events });
  if (seconds === null) {
    return skipCheck("time", "time_unknown");
  }
  const hours = seconds / SECONDS_PER_HOUR;
  const standard = standardHoursOf(order, context.faultCode);
  const late = lateMinutes(order.dueAt, order.doneAt);
  const findings = [
    ...ratioFindings(hours, standard),
    ...(late !== null && late > 0 ? [finding("overdue", "warn", "medium", { minutes: late })] : []),
  ];
  return buildCheck(
    "time",
    standard === null ? "time_no_standard" : "time_actual",
    {
      actual: round(hours, 1),
      standard: standard === null ? null : round(standard, 2),
      percent: standard === null ? null : Math.round((hours / standard) * 100),
      lateMinutes: late,
    },
    findings,
  );
}
