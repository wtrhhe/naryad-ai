import { errorMessage, failure } from "@/lib/ai/runtime";
import { buildUsageRow, cacheStorageKey, warnAi, type AiStore } from "@/lib/ai/usage";
import type {
  AiCallContext,
  AiFeature,
  AiJsonRequest,
  AiOutcome,
  AiProvider,
  AiTextRequest,
  AiTier,
  AiToolsRequest,
  AiToolsResponse,
} from "@/lib/ai/types";

export const DEFAULT_RATE_LIMITS: Readonly<Record<AiFeature, number>> = {
  order_suggestion: 60,
  order_review: 30,
  photo_vision: 30,
  lockout_vision: 30,
  rating_explanation: 30,
  shift_summary: 10,
  insight_text: 20,
  rca_draft: 10,
  acoustic_text: 20,
  assistant: 30,
  notification_text: 60,
};
export const RATE_WINDOW_SECONDS = 60;
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TelemetryOptions {
  store: AiStore;
  cache?: boolean;
  rateLimit?: boolean;
  rateLimits?: Partial<Record<AiFeature, number>>;
  cacheTtlMs?: number;
  now?: () => number;
  warn?: (scope: string, error: unknown) => void;
}

type CachedReader<T> = (value: unknown) => { ok: true; value: T } | { ok: false };

export function rateLimitBucket(feature: AiFeature): string {
  return `ai:${feature}`;
}

export function withTelemetry(provider: AiProvider, options: TelemetryOptions): AiProvider {
  const { store } = options;
  const now = options.now ?? Date.now;
  const warn = options.warn ?? warnAi;
  const cacheEnabled = options.cache ?? true;
  const rateLimitEnabled = options.rateLimit ?? true;
  const ttl = options.cacheTtlMs ?? CACHE_TTL_MS;
  const inflight = new Map<string, Promise<AiOutcome<unknown>>>();

  const modelOf = (tier: AiTier) => provider.modelFor?.(tier) ?? provider.name;

  async function guarded<T>(scope: string, action: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await action();
    } catch (error) {
      warn(scope, error);
      return fallback;
    }
  }

  async function log(
    request: AiCallContext & { tier: AiTier },
    outcome: AiOutcome<unknown>,
    startedAt: number,
  ): Promise<void> {
    await guarded(
      "usage log failed",
      () =>
        store.logUsage(
          buildUsageRow({
            feature: request.feature,
            provider: provider.name,
            model: modelOf(request.tier),
            workOrderId: request.workOrderId ?? null,
            cacheKey: request.cacheKey ?? null,
            durationMs: now() - startedAt,
            outcome,
          }),
        ),
      undefined,
    );
  }

  async function allowed(feature: AiFeature): Promise<boolean> {
    if (!rateLimitEnabled) {
      return true;
    }
    const limit = options.rateLimits?.[feature] ?? DEFAULT_RATE_LIMITS[feature];
    return guarded(
      "rate limit check failed",
      () => store.hitRateLimit(rateLimitBucket(feature), limit, RATE_WINDOW_SECONDS),
      true,
    );
  }

  async function execute<T>(
    request: AiCallContext & { tier: AiTier },
    call: () => Promise<AiOutcome<T>>,
    reader?: CachedReader<T>,
  ): Promise<AiOutcome<T>> {
    if (!provider.enabled) {
      return call();
    }
    const startedAt = now();
    const storageKey =
      cacheEnabled && reader && request.cacheKey
        ? cacheStorageKey(provider.name, modelOf(request.tier), request.feature, request.cacheKey)
        : null;

    if (storageKey && reader) {
      const hit = await guarded("cache read failed", () => store.readCache(storageKey, ttl), null);
      const parsed = hit ? reader(hit.value) : null;
      if (hit && parsed?.ok) {
        const outcome: AiOutcome<T> = {
          ok: true,
          value: parsed.value,
          model: hit.model,
          cached: true,
        };
        await log(request, outcome, startedAt);
        return outcome;
      }
      const pending = inflight.get(storageKey);
      if (pending) {
        return pending as Promise<AiOutcome<T>>;
      }
    }

    const run = async (): Promise<AiOutcome<T>> => {
      if (!(await allowed(request.feature))) {
        const limited = failure(
          "rate_limited",
          `Too many ${request.feature} calls, try again in a minute`,
          { model: modelOf(request.tier) },
        );
        await log(request, limited, startedAt);
        return limited;
      }
      let outcome: AiOutcome<T>;
      try {
        outcome = await call();
      } catch (error) {
        outcome = failure("provider_error", errorMessage(error), { model: modelOf(request.tier) });
      }
      const writes: Promise<unknown>[] = [log(request, outcome, startedAt)];
      if (storageKey && outcome.ok) {
        writes.push(
          guarded(
            "cache write failed",
            () =>
              store.writeCache({
                key: storageKey,
                feature: request.feature,
                value: outcome.value,
                model: outcome.model,
              }),
            undefined,
          ),
        );
      }
      await Promise.all(writes);
      return outcome;
    };

    const promise = run();
    if (storageKey) {
      inflight.set(storageKey, promise);
      void promise.finally(() => inflight.delete(storageKey));
    }
    return promise;
  }

  return {
    name: provider.name,
    get enabled() {
      return provider.enabled;
    },
    modelFor: (tier) => modelOf(tier),
    json<T>(request: AiJsonRequest<T>) {
      return execute<T>(
        request,
        () => provider.json(request),
        (value) => {
          const parsed = request.schema.safeParse(value);
          return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
        },
      );
    },
    text(request: AiTextRequest) {
      return execute<string>(
        request,
        () => provider.text(request),
        (value) => (typeof value === "string" ? { ok: true, value } : { ok: false }),
      );
    },
    tools(request: AiToolsRequest) {
      return execute<AiToolsResponse>(request, () => provider.tools(request));
    },
  };
}
