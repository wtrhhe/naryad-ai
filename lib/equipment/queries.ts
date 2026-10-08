import "server-only";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { getAiProvider } from "@/lib/ai/provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { reviewScore } from "@/lib/dashboard/kpi";
import { requestCheckHint } from "@/lib/equipment/hint";
import {
  buildEquipmentList,
  type EquipmentListItem,
  type EquipmentListOrder,
  type EquipmentType,
} from "@/lib/equipment/list";
import {
  buildMemorySentence,
  rcaHypothesis,
  summarizeEquipmentMemory,
  type EquipmentMemoryCard,
  type EquipmentMemorySummary,
  type MemoryOrder,
} from "@/lib/equipment/memory";
import {
  latestRiskInsights,
  toRiskInsight,
  type InsightRecord,
  type RiskInsight,
} from "@/lib/equipment/risk";

const ORDER_LIMIT = 300;
const PHOTO_ORDERS = 20;
const PHOTO_URL_TTL_SECONDS = 3600;
const LIST_HISTORY_DAYS = 60;
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const MS_PER_DAY = 86_400_000;

type PhotoKind = Database["public"]["Enums"]["photo_kind"];
type RcaStatus = Database["public"]["Enums"]["rca_status"];
type AcousticKind = Database["public"]["Enums"]["acoustic_kind"];

export interface EquipmentDetails {
  id: string;
  name: string;
  inventoryNumber: string;
  siteId: string;
  siteName: string;
  equipmentType: EquipmentType;
  criticality: number;
  downtimeCostPerHour: number;
  requiresLockout: boolean;
}

export interface TimelinePhoto {
  id: string;
  kind: PhotoKind;
  url: string | null;
}

export interface TimelineOrder extends MemoryOrder {
  description: string;
  assigneeName: string | null;
  score: number | null;
  photos: TimelinePhoto[];
}

export interface EquipmentRcaCase {
  id: string;
  faultCodeId: string | null;
  faultCode: string | null;
  faultName: string | null;
  status: RcaStatus;
  openedAt: string;
  closedAt: string | null;
  rootCause: string | null;
  recommendation: string | null;
  fiveWhys: { question: string; answer: string }[];
  relatedOrders: number;
}

export interface EquipmentInsight {
  id: string;
  kind: string;
  severity: number;
  summary: string;
  recommendation: string | null;
  createdAt: string;
}

export interface AcousticEntry {
  id: string;
  kind: AcousticKind;
  recordedAt: string;
  rms: number;
  workOrderId: string | null;
}

export interface EquipmentMemoryData {
  equipment: EquipmentDetails;
  orders: TimelineOrder[];
  rca: EquipmentRcaCase[];
  insights: EquipmentInsight[];
  acoustic: AcousticEntry[];
  activeLockout: { lockedAt: string; orderNumber: number | null } | null;
  riskInsight: RiskInsight | null;
}

const fiveWhysSchema = z
  .array(
    z.object({
      question: z.string().catch(""),
      answer: z.string().catch(""),
    }),
  )
  .catch([]);

const ORDER_COLUMNS =
  "id, number, kind, priority, status, description, work_performed, issued_at, done_at, closed_at, downtime_started_at, downtime_ended_at, downtime_cost, fault_code_id, fault_code:fault_codes!work_orders_fault_code_id_fkey(code, name), assignee:employees!work_orders_assignee_id_fkey(full_name), material_writeoffs(material_id, quantity, material:material_id(name, unit)), photos(id, kind, storage_path, created_at), ai_reviews(revision, score, master_score)";

interface OrderRecord {
  id: string;
  number: number;
  kind: MemoryOrder["kind"];
  priority: MemoryOrder["priority"];
  status: MemoryOrder["status"];
  description: string;
  work_performed: string | null;
  issued_at: string;
  done_at: string | null;
  closed_at: string | null;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  downtime_cost: number | null;
  fault_code_id: string | null;
  fault_code: { code: string; name: string } | null;
  assignee: { full_name: string } | null;
  material_writeoffs:
    | { material_id: string; quantity: number; material: { name: string; unit: string } | null }[]
    | null;
  photos: { id: string; kind: PhotoKind; storage_path: string; created_at: string }[] | null;
  ai_reviews: { revision: number; score: number | null; master_score: number | null }[] | null;
}

interface EquipmentRecord {
  id: string;
  name: string;
  inventory_number: string;
  site_id: string;
  equipment_type: EquipmentType;
  criticality: number;
  downtime_cost_per_hour: number;
  requires_lockout: boolean;
  site: { name: string } | null;
}

interface RcaRecord {
  id: string;
  fault_code_id: string | null;
  status: RcaStatus;
  opened_at: string;
  closed_at: string | null;
  root_cause: string | null;
  recommendation: string | null;
  five_whys: unknown;
  related_order_ids: string[] | null;
  fault_code: { code: string; name: string } | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toTimelineOrder(row: OrderRecord): TimelineOrder {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    priority: row.priority,
    status: row.status,
    description: row.description,
    issuedAt: row.issued_at,
    doneAt: row.done_at,
    closedAt: row.closed_at,
    faultCodeId: row.fault_code_id,
    faultCode: row.fault_code?.code ?? null,
    faultName: row.fault_code?.name ?? null,
    workPerformed: row.work_performed,
    downtimeStartedAt: row.downtime_started_at,
    downtimeEndedAt: row.downtime_ended_at,
    downtimeCost: toNumber(row.downtime_cost),
    materials: (row.material_writeoffs ?? []).map((writeoff) => ({
      materialId: writeoff.material_id,
      name: writeoff.material?.name ?? "",
      unit: writeoff.material?.unit ?? "",
      quantity: toNumber(writeoff.quantity) ?? 0,
    })),
    assigneeName: row.assignee?.full_name ?? null,
    score: reviewScore(
      (row.ai_reviews ?? []).map((review) => ({
        revision: review.revision,
        score: toNumber(review.score),
        masterScore: toNumber(review.master_score),
      })),
    ),
    photos: [],
  };
}

const PHOTO_ORDER: Record<PhotoKind, number> = { before: 0, after: 1, loto: 2 };

async function signPhotos(rows: readonly OrderRecord[]): Promise<Map<string, TimelinePhoto[]>> {
  const recent = rows.slice(0, PHOTO_ORDERS);
  const photos = recent.flatMap((row) =>
    [...(row.photos ?? [])]
      .sort(
        (a, b) =>
          PHOTO_ORDER[a.kind] - PHOTO_ORDER[b.kind] || a.created_at.localeCompare(b.created_at),
      )
      .map((photo) => ({ orderId: row.id, ...photo })),
  );
  const result = new Map<string, TimelinePhoto[]>();
  if (photos.length === 0) return result;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from("photos").createSignedUrls(
    photos.map((photo) => photo.storage_path),
    PHOTO_URL_TTL_SECONDS,
  );
  const urls = new Map(
    (data ?? [])
      .filter((entry) => !entry.error && entry.signedUrl && entry.path)
      .map((entry) => [entry.path as string, entry.signedUrl]),
  );
  for (const photo of photos) {
    result.set(photo.orderId, [
      ...(result.get(photo.orderId) ?? []),
      { id: photo.id, kind: photo.kind, url: urls.get(photo.storage_path) ?? null },
    ]);
  }
  return result;
}

export async function loadEquipmentMemoryData(
  equipmentId: string,
  options: { photos?: boolean } = {},
): Promise<EquipmentMemoryData | null> {
  const supabase = await createSupabaseServerClient();
  const [equipment, orders, rca, insights, acoustic, lockout] = await Promise.all([
    supabase
      .from("equipment")
      .select(
        "id, name, inventory_number, site_id, equipment_type, criticality, downtime_cost_per_hour, requires_lockout, site:site_id(name)",
      )
      .eq("id", equipmentId)
      .maybeSingle(),
    supabase
      .from("work_orders")
      .select(ORDER_COLUMNS)
      .eq("equipment_id", equipmentId)
      .order("issued_at", { ascending: false })
      .limit(ORDER_LIMIT),
    supabase
      .from("rca_cases")
      .select(
        "id, fault_code_id, status, opened_at, closed_at, root_cause, recommendation, five_whys, related_order_ids, fault_code:fault_code_id(code, name)",
      )
      .eq("equipment_id", equipmentId)
      .order("opened_at", { ascending: false }),
    supabase
      .from("insights")
      .select("id, kind, entity_id, severity, metrics, summary, recommendation, created_at")
      .eq("entity_type", "equipment")
      .eq("entity_id", equipmentId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("acoustic_samples")
      .select("id, kind, recorded_at, rms, work_order_id")
      .eq("equipment_id", equipmentId)
      .order("recorded_at", { ascending: false })
      .limit(30),
    supabase
      .from("lockouts")
      .select("locked_at, work_order:work_order_id(number)")
      .eq("equipment_id", equipmentId)
      .is("released_at", null)
      .order("locked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const failure =
    equipment.error ??
    orders.error ??
    rca.error ??
    insights.error ??
    acoustic.error ??
    lockout.error;
  if (failure) throw new Error(`Failed to load equipment memory: ${failure.message}`);
  const unit = equipment.data as unknown as EquipmentRecord | null;
  if (!unit) return null;
  const orderRows = (orders.data ?? []) as unknown as OrderRecord[];
  const photos = options.photos ? await signPhotos(orderRows) : new Map<string, TimelinePhoto[]>();
  const insightRows = (insights.data ?? []) as InsightRecord[];
  const riskInsights = insightRows
    .map(toRiskInsight)
    .filter((item): item is RiskInsight => item !== null);
  const lockoutRow = lockout.data as unknown as {
    locked_at: string;
    work_order: { number: number } | null;
  } | null;
  return {
    equipment: {
      id: unit.id,
      name: unit.name,
      inventoryNumber: unit.inventory_number,
      siteId: unit.site_id,
      siteName: unit.site?.name ?? "",
      equipmentType: unit.equipment_type,
      criticality: unit.criticality,
      downtimeCostPerHour: Number(unit.downtime_cost_per_hour ?? 0),
      requiresLockout: unit.requires_lockout,
    },
    orders: orderRows.map((row) => ({ ...toTimelineOrder(row), photos: photos.get(row.id) ?? [] })),
    rca: ((rca.data ?? []) as unknown as RcaRecord[]).map((row) => ({
      id: row.id,
      faultCodeId: row.fault_code_id,
      faultCode: row.fault_code?.code ?? null,
      faultName: row.fault_code?.name ?? null,
      status: row.status,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      rootCause: row.root_cause,
      recommendation: row.recommendation,
      fiveWhys: fiveWhysSchema.parse(row.five_whys),
      relatedOrders: row.related_order_ids?.length ?? 0,
    })),
    insights: insightRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      summary: row.summary,
      recommendation: row.recommendation,
      createdAt: row.created_at,
    })),
    acoustic: (acoustic.data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      recordedAt: row.recorded_at,
      rms: Number(row.rms),
      workOrderId: row.work_order_id,
    })),
    activeLockout: lockoutRow
      ? { lockedAt: lockoutRow.locked_at, orderNumber: lockoutRow.work_order?.number ?? null }
      : null,
    riskInsight: latestRiskInsights(riskInsights).get(unit.id) ?? null,
  };
}

export function summarizeMemoryData(
  data: EquipmentMemoryData,
  now: Date,
  faultCodeId?: string | null,
): EquipmentMemorySummary {
  return summarizeEquipmentMemory(
    {
      equipment: data.equipment,
      orders: data.orders,
      openRca: data.rca
        .filter((item) => item.status !== "closed")
        .map((item) => ({
          id: item.id,
          faultCodeId: item.faultCodeId,
          hypothesis: rcaHypothesis(item),
        })),
      activeLockout: data.activeLockout !== null,
      riskInsight: data.riskInsight
        ? { severity: data.riskInsight.severity, score: data.riskInsight.score }
        : null,
    },
    { now, faultCodeId },
  );
}

export async function buildMemoryCard(
  summary: EquipmentMemorySummary,
  locale: Locale,
): Promise<EquipmentMemoryCard> {
  return {
    summary,
    sentence: buildMemorySentence(summary, locale),
    hint: await requestCheckHint(getAiProvider(), summary, locale),
  };
}

export async function loadEquipmentMemoryCard(
  equipmentId: string,
  locale: Locale,
  faultCodeId?: string | null,
): Promise<EquipmentMemoryCard | null> {
  const data = await loadEquipmentMemoryData(equipmentId);
  if (!data) return null;
  return buildMemoryCard(summarizeMemoryData(data, new Date(), faultCodeId), locale);
}

export interface EquipmentListData {
  items: EquipmentListItem[];
  sites: { id: string; name: string }[];
}

async function loadListOrders(since: Date): Promise<EquipmentListOrder[]> {
  const supabase = await createSupabaseServerClient();
  const filter = [
    `issued_at.gte.${since.toISOString()}`,
    "and(downtime_started_at.not.is.null,downtime_ended_at.is.null)",
  ].join(",");
  const rows: EquipmentListOrder[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("work_orders")
      .select(
        "equipment_id, kind, status, issued_at, fault_code_id, downtime_started_at, downtime_ended_at",
      )
      .or(filter)
      .order("issued_at", { ascending: false })
      .order("id")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load equipment orders: ${error.message}`);
    const batch = data ?? [];
    rows.push(
      ...batch.map((row) => ({
        equipmentId: row.equipment_id,
        kind: row.kind,
        status: row.status,
        issuedAt: row.issued_at,
        faultCodeId: row.fault_code_id,
        downtimeStartedAt: row.downtime_started_at,
        downtimeEndedAt: row.downtime_ended_at,
      })),
    );
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function loadEquipmentList(now: Date): Promise<EquipmentListData> {
  const supabase = await createSupabaseServerClient();
  const [equipment, sites, orders, lockouts, rca, insights] = await Promise.all([
    supabase
      .from("equipment")
      .select(
        "id, name, inventory_number, site_id, equipment_type, criticality, downtime_cost_per_hour, requires_lockout, site:site_id(name)",
      )
      .eq("is_active", true)
      .order("name"),
    supabase.from("sites").select("id, name").eq("is_active", true).order("name"),
    loadListOrders(new Date(now.getTime() - LIST_HISTORY_DAYS * MS_PER_DAY)),
    supabase.from("lockouts").select("equipment_id").is("released_at", null),
    supabase.from("rca_cases").select("equipment_id").neq("status", "closed"),
    supabase
      .from("insights")
      .select("id, kind, entity_id, severity, metrics, summary, recommendation, created_at")
      .eq("entity_type", "equipment")
      .ilike("kind", "%risk%")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const failure = equipment.error ?? sites.error ?? lockouts.error ?? rca.error ?? insights.error;
  if (failure) throw new Error(`Failed to load equipment: ${failure.message}`);
  const units = (equipment.data ?? []) as unknown as EquipmentRecord[];
  return {
    sites: sites.data ?? [],
    items: buildEquipmentList(
      {
        equipment: units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          inventoryNumber: unit.inventory_number,
          siteId: unit.site_id,
          siteName: unit.site?.name ?? "",
          equipmentType: unit.equipment_type,
          criticality: unit.criticality,
        })),
        orders,
        lockedEquipmentIds: (lockouts.data ?? []).map((row) => row.equipment_id),
        openRcaEquipmentIds: (rca.data ?? []).map((row) => row.equipment_id),
        insights: ((insights.data ?? []) as InsightRecord[])
          .map(toRiskInsight)
          .filter((item): item is RiskInsight => item !== null),
      },
      now,
    ),
  };
}
