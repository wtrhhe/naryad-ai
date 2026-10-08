import { describe, expect, it } from "vitest";
import {
  availableActions,
  checkTransition,
  FINAL_STATUSES,
  OPEN_STATUSES,
  TRANSITION_ACTIONS,
  TRANSITIONS,
  type ActorRole,
  type WorkOrderStatus,
} from "@/lib/domain/work-order-machine";

const ALL_STATUSES: WorkOrderStatus[] = [...OPEN_STATUSES, ...FINAL_STATUSES];
const ALL_ROLES: ActorRole[] = ["master", "worker", "manager", "admin", "system"];

describe("happy path of a work order", () => {
  it.each([
    ["issued", "accept", "worker", "accepted"],
    ["issued", "queue", "worker", "queued"],
    ["queued", "accept", "worker", "accepted"],
    ["accepted", "start", "worker", "in_progress"],
    ["in_progress", "pause", "worker", "paused"],
    ["paused", "resume", "worker", "in_progress"],
    ["in_progress", "complete", "worker", "done"],
    ["done", "submit_review", "system", "ai_review"],
    ["ai_review", "approve", "master", "closed"],
    ["ai_review", "return_rework", "master", "rework"],
    ["rework", "start", "worker", "in_progress"],
    ["issued", "reject", "worker", "rejected"],
    ["rejected", "reassign", "master", "issued"],
  ] as const)("%s --%s(%s)--> %s", (from, action, role, to) => {
    expect(checkTransition(from, action, role)).toMatchObject({ ok: true, to });
  });
});

describe("forbidden moves", () => {
  it.each([
    ["issued", "start", "worker"],
    ["issued", "complete", "worker"],
    ["accepted", "complete", "worker"],
    ["paused", "complete", "worker"],
    ["done", "approve", "master"],
    ["closed", "start", "worker"],
    ["cancelled", "reassign", "master"],
    ["in_progress", "reassign", "master"],
    ["rejected", "accept", "worker"],
  ] as const)("%s cannot %s by %s", (from, action, role) => {
    expect(checkTransition(from, action, role)).toEqual({ ok: false, error: "invalid_transition" });
  });

  it("workers cannot approve their own work", () => {
    expect(checkTransition("ai_review", "approve", "worker")).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("masters cannot press worker buttons", () => {
    expect(checkTransition("issued", "accept", "master")).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("managers and admins only observe", () => {
    TRANSITION_ACTIONS.forEach((action) => {
      ALL_STATUSES.forEach((status) => {
        expect(checkTransition(status, action, "manager").ok).toBe(false);
        expect(checkTransition(status, action, "admin").ok).toBe(false);
      });
    });
  });

  it("issue is not a transition", () => {
    expect(checkTransition("issued", "issue", "master")).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });
});

describe("transition table invariants", () => {
  it("never leaves a final status except by comment", () => {
    FINAL_STATUSES.forEach((status) => {
      ALL_ROLES.forEach((role) => {
        availableActions(status, role).forEach((action) => expect(action).toBe("comment"));
      });
    });
  });

  it("requires a reason for reject, pause and cancel", () => {
    expect(TRANSITIONS.reject.requires).toContain("reason");
    expect(TRANSITIONS.pause.requires).toContain("reason");
    expect(TRANSITIONS.cancel.requires).toContain("reason");
  });

  it("requires the closing form to complete", () => {
    expect(TRANSITIONS.complete.requires).toContain("closing");
  });

  it("marks irreversible worker actions for swipe or long press confirmation", () => {
    expect(TRANSITIONS.reject.irreversible).toBe(true);
    expect(TRANSITIONS.complete.irreversible).toBe(true);
    expect(TRANSITIONS.accept.irreversible).toBe(false);
  });

  it("offers a worker exactly the buttons from the brief on a fresh order", () => {
    expect(availableActions("issued", "worker")).toEqual(["queue", "accept", "reject", "comment"]);
    expect(availableActions("in_progress", "worker")).toEqual(["pause", "complete", "comment"]);
  });

  it("every status is reachable from issued", () => {
    const reached = new Set<WorkOrderStatus>(["issued"]);
    let frontier: WorkOrderStatus[] = ["issued"];
    while (frontier.length > 0) {
      const next = frontier.flatMap((status) =>
        ALL_ROLES.flatMap((role) =>
          availableActions(status, role)
            .map((action) => TRANSITIONS[action].to)
            .filter((to): to is WorkOrderStatus => to !== null && !reached.has(to)),
        ),
      );
      next.forEach((status) => reached.add(status));
      frontier = [...new Set(next)];
    }
    expect([...reached].sort()).toEqual([...ALL_STATUSES].sort());
  });
});
