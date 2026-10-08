"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { resolveLocale } from "@/i18n/config";
import { requireRole } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/domain/action-result";
import type { EquipmentMemoryCard } from "@/lib/equipment/memory";
import { loadEquipmentMemoryCard } from "@/lib/equipment/queries";

const idSchema = z.uuid();

export async function loadEquipmentMemory(
  equipmentId: string,
  faultCodeId?: string | null,
): Promise<ActionResult<EquipmentMemoryCard>> {
  await requireRole("master", "worker", "manager", "admin");
  const id = idSchema.safeParse(equipmentId);
  const fault = faultCodeId ? idSchema.safeParse(faultCodeId) : null;
  if (!id.success || (fault && !fault.success)) return { ok: false, error: "validation" };
  try {
    const card = await loadEquipmentMemoryCard(
      id.data,
      resolveLocale(await getLocale()),
      fault?.data ?? null,
    );
    return card ? { ok: true, data: card } : { ok: false, error: "equipment_not_found" };
  } catch (error) {
    console.error("loadEquipmentMemory failed", error);
    return { ok: false, error: "unavailable" };
  }
}
