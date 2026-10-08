import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/analytics/dataset";
import { backgroundFailures, dataset, daysAgo, order } from "@/lib/analytics/fixtures";
import { findShiftFailureEffects, timeOfDayBucket } from "@/lib/analytics/shifts";
import { MS_PER_HOUR } from "@/lib/analytics/stats";

describe("timeOfDayBucket", () => {
  it("uses plant local time", () => {
    expect(timeOfDayBucket(Date.parse("2026-10-07T20:00:00Z"))).toBe("00-06");
    expect(timeOfDayBucket(Date.parse("2026-10-07T03:00:00Z"))).toBe("06-12");
    expect(timeOfDayBucket(Date.parse("2026-10-07T09:00:00Z"))).toBe("12-18");
    expect(timeOfDayBucket(Date.parse("2026-10-07T15:00:00Z"))).toBe("18-24");
  });
});

describe("findShiftFailureEffects", () => {
  it("reports a night shift with far more failures than expected", () => {
    const nights = Array.from({ length: 60 }, (_, index) =>
      order({
        equipmentId: "c1",
        shiftPeriod: "night",
        issuedAt: daysAgo(80 - index) + 18 * MS_PER_HOUR,
      }),
    );
    const days = Array.from({ length: 20 }, (_, index) =>
      order({ equipmentId: "c2", shiftPeriod: "day", issuedAt: daysAgo(80 - index * 3) }),
    );
    const insights = findShiftFailureEffects(
      createContext(dataset({ orders: [...nights, ...days] }), 90),
    );
    const period = insights.find((insight) => insight.params.dimension === "period");
    expect(period?.params.group).toBe("night");
    expect(period?.params.share).toBe(75);
    expect(period?.params.expectedShare).toBe(50);
  });

  it("is silent on balanced shifts and small samples", () => {
    expect(
      findShiftFailureEffects(createContext(dataset({ orders: backgroundFailures(21) }), 90)),
    ).toEqual([]);
    const few = Array.from({ length: 10 }, (_, index) =>
      order({ shiftPeriod: "night", issuedAt: daysAgo(index + 1) }),
    );
    expect(findShiftFailureEffects(createContext(dataset({ orders: few }), 90))).toEqual([]);
  });
});
