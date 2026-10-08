import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/analytics/dataset";
import { findProblemEquipment, findProblemSite } from "@/lib/analytics/equipment";
import {
  backgroundFailures,
  createRandom,
  dataset,
  daysAgo,
  order,
} from "@/lib/analytics/fixtures";

function k3Failures(count: number, seed: number) {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) =>
    order({
      equipmentId: "c3",
      issuedAt: daysAgo(1 + random() * 88),
      faultCodeId: index % 10 < 7 ? "f-bearing" : "f-belt",
      downtimeHours: 6,
      downtimeCost: 3_900_000,
    }),
  );
}

describe("findProblemEquipment", () => {
  it("flags a unit that breaks three times more than its peers", () => {
    const data = dataset({ orders: [...backgroundFailures(1), ...k3Failures(40, 2)] });
    const insights = findProblemEquipment(createContext(data, 90));
    expect(insights.map((insight) => insight.entityId)).toEqual(["c3"]);
    const [k3] = insights;
    expect(k3?.severity).toBe(3);
    expect(k3?.params.topFaultCode).toBe("М-02");
    expect(k3?.params.peerRatio).toBeGreaterThan(2.5);
    expect((k3?.params.topFaultCount ?? 0) / (k3?.params.unplanned ?? 1)).toBeGreaterThan(0.5);
    expect(k3?.chips.map((item) => item.key)).toContain("downtimeCost");
  });

  it("keeps the history evidence for a shorter window", () => {
    const data = dataset({ orders: [...backgroundFailures(3), ...k3Failures(40, 4)] });
    const insights = findProblemEquipment(createContext(data, 30));
    expect(insights[0]?.entityId).toBe("c3");
    expect(insights[0]?.params.days).toBe(30);
  });

  it("stays quiet on a uniform fleet", () => {
    const data = dataset({ orders: backgroundFailures(5) });
    expect(findProblemEquipment(createContext(data, 90))).toEqual([]);
  });
});

describe("findProblemSite", () => {
  it("names the site with the largest downtime losses and its main contributors", () => {
    const data = dataset({ orders: [...backgroundFailures(6), ...k3Failures(40, 7)] });
    const [site] = findProblemSite(createContext(data, 90));
    expect(site?.entityId).toBe("site-crush");
    expect(site?.params.topEquipment[0]).toBe("Конвейер К-3");
    expect(site?.params.costShare).toBeGreaterThan(30);
    expect(site?.severity).toBe(2);
  });

  it("returns nothing without downtime cost", () => {
    const orders = backgroundFailures(8).map((item) => ({ ...item, downtimeCost: 0 }));
    expect(findProblemSite(createContext(dataset({ orders }), 90))).toEqual([]);
  });

  it("returns nothing when losses are evenly spread", () => {
    const orders = backgroundFailures(9).map((item) =>
      item.siteId === "site-crush" ? { ...item, downtimeCost: 1_000 } : item,
    );
    const insights = findProblemSite(createContext(dataset({ orders }), 90));
    expect(insights.every((insight) => insight.entityId === "site-enrich")).toBe(true);
    expect(insights.every((insight) => insight.severity === 1)).toBe(true);
  });
});
