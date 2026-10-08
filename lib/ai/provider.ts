import { ClaudeProvider } from "@/lib/ai/claude";
import { MockProvider } from "@/lib/ai/mock";
import { OllamaProvider } from "@/lib/ai/ollama";
import { withTelemetry } from "@/lib/ai/telemetry";
import type { AiFailure, AiProvider } from "@/lib/ai/types";
import { createSupabaseAiStore, warnAi, type AiStore } from "@/lib/ai/usage";
import { parseAiEnv, type AiEnv } from "@/lib/env";

const disabled: AiFailure = {
  ok: false,
  error: "disabled",
  message: "AI provider is not configured",
};

export const disabledProvider: AiProvider = {
  name: "mock",
  enabled: false,
  json: async () => disabled,
  text: async () => disabled,
  tools: async () => disabled,
};

export function createBaseProvider(env: AiEnv): AiProvider {
  switch (env.AI_PROVIDER) {
    case "mock":
      return new MockProvider();
    case "ollama":
      return new OllamaProvider({ baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL });
    default:
      return new ClaudeProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        models: { smart: env.ANTHROPIC_MODEL_SMART, fast: env.ANTHROPIC_MODEL_FAST },
      });
  }
}

export interface CreateAiProviderOptions {
  store?: AiStore;
}

export function createAiProvider(env: AiEnv, options: CreateAiProviderOptions = {}): AiProvider {
  const base = createBaseProvider(env);
  if (!base.enabled) {
    return base;
  }
  const offline = base.name === "mock";
  return withTelemetry(base, {
    store: options.store ?? createSupabaseAiStore(),
    cache: !offline,
    rateLimit: !offline,
  });
}

let current: { signature: string; provider: AiProvider } | null = null;

export function getAiProvider(): AiProvider {
  let env: AiEnv;
  try {
    env = parseAiEnv(process.env);
  } catch (error) {
    warnAi("configuration is invalid", error);
    return disabledProvider;
  }
  const signature = JSON.stringify(env);
  if (current?.signature !== signature) {
    current = { signature, provider: createAiProvider(env) };
  }
  return current.provider;
}
