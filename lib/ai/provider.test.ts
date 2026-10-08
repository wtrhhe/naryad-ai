import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClaudeProvider } from "@/lib/ai/claude";
import { MockProvider } from "@/lib/ai/mock";
import { OllamaProvider } from "@/lib/ai/ollama";
import {
  createAiProvider,
  createBaseProvider,
  disabledProvider,
  getAiProvider,
} from "@/lib/ai/provider";
import type { AiStore } from "@/lib/ai/usage";
import { parseAiEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function memoryStore(): AiStore {
  return {
    logUsage: vi.fn(async () => {}),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => {}),
    hitRateLimit: vi.fn(async () => true),
  };
}

describe("disabledProvider", () => {
  it("answers every call with a disabled failure", async () => {
    expect(disabledProvider.enabled).toBe(false);
    await expect(
      disabledProvider.json({
        feature: "order_review",
        tier: "smart",
        system: "",
        prompt: "",
        schema: z.string(),
      }),
    ).resolves.toMatchObject({ ok: false, error: "disabled" });
    await expect(
      disabledProvider.text({ feature: "shift_summary", tier: "fast", system: "", prompt: "" }),
    ).resolves.toMatchObject({ error: "disabled" });
    await expect(
      disabledProvider.tools({
        feature: "assistant",
        tier: "fast",
        system: "",
        messages: [],
        tools: [],
      }),
    ).resolves.toMatchObject({ error: "disabled" });
  });
});

describe("createBaseProvider", () => {
  it("builds the provider named by AI_PROVIDER", () => {
    expect(createBaseProvider(parseAiEnv({ AI_PROVIDER: "mock" }))).toBeInstanceOf(MockProvider);
    const ollama = createBaseProvider(
      parseAiEnv({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "llava:13b" }),
    );
    expect(ollama).toBeInstanceOf(OllamaProvider);
    expect(ollama.modelFor?.("smart")).toBe("llava:13b");
    const claude = createBaseProvider(
      parseAiEnv({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_MODEL_FAST: "claude-haiku-4-5" }),
    );
    expect(claude).toBeInstanceOf(ClaudeProvider);
    expect(claude.enabled).toBe(true);
    expect(claude.modelFor?.("fast")).toBe("claude-haiku-4-5");
    expect(claude.modelFor?.("smart")).toBe("claude-sonnet-5-5");
  });

  it("leaves Claude disabled without a key", () => {
    expect(createBaseProvider(parseAiEnv({})).enabled).toBe(false);
  });
});

describe("createAiProvider", () => {
  it("returns a disabled provider untouched", async () => {
    const store = memoryStore();
    const provider = createAiProvider(parseAiEnv({}), { store });
    expect(provider.enabled).toBe(false);
    expect(provider.name).toBe("claude");
    await provider.text({ feature: "shift_summary", tier: "fast", system: "", prompt: "" });
    expect(store.logUsage).not.toHaveBeenCalled();
  });

  it("logs mock calls without cache or rate limits", async () => {
    const store = memoryStore();
    const provider = createAiProvider(parseAiEnv({ AI_PROVIDER: "mock" }), { store });
    expect(provider.name).toBe("mock");
    await provider.json({
      feature: "order_review",
      tier: "smart",
      system: "",
      prompt: "",
      schema: z.object({ ok: z.boolean() }),
      cacheKey: "k",
    });
    expect(store.logUsage).toHaveBeenCalledTimes(1);
    expect(store.readCache).not.toHaveBeenCalled();
    expect(store.hitRateLimit).not.toHaveBeenCalled();
  });

  it("guards real providers with cache and rate limits", async () => {
    const store = memoryStore();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createAiProvider(parseAiEnv({ AI_PROVIDER: "ollama" }), { store });
    await provider.json({
      feature: "order_review",
      tier: "smart",
      system: "",
      prompt: "",
      schema: z.object({ ok: z.boolean() }),
      cacheKey: "k",
    });
    expect(store.readCache).toHaveBeenCalledTimes(1);
    expect(store.hitRateLimit).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getAiProvider", () => {
  it("follows AI_PROVIDER and reuses the instance while the config is unchanged", () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const first = getAiProvider();
    expect(first.name).toBe("mock");
    expect(first.enabled).toBe(true);
    expect(getAiProvider()).toBe(first);
    vi.stubEnv("AI_PROVIDER", "ollama");
    const second = getAiProvider();
    expect(second.name).toBe("ollama");
    expect(second).not.toBe(first);
  });

  it("is disabled for Claude without a key", () => {
    vi.stubEnv("AI_PROVIDER", "claude");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const provider = getAiProvider();
    expect(provider.name).toBe("claude");
    expect(provider.enabled).toBe(false);
  });

  it("falls back to the disabled provider on an invalid configuration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AI_PROVIDER", "gpt");
    expect(getAiProvider()).toBe(disabledProvider);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[ai] configuration is invalid"));
  });

  it("never throws when usage logging cannot reach the database", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("OLLAMA_MODEL", "fresh-instance");
    const outcome = await getAiProvider().text({
      feature: "shift_summary",
      tier: "smart",
      system: "",
      prompt: "",
    });
    expect(outcome.ok).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[ai] usage log failed"));
  });
});
