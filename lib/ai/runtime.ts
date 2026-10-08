import type { AiFailure, AiFailureCode, AiTier, AiUsage } from "@/lib/ai/types";

export const DEFAULT_TIMEOUT_MS: Readonly<Record<AiTier, number>> = { smart: 25_000, fast: 10_000 };
export const DEFAULT_MAX_TOKENS: Readonly<Record<AiTier, number>> = { smart: 8_000, fast: 4_000 };
export const RETRY_DELAY_MS = 600;
export const MAX_RETRY_WAIT_MS = 5_000;
export const MAX_ERROR_MESSAGE_LENGTH = 500;

export const ZERO_USAGE: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export interface ClassifiedError {
  code: AiFailureCode;
  retryable: boolean;
  message: string;
  retryAfterMs?: number;
}

export function truncateMessage(message: string, limit = MAX_ERROR_MESSAGE_LENGTH): string {
  return message.length > limit ? `${message.slice(0, limit - 1)}…` : message;
}

export function failure(
  code: AiFailureCode,
  message: string,
  extra: { model?: string; usage?: AiUsage } = {},
): AiFailure {
  return {
    ok: false,
    error: code,
    message: truncateMessage(message),
    ...(extra.model !== undefined ? { model: extra.model } : {}),
    ...(extra.usage !== undefined ? { usage: extra.usage } : {}),
  };
}

export function disabledFailure(reason = "AI provider is not configured"): AiFailure {
  return failure("disabled", reason);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return typeof error === "string" ? error : "Unknown error";
}

export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

export function resolveTimeoutMs(
  tier: AiTier,
  requested: number | undefined,
  defaults = DEFAULT_TIMEOUT_MS,
): number {
  if (requested !== undefined && Number.isFinite(requested) && requested > 0) {
    return Math.round(requested);
  }
  return defaults[tier];
}

export interface RetryPolicy {
  timeoutMs: number;
  retryDelayMs?: number;
  maxRetries?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

export type AttemptResult<T> = { ok: true; value: T } | { ok: false; failure: AiFailure };

class DeadlineExceeded extends Error {
  constructor() {
    super("Deadline exceeded");
    this.name = "TimeoutError";
  }
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runWithRetry<T>(
  attempt: (signal: AbortSignal, remainingMs: number) => Promise<T>,
  classify: (error: unknown) => ClassifiedError,
  policy: RetryPolicy,
): Promise<AttemptResult<T>> {
  const now = policy.now ?? Date.now;
  const sleep = policy.sleep ?? abortableSleep;
  const maxRetries = policy.maxRetries ?? 1;
  const retryDelayMs = policy.retryDelayMs ?? RETRY_DELAY_MS;
  const startedAt = now();
  const deadline = startedAt + policy.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DeadlineExceeded()), policy.timeoutMs);
  const timeoutFailure = () => failure("timeout", `No response within ${policy.timeoutMs} ms`);

  try {
    for (let attemptIndex = 0; ; attemptIndex += 1) {
      try {
        const value = await attempt(controller.signal, Math.max(1, deadline - now()));
        return { ok: true, value };
      } catch (error) {
        if (controller.signal.aborted) {
          return { ok: false, failure: timeoutFailure() };
        }
        const classified = classify(error);
        if (!classified.retryable || attemptIndex >= maxRetries) {
          return { ok: false, failure: failure(classified.code, classified.message) };
        }
        const wait = classified.retryAfterMs ?? retryDelayMs;
        if (wait > MAX_RETRY_WAIT_MS || deadline - now() <= wait + 250) {
          return { ok: false, failure: failure(classified.code, classified.message) };
        }
        try {
          await sleep(wait, controller.signal);
        } catch {
          return { ok: false, failure: timeoutFailure() };
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
