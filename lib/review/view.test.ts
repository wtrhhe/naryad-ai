import { describe, expect, it } from "vitest";
import { reviewContext, settings } from "@/lib/review/__fixtures__/context";
import { runChecks } from "@/lib/review/checks";
import { planDecision, decideReviewSchema } from "@/lib/review/decision";
import {
  effectiveScore,
  effectiveVerdict,
  toCheckView,
  toChecksView,
  toOrderReviewData,
  toReviewView,
  toTiming,
  type AiReviewRow,
} from "@/lib/review/view";

function row(overrides: Partial<AiReviewRow> = {}): AiReviewRow {
  return {
    id: "review-1",
    work_order_id: "order-1",
    revision: 0,
    verdict: "accepted_with_remarks",
    score: 72,
    rating: 3,
    checks: JSON.parse(JSON.stringify(runChecks(reviewContext({ lockouts: [] }), settings))),
    strengths: ["Хорошо"],
    improvements: ["Улучшить"],
    worker_explanation: "Для исполнителя",
    master_explanation: "Для мастера",
    confidence: 0.81,
    needs_master_review: false,
    used_llm: true,
    model: "smart",
    master_id: null,
    master_verdict: null,
    master_score: null,
    master_rating: null,
    master_comment: null,
    master_decided_at: null,
    created_at: "2026-10-11T11:01:00Z",
    updated_at: "2026-10-11T11:01:00Z",
    ...overrides,
  };
}

const timingRow = {
  standard_hours: null,
  due_at: "2026-10-11T10:30:00Z",
  started_at: "2026-10-11T08:00:00Z",
  done_at: "2026-10-11T11:00:00Z",
  paused_seconds: 1800,
  fault_code: { standard_hours: 2 },
};

describe("review view", () => {
  it("normalizes stored checks with findings", () => {
    const view = toReviewView(row());
    const lockout = view.checks.find((check) => check.key === "lockout");
    expect(lockout).toMatchObject({
      knownKey: "lockout",
      status: "fail",
      severity: "high",
      code: "lockout_missing",
      findings: [{ code: "lockout_missing", status: "fail" }],
    });
    expect(view).toMatchObject({ confidence: 0.81, usedLlm: true, master: null });
  });

  it("reads legacy seed checks", () => {
    const legacy = toCheckView({
      key: "ghost",
      label: "Фото «после» отличается от фото «до»",
      passed: false,
      detail: "Фото «после» совпадает с фото «до»",
    });
    expect(legacy).toMatchObject({
      knownKey: "ghost",
      status: "fail",
      severity: "high",
      code: null,
      findings: [],
      values: {},
    });
    expect(toCheckView({ key: "custom", passed: true, detail: "x" })).toMatchObject({
      knownKey: null,
      status: "pass",
      label: "",
    });
  });

  it("drops malformed checks and findings", () => {
    expect(toCheckView(42)).toBeNull();
    expect(toChecksView("bad")).toEqual([]);
    expect(
      toCheckView({ key: "time", status: "warn", findings: [{ code: "nope" }, null] })?.findings,
    ).toEqual([]);
  });

  it("exposes the master decision and the effective values", () => {
    const view = toReviewView(
      row({
        master_id: "master-1",
        master_verdict: "accepted",
        master_score: 85,
        master_rating: 4,
        master_comment: "Проверил лично",
        master_decided_at: "2026-10-11T12:00:00Z",
      }),
    );
    expect(view.master).toMatchObject({ score: 85, changed: true, comment: "Проверил лично" });
    expect(effectiveScore(view)).toBe(85);
    expect(effectiveVerdict(view)).toBe("accepted");
    const agreed = toReviewView(
      row({ master_score: 72, master_verdict: "accepted_with_remarks", master_decided_at: "x" }),
    );
    expect(agreed.master?.changed).toBe(false);
    expect(effectiveScore(toReviewView(row()))).toBe(72);
  });

  it("computes timing against the standard and the deadline", () => {
    expect(toTiming(timingRow, [])).toEqual({
      actualHours: 2.5,
      standardHours: 2,
      percent: 125,
      dueAt: "2026-10-11T10:30:00Z",
      doneAt: "2026-10-11T11:00:00Z",
      lateMinutes: 30,
    });
    expect(toTiming({ ...timingRow, started_at: null, fault_code: null }, [])).toMatchObject({
      actualHours: null,
      standardHours: null,
      percent: null,
    });
  });

  it("marks the order pending until the review for its revision exists", () => {
    const order = { ...timingRow, id: "order-1", status: "ai_review" as const, rework_count: 1 };
    const stale = toOrderReviewData(order, [row()], []);
    expect(stale.pending).toBe(true);
    expect(stale.review?.revision).toBe(0);
    const fresh = toOrderReviewData(order, [row(), row({ id: "review-2", revision: 1 })], []);
    expect(fresh.pending).toBe(false);
    expect(fresh.review?.id).toBe("review-2");
    expect(fresh.history.map((item) => item.revision)).toEqual([1, 0]);
    const closed = toOrderReviewData({ ...order, status: "closed" }, [], []);
    expect(closed.pending).toBe(false);
  });
});

describe("planDecision", () => {
  const base = { orderId: "00000000-0000-4000-8000-000000000001" };
  const review = { verdict: "accepted_with_remarks" as const, score: 72 };

  it("closes on agreement with the AI score", () => {
    const plan = planDecision({ ...base, agree: true }, review);
    expect(plan).toMatchObject({
      ok: true,
      action: "approve",
      comment: null,
      master: {
        master_verdict: "accepted_with_remarks",
        master_score: 72,
        master_rating: 3,
        master_comment: null,
      },
      payload: {
        expected_status: "ai_review",
        review: { agreed: true, ai_score: 72, master_score: 72 },
      },
    });
  });

  it("returns to rework when agreeing with a rework verdict and requires a comment", () => {
    const rework = { verdict: "rework" as const, score: 40 };
    expect(planDecision({ ...base, agree: true }, rework)).toEqual({
      ok: false,
      error: "comment_required",
    });
    expect(planDecision({ ...base, agree: true, comment: "Переделать" }, rework)).toMatchObject({
      ok: true,
      action: "return_rework",
      payload: { comment: "Переделать" },
    });
  });

  it("requires a comment to change the score", () => {
    expect(planDecision({ ...base, agree: false, score: 90 }, review)).toEqual({
      ok: false,
      error: "comment_required",
    });
    expect(planDecision({ ...base, agree: false, score: 90, comment: " x " }, review)).toEqual({
      ok: false,
      error: "comment_required",
    });
  });

  it("derives the verdict from a changed score", () => {
    const plan = planDecision({ ...base, agree: false, score: 88, comment: "Проверил" }, review);
    expect(plan).toMatchObject({
      ok: true,
      action: "approve",
      master: { master_verdict: "accepted", master_score: 88, master_rating: 4 },
    });
    const low = planDecision({ ...base, agree: false, score: 30, comment: "Течь" }, review);
    expect(low).toMatchObject({ ok: true, action: "return_rework" });
  });

  it("returns to rework with a comment keeping the AI score", () => {
    const plan = planDecision(
      { ...base, agree: false, verdict: "rework", comment: "Нет фото" },
      review,
    );
    expect(plan).toMatchObject({
      ok: true,
      action: "return_rework",
      master: { master_verdict: "rework", master_score: 72 },
    });
  });

  it("works without an AI review", () => {
    expect(planDecision({ ...base, agree: true }, null)).toMatchObject({
      ok: true,
      action: "approve",
      master: null,
    });
    expect(planDecision({ ...base, agree: false, verdict: "rework" }, null)).toEqual({
      ok: false,
      error: "comment_required",
    });
    expect(
      planDecision({ ...base, agree: false, verdict: "rework", comment: "Повторить" }, null),
    ).toMatchObject({ ok: true, action: "return_rework" });
  });

  it("rejects a decision without any verdict", () => {
    expect(planDecision({ ...base, agree: true }, { verdict: null, score: null })).toEqual({
      ok: false,
      error: "validation",
    });
  });

  it("validates the input", () => {
    expect(decideReviewSchema.safeParse({ ...base, agree: true, score: 101 }).success).toBe(false);
    expect(decideReviewSchema.safeParse({ orderId: "x", agree: true }).success).toBe(false);
    expect(decideReviewSchema.parse({ ...base, agree: false, comment: "  ок  " }).comment).toBe(
      "ок",
    );
  });
});
