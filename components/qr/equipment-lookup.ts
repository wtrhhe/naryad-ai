import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizeQrToken } from "./qr-token";

export interface ScannedEquipment {
  id: string;
  name: string;
  inventoryNumber: string;
  siteId: string;
}

export async function findEquipmentByQrToken(token: string): Promise<ScannedEquipment | null> {
  const normalized = normalizeQrToken(token);
  if (!normalized) {
    return null;
  }
  const { data, error } = await getSupabaseBrowserClient()
    .from("equipment")
    .select("id, name, inventory_number, site_id")
    .eq("qr_token", normalized)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to resolve the scanned equipment: ${error.message}`);
  }
  return data
    ? { id: data.id, name: data.name, inventoryNumber: data.inventory_number, siteId: data.site_id }
    : null;
}
