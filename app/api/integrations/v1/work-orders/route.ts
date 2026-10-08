import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseIntegrationEnv } from "@/integrations/config";
import { isAuthorizedIntegrationRequest } from "@/integrations/signing";
import { toExternalWorkOrder, type WorkOrderExportRow } from "@/integrations/mappers";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(["closed", "all"]).default("closed"),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

const COLUMNS =
  "id, number, kind, priority, status, description, work_performed, issued_at, started_at, done_at, closed_at, paused_seconds, standard_hours, downtime_started_at, downtime_ended_at, downtime_cost, site:site_id(code, name), equipment:equipment_id(inventory_number, name), fault_code:fault_code_id(code), assignee:employees!work_orders_assignee_id_fkey(personnel_number), master:employees!work_orders_master_id_fkey(personnel_number), material_writeoffs(quantity, material:material_id(code, name, unit, price)), ai_reviews(revision, score, master_score)";

export async function GET(request: NextRequest) {
  const env = parseIntegrationEnv(process.env);
  if (
    !isAuthorizedIntegrationRequest(request.headers.get("authorization"), env.INTEGRATION_API_TOKEN)
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  let builder = getSupabaseAdminClient()
    .from("work_orders")
    .select(COLUMNS)
    .order("updated_at", { ascending: true })
    .limit(query.data.limit);
  if (query.data.status === "closed") builder = builder.eq("status", "closed");
  if (query.data.since) builder = builder.gte("updated_at", query.data.since);
  const { data, error } = await builder;
  if (error) {
    console.error("integration export failed", error.message);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
  const orders = (data as unknown as WorkOrderExportRow[]).map(toExternalWorkOrder);
  return NextResponse.json({ ok: true, count: orders.length, orders });
}
