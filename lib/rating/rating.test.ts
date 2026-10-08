import { describe, expect, it } from "vitest";
import {
  computeRating,
  DEFAULT_RATING_WEIGHTS,
  parseRatingWeights,
  refusalPenalty,
} from "@/lib/rating/formula";
import {
  rateBrigades,
  rateEmployees,
  repeatFailureIds,
  type ClosedOrderFact,
  type FollowUpFact,
} from "@/lib/rating/aggregate";

function fact(overrides: Partial<ClosedOrderFact> = {}): ClosedOrderFact {
  return {
    orderId: crypto.randomUUID(),
    assigneeId: "w1",
    brigadeId: "b1",
    equipmentId: "e1",
    faultCodeId: "f1",
    priority: "normal",
    closedAt: "2026-10-10T12:00:00Z",
    dueAt: "2026-10-10T12:00:00Z",
    doneAt: "2026-10-10T11:00:00Z",
    standardHours: 2,
    score: 80,
    reworkCount: 0,
    ...overrides,
  };
}

function followUp(overrides: Partial<FollowUpFact> = {}): FollowUpFact {
  return {
    orderId: crypto.randomUUID(),
    equipmentId: "e1",
    faultCodeId: "f1",
    issuedAt: "2026-10-13T08:00:00Z",
    kind: "unplanned",
    ...overrides,
  };
}

describe("computeRating", () => {
  it("weights the components 40/25/20/15", () => {
    const result = computeRating(
      { quality: 100, onTime: 100, noRework: 100, volume: 100, refusalPenalty: 0 },
      DEFAULT_RATING_WEIGHTS,
    );
    expect(result.score).toBe(100);
    expect(result.contributions).toEqual({ quality: 40, onTime: 25, noRework: 20, volume: 15 });
  });

  it("subtracts the refusal penalty and never drops below zero", () => {
    expect(
      computeRating(
        { quality: 80, onTime: 50, noRework: 100, volume: 0, refusalPenalty: 5 },
        DEFAULT_RATING_WEIGHTS,
      ).score,
    ).toBe(59.5);
    expect(
      computeRating(
        { quality: 0, onTime: 0, noRework: 0, volume: 0, refusalPenalty: 10 },
        DEFAULT_RATING_WEIGHTS,
      ).score,
    ).toBe(0);
  });

  it("caps the refusal penalty", () => {
    expect(refusalPenalty(2, DEFAULT_RATING_WEIGHTS)).toBe(5);
    expect(refusalPenalty(20, DEFAULT_RATING_WEIGHTS)).toBe(10);
  });
});

describe("parseRatingWeights", () => {
  it("falls back to defaults when weights do not sum to one", () => {
    expect(parseRatingWeights({ ...DEFAULT_RATING_WEIGHTS, quality: 0.9 })).toEqual(
      DEFAULT_RATING_WEIGHTS,
    );
    expect(parseRatingWeights(null)).toEqual(DEFAULT_RATING_WEIGHTS);
  });

  it("accepts custom weights", () => {
    const custom = { ...DEFAULT_RATING_WEIGHTS, quality: 0.5, volume: 0.05 };
    expect(parseRatingWeights(custom)).toEqual(custom);
  });
});

describe("repeatFailureIds", () => {
  it("flags a breakdown of the same unit and fault within seven days", () => {
    const repaired = fact();
    expect(repeatFailureIds([repaired], [followUp()]).has(repaired.orderId)).toBe(true);
  });

  it("ignores planned work, other equipment and later breakdowns", () => {
    const repaired = fact();
    const later = [
      followUp({ kind: "planned" }),
      followUp({ equipmentId: "e2" }),
      followUp({ issuedAt: "2026-10-20T08:00:00Z" }),
      followUp({ faultCodeId: "f2" }),
    ];
    expect(repeatFailureIds([repaired], later).size).toBe(0);
  });
});

describe("rateEmployees", () => {
  it("ranks workers and explains the components", () => {
    const facts = [
      fact({ assigneeId: "w1", score: 90 }),
      fact({ assigneeId: "w1", score: 90, priority: "emergency" }),
      fact({ assigneeId: "w2", score: 60, doneAt: "2026-10-10T13:00:00Z", reworkCount: 1 }),
    ];
    const [best, worst] = rateEmployees({
      facts,
      followUps: [],
      refusals: [{ employeeId: "w2", brigadeId: "b1", isValidExcuse: false }],
      weights: DEFAULT_RATING_WEIGHTS,
    });
    expect(best?.subjectId).toBe("w1");
    expect(best?.components.volume).toBe(100);
    expect(best?.score).toBe(96);
    expect(worst).toMatchObject({
      subjectId: "w2",
      onTimeCount: 0,
      reworkedCount: 1,
      unexcusedRefusals: 1,
    });
    expect(worst?.components.refusalPenalty).toBe(2.5);
  });

  it("keeps listed workers without closed orders at zero", () => {
    const ratings = rateEmployees({
      facts: [],
      followUps: [],
      refusals: [{ employeeId: "w3", brigadeId: null, isValidExcuse: true }],
      weights: DEFAULT_RATING_WEIGHTS,
      employeeIds: ["w3"],
    });
    expect(ratings).toEqual([
      expect.objectContaining({ subjectId: "w3", score: 0, closedCount: 0 }),
    ]);
  });

  it("counts repeat failures against the clean share", () => {
    const repaired = fact({ assigneeId: "w1" });
    const [rating] = rateEmployees({
      facts: [repaired],
      followUps: [followUp()],
      refusals: [],
      weights: DEFAULT_RATING_WEIGHTS,
    });
    expect(rating?.repeatCount).toBe(1);
    expect(rating?.components.noRework).toBe(0);
  });
});

describe("rateBrigades", () => {
  it("groups facts by brigade", () => {
    const ratings = rateBrigades({
      facts: [fact({ brigadeId: "b1" }), fact({ brigadeId: "b2", score: 40 })],
      followUps: [],
      refusals: [],
      weights: DEFAULT_RATING_WEIGHTS,
    });
    expect(ratings.map((rating) => rating.subjectId)).toEqual(["b1", "b2"]);
  });
});
