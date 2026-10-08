import { describe, expect, it } from "vitest";
import { demoOrders, parseTimeScale, type DemoRefs } from "@/lib/demo/scenario";

const refs: DemoRefs = {
  masterId: "m",
  firstWorkerId: "w1",
  secondWorkerId: "w2",
  shortDeadlineEquipment: { id: "e1", siteId: "s1" },
  reworkEquipment: { id: "e2", siteId: "s1" },
  shiftPeriod: "day",
};

const now = new Date("2026-10-16T10:00:00Z");

describe("demoOrders", () => {
  it("prepares a short deadline order and an order in progress for the rework demo", () => {
    const [short, inProgress] = demoOrders(refs, now, 1);
    expect(short).toMatchObject({
      status: "issued",
      assignee_id: "w1",
      due_at: "2026-10-16T10:03:00.000Z",
    });
    expect(inProgress).toMatchObject({ status: "in_progress", kind: "planned", assignee_id: "w2" });
    expect(inProgress?.started_at).toBe("2026-10-16T09:20:00.000Z");
  });

  it("shrinks the deadline with the demo time scale", () => {
    const [short] = demoOrders(refs, now, 60);
    expect(short?.due_at).toBe("2026-10-16T10:00:03.000Z");
  });
});

describe("parseTimeScale", () => {
  it("accepts sane values only", () => {
    expect(parseTimeScale(30)).toBe(30);
    expect(parseTimeScale("10")).toBe(10);
    expect(parseTimeScale(0)).toBe(1);
    expect(parseTimeScale("x")).toBe(1);
    expect(parseTimeScale(10_000)).toBe(1);
  });
});
