import { describe, expect, it } from "vitest";
import {
  askClientToFlush,
  flushReply,
  isFlushRequest,
  OUTBOX_FLUSH_REQUEST,
  readRemaining,
  requestClientFlush,
  type FlushTarget,
} from "@/lib/offline/sw-sync";

function replying(remaining: number | null): FlushTarget {
  return {
    postMessage(message, transfer) {
      expect(isFlushRequest(message)).toBe(true);
      const port = transfer[0] as MessagePort;
      if (remaining !== null) {
        port.postMessage(flushReply(remaining));
      }
    },
  };
}

describe("flush messages", () => {
  it("recognises flush requests", () => {
    expect(isFlushRequest({ type: OUTBOX_FLUSH_REQUEST })).toBe(true);
    expect(isFlushRequest({ type: "other" })).toBe(false);
    expect(isFlushRequest(null)).toBe(false);
  });

  it("reads the remaining count from replies", () => {
    expect(readRemaining(flushReply(3))).toBe(3);
    expect(readRemaining({ type: "other", remaining: 3 })).toBeNull();
    expect(readRemaining(flushReply(-1))).toBeNull();
    expect(readRemaining("x")).toBeNull();
  });
});

describe("requestClientFlush", () => {
  it("resolves when a window emptied the outbox", async () => {
    await expect(requestClientFlush([replying(2), replying(0)], 200)).resolves.toBeUndefined();
  });

  it("asks the browser to retry when actions are still waiting", async () => {
    await expect(requestClientFlush([replying(1)], 200)).rejects.toThrow();
  });

  it("asks the browser to retry when no window is open", async () => {
    await expect(requestClientFlush([], 200)).rejects.toThrow();
  });

  it("gives up waiting for a silent window", async () => {
    await expect(askClientToFlush(replying(null), 10)).resolves.toBeNull();
  });
});
