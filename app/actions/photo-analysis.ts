"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findOrderPhotoDuplicates, hashPendingOrderPhotos } from "@/lib/phash/store";
import type { PhotoAnalysis } from "@/lib/phash/duplicates";
import { canRecordGhostScore, ghostScoreInputSchema } from "@/lib/ghost/settings";
import { roundScore } from "@/lib/ghost/indicator";
import type { ActionResult } from "@/lib/domain/action-result";

function unavailable(context: string, message: unknown) {
  console.error(`${context} failed`, message instanceof Error ? message.message : message);
  return { ok: false as const, error: "unavailable" as const };
}

export async function analyzeOrderPhotos(orderId: string): Promise<ActionResult<PhotoAnalysis>> {
  await requireRole("worker", "master");
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { ok: false, error: "validation" };
  const supabase = await createSupabaseServerClient();
  const { data: order, error } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", id.data)
    .maybeSingle();
  if (error) return unavailable("analyzeOrderPhotos visibility", error.message);
  if (!order) return { ok: false, error: "not_found" };
  try {
    const admin = getSupabaseAdminClient();
    const summary = await hashPendingOrderPhotos(admin, order.id);
    const duplicates = await findOrderPhotoDuplicates(admin, order.id);
    return {
      ok: true,
      data: { hashed: summary.hashed.length, failed: summary.failed.length, duplicates },
    };
  } catch (cause) {
    return unavailable("analyzeOrderPhotos", cause);
  }
}

export async function saveGhostScore(
  photoId: string,
  score: number | null,
  forcedReason?: string | null,
): Promise<ActionResult<{ photoId: string; ghostScore: number | null }>> {
  const employee = await requireRole("worker", "master");
  const parsed = ghostScoreInputSchema.safeParse({
    photoId,
    score,
    forcedReason: forcedReason?.trim() ? forcedReason : null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data: photo, error } = await supabase
    .from("photos")
    .select("id, author_id, kind, ghost_score, forced_reason, created_at")
    .eq("id", parsed.data.photoId)
    .maybeSingle();
  if (error) return unavailable("saveGhostScore lookup", error.message);
  if (!photo) return { ok: false, error: "not_found" };
  if (!canRecordGhostScore(photo, employee.id)) return { ok: false, error: "forbidden" };
  const ghostScore = parsed.data.score === null ? null : roundScore(parsed.data.score);
  const { data: updated, error: updateError } = await getSupabaseAdminClient()
    .from("photos")
    .update({ ghost_score: ghostScore, forced_reason: parsed.data.forcedReason })
    .eq("id", photo.id)
    .eq("author_id", employee.id)
    .eq("kind", "after")
    .is("ghost_score", null)
    .is("forced_reason", null)
    .select("id");
  if (updateError) return unavailable("saveGhostScore update", updateError.message);
  if (!updated || updated.length === 0) return { ok: false, error: "forbidden" };
  return { ok: true, data: { photoId: photo.id, ghostScore } };
}
