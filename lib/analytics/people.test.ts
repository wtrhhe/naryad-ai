import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/analytics/dataset";
import { EMPLOYEES, dataset, daysAgo, order } from "@/lib/analytics/fixtures";
import { collectRepairs, findRepeatRateEffects } from "@/lib/analytics/people";
import { MS_PER_DAY } from "@/lib/analytics/stats";
import type { OrderFact } from "@/lib/analytics/types";

const WORKERS = ["w01", "w02", "w03", "w04", "w05", "w06"];

function repairsOf(
  workerId: string,
  count: number,
  repeated: number,
  crewOverride?: string,
  tag = "unit",
) {
  const employee = EMPLOYEES.find((item) => item.id === workerId);
  return Array.from({ length: count }, (_, index): OrderFact[] => {
    const repair = order({
      equipmentId: `${workerId}-${tag}-${index}`,
      faultCodeId: "f-bearing",
      assigneeId: workerId,
      brigadeId: employee?.brigadeId ?? null,
      shiftCrew: crewOverride ?? employee?.crew ?? "A",
      shiftPeriod: index % 2 === 0 ? "day" : "night",
      issuedAt: daysAgo(85 - index * 2.5),
    });
    if (index >= repeated) return [repair];
    const follow = order({
      equipmentId: repair.equipmentId,
      faultCodeId: "f-bearing",
      assigneeId: "w06",
      status: "issued",
      issuedAt: (repair.doneAt as number) + 3 * MS_PER_DAY,
    });
    return [repair, follow];
  }).flat();
}

describe("collectRepairs", () => {
  it("marks repairs followed by the same fault within seven days", () => {
    const repairs = collectRepairs(createContext(dataset({ orders: repairsOf("w01", 4, 2) }), 90));
    expect(repairs.map((repair) => repair.repeated)).toEqual([true, true, false, false]);
    expect(repairs[0]?.repeatOrderId).not.toBeNull();
  });
});

describe("findRepeatRateEffects", () => {
  it("singles out the worker and explains away the crew and brigade", () => {
    const orders = WORKERS.flatMap((workerId) =>
      repairsOf(workerId, 30, workerId === "w03" ? 18 : 3),
    );
    const insights = findRepeatRateEffects(createContext(dataset({ orders }), 90));
    expect(insights).toHaveLength(1);
    const [worker] = insights;
    expect(worker?.kind).toBe("worker_repeat_failures");
    expect(worker?.entityId).toBe("w03");
    expect(worker?.severity).toBe(3);
    if (worker?.kind === "worker_repeat_failures") {
      expect(worker.params.worker).toBe("Попов А. И.");
      expect(worker.params.rate).toBe(60);
      expect(worker.params.teamRate).toBe(10);
    }
  });

  it("reports a brigade when the whole team repeats failures", () => {
    const orders = WORKERS.flatMap((workerId) =>
      repairsOf(workerId, 20, ["w01", "w02", "w03"].includes(workerId) ? 9 : 1, "A"),
    );
    const insights = findRepeatRateEffects(createContext(dataset({ orders }), 90));
    expect(insights[0]?.kind).toBe("brigade_repeat_failures");
    expect(insights[0]?.entityId).toBe("brigade-crush");
  });

  it("reports a shift when one crew stands out across workers", () => {
    const orders = WORKERS.flatMap((workerId) => [
      ...repairsOf(workerId, 10, 1, "A"),
      ...repairsOf(workerId, 6, 4, "C", "night"),
    ]);
    const insights = findRepeatRateEffects(createContext(dataset({ orders }), 90));
    const shift = insights.find((insight) => insight.kind === "shift_effect");
    expect(shift?.params).toMatchObject({ dimension: "crew", group: "C", measure: "repeat_rate" });
  });

  it("finds nothing when everybody performs alike", () => {
    const orders = WORKERS.flatMap((workerId) => repairsOf(workerId, 20, 2));
    expect(findRepeatRateEffects(createContext(dataset({ orders }), 90))).toEqual([]);
  });
});
