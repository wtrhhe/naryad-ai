import { describe, expect, it } from "vitest";
import {
  compactNumber,
  durationKey,
  formatHours,
  sharePercent,
  splitMinutes,
} from "@/lib/dashboard/format";

describe("splitMinutes", () => {
  it("splits minutes into hours and minutes", () => {
    expect(splitMinutes(14.6)).toEqual({ hours: 0, minutes: 15 });
    expect(splitMinutes(125)).toEqual({ hours: 2, minutes: 5 });
    expect(splitMinutes(-3)).toEqual({ hours: 0, minutes: 0 });
  });

  it("picks the message for the duration", () => {
    expect(durationKey({ hours: 0, minutes: 12 })).toBe("minutes");
    expect(durationKey({ hours: 3, minutes: 0 })).toBe("hours");
    expect(durationKey({ hours: 3, minutes: 1 })).toBe("hoursMinutes");
  });
});

describe("number helpers", () => {
  it("computes shares and formats numbers", () => {
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(1, 0)).toBe(0);
    expect(compactNumber(55_400_000, "ru")).toMatch(/^55,4\sмлн$/);
    expect(compactNumber(900, "kk")).toBe("900");
    expect(formatHours(12.345, "ru")).toBe("12,3");
  });
});
