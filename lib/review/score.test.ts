import { describe, expect, it } from "vitest";
import { buildCheck, finding, skipCheck } from "@/lib/review/checks/result";
import {
  capVerdict,
  checkPenalty,
  clampScore,
  clampToVerdict,
  lowerVerdict,
  maxAllowedVerdict,
  ratingFor,
  scoreBand,
  scoreChecks,
  verdictFor,
} from "@/lib/review/score";
import type { CheckResult, CheckSeverity } from "@/lib/review/types";

const pass = () => buildCheck("completeness", "completeness_ok", { count: 0 }, []);
const warn = (severity: CheckSeverity) =>
  buildCheck("time", "time_actual", { actual: 1, standard: 1 }, [
    finding("over_standard", "warn", severity, { percent: 40 }),
  ]);
const fail = () =>
  buildCheck("lockout", "lockout_missing", {}, [finding("lockout_missing", "fail", "high")]);

describe("verdictFor", () => {
  it.each([
    [100, "accepted"],
    [80, "accepted"],
    [79, "accepted_with_remarks"],
    [60, "accepted_with_remarks"],
    [59, "rework"],
    [0, "rework"],
  ] as const)("maps %i to %s like the seed", (score, verdict) => {
    expect(verdictFor(score)).toBe(verdict);
  });
});

describe("ratingFor", () => {
  it.each([
    [100, 5],
    [90, 5],
    [89, 4],
    [80, 4],
    [79, 3],
    [70, 3],
    [69, 2],
    [55, 2],
    [54, 1],
    [0, 1],
  ] as const)("maps %i to %i stars", (score, rating) => {
    expect(ratingFor(score)).toBe(rating);
  });
});

describe("score bands", () => {
  it("returns bands that cover 0–100 without gaps", () => {
    expect(scoreBand("rework")).toEqual([0, 59]);
    expect(scoreBand("accepted_with_remarks")).toEqual([60, 79]);
    expect(scoreBand("accepted")).toEqual([80, 100]);
  });

  it("clamps a score into the verdict band", () => {
    expect(clampToVerdict(95, "rework")).toBe(59);
    expect(clampToVerdict(30, "accepted")).toBe(80);
    expect(clampToVerdict(70.4, "accepted_with_remarks")).toBe(70);
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-3)).toBe(0);
  });

  it("orders verdicts from rework to accepted", () => {
    expect(lowerVerdict("accepted", "rework")).toBe("rework");
    expect(lowerVerdict("accepted_with_remarks", "accepted")).toBe("accepted_with_remarks");
  });
});

describe("verdict cap", () => {
  it("allows any verdict without failed checks", () => {
    expect(maxAllowedVerdict([pass(), warn("high")])).toBe("accepted");
    expect(capVerdict("accepted", [pass()])).toBe("accepted");
  });

  it("caps the verdict at rework when any check failed", () => {
    expect(capVerdict("accepted", [pass(), fail()])).toBe("rework");
    expect(capVerdict("accepted_with_remarks", [fail()])).toBe("rework");
  });
});

describe("scoreChecks", () => {
  it("gives a clean order the full score", () => {
    expect(scoreChecks([pass(), skipCheck("acoustic", "acoustic_none")])).toEqual({
      score: 100,
      verdict: "accepted",
      rating: 5,
      hasFail: false,
    });
  });

  it("keeps an order with a minor remark accepted", () => {
    expect(scoreChecks([pass(), warn("low")])).toMatchObject({ score: 94, verdict: "accepted" });
  });

  it("moves an order with a medium remark to accepted with remarks", () => {
    expect(scoreChecks([warn("medium")])).toMatchObject({
      score: 79,
      verdict: "accepted_with_remarks",
      rating: 3,
    });
  });

  it("never sends an order to rework on remarks alone", () => {
    const outcome = scoreChecks([warn("high"), warn("high"), warn("medium")]);
    expect(outcome).toMatchObject({ score: 60, verdict: "accepted_with_remarks", hasFail: false });
  });

  it("sends any failed check to rework below 60", () => {
    expect(scoreChecks([fail()])).toEqual({
      score: 55,
      verdict: "rework",
      rating: 2,
      hasFail: true,
    });
    expect(scoreChecks([fail(), fail(), fail()])).toMatchObject({ score: 0, rating: 1 });
  });

  it("charges penalties by status and severity", () => {
    const penalties: CheckResult[] = [pass(), warn("low"), warn("medium"), warn("high"), fail()];
    expect(penalties.map(checkPenalty)).toEqual([0, 6, 21, 30, 45]);
  });
});
