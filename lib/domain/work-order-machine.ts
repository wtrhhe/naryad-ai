import type { Database } from "@/lib/supabase/database.types";
import type { AppRole } from "@/lib/auth/roles";

export type WorkOrderStatus = Database["public"]["Enums"]["work_order_status"];
export type WorkOrderAction = Database["public"]["Enums"]["work_order_action"];
export type TransitionAction = Exclude<WorkOrderAction, "issue">;
export type ActorRole = AppRole | "system";
export type Requirement = "reason" | "assignee" | "priority" | "closing" | "comment";

export interface TransitionRule {
  from: readonly WorkOrderStatus[];
  to: WorkOrderStatus | null;
  roles: readonly ActorRole[];
  requires: readonly Requirement[];
  irreversible: boolean;
}

export const OPEN_STATUSES: readonly WorkOrderStatus[] = [
  "issued",
  "queued",
  "accepted",
  "rejected",
  "in_progress",
  "paused",
  "done",
  "ai_review",
  "rework",
];

export const FINAL_STATUSES: readonly WorkOrderStatus[] = ["closed", "cancelled"];

export const TRANSITIONS: Readonly<Record<TransitionAction, TransitionRule>> = {
  queue: { from: ["issued"], to: "queued", roles: ["worker"], requires: [], irreversible: false },
  accept: { from: ["issued", "queued"], to: "accepted", roles: ["worker"], requires: [], irreversible: false },
  reject: { from: ["issued", "queued"], to: "rejected", roles: ["worker"], requires: ["reason"], irreversible: true },
  start: { from: ["accepted", "rework"], to: "in_progress", roles: ["worker"], requires: [], irreversible: false },
  pause: { from: ["in_progress"], to: "paused", roles: ["worker"], requires: ["reason"], irreversible: false },
  resume: { from: ["paused"], to: "in_progress", roles: ["worker"], requires: [], irreversible: false },
  complete: { from: ["in_progress"], to: "done", roles: ["worker"], requires: ["closing"], irreversible: true },
  submit_review: { from: ["done"], to: "ai_review", roles: ["master", "system"], requires: [], irreversible: false },
  approve: { from: ["ai_review"], to: "closed", roles: ["master"], requires: [], irreversible: true },
  return_rework: { from: ["ai_review"], to: "rework", roles: ["master", "system"], requires: ["comment"], irreversible: false },
  reassign: {
    from: ["issued", "queued", "accepted", "rejected"],
    to: "issued",
    roles: ["master"],
    requires: ["assignee"],
    irreversible: false,
  },
  cancel: { from: OPEN_STATUSES, to: "cancelled", roles: ["master"], requires: ["reason"], irreversible: true },
  change_priority: { from: OPEN_STATUSES, to: null, roles: ["master"], requires: ["priority"], irreversible: false },
  comment: {
    from: [...OPEN_STATUSES, ...FINAL_STATUSES],
    to: null,
    roles: ["master", "worker"],
    requires: ["comment"],
    irreversible: false,
  },
};

export const TRANSITION_ACTIONS = Object.keys(TRANSITIONS) as TransitionAction[];

export type TransitionErrorCode =
  | "invalid_transition"
  | "forbidden"
  | "reason_required"
  | "assignee_required"
  | "priority_required"
  | "comment_required"
  | "closing_required"
  | "after_photo_required"
  | "start_gate_blocked"
  | "stale_status"
  | "not_found";

export type TransitionCheck =
  | { ok: true; to: WorkOrderStatus | null; rule: TransitionRule }
  | { ok: false; error: TransitionErrorCode };

export function isTransitionAction(action: WorkOrderAction): action is TransitionAction {
  return action !== "issue";
}

export function checkTransition(status: WorkOrderStatus, action: WorkOrderAction, role: ActorRole): TransitionCheck {
  if (!isTransitionAction(action)) {
    return { ok: false, error: "invalid_transition" };
  }
  const rule = TRANSITIONS[action];
  if (!rule.roles.includes(role)) {
    return { ok: false, error: "forbidden" };
  }
  if (!rule.from.includes(status)) {
    return { ok: false, error: "invalid_transition" };
  }
  return { ok: true, to: rule.to, rule };
}

export function availableActions(status: WorkOrderStatus, role: ActorRole): readonly TransitionAction[] {
  return TRANSITION_ACTIONS.filter((action) => checkTransition(status, action, role).ok);
}

export function isOpenStatus(status: WorkOrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}
