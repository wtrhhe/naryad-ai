import { describe, expect, it, vi } from "vitest";
import {
  aiCacheKey,
  buildUsageRow,
  cacheStorageKey,
  computeCostUsd,
  createSupabaseAiStore,
  priceForModel,
  stableStringify,
  type AiUsageRow,
} from "@/lib/ai/usage";
import type { AiUsage } from "@/lib/ai/types";

const usage = (partial: Partial<AiUsage>): AiUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...partial,
});

const WORK_ORDER_ID = "0d4b6c1e-8f0a-4c51-9a55-6f7d2f3b9c10";

describe("pricing", () => {
  it("resolves model families", () => {
    expect(priceForModel("claude-sonnet-5-5")?.input).toBe(2);
    expect(priceForModel("claude-sonnet-5")?.output).toBe(10);
    expect(priceForModel("claude-sonnet-4-6")?.input).toBe(3);
    expect(priceForModel("claude-haiku-5-5")?.input).toBe(0.1);
    expect(priceForModel("claude-haiku-4-5")?.input).toBe(1);
    expect(priceForModel("claude-opus-5-5")?.input).toBe(4);
    expect(priceForModel("claude-opus-5")?.input).toBe(5);
    expect(priceForModel("claude-opus-4-8")?.input).toBe(5);
    expect(priceForModel("claude-opus-4-1")?.input).toBe(15);
    expect(priceForModel("claude-fable-5-1")?.cacheRead).toBe(0.25);
    expect(priceForModel("claude-fable-5")?.cacheRead).toBe(1);
    expect(priceForModel("anthropic.claude-mythos-5-1")?.input).toBe(10);
    expect(priceForModel("qwen2.5vl:7b")).toBeNull();
    expect(priceForModel("mock-fast")).toBeNull();
  });

  it("switches Haiku 5.5 to the long prompt rate card", () => {
    expect(priceForModel("claude-haiku-5-5", 100_000)?.input).toBe(0.1);
    expect(priceForModel("claude-haiku-5-5", 100_001)?.input).toBe(0.5);
  });

  it("computes cost from all token kinds", () => {
    expect(
      computeCostUsd(
        "claude-sonnet-5-5",
        usage({
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 2000,
          cacheWriteTokens: 100,
        }),
      ),
    ).toBe(0.00765);
    expect(
      computeCostUsd("claude-haiku-5-5", usage({ inputTokens: 150_000, outputTokens: 1000 })),
    ).toBe(0.0775);
    expect(computeCostUsd("claude-haiku-5-5", usage({ inputTokens: 3, outputTokens: 1 }))).toBe(
      0.000001,
    );
  });

  it("is free for local and unknown models and missing usage", () => {
    expect(computeCostUsd("qwen2.5vl:7b", usage({ inputTokens: 10_000 }))).toBe(0);
    expect(computeCostUsd("claude-sonnet-5-5", undefined)).toBe(0);
  });
});

describe("cache keys", () => {
  it("serialises objects with sorted keys", () => {
    expect(stableStringify({ b: 1, a: [1, { d: undefined, c: "x" }], e: undefined })).toBe(
      '{"a":[1,{"c":"x"}],"b":1}',
    );
    expect(stableStringify([undefined, null])).toBe("[null,null]");
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify("строка")).toBe('"строка"');
  });

  it("hashes the input independent of key order", () => {
    const first = aiCacheKey("order_review", { order: WORK_ORDER_ID, revision: 3 });
    const second = aiCacheKey("order_review", { revision: 3, order: WORK_ORDER_ID });
    expect(first).toBe(second);
    expect(first).toMatch(/^order_review:[0-9a-f]{40}$/);
    expect(aiCacheKey("order_review", { order: WORK_ORDER_ID, revision: 4 })).not.toBe(first);
    expect(aiCacheKey("photo_vision", { order: WORK_ORDER_ID, revision: 3 })).not.toBe(first);
  });

  it("scopes stored keys by provider and model and hashes long keys", () => {
    expect(cacheStorageKey("claude", "claude-haiku-5-5", "order_suggestion", "abc")).toBe(
      "claude:claude-haiku-5-5:order_suggestion:abc",
    );
    const long = cacheStorageKey("mock", "mock-fast", "order_suggestion", "x".repeat(500));
    expect(long).toMatch(/^mock:mock-fast:order_suggestion:[0-9a-f]{64}$/);
  });
});

describe("buildUsageRow", () => {
  it("records successful calls with cost", () => {
    const row = buildUsageRow({
      feature: "order_review",
      provider: "claude",
      model: "claude-sonnet-5-5",
      workOrderId: WORK_ORDER_ID,
      cacheKey: "order_review:abc",
      durationMs: 1234.4,
      outcome: {
        ok: true,
        value: {},
        model: "claude-sonnet-5-5",
        cached: false,
        usage: usage({ inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 100 }),
      },
    });
    expect(row).toEqual<AiUsageRow>({
      feature: "order_review",
      provider: "claude",
      model: "claude-sonnet-5-5",
      workOrderId: WORK_ORDER_ID,
      cacheKey: "order_review:abc",
      inputTokens: 1100,
      outputTokens: 500,
      cacheReadTokens: 0,
      costUsd: 0.00725,
      durationMs: 1234,
      success: true,
      error: null,
    });
  });

  it("records failures with the error code and the requested model", () => {
    const row = buildUsageRow({
      feature: "photo_vision",
      provider: "ollama",
      model: "qwen2.5vl:7b",
      durationMs: -5,
      outcome: { ok: false, error: "timeout", message: "No response within 25000 ms" },
    });
    expect(row).toMatchObject({
      model: "qwen2.5vl:7b",
      success: false,
      error: "timeout: No response within 25000 ms",
      durationMs: 0,
      workOrderId: null,
      cacheKey: null,
      costUsd: 0,
    });
  });

  it("does not charge cache hits and drops invalid work order ids", () => {
    const row = buildUsageRow({
      feature: "order_suggestion",
      provider: "claude",
      model: "claude-haiku-5-5",
      workOrderId: "not-a-uuid",
      durationMs: 3,
      outcome: {
        ok: true,
        value: {},
        model: "claude-haiku-5-5",
        cached: true,
        usage: usage({ inputTokens: 999 }),
      },
    });
    expect(row).toMatchObject({ inputTokens: 0, costUsd: 0, workOrderId: null, success: true });
  });
});

function row(partial: Partial<AiUsageRow> = {}): AiUsageRow {
  return {
    feature: "order_review",
    provider: "claude",
    model: "claude-sonnet-5-5",
    workOrderId: WORK_ORDER_ID,
    cacheKey: null,
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 3,
    costUsd: 0.5,
    durationMs: 10,
    success: true,
    error: null,
    ...partial,
  };
}

function fakeClient(results: {
  insert?: { error: { code?: string; message: string } | null }[];
  select?: { data: unknown; error: { message: string } | null };
  upsert?: { error: { message: string } | null };
  rpc?: { data: unknown; error: { message: string } | null };
}) {
  const insert = vi.fn(async () => results.insert?.shift() ?? { error: null });
  const maybeSingle = vi.fn(async () => results.select ?? { data: null, error: null });
  const gte = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn(async () => results.upsert ?? { error: null });
  const from = vi.fn(() => ({ insert, select, upsert }));
  const rpc = vi.fn(async () => results.rpc ?? { data: true, error: null });
  const client = { from, rpc };
  return { client, from, insert, select, eq, gte, upsert, rpc };
}

function storeFor(fake: ReturnType<typeof fakeClient>) {
  return createSupabaseAiStore(async () => fake.client as never);
}

describe("createSupabaseAiStore", () => {
  it("inserts usage rows in database shape", async () => {
    const fake = fakeClient({});
    await storeFor(fake).logUsage(row());
    expect(fake.from).toHaveBeenCalledWith("ai_usage");
    expect(fake.insert).toHaveBeenCalledWith({
      feature: "order_review",
      provider: "claude",
      model: "claude-sonnet-5-5",
      work_order_id: WORK_ORDER_ID,
      cache_key: null,
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 3,
      cost_usd: 0.5,
      duration_ms: 10,
      success: true,
      error: null,
    });
  });

  it("retries without the work order when it no longer exists", async () => {
    const fake = fakeClient({ insert: [{ error: { code: "23503", message: "fk" } }] });
    await storeFor(fake).logUsage(row());
    expect(fake.insert).toHaveBeenCalledTimes(2);
    expect(fake.insert.mock.calls[1]).toEqual([expect.objectContaining({ work_order_id: null })]);
  });

  it("never throws from usage logging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = fakeClient({ insert: [{ error: { message: "down" } }] });
    await expect(storeFor(failing).logUsage(row())).resolves.toBeUndefined();
    const failingRetry = fakeClient({
      insert: [{ error: { code: "23503", message: "fk" } }, { error: { message: "still down" } }],
    });
    await expect(storeFor(failingRetry).logUsage(row())).resolves.toBeUndefined();
    const broken = createSupabaseAiStore(async () => {
      throw new Error("no client");
    });
    await expect(broken.logUsage(row())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0]?.[0]).toBe("[ai] usage log failed: down");
    warn.mockRestore();
  });

  it("reads fresh cache entries only", async () => {
    const fake = fakeClient({ select: { data: { value: { a: 1 }, model: "m" }, error: null } });
    const before = Date.now();
    await expect(storeFor(fake).readCache("k", 60_000)).resolves.toEqual({
      value: { a: 1 },
      model: "m",
    });
    expect(fake.from).toHaveBeenCalledWith("ai_cache");
    expect(fake.select).toHaveBeenCalledWith("value, model");
    expect(fake.eq).toHaveBeenCalledWith("cache_key", "k");
    const since = Date.parse((fake.gte.mock.calls[0] as unknown as [string, string])[1]);
    expect(since).toBeGreaterThanOrEqual(before - 60_000 - 5);
    expect(since).toBeLessThanOrEqual(Date.now() - 60_000 + 5);
  });

  it("returns null on a cache miss and throws on read errors", async () => {
    await expect(storeFor(fakeClient({})).readCache("k", 1)).resolves.toBeNull();
    await expect(
      storeFor(fakeClient({ select: { data: null, error: { message: "boom" } } })).readCache(
        "k",
        1,
      ),
    ).rejects.toThrow("boom");
  });

  it("upserts cache entries", async () => {
    const fake = fakeClient({});
    await storeFor(fake).writeCache({ key: "k", feature: "order_review", value: [1], model: "m" });
    expect(fake.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ cache_key: "k", feature: "order_review", value: [1], model: "m" }),
      { onConflict: "cache_key" },
    );
    await expect(
      storeFor(fakeClient({ upsert: { error: { message: "denied" } } })).writeCache({
        key: "k",
        feature: "order_review",
        value: 1,
        model: "m",
      }),
    ).rejects.toThrow("denied");
  });

  it("checks the shared rate limiter", async () => {
    const fake = fakeClient({ rpc: { data: false, error: null } });
    await expect(storeFor(fake).hitRateLimit("ai:order_review", 30, 60)).resolves.toBe(false);
    expect(fake.rpc).toHaveBeenCalledWith("hit_rate_limit", {
      bucket: "ai:order_review",
      max_hits: 30,
      window_seconds: 60,
    });
    await expect(storeFor(fakeClient({})).hitRateLimit("b", 1, 60)).resolves.toBe(true);
    await expect(
      storeFor(fakeClient({ rpc: { data: null, error: { message: "rpc down" } } })).hitRateLimit(
        "b",
        1,
        60,
      ),
    ).rejects.toThrow("rpc down");
  });
});
