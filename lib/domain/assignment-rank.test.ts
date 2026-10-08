import { describe, expect, it } from "vitest";
import type { AssigneeCandidate, BoardRow } from "@/lib/domain/assignment";
import {
  acceptableSpecialties,
  availabilityOf,
  candidateFromBoardRow,
  rankAssignees,
  scoreCandidate,
  specialtyFit,
  topCandidate,
} from "@/lib/domain/assignment-rank";

function candidate(overrides: Partial<AssigneeCandidate>): AssigneeCandidate {
  return {
    employeeId: overrides.fullName ?? "id",
    fullName: "Иванов",
    specialty: "fitter",
    grade: 4,
    brigadeId: null,
    onShift: true,
    activeOrderNumber: null,
    queueLength: 0,
    closedOnType: 0,
    rating: null,
    missingPermits: [],
    ...overrides,
  };
}

const pumpFitter = { specialty: "fitter" as const, equipmentType: "pump" as const };

describe("specialtyFit", () => {
  it("recognises exact, substitute and other specialties", () => {
    expect(specialtyFit("fitter", "fitter")).toBe("exact");
    expect(specialtyFit("fitter", "lubricator")).toBe("substitute");
    expect(specialtyFit("electrician", "instrumentation")).toBe("substitute");
    expect(specialtyFit("electrician", "fitter")).toBe("other");
    expect(specialtyFit(null, "fitter")).toBe("other");
    expect(specialtyFit("fitter", null)).toBe("unknown");
  });

  it("lists acceptable specialties with substitutes", () => {
    expect(acceptableSpecialties("welder")).toEqual(["welder", "fitter"]);
    expect(acceptableSpecialties("electrician")).toEqual(["electrician"]);
  });
});

describe("availabilityOf", () => {
  it("prioritises missing permits, then shift, then current work", () => {
    expect(availabilityOf(candidate({ missingPermits: ["Высота"], onShift: false }))).toEqual({
      kind: "no_permit",
      missing: ["Высота"],
    });
    expect(availabilityOf(candidate({ onShift: false, activeOrderNumber: 4 }))).toEqual({
      kind: "off_shift",
    });
    expect(availabilityOf(candidate({ activeOrderNumber: 12, queueLength: 2 }))).toEqual({
      kind: "busy",
      orderNumber: 12,
    });
    expect(availabilityOf(candidate({ queueLength: 2 }))).toEqual({ kind: "queued", length: 2 });
    expect(availabilityOf(candidate({}))).toEqual({ kind: "free" });
  });
});

describe("rankAssignees", () => {
  it("puts a free matching specialist on shift first", () => {
    const ranked = rankAssignees(
      [
        candidate({ employeeId: "busy", fullName: "Б", activeOrderNumber: 7 }),
        candidate({ employeeId: "off", fullName: "В", onShift: false }),
        candidate({ employeeId: "free", fullName: "А" }),
        candidate({ employeeId: "queue", fullName: "Г", queueLength: 1 }),
      ],
      pumpFitter,
    );
    expect(ranked.map((entry) => entry.candidate.employeeId)).toEqual([
      "free",
      "queue",
      "busy",
      "off",
    ]);
  });

  it("prefers a short queue over a long one", () => {
    const ranked = rankAssignees(
      [
        candidate({ employeeId: "long", fullName: "А", queueLength: 4 }),
        candidate({ employeeId: "short", fullName: "Б", queueLength: 1 }),
      ],
      pumpFitter,
    );
    expect(ranked[0]?.candidate.employeeId).toBe("short");
  });

  it("prefers exact specialty over a substitute and a substitute over others", () => {
    const ranked = rankAssignees(
      [
        candidate({ employeeId: "electric", fullName: "А", specialty: "electrician" }),
        candidate({ employeeId: "fitter", fullName: "Б", specialty: "fitter" }),
        candidate({ employeeId: "lube", fullName: "В", specialty: "lubricator" }),
      ],
      { specialty: "lubricator", equipmentType: "mill" },
    );
    expect(ranked.map((entry) => entry.candidate.employeeId)).toEqual([
      "lube",
      "fitter",
      "electric",
    ]);
  });

  it("uses experience on the equipment type and rating to break ties", () => {
    const ranked = rankAssignees(
      [
        candidate({ employeeId: "new", fullName: "А" }),
        candidate({ employeeId: "veteran", fullName: "Б", closedOnType: 12 }),
        candidate({ employeeId: "rated", fullName: "В", rating: 95 }),
      ],
      pumpFitter,
    );
    expect(ranked[0]?.candidate.employeeId).toBe("veteran");
    expect(ranked[1]?.candidate.employeeId).toBe("rated");
    expect(ranked[0]?.reasons).toEqual([
      { key: "free" },
      { key: "closedOnType", values: { count: 12, type: "pump" } },
      { key: "specialtyMatch", values: { specialty: "fitter" } },
    ]);
  });

  it("caps the experience bonus so availability still matters", () => {
    const ranked = rankAssignees(
      [
        candidate({ employeeId: "veteran", fullName: "А", closedOnType: 500, activeOrderNumber: 3 }),
        candidate({ employeeId: "free", fullName: "Б" }),
      ],
      pumpFitter,
    );
    expect(ranked[0]?.candidate.employeeId).toBe("free");
  });

  it("keeps candidates without permits last and not selectable with a reason", () => {
    const ranked = rankAssignees(
      [
        candidate({ employeeId: "blocked", fullName: "А", closedOnType: 40, missingPermits: ["ЭБ"] }),
        candidate({ employeeId: "off", fullName: "Б", onShift: false, specialty: "welder" }),
      ],
      pumpFitter,
    );
    const last = ranked[ranked.length - 1];
    expect(last?.candidate.employeeId).toBe("blocked");
    expect(last?.selectable).toBe(false);
    expect(last?.reasons[0]).toEqual({ key: "noPermit", values: { permits: "ЭБ" } });
    expect(topCandidate(ranked)?.candidate.employeeId).toBe("off");
  });

  it("returns null top candidate when nobody is selectable", () => {
    expect(topCandidate(rankAssignees([candidate({ missingPermits: ["x"] })], pumpFitter))).toBe(
      null,
    );
  });

  it("explains off shift, other specialty and rating", () => {
    const scored = scoreCandidate(
      candidate({ onShift: false, specialty: "electrician", rating: 71.6, missingPermits: ["ВР"] }),
      pumpFitter,
    );
    expect(scored.reasons.map((reason) => reason.key)).toEqual([
      "noPermit",
      "offShift",
      "specialtyOther",
      "rating",
    ]);
    expect(scored.reasons[3]).toEqual({ key: "rating", values: { score: 72 } });
  });

  it("ignores specialty when the need does not define it", () => {
    const scored = scoreCandidate(candidate({}), { specialty: null, equipmentType: "fan" });
    expect(scored.reasons).toEqual([{ key: "free" }]);
  });
});

describe("candidateFromBoardRow", () => {
  it("maps board rows with permits and ratings", () => {
    const row: BoardRow = {
      employee_id: "e1",
      full_name: "Петров",
      specialty: "hydraulic",
      grade: 5,
      brigade_id: "b1",
      on_shift: true,
      active_order_id: "o1",
      active_order_number: 77,
      queue_length: 2,
      closed_on_type: 9,
      missing_permits: ["Высота"],
    };
    expect(candidateFromBoardRow(row, { e1: 88 })).toEqual({
      employeeId: "e1",
      fullName: "Петров",
      specialty: "hydraulic",
      grade: 5,
      brigadeId: "b1",
      onShift: true,
      activeOrderNumber: 77,
      queueLength: 2,
      closedOnType: 9,
      rating: 88,
      missingPermits: ["Высота"],
    });
    expect(candidateFromBoardRow(row).rating).toBe(null);
  });
});
