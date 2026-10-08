import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/analytics/stats";
import type {
  AcousticFact,
  AnalyticsDataset,
  EquipmentInfo,
  FaultCategory,
  OrderFact,
  RcaStatus,
  ShiftPeriod,
} from "@/lib/analytics/types";

export type AnalyticsClient = SupabaseClient<Database>;

export const HISTORY_DAYS = 90;
const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`analytics ${label} load failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

const toMs = (value: string | null): number | null => (value ? Date.parse(value) : null);

export function peakOf(peaks: unknown): number | null {
  if (!Array.isArray(peaks)) return null;
  const levels = peaks.flatMap((peak) =>
    typeof peak === "object" && peak !== null && typeof (peak as { db?: unknown }).db === "number"
      ? [(peak as { db: number }).db]
      : [],
  );
  return levels.length === 0 ? null : Math.max(...levels);
}

interface OrderRow {
  id: string;
  number: number;
  kind: "planned" | "unplanned";
  status: string;
  site_id: string;
  equipment_id: string;
  fault_code_id: string | null;
  assignee_id: string | null;
  brigade_id: string | null;
  shift_period: ShiftPeriod;
  shift_crew: string | null;
  standard_hours: number | null;
  issued_at: string;
  done_at: string | null;
  closed_at: string | null;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  downtime_cost: number | null;
}

export function toOrderFact(
  row: OrderRow,
  equipment: ReadonlyMap<string, EquipmentInfo>,
  now: number,
): OrderFact {
  const started = toMs(row.downtime_started_at);
  const ended = toMs(row.downtime_ended_at) ?? now;
  const downtimeHours = started === null ? 0 : Math.max(0, (ended - started) / MS_PER_HOUR);
  const costPerHour = equipment.get(row.equipment_id)?.downtimeCostPerHour ?? 0;
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    siteId: row.site_id,
    equipmentId: row.equipment_id,
    faultCodeId: row.fault_code_id,
    assigneeId: row.assignee_id,
    brigadeId: row.brigade_id,
    shiftPeriod: row.shift_period,
    shiftCrew: row.shift_crew,
    standardHours: row.standard_hours === null ? null : Number(row.standard_hours),
    issuedAt: Date.parse(row.issued_at),
    doneAt: toMs(row.done_at),
    closedAt: toMs(row.closed_at),
    downtimeHours,
    downtimeCost:
      row.downtime_cost === null ? downtimeHours * costPerHour : Number(row.downtime_cost),
  };
}

export async function fetchAnalyticsDataset(
  client: AnalyticsClient,
  options: { now: Date; days?: number },
): Promise<AnalyticsDataset> {
  const now = options.now.getTime();
  const since = now - (options.days ?? HISTORY_DAYS) * MS_PER_DAY;
  const sinceIso = new Date(since).toISOString();
  const [
    equipmentRows,
    sites,
    employees,
    employeeSites,
    brigades,
    faults,
    materials,
    norms,
    rcaCases,
    orderRows,
    writeoffs,
    acoustic,
  ] = await Promise.all([
    fetchAllPages("equipment", (from, to) =>
      client
        .from("equipment")
        .select(
          "id, name, inventory_number, site_id, equipment_type, criticality, downtime_cost_per_hour",
        )
        .eq("is_active", true)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("sites", (from, to) =>
      client.from("sites").select("id, code, name").order("id").range(from, to),
    ),
    fetchAllPages("employees", (from, to) =>
      client
        .from("employees")
        .select("id, full_name, personnel_number, role, brigade_id, crew, is_active, locale")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("employee sites", (from, to) =>
      client
        .from("employee_sites")
        .select("employee_id, site_id")
        .order("employee_id")
        .range(from, to),
    ),
    fetchAllPages("brigades", (from, to) =>
      client.from("brigades").select("id, name, site_id").order("id").range(from, to),
    ),
    fetchAllPages("fault codes", (from, to) =>
      client
        .from("fault_codes")
        .select("id, code, name, category, standard_hours")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("materials", (from, to) =>
      client.from("materials").select("id, name, unit, price").order("id").range(from, to),
    ),
    fetchAllPages("material norms", (from, to) =>
      client
        .from("material_norms")
        .select("fault_code_id, material_id, qty_min, qty_typical, qty_max")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("rca cases", (from, to) =>
      client
        .from("rca_cases")
        .select("id, equipment_id, fault_code_id, status, related_order_ids, opened_at, closed_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("work orders", (from, to) =>
      client
        .from("work_orders")
        .select(
          "id, number, kind, status, site_id, equipment_id, fault_code_id, assignee_id, brigade_id, shift_period, shift_crew, standard_hours, issued_at, done_at, closed_at, downtime_started_at, downtime_ended_at, downtime_cost",
        )
        .gte("issued_at", sinceIso)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("writeoffs", (from, to) =>
      client
        .from("material_writeoffs")
        .select("work_order_id, material_id, quantity")
        .gte("created_at", sinceIso)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("acoustic samples", (from, to) =>
      client
        .from("acoustic_samples")
        .select("equipment_id, recorded_at, rms, spectral_kurtosis, peaks")
        .gte("recorded_at", sinceIso)
        .order("id")
        .range(from, to),
    ),
  ]);
  const equipment: EquipmentInfo[] = equipmentRows.map((row) => ({
    id: row.id,
    name: row.name,
    inventoryNumber: row.inventory_number,
    siteId: row.site_id,
    type: row.equipment_type,
    criticality: row.criticality,
    downtimeCostPerHour: Number(row.downtime_cost_per_hour),
  }));
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const orders = orderRows
    .filter((row) => equipmentById.has(row.equipment_id))
    .map((row) => toOrderFact(row as OrderRow, equipmentById, now));
  const orderIds = new Set(orders.map((order) => order.id));
  const sitesByEmployee = new Map<string, string[]>();
  for (const link of employeeSites) {
    sitesByEmployee.set(link.employee_id, [
      ...(sitesByEmployee.get(link.employee_id) ?? []),
      link.site_id,
    ]);
  }
  return {
    now,
    since,
    orders,
    writeoffs: writeoffs
      .filter((row) => orderIds.has(row.work_order_id))
      .map((row) => ({
        orderId: row.work_order_id,
        materialId: row.material_id,
        quantity: Number(row.quantity),
      })),
    norms: norms.map((row) => ({
      faultCodeId: row.fault_code_id,
      materialId: row.material_id,
      qtyMin: Number(row.qty_min),
      qtyTypical: Number(row.qty_typical),
      qtyMax: Number(row.qty_max),
    })),
    acoustic: acoustic
      .filter((row) => equipmentById.has(row.equipment_id))
      .map((row): AcousticFact => ({
        equipmentId: row.equipment_id,
        recordedAt: Date.parse(row.recorded_at),
        peakDb: peakOf(row.peaks),
        kurtosis: row.spectral_kurtosis === null ? null : Number(row.spectral_kurtosis),
        rms: Number(row.rms),
      })),
    equipment,
    sites: sites.map((row) => ({ id: row.id, code: row.code, name: row.name })),
    employees: employees.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      personnelNumber: row.personnel_number,
      role: row.role,
      brigadeId: row.brigade_id,
      crew: row.crew,
      isActive: row.is_active,
      locale: row.locale === "kk" ? "kk" : "ru",
      siteIds: sitesByEmployee.get(row.id) ?? [],
    })),
    brigades: brigades.map((row) => ({ id: row.id, name: row.name, siteId: row.site_id })),
    faults: faults.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category as FaultCategory,
      standardHours: Number(row.standard_hours),
    })),
    materials: materials.map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      price: Number(row.price),
    })),
    rcaCases: rcaCases.map((row) => ({
      id: row.id,
      equipmentId: row.equipment_id,
      faultCodeId: row.fault_code_id,
      status: row.status as RcaStatus,
      relatedOrderIds: row.related_order_ids ?? [],
      openedAt: Date.parse(row.opened_at),
      closedAt: toMs(row.closed_at),
    })),
  };
}
