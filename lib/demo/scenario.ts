export const DEMO_BASELINE_KEY = "demo.baseline_at";
export const DEMO_TIME_SCALE_KEY = "demo.time_scale";
export const DEMO_TIME_SCALES = [1, 10, 30, 60] as const;

export const DEMO_TEAM = {
  master: "1002",
  workers: ["2006", "2009"],
  shortDeadlineEquipment: "ОБ-006",
  reworkEquipment: "ОБ-009",
  emergencyEquipment: "ОБ-011",
} as const;

export const SHORT_DEADLINE_MINUTES = 3;

export interface DemoRefs {
  masterId: string;
  firstWorkerId: string;
  secondWorkerId: string;
  shortDeadlineEquipment: { id: string; siteId: string };
  reworkEquipment: { id: string; siteId: string };
  shiftPeriod: "day" | "night";
}

export interface DemoOrderRow {
  kind: "planned" | "unplanned";
  priority: "emergency" | "high" | "normal" | "planned";
  status: "issued" | "in_progress";
  description: string;
  site_id: string;
  equipment_id: string;
  assignee_id: string;
  master_id: string;
  due_at: string | null;
  standard_hours: number;
  shift_period: "day" | "night";
  issued_at: string;
  accepted_at: string | null;
  started_at: string | null;
  downtime_started_at: string | null;
}

const MS_PER_MINUTE = 60_000;

export function demoOrders(refs: DemoRefs, now: Date, timeScale: number): DemoOrderRow[] {
  const nowIso = now.toISOString();
  const deadlineMs = (SHORT_DEADLINE_MINUTES * MS_PER_MINUTE) / Math.max(1, timeScale);
  const startedAt = new Date(now.getTime() - 40 * MS_PER_MINUTE).toISOString();
  return [
    {
      kind: "unplanned",
      priority: "normal",
      status: "issued",
      description:
        "Сход ленты на хвостовом барабане, подтянуть натяжную станцию и отцентровать ленту",
      site_id: refs.shortDeadlineEquipment.siteId,
      equipment_id: refs.shortDeadlineEquipment.id,
      assignee_id: refs.firstWorkerId,
      master_id: refs.masterId,
      due_at: new Date(now.getTime() + deadlineMs).toISOString(),
      standard_hours: 1,
      shift_period: refs.shiftPeriod,
      issued_at: nowIso,
      accepted_at: null,
      started_at: null,
      downtime_started_at: nowIso,
    },
    {
      kind: "planned",
      priority: "planned",
      status: "in_progress",
      description: "Плановая замена смазки подшипниковых узлов насоса, осмотр муфты",
      site_id: refs.reworkEquipment.siteId,
      equipment_id: refs.reworkEquipment.id,
      assignee_id: refs.secondWorkerId,
      master_id: refs.masterId,
      due_at: null,
      standard_hours: 2,
      shift_period: refs.shiftPeriod,
      issued_at: new Date(now.getTime() - 60 * MS_PER_MINUTE).toISOString(),
      accepted_at: new Date(now.getTime() - 50 * MS_PER_MINUTE).toISOString(),
      started_at: startedAt,
      downtime_started_at: null,
    },
  ];
}

export function parseTimeScale(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 600 ? numeric : 1;
}
