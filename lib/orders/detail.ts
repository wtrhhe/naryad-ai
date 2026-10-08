import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

const ORDER_COLUMNS =
  "id, number, kind, priority, status, description, comment, due_at, standard_hours, issued_at, accepted_at, started_at, done_at, closed_at, downtime_started_at, downtime_ended_at, work_performed, close_comment, last_comment, suggested_fault_code_id, fault_code_id, queue_position, assignee_id, master_id, equipment:equipment_id(id, name, inventory_number, equipment_type, downtime_cost_per_hour), site:site_id(name), assignee:employees!work_orders_assignee_id_fkey(full_name, personnel_number), master:employees!work_orders_master_id_fkey(full_name), fault_code:fault_code_id(code, name)";

export interface OrderDetail {
  id: string;
  number: number;
  kind: Enums["work_order_type"];
  priority: Enums["work_order_priority"];
  status: WorkOrderStatus;
  description: string;
  comment: string | null;
  dueAt: string | null;
  standardHours: number | null;
  issuedAt: string;
  startedAt: string | null;
  doneAt: string | null;
  closedAt: string | null;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
  workPerformed: string | null;
  closeComment: string | null;
  lastComment: string | null;
  suggestedFaultCodeId: string | null;
  faultCode: { code: string; name: string } | null;
  queuePosition: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  masterName: string | null;
  equipment: {
    id: string;
    name: string;
    inventoryNumber: string;
    type: Enums["equipment_type"];
    costPerHour: number;
  };
  siteName: string;
}

export interface OrderEventView {
  id: string;
  action: Enums["work_order_action"];
  toStatus: WorkOrderStatus | null;
  actorName: string | null;
  reason: string | null;
  comment: string | null;
  occurredAt: string;
}

export interface OrderPhotoView {
  id: string;
  kind: Enums["photo_kind"];
  url: string | null;
  takenAt: string | null;
}

export interface OrderMaterialView {
  name: string;
  unit: string;
  quantity: number;
}

export interface OrderBundle {
  order: OrderDetail;
  events: OrderEventView[];
  photos: OrderPhotoView[];
  materials: OrderMaterialView[];
}

interface OrderRecord {
  id: string;
  number: number;
  kind: OrderDetail["kind"];
  priority: OrderDetail["priority"];
  status: WorkOrderStatus;
  description: string;
  comment: string | null;
  due_at: string | null;
  standard_hours: number | null;
  issued_at: string;
  started_at: string | null;
  done_at: string | null;
  closed_at: string | null;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  work_performed: string | null;
  close_comment: string | null;
  last_comment: string | null;
  suggested_fault_code_id: string | null;
  queue_position: number | null;
  assignee_id: string | null;
  equipment: {
    id: string;
    name: string;
    inventory_number: string;
    equipment_type: Enums["equipment_type"];
    downtime_cost_per_hour: number;
  } | null;
  site: { name: string } | null;
  assignee: { full_name: string } | null;
  master: { full_name: string } | null;
  fault_code: { code: string; name: string } | null;
}

export async function loadOrderBundle(orderId: string): Promise<OrderBundle | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load order: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as OrderRecord;
  const [events, photos, materials] = await Promise.all([
    supabase
      .from("work_order_events")
      .select(
        "id, action, to_status, reason_text, comment, occurred_at, actor:actor_id(full_name), reason:reason_code_id(label)",
      )
      .eq("work_order_id", orderId)
      .order("occurred_at"),
    supabase
      .from("photos")
      .select("id, kind, storage_path, taken_at")
      .eq("work_order_id", orderId)
      .order("created_at"),
    supabase
      .from("material_writeoffs")
      .select("quantity, material:material_id(name, unit)")
      .eq("work_order_id", orderId),
  ]);
  const photoRows = photos.data ?? [];
  const signed =
    photoRows.length > 0
      ? await supabase.storage.from("photos").createSignedUrls(
          photoRows.map((photo) => photo.storage_path),
          3600,
        )
      : { data: [] };
  const urlByPath = new Map(
    (signed.data ?? []).map((item) => [item.path ?? "", item.signedUrl ?? null]),
  );
  type EventRecord = {
    id: string;
    action: OrderEventView["action"];
    to_status: WorkOrderStatus | null;
    reason_text: string | null;
    comment: string | null;
    occurred_at: string;
    actor: { full_name: string } | null;
    reason: { label: string } | null;
  };
  type MaterialRecord = { quantity: number; material: { name: string; unit: string } | null };
  return {
    order: {
      id: row.id,
      number: row.number,
      kind: row.kind,
      priority: row.priority,
      status: row.status,
      description: row.description,
      comment: row.comment,
      dueAt: row.due_at,
      standardHours: row.standard_hours === null ? null : Number(row.standard_hours),
      issuedAt: row.issued_at,
      startedAt: row.started_at,
      doneAt: row.done_at,
      closedAt: row.closed_at,
      downtimeStartedAt: row.downtime_started_at,
      downtimeEndedAt: row.downtime_ended_at,
      workPerformed: row.work_performed,
      closeComment: row.close_comment,
      lastComment: row.last_comment,
      suggestedFaultCodeId: row.suggested_fault_code_id,
      faultCode: row.fault_code,
      queuePosition: row.queue_position,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee?.full_name ?? null,
      masterName: row.master?.full_name ?? null,
      equipment: {
        id: row.equipment?.id ?? "",
        name: row.equipment?.name ?? "",
        inventoryNumber: row.equipment?.inventory_number ?? "",
        type: row.equipment?.equipment_type ?? "other",
        costPerHour: Number(row.equipment?.downtime_cost_per_hour ?? 0),
      },
      siteName: row.site?.name ?? "",
    },
    events: ((events.data ?? []) as unknown as EventRecord[]).map((event) => ({
      id: event.id,
      action: event.action,
      toStatus: event.to_status,
      actorName: event.actor?.full_name ?? null,
      reason: [event.reason?.label, event.reason_text].filter(Boolean).join(". ") || null,
      comment: event.comment,
      occurredAt: event.occurred_at,
    })),
    photos: photoRows.map((photo) => ({
      id: photo.id,
      kind: photo.kind,
      url: urlByPath.get(photo.storage_path) ?? null,
      takenAt: photo.taken_at,
    })),
    materials: ((materials.data ?? []) as unknown as MaterialRecord[]).map((line) => ({
      name: line.material?.name ?? "",
      unit: line.material?.unit ?? "",
      quantity: Number(line.quantity),
    })),
  };
}

export interface ActionReferences {
  rejectReasons: { id: string; label: string }[];
  pauseReasons: { id: string; label: string }[];
  faultCodes: { id: string; code: string; name: string }[];
  materials: { id: string; code: string; name: string; unit: string }[];
}

export async function loadActionReferences(): Promise<ActionReferences> {
  const supabase = await createSupabaseServerClient();
  const [reasons, faults, materials] = await Promise.all([
    supabase
      .from("reason_codes")
      .select("id, kind, label")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("fault_codes").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("materials").select("id, code, name, unit").eq("is_active", true).order("name"),
  ]);
  const reasonRows = reasons.data ?? [];
  return {
    rejectReasons: reasonRows.filter((row) => row.kind === "reject"),
    pauseReasons: reasonRows.filter((row) => row.kind === "pause"),
    faultCodes: faults.data ?? [],
    materials: materials.data ?? [],
  };
}
