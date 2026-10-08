import { describe, expect, it } from "vitest";
import { downtimeCost, downtimeHours, formatElapsed, formatTenge } from "@/lib/safety/downtime";

const now = new Date("2026-10-16T12:30:00+05:00");

describe("downtime", () => {
  it("counts open downtime up to now", () => {
    expect(downtimeHours("2026-10-16T10:00:00+05:00", null, now)).toBe(2.5);
    expect(downtimeCost("2026-10-16T10:00:00+05:00", null, 360_000, now)).toBe(900_000);
  });

  it("stops at the recorded end", () => {
    expect(
      downtimeCost("2026-10-16T10:00:00+05:00", "2026-10-16T11:00:00+05:00", 360_000, now),
    ).toBe(360_000);
  });

  it("never goes negative", () => {
    expect(downtimeHours("2026-10-16T13:00:00+05:00", null, now)).toBe(0);
  });

  it("formats money and elapsed time for the counter", () => {
    expect(formatTenge(1_234_567).replace(/\s/g, " ")).toBe("1 234 567 ₸");
    expect(formatElapsed(2.5)).toBe("02:30:00");
  });
});
