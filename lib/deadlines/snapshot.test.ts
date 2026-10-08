import { describe, expect, it } from "vitest";
import {
  statusSince,
  toDeadlineOrder,
  toDeadlineSettings,
  toReplacementCandidates,
  type EmployeeRow,
  type OrderRow,
} from "@/lib/deadlines/snapshot";

const row: OrderRow = {
  id: "o1",
  number: 12,
  status: "in_progress",
  priority: "high",
  issued_at: "2026-10-16T08:00:00Z",
  queued_at: null,
  accepted_at: "2026-10-16T08:05:00Z",
  started_at: "2026-10-16T08:10:00Z",
  paused_at: null,
  due_at: null,
  standard_hours: 2,
  assignee_id: "w1",
  master_id: "m1",
  last_comment: null,
  updated_at: "2026-10-16T08:10:00Z",
  equipment: { name: "Конвейер К-3" },
  site: { name: "Погрузка" },
};

const employees: EmployeeRow[] = [
  {
    id: "w1",
    full_name: "Иванов Иван",
    role: "worker",
    specialty: "fitter",
    on_shift: true,
    locale: "ru",
    is_active: true,
  },
  {
    id: "w2",
    full_name: "Петров Пётр",
    role: "worker",
    specialty: "fitter",
    on_shift: true,
    locale: "kk",
    is_active: true,
  },
  {
    id: "m1",
    full_name: "Мастер",
    role: "master",
    specialty: null,
    on_shift: true,
    locale: "ru",
    is_active: true,
  },
];

describe("toDeadlineOrder", () => {
  it("flattens joined rows and resolves the assignee", () => {
    const order = toDeadlineOrder(
      row,
      new Map(employees.map((employee) => [employee.id, employee])),
    );
    expect(order).toMatchObject({
      number: 12,
      assigneeName: "Иванов Иван",
      equipmentName: "Конвейер К-3",
      statusSince: row.started_at,
    });
  });
});

describe("statusSince", () => {
  it("uses the pause time for paused orders", () => {
    expect(statusSince({ ...row, status: "paused", paused_at: "2026-10-16T09:00:00Z" })).toBe(
      "2026-10-16T09:00:00Z",
    );
  });
});

describe("toReplacementCandidates", () => {
  it("marks workers with active orders as busy and skips non workers", () => {
    expect(toReplacementCandidates(employees, [row])).toEqual([
      expect.objectContaining({ employeeId: "w1", busy: true }),
      expect.objectContaining({ employeeId: "w2", busy: false }),
    ]);
  });
});

describe("toDeadlineSettings", () => {
  it("reads known keys and ignores invalid values", () => {
    const settings = toDeadlineSettings([
      { key: "deadline.reminder_minutes", value: 20 },
      { key: "demo.time_scale", value: "30" },
      { key: "deadline.repeat_interval_minutes", value: -5 },
      { key: "unrelated", value: 1 },
    ]);
    expect(settings).toMatchObject({
      reminderMinutes: 20,
      timeScale: 30,
      repeatIntervalMinutes: 15,
    });
  });
});
