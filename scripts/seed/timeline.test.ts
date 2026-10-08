import { describe, expect, it } from "vitest";
import { createRng } from "./random";
import { MS_PER_HOUR, MS_PER_MINUTE } from "./time";
import { placeSteps, planTimeline, type TimelineOptions } from "./timeline";

const baseOptions: TimelineOptions = {
  kind: "unplanned",
  priority: "high",
  standardHours: 4,
  speedFactor: 1,
  queueWaitMs: 0,
  rejected: false,
  cancelled: false,
  pauseCount: 0,
  reworkCount: 0,
  escalateTo: null,
  stopAt: null,
};

const plan = (overrides: Partial<TimelineOptions>, seed = 1) =>
  planTimeline({ ...baseOptions, ...overrides }, createRng(seed));

describe("planTimeline happy path", () => {
  it("walks issue to approve with consistent status transitions", () => {
    const { steps } = plan({});
    expect(steps.map((step) => step.action)).toEqual([
      "issue",
      "accept",
      "start",
      "complete",
      "submit_review",
      "approve",
    ]);
    expect(steps.at(-1)?.to).toBe("closed");
    let previous: string | null = null;
    for (const step of steps) {
      if (step.from) expect(step.from).toBe(previous);
      previous = step.to;
    }
    const offsets = steps.map((step) => step.offsetMs);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(offsets[0]).toBe(0);
  });

  it("keeps work duration close to the standard hours scaled by speed", () => {
    const durations = Array.from({ length: 200 }, (_, seed) => {
      const { steps } = plan({}, seed);
      const start = steps.find((step) => step.action === "start")?.offsetMs as number;
      const complete = steps.find((step) => step.action === "complete")?.offsetMs as number;
      return (complete - start) / MS_PER_HOUR;
    });
    const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    expect(mean).toBeGreaterThan(3.4);
    expect(mean).toBeLessThan(5);
    expect(Math.min(...durations)).toBeGreaterThan(1.5);
  });

  it("accepts emergency orders faster than normal ones", () => {
    const acceptDelay = (priority: "emergency" | "normal") =>
      Array.from(
        { length: 100 },
        (_, seed) =>
          (plan({ priority }, seed).steps.find((step) => step.action === "accept")
            ?.offsetMs as number) / MS_PER_MINUTE,
      ).reduce((sum, value) => sum + value, 0) / 100;
    expect(acceptDelay("emergency")).toBeLessThan(acceptDelay("normal"));
  });
});

describe("planTimeline branches", () => {
  it("adds a queue step and delays acceptance until the worker is free", () => {
    const { steps } = plan({ queueWaitMs: 3 * MS_PER_HOUR });
    expect(steps.map((step) => step.action).slice(0, 3)).toEqual(["issue", "queue", "accept"]);
    expect(steps.find((step) => step.action === "accept")?.offsetMs).toBeGreaterThanOrEqual(
      3 * MS_PER_HOUR,
    );
  });

  it("models a reject followed by a master reassign", () => {
    const { steps } = plan({ rejected: true });
    expect(steps.map((step) => step.action).slice(0, 4)).toEqual([
      "issue",
      "reject",
      "reassign",
      "accept",
    ]);
    expect(steps[1]).toMatchObject({ actor: "initial", to: "rejected", reasonKind: "reject" });
    expect(steps[2]).toMatchObject({ actor: "master", from: "rejected", to: "issued" });
  });

  it("models pauses with reasons and tracks the paused time", () => {
    const result = plan({ pauseCount: 2 });
    const actions = result.steps.map((step) => step.action);
    expect(actions.filter((action) => action === "pause")).toHaveLength(2);
    expect(actions.filter((action) => action === "resume")).toHaveLength(2);
    expect(
      result.steps
        .filter((step) => step.action === "pause")
        .every((step) => step.reasonKind === "pause"),
    ).toBe(true);
    expect(result.pausedMs).toBeGreaterThan(0);
  });

  it("models rework loops by returning the order and restarting from rework", () => {
    const { steps } = plan({ reworkCount: 1 });
    expect(steps.map((step) => step.action)).toEqual([
      "issue",
      "accept",
      "start",
      "complete",
      "submit_review",
      "return_rework",
      "start",
      "complete",
      "submit_review",
      "approve",
    ]);
    expect(steps[6]).toMatchObject({ from: "rework", to: "in_progress" });
  });

  it("cancels without work", () => {
    const { steps } = plan({ cancelled: true });
    expect(steps.map((step) => step.action)).toEqual(["issue", "cancel"]);
    expect(steps.at(-1)?.to).toBe("cancelled");
  });

  it("records a priority change when escalating", () => {
    const { steps } = plan({ priority: "normal", escalateTo: "high" });
    const change = steps.find((step) => step.action === "change_priority");
    expect(change?.payload).toEqual({ from: "normal", to: "high" });
  });

  it("is deterministic", () => {
    expect(plan({ pauseCount: 1, reworkCount: 1 }, 7)).toEqual(
      plan({ pauseCount: 1, reworkCount: 1 }, 7),
    );
  });
});

describe("planTimeline stop points for open orders", () => {
  it.each([
    ["issued", ["issue"]],
    ["queued", ["issue", "queue"]],
    ["accepted", ["issue", "accept"]],
    ["in_progress", ["issue", "accept", "start"]],
    ["paused", ["issue", "accept", "start", "pause"]],
  ] as const)("stops after reaching %s", (stopAt, expected) => {
    const options = {
      stopAt,
      queueWaitMs: stopAt === "queued" ? MS_PER_HOUR : 0,
      pauseCount: stopAt === "paused" ? 1 : 0,
    };
    const { steps } = plan(options);
    expect(steps.map((step) => step.action)).toEqual(expected);
    expect(steps.at(-1)?.to).toBe(stopAt);
  });
});

describe("placeSteps", () => {
  it("converts offsets to absolute times and scales them", () => {
    const { steps } = plan({});
    const issuedAt = Date.UTC(2026, 9, 1, 3, 0, 0);
    const placed = placeSteps(steps, issuedAt, 1);
    expect(placed[0]?.atMs).toBe(issuedAt);
    const halved = placeSteps(steps, issuedAt, 0.5);
    expect((halved.at(-1)?.atMs as number) - issuedAt).toBeCloseTo(
      ((placed.at(-1)?.atMs as number) - issuedAt) / 2,
      -2,
    );
  });
});
