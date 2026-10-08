import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/analytics/dataset";
import { backgroundFailures, dataset, daysAgo, order } from "@/lib/analytics/fixtures";
import { findPostMaintenanceFailures, majorMaintenance } from "@/lib/analytics/maintenance";
import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/analytics/stats";

function planned(equipmentId: string, days: number, hours: number) {
  const issuedAt = daysAgo(days);
  return order({
    equipmentId,
    kind: "planned",
    issuedAt,
    standardHours: hours,
    faultCodeId: "f-oil",
    doneAt: issuedAt + hours * MS_PER_HOUR,
    closedAt: issuedAt + (hours + 1) * MS_PER_HOUR,
    downtimeHours: 0,
    downtimeCost: 0,
  });
}

const noCrusher = (seed: number) =>
  backgroundFailures(seed, 10).filter((item) => item.equipmentId !== "k1");

function crusherScenario() {
  const repairs = [82, 64, 46, 29, 11].map((days) => planned("k1", days, 20));
  const routine = [85, 71, 57, 43, 30, 15, 2].map((days) => planned("k1", days, 1.5));
  const failures = repairs.map((repair, index) =>
    order({
      equipmentId: "k1",
      faultCodeId: index % 2 === 0 ? "f-bearing" : "f-oil",
      issuedAt: (repair.closedAt as number) + (1.5 + index * 0.5) * MS_PER_DAY,
    }),
  );
  const conveyorRepairs = [70, 40, 10].map((days) => planned("c1", days, 6));
  return [
    ...repairs,
    ...routine,
    ...failures,
    ...conveyorRepairs,
    order({ equipmentId: "k1", issuedAt: daysAgo(55) }),
  ];
}

describe("majorMaintenance", () => {
  it("keeps only planned repairs well above routine work", () => {
    const orders = [planned("k1", 10, 20), planned("k1", 12, 1.5), planned("k1", 14, 2)];
    expect(majorMaintenance(orders).map((item) => item.standardHours)).toEqual([20]);
  });
});

describe("findPostMaintenanceFailures", () => {
  it("flags a crusher that fails within days after every planned repair", () => {
    const data = dataset({ orders: [...noCrusher(11), ...crusherScenario()] });
    const insights = findPostMaintenanceFailures(createContext(data, 90));
    expect(insights.map((insight) => insight.entityId)).toEqual(["k1"]);
    const [crusher] = insights;
    expect(crusher?.params.followed).toBe(5);
    expect(crusher?.params.maintenances).toBe(5);
    expect(crusher?.params.medianGapDays).toBeLessThan(5);
    expect(crusher?.severity).toBe(3);
    expect(crusher?.relatedOrderIds).toHaveLength(10);
  });

  it("still reports the pattern for the last thirty days", () => {
    const data = dataset({ orders: [...noCrusher(12), ...crusherScenario()] });
    const [crusher] = findPostMaintenanceFailures(createContext(data, 30));
    expect(crusher?.entityId).toBe("k1");
    expect(crusher?.params.maintenances).toBe(2);
  });

  it("ignores repairs on equipment that fails often anyway", () => {
    const busy = Array.from({ length: 40 }, (_, index) =>
      order({ equipmentId: "c1", issuedAt: daysAgo(88 - index * 2.2) }),
    );
    const repairs = [70, 40, 10].map((days) => planned("c1", days, 6));
    expect(
      findPostMaintenanceFailures(createContext(dataset({ orders: [...busy, ...repairs] }), 90)),
    ).toEqual([]);
  });

  it("does not count repairs that are still inside the observation window", () => {
    const orders = [planned("k1", 3, 20), planned("k1", 2, 20)];
    expect(findPostMaintenanceFailures(createContext(dataset({ orders }), 90))).toEqual([]);
  });
});
