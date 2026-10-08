import { describe, expect, it } from "vitest";
import {
  dayKeys,
  dayStartMs,
  localDayKey,
  parsePeriod,
  periodWindow,
} from "@/lib/dashboard/period";

describe("parsePeriod", () => {
  it("accepts the switcher values and falls back to 30 days", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod(90)).toBe(90);
    expect(parsePeriod("14")).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
    expect(parsePeriod("abc")).toBe(30);
  });
});

describe("periodWindow", () => {
  it("starts at local midnight and includes today", () => {
    const now = new Date("2026-10-08T20:30:00Z");
    const window = periodWindow(now, 7);
    expect(window.start.toISOString()).toBe("2026-10-02T19:00:00.000Z");
    expect(window.end).toBe(now);
    expect(dayKeys(window)).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
  });

  it("maps instants to local days", () => {
    expect(localDayKey("2026-10-08T18:59:59Z")).toBe("2026-10-08");
    expect(localDayKey(new Date("2026-10-08T19:00:00Z"))).toBe("2026-10-09");
    expect(new Date(dayStartMs("2026-10-09")).toISOString()).toBe("2026-10-08T19:00:00.000Z");
  });
});
