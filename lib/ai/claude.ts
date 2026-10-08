import Anthropic from "@anthropic-ai/sdk";
import { prepareImages } from "@/lib/ai/anonymize";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  disabledFailure,
  errorMessage,
  failure,
  parseRetryAfterMs,
  resolveTimeoutMs,
  runWithRetry,
  type ClassifiedError,
  type RetryPolicy,
} from "@/lib/ai/runtime";
import {
  parseJsonText,
  prepareStructuredSchema,
  unwrapRootValue,
  validateWithSchema,
  type PreparedSchema,
} from "@/lib/ai/schema";
import type {
  AiChatMessage,
  AiFailure,
  AiImage,
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

export const STRUCTURED_TOOL_NAME = "submit_result";
const STRUCTURED_TOOL_DESCRIPTION =
  "Submit the final structured answer. Call exactly once with the complete result.";
const EFFORT_BY_TIER: Readonly<Record<AiTier, "low" | "medium">> = { fast: "low", smart: "medium" };
const MODEL_PATTERN = /claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?!\d)/;

export interface ClaudeMessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions,
    ): Promise<Anthropic.Message>;
  };
}

export interface ClaudeProviderConfig {
  apiKey: string;
  models: Readonly<Record<AiTier, string>>;
  timeouts?: Readonly<Record<AiTier, number>>;
  client?: ClaudeMessagesClient;
  sleep?: RetryPolicy["sleep"];
}

export interface ClaudeCapabilities {
  forcedToolChoice: boolean;
  structuredOutputs: boolean;
  effort: boolean;
}

export function claudeCapabilities(model: string): ClaudeCapabilities {
  const match = MODEL_PATTERN.exec(model);
  if (!match) {
    return { forcedToolChoice: false, structuredOutputs: true, effort: false };
  }
  const family = match[1];
  const version = Number(match[2]) + Number(match[3] ?? 0) / 10;
  switch (family) {
    case "opus":
      return {
        forcedToolChoice: version < 5.5,
        structuredOutputs: version === 4.1 || version === 4.5 || version >= 4.8,
        effort: version >= 4.5,
      };
    case "sonnet":
      return {
        forcedToolChoice: version < 5.5,
        structuredOutputs: version >= 4.5,
        effort: version >= 4.6,
      };
    case "haiku":
      return { forcedToolChoice: true, structuredOutputs: version >= 4.5, effort: version >= 5 };
    default:
      return { forcedToolChoice: version < 5.1, structuredOutputs: true, effort: true };
  }
}

export function classifyClaudeError(error: unknown): ClassifiedError {
  if (error instanceof Anthropic.APIUserAbortError) {
    return { code: "timeout", retryable: false, message: "Request was aborted" };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { code: "timeout", retryable: false, message: "Request timed out" };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return {
      code: "provider_error",
      retryable: true,
      message: `Connection failed: ${error.message}`,
    };
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    const headers = error.headers instanceof Headers ? error.headers : null;
    const retryAfterMs = parseRetryAfterMs(headers?.get("retry-after"));
    const detail = error.message || `HTTP ${status ?? "error"}`;
    if (status === 429 || error.type === "rate_limit_error") {
      return { code: "rate_limited", retryable: true, message: detail, retryAfterMs };
    }
    if (status === 529 || error.type === "overloaded_error") {
      return { code: "provider_error", retryable: true, message: detail, retryAfterMs };
    }
    if (status !== undefined && (status >= 500 || status === 408 || status === 409)) {
      return { code: "provider_error", retryable: true, message: detail, retryAfterMs };
    }
    return { code: "provider_error", retryable: false, message: detail };
  }
  return { code: "provider_error", retryable: false, message: errorMessage(error) };
}

export function toAiUsage(usage: Anthropic.Usage | null | undefined): AiUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

export function buildSystem(system: string): Anthropic.TextBlockParam[] | undefined {
  if (system.trim().length === 0) {
    return undefined;
  }
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

export function buildUserContent(
  prompt: string,
  images: readonly AiImage[],
): Anthropic.ContentBlockParam[] {
  return [
    ...images.map((image): Anthropic.ImageBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    })),
    { type: "text", text: prompt },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assistantBlocks(
  message: Extract<AiChatMessage, { role: "assistant" }>,
): Anthropic.ContentBlockParam[] {
  const raw = message.providerContent;
  if (raw?.provider === "claude" && Array.isArray(raw.blocks) && raw.blocks.length > 0) {
    return raw.blocks as Anthropic.ContentBlockParam[];
  }
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (message.content.trim().length > 0) {
    blocks.push({ type: "text", text: message.content });
  }
  for (const call of message.toolCalls ?? []) {
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: isRecord(call.input) ? call.input : {},
    });
  }
  return blocks;
}

export function toClaudeMessages(messages: readonly AiChatMessage[]): Anthropic.MessageParam[] {
  const turns: { role: "user" | "assistant"; blocks: Anthropic.ContentBlockParam[] }[] = [];
  const push = (role: "user" | "assistant", blocks: Anthropic.ContentBlockParam[]) => {
    if (blocks.length === 0) {
      return;
    }
    const last = turns.at(-1);
    if (last && last.role === role) {
      last.blocks.push(...blocks);
    } else {
      turns.push({ role, blocks: [...blocks] });
    }
  };
  for (const message of messages) {
    if (message.role === "user") {
      push("user", message.content.length > 0 ? [{ type: "text", text: message.content }] : []);
    } else if (message.role === "assistant") {
      push("assistant", assistantBlocks(message));
    } else {
      push("user", [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content,
          ...(message.isError ? { is_error: true } : {}),
        },
      ]);
    }
  }
  return turns.map((turn) => ({ role: turn.role, content: turn.blocks }));
}

export function toClaudeTools(tools: readonly AiToolDefinition[]): Anthropic.Tool[] {
  return tools.map((tool) => {
    const { $schema: _ignored, ...schema } = tool.inputSchema;
    return {
      name: tool.name,
      description: tool.description,
      input_schema: { ...schema, type: "object" } as Anthropic.Tool.InputSchema,
    };
  });
}

function outputConfig(
  model: string,
  tier: AiTier,
  format?: Anthropic.JSONOutputFormat,
): Pick<Anthropic.MessageCreateParamsNonStreaming, "output_config"> {
  const effort = claudeCapabilities(model).effort ? EFFORT_BY_TIER[tier] : undefined;
  if (!effort && !format) {
    return {};
  }
  return { output_config: { ...(effort ? { effort } : {}), ...(format ? { format } : {}) } };
}

export function buildJsonBody<T>(
  model: string,
  request: AiJsonRequest<T>,
  images: readonly AiImage[],
  prepared: PreparedSchema,
): Anthropic.MessageCreateParamsNonStreaming {
  const capabilities = claudeCapabilities(model);
  const system = buildSystem(request.system);
  const base = {
    model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS[request.tier],
    ...(system ? { system } : {}),
    messages: [{ role: "user" as const, content: buildUserContent(request.prompt, images) }],
  };
  if (capabilities.forcedToolChoice) {
    return {
      ...base,
      ...outputConfig(model, request.tier),
      tools: [
        {
          name: STRUCTURED_TOOL_NAME,
          description: STRUCTURED_TOOL_DESCRIPTION,
          input_schema: prepared.strict as Anthropic.Tool.InputSchema,
          ...(capabilities.structuredOutputs ? { strict: true } : {}),
        },
      ],
      tool_choice: { type: "tool", name: STRUCTURED_TOOL_NAME, disable_parallel_tool_use: true },
    };
  }
  return {
    ...base,
    ...outputConfig(model, request.tier, { type: "json_schema", schema: prepared.strict }),
  };
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

function refusalMessage(message: Anthropic.Message): string | null {
  if (message.stop_reason !== "refusal") {
    return null;
  }
  const category = message.stop_details?.category;
  return category ? `Model refused the request (${category})` : "Model refused the request";
}

export function extractStructured(
  message: Anthropic.Message,
  wrapped: boolean,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const refusal = refusalMessage(message);
  if (refusal) {
    return { ok: false, message: refusal };
  }
  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === STRUCTURED_TOOL_NAME,
  );
  if (toolUse) {
    return { ok: true, value: unwrapRootValue(toolUse.input, wrapped) };
  }
  const parsed = parseJsonText(textOf(message));
  if (parsed.ok) {
    return { ok: true, value: unwrapRootValue(parsed.value, wrapped) };
  }
  if (message.stop_reason === "max_tokens") {
    return { ok: false, message: "Response was cut off by max_tokens" };
  }
  return { ok: false, message: "Response contains no structured result" };
}

function toStopReason(reason: Anthropic.StopReason | null): AiToolsResponse["stopReason"] {
  if (reason === "tool_use") {
    return "tool_use";
  }
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") {
    return "max_tokens";
  }
  return "end";
}

export function toToolsResponse(message: Anthropic.Message): AiToolsResponse {
  const text = textOf(message);
  const toolCalls: AiToolCall[] = message.content.flatMap((block) =>
    block.type === "tool_use" ? [{ id: block.id, name: block.name, input: block.input }] : [],
  );
  return {
    text,
    toolCalls,
    stopReason: toStopReason(message.stop_reason),
    assistantMessage: {
      role: "assistant",
      content: text,
      toolCalls,
      providerContent: { provider: "claude", model: message.model, blocks: message.content },
    },
  };
}

export class ClaudeProvider implements AiProvider {
  readonly name = "claude" as const;
  readonly enabled: boolean;
  private readonly models: Readonly<Record<AiTier, string>>;
  private readonly timeouts: Readonly<Record<AiTier, number>>;
  private readonly sleep: RetryPolicy["sleep"];
  private readonly apiKey: string;
  private client: ClaudeMessagesClient | null;

  constructor(config: ClaudeProviderConfig) {
    this.apiKey = config.apiKey.trim();
    this.enabled = this.apiKey.length > 0;
    this.models = config.models;
    this.timeouts = config.timeouts ?? DEFAULT_TIMEOUT_MS;
    this.sleep = config.sleep;
    this.client = config.client ?? null;
  }

  modelFor(tier: AiTier): string {
    return this.models[tier];
  }

  private messagesClient(): ClaudeMessagesClient {
    this.client ??= new Anthropic({ apiKey: this.apiKey, maxRetries: 0 });
    return this.client;
  }

  private async send(
    body: Anthropic.MessageCreateParamsNonStreaming,
    tier: AiTier,
    timeoutMs: number | undefined,
  ): Promise<{ ok: true; message: Anthropic.Message } | { ok: false; failure: AiFailure }> {
    const result = await runWithRetry(
      (signal, remainingMs) =>
        this.messagesClient().messages.create(body, {
          signal,
          timeout: remainingMs,
          maxRetries: 0,
        }),
      classifyClaudeError,
      { timeoutMs: resolveTimeoutMs(tier, timeoutMs, this.timeouts), sleep: this.sleep },
    );
    if (!result.ok) {
      return { ok: false, failure: { ...result.failure, model: body.model } };
    }
    return { ok: true, message: result.value };
  }

  async json<T>(request: AiJsonRequest<T>): Promise<AiOutcome<T>> {
    if (!this.enabled) {
      return disabledFailure();
    }
    const model = this.modelFor(request.tier);
    try {
      const images = prepareImages(request.images);
      if (!images.ok) {
        return failure("provider_error", `Image ${images.index + 1} is not a supported picture`, {
          model,
        });
      }
      const prepared = prepareStructuredSchema(request.schema);
      const sent = await this.send(
        buildJsonBody(model, request, images.images, prepared),
        request.tier,
        request.timeoutMs,
      );
      if (!sent.ok) {
        return sent.failure;
      }
      const usage = toAiUsage(sent.message.usage);
      const served = sent.message.model || model;
      const extracted = extractStructured(sent.message, prepared.wrapped);
      if (!extracted.ok) {
        const code = sent.message.stop_reason === "refusal" ? "provider_error" : "invalid_response";
        return failure(code, extracted.message, { model: served, usage });
      }
      const validated = validateWithSchema(request.schema, extracted.value);
      if (!validated.ok) {
        return failure("invalid_response", validated.message, { model: served, usage });
      }
      return { ok: true, value: validated.value, model: served, cached: false, usage };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model });
    }
  }

  async text(request: AiTextRequest): Promise<AiOutcome<string>> {
    if (!this.enabled) {
      return disabledFailure();
    }
    const model = this.modelFor(request.tier);
    try {
      const images = prepareImages(request.images);
      if (!images.ok) {
        return failure("provider_error", `Image ${images.index + 1} is not a supported picture`, {
          model,
        });
      }
      const system = buildSystem(request.system);
      const sent = await this.send(
        {
          model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS[request.tier],
          ...(system ? { system } : {}),
          messages: [{ role: "user", content: buildUserContent(request.prompt, images.images) }],
          ...outputConfig(model, request.tier),
        },
        request.tier,
        request.timeoutMs,
      );
      if (!sent.ok) {
        return sent.failure;
      }
      const usage = toAiUsage(sent.message.usage);
      const served = sent.message.model || model;
      const refusal = refusalMessage(sent.message);
      if (refusal) {
        return failure("provider_error", refusal, { model: served, usage });
      }
      const text = textOf(sent.message);
      if (text.length === 0) {
        const reason =
          sent.message.stop_reason === "max_tokens"
            ? "Response was cut off by max_tokens"
            : "Empty response";
        return failure("invalid_response", reason, { model: served, usage });
      }
      return { ok: true, value: text, model: served, cached: false, usage };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model });
    }
  }

  async tools(request: AiToolsRequest): Promise<AiOutcome<AiToolsResponse>> {
    if (!this.enabled) {
      return disabledFailure();
    }
    const model = this.modelFor(request.tier);
    try {
      const messages = toClaudeMessages(request.messages);
      if (messages.at(-1)?.role !== "user") {
        return failure("provider_error", "Conversation must end with a user or tool message", {
          model,
        });
      }
      const system = buildSystem(request.system);
      const sent = await this.send(
        {
          model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS[request.tier],
          ...(system ? { system } : {}),
          messages,
          ...(request.tools.length > 0 ? { tools: toClaudeTools(request.tools) } : {}),
          cache_control: { type: "ephemeral" },
          ...outputConfig(model, request.tier),
        },
        request.tier,
        request.timeoutMs,
      );
      if (!sent.ok) {
        return sent.failure;
      }
      const usage = toAiUsage(sent.message.usage);
      const served = sent.message.model || model;
      const refusal = refusalMessage(sent.message);
      if (refusal) {
        return failure("provider_error", refusal, { model: served, usage });
      }
      return {
        ok: true,
        value: toToolsResponse(sent.message),
        model: served,
        cached: false,
        usage,
      };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model });
    }
  }
}
