import { isOverdue } from "@/lib/domain/overdue";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import type { WorkOrderPriority } from "@/components/work-orders/priority-badge";
import type { ShiftWindow } from "@/lib/board/shift";

export const BOARD_COLUMNS = [
  "issued",
  "accepted",
  "in_progress",
  "queued",
  "paused",
  "review",
  "overdue",
  "rework",
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export type WorkerLiveStatus = "free" | "busy" | "queue" | "off_shift";

export interface BoardOrder {
  id: string;
  number: number;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  kind: "planned" | "unplanned";
  issuedAt: string;
  dueAt: string | null;
  standardHours: number | null;
  closedAt: string | null;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
  siteId: string;
  equipmentId: string;
  equipmentName: string;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface BoardWorker {
  id: string;
  fullName: string;
  specialty: string | null;
  onShift: boolean;
  activeOrderNumber: number | null;
  queueLength: number;
}

export interface BoardFilters {
  siteId?: string;
  equipmentId?: string;
  assigneeId?: string;
  priority?: WorkOrderPriority;
}

export interface ShiftCounters {
  issued: number;
  done: number;
  overdue: number;
  equipmentDown: number;
}

const COLUMN_BY_STATUS: Partial<Record<WorkOrderStatus, BoardColumn>> = {
  issued: "issued",
  accepted: "accepted",
  in_progress: "in_progress",
  queued: "queued",
  paused: "paused",
  done: "review",
  ai_review: "review",
  rework: "rework",
};

const PRIORITY_RANK: Record<WorkOrderPriority, number> = {
  emergency: 0,
  high: 1,
  normal: 2,
  planned: 3,
};

export function columnFor(order: BoardOrder, now: Date): BoardColumn | null {
  const column = COLUMN_BY_STATUS[order.status];
  if (!column) {
    return null;
  }
  return column !== "review" && isOverdue(order, now) ? "overdue" : column;
}

export function applyFilters(orders: readonly BoardOrder[], filters: BoardFilters): BoardOrder[] {
  return orders.filter(
    (order) =>
      (!filters.siteId || order.siteId === filters.siteId) &&
      (!filters.equipmentId || order.equipmentId === filters.equipmentId) &&
      (!filters.assigneeId || order.assigneeId === filters.assigneeId) &&
      (!filters.priority || order.priority === filters.priority),
  );
}

function byUrgency(left: BoardOrder, right: BoardOrder): number {
  return (
    PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
    left.issuedAt.localeCompare(right.issuedAt)
  );
}

export function buildColumns(
  orders: readonly BoardOrder[],
  now: Date,
): Record<BoardColumn, BoardOrder[]> {
  const empty = Object.fromEntries(
    BOARD_COLUMNS.map((column) => [column, [] as BoardOrder[]]),
  ) as Record<BoardColumn, BoardOrder[]>;
  const grouped = orders.reduce((columns, order) => {
    const column = columnFor(order, now);
    return column ? { ...columns, [column]: [...columns[column], order] } : columns;
  }, empty);
  return Object.fromEntries(
    BOARD_COLUMNS.map((column) => [column, [...grouped[column]].sort(byUrgency)]),
  ) as Record<BoardColumn, BoardOrder[]>;
}

export function workerStatus(worker: BoardWorker): WorkerLiveStatus {
  if (!worker.onShift) {
    return "off_shift";
  }
  if (worker.activeOrderNumber !== null) {
    return "busy";
  }
  return worker.queueLength > 0 ? "queue" : "free";
}

const STATUS_ORDER: Record<WorkerLiveStatus, number> = { free: 0, queue: 1, busy: 2, off_shift: 3 };

export function sortWorkers(workers: readonly BoardWorker[]): BoardWorker[] {
  return [...workers].sort(
    (left, right) =>
      STATUS_ORDER[workerStatus(left)] - STATUS_ORDER[workerStatus(right)] ||
      left.fullName.localeCompare(right.fullName, "ru"),
  );
}

function within(iso: string | null, shift: ShiftWindow): boolean {
  if (!iso) {
    return false;
  }
  const time = new Date(iso).getTime();
  return time >= shift.start.getTime() && time < shift.end.getTime();
}

export function shiftCounters(
  orders: readonly BoardOrder[],
  shift: ShiftWindow,
  now: Date,
): ShiftCounters {
  const down = new Set(
    orders
      .filter((order) => order.downtimeStartedAt !== null && order.downtimeEndedAt === null)
      .map((order) => order.equipmentId),
  );
  return {
    issued: orders.filter((order) => within(order.issuedAt, shift)).length,
    done: orders.filter((order) => within(order.closedAt, shift)).length,
    overdue: orders.filter((order) => columnFor(order, now) === "overdue").length,
    equipmentDown: down.size,
  };
}
