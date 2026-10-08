import { describe, expect, it, vi } from "vitest";
import {
  abortableSleep,
  disabledFailure,
  errorMessage,
  failure,
  parseRetryAfterMs,
  resolveTimeoutMs,
  runWithRetry,
  truncateMessage,
  type ClassifiedError,
} from "@/lib/ai/runtime";

const retryable: ClassifiedError = { code: "provider_error", retryable: true, message: "boom" };
const fatal: ClassifiedError = { code: "provider_error", retryable: false, message: "bad request" };

describe("failure helpers", () => {
  it("builds failures with optional details", () => {
    expect(failure("timeout", "slow")).toEqual({ ok: false, error: "timeout", message: "slow" });
    expect(
      failure("invalid_response", "x", {
        model: "m",
        usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }),
    ).toMatchObject({ model: "m", usage: { inputTokens: 1 } });
    expect(disabledFailure()).toMatchObject({ error: "disabled" });
  });

  it("truncates long messages", () => {
    expect(truncateMessage("abcdef", 4)).toBe("abc…");
    expect(truncateMessage("abc", 4)).toBe("abc");
    expect(failure("provider_error", "x".repeat(900)).message).toHaveLength(500);
  });

  it("extracts messages from anything thrown", () => {
    expect(errorMessage(new Error("e"))).toBe("e");
    expect(errorMessage(new TypeError(""))).toBe("TypeError");
    expect(errorMessage("text")).toBe("text");
    expect(errorMessage(42)).toBe("Unknown error");
  });
});

describe("parseRetryAfterMs", () => {
  it("parses seconds and HTTP dates", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
    expect(parseRetryAfterMs("0.5")).toBe(500);
    expect(parseRetryAfterMs(new Date(Date.now() + 60_000).toUTCString())).toBeGreaterThan(50_000);
    expect(parseRetryAfterMs(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it("ignores missing or broken values", () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("")).toBeUndefined();
    expect(parseRetryAfterMs("soon")).toBeUndefined();
  });
});

describe("resolveTimeoutMs", () => {
  it("uses tier defaults unless a positive value is requested", () => {
    expect(resolveTimeoutMs("smart", undefined)).toBe(25_000);
    expect(resolveTimeoutMs("fast", undefined)).toBe(10_000);
    expect(resolveTimeoutMs("fast", 1234.4)).toBe(1234);
    expect(resolveTimeoutMs("fast", 0)).toBe(10_000);
    expect(resolveTimeoutMs("smart", Number.NaN, { smart: 1, fast: 2 })).toBe(1);
  });
});

describe("runWithRetry", () => {
  const noSleep = async () => {};

  it("returns the first successful value", async () => {
    const attempt = vi.fn(async (_signal: AbortSignal, _remainingMs: number) => "ok");
    await expect(
      runWithRetry(attempt, () => fatal, { timeoutMs: 1000, sleep: noSleep }),
    ).resolves.toEqual({ ok: true, value: "ok" });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it("retries a retryable error once", async () => {
    const attempt = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce("second");
    const sleep = vi.fn(noSleep);
    const result = await runWithRetry(attempt, () => ({ ...retryable, retryAfterMs: 50 }), {
      timeoutMs: 5000,
      sleep,
    });
    expect(result).toEqual({ ok: true, value: "second" });
    expect(sleep).toHaveBeenCalledWith(50, expect.any(AbortSignal));
  });

  it("gives up after one retry", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("503");
    });
    const result = await runWithRetry(attempt, () => retryable, {
      timeoutMs: 5000,
      sleep: noSleep,
    });
    expect(result).toEqual({ ok: false, failure: failure("provider_error", "boom") });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry fatal errors", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("400");
    });
    const result = await runWithRetry(attempt, () => fatal, { timeoutMs: 5000, sleep: noSleep });
    expect(result.ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("skips the retry when the wait would not fit the deadline", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("429");
    });
    const result = await runWithRetry(
      attempt,
      () => ({ code: "rate_limited", retryable: true, message: "slow down", retryAfterMs: 4000 }),
      { timeoutMs: 3000, sleep: noSleep },
    );
    expect(result).toEqual({ ok: false, failure: failure("rate_limited", "slow down") });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout when the deadline aborts the attempt", async () => {
    const attempt = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const result = await runWithRetry(attempt, () => fatal, { timeoutMs: 20 });
    expect(result).toEqual({ ok: false, failure: failure("timeout", "No response within 20 ms") });
  });

  it("reports a timeout when the deadline hits during the back-off", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("503");
    });
    const result = await runWithRetry(attempt, () => ({ ...retryable, retryAfterMs: 10 }), {
      timeoutMs: 300,
      sleep: () => Promise.reject(new Error("aborted")),
    });
    expect(result).toEqual({ ok: false, failure: failure("timeout", "No response within 300 ms") });
  });
});

describe("abortableSleep", () => {
  it("resolves after the delay", async () => {
    await expect(abortableSleep(1, new AbortController().signal)).resolves.toBeUndefined();
  });

  it("rejects when aborted before or during the wait", async () => {
    const before = new AbortController();
    before.abort(new Error("stop"));
    await expect(abortableSleep(1000, before.signal)).rejects.toThrow("stop");
    const during = new AbortController();
    const pending = abortableSleep(1000, during.signal);
    during.abort(new Error("later"));
    await expect(pending).rejects.toThrow("later");
  });
});
