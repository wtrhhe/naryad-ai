import { describe, expect, it } from "vitest";
import { DEFAULT_RATING_WEIGHTS } from "@/lib/rating/formula";
import {
  buildRatingTables,
  factRowSchema,
  filterBrigades,
  filterEmployees,
  shortName,
  snapshotRows,
  summarize,
  toOrderFact,
  withPlaces,
  workerView,
  type BrigadeRecord,
  type OrderFact,
  type PersonRecord,
} from "@/lib/rating/board";

function person(overrides: Partial<PersonRecord> & { id: string }): PersonRecord {
  return {
    fullName: `Работник ${overrides.id}`,
    role: "worker",
    brigadeId: "b1",
    isActive: true,
    locale: "ru",
    siteIds: [],
    ...overrides,
  };
}

const PEOPLE: PersonRecord[] = [
  person({ id: "w1", fullName: "Ахметов Ержан Болатович", locale: "kk" }),
  person({ id: "w2", fullName: "Попов Алексей Игоревич" }),
  person({ id: "w3", brigadeId: "b2" }),
  person({ id: "w4", brigadeId: "b2" }),
  person({ id: "m1", role: "master", brigadeId: null }),
  person({ id: "w5", isActive: false }),
];

const BRIGADES: BrigadeRecord[] = [
  { id: "b1", name: "Механослужба дробления", siteId: "s1", isActive: true },
  { id: "b2", name: "Ремонтная бригада РМЦ", siteId: "s2", isActive: true },
];

function fact(overrides: Partial<OrderFact> = {}): OrderFact {
  return {
    orderId: crypto.randomUUID(),
    number: 1,
    assigneeId: "w1",
    brigadeId: "b1",
    siteId: "s1",
    equipmentId: "e1",
    equipmentName: "Насос Н-4",
    faultCodeId: "f1",
    faultCode: "М-01",
    priority: "normal",
    kind: "unplanned",
    closedAt: "2026-10-05T12:00:00Z",
    dueAt: "2026-10-05T12:00:00Z",
    doneAt: "2026-10-05T11:00:00Z",
    standardHours: 2,
    score: 80,
    reworkCount: 0,
    ...overrides,
  };
}

function tables() {
  return buildRatingTables({
    facts: [
      fact({ assigneeId: "w1", score: 90, closedAt: "2026-10-05T12:00:00Z", number: 11 }),
      fact({ assigneeId: "w1", score: 92, closedAt: "2026-10-06T12:00:00Z", number: 12 }),
      fact({ assigneeId: "w2", score: 60, reworkCount: 1, equipmentId: "e2", number: 13 }),
      fact({
        assigneeId: "w3",
        brigadeId: "b2",
        siteId: "s3",
        score: null,
        dueAt: "2026-10-05T10:00:00Z",
        number: 14,
      }),
    ],
    followUps: [
      {
        orderId: "later",
        equipmentId: "e2",
        faultCodeId: "f1",
        issuedAt: "2026-10-07T08:00:00Z",
        kind: "unplanned",
      },
    ],
    refusals: [{ employeeId: "w4", brigadeId: "b2", isValidExcuse: false }],
    weights: DEFAULT_RATING_WEIGHTS,
    people: PEOPLE,
    brigades: BRIGADES,
  });
}

describe("factRowSchema", () => {
  it("coerces numeric strings and keeps null scores", () => {
    const row = factRowSchema.parse({
      order_id: "o1",
      order_number: "42",
      assignee_id: null,
      brigade_id: "b1",
      site_id: "s1",
      equipment_id: "e1",
      equipment_name: "Конвейер К-3",
      fault_code_id: null,
      fault_code: null,
      priority: "high",
      kind: "unplanned",
      closed_at: "2026-10-05T12:00:00Z",
      due_at: null,
      done_at: null,
      standard_hours: "2.50",
      score: null,
      rework_count: 0,
    });
    expect(toOrderFact(row)).toMatchObject({ number: 42, standardHours: 2.5, score: null });
  });
});

describe("buildRatingTables", () => {
  it("ranks active workers, attaches names and keeps idle workers at the bottom", () => {
    const { employees } = tables();
    expect(employees.map((item) => item.subjectId)).toEqual(["w1", "w2", "w3", "w4"]);
    expect(employees[0]).toMatchObject({
      place: 1,
      name: "Ахметов Ержан Болатович",
      brigadeName: "Механослужба дробления",
      locale: "kk",
    });
    expect(employees.find((item) => item.subjectId === "w3")?.siteIds.sort()).toEqual(["s2", "s3"]);
    expect(employees.some((item) => item.subjectId === "m1" || item.subjectId === "w5")).toBe(
      false,
    );
  });

  it("rates brigades with member counts", () => {
    const { brigades } = tables();
    expect(brigades.map((item) => [item.subjectId, item.memberCount])).toEqual([
      ["b1", 2],
      ["b2", 2],
    ]);
    expect(brigades[1]?.unexcusedRefusals).toBe(1);
  });

  it("flags repeat failures and late orders", () => {
    const { orders } = tables();
    expect(orders.find((order) => order.number === 13)?.repeated).toBe(true);
    expect(orders.find((order) => order.number === 14)?.onTime).toBe(false);
  });
});

describe("withPlaces", () => {
  it("shares places on ties", () => {
    const { employees } = tables();
    const tied = employees.map((item) => ({ ...item, score: 50, closedCount: 1 }));
    expect(withPlaces(tied).map((item) => item.place)).toEqual([1, 1, 1, 1]);
  });
});

describe("filters", () => {
  it("filters by site and brigade and renumbers places", () => {
    const { employees, brigades } = tables();
    expect(filterEmployees(employees, { brigadeId: "b2" }).map((item) => item.place)).toEqual([
      1, 2,
    ]);
    expect(filterEmployees(employees, { siteId: "s3" }).map((item) => item.subjectId)).toEqual([
      "w3",
    ]);
    expect(filterBrigades(brigades, { siteId: "s2" }).map((item) => item.subjectId)).toEqual([
      "b2",
    ]);
  });
});

describe("summarize", () => {
  it("counts closed orders, on-time share and the leader", () => {
    const summary = summarize(tables().employees);
    expect(summary.closed).toBe(4);
    expect(summary.onTimeShare).toBe(75);
    expect(summary.leader?.name).toBe("Ахметов Ержан Болатович");
    expect(summarize([])).toEqual({ closed: 0, onTimeShare: null, average: null, leader: null });
  });
});

describe("workerView", () => {
  it("returns only own data with places among active subjects", () => {
    const view = workerView(tables(), "w2", "b1");
    expect(view).toMatchObject({ place: 2, total: 3, brigadePlace: 1, brigadeTotal: 2 });
    expect(view.orders.map((order) => order.number)).toEqual([13]);
  });

  it("has no place without closed orders", () => {
    const view = workerView(tables(), "w4", null);
    expect(view.place).toBeNull();
    expect(view.brigade).toBeNull();
  });
});

describe("snapshotRows", () => {
  it("stores subjects with activity and their explanation", () => {
    const rows = snapshotRows(
      tables(),
      {
        preset: "week",
        start: new Date("2026-10-01T19:00:00Z"),
        end: new Date("2026-10-08T19:00:00Z"),
      },
      (rating, locale) => `${rating.subjectId}:${locale}`,
    );
    expect(rows.map((row) => `${row.subject_type}:${row.explanation}`)).toEqual([
      "employee:w1:kk",
      "employee:w2:ru",
      "employee:w3:ru",
      "employee:w4:ru",
      "brigade:b1:ru",
      "brigade:b2:ru",
    ]);
    expect(rows[0]?.components).toMatchObject({ preset: "week", place: 1, closedCount: 2 });
  });
});

describe("peerBenchmark", () => {
  it("takes the median contribution of active subjects", () => {
    const { benchmarks, employees } = tables();
    const active = employees.filter((item) => item.closedCount > 0);
    const sorted = active.map((item) => item.contributions.quality).sort((a, b) => a - b);
    expect(benchmarks.employee?.quality).toBe(sorted[1]);
    expect(benchmarks.brigade).not.toBeNull();
  });
});

describe("shortName", () => {
  it("abbreviates given names", () => {
    expect(shortName("Ахметов Ержан Болатович")).toBe("Ахметов Е. Б.");
    expect(shortName("Ким")).toBe("Ким");
    expect(shortName(null)).toBeNull();
  });
});
