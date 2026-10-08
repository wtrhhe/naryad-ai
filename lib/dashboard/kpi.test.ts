import { describe, expect, it } from "vitest";
import {
  bestWorkers,
  buildDashboard,
  dailySeries,
  downtimeSlice,
  liveDowntime,
  loadWindowStart,
  reviewScore,
  riskList,
  summarizeKpis,
  topEquipment,
  type DashboardEquipment,
  type DashboardOrder,
  type RcaRow,
} from "@/lib/dashboard/kpi";
import { periodWindow } from "@/lib/dashboard/period";
import type { RiskInsight } from "@/lib/equipment/risk";

const now = new Date("2026-10-08T12:00:00Z");
const window = periodWindow(now, 7);

const equipment: DashboardEquipment[] = [
  {
    id: "eq1",
    name: "Конвейер К-3",
    inventoryNumber: "ДР-005",
    siteName: "Дробление",
    criticality: 3,
    downtimeCostPerHour: 1_000_000,
  },
  {
    id: "eq2",
    name: "Насос Н-4",
    inventoryNumber: "ОБ-011",
    siteName: "Обогащение",
    criticality: 2,
    downtimeCostPerHour: 500_000,
  },
  {
    id: "eq3",
    name: "Грохот ГИТ-52",
    inventoryNumber: "ДР-006",
    siteName: "Дробление",
    criticality: 1,
    downtimeCostPerHour: 300_000,
  },
];

function order(overrides: Partial<DashboardOrder> = {}): DashboardOrder {
  return {
    id: crypto.randomUUID(),
    number: 1,
    kind: "unplanned",
    status: "closed",
    issuedAt: "2026-10-05T03:00:00Z",
    acceptedAt: null,
    startedAt: null,
    doneAt: null,
    closedAt: null,
    dueAt: null,
    standardHours: 4,
    pausedSeconds: 0,
    downtimeStartedAt: null,
    downtimeEndedAt: null,
    downtimeCost: null,
    equipmentId: "eq1",
    faultCodeId: null,
    assigneeId: null,
    assigneeName: null,
    score: null,
    ...overrides,
  };
}

const orders: DashboardOrder[] = [
  order({
    number: 1,
    acceptedAt: "2026-10-05T03:10:00Z",
    startedAt: "2026-10-05T03:30:00Z",
    doneAt: "2026-10-05T05:30:00Z",
    pausedSeconds: 1800,
    closedAt: "2026-10-05T06:00:00Z",
    downtimeStartedAt: "2026-10-05T03:00:00Z",
    downtimeEndedAt: "2026-10-05T05:00:00Z",
    downtimeCost: 2_000_000,
    assigneeId: "w1",
    assigneeName: "Ахметов Е.",
    score: 90,
  }),
  order({
    number: 2,
    status: "in_progress",
    issuedAt: "2026-10-08T09:00:00Z",
    acceptedAt: "2026-10-08T09:20:00Z",
    startedAt: "2026-10-08T09:30:00Z",
    dueAt: "2026-10-08T11:00:00Z",
    downtimeStartedAt: "2026-10-08T10:00:00Z",
  }),
  order({
    number: 3,
    kind: "planned",
    status: "issued",
    equipmentId: "eq2",
    issuedAt: "2026-10-08T11:00:00Z",
    dueAt: "2026-10-08T20:00:00Z",
  }),
  order({
    number: 4,
    equipmentId: "eq2",
    issuedAt: "2026-09-20T00:00:00Z",
    closedAt: "2026-10-02T05:00:00Z",
    downtimeStartedAt: "2026-10-01T17:00:00Z",
    downtimeEndedAt: "2026-10-01T21:00:00Z",
    assigneeId: "w1",
    assigneeName: "Ахметов Е.",
    score: 70,
  }),
  order({
    number: 5,
    status: "cancelled",
    equipmentId: "eq2",
    issuedAt: "2026-10-06T00:00:00Z",
  }),
  order({
    number: 6,
    kind: "planned",
    equipmentId: "eq3",
    issuedAt: "2026-10-07T01:00:00Z",
    closedAt: "2026-10-07T05:00:00Z",
    assigneeId: "w2",
    assigneeName: "Борисов А.",
    score: 95,
  }),
];

describe("summarizeKpis", () => {
  const kpis = summarizeKpis(orders, equipment, window, now);

  it("counts open, executing, overdue, issued and closed orders", () => {
    expect(kpis).toMatchObject({ open: 2, executing: 1, overdue: 1, issued: 5, closed: 3 });
  });

  it("averages reaction and completion without pauses", () => {
    expect(kpis.reaction).toEqual({ minutes: 15, count: 2 });
    expect(kpis.completion).toEqual({ minutes: 90, count: 1 });
  });

  it("clips downtime to the period and keeps open downtime live", () => {
    expect(kpis.downtime).toEqual({
      hours: 6,
      cost: 5_000_000,
      closedHours: 4,
      closedCost: 3_000_000,
      open: [{ startedAt: "2026-10-08T10:00:00.000Z", costPerHour: 1_000_000 }],
      equipmentDown: 1,
    });
    expect(
      liveDowntime(kpis.downtime, kpis.downtime.open, new Date("2026-10-08T13:00:00Z")),
    ).toEqual({ hours: 7, cost: 6_000_000, currentCost: 3_000_000 });
  });

  it("reports no averages without data", () => {
    const empty = summarizeKpis([], equipment, window, now);
    expect(empty.reaction).toEqual({ minutes: null, count: 0 });
    expect(empty.downtime.cost).toBe(0);
  });
});

describe("downtimeSlice", () => {
  it("returns nothing for downtime outside the period", () => {
    const old = order({
      downtimeStartedAt: "2026-09-01T00:00:00Z",
      downtimeEndedAt: "2026-09-01T02:00:00Z",
    });
    expect(downtimeSlice(old, 100, window.start.getTime(), now)).toBeNull();
    expect(downtimeSlice(order(), 100, window.start.getTime(), now)).toBeNull();
  });
});

describe("dailySeries", () => {
  it("buckets issued, closed and downtime by local day", () => {
    const series = dailySeries(orders, equipment, window, now);
    expect(series.map((point) => point.day)).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expect(series[0]).toEqual({
      day: "2026-10-02",
      issued: 0,
      closed: 1,
      downtimeHours: 2,
      downtimeCost: 1_000_000,
    });
    expect(series[3]).toMatchObject({ issued: 1, closed: 1, downtimeCost: 2_000_000 });
    expect(series[4]).toMatchObject({ issued: 1, closed: 0 });
    expect(series[6]).toMatchObject({ issued: 2, downtimeHours: 2, downtimeCost: 2_000_000 });
  });

  it("splits a downtime across midnight", () => {
    const overnight = order({
      downtimeStartedAt: "2026-10-04T17:00:00Z",
      downtimeEndedAt: "2026-10-04T21:00:00Z",
    });
    const series = dailySeries([overnight], equipment, window, now);
    expect(series.find((point) => point.day === "2026-10-04")?.downtimeHours).toBe(2);
    expect(series.find((point) => point.day === "2026-10-05")?.downtimeHours).toBe(2);
  });
});

describe("topEquipment", () => {
  it("ranks units by unplanned failures, then by downtime cost", () => {
    expect(topEquipment(orders, equipment, window, now)).toEqual([
      {
        equipmentId: "eq1",
        name: "Конвейер К-3",
        inventoryNumber: "ДР-005",
        siteName: "Дробление",
        unplanned: 2,
        downtimeHours: 4,
        downtimeCost: 4_000_000,
      },
      {
        equipmentId: "eq2",
        name: "Насос Н-4",
        inventoryNumber: "ОБ-011",
        siteName: "Обогащение",
        unplanned: 0,
        downtimeHours: 2,
        downtimeCost: 1_000_000,
      },
    ]);
  });
});

describe("bestWorkers", () => {
  it("prefers workers with enough closed orders, then the average score", () => {
    expect(bestWorkers(orders, window, 5, 2)).toEqual([
      { employeeId: "w1", name: "Ахметов Е.", closed: 2, avgScore: 80 },
      { employeeId: "w2", name: "Борисов А.", closed: 1, avgScore: 95 },
    ]);
    expect(bestWorkers(orders, window).map((row) => row.employeeId)).toEqual(["w2", "w1"]);
  });
});

describe("reviewScore", () => {
  it("takes the latest revision and the master's override", () => {
    expect(
      reviewScore([
        { revision: 0, score: 60, masterScore: null },
        { revision: 1, score: 70, masterScore: 75 },
      ]),
    ).toBe(75);
    expect(reviewScore([{ revision: 0, score: 50, masterScore: null }])).toBe(50);
    expect(reviewScore([])).toBeNull();
  });
});

describe("riskList", () => {
  function failure(equipmentId: string, daysAgo: number, faultCodeId: string): DashboardOrder {
    return order({
      equipmentId,
      faultCodeId,
      issuedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    });
  }
  const history = [
    failure("eq1", 2, "f1"),
    failure("eq1", 9, "f1"),
    failure("eq1", 16, "f1"),
    failure("eq1", 23, "f1"),
    failure("eq1", 45, "f2"),
    failure("eq2", 3, "f3"),
    failure("eq3", 4, "f4"),
    failure("eq3", 8, "f5"),
    failure("eq3", 12, "f6"),
  ];
  const rca: RcaRow[] = [
    {
      id: "r1",
      equipmentId: "eq1",
      equipmentName: "Конвейер К-3",
      faultCode: "М-02",
      faultName: "Подшипник",
      status: "open",
      openedAt: "2026-10-01T00:00:00Z",
      relatedOrders: 3,
    },
  ];

  it("uses the unplanned trend when analytics has no risk insights", () => {
    const risks = riskList({ orders: history, equipment, insights: [], rca }, now);
    expect(risks.map((row) => [row.equipmentId, row.level, row.score, row.source])).toEqual([
      ["eq1", "high", 87, "trend"],
      ["eq3", "medium", 39, "trend"],
    ]);
    expect(risks[0]).toMatchObject({ recent: 4, previous: 1 });
  });

  it("prefers risk insights from analytics", () => {
    const insight: RiskInsight = {
      id: "i1",
      kind: "failure_risk",
      entityId: "eq2",
      severity: 3,
      score: 90,
      summary: "Насос Н-4: риск отказа",
      recommendation: "Проверить уплотнение",
      createdAt: "2026-10-08T11:00:00Z",
    };
    const risks = riskList({ orders: history, equipment, insights: [insight], rca }, now);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      equipmentId: "eq2",
      level: "high",
      score: 90,
      source: "insight",
      summary: "Насос Н-4: риск отказа",
      recommendation: "Проверить уплотнение",
    });
  });
});

describe("buildDashboard", () => {
  it("assembles the model for the period", () => {
    const model = buildDashboard(
      {
        orders,
        equipment,
        insights: [],
        rca: [],
        lockouts: [
          {
            id: "l1",
            equipmentId: "eq1",
            equipmentName: "Конвейер К-3",
            orderNumber: 2,
            lockedAt: "2026-10-08T09:40:00Z",
            lockedBy: "Ахметов Е.",
          },
        ],
      },
      now,
      7,
    );
    expect(model.period).toEqual({
      days: 7,
      start: "2026-10-01T19:00:00.000Z",
      end: "2026-10-08T12:00:00.000Z",
    });
    expect(model.series).toHaveLength(7);
    expect(model.lockouts).toHaveLength(1);
    expect(model.topEquipment[0]?.equipmentId).toBe("eq1");
  });

  it("loads enough history for the risk trend", () => {
    expect(loadWindowStart(now, 7).toISOString()).toBe("2026-08-09T12:00:00.000Z");
    expect(loadWindowStart(now, 90).toISOString()).toBe("2026-07-10T19:00:00.000Z");
  });
});
