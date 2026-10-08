import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseIntegrationEnv } from "@/integrations/config";
import { isAuthorizedIntegrationRequest } from "@/integrations/signing";
import { toEquipmentRow } from "@/integrations/mappers";
import { externalEquipmentSchema } from "@/integrations/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ equipment: z.array(externalEquipmentSchema).min(1).max(1000) });

export async function POST(request: NextRequest) {
  const env = parseIntegrationEnv(process.env);
  if (
    !isAuthorizedIntegrationRequest(request.headers.get("authorization"), env.INTEGRATION_API_TOKEN)
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const admin = getSupabaseAdminClient();
  const codes = [...new Set(parsed.data.equipment.map((item) => item.siteCode))];
  const { data: sites, error: sitesError } = await admin
    .from("sites")
    .select("id, code")
    .in("code", codes);
  if (sitesError) {
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
  const siteIds = new Map((sites ?? []).map((site) => [site.code, site.id]));
  const unknownSites = codes.filter((code) => !siteIds.has(code));
  if (unknownSites.length > 0) {
    return NextResponse.json({ ok: false, error: "unknown_sites", unknownSites }, { status: 422 });
  }
  const rows = parsed.data.equipment.map((item) =>
    toEquipmentRow(item, siteIds.get(item.siteCode) as string),
  );
  const { error } = await admin.from("equipment").upsert(rows, { onConflict: "inventory_number" });
  if (error) {
    console.error("integration equipment import failed", error.message);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, upserted: rows.length });
}
