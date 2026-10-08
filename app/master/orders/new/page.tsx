import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { candidateFromBoardRow } from "@/lib/domain/assignment-rank";
import { PageHeader } from "@/components/ui/page-header";
import { OrderForm, type EquipmentOption } from "@/components/order-create/order-form";

export async function generateMetadata() {
  const t = await getTranslations("shell");
  return { title: t("pages.masterNewOrder") };
}

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string }>;
}) {
  const master = await requireRole("master");
  const [{ equipment: initialEquipment }, t, supabase] = await Promise.all([
    searchParams,
    getTranslations("shell"),
    createSupabaseServerClient(),
  ]);
  const [equipment, faults, board, sites, recent] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name, inventory_number, equipment_type, site_id, site:site_id(name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("fault_codes")
      .select("id, code, name, category, standard_hours, required_specialty")
      .eq("is_active", true)
      .order("code"),
    supabase.rpc("assignee_board"),
    supabase.from("employee_sites").select("site_id").eq("employee_id", master.id),
    supabase
      .from("work_orders")
      .select("equipment_id")
      .eq("master_id", master.id)
      .order("issued_at", { ascending: false })
      .limit(30),
  ]);
  const mySites = new Set((sites.data ?? []).map((row) => row.site_id));
  const recentIds = new Set((recent.data ?? []).map((row) => row.equipment_id));
  type EquipmentRow = {
    id: string;
    name: string;
    inventory_number: string;
    equipment_type: EquipmentOption["type"];
    site_id: string;
    site: { name: string } | null;
  };
  const options: EquipmentOption[] = ((equipment.data ?? []) as unknown as EquipmentRow[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      inventoryNumber: row.inventory_number,
      siteName: row.site?.name ?? "",
      type: row.equipment_type,
      recent: recentIds.has(row.id),
      mine: mySites.has(row.site_id),
    }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.recent) - Number(a.recent))
    .map(({ mine: _mine, ...rest }) => rest);
  return (
    <>
      <PageHeader title={t("pages.masterNewOrder")} />
      <OrderForm
        equipment={options}
        initialEquipmentId={
          options.some((item) => item.id === initialEquipment) ? (initialEquipment ?? null) : null
        }
        faults={(faults.data ?? []).map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          category: row.category,
          standardHours: Number(row.standard_hours),
          specialty: row.required_specialty,
        }))}
        candidates={(board.data ?? []).map((row) => candidateFromBoardRow(row))}
      />
    </>
  );
}
