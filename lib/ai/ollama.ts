import { z } from "zod";
import { prepareImages } from "@/lib/ai/anonymize";
import {
  DEFAULT_MAX_TOKENS,
  disabledFailure,
  errorMessage,
  failure,
  parseRetryAfterMs,
  resolveTimeoutMs,
  runWithRetry,
  type ClassifiedError,
  type RetryPolicy,
} from "@/lib/ai/runtime";
import { parseJsonText, validateWithSchema, zodToJsonSchema } from "@/lib/ai/schema";
import type {
  AiChatMessage,
  AiFailure,
  AiJsonRequest,
  AiOutcome,
  AiProvider,
  AiTextRequest,
  AiTier,
  AiToolCall,
  AiToolDefinition,
  AiToolsRequest,
  AiToolsResponse,
  AiUsage,
} from "@/lib/ai/types";

export const OLLAMA_TIMEOUT_MS: Readonly<Record<AiTier, number>> = { smart: 60_000, fast: 30_000 };

export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
  timeouts?: Readonly<Record<AiTier, number>>;
  fetch?: typeof fetch;
  sleep?: RetryPolicy["sleep"];
}

export interface OllamaToolCall {
  id?: string;
  function: { name: string; arguments: unknown };
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface OllamaTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OllamaChatBody {
  model: string;
  stream: false;
  messages: OllamaMessage[];
  format?: Record<string, unknown>;
  tools?: OllamaTool[];
  options?: { temperature?: number; num_predict?: number };
}

const chatResponseSchema = z.object({
  model: z.string().optional(),
  message: z
    .object({
      content: z.string().nullish(),
      tool_calls: z
        .array(
          z.object({
            id: z.string().optional(),
            function: z.object({ name: z.string(), arguments: z.unknown() }),
          }),
        )
        .nullish(),
    })
    .nullish(),
  done_reason: z.string().nullish(),
  prompt_eval_count: z.number().nullish(),
  eval_count: z.number().nullish(),
});

export type OllamaChatResponse = z.infer<typeof chatResponseSchema>;

export class OllamaHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "OllamaHttpError";
  }
}

export class OllamaResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyOllamaError(error: unknown): ClassifiedError {
  if (error instanceof OllamaHttpError) {
    const message = `HTTP ${error.status}: ${error.message}`;
    if (error.status === 429) {
      return { code: "rate_limited", retryable: true, message, retryAfterMs: error.retryAfterMs };
    }
    if (error.status >= 500 || error.status === 408) {
      return { code: "provider_error", retryable: true, message, retryAfterMs: error.retryAfterMs };
    }
    return { code: "provider_error", retryable: false, message };
  }
  if (error instanceof OllamaResponseError) {
    return { code: "invalid_response", retryable: false, message: error.message };
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return { code: "timeout", retryable: false, message: "Request timed out" };
  }
  if (error instanceof TypeError) {
    return {
      code: "provider_error",
      retryable: true,
      message: `Ollama is unreachable: ${error.message}`,
    };
  }
  return { code: "provider_error", retryable: false, message: errorMessage(error) };
}

export function toOllamaUsage(response: OllamaChatResponse): AiUsage {
  return {
    inputTokens: response.prompt_eval_count ?? 0,
    outputTokens: response.eval_count ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function toolNameFor(messages: readonly AiChatMessage[], index: number, id: string): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate?.role === "assistant") {
      const call = candidate.toolCalls?.find((toolCall) => toolCall.id === id);
      if (call) {
        return call.name;
      }
    }
  }
  return null;
}

export function toOllamaMessages(
  system: string,
  messages: readonly AiChatMessage[],
): OllamaMessage[] {
  const result: OllamaMessage[] =
    system.trim().length > 0 ? [{ role: "system", content: system }] : [];
  messages.forEach((message, index) => {
    if (message.role === "user") {
      result.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      const calls = message.toolCalls ?? [];
      result.push({
        role: "assistant",
        content: message.content,
        ...(calls.length > 0
          ? {
              tool_calls: calls.map((call) => ({
                function: { name: call.name, arguments: isRecord(call.input) ? call.input : {} },
              })),
            }
          : {}),
      });
    } else {
      const name = toolNameFor(messages, index, message.toolCallId);
      result.push({
        role: "tool",
        content: message.isError ? `Error: ${message.content}` : message.content,
        ...(name ? { tool_name: name } : {}),
      });
    }
  });
  return result;
}

export function toOllamaTools(tools: readonly AiToolDefinition[]): OllamaTool[] {
  return tools.map((tool) => {
    const { $schema: _ignored, ...parameters } = tool.inputSchema;
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: { type: "object", ...parameters },
      },
    };
  });
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") {
    return value ?? {};
  }
  const parsed = parseJsonText(value);
  return parsed.ok ? parsed.value : {};
}

export function toOllamaToolsResponse(
  response: OllamaChatResponse,
  model: string,
  turn: number,
): AiToolsResponse {
  const text = (response.message?.content ?? "").trim();
  const toolCalls: AiToolCall[] = (response.message?.tool_calls ?? []).map((call, index) => ({
    id: call.id ?? `ollama-${turn}-${index}`,
    name: call.function.name,
    input: parseArguments(call.function.arguments),
  }));
  const stopReason: AiToolsResponse["stopReason"] =
    toolCalls.length > 0 ? "tool_use" : response.done_reason === "length" ? "max_tokens" : "end";
  return {
    text,
    toolCalls,
    stopReason,
    assistantMessage: {
      role: "assistant",
      content: text,
      toolCalls,
      providerContent: { provider: "ollama", model, blocks: response.message ?? null },
    },
  };
}

export function jsonInstruction(schema: Record<string, unknown>): string {
  return `Respond with a single JSON value that matches this JSON schema:\n${JSON.stringify(schema)}`;
}

function errorFromBody(text: string): string {
  const parsed = parseJsonText(text);
  if (parsed.ok && isRecord(parsed.value) && typeof parsed.value.error === "string") {
    return parsed.value.error;
  }
  return text.slice(0, 200) || "Request failed";
}

export class OllamaProvider implements AiProvider {
  readonly name = "ollama" as const;
  readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeouts: Readonly<Record<AiTier, number>>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: RetryPolicy["sleep"];

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/u, "");
    this.model = config.model.trim();
    this.enabled = this.baseUrl.length > 0 && this.model.length > 0;
    this.timeouts = config.timeouts ?? OLLAMA_TIMEOUT_MS;
    this.fetchImpl = config.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = config.sleep;
  }

  modelFor(_tier: AiTier): string {
    return this.model;
  }

  private async chat(
    body: OllamaChatBody,
    tier: AiTier,
    timeoutMs: number | undefined,
  ): Promise<{ ok: true; response: OllamaChatResponse } | { ok: false; failure: AiFailure }> {
    const result = await runWithRetry(
      async (signal) => {
        const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new OllamaHttpError(
            response.status,
            errorFromBody(text),
            parseRetryAfterMs(response.headers.get("retry-after")),
          );
        }
        let raw: unknown;
        try {
          raw = await response.json();
        } catch {
          throw new OllamaResponseError("Ollama returned a body that is not JSON");
        }
        const parsed = chatResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new OllamaResponseError("Ollama returned an unexpected response shape");
        }
        return parsed.data;
      },
      classifyOllamaError,
      { timeoutMs: resolveTimeoutMs(tier, timeoutMs, this.timeouts), sleep: this.sleep },
    );
    if (!result.ok) {
      return { ok: false, failure: { ...result.failure, model: this.model } };
    }
    return { ok: true, response: result.value };
  }

  private userMessage(
    prompt: string,
    images: AiJsonRequest<unknown>["images"],
  ): { ok: true; message: OllamaMessage } | { ok: false; failure: AiFailure } {
    const prepared = prepareImages(images);
    if (!prepared.ok) {
      return {
        ok: false,
        failure: failure(
          "provider_error",
          `Image ${prepared.index + 1} is not a supported picture`,
          {
            model: this.model,
          },
        ),
      };
    }
    return {
      ok: true,
      message: {
        role: "user",
        content: prompt,
        ...(prepared.images.length > 0
          ? { images: prepared.images.map((image) => image.base64) }
          : {}),
      },
    };
  }

  async json<T>(request: AiJsonRequest<T>): Promise<AiOutcome<T>> {
    if (!this.enabled) {
      return disabledFailure();
    }
    try {
      const schema = zodToJsonSchema(request.schema);
      const user = this.userMessage(
        `${request.prompt}\n\n${jsonInstruction(schema)}`,
        request.images,
      );
      if (!user.ok) {
        return user.failure;
      }
      const sent = await this.chat(
        {
          model: this.model,
          stream: false,
          messages: [...toOllamaMessages(request.system, []), user.message],
          format: schema,
          options: {
            temperature: 0,
            num_predict: request.maxTokens ?? DEFAULT_MAX_TOKENS[request.tier],
          },
        },
        request.tier,
        request.timeoutMs,
      );
      if (!sent.ok) {
        return sent.failure;
      }
      const usage = toOllamaUsage(sent.response);
      const served = sent.response.model ?? this.model;
      const parsed = parseJsonText(sent.response.message?.content ?? "");
      if (!parsed.ok) {
        const reason =
          sent.response.done_reason === "length"
            ? "Response was cut off by num_predict"
            : "Response is not valid JSON";
        return failure("invalid_response", reason, { model: served, usage });
      }
      const validated = validateWithSchema(request.schema, parsed.value);
      if (!validated.ok) {
        return failure("invalid_response", validated.message, { model: served, usage });
      }
      return { ok: true, value: validated.value, model: served, cached: false, usage };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model: this.model });
    }
  }

  async text(request: AiTextRequest): Promise<AiOutcome<string>> {
    if (!this.enabled) {
      return disabledFailure();
    }
    try {
      const user = this.userMessage(request.prompt, request.images);
      if (!user.ok) {
        return user.failure;
      }
      const sent = await this.chat(
        {
          model: this.model,
          stream: false,
          messages: [...toOllamaMessages(request.system, []), user.message],
          options: { num_predict: request.maxTokens ?? DEFAULT_MAX_TOKENS[request.tier] },
        },
        request.tier,
        request.timeoutMs,
      );
      if (!sent.ok) {
        return sent.failure;
      }
      const usage = toOllamaUsage(sent.response);
      const served = sent.response.model ?? this.model;
      const text = (sent.response.message?.content ?? "").trim();
      if (text.length === 0) {
        return failure("invalid_response", "Empty response", { model: served, usage });
      }
      return { ok: true, value: text, model: served, cached: false, usage };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model: this.model });
    }
  }

  async tools(request: AiToolsRequest): Promise<AiOutcome<AiToolsResponse>> {
    if (!this.enabled) {
      return disabledFailure();
    }
    try {
      const sent = await this.chat(
        {
          model: this.model,
          stream: false,
          messages: toOllamaMessages(request.system, request.messages),
          ...(request.tools.length > 0 ? { tools: toOllamaTools(request.tools) } : {}),
          options: { num_predict: request.maxTokens ?? DEFAULT_MAX_TOKENS[request.tier] },
        },
        request.tier,
        request.timeoutMs,
      );
      if (!sent.ok) {
        return sent.failure;
      }
      const served = sent.response.model ?? this.model;
      return {
        ok: true,
        value: toOllamaToolsResponse(sent.response, served, request.messages.length),
        model: served,
        cached: false,
        usage: toOllamaUsage(sent.response),
      };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model: this.model });
    }
  }
}
