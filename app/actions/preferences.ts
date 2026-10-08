"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LOCALE_COOKIE, LOCALES } from "@/i18n/config";
import { THEME_COOKIE, THEMES } from "@/lib/theme";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setLocale(value: string): Promise<void> {
  const locale = z.enum(LOCALES).parse(value);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, { maxAge: ONE_YEAR_SECONDS, sameSite: "lax", path: "/" });
  const employee = await getCurrentEmployee();
  if (employee) {
    const { error } = await getSupabaseAdminClient()
      .from("employees")
      .update({ locale })
      .eq("id", employee.id);
    if (error) {
      console.error("failed to persist locale", error.message);
    }
  }
  revalidatePath("/", "layout");
}

export async function setTheme(value: string): Promise<void> {
  const theme = z.enum(THEMES).parse(value);
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, { maxAge: ONE_YEAR_SECONDS, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
