import { describe, expect, it } from "vitest";
import {
  filtersToSearchParams,
  firstValues,
  lastIncludedDay,
  MAX_CUSTOM_DAYS,
  parseReportFilters,
  periodHours,
  resolvePeriod,
} from "@/lib/reports/filters";

const NOW = new Date("2026-10-08T10:00:00Z");
const SITE = "7a20a8a4-1b41-57ac-b103-f99af64c50c9";
const WORKER = "3e4a06de-f2cc-5b67-8716-87a6e2860cb8";

describe("resolvePeriod", () => {
  it("uses the current shift window by default", () => {
    const period = resolvePeriod("shift", NOW);
    expect(period.start.toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-08T15:00:00.000Z");
    expect(periodHours(period)).toBe(12);
  });

  it("uses local calendar days for day, week and month", () => {
    const day = resolvePeriod("day", NOW);
    expect(day.start.toISOString()).toBe("2026-10-07T19:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-08T19:00:00.000Z");
    const week = resolvePeriod("week", NOW);
    expect(week.start.toISOString()).toBe("2026-10-01T19:00:00.000Z");
    expect(periodHours(week)).toBe(7 * 24);
    const month = resolvePeriod("month", NOW);
    expect(periodHours(month)).toBe(30 * 24);
    expect(month.end.toISOString()).toBe(day.end.toISOString());
  });

  it("treats the local midnight boundary correctly", () => {
    const lateEvening = new Date("2026-10-08T19:30:00Z");
    expect(resolvePeriod("day", lateEvening).start.toISOString()).toBe("2026-10-08T19:00:00.000Z");
  });

  it("includes both custom dates and swaps reversed ranges", () => {
    const period = resolvePeriod("custom", NOW, "2026-10-05", "2026-10-01");
    expect(period.start.toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-05T19:00:00.000Z");
    expect(lastIncludedDay(period).toISOString()).toBe("2026-10-05T18:59:59.999Z");
  });

  it("defaults missing custom dates to today and caps long ranges", () => {
    const today = resolvePeriod("custom", NOW);
    expect(periodHours(today)).toBe(24);
    const onlyFrom = resolvePeriod("custom", NOW, "2026-10-03");
    expect(periodHours(onlyFrom)).toBe(24);
    const long = resolvePeriod("custom", NOW, "2020-01-01", "2026-10-08");
    expect(periodHours(long)).toBe(MAX_CUSTOM_DAYS * 24);
  });
});

describe("parseReportFilters", () => {
  it("parses presets and identifiers from search params", () => {
    const filters = parseReportFilters(
      new URLSearchParams({ period: "week", site: SITE, assignee: WORKER, brigade: "nope" }),
      NOW,
    );
    expect(filters.period.preset).toBe("week");
    expect(filters.siteId).toBe(SITE);
    expect(filters.assigneeId).toBe(WORKER);
    expect(filters.brigadeId).toBeUndefined();
  });

  it("falls back to the shift preset for unknown or missing values", () => {
    expect(parseReportFilters({ period: "year" }, NOW).period.preset).toBe("shift");
    expect(parseReportFilters(undefined, NOW).period.preset).toBe("shift");
  });

  it("ignores malformed custom dates", () => {
    const filters = parseReportFilters(
      { period: "custom", from: "2026-13-45", to: ["2026-10-02", "2026-10-09"] },
      NOW,
    );
    expect(filters.period.start.toISOString()).toBe("2026-10-01T19:00:00.000Z");
    expect(periodHours(filters.period)).toBe(24);
  });
});

describe("filtersToSearchParams", () => {
  it("round trips custom periods and identifiers", () => {
    const filters = parseReportFilters(
      { period: "custom", from: "2026-09-01", to: "2026-09-30", site: SITE },
      NOW,
    );
    const params = filtersToSearchParams(filters);
    expect(params.toString()).toBe(`period=custom&from=2026-09-01&to=2026-09-30&site=${SITE}`);
    const again = parseReportFilters(params, NOW);
    expect(again.period).toEqual(filters.period);
  });

  it("omits dates for presets", () => {
    expect(filtersToSearchParams(parseReportFilters({ period: "day" }, NOW)).toString()).toBe(
      "period=day",
    );
  });
});

describe("firstValues", () => {
  it("keeps the first value of repeated keys", () => {
    expect(firstValues(new URLSearchParams("a=1&a=2&b=3"))).toEqual({ a: "1", b: "3" });
    expect(firstValues({ a: ["x", "y"], b: undefined })).toEqual({ a: "x" });
  });
});
