import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/analytics/dataset";
import { createRandom, dataset, daysAgo, order, writeoff } from "@/lib/analytics/fixtures";
import { collectUsage, findMaterialOveruse } from "@/lib/analytics/materials";
import type { OrderFact, WriteoffFact } from "@/lib/analytics/types";

const SITE_WORKERS: Record<string, string[]> = {
  "site-crush": ["w01", "w02", "w03"],
  "site-enrich": ["w04", "w05", "w06"],
};

function scenario(seed: number, nightEnrichFactor: number) {
  const random = createRandom(seed);
  const orders: OrderFact[] = [];
  const writeoffs: WriteoffFact[] = [];
  for (let index = 0; index < 240; index += 1) {
    const siteId = index % 2 === 0 ? "site-crush" : "site-enrich";
    const night = random() < 0.4;
    const workers = SITE_WORKERS[siteId] as string[];
    const item = order({
      equipmentId: siteId === "site-crush" ? "c1" : "p1",
      siteId,
      shiftPeriod: night ? "night" : "day",
      assigneeId: workers[index % workers.length] as string,
      brigadeId: siteId === "site-crush" ? "brigade-crush" : "brigade-enrich",
      shiftCrew: ["A", "B", "C", "D"][index % 4] as string,
      faultCodeId: index % 3 === 0 ? "f-gland" : "f-bearing",
      issuedAt: daysAgo(1 + random() * 85),
    });
    const factor =
      (siteId === "site-enrich" && night ? nightEnrichFactor : 1) * (0.92 + random() * 0.16);
    orders.push(item);
    writeoffs.push(writeoff(item.id, "m-grease", Math.round(10 * factor) / 10));
    writeoffs.push(writeoff(item.id, "m-packing", Math.round(20 * factor) / 10));
  }
  return dataset({ orders, writeoffs });
}

describe("collectUsage", () => {
  it("compares quantities with norms and falls back to history medians", () => {
    const item = order({ faultCodeId: "f-bearing" });
    const other = order({ faultCodeId: "f-bearing" });
    const data = dataset({
      orders: [item, other],
      writeoffs: [
        writeoff(item.id, "m-grease", 2),
        writeoff(item.id, "m-bearing", 2),
        writeoff(other.id, "m-bearing", 1),
      ],
    });
    const usage = collectUsage(createContext(data, 90));
    const first = usage.find((entry) => entry.order.id === item.id);
    expect(first?.lines).toHaveLength(2);
    expect(first?.lines[0]?.logRatio).toBeCloseTo(Math.log(2), 6);
    expect(first?.lines[0]?.excessCost).toBe(2_000);
  });
});

describe("findMaterialOveruse", () => {
  it("pins the overuse on the enrichment night shift only", () => {
    const insights = findMaterialOveruse(createContext(scenario(31, 1.4), 90));
    expect(insights).toHaveLength(1);
    const [night] = insights;
    expect(night?.params.dimension).toBe("site_period");
    expect(night?.params.site).toBe("Обогащение");
    expect(night?.params.period).toBe("night");
    expect(night?.params.overusePercent).toBeGreaterThan(30);
    expect(night?.params.overusePercent).toBeLessThan(50);
    expect(night?.params.topMaterial).toBe("Набивка сальниковая");
    expect(night?.entityId).toBe("site-enrich");
    expect(night?.severity).toBe(3);
  });

  it("finds nothing when every shift follows the norm", () => {
    expect(findMaterialOveruse(createContext(scenario(32, 1), 90))).toEqual([]);
  });
});
