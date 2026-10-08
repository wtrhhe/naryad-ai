import { describe, expect, it } from "vitest";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  backoffDelay,
  buildChains,
  classifyActionResult,
  classifyError,
  decideOutcome,
  isDue,
  isNetworkError,
  isRedirectError,
  MAX_ATTEMPTS,
  nextSequence,
  nextWakeAt,
  OutboxTimeoutError,
  runnableChains,
  withTimeout,
} from "@/lib/offline/schedule";
import type { OutboxItem } from "@/lib/offline/types";

const now = new Date("2026-10-11T08:00:00.000Z");

function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: "a1",
    kind: "transition",
    ownerId: "worker-1",
    chainKey: "order-1",
    sequence: 1,
    payload: { action: "accept", orderId: "order-1" },
    label: null,
    createdAt: "2026-10-11T07:59:00.000Z",
    attempts: 0,
    lastError: null,
    status: "pending",
    nextAttemptAt: null,
    blobCount: 0,
    ...overrides,
  };
}

describe("backoffDelay", () => {
  it("doubles with every attempt around the base delay", () => {
    const middle = () => 0.5;
    expect(backoffDelay(1, middle)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelay(2, middle)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffDelay(4, middle)).toBe(BACKOFF_BASE_MS * 8);
  });

  it("keeps the jitter within twenty percent", () => {
    expect(backoffDelay(3, () => 0)).toBe(BACKOFF_BASE_MS * 4 * 0.8);
    expect(backoffDelay(3, () => 1)).toBe(BACKOFF_BASE_MS * 4 * 1.2);
  });

  it("never waits longer than the cap", () => {
    expect(backoffDelay(30, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(0, () => 0.5)).toBe(BACKOFF_BASE_MS);
  });
});

describe("ordering", () => {
  it("keeps the sequence strictly increasing within one millisecond", () => {
    expect(nextSequence(1000, 999)).toBe(1000);
    expect(nextSequence(1000, 1000)).toBe(1001);
    expect(nextSequence(900, 1000)).toBe(1001);
  });

  it("groups actions per order in the order they were made", () => {
    const chains = buildChains([
      item({ id: "c", chainKey: "order-2", sequence: 3 }),
      item({ id: "b", chainKey: "order-1", sequence: 2 }),
      item({ id: "a", chainKey: "order-1", sequence: 1 }),
    ]);
    expect(chains.map((chain) => chain.map((entry) => entry.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("starts only chains whose head is due, owned and has a sender", () => {
    const items = [
      item({ id: "due", chainKey: "o1", sequence: 1 }),
      item({
        id: "later",
        chainKey: "o2",
        sequence: 2,
        nextAttemptAt: "2026-10-11T08:05:00.000Z",
      }),
      item({ id: "foreign", chainKey: "o3", sequence: 3, ownerId: "worker-2" }),
      item({ id: "audio", chainKey: "o4", sequence: 4, kind: "audio" }),
    ];
    const kinds = new Set(["transition"] as const);
    const run = (force: boolean) =>
      runnableChains(items, { ownerId: "worker-1", now, force, kinds }).map(
        (chain) => chain[0]?.id,
      );
    expect(run(false)).toEqual(["due"]);
    expect(run(true)).toEqual(["due", "later"]);
  });

  it("treats a past retry time as due", () => {
    expect(isDue(item({ nextAttemptAt: "2026-10-11T07:59:59.000Z" }), now)).toBe(true);
    expect(isDue(item({ nextAttemptAt: "2026-10-11T08:00:01.000Z" }), now)).toBe(false);
  });

  it("finds the earliest retry time", () => {
    expect(nextWakeAt([item()])).toBeNull();
    expect(
      nextWakeAt([
        item({ nextAttemptAt: "2026-10-11T08:05:00.000Z" }),
        item({ nextAttemptAt: "2026-10-11T08:01:00.000Z" }),
      ]),
    ).toBe("2026-10-11T08:01:00.000Z");
  });
});

describe("classifyActionResult", () => {
  it("accepts successful results", () => {
    expect(classifyActionResult({ ok: true, data: {} })).toEqual({ type: "sent" });
  });

  it("treats a changed status as a conflict", () => {
    expect(classifyActionResult({ ok: false, error: "stale_status" })).toEqual({
      type: "conflict",
      code: "stale_status",
    });
    expect(classifyActionResult({ ok: false, error: "invalid_transition" }).type).toBe("conflict");
  });

  it("retries when the service is unavailable", () => {
    expect(classifyActionResult({ ok: false, error: "unavailable" })).toEqual({
      type: "retry",
      code: "unavailable",
    });
  });

  it("gives up on business rule refusals", () => {
    expect(classifyActionResult({ ok: false, error: "forbidden" })).toEqual({
      type: "rejected",
      code: "forbidden",
    });
    expect(classifyActionResult({ ok: false })).toEqual({ type: "rejected", code: "unknown" });
  });

  it("retries malformed responses", () => {
    expect(classifyActionResult(undefined).type).toBe("retry");
  });
});

describe("classifyError", () => {
  it("stops on a sign-in redirect", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    expect(isRedirectError(redirect)).toBe(true);
    expect(classifyError(redirect)).toEqual({ type: "auth", code: "unauthenticated" });
  });

  it("recognises network failures from every browser", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(
      true,
    );
    expect(isNetworkError(new TypeError("x is undefined"))).toBe(false);
    expect(classifyError(new TypeError("Failed to fetch"))).toEqual({
      type: "offline",
      code: "network",
    });
  });

  it("treats any failure while offline as a network problem", () => {
    expect(classifyError(new Error("boom"), false).type).toBe("offline");
    expect(classifyError(new Error("boom"), true)).toEqual({ type: "retry", code: "unexpected" });
  });

  it("treats a timeout as a network problem", () => {
    expect(classifyError(new OutboxTimeoutError(10))).toEqual({
      type: "offline",
      code: "timeout",
    });
  });
});

describe("withTimeout", () => {
  it("passes results through", async () => {
    await expect(withTimeout(Promise.resolve(5), 50)).resolves.toBe(5);
  });

  it("rejects slow promises", async () => {
    await expect(withTimeout(new Promise(() => undefined), 5)).rejects.toBeInstanceOf(
      OutboxTimeoutError,
    );
  });
});

describe("decideOutcome", () => {
  it("removes delivered actions", () => {
    expect(decideOutcome(item(), { type: "sent" }, now)).toMatchObject({
      remove: true,
      conflict: null,
      stop: null,
    });
  });

  it("drops conflicts and records them in the journal", () => {
    const decision = decideOutcome(
      item({ label: "№42" }),
      { type: "conflict", code: "stale_status" },
      now,
    );
    expect(decision.remove).toBe(true);
    expect(decision.stop).toBeNull();
    expect(decision.conflict).toMatchObject({
      id: "a1",
      action: "accept",
      label: "№42",
      reason: "stale_status",
      resolution: "server_wins",
      createdAt: "2026-10-11T07:59:00.000Z",
      detectedAt: now.toISOString(),
    });
  });

  it("journals refused actions", () => {
    const decision = decideOutcome(item(), { type: "rejected", code: "forbidden" }, now);
    expect(decision.conflict?.resolution).toBe("rejected");
  });

  it("backs off and blocks the order chain on transient failures", () => {
    const decision = decideOutcome(
      item({ attempts: 1 }),
      { type: "retry", code: "unavailable" },
      now,
      () => 0.5,
    );
    expect(decision).toMatchObject({
      remove: false,
      stop: "chain",
      changes: {
        status: "failed",
        attempts: 2,
        lastError: "unavailable",
        nextAttemptAt: new Date(now.getTime() + BACKOFF_BASE_MS * 2).toISOString(),
      },
    });
  });

  it("gives up after the last attempt", () => {
    const decision = decideOutcome(
      item({ attempts: MAX_ATTEMPTS - 1 }),
      { type: "retry", code: "unavailable" },
      now,
    );
    expect(decision.remove).toBe(true);
    expect(decision.conflict).toMatchObject({ resolution: "gave_up", attempts: MAX_ATTEMPTS });
  });

  it("stops everything when offline or signed out", () => {
    expect(decideOutcome(item(), { type: "offline", code: "network" }, now)).toMatchObject({
      remove: false,
      stop: "all",
      stopReason: "offline",
      changes: { status: "pending", lastError: "network" },
    });
    expect(decideOutcome(item(), { type: "auth", code: "unauthenticated" }, now).stopReason).toBe(
      "auth",
    );
  });
});
