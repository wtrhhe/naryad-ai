"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseWorkOrderError, WORK_ORDER_STATUSES } from "@/lib/domain/work-order-schemas";
import type { ActionResult } from "@/lib/domain/action-result";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import { decideReviewSchema, planDecision, type MasterFields } from "@/lib/review/decision";
import { masterOrderUrl, workerOrderUrl } from "@/lib/review/notify";
import { runOrderReview, type ReviewRunStatus } from "@/lib/review/run";

const transitionResultSchema = z.object({ status: z.enum(WORK_ORDER_STATUSES) });

const REVIEW_COLUMNS =
  "id, revision, verdict, score, master_id, master_verdict, master_score, master_rating, master_comment, master_decided_at";

function failure(message: string | undefined, context: string) {
  const code = parseWorkOrderError(message);
  if (!code) console.error(`${context} failed`, message);
  return { ok: false as const, error: code ?? ("unavailable" as const) };
}

function revalidateReviewViews(orderId: string) {
  revalidatePath("/master", "layout");
  revalidatePath("/worker", "layout");
  revalidatePath(masterOrderUrl(orderId));
  revalidatePath(workerOrderUrl(orderId));
}

export async function decideReview(
  raw: unknown,
): Promise<ActionResult<{ status: WorkOrderStatus }>> {
  const employee = await requireRole("master");
  const parsed = decideReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: order, error: orderError } = await supabase
    .from("work_orders")
    .select("id, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderError) return failure(orderError.message, "review order lookup");
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "ai_review") return { ok: false, error: "invalid_transition" };
  const { data: review, error: reviewError } = await supabase
    .from("ai_reviews")
    .select(REVIEW_COLUMNS)
    .eq("work_order_id", input.orderId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reviewError) return failure(reviewError.message, "review lookup");
  const plan = planDecision(input, review);
  if (!plan.ok) return { ok: false, error: plan.error };
  const admin = getSupabaseAdminClient();
  const previous: MasterFields | null = review
    ? {
        master_verdict: review.master_verdict,
        master_score: review.master_score,
        master_rating: review.master_rating,
        master_comment: review.master_comment,
      }
    : null;
  if (review && plan.master) {
    const { error } = await admin
      .from("ai_reviews")
      .update({
        ...plan.master,
        master_id: employee.id,
        master_decided_at: new Date().toISOString(),
      })
      .eq("id", review.id);
    if (error) return failure(error.message, "master decision");
  }
  const { data, error } = await supabase.rpc("transition_work_order", {
    order_id: input.orderId,
    action: plan.action,
    payload: plan.payload,
  });
  if (error) {
    if (review && previous) {
      await admin
        .from("ai_reviews")
        .update({
          ...previous,
          master_id: review.master_id,
          master_decided_at: review.master_decided_at,
        })
        .eq("id", review.id);
    }
    return failure(error.message, "review decision transition");
  }
  const result = transitionResultSchema.safeParse(data);
  revalidateReviewViews(input.orderId);
  return { ok: true, data: { status: result.success ? result.data.status : order.status } };
}

export async function requestOrderReview(
  orderId: string,
): Promise<ActionResult<{ status: ReviewRunStatus }>> {
  await requireRole("master");
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { ok: false, error: "validation" };
  const supabase = await createSupabaseServerClient();
  const { data: order, error } = await supabase
    .from("work_orders")
    .select("id, status")
    .eq("id", id.data)
    .maybeSingle();
  if (error) return failure(error.message, "review request lookup");
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "done" && order.status !== "ai_review") {
    return { ok: false, error: "invalid_transition" };
  }
  try {
    const result = await runOrderReview(id.data);
    revalidateReviewViews(id.data);
    return { ok: true, data: { status: result.status } };
  } catch (runError) {
    return failure(runError instanceof Error ? runError.message : undefined, "order review");
  }
}
