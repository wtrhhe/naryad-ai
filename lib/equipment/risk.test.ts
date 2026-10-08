import { describe, expect, it } from "vitest";
import {
  assessRisk,
  latestRiskInsights,
  levelForScore,
  levelForSeverity,
  maxRepeat,
  normalizeInsightScore,
  repeatCounts,
  unplannedTrend,
  type RiskInsight,
} from "@/lib/equipment/risk";

const now = new Date("2026-10-08T12:00:00Z");

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

describe("unplannedTrend", () => {
  it("counts unplanned failures in the last and the previous 30 days", () => {
    expect(
      unplannedTrend(
        [
          { kind: "unplanned", issuedAt: daysAgo(1) },
          { kind: "unplanned", issuedAt: daysAgo(29) },
          { kind: "unplanned", issuedAt: daysAgo(31) },
          { kind: "unplanned", issuedAt: daysAgo(61) },
          { kind: "planned", issuedAt: daysAgo(2) },
          { kind: "unplanned", issuedAt: daysAgo(3), status: "cancelled" },
          { kind: "unplanned", issuedAt: daysAgo(-1) },
        ],
        now,
      ),
    ).toEqual({ recent: 2, previous: 1 });
  });
});

describe("repeatCounts", () => {
  const orders = [
    { kind: "unplanned" as const, issuedAt: daysAgo(5), faultCodeId: "a" },
    { kind: "unplanned" as const, issuedAt: daysAgo(15), faultCodeId: "a" },
    { kind: "unplanned" as const, issuedAt: daysAgo(25), faultCodeId: "a" },
    { kind: "unplanned" as const, issuedAt: daysAgo(70), faultCodeId: "a" },
    { kind: "unplanned" as const, issuedAt: daysAgo(10), faultCodeId: "b" },
    { kind: "unplanned" as const, issuedAt: daysAgo(10), faultCodeId: null },
    { kind: "planned" as const, issuedAt: daysAgo(10), faultCodeId: "b" },
  ];

  it("counts the same fault per window", () => {
    expect(Object.fromEntries(repeatCounts(orders, now, 60))).toEqual({ a: 3, b: 1 });
    expect(maxRepeat(orders, now, 60)).toBe(3);
    expect(maxRepeat([], now, 60)).toBe(0);
  });
});

describe("assessRisk", () => {
  it("is low for a quiet unit", () => {
    expect(
      assessRisk({
        unplannedRecent: 0,
        unplannedPrevious: 0,
        repeatMax: 0,
        openRca: 0,
        criticality: 1,
      }),
    ).toEqual({ level: "low", score: 0, reasons: [] });
  });

  it("is high for frequent, growing, repeating failures of a critical unit", () => {
    const risk = assessRisk({
      unplannedRecent: 6,
      unplannedPrevious: 2,
      repeatMax: 3,
      openRca: 1,
      criticality: 3,
    });
    expect(risk.level).toBe("high");
    expect(risk.score).toBe(100);
    expect(risk.reasons.map((reason) => reason.code)).toEqual([
      "frequent",
      "growing",
      "repeat",
      "rca",
      "critical",
    ]);
  });

  it("softens a falling trend", () => {
    const falling = assessRisk({
      unplannedRecent: 4,
      unplannedPrevious: 9,
      repeatMax: 2,
      openRca: 0,
      criticality: 2,
    });
    expect(falling.score).toBe(32 - 10 + 10 + 5);
    expect(falling.level).toBe("medium");
  });

  it("raises the score to the analytics severity", () => {
    const risk = assessRisk({
      unplannedRecent: 0,
      unplannedPrevious: 0,
      repeatMax: 0,
      openRca: 0,
      criticality: 1,
      insightSeverity: 3,
    });
    expect(risk).toMatchObject({ level: "high", score: 75 });
    expect(risk.reasons[0]).toEqual({ code: "insight", value: 3 });
    expect(
      assessRisk({
        unplannedRecent: 0,
        unplannedPrevious: 0,
        repeatMax: 0,
        openRca: 0,
        criticality: 1,
        insightScore: 88,
      }).score,
    ).toBe(88);
  });
});

describe("levels and insight helpers", () => {
  it("maps scores and severities", () => {
    expect(levelForScore(59)).toBe("medium");
    expect(levelForScore(60)).toBe("high");
    expect(levelForScore(29)).toBe("low");
    expect(levelForSeverity(1)).toBe("low");
    expect(levelForSeverity(2)).toBe("medium");
    expect(levelForSeverity(3)).toBe("high");
  });

  it("normalizes analytics scores", () => {
    expect(normalizeInsightScore(0.82)).toBe(82);
    expect(normalizeInsightScore("64")).toBe(64);
    expect(normalizeInsightScore(140)).toBe(100);
    expect(normalizeInsightScore(-1)).toBeNull();
    expect(normalizeInsightScore("high")).toBeNull();
  });

  it("keeps the latest risk insight per unit", () => {
    const base: RiskInsight = {
      id: "1",
      kind: "failure_risk",
      entityId: "eq-1",
      severity: 2,
      score: null,
      summary: "",
      recommendation: null,
      createdAt: "2026-10-08T10:00:00Z",
    };
    const latest = latestRiskInsights([
      base,
      { ...base, id: "2", createdAt: "2026-10-08T11:00:00Z" },
      { ...base, id: "3", kind: "material_anomaly", createdAt: "2026-10-08T12:00:00Z" },
      { ...base, id: "4", createdAt: "2026-10-08T09:00:00Z" },
    ]);
    expect(latest.get("eq-1")?.id).toBe("2");
  });
});
