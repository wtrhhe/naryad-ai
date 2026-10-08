"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateWithPin, LOCK_MINUTES, type LoginResult } from "@/lib/auth/login";
import { homeForRole, roleForPath } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";

export type LoginFormState = Extract<LoginResult, { ok: false }> | null;

async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headerList.get("x-real-ip");
}

function safeNextPath(
  value: FormDataEntryValue | null,
  role: Parameters<typeof homeForRole>[0],
): string {
  const candidate = typeof value === "string" ? value : "";
  return candidate.startsWith("/") && !candidate.startsWith("//") && roleForPath(candidate) === role
    ? candidate
    : homeForRole(role);
}

export async function signInWithPin(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const env = serverEnv();
  const admin = getSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  const result = await authenticateWithPin(
    { personnelNumber: formData.get("personnelNumber"), pin: formData.get("pin") },
    {
      emailDomain: env.AUTH_EMAIL_DOMAIN,
      pinPepper: env.AUTH_PIN_PEPPER,
      clientIp: await clientIp(),
      hitRateLimit: async (bucket, maxHits, windowSeconds) => {
        const { data, error } = await admin.rpc("hit_rate_limit", {
          bucket,
          max_hits: maxHits,
          window_seconds: windowSeconds,
        });
        if (error) throw error;
        return data;
      },
      lockSeconds: async (number) => {
        const { data, error } = await admin.rpc("login_lock_seconds", {
          number,
          lock_minutes: LOCK_MINUTES,
        });
        if (error) throw error;
        return data;
      },
      recentFailures: async (number) => {
        const { data, error } = await admin.rpc("login_recent_failures", {
          number,
          lock_minutes: LOCK_MINUTES,
        });
        if (error) throw error;
        return data;
      },
      recordAttempt: async (number, succeeded) => {
        const { error } = await admin.rpc("record_login_attempt", { number, succeeded });
        if (error) throw error;
      },
      signInWithPassword: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error?.code === "invalid_credentials" || error?.status === 400) return null;
        if (error) throw error;
        return data.user ? { authUserId: data.user.id } : null;
      },
      findEmployeeRole: async (authUserId) => {
        const { data, error } = await admin
          .from("employees")
          .select("role, is_active")
          .eq("auth_user_id", authUserId)
          .maybeSingle();
        if (error) throw error;
        return data ? { role: data.role, isActive: data.is_active } : null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    },
  );
  if (!result.ok) {
    return result;
  }
  redirect(safeNextPath(formData.get("next"), result.role));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
