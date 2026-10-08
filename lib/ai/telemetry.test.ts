import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MockProvider } from "@/lib/ai/mock";
import { CACHE_TTL_MS, rateLimitBucket, withTelemetry } from "@/lib/ai/telemetry";
import type { AiCacheEntry, AiStore, AiUsageRow } from "@/lib/ai/usage";
import type { AiJsonRequest, AiOutcome, AiProvider } from "@/lib/ai/types";

function memoryStore(overrides: Partial<AiStore> = {}) {
  const rows: AiUsageRow[] = [];
  const cache = new Map<string, AiCacheEntry>();
  const hits = new Map<string, number>();
  const store: AiStore = {
    logUsage: vi.fn(async (row: AiUsageRow) => {
      rows.push(row);
    }),
    readCache: vi.fn(async (key: string) => cache.get(key) ?? null),
    writeCache: vi.fn(async (entry) => {
      cache.set(entry.key, { value: entry.value, model: entry.model });
    }),
    hitRateLimit: vi.fn(async (bucket: string, maxHits: number) => {
      const next = (hits.get(bucket) ?? 0) + 1;
      hits.set(bucket, next);
      return next <= maxHits;
    }),
    ...overrides,
  };
  return { store, rows, cache };
}

const schema = z.object({ verdict: z.enum(["ok", "bad"]) });
const request: AiJsonRequest<z.infer<typeof schema>> = {
  feature: "order_review",
  tier: "smart",
  system: "s",
  prompt: "p",
  schema,
  workOrderId: "0d4b6c1e-8f0a-4c51-9a55-6f7d2f3b9c10",
  cacheKey: "order_review:rev-1",
};

function countingProvider(
  outcome: AiOutcome<unknown> = {
    ok: true,
    value: { verdict: "ok" },
    model: "claude-sonnet-5-5",
    cached: false,
    usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
  },
) {
  const json = vi.fn(async () => outcome);
  const text = vi.fn(async (): Promise<AiOutcome<string>> => ({
    ok: true,
    value: "Итог",
    model: "claude-haiku-5-5",
    cached: false,
  }));
  const tools = vi.fn(async () => ({
    ok: true as const,
    value: { text: "", toolCalls: [], stopReason: "end" as const },
    model: "claude-sonnet-5-5",
    cached: false,
  }));
  const provider: AiProvider = {
    name: "claude",
    enabled: true,
    modelFor: (tier) => (tier === "smart" ? "claude-sonnet-5-5" : "claude-haiku-5-5"),
    json: json as AiProvider["json"],
    text,
    tools,
  };
  return { provider, json, text, tools };
}

describe("withTelemetry", () => {
  it("logs every call with cost and duration", async () => {
    const { store, rows } = memoryStore();
    const { provider } = countingProvider();
    let clock = 1000;
    const wrapped = withTelemetry(provider, { store, now: () => (clock += 250) });
    const outcome = await wrapped.json({ ...request, cacheKey: undefined });
    expect(outcome).toMatchObject({ ok: true, value: { verdict: "ok" } });
    expect(rows).toEqual([
      expect.objectContaining({
        feature: "order_review",
        provider: "claude",
        model: "claude-sonnet-5-5",
        workOrderId: request.workOrderId,
        inputTokens: 1000,
        costUsd: 0.003,
        durationMs: 250,
        success: true,
      }),
    ]);
    expect(store.readCache).not.toHaveBeenCalled();
  });

  it("serves repeated calls with the same cache key from the cache", async () => {
    const { store, rows, cache } = memoryStore();
    const { provider, json } = countingProvider();
    const wrapped = withTelemetry(provider, { store });
    await wrapped.json(request);
    const second = await wrapped.json(request);
    expect(json).toHaveBeenCalledTimes(1);
    expect(second).toEqual({
      ok: true,
      value: { verdict: "ok" },
      model: "claude-sonnet-5-5",
      cached: true,
    });
    expect([...cache.keys()]).toEqual(["claude:claude-sonnet-5-5:order_review:order_review:rev-1"]);
    expect(store.readCache).toHaveBeenCalledWith(expect.any(String), CACHE_TTL_MS);
    expect(rows.map((row) => [row.success, row.costUsd, row.cacheKey])).toEqual([
      [true, 0.003, "order_review:rev-1"],
      [true, 0, "order_review:rev-1"],
    ]);
  });

  it("ignores cached values that no longer match the schema", async () => {
    const { store, cache } = memoryStore();
    cache.set("claude:claude-sonnet-5-5:order_review:order_review:rev-1", {
      value: { verdict: "legacy" },
      model: "old",
    });
    const { provider, json } = countingProvider();
    const outcome = await withTelemetry(provider, { store }).json(request);
    expect(json).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ cached: false });
  });

  it("shares one in-flight call between concurrent identical requests", async () => {
    const { store } = memoryStore();
    let release: (value: AiOutcome<unknown>) => void = () => {};
    const json = vi.fn(
      () =>
        new Promise<AiOutcome<unknown>>((resolve) => {
          release = resolve;
        }),
    );
    const provider: AiProvider = {
      ...countingProvider().provider,
      json: json as AiProvider["json"],
    };
    const wrapped = withTelemetry(provider, { store });
    const first = wrapped.json(request);
    const second = wrapped.json(request);
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    release({ ok: true, value: { verdict: "bad" }, model: "m", cached: false });
    await expect(first).resolves.toMatchObject({ value: { verdict: "bad" } });
    await expect(second).resolves.toMatchObject({ value: { verdict: "bad" } });
    expect(json).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const { store } = memoryStore();
    const { provider, json } = countingProvider({
      ok: false,
      error: "invalid_response",
      message: "bad json",
      model: "claude-sonnet-5-5",
    });
    const wrapped = withTelemetry(provider, { store });
    await wrapped.json(request);
    await wrapped.json(request);
    expect(json).toHaveBeenCalledTimes(2);
    expect(store.writeCache).not.toHaveBeenCalled();
  });

  it("caches text answers", async () => {
    const { store } = memoryStore();
    const { provider, text } = countingProvider();
    const wrapped = withTelemetry(provider, { store });
    const textRequest = {
      feature: "rating_explanation" as const,
      tier: "fast" as const,
      system: "",
      prompt: "",
      cacheKey: "rating:1",
    };
    await wrapped.text(textRequest);
    await expect(wrapped.text(textRequest)).resolves.toMatchObject({ value: "Итог", cached: true });
    expect(text).toHaveBeenCalledTimes(1);
  });

  it("rejects calls over the per-feature limit and logs them", async () => {
    const { store, rows } = memoryStore();
    const { provider, json } = countingProvider();
    const wrapped = withTelemetry(provider, { store, rateLimits: { order_review: 1 } });
    const uncached = { ...request, cacheKey: undefined };
    await wrapped.json(uncached);
    const limited = await wrapped.json(uncached);
    expect(limited).toMatchObject({ ok: false, error: "rate_limited" });
    expect(json).toHaveBeenCalledTimes(1);
    expect(store.hitRateLimit).toHaveBeenCalledWith(rateLimitBucket("order_review"), 1, 60);
    expect(rows.at(-1)).toMatchObject({
      success: false,
      error: expect.stringMatching(/^rate_limited/),
    });
  });

  it("uses the default per-feature limits and can skip the guard", async () => {
    const { store } = memoryStore();
    const { provider } = countingProvider();
    await withTelemetry(provider, { store }).tools({
      feature: "assistant",
      tier: "smart",
      system: "",
      messages: [{ role: "user", content: "?" }],
      tools: [],
    });
    expect(store.hitRateLimit).toHaveBeenCalledWith("ai:assistant", 30, 60);
    const quiet = memoryStore();
    await withTelemetry(provider, { store: quiet.store, rateLimit: false }).text({
      feature: "assistant",
      tier: "smart",
      system: "",
      prompt: "",
    });
    expect(quiet.store.hitRateLimit).not.toHaveBeenCalled();
  });

  it("can turn the response cache off", async () => {
    const { store } = memoryStore();
    const { provider, json } = countingProvider();
    const wrapped = withTelemetry(provider, { store, cache: false });
    await wrapped.json(request);
    await wrapped.json(request);
    expect(json).toHaveBeenCalledTimes(2);
    expect(store.readCache).not.toHaveBeenCalled();
  });

  it("keeps working when every store operation fails", async () => {
    const fail = async () => {
      throw new Error("db down");
    };
    const { store } = memoryStore({
      logUsage: vi.fn(fail),
      readCache: vi.fn(fail),
      writeCache: vi.fn(fail),
      hitRateLimit: vi.fn(fail),
    });
    const warn = vi.fn();
    const { provider } = countingProvider();
    const outcome = await withTelemetry(provider, { store, warn }).json(request);
    expect(outcome).toMatchObject({ ok: true });
    expect(warn.mock.calls.map(([scope]) => scope)).toEqual([
      "cache read failed",
      "rate limit check failed",
      "usage log failed",
      "cache write failed",
    ]);
  });

  it("converts a throwing provider into a provider error", async () => {
    const { store, rows } = memoryStore();
    const provider: AiProvider = {
      ...countingProvider().provider,
      json: vi.fn(async () => {
        throw new Error("unexpected");
      }),
    };
    await expect(
      withTelemetry(provider, { store }).json({ ...request, cacheKey: undefined }),
    ).resolves.toMatchObject({ ok: false, error: "provider_error", message: "unexpected" });
    expect(rows[0]).toMatchObject({ success: false, model: "claude-sonnet-5-5" });
  });

  it("passes disabled providers through without logging", async () => {
    const { store } = memoryStore();
    const json = vi.fn(async () => ({
      ok: false as const,
      error: "disabled" as const,
      message: "off",
    }));
    const provider: AiProvider = { ...countingProvider().provider, enabled: false, json };
    const wrapped = withTelemetry(provider, { store });
    expect(wrapped.enabled).toBe(false);
    await expect(wrapped.json(request)).resolves.toMatchObject({ error: "disabled" });
    expect(store.logUsage).not.toHaveBeenCalled();
  });

  it("keeps the provider identity and falls back to its name as model", async () => {
    const { store, rows } = memoryStore();
    const bare: AiProvider = {
      name: "ollama",
      enabled: true,
      json: vi.fn(async () => ({ ok: false as const, error: "timeout" as const, message: "slow" })),
      text: vi.fn(),
      tools: vi.fn(),
    };
    const wrapped = withTelemetry(bare, { store });
    expect(wrapped.name).toBe("ollama");
    expect(wrapped.modelFor?.("fast")).toBe("ollama");
    await wrapped.json({ ...request, cacheKey: undefined });
    expect(rows[0]).toMatchObject({ provider: "ollama", model: "ollama", error: "timeout: slow" });
  });

  it("wraps the mock provider end to end", async () => {
    const { store, rows } = memoryStore();
    const wrapped = withTelemetry(new MockProvider(), { store, cache: false, rateLimit: false });
    await expect(wrapped.json({ ...request, cacheKey: undefined })).resolves.toMatchObject({
      ok: true,
      value: { verdict: "ok" },
      model: "mock-smart",
    });
    expect(rows[0]).toMatchObject({ provider: "mock", model: "mock-smart", costUsd: 0 });
  });
});
