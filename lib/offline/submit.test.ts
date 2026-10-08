import { describe, expect, it, vi } from "vitest";
import type { TransitionInput } from "@/lib/domain/work-order-schemas";
import {
  optimisticStatus,
  submitTransitionWith,
  type SubmitTransitionDeps,
} from "@/lib/offline/submit";

const orderId = "11111111-1111-4111-8111-111111111111";
const actionId = "99999999-9999-4999-8999-999999999999";
const deviceAt = "2026-10-11T08:00:00.000Z";

function deps(overrides: Partial<SubmitTransitionDeps> = {}) {
  const enqueued: { input: TransitionInput; label: string | null }[] = [];
  const sent: TransitionInput[] = [];
  const value: SubmitTransitionDeps = {
    canQueue: () => true,
    isOnline: () => true,
    hasPending: async () => false,
    send: async (input) => {
      sent.push(input);
      return { ok: true, data: { status: "accepted", nextOrderId: null } };
    },
    enqueue: async (input, label) => {
      enqueued.push({ input, label });
    },
    newId: () => actionId,
    now: () => new Date(deviceAt),
    timeoutMs: 50,
    ...overrides,
  };
  return { value, enqueued, sent };
}

const accept = { orderId, action: "accept", expectedStatus: "issued" } as const;

describe("submitTransitionWith", () => {
  it("calls the server directly when online", async () => {
    const { value, enqueued, sent } = deps();
    const result = await submitTransitionWith(value, accept);
    expect(result).toEqual({
      ok: true,
      data: { status: "accepted", nextOrderId: null, queued: false, clientActionId: actionId },
    });
    expect(sent[0]).toMatchObject({ clientActionId: actionId, deviceAt });
    expect(enqueued).toEqual([]);
  });

  it("queues with device time and an action id when offline", async () => {
    const send = vi.fn();
    const { value, enqueued } = deps({ isOnline: () => false, send });
    const result = await submitTransitionWith(value, accept, { label: "№42" });
    expect(result).toEqual({
      ok: true,
      data: { status: "accepted", nextOrderId: null, queued: true, clientActionId: actionId },
    });
    expect(send).not.toHaveBeenCalled();
    expect(enqueued).toEqual([
      {
        input: expect.objectContaining({ clientActionId: actionId, deviceAt, orderId }),
        label: "№42",
      },
    ]);
  });

  it("queues behind earlier actions for the same order", async () => {
    const send = vi.fn();
    const { value, enqueued } = deps({ hasPending: async (key) => key === orderId, send });
    const result = await submitTransitionWith(value, accept);
    expect(result.ok && result.data.queued).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(enqueued).toHaveLength(1);
  });

  it("queues the same action id after a network failure", async () => {
    const { value, enqueued } = deps({
      send: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const result = await submitTransitionWith(value, {
      ...accept,
      clientActionId: "88888888-8888-4888-8888-888888888888",
    });
    expect(result.ok && result.data).toMatchObject({
      queued: true,
      clientActionId: "88888888-8888-4888-8888-888888888888",
    });
    expect(enqueued[0]?.input.clientActionId).toBe("88888888-8888-4888-8888-888888888888");
  });

  it("queues when the server does not answer in time", async () => {
    const { value, enqueued } = deps({ send: () => new Promise(() => undefined), timeoutMs: 5 });
    const result = await submitTransitionWith(value, accept);
    expect(result.ok && result.data.queued).toBe(true);
    expect(enqueued).toHaveLength(1);
  });

  it("returns server refusals unchanged", async () => {
    const { value, enqueued } = deps({
      send: async () => ({ ok: false, error: "stale_status" }),
    });
    expect(await submitTransitionWith(value, accept)).toEqual({
      ok: false,
      error: "stale_status",
    });
    expect(enqueued).toEqual([]);
  });

  it("validates before sending or queueing", async () => {
    const send = vi.fn();
    const { value, enqueued } = deps({ send, isOnline: () => false });
    const result = await submitTransitionWith(value, {
      orderId,
      action: "pause",
      expectedStatus: "in_progress",
      reason: { reasonText: "" },
    });
    expect(result).toMatchObject({ ok: false, error: "validation" });
    expect(send).not.toHaveBeenCalled();
    expect(enqueued).toEqual([]);
  });

  it("lets sign-in redirects through", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    const { value } = deps({
      send: async () => {
        throw redirect;
      },
    });
    await expect(submitTransitionWith(value, accept)).rejects.toBe(redirect);
  });

  it("reports the failure when the outbox is not available", async () => {
    const { value, enqueued } = deps({
      canQueue: () => false,
      isOnline: () => false,
      send: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(await submitTransitionWith(value, accept)).toEqual({ ok: false, error: "unavailable" });
    expect(enqueued).toEqual([]);
  });
});

describe("optimisticStatus", () => {
  it("predicts the next status from the transition rules", () => {
    const base = { orderId, expectedStatus: "in_progress" as const };
    expect(
      optimisticStatus({ ...base, action: "pause", reason: { reasonText: "ждём кран" } }),
    ).toBe("paused");
    expect(optimisticStatus({ ...base, action: "comment", comment: "проверил" })).toBe(
      "in_progress",
    );
  });
});
