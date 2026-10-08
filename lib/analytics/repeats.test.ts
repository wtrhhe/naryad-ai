import { describe, expect, it } from "vitest";
import { createContext } from "@/lib/analytics/dataset";
import { dataset, daysAgo, order } from "@/lib/analytics/fixtures";
import { findRepeatFaults, latestCluster, needsRootCause } from "@/lib/analytics/repeats";
import type { RcaCaseFact } from "@/lib/analytics/types";

const glandLeaks = () =>
  [32, 25, 18].map((days) =>
    order({ equipmentId: "p4", faultCodeId: "f-gland", issuedAt: daysAgo(days) }),
  );

const peerNoise = () =>
  ["p1", "p2", "p3"].flatMap((equipmentId, index) => [
    order({ equipmentId, faultCodeId: "f-gland", issuedAt: daysAgo(70 - index * 5) }),
    order({ equipmentId, faultCodeId: "f-motor", issuedAt: daysAgo(40 - index * 3) }),
  ]);

describe("latestCluster", () => {
  it("finds the densest thirty day group that is still recent", () => {
    const cluster = latestCluster(glandLeaks(), daysAgo(30));
    expect(cluster?.orders).toHaveLength(3);
    expect(cluster?.spanDays).toBeCloseTo(14, 0);
    expect(cluster?.minGapDays).toBeCloseTo(7, 0);
  });

  it("ignores clusters that ended long ago", () => {
    const old = [80, 75, 70].map((days) => order({ equipmentId: "p4", issuedAt: daysAgo(days) }));
    expect(latestCluster(old, daysAgo(30))).toBeNull();
  });
});

describe("findRepeatFaults", () => {
  it("reports a recurring gland leak and links the open root cause case", () => {
    const rca: RcaCaseFact = {
      id: "rca-1",
      equipmentId: "p4",
      faultCodeId: "f-gland",
      status: "open",
      relatedOrderIds: [],
      openedAt: daysAgo(17),
      closedAt: null,
    };
    const data = dataset({ orders: [...glandLeaks(), ...peerNoise()], rcaCases: [rca] });
    const [insight] = findRepeatFaults(createContext(data, 90));
    expect(insight?.entityId).toBe("p4");
    expect(insight?.params.faultCode).toBe("М-05");
    expect(insight?.params.occurrences).toBe(3);
    expect(insight?.rcaCaseId).toBe("rca-1");
    expect(insight?.params.rcaState).toBe("open");
    expect(insight?.relatedOrderIds).toHaveLength(3);
    expect(insight?.severity).toBe(2);
    expect(insight && needsRootCause(insight)).toBe(false);
  });

  it("keeps a tracked case visible after a single repeat", () => {
    const rca: RcaCaseFact = {
      id: "rca-2",
      equipmentId: "p4",
      faultCodeId: "f-gland",
      status: "in_progress",
      relatedOrderIds: [],
      openedAt: daysAgo(17),
      closedAt: null,
    };
    const pair = [20, 12].map((days) =>
      order({ equipmentId: "p4", faultCodeId: "f-gland", issuedAt: daysAgo(days) }),
    );
    const [insight] = findRepeatFaults(
      createContext(dataset({ orders: pair, rcaCases: [rca] }), 30),
    );
    expect(insight?.params.rcaState).toBe("in_progress");
    expect(insight?.params.occurrences).toBe(2);
  });

  it("lists a borderline new cluster as a low severity observation", () => {
    const data = dataset({ orders: [...glandLeaks(), ...peerNoise()] });
    const [insight] = findRepeatFaults(createContext(data, 90));
    expect(insight?.severity).toBe(1);
    expect(insight && needsRootCause(insight)).toBe(false);
  });

  it("does not repeat a case closed after the last occurrence", () => {
    const rca: RcaCaseFact = {
      id: "rca-closed",
      equipmentId: "p4",
      faultCodeId: "f-gland",
      status: "closed",
      relatedOrderIds: [],
      openedAt: daysAgo(17),
      closedAt: daysAgo(10),
    };
    const data = dataset({ orders: [...glandLeaks(), ...peerNoise()], rcaCases: [rca] });
    expect(findRepeatFaults(createContext(data, 90))).toEqual([]);
  });

  it("skips pairs whose recurrence is ordinary for the equipment type", () => {
    const common = ["p1", "p2", "p3", "p4"].flatMap((equipmentId) =>
      [80, 60, 45, 28, 20, 12, 5].map((days) =>
        order({ equipmentId, faultCodeId: "f-motor", issuedAt: daysAgo(days) }),
      ),
    );
    expect(findRepeatFaults(createContext(dataset({ orders: common }), 90))).toEqual([]);
  });

  it("marks long recurrence as severe", () => {
    const bearings = [28, 25, 21, 16, 12, 6, 2].map((days) =>
      order({ equipmentId: "c3", faultCodeId: "f-bearing", issuedAt: daysAgo(days) }),
    );
    const [insight] = findRepeatFaults(createContext(dataset({ orders: bearings }), 30));
    expect(insight?.severity).toBe(3);
    expect(insight?.params.rcaState).toBe("none");
    expect(insight && needsRootCause(insight)).toBe(true);
  });
});
