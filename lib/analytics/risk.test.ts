import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/analytics/dataset";
import {
  acousticSample,
  backgroundFailures,
  createRandom,
  dataset,
  daysAgo,
  order,
} from "@/lib/analytics/fixtures";
import {
  acousticTrend,
  assessFailureRisk,
  findFailureRisks,
  riskLevel,
} from "@/lib/analytics/risk";

function degradingSamples(equipmentId: string, seed: number, growth: number) {
  const random = createRandom(seed);
  return Array.from({ length: 30 }, (_, index) => {
    const progress = index / 29;
    return acousticSample(
      equipmentId,
      88 - index * 3,
      43 + growth * 18 * progress + (random() - 0.5) * 2,
      4 + growth * 6 * progress + (random() - 0.5) * 0.6,
    );
  });
}

describe("acousticTrend", () => {
  it("measures a rising peak and kurtosis", () => {
    const trend = acousticTrend(degradingSamples("c3", 1, 1), daysAgo(90), 4);
    expect(trend?.peakSlope30).toBeGreaterThan(5);
    expect(trend?.kurtosisTo).toBeGreaterThan(9);
    expect(trend?.score).toBeGreaterThan(0.9);
  });

  it("returns a flat score for a healthy unit and nothing for sparse data", () => {
    expect(acousticTrend(degradingSamples("c1", 2, 0), daysAgo(90), 4)?.score).toBeLessThan(0.1);
    expect(acousticTrend(degradingSamples("c1", 3, 0).slice(0, 3), daysAgo(90), 4)).toBeNull();
  });
});

describe("findFailureRisks", () => {
  it("rates a frequently failing unit with worsening acoustics as high risk", () => {
    const random = createRandom(4);
    const k3 = Array.from({ length: 40 }, () =>
      order({ equipmentId: "c3", faultCodeId: "f-bearing", issuedAt: daysAgo(1 + random() * 88) }),
    );
    const data = dataset({
      orders: [...backgroundFailures(5), ...k3],
      acoustic: [
        ...degradingSamples("c3", 6, 1),
        ...degradingSamples("c1", 7, 0),
        ...degradingSamples("p1", 8, 0),
      ],
    });
    const insights = findFailureRisks(createContext(data, 90));
    expect(insights.map((insight) => insight.entityId)).toEqual(["c3"]);
    const [k3Risk] = insights;
    expect(k3Risk?.severity).toBe(3);
    expect(k3Risk?.params.level).toBe("high");
    expect(k3Risk?.params.factors).toEqual(["acoustic", "frequency"]);
    expect(k3Risk?.params.topFaultCode).toBe("М-02");
    expect(k3Risk?.params.acoustic?.peakSlope).toBeGreaterThan(5);
  });

  it("captures a growing failure trend without acoustic data", () => {
    const growing = Array.from({ length: 13 }, (_, week) =>
      Array.from({ length: week }, (__, index) =>
        order({ equipmentId: "p2", issuedAt: daysAgo(90 - week * 7 - index * 0.5 - 0.5) }),
      ),
    ).flat();
    const [risk] = assessFailureRisk(createContext(dataset({ orders: growing }), 90)).filter(
      (item) => item.equipment.id === "p2",
    );
    expect(risk?.components.trend).toBeGreaterThan(0.5);
    expect(risk?.trendPer30).toBeGreaterThan(0);
    expect(risk?.acoustic).toBeNull();
  });

  it("maps scores to levels", () => {
    expect(riskLevel(80)).toBe("high");
    expect(riskLevel(60)).toBe("elevated");
    expect(riskLevel(45)).toBe("moderate");
  });
});
