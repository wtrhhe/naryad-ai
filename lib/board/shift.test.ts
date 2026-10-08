import { describe, expect, it } from "vitest";
import { currentShiftWindow } from "@/lib/board/shift";

describe("currentShiftWindow", () => {
  it("returns the day shift 08:00–20:00 Qostanay time", () => {
    const shift = currentShiftWindow(new Date("2026-10-16T10:30:00+05:00"));
    expect(shift.period).toBe("day");
    expect(shift.start.toISOString()).toBe("2026-10-16T03:00:00.000Z");
    expect(shift.end.toISOString()).toBe("2026-10-16T15:00:00.000Z");
  });

  it("returns the night shift that started yesterday evening after midnight", () => {
    const shift = currentShiftWindow(new Date("2026-10-16T02:00:00+05:00"));
    expect(shift.period).toBe("night");
    expect(shift.start.toISOString()).toBe("2026-10-15T15:00:00.000Z");
    expect(shift.end.toISOString()).toBe("2026-10-16T03:00:00.000Z");
  });

  it("returns the night shift that starts this evening before midnight", () => {
    const shift = currentShiftWindow(new Date("2026-10-16T21:00:00+05:00"));
    expect(shift.start.toISOString()).toBe("2026-10-16T15:00:00.000Z");
  });
});
