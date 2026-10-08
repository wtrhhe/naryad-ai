"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startGateSchema, type StartGate } from "@/lib/safety/gate";
import { parseWorkOrderError } from "@/lib/domain/work-order-schemas";
import type { ActionResult } from "@/lib/domain/action-result";

const lockoutInputSchema = z.object({
  orderId: z.uuid(),
  photoId: z.uuid().nullable(),
  checklist: z.array(z.uuid()).max(50),
  aiCheck: z.record(z.string(), z.unknown()).nullable(),
});

function failure(message: string | undefined, context: string) {
  const code = parseWorkOrderError(message);
  if (!code) console.error(`${context} failed`, message);
  return { ok: false as const, error: code ?? ("unavailable" as const) };
}

export async function loadStartGate(orderId: string): Promise<ActionResult<StartGate>> {
  await requireRole("worker", "master");
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { ok: false, error: "validation" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_gate", { order_id: id.data });
  if (error) return failure(error.message, "start_gate");
  const parsed = startGateSchema.safeParse(data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : failure(undefined, "start_gate response");
}

export async function lockoutAndStart(raw: unknown): Promise<ActionResult<{ status: string }>> {
  await requireRole("worker");
  const parsed = lockoutInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation" };
  const { orderId, photoId, checklist, aiCheck } = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (photoId) {
    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("storage_path")
      .eq("id", photoId)
      .eq("work_order_id", orderId)
      .eq("kind", "loto")
      .single();
    if (photoError || !photo) return { ok: false, error: "lockout_photo_required" };
    const { error } = await supabase.rpc("apply_lockout", {
      order_id: orderId,
      tag_photo_path: photo.storage_path,
      ai_check: (aiCheck ?? null) as never,
      checklist,
    });
    if (error) return failure(error.message, "apply_lockout");
  }
  const { data, error } = await supabase.rpc("transition_work_order", {
    order_id: orderId,
    action: "start",
    payload: { checklist },
  });
  if (error) return failure(error.message, "start");
  revalidatePath("/worker", "layout");
  revalidatePath("/master", "layout");
  return {
    ok: true,
    data: { status: String((data as { status?: string } | null)?.status ?? "in_progress") },
  };
}
