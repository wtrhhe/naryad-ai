import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { truncateMessage } from "@/lib/ai/runtime";
import type { AiFailure, AiFeature, AiOutcome, AiProviderName, AiUsage } from "@/lib/ai/types";

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface PriceRule {
  pattern: RegExp;
  price: ModelPrice;
  longPrompt?: { threshold: number; price: ModelPrice };
}

export const PRICE_TABLE: readonly PriceRule[] = [
  {
    pattern: /claude-(?:fable|mythos)-5-1/,
    price: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  },
  {
    pattern: /claude-(?:fable|mythos)/,
    price: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  },
  { pattern: /claude-opus-5-5/, price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } },
  {
    pattern: /claude-opus-(?:5|4-[5-9])(?!\d)/,
    price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  },
  { pattern: /claude-opus/, price: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 } },
  { pattern: /claude-sonnet-5/, price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
  { pattern: /claude-sonnet/, price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  {
    pattern: /claude-haiku-5/,
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    longPrompt: {
      threshold: 100_000,
      price: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
    },
  },
  { pattern: /claude-haiku/, price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } },
];

export function priceForModel(model: string, promptTokens = 0): ModelPrice | null {
  const rule = PRICE_TABLE.find((entry) => entry.pattern.test(model));
  if (!rule) {
    return null;
  }
  return rule.longPrompt && promptTokens > rule.longPrompt.threshold
    ? rule.longPrompt.price
    : rule.price;
}

export function computeCostUsd(model: string, usage: AiUsage | undefined): number {
  if (!usage) {
    return 0;
  }
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const price = priceForModel(model, promptTokens);
  if (!price) {
    return 0;
  }
  const cost =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => (entry === undefined ? "null" : stableStringify(entry))).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function aiCacheKey(feature: AiFeature, input: unknown): string {
  return `${feature}:${sha256(stableStringify(input)).slice(0, 40)}`;
}

const MAX_PLAIN_KEY_LENGTH = 160;

export function cacheStorageKey(
  provider: AiProviderName,
  model: string,
  feature: AiFeature,
  cacheKey: string,
): string {
  const key = cacheKey.length > MAX_PLAIN_KEY_LENGTH ? sha256(cacheKey) : cacheKey;
  return `${provider}:${model}:${feature}:${key}`;
}

export interface AiUsageRow {
  feature: AiFeature;
  provider: AiProviderName;
  model: string;
  workOrderId: string | null;
  cacheKey: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  durationMs: number;
  success: boolean;
  error: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export interface UsageRowInput {
  feature: AiFeature;
  provider: AiProviderName;
  model: string;
  workOrderId?: string | null;
  cacheKey?: string | null;
  durationMs: number;
  outcome: AiOutcome<unknown> | AiFailure;
}

export function buildUsageRow(input: UsageRowInput): AiUsageRow {
  const { outcome } = input;
  const model = outcome.model || input.model;
  const usage = outcome.ok && outcome.cached ? undefined : outcome.usage;
  const workOrderId =
    input.workOrderId && UUID_PATTERN.test(input.workOrderId) ? input.workOrderId : null;
  return {
    feature: input.feature,
    provider: input.provider,
    model,
    workOrderId,
    cacheKey: input.cacheKey ?? null,
    inputTokens: count((usage?.inputTokens ?? 0) + (usage?.cacheWriteTokens ?? 0)),
    outputTokens: count(usage?.outputTokens ?? 0),
    cacheReadTokens: count(usage?.cacheReadTokens ?? 0),
    costUsd: computeCostUsd(model, usage),
    durationMs: count(input.durationMs),
    success: outcome.ok,
    error: outcome.ok ? null : truncateMessage(`${outcome.error}: ${outcome.message}`),
  };
}

export interface AiCacheEntry {
  value: unknown;
  model: string;
}

export interface AiCacheWrite {
  key: string;
  feature: AiFeature;
  value: unknown;
  model: string;
}

export interface AiStore {
  logUsage(row: AiUsageRow): Promise<void>;
  readCache(key: string, maxAgeMs: number): Promise<AiCacheEntry | null>;
  writeCache(entry: AiCacheWrite): Promise<void>;
  hitRateLimit(bucket: string, maxHits: number, windowSeconds: number): Promise<boolean>;
}

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

async function loadAdminClient(): Promise<AdminClient> {
  const { getSupabaseAdminClient } = await import("@/lib/supabase/admin");
  return getSupabaseAdminClient();
}

function usageInsert(row: AiUsageRow, workOrderId: string | null) {
  return {
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    work_order_id: workOrderId,
    cache_key: row.cacheKey,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    cache_read_tokens: row.cacheReadTokens,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    success: row.success,
    error: row.error,
  };
}

const FOREIGN_KEY_VIOLATION = "23503";

export function warnAi(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[ai] ${scope}: ${message}`);
}

export function createSupabaseAiStore(
  loadClient: () => Promise<AdminClient> = loadAdminClient,
): AiStore {
  const untyped = async () => (await loadClient()) as unknown as SupabaseClient;
  return {
    async logUsage(row) {
      try {
        const client = await loadClient();
        const first = await client.from("ai_usage").insert(usageInsert(row, row.workOrderId));
        if (first.error?.code === FOREIGN_KEY_VIOLATION && row.workOrderId) {
          const retry = await client.from("ai_usage").insert(usageInsert(row, null));
          if (retry.error) {
            throw new Error(retry.error.message);
          }
          return;
        }
        if (first.error) {
          throw new Error(first.error.message);
        }
      } catch (error) {
        warnAi("usage log failed", error);
      }
    },
    async readCache(key, maxAgeMs) {
      const since = new Date(Date.now() - maxAgeMs).toISOString();
      const { data, error } = await (
        await untyped()
      )
        .from("ai_cache")
        .select("value, model")
        .eq("cache_key", key)
        .gte("created_at", since)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      const row = data as { value: unknown; model: string } | null;
      return row ? { value: row.value, model: row.model } : null;
    },
    async writeCache(entry) {
      const { error } = await (await untyped()).from("ai_cache").upsert(
        {
          cache_key: entry.key,
          feature: entry.feature,
          value: entry.value,
          model: entry.model,
          created_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" },
      );
      if (error) {
        throw new Error(error.message);
      }
    },
    async hitRateLimit(bucket, maxHits, windowSeconds) {
      const client = await loadClient();
      const { data, error } = await client.rpc("hit_rate_limit", {
        bucket,
        max_hits: maxHits,
        window_seconds: windowSeconds,
      });
      if (error) {
        throw new Error(error.message);
      }
      return data !== false;
    },
  };
}
