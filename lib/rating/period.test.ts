import { describe, expect, it } from "vitest";
import {
  localDate,
  parseLocalDate,
  ratingPeriodQuery,
  resolveRatingPeriod,
} from "@/lib/rating/period";

const NOW = new Date("2026-10-08T10:30:00Z");

describe("resolveRatingPeriod", () => {
  it("uses the current shift window", () => {
    const period = resolveRatingPeriod({ period: "shift" }, NOW);
    expect(period.start.toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });

  it("aligns the day to local midnight", () => {
    const period = resolveRatingPeriod({ period: "day" }, new Date("2026-10-08T20:30:00Z"));
    expect(period.start.toISOString()).toBe("2026-10-08T19:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-09T19:00:00.000Z");
    expect(period.from).toBe("2026-10-09");
    expect(period.to).toBe("2026-10-09");
  });

  it("covers the last seven and thirty local days including today", () => {
    const week = resolveRatingPeriod({ period: "week" }, NOW);
    expect(week.from).toBe("2026-10-02");
    expect(week.to).toBe("2026-10-08");
    const month = resolveRatingPeriod({ period: "month" }, NOW);
    expect(month.from).toBe("2026-09-09");
    expect(month.end.toISOString()).toBe("2026-10-08T19:00:00.000Z");
  });

  it("defaults to the week for unknown presets", () => {
    expect(resolveRatingPeriod({ period: "year" }, NOW).preset).toBe("week");
    expect(resolveRatingPeriod({}, NOW).preset).toBe("week");
  });

  it("accepts an inclusive custom range", () => {
    const period = resolveRatingPeriod(
      { period: "custom", from: "2026-09-01", to: "2026-09-30" },
      NOW,
    );
    expect(period.preset).toBe("custom");
    expect(period.start.toISOString()).toBe("2026-08-31T19:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(ratingPeriodQuery(period)).toEqual({
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("falls back when the custom range is invalid", () => {
    const reversed = { period: "custom", from: "2026-09-30", to: "2026-09-01" };
    const tooLong = { period: "custom", from: "2024-01-01", to: "2026-01-01" };
    const broken = { period: "custom", from: "2026-02-31", to: "2026-03-01" };
    expect(resolveRatingPeriod(reversed, NOW).preset).toBe("week");
    expect(resolveRatingPeriod(tooLong, NOW).preset).toBe("week");
    expect(resolveRatingPeriod(broken, NOW).preset).toBe("week");
    expect(ratingPeriodQuery(resolveRatingPeriod(broken, NOW))).toEqual({ period: "week" });
  });
});

describe("local dates", () => {
  it("round-trips through the plant time zone", () => {
    const start = parseLocalDate("2026-10-08");
    expect(start).not.toBeNull();
    expect(localDate(new Date(start ?? 0))).toBe("2026-10-08");
    expect(parseLocalDate("08.10.2026")).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
  });
});
