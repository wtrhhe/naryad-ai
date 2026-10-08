import { describe, expect, it } from "vitest";
import {
  buildEquipmentList,
  filterEquipmentList,
  type EquipmentListOrder,
  type EquipmentListSource,
} from "@/lib/equipment/list";

const now = new Date("2026-10-08T12:00:00Z");

const equipment: EquipmentListSource[] = [
  {
    id: "k3",
    name: "Конвейер К-3",
    inventoryNumber: "ДР-005",
    siteId: "s1",
    siteName: "Дробление",
    equipmentType: "conveyor",
    criticality: 3,
  },
  {
    id: "n4",
    name: "Насос Н-4",
    inventoryNumber: "ОБ-011",
    siteId: "s2",
    siteName: "Обогащение",
    equipmentType: "pump",
    criticality: 3,
  },
  {
    id: "fan",
    name: "Вентилятор ВЦ-14",
    inventoryNumber: "ОБ-012",
    siteId: "s2",
    siteName: "Обогащение",
    equipmentType: "fan",
    criticality: 1,
  },
];

function failure(equipmentId: string, daysAgo: number, faultCodeId = "f1"): EquipmentListOrder {
  return {
    equipmentId,
    kind: "unplanned",
    status: "closed",
    issuedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    faultCodeId,
    downtimeStartedAt: null,
    downtimeEndedAt: null,
  };
}

const items = buildEquipmentList(
  {
    equipment,
    orders: [
      failure("k3", 1),
      failure("k3", 5),
      failure("k3", 9),
      failure("k3", 14, "f2"),
      { ...failure("n4", 0, "f3"), status: "in_progress", downtimeStartedAt: now.toISOString() },
    ],
    lockedEquipmentIds: ["n4"],
    openRcaEquipmentIds: ["n4"],
    insights: [],
  },
  now,
);

describe("buildEquipmentList", () => {
  it("puts the riskiest units first with LOTO and downtime flags", () => {
    expect(items.map((item) => [item.id, item.risk.level])).toEqual([
      ["k3", "high"],
      ["n4", "medium"],
      ["fan", "low"],
    ]);
    expect(items[0]?.unplannedRecent).toBe(4);
    expect(items[1]).toMatchObject({ lockedOut: true, down: true });
    expect(items[2]).toMatchObject({ lockedOut: false, down: false });
  });

  it("raises a unit flagged by analytics", () => {
    const flagged = buildEquipmentList(
      {
        equipment,
        orders: [],
        lockedEquipmentIds: [],
        openRcaEquipmentIds: [],
        insights: [
          {
            id: "i1",
            kind: "failure_risk",
            entityId: "fan",
            severity: 3,
            score: null,
            summary: "",
            recommendation: null,
            createdAt: "2026-10-08T10:00:00Z",
          },
        ],
      },
      now,
    );
    expect(flagged[0]).toMatchObject({ id: "fan", risk: { level: "high" } });
  });
});

describe("filterEquipmentList", () => {
  it("searches by name and inventory number and filters by site", () => {
    expect(filterEquipmentList(items, { query: "  к-3 " }).map((item) => item.id)).toEqual(["k3"]);
    expect(filterEquipmentList(items, { query: "об-01" }).map((item) => item.id)).toEqual([
      "n4",
      "fan",
    ]);
    expect(filterEquipmentList(items, { siteId: "s1" }).map((item) => item.id)).toEqual(["k3"]);
    expect(filterEquipmentList(items, { query: "насос", siteId: "s1" })).toEqual([]);
    expect(filterEquipmentList(items, {})).toHaveLength(3);
  });
});
