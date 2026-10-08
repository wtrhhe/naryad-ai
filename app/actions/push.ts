"use server";

import { z } from "zod";
import { requireEmployee } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedPushEndpoint } from "@/lib/push/payload";

const subscriptionSchema = z.object({
  endpoint: z.url().refine(isAllowedPushEndpoint, "endpoint_not_allowed"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  userAgent: z.string().max(300).optional(),
});

export async function savePushSubscription(raw: unknown): Promise<{ ok: boolean }> {
  const employee = await requireEmployee();
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      employee_id: employee.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: parsed.data.userAgent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("push subscription save failed", error.message);
    return { ok: false };
  }
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  await requireEmployee();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: !error };
}
