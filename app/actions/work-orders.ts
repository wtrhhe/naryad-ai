"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/domain/action-result";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import {
  createWorkOrderSchema,
  parseWorkOrderError,
  toCreatePayload,
  toTransitionPayload,
  transitionInputSchema,
  WORK_ORDER_STATUSES,
} from "@/lib/domain/work-order-schemas";

const transitionResultSchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES),
  next_order_id: z.uuid().nullable(),
});

const createResultSchema = z.object({ id: z.uuid(), number: z.number().int() });

function validationFailure(error: z.ZodError) {
  return {
    ok: false as const,
    error: "validation" as const,
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function databaseFailure(message: string | undefined, context: string) {
  const code = parseWorkOrderError(message);
  if (!code) {
    console.error(`${context} failed`, message);
  }
  return { ok: false as const, error: code ?? ("unavailable" as const) };
}

function revalidateOrderViews(orderId: string) {
  revalidatePath("/master", "layout");
  revalidatePath("/worker", "layout");
  revalidatePath(`/master/orders/${orderId}`);
}

export async function transitionWorkOrder(
  raw: unknown,
): Promise<ActionResult<{ status: WorkOrderStatus; nextOrderId: string | null }>> {
  await requireRole("master", "worker");
  const parsed = transitionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("transition_work_order", {
    order_id: parsed.data.orderId,
    action: parsed.data.action,
    payload: toTransitionPayload(parsed.data),
  });
  if (error) {
    return databaseFailure(error.message, "transition_work_order");
  }
  const result = transitionResultSchema.safeParse(data);
  if (!result.success) {
    return databaseFailure(undefined, "transition_work_order response");
  }
  revalidateOrderViews(parsed.data.orderId);
  return { ok: true, data: { status: result.data.status, nextOrderId: result.data.next_order_id } };
}

export async function createWorkOrder(
  raw: unknown,
): Promise<ActionResult<{ id: string; number: number }>> {
  await requireRole("master");
  const parsed = createWorkOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_work_order", {
    payload: toCreatePayload(parsed.data),
  });
  if (error) {
    if (error.message.includes("wo:equipment_not_found")) {
      return { ok: false, error: "equipment_not_found" };
    }
    return databaseFailure(error.message, "create_work_order");
  }
  const result = createResultSchema.safeParse(data);
  if (!result.success) {
    return databaseFailure(undefined, "create_work_order response");
  }
  revalidateOrderViews(result.data.id);
  return { ok: true, data: result.data };
}
