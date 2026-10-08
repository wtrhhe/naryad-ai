import { describe, expect, it } from "vitest";
import {
  activeDowntime,
  applyFilters,
  buildColumns,
  columnFor,
  shiftCounters,
  sortWorkers,
  workerStatus,
  type BoardOrder,
  type BoardWorker,
} from "@/lib/board/model";
import { currentShiftWindow } from "@/lib/board/shift";

const now = new Date("2026-10-16T12:00:00+05:00");

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: crypto.randomUUID(),
    number: 1,
    status: "in_progress",
    priority: "normal",
    kind: "unplanned",
    issuedAt: "2026-10-16T09:00:00+05:00",
    dueAt: "2026-10-16T18:00:00+05:00",
    standardHours: null,
    closedAt: null,
    downtimeStartedAt: null,
    downtimeEndedAt: null,
    siteId: "site-1",
    equipmentId: "eq-1",
    equipmentName: "Насос Н-4",
    downtimeCostPerHour: 360000,
    assigneeId: "w1",
    assigneeName: "Иванов",
    ...overrides,
  };
}

describe("columnFor", () => {
  it("puts late open work into the overdue column", () => {
    expect(columnFor(order({ dueAt: "2026-10-16T11:00:00+05:00" }), now)).toBe("overdue");
  });

  it("keeps finished work in review even after the deadline", () => {
    expect(columnFor(order({ status: "done", dueAt: "2026-10-16T11:00:00+05:00" }), now)).toBe(
      "review",
    );
    expect(columnFor(order({ status: "ai_review" }), now)).toBe("review");
  });

  it("hides closed, cancelled and rejected orders", () => {
    expect(columnFor(order({ status: "closed" }), now)).toBeNull();
    expect(columnFor(order({ status: "cancelled" }), now)).toBeNull();
    expect(columnFor(order({ status: "rejected" }), now)).toBeNull();
  });
});

describe("buildColumns", () => {
  it("sorts emergencies first inside a column", () => {
    const columns = buildColumns(
      [order({ number: 1, priority: "normal" }), order({ number: 2, priority: "emergency" })],
      now,
    );
    expect(columns.in_progress.map((item) => item.number)).toEqual([2, 1]);
  });
});

describe("applyFilters", () => {
  it("filters by site, equipment, assignee and priority together", () => {
    const orders = [
      order({ priority: "emergency" }),
      order({ siteId: "site-2" }),
      order({ assigneeId: "w2" }),
    ];
    expect(
      applyFilters(orders, { siteId: "site-1", assigneeId: "w1", priority: "emergency" }),
    ).toHaveLength(1);
  });
});

describe("workers", () => {
  const worker = (overrides: Partial<BoardWorker>): BoardWorker => ({
    id: "w",
    fullName: "Б",
    specialty: "fitter",
    onShift: true,
    activeOrderNumber: null,
    queueLength: 0,
    ...overrides,
  });

  it("maps to the four colours from the brief", () => {
    expect(workerStatus(worker({}))).toBe("free");
    expect(workerStatus(worker({ activeOrderNumber: 12 }))).toBe("busy");
    expect(workerStatus(worker({ queueLength: 2 }))).toBe("queue");
    expect(workerStatus(worker({ onShift: false, activeOrderNumber: 3 }))).toBe("off_shift");
  });

  it("lists free people first", () => {
    const sorted = sortWorkers([
      worker({ id: "a", fullName: "А", onShift: false }),
      worker({ id: "b", fullName: "Б", activeOrderNumber: 4 }),
      worker({ id: "c", fullName: "В" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });
});

describe("shiftCounters", () => {
  it("counts the current shift and the equipment standing idle", () => {
    const shift = currentShiftWindow(now);
    const counters = shiftCounters(
      [
        order({ downtimeStartedAt: "2026-10-16T09:00:00+05:00" }),
        order({ equipmentId: "eq-1", downtimeStartedAt: "2026-10-16T10:00:00+05:00" }),
        order({ status: "closed", closedAt: "2026-10-16T11:00:00+05:00", equipmentId: "eq-2" }),
        order({
          issuedAt: "2026-10-15T09:00:00+05:00",
          dueAt: "2026-10-15T12:00:00+05:00",
          equipmentId: "eq-3",
        }),
      ],
      shift,
      now,
    );
    expect(counters).toEqual({ issued: 3, done: 1, overdue: 1, equipmentDown: 1 });
  });
});

describe("activeDowntime", () => {
  it("lists only equipment still standing idle", () => {
    const items = activeDowntime([
      order({ downtimeStartedAt: "2026-10-16T09:00:00+05:00" }),
      order({
        downtimeStartedAt: "2026-10-16T09:00:00+05:00",
        downtimeEndedAt: "2026-10-16T10:00:00+05:00",
      }),
      order(),
    ]);
    expect(items).toEqual([
      { startedAt: "2026-10-16T09:00:00+05:00", endedAt: null, costPerHour: 360000 },
    ]);
  });
});
