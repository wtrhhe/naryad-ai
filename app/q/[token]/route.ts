import { NextResponse, type NextRequest } from "next/server";
import { normalizeQrToken, qrRedirectTarget } from "@/components/qr/qr-token";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function equipmentIdFor(token: string | null, signedIn: boolean): Promise<string | null> {
  if (token === null) {
    return null;
  }
  const client = signedIn ? await createSupabaseServerClient() : getSupabaseAdminClient();
  const { data, error } = await client
    .from("equipment")
    .select("id")
    .eq("qr_token", token)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("Failed to resolve a QR token", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const normalized = normalizeQrToken(token);
  const employee = await getCurrentEmployee();
  const role = employee?.role ?? null;
  const equipmentId =
    role === null || role === "master" ? await equipmentIdFor(normalized, role !== null) : null;
  const response = NextResponse.redirect(
    new URL(qrRedirectTarget(role, equipmentId), request.url),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
