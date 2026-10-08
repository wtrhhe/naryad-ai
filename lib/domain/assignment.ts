import type { Database } from "@/lib/supabase/database.types";

export type Specialty = Database["public"]["Enums"]["specialty"];
export type EquipmentType = Database["public"]["Enums"]["equipment_type"];

export type Availability =
  | { kind: "free" }
  | { kind: "busy"; orderNumber: number }
  | { kind: "queued"; length: number }
  | { kind: "off_shift" }
  | { kind: "no_permit"; missing: readonly string[] };

export interface AssigneeCandidate {
  employeeId: string;
  fullName: string;
  specialty: Specialty | null;
  grade: number | null;
  brigadeId: string | null;
  onShift: boolean;
  activeOrderNumber: number | null;
  queueLength: number;
  closedOnType: number;
  rating: number | null;
  missingPermits: readonly string[];
}

export interface ScoreReason {
  key: string;
  values?: Record<string, string | number>;
}

export interface ScoredCandidate {
  candidate: AssigneeCandidate;
  availability: Availability;
  score: number;
  selectable: boolean;
  reasons: readonly ScoreReason[];
}

export interface AssignmentNeed {
  specialty: Specialty | null;
  equipmentType: EquipmentType;
}

export type RankAssignees = (
  candidates: readonly AssigneeCandidate[],
  need: AssignmentNeed,
) => readonly ScoredCandidate[];

export type BoardRow = Database["public"]["Functions"]["assignee_board"]["Returns"][number];

export function candidateFromBoard(row: BoardRow): AssigneeCandidate {
  return {
    employeeId: row.employee_id,
    fullName: row.full_name,
    specialty: row.specialty,
    grade: row.grade,
    brigadeId: row.brigade_id,
    onShift: row.on_shift,
    activeOrderNumber: row.active_order_number,
    queueLength: row.queue_length,
    closedOnType: row.closed_on_type,
    rating: null,
    missingPermits: [],
  };
}
