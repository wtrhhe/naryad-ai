import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { TransitionErrorCode } from "@/lib/domain/work-order-machine";

export const WORK_ORDER_STATUSES = [
  "issued",
  "queued",
  "accepted",
  "rejected",
  "in_progress",
  "paused",
  "done",
  "ai_review",
  "closed",
  "rework",
  "cancelled",
] as const;
export const WORK_ORDER_PRIORITIES = ["emergency", "high", "normal", "planned"] as const;
export const WORK_ORDER_KINDS = ["planned", "unplanned"] as const;
export const MAX_ORDER_PHOTOS = 5;
export const MAX_CLOSING_MATERIALS = 30;

const uuid = z.uuid();
const isoDateTime = z.iso.datetime({ offset: true });

export const materialLineSchema = z.object({
  materialId: uuid,
  quantity: z.number().positive().max(100_000),
});

export const closingSchema = z.object({
  workPerformed: z.string().trim().min(3).max(8000),
  faultCodeId: uuid,
  materials: z.array(materialLineSchema).max(MAX_CLOSING_MATERIALS),
  closeComment: z.string().trim().max(4000).optional(),
});

export const reasonSchema = z
  .object({
    reasonCodeId: uuid.optional(),
    reasonText: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.reasonCodeId !== undefined || (value.reasonText?.length ?? 0) >= 3, {
    message: "reason_required",
    path: ["reasonText"],
  });

const base = {
  orderId: uuid,
  expectedStatus: z.enum(WORK_ORDER_STATUSES),
  deviceAt: isoDateTime.optional(),
  clientActionId: uuid.optional(),
};

const commentText = z.string().trim().min(2).max(4000);

export const transitionInputSchema = z.discriminatedUnion("action", [
  z.object({
    ...base,
    action: z.enum(["queue", "accept", "start", "resume", "submit_review", "approve"]),
  }),
  z.object({ ...base, action: z.enum(["reject", "pause", "cancel"]), reason: reasonSchema }),
  z.object({ ...base, action: z.literal("complete"), closing: closingSchema }),
  z.object({ ...base, action: z.enum(["return_rework", "comment"]), comment: commentText }),
  z.object({ ...base, action: z.literal("reassign"), assigneeId: uuid }),
  z.object({
    ...base,
    action: z.literal("change_priority"),
    priority: z.enum(WORK_ORDER_PRIORITIES),
  }),
]);

export type TransitionInput = z.infer<typeof transitionInputSchema>;
export type Closing = z.infer<typeof closingSchema>;

export const createWorkOrderSchema = z
  .object({
    kind: z.enum(WORK_ORDER_KINDS),
    priority: z.enum(WORK_ORDER_PRIORITIES),
    description: z.string().trim().min(3).max(4000),
    comment: z.string().trim().max(4000).optional(),
    equipmentId: uuid,
    assigneeId: uuid.optional(),
    brigadeId: uuid.optional(),
    dueAt: isoDateTime.optional(),
    standardHours: z.number().min(0.25).max(500).optional(),
    suggestedFaultCodeId: uuid.optional(),
    suggestedStandardHours: z.number().min(0.25).max(500).optional(),
    suggestion: z.record(z.string(), z.unknown()).optional(),
    deviceAt: isoDateTime.optional(),
  })
  .refine((value) => value.assigneeId !== undefined || value.brigadeId !== undefined, {
    message: "assignee_required",
    path: ["assigneeId"],
  })
  .refine((value) => value.dueAt !== undefined || value.standardHours !== undefined, {
    message: "deadline_required",
    path: ["dueAt"],
  });

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

function compact(entries: Record<string, unknown>): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, Json>;
}

function actionPayload(input: TransitionInput): Record<string, unknown> {
  switch (input.action) {
    case "reject":
    case "pause":
    case "cancel":
      return { reason_code_id: input.reason.reasonCodeId, reason_text: input.reason.reasonText };
    case "complete":
      return {
        work_performed: input.closing.workPerformed,
        fault_code_id: input.closing.faultCodeId,
        close_comment: input.closing.closeComment,
        materials: input.closing.materials.map((line) => ({
          material_id: line.materialId,
          quantity: line.quantity,
        })),
      };
    case "return_rework":
    case "comment":
      return { comment: input.comment };
    case "reassign":
      return { assignee_id: input.assigneeId };
    case "change_priority":
      return { priority: input.priority };
    default:
      return {};
  }
}

export function toTransitionPayload(input: TransitionInput): Json {
  return compact({
    expected_status: input.expectedStatus,
    device_at: input.deviceAt,
    client_action_id: input.clientActionId,
    ...actionPayload(input),
  });
}

export function toCreatePayload(input: CreateWorkOrderInput): Json {
  return compact({
    kind: input.kind,
    priority: input.priority,
    description: input.description,
    comment: input.comment,
    equipment_id: input.equipmentId,
    assignee_id: input.assigneeId,
    brigade_id: input.brigadeId,
    due_at: input.dueAt,
    standard_hours: input.standardHours,
    suggested_fault_code_id: input.suggestedFaultCodeId,
    suggested_standard_hours: input.suggestedStandardHours,
    suggestion: input.suggestion as Json | undefined,
    device_at: input.deviceAt,
  });
}

const KNOWN_ERRORS: ReadonlySet<string> = new Set<TransitionErrorCode>([
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
]);

export function parseWorkOrderError(message: string | undefined): TransitionErrorCode | null {
  const code = message?.match(/wo:([a-z_]+)/)?.[1];
  return code && KNOWN_ERRORS.has(code) ? (code as TransitionErrorCode) : null;
}
