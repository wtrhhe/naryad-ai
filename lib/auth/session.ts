import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homeForRole, type AppRole } from "@/lib/auth/roles";
import { resolveLocale, type Locale } from "@/i18n/config";

export interface CurrentEmployee {
  id: string;
  authUserId: string;
  fullName: string;
  personnelNumber: string;
  role: AppRole;
  locale: Locale;
  brigadeId: string | null;
}

export const getCurrentEmployee = cache(async (): Promise<CurrentEmployee | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const authUserId = claimsData?.claims?.sub;
  if (!authUserId) {
    return null;
  }
  const { data, error } = await supabase
    .from("employees")
    .select("id, auth_user_id, full_name, personnel_number, role, locale, brigade_id, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load employee: ${error.message}`);
  }
  if (!data || !data.is_active) {
    return null;
  }
  return {
    id: data.id,
    authUserId,
    fullName: data.full_name,
    personnelNumber: data.personnel_number,
    role: data.role,
    locale: resolveLocale(data.locale),
    brigadeId: data.brigade_id,
  };
});

export async function requireEmployee(): Promise<CurrentEmployee> {
  const employee = await getCurrentEmployee();
  if (!employee) {
    redirect("/login");
  }
  return employee;
}

export async function requireRole(...roles: AppRole[]): Promise<CurrentEmployee> {
  const employee = await requireEmployee();
  if (!roles.includes(employee.role)) {
    redirect(homeForRole(employee.role));
  }
  return employee;
}
