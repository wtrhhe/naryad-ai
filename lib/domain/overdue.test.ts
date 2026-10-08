import { describe, expect, it } from "vitest";
import { effectiveDueAt, isOverdue } from "@/lib/domain/overdue";

const now = new Date("2026-10-16T10:00:00+05:00");

describe("effectiveDueAt", () => {
  it("prefers an explicit deadline", () => {
    expect(
      effectiveDueAt({
        status: "issued",
        dueAt: "2026-10-16T09:00:00+05:00",
        issuedAt: "2026-10-16T08:00:00+05:00",
        standardHours: 5,
      })?.toISOString(),
    ).toBe("2026-10-16T04:00:00.000Z");
  });

  it("falls back to issue time plus the standard", () => {
    expect(
      effectiveDueAt({
        status: "issued",
        dueAt: null,
        issuedAt: "2026-10-16T08:00:00+05:00",
        standardHours: 1.5,
      })?.toISOString(),
    ).toBe("2026-10-16T04:30:00.000Z");
  });
});

describe("isOverdue", () => {
  const late = {
    dueAt: "2026-10-16T09:00:00+05:00",
    issuedAt: "2026-10-16T08:00:00+05:00",
    standardHours: null,
  };

  it("flags open work past its deadline", () => {
    expect(isOverdue({ ...late, status: "in_progress" }, now)).toBe(true);
  });

  it("ignores closed, cancelled and review states", () => {
    expect(isOverdue({ ...late, status: "closed" }, now)).toBe(false);
    expect(isOverdue({ ...late, status: "cancelled" }, now)).toBe(false);
    expect(isOverdue({ ...late, status: "ai_review" }, now)).toBe(false);
  });

  it("is not overdue before the deadline", () => {
    expect(isOverdue({ ...late, dueAt: "2026-10-16T11:00:00+05:00", status: "issued" }, now)).toBe(
      false,
    );
  });
});
