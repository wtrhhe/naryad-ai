import { describe, expect, it } from "vitest";
import { crewOnShift, plantHour, plantMidnightMs, shiftPeriodAt, shiftStartAt } from "./time";

const MS_PER_HOUR = 3_600_000;
const at = (iso: string) => new Date(iso);

describe("plantHour", () => {
  it("converts UTC to Asia/Qostanay (UTC+5)", () => {
    expect(plantHour(at("2026-10-08T03:00:00Z"))).toBe(8);
    expect(plantHour(at("2026-10-08T21:30:00Z"))).toBe(2);
  });
});

describe("plantMidnightMs", () => {
  it("returns the start of the plant calendar day in UTC milliseconds", () => {
    expect(new Date(plantMidnightMs(at("2026-10-08T10:00:00Z").getTime())).toISOString()).toBe(
      "2026-10-07T19:00:00.000Z",
    );
    expect(new Date(plantMidnightMs(at("2026-10-08T20:00:00Z").getTime())).toISOString()).toBe(
      "2026-10-08T19:00:00.000Z",
    );
  });
});

describe("shiftPeriodAt", () => {
  it("treats 08:00 inclusive to 20:00 exclusive local time as day", () => {
    expect(shiftPeriodAt(at("2026-10-08T02:59:59Z"))).toBe("night");
    expect(shiftPeriodAt(at("2026-10-08T03:00:00Z"))).toBe("day");
    expect(shiftPeriodAt(at("2026-10-08T14:59:59Z"))).toBe("day");
    expect(shiftPeriodAt(at("2026-10-08T15:00:00Z"))).toBe("night");
  });
});

describe("shiftStartAt", () => {
  it("returns the 08:00 or 20:00 local boundary of the running shift", () => {
    expect(shiftStartAt(at("2026-10-08T10:00:00Z")).toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(shiftStartAt(at("2026-10-08T16:00:00Z")).toISOString()).toBe("2026-10-08T15:00:00.000Z");
    expect(shiftStartAt(at("2026-10-08T01:00:00Z")).toISOString()).toBe("2026-10-07T15:00:00.000Z");
  });
});

describe("crewOnShift", () => {
  it("never puts the same crew on day and night at once", () => {
    const start = at("2026-08-01T03:00:00Z").getTime();
    for (let step = 0; step < 16 * 2; step += 1) {
      const moment = new Date(start + step * 12 * MS_PER_HOUR + MS_PER_HOUR);
      const oppositeMoment = new Date(moment.getTime() + 12 * MS_PER_HOUR);
      expect(crewOnShift(oppositeMoment)).not.toBe(crewOnShift(moment));
    }
  });

  it("gives every crew the same number of shifts over a full 8 day cycle", () => {
    const start = at("2026-08-01T03:00:00Z").getTime();
    const counts = new Map<string, number>();
    for (let step = 0; step < 16; step += 1) {
      const crew = crewOnShift(new Date(start + step * 12 * MS_PER_HOUR + MS_PER_HOUR));
      counts.set(crew, (counts.get(crew) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["A", "B", "C", "D"]);
    expect([...counts.values()]).toEqual([4, 4, 4, 4]);
  });

  it("is stable within one shift", () => {
    expect(crewOnShift(at("2026-10-08T03:05:00Z"))).toBe(crewOnShift(at("2026-10-08T14:55:00Z")));
    expect(crewOnShift(at("2026-10-08T15:05:00Z"))).toBe(crewOnShift(at("2026-10-09T02:55:00Z")));
  });
});
