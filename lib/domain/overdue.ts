import { isOpenStatus, type WorkOrderStatus } from "@/lib/domain/work-order-machine";

export interface DeadlineSource {
  status: WorkOrderStatus;
  dueAt: string | null;
  issuedAt: string;
  standardHours: number | null;
}

const MS_PER_HOUR = 3_600_000;

export function effectiveDueAt(order: DeadlineSource): Date | null {
  if (order.dueAt) {
    return new Date(order.dueAt);
  }
  if (order.standardHours !== null) {
    return new Date(new Date(order.issuedAt).getTime() + order.standardHours * MS_PER_HOUR);
  }
  return null;
}

export function isOverdue(order: DeadlineSource, now: Date): boolean {
  const due = effectiveDueAt(order);
  const counts =
    isOpenStatus(order.status) && order.status !== "rejected" && order.status !== "ai_review";
  return counts && due !== null && due.getTime() < now.getTime();
}
