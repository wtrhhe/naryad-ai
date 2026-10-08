import type { AiFailure, AiProvider } from "@/lib/ai/types";

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

export function getAiProvider(): AiProvider {
  return disabledProvider;
}
