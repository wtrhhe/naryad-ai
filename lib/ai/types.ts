import type { z } from "zod";

export type AiTier = "smart" | "fast";

export type AiFeature =
  | "order_suggestion"
  | "order_review"
  | "photo_vision"
  | "lockout_vision"
  | "rating_explanation"
  | "shift_summary"
  | "insight_text"
  | "rca_draft"
  | "acoustic_text"
  | "assistant"
  | "notification_text";

export interface AiImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

export interface AiCallContext {
  feature: AiFeature;
  workOrderId?: string | null;
  cacheKey?: string;
  timeoutMs?: number;
}

export interface AiJsonRequest<T> extends AiCallContext {
  tier: AiTier;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  images?: readonly AiImage[];
  maxTokens?: number;
}

export interface AiTextRequest extends AiCallContext {
  tier: AiTier;
  system: string;
  prompt: string;
  images?: readonly AiImage[];
  maxTokens?: number;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface AiProviderContent {
  provider: "claude" | "ollama" | "mock";
  model: string;
  blocks: unknown;
}

export type AiChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: readonly AiToolCall[];
      providerContent?: AiProviderContent;
    }
  | { role: "tool"; toolCallId: string; content: string; isError?: boolean };

export interface AiToolsRequest extends AiCallContext {
  tier: AiTier;
  system: string;
  messages: readonly AiChatMessage[];
  tools: readonly AiToolDefinition[];
  maxTokens?: number;
}

export interface AiToolsResponse {
  text: string;
  toolCalls: readonly AiToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens";
  assistantMessage?: AiChatMessage;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiResult<T> {
  ok: true;
  value: T;
  model: string;
  cached: boolean;
  usage?: AiUsage;
}

export type AiFailureCode =
  "disabled" | "timeout" | "invalid_response" | "rate_limited" | "provider_error";

export interface AiFailure {
  ok: false;
  error: AiFailureCode;
  message: string;
  model?: string;
  usage?: AiUsage;
}

export type AiOutcome<T> = AiResult<T> | AiFailure;

export type AiProviderName = "claude" | "ollama" | "mock";

export interface AiProvider {
  readonly name: AiProviderName;
  readonly enabled: boolean;
  modelFor?(tier: AiTier): string;
  json<T>(request: AiJsonRequest<T>): Promise<AiOutcome<T>>;
  text(request: AiTextRequest): Promise<AiOutcome<string>>;
  tools(request: AiToolsRequest): Promise<AiOutcome<AiToolsResponse>>;
}
