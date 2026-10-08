"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticateWithPin,
  LOCK_MINUTES,
  type LoginDependencies,
  type LoginResult,
} from "@/lib/auth/login";
import { homeForRole, roleForPath, type AppRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";

export type LoginFormState =
  (Extract<LoginResult, { ok: false }> & { personnelNumber: string }) | null;

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  const candidate =
    headerList.get("x-vercel-forwarded-for") ??
    headerList.get("x-real-ip") ??
    headerList.get("x-forwarded-for")?.split(",")[0];
  return candidate?.trim() || null;
}

function safeNextPath(value: FormDataEntryValue | null, role: AppRole): string {
  const candidate = typeof value === "string" ? value : "";
  return candidate.startsWith("/") && !candidate.startsWith("//") && roleForPath(candidate) === role
    ? candidate
    : homeForRole(role);
}

async function buildDependencies(ip: string | null): Promise<LoginDependencies> {
  const env = serverEnv();
  const admin = getSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  return {
    emailDomain: env.AUTH_EMAIL_DOMAIN,
    pinPepper: env.AUTH_PIN_PEPPER,
    clientIp: ip,
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
      const { error } = await admin.rpc("record_login_attempt", {
        number,
        succeeded,
        client_ip: ip ?? undefined,
      });
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
        .select("role, is_active, locale")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (error) throw error;
      return data ? { role: data.role, isActive: data.is_active, locale: data.locale } : null;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}

export async function signInWithPin(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const personnelNumber = String(formData.get("personnelNumber") ?? "").trim();
  let result: LoginResult;
  try {
    const deps = await buildDependencies(await clientIp());
    result = await authenticateWithPin({ personnelNumber, pin: formData.get("pin") }, deps);
  } catch (error) {
    console.error("sign-in setup failed", error instanceof Error ? error.message : error);
    result = { ok: false, error: "unavailable" };
  }
  if (!result.ok) {
    return { ...result, personnelNumber };
  }
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, resolveLocale(result.locale), {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    path: "/",
  });
  redirect(safeNextPath(formData.get("next"), result.role));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
