import type { TransitionErrorCode } from "@/lib/domain/work-order-machine";

export type ActionErrorCode =
  TransitionErrorCode | "validation" | "unavailable" | "equipment_not_found";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; fieldErrors?: Record<string, string[]> };
