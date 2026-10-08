"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEMO_BASELINE_KEY,
  DEMO_TEAM,
  DEMO_TIME_SCALE_KEY,
  demoOrders,
  parseTimeScale,
} from "@/lib/demo/scenario";
import { currentShiftWindow } from "@/lib/board/shift";

export type DemoActionResult = { ok: true; count?: number } | { ok: false; error: string };

async function readSetting(key: string): Promise<unknown> {
  const { data } = await getSupabaseAdminClient()
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}

async function writeSetting(key: string, value: unknown, employeeId: string) {
  const { error } = await getSupabaseAdminClient()
    .from("settings")
    .upsert({ key, value: value as never, updated_by: employeeId }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

function finish(): void {
  revalidatePath("/", "layout");
}

export async function setDemoTimeScale(raw: number): Promise<DemoActionResult> {
  const admin = await requireRole("admin");
  const scale = z.number().int().min(1).max(600).safeParse(raw);
  if (!scale.success) return { ok: false, error: "validation" };
  await writeSetting(DEMO_TIME_SCALE_KEY, scale.data, admin.id);
  finish();
  return { ok: true };
}

export async function markDemoBaseline(): Promise<DemoActionResult> {
  const admin = await requireRole("admin");
  await writeSetting(DEMO_BASELINE_KEY, new Date().toISOString(), admin.id);
  finish();
  return { ok: true };
}

export async function resetDemo(): Promise<DemoActionResult> {
  await requireRole("admin");
  const baseline = await readSetting(DEMO_BASELINE_KEY);
  if (typeof baseline !== "string") return { ok: false, error: "no_baseline" };
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("work_orders")
    .delete()
    .gte("created_at", baseline)
    .select("id");
  if (error) return { ok: false, error: error.message };
  await Promise.all([
    client.from("notifications").delete().gte("created_at", baseline),
    client.from("rate_limits").delete().gte("window_start", "1970-01-01"),
    client.from("login_attempts").delete().gte("attempted_at", "1970-01-01"),
  ]);
  finish();
  return { ok: true, count: data?.length ?? 0 };
}

export async function preloadDemoScenario(): Promise<DemoActionResult> {
  const admin = await requireRole("admin");
  const client = getSupabaseAdminClient();
  if (typeof (await readSetting(DEMO_BASELINE_KEY)) !== "string") {
    await writeSetting(DEMO_BASELINE_KEY, new Date().toISOString(), admin.id);
  }
  const numbers = [DEMO_TEAM.master, ...DEMO_TEAM.workers];
  const [people, equipment] = await Promise.all([
    client.from("employees").select("id, personnel_number").in("personnel_number", numbers),
    client
      .from("equipment")
      .select("id, site_id, inventory_number")
      .in("inventory_number", [DEMO_TEAM.shortDeadlineEquipment, DEMO_TEAM.reworkEquipment]),
  ]);
  const byNumber = new Map((people.data ?? []).map((row) => [row.personnel_number, row.id]));
  const byInventory = new Map((equipment.data ?? []).map((row) => [row.inventory_number, row]));
  const master = byNumber.get(DEMO_TEAM.master);
  const [first, second] = DEMO_TEAM.workers.map((number) => byNumber.get(number));
  const shortEquipment = byInventory.get(DEMO_TEAM.shortDeadlineEquipment);
  const reworkEquipment = byInventory.get(DEMO_TEAM.reworkEquipment);
  if (!master || !first || !second || !shortEquipment || !reworkEquipment) {
    return { ok: false, error: "demo_data_missing" };
  }
  const { error: shiftError } = await client
    .from("employees")
    .update({ on_shift: true })
    .in("id", [master, first, second]);
  if (shiftError) return { ok: false, error: shiftError.message };
  const now = new Date();
  const rows = demoOrders(
    {
      masterId: master,
      firstWorkerId: first,
      secondWorkerId: second,
      shortDeadlineEquipment: { id: shortEquipment.id, siteId: shortEquipment.site_id },
      reworkEquipment: { id: reworkEquipment.id, siteId: reworkEquipment.site_id },
      shiftPeriod: currentShiftWindow(now).period,
    },
    now,
    parseTimeScale(await readSetting(DEMO_TIME_SCALE_KEY)),
  );
  const { data: created, error } = await client
    .from("work_orders")
    .insert(rows)
    .select("id, status");
  if (error || !created) return { ok: false, error: error?.message ?? "insert_failed" };
  const events = created.flatMap((order) => [
    {
      work_order_id: order.id,
      actor_id: master,
      action: "issue" as const,
      to_status: "issued" as const,
    },
    ...(order.status === "in_progress"
      ? [
          {
            work_order_id: order.id,
            actor_id: second,
            action: "accept" as const,
            from_status: "issued" as const,
            to_status: "accepted" as const,
          },
          {
            work_order_id: order.id,
            actor_id: second,
            action: "start" as const,
            from_status: "accepted" as const,
            to_status: "in_progress" as const,
          },
        ]
      : []),
  ]);
  const { error: eventsError } = await client.from("work_order_events").insert(events);
  if (eventsError) return { ok: false, error: eventsError.message };
  finish();
  return { ok: true, count: created.length };
}
