import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import { median } from "@/lib/review/checks/material-norms";
import type {
  AcousticPeak,
  FaultCategory,
  PhotoKind,
  ReviewContext,
  WorkOrderKind,
} from "@/lib/review/types";

export interface ReviewOrderRow {
  id: string;
  number: number;
  kind: WorkOrderKind;
  status: WorkOrderStatus;
  description: string;
  work_performed: string | null;
  close_comment: string | null;
  fault_code_id: string | null;
  standard_hours: number | null;
  due_at: string | null;
  started_at: string | null;
  done_at: string | null;
  paused_seconds: number;
  rework_count: number;
  assignee_id: string | null;
  brigade_id: string | null;
  master_id: string;
  equipment: { name: string; equipment_type: string; requires_lockout: boolean } | null;
  fault_code: {
    id: string;
    code: string;
    name: string;
    category: FaultCategory;
    standard_hours: number;
  } | null;
}

export interface WriteoffRow {
  material_id: string;
  quantity: number;
  material: { code: string; name: string; unit: string; categories: FaultCategory[] } | null;
}

export interface NormRow {
  material_id: string;
  qty_min: number;
  qty_typical: number;
  qty_max: number;
  material: { name: string } | null;
}

export interface HistoryRow {
  material_id: string;
  quantity: number;
}

export interface PhotoRow {
  id: string;
  kind: PhotoKind;
  taken_at: string | null;
  received_at: string;
  phash: string | null;
  ghost_score: number | null;
  forced_reason: string | null;
}

export interface PhotoMatchRow {
  photo_id: string;
  match_photo_id: string;
  match_order_id: string;
  match_order_number: number | null;
  distance: number;
}

export interface LockoutRow {
  locked_at: string;
  released_at: string | null;
}

export interface AcousticRow {
  kind: "before" | "after";
  rms: number;
  spectral_kurtosis: number | null;
  peaks: Json;
  recorded_at: string;
}

export interface EventRow {
  action: string;
  occurred_at: string;
}

export interface ReviewRows {
  order: ReviewOrderRow;
  writeoffs: readonly WriteoffRow[];
  norms: readonly NormRow[];
  history: readonly HistoryRow[];
  photos: readonly PhotoRow[];
  matches: readonly PhotoMatchRow[];
  lockouts: readonly LockoutRow[];
  acoustic: readonly AcousticRow[];
  events: readonly EventRow[];
}

const peakSchema = z.object({
  f: z.coerce.number(),
  db: z.coerce.number(),
  label: z.string().optional(),
});

export function parsePeaks(value: Json): AcousticPeak[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const parsed = peakSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const toNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

export function historyByMaterial(
  history: readonly HistoryRow[],
): Map<string, { median: number | null; count: number }> {
  const grouped = new Map<string, number[]>();
  for (const row of history) {
    const list = grouped.get(row.material_id) ?? [];
    list.push(Number(row.quantity));
    grouped.set(row.material_id, list);
  }
  return new Map(
    [...grouped.entries()].map(([id, values]) => [
      id,
      { median: median(values), count: values.length },
    ]),
  );
}

export function toReviewContext(rows: ReviewRows): ReviewContext {
  const { order } = rows;
  const normById = new Map(rows.norms.map((norm) => [norm.material_id, norm]));
  const history = historyByMaterial(rows.history);
  return {
    order: {
      id: order.id,
      number: order.number,
      kind: order.kind,
      description: order.description,
      workPerformed: order.work_performed,
      closeComment: order.close_comment,
      faultCodeId: order.fault_code_id,
      standardHours: toNumber(order.standard_hours),
      dueAt: order.due_at,
      startedAt: order.started_at,
      doneAt: order.done_at,
      pausedSeconds: order.paused_seconds,
      reworkCount: order.rework_count,
    },
    equipment: {
      name: order.equipment?.name ?? "",
      type: order.equipment?.equipment_type ?? "other",
      requiresLockout: order.equipment?.requires_lockout ?? false,
    },
    faultCode: order.fault_code
      ? {
          id: order.fault_code.id,
          code: order.fault_code.code,
          name: order.fault_code.name,
          category: order.fault_code.category,
          standardHours: Number(order.fault_code.standard_hours),
        }
      : null,
    materials: rows.writeoffs.map((row) => {
      const norm = normById.get(row.material_id);
      const past = history.get(row.material_id);
      return {
        materialId: row.material_id,
        code: row.material?.code ?? "",
        name: row.material?.name ?? row.material_id,
        unit: row.material?.unit ?? "",
        quantity: Number(row.quantity),
        categories: row.material?.categories ?? [],
        norm: norm
          ? {
              min: Number(norm.qty_min),
              typical: Number(norm.qty_typical),
              max: Number(norm.qty_max),
            }
          : null,
        historyMedian: past?.median ?? null,
        historyCount: past?.count ?? 0,
      };
    }),
    requiredMaterials: rows.norms
      .filter((norm) => Number(norm.qty_min) > 0)
      .map((norm) => ({
        materialId: norm.material_id,
        name: norm.material?.name ?? norm.material_id,
        min: Number(norm.qty_min),
      })),
    photos: rows.photos.map((row) => ({
      id: row.id,
      kind: row.kind,
      takenAt: row.taken_at,
      receivedAt: row.received_at,
      phash: row.phash,
      ghostScore: toNumber(row.ghost_score),
      forcedReason: row.forced_reason,
    })),
    photoMatches: rows.matches.map((row) => ({
      photoId: row.photo_id,
      matchPhotoId: row.match_photo_id,
      matchOrderId: row.match_order_id,
      matchOrderNumber: toNumber(row.match_order_number),
      distance: Number(row.distance),
    })),
    lockouts: rows.lockouts.map((row) => ({
      lockedAt: row.locked_at,
      releasedAt: row.released_at,
    })),
    acoustic: rows.acoustic.map((row) => ({
      kind: row.kind,
      rms: Number(row.rms),
      kurtosis: toNumber(row.spectral_kurtosis),
      peaks: parsePeaks(row.peaks),
      recordedAt: row.recorded_at,
    })),
    events: rows.events.map((row) => ({ action: row.action, occurredAt: row.occurred_at })),
  };
}
