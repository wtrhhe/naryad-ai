import type { ActionErrorCode } from "@/lib/domain/action-result";
import { TRANSITION_ACTIONS, type TransitionAction } from "@/lib/domain/work-order-machine";
import type { FlushStopReason } from "@/lib/offline/types";

export const DELIVERED_VISIBLE_MS = 4_000;

export type BannerMode =
  "hidden" | "offline" | "offlineEmpty" | "sending" | "delivered" | "waiting" | "signIn";

export interface BannerInput {
  ready: boolean;
  online: boolean;
  pending: number;
  flushing: boolean;
  stopped: FlushStopReason | null;
}

export function bannerMode(state: BannerInput, showDelivered: boolean): BannerMode {
  if (!state.online) {
    return state.pending > 0 ? "offline" : "offlineEmpty";
  }
  if (!state.ready) {
    return "hidden";
  }
  if (state.pending > 0) {
    if (state.flushing) {
      return "sending";
    }
    return state.stopped === "auth" ? "signIn" : "waiting";
  }
  return showDelivered ? "delivered" : "hidden";
}

const ACTION_ERROR_CODES: readonly ActionErrorCode[] = [
  "invalid_transition",
  "forbidden",
  "reason_required",
  "assignee_required",
  "priority_required",
  "comment_required",
  "closing_required",
  "after_photo_required",
  "start_gate_blocked",
  "permit_missing",
  "lockout_photo_required",
  "stale_status",
  "not_found",
  "validation",
  "unavailable",
  "equipment_not_found",
];

export function isActionErrorCode(value: string): value is ActionErrorCode {
  return (ACTION_ERROR_CODES as readonly string[]).includes(value);
}

export function isTransitionActionName(value: string | null): value is TransitionAction {
  return value !== null && (TRANSITION_ACTIONS as readonly string[]).includes(value);
}
