import type { ExternalEquipment, ExternalWorkOrder } from "@/integrations/types";

export interface WorkOrderExportRow {
  id: string;
  number: number;
  kind: "planned" | "unplanned";
  priority: "emergency" | "high" | "normal" | "planned";
  status: string;
  description: string;
  work_performed: string | null;
  issued_at: string;
  started_at: string | null;
  done_at: string | null;
  closed_at: string | null;
  paused_seconds: number;
  standard_hours: number | null;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  downtime_cost: number | null;
  site: { code: string; name: string } | null;
  equipment: { inventory_number: string; name: string } | null;
  fault_code: { code: string } | null;
  assignee: { personnel_number: string } | null;
  master: { personnel_number: string } | null;
  material_writeoffs: {
    quantity: number;
    material: { code: string; name: string; unit: string; price: number } | null;
  }[];
  ai_reviews: { revision: number; score: number | null; master_score: number | null }[];
}

const MS_PER_HOUR = 3_600_000;

function hoursBetween(start: string | null, end: string | null, pausedSeconds = 0): number | null {
  if (!start || !end) return null;
  const hours = (new Date(end).getTime() - new Date(start).getTime()) / MS_PER_HOUR;
  return Math.max(0, Math.round((hours - pausedSeconds / 3600) * 100) / 100);
}

function finalScore(reviews: WorkOrderExportRow["ai_reviews"]): number | null {
  const latest = [...reviews].sort((a, b) => b.revision - a.revision)[0];
  if (!latest) return null;
  return latest.master_score ?? latest.score;
}

export function toExternalWorkOrder(row: WorkOrderExportRow): ExternalWorkOrder {
  return {
    externalId: row.id,
    number: row.number,
    kind: row.kind,
    priority: row.priority,
    status: row.status,
    description: row.description,
    workPerformed: row.work_performed,
    site: { code: row.site?.code ?? "", name: row.site?.name ?? "" },
    equipment: {
      inventoryNumber: row.equipment?.inventory_number ?? "",
      name: row.equipment?.name ?? "",
    },
    faultCode: row.fault_code?.code ?? null,
    assigneePersonnelNumber: row.assignee?.personnel_number ?? null,
    masterPersonnelNumber: row.master?.personnel_number ?? null,
    issuedAt: row.issued_at,
    startedAt: row.started_at,
    doneAt: row.done_at,
    closedAt: row.closed_at,
    standardHours: row.standard_hours === null ? null : Number(row.standard_hours),
    actualHours: hoursBetween(row.started_at, row.done_at, row.paused_seconds),
    downtimeHours: hoursBetween(row.downtime_started_at, row.downtime_ended_at),
    downtimeCost: row.downtime_cost === null ? null : Number(row.downtime_cost),
    score: finalScore(row.ai_reviews),
    materials: row.material_writeoffs
      .filter((line) => line.material !== null)
      .map((line) => ({
        code: line.material?.code ?? "",
        name: line.material?.name ?? "",
        unit: line.material?.unit ?? "",
        quantity: Number(line.quantity),
        price: Number(line.material?.price ?? 0),
      })),
  };
}

export function toEquipmentRow(item: ExternalEquipment, siteId: string) {
  return {
    inventory_number: item.inventoryNumber,
    name: item.name,
    site_id: siteId,
    equipment_type: item.equipmentType,
    criticality: item.criticality,
    downtime_cost_per_hour: item.downtimeCostPerHour,
    requires_lockout: item.requiresLockout,
  };
}
