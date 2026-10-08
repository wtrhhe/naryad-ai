import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ClaudeProvider,
  STRUCTURED_TOOL_NAME,
  buildJsonBody,
  buildSystem,
  buildUserContent,
  claudeCapabilities,
  classifyClaudeError,
  extractStructured,
  toAiUsage,
  toClaudeMessages,
  toClaudeTools,
  toToolsResponse,
  type ClaudeMessagesClient,
} from "@/lib/ai/claude";
import { prepareStructuredSchema } from "@/lib/ai/schema";
import type { AiJsonRequest } from "@/lib/ai/types";

const PNG_BASE64 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("IEND", "latin1"),
  Buffer.alloc(4),
]).toString("base64");

const models = { smart: "claude-sonnet-5-5", fast: "claude-haiku-5-5" } as const;

function message(partial: Record<string, unknown>): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 120,
      output_tokens: 30,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 0,
    },
    ...partial,
  } as unknown as Anthropic.Message;
}

function fakeClient(...responses: (Anthropic.Message | Error)[]) {
  const create = vi.fn(async () => {
    const next = responses.shift();
    if (!next) {
      throw new Error("no more responses");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  const client: ClaudeMessagesClient = { messages: { create } };
  return { client, create };
}

function provider(client: ClaudeMessagesClient, apiKey = "sk-test") {
  return new ClaudeProvider({ apiKey, models, client, sleep: async () => {} });
}

const suggestion = z.object({
  priority: z.enum(["normal", "high"]),
  confidence: z.number().min(0).max(1),
});

const jsonRequest: AiJsonRequest<z.infer<typeof suggestion>> = {
  feature: "order_suggestion",
  tier: "fast",
  system: "Ты помощник мастера",
  prompt: "Описание: течь масла",
  schema: suggestion,
};

function bodyOf(create: ReturnType<typeof fakeClient>["create"], index = 0) {
  const call = create.mock.calls[index] as unknown as [
    Anthropic.MessageCreateParamsNonStreaming,
    Anthropic.RequestOptions,
  ];
  return call;
}

describe("claudeCapabilities", () => {
  it("knows which models reject forced tool choice", () => {
    expect(claudeCapabilities("claude-sonnet-5-5").forcedToolChoice).toBe(false);
    expect(claudeCapabilities("claude-opus-5-5").forcedToolChoice).toBe(false);
    expect(claudeCapabilities("claude-fable-5-1").forcedToolChoice).toBe(false);
    expect(claudeCapabilities("claude-sonnet-5").forcedToolChoice).toBe(true);
    expect(claudeCapabilities("claude-opus-4-8").forcedToolChoice).toBe(true);
    expect(claudeCapabilities("claude-haiku-5-5").forcedToolChoice).toBe(true);
    expect(claudeCapabilities("claude-fable-5").forcedToolChoice).toBe(true);
  });

  it("knows which models accept effort", () => {
    expect(claudeCapabilities("claude-haiku-4-5").effort).toBe(false);
    expect(claudeCapabilities("claude-haiku-5-5").effort).toBe(true);
    expect(claudeCapabilities("claude-sonnet-4-5").effort).toBe(false);
    expect(claudeCapabilities("claude-sonnet-4-6").effort).toBe(true);
    expect(claudeCapabilities("claude-opus-4-5-20251101").effort).toBe(true);
    expect(claudeCapabilities("claude-opus-4-1").effort).toBe(false);
    expect(claudeCapabilities("anthropic.claude-mythos-5-1").effort).toBe(true);
  });

  it("parses dated ids and falls back for unknown names", () => {
    expect(claudeCapabilities("claude-sonnet-4-20250514")).toEqual({
      forcedToolChoice: true,
      structuredOutputs: false,
      effort: false,
    });
    expect(claudeCapabilities("custom-model")).toEqual({
      forcedToolChoice: false,
      structuredOutputs: true,
      effort: false,
    });
    expect(claudeCapabilities("claude-opus-4-1").structuredOutputs).toBe(true);
    expect(claudeCapabilities("claude-opus-4-6").structuredOutputs).toBe(false);
  });
});

describe("classifyClaudeError", () => {
  const body = { type: "error", error: { type: "api_error", message: "x" } };

  it("maps aborts and timeouts", () => {
    expect(classifyClaudeError(new Anthropic.APIUserAbortError())).toMatchObject({
      code: "timeout",
      retryable: false,
    });
    expect(classifyClaudeError(new Anthropic.APIConnectionTimeoutError())).toMatchObject({
      code: "timeout",
    });
  });

  it("retries connection failures", () => {
    expect(
      classifyClaudeError(new Anthropic.APIConnectionError({ message: "ECONNRESET" })),
    ).toMatchObject({ code: "provider_error", retryable: true });
  });

  it("maps rate limits with retry-after", () => {
    const error = new Anthropic.RateLimitError(
      429,
      body,
      "slow down",
      new Headers({ "retry-after": "2" }),
    );
    expect(classifyClaudeError(error)).toEqual({
      code: "rate_limited",
      retryable: true,
      message: '429 {"type":"error","error":{"type":"api_error","message":"x"}}',
      retryAfterMs: 2000,
    });
  });

  it("retries overload and server errors", () => {
    const overloaded = new Anthropic.InternalServerError(529, body, "Overloaded", new Headers());
    expect(classifyClaudeError(overloaded)).toMatchObject({
      code: "provider_error",
      retryable: true,
    });
    const typed = new Anthropic.APIError(400, body, "busy", new Headers(), "overloaded_error");
    expect(classifyClaudeError(typed)).toMatchObject({ retryable: true });
    const server = new Anthropic.InternalServerError(500, body, "oops", new Headers());
    expect(classifyClaudeError(server)).toMatchObject({ retryable: true });
    const conflict = new Anthropic.ConflictError(409, body, "conflict", new Headers());
    expect(classifyClaudeError(conflict)).toMatchObject({ retryable: true });
  });

  it("does not retry client errors", () => {
    const bad = new Anthropic.BadRequestError(400, body, "bad", new Headers());
    expect(classifyClaudeError(bad)).toMatchObject({ code: "provider_error", retryable: false });
    const auth = new Anthropic.AuthenticationError(401, body, "key", new Headers());
    expect(classifyClaudeError(auth).message).toContain("401");
    expect(classifyClaudeError(new TypeError("boom"))).toEqual({
      code: "provider_error",
      retryable: false,
      message: "boom",
    });
  });
});

describe("request mapping", () => {
  it("caches the system prompt and skips an empty one", () => {
    expect(buildSystem("Правила")).toEqual([
      { type: "text", text: "Правила", cache_control: { type: "ephemeral" } },
    ]);
    expect(buildSystem("  ")).toBeUndefined();
  });

  it("puts images before the text", () => {
    const content = buildUserContent("Что на фото?", [{ mediaType: "image/png", base64: "AAAA" }]);
    expect(content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      { type: "text", text: "Что на фото?" },
    ]);
  });

  it("forces the structured tool on models that allow it", () => {
    const body = buildJsonBody(
      "claude-haiku-5-5",
      jsonRequest,
      [],
      prepareStructuredSchema(suggestion),
    );
    expect(body.tool_choice).toEqual({
      type: "tool",
      name: STRUCTURED_TOOL_NAME,
      disable_parallel_tool_use: true,
    });
    const tool = body.tools?.[0] as Anthropic.Tool;
    expect(tool.strict).toBe(true);
    expect(tool.input_schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.max_tokens).toBe(4000);
    expect(body.system).toEqual(buildSystem("Ты помощник мастера"));
  });

  it("uses structured output format where forced tool use is rejected", () => {
    const body = buildJsonBody(
      "claude-sonnet-5-5",
      { ...jsonRequest, tier: "smart", maxTokens: 1234, system: "" },
      [],
      prepareStructuredSchema(suggestion),
    );
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.system).toBeUndefined();
    expect(body.max_tokens).toBe(1234);
    expect(body.output_config?.effort).toBe("medium");
    expect(body.output_config?.format?.type).toBe("json_schema");
  });

  it("omits effort and strict mode for models without them", () => {
    const body = buildJsonBody(
      "claude-sonnet-4-20250514",
      jsonRequest,
      [],
      prepareStructuredSchema(suggestion),
    );
    expect(body.output_config).toBeUndefined();
    expect((body.tools?.[0] as Anthropic.Tool).strict).toBeUndefined();
  });

  it("maps chat history with merged tool results", () => {
    const messages = toClaudeMessages([
      { role: "user", content: "Кто свободен?" },
      {
        role: "assistant",
        content: "Проверяю",
        toolCalls: [
          { id: "t1", name: "find_free_workers", input: { specialty: "electrician" } },
          { id: "t2", name: "list_overdue", input: "bad" },
        ],
      },
      { role: "tool", toolCallId: "t1", content: "[]" },
      { role: "tool", toolCallId: "t2", content: "fail", isError: true },
      { role: "user", content: "" },
      { role: "assistant", content: "  " },
      { role: "user", content: "А сварщики?" },
    ]);
    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Кто свободен?" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Проверяю" },
          {
            type: "tool_use",
            id: "t1",
            name: "find_free_workers",
            input: { specialty: "electrician" },
          },
          { type: "tool_use", id: "t2", name: "list_overdue", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "[]" },
          { type: "tool_result", tool_use_id: "t2", content: "fail", is_error: true },
          { type: "text", text: "А сварщики?" },
        ],
      },
    ]);
  });

  it("replays original provider blocks so thinking survives tool loops", () => {
    const blocks = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id: "t1", name: "x", input: {} },
    ];
    const messages = toClaudeMessages([
      { role: "user", content: "q" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "t1", name: "x", input: {} }],
        providerContent: { provider: "claude", model: "m", blocks },
      },
      {
        role: "assistant",
        content: "fallback",
        providerContent: { provider: "ollama", model: "m", blocks },
      },
    ]);
    expect(messages[1]?.content).toEqual([...blocks, { type: "text", text: "fallback" }]);
  });

  it("maps tool definitions", () => {
    expect(
      toClaudeTools([
        {
          name: "list_overdue",
          description: "Просроченные наряды",
          inputSchema: { $schema: "x", properties: { site: { type: "string" } } },
        },
      ]),
    ).toEqual([
      {
        name: "list_overdue",
        description: "Просроченные наряды",
        input_schema: { type: "object", properties: { site: { type: "string" } } },
      },
    ]);
  });

  it("maps usage counters", () => {
    expect(toAiUsage(message({}).usage)).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
    });
    expect(toAiUsage(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });
});

describe("extractStructured", () => {
  it("prefers the structured tool call", () => {
    const result = extractStructured(
      message({
        content: [
          { type: "text", text: "{}" },
          { type: "tool_use", id: "x", name: STRUCTURED_TOOL_NAME, input: { result: [1] } },
        ],
      }),
      true,
    );
    expect(result).toEqual({ ok: true, value: [1] });
  });

  it("reports refusals, truncation and missing output", () => {
    expect(
      extractStructured(
        message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } }),
        false,
      ),
    ).toEqual({ ok: false, message: "Model refused the request (cyber)" });
    expect(extractStructured(message({ stop_reason: "refusal" }), false)).toEqual({
      ok: false,
      message: "Model refused the request",
    });
    expect(
      extractStructured(
        message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"a":' }] }),
        false,
      ),
    ).toEqual({ ok: false, message: "Response was cut off by max_tokens" });
    expect(extractStructured(message({ content: [] }), false)).toEqual({
      ok: false,
      message: "Response contains no structured result",
    });
  });
});

describe("toToolsResponse", () => {
  it("collects text, tool calls and the replayable assistant turn", () => {
    const response = toToolsResponse(
      message({
        stop_reason: "tool_use",
        content: [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "text", text: "Ищу" },
          { type: "tool_use", id: "t1", name: "list_overdue", input: { site: "CRUSH" } },
        ],
      }),
    );
    expect(response.text).toBe("Ищу");
    expect(response.stopReason).toBe("tool_use");
    expect(response.toolCalls).toEqual([
      { id: "t1", name: "list_overdue", input: { site: "CRUSH" } },
    ]);
    expect(response.assistantMessage).toMatchObject({
      role: "assistant",
      providerContent: { provider: "claude", model: "claude-haiku-5-5" },
    });
  });

  it("maps stop reasons", () => {
    expect(toToolsResponse(message({ stop_reason: "max_tokens" })).stopReason).toBe("max_tokens");
    expect(
      toToolsResponse(message({ stop_reason: "model_context_window_exceeded" })).stopReason,
    ).toBe("max_tokens");
    expect(toToolsResponse(message({ stop_reason: "pause_turn" })).stopReason).toBe("end");
  });
});

describe("ClaudeProvider", () => {
  it("is disabled without an API key", async () => {
    const { client, create } = fakeClient();
    const disabled = provider(client, " ");
    expect(disabled.enabled).toBe(false);
    await expect(disabled.json(jsonRequest)).resolves.toMatchObject({ error: "disabled" });
    await expect(
      disabled.text({ feature: "shift_summary", tier: "smart", system: "", prompt: "" }),
    ).resolves.toMatchObject({ error: "disabled" });
    await expect(
      disabled.tools({ feature: "assistant", tier: "smart", system: "", messages: [], tools: [] }),
    ).resolves.toMatchObject({ error: "disabled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns validated JSON from the forced tool call", async () => {
    const { client, create } = fakeClient(
      message({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "x",
            name: STRUCTURED_TOOL_NAME,
            input: { priority: "high", confidence: 0.8 },
          },
        ],
      }),
    );
    const outcome = await provider(client).json(jsonRequest);
    expect(outcome).toEqual({
      ok: true,
      value: { priority: "high", confidence: 0.8 },
      model: "claude-haiku-5-5",
      cached: false,
      usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 1000, cacheWriteTokens: 0 },
    });
    const [body, options] = bodyOf(create);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(options.maxRetries).toBe(0);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.timeout).toBeLessThanOrEqual(10_000);
  });

  it("parses JSON text from the structured output format on the smart tier", async () => {
    const { client, create } = fakeClient(
      message({
        model: "claude-sonnet-5-5",
        content: [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "text", text: '{"priority":"normal","confidence":0.4}' },
        ],
      }),
    );
    const outcome = await provider(client).json({ ...jsonRequest, tier: "smart" });
    expect(outcome).toMatchObject({ ok: true, value: { priority: "normal" } });
    expect(bodyOf(create)[0].output_config?.format?.type).toBe("json_schema");
  });

  it("sends sanitized images", async () => {
    const { client, create } = fakeClient(
      message({ content: [{ type: "text", text: '{"priority":"normal","confidence":1}' }] }),
    );
    await provider(client).json({
      ...jsonRequest,
      images: [{ mediaType: "image/jpeg", base64: `data:image/png;base64,${PNG_BASE64}` }],
    });
    const content = bodyOf(create)[0].messages[0]?.content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: PNG_BASE64 },
    });
  });

  it("rejects unsupported images without calling the API", async () => {
    const { client, create } = fakeClient();
    const outcome = await provider(client).json({
      ...jsonRequest,
      images: [{ mediaType: "image/png", base64: "bm90IGFuIGltYWdl" }],
    });
    expect(outcome).toMatchObject({ ok: false, error: "provider_error" });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports schema mismatches as invalid responses", async () => {
    const { client } = fakeClient(
      message({ content: [{ type: "text", text: '{"priority":"urgent","confidence":2}' }] }),
    );
    const outcome = await provider(client).json(jsonRequest);
    expect(outcome).toMatchObject({
      ok: false,
      error: "invalid_response",
      model: "claude-haiku-5-5",
    });
    expect(!outcome.ok && outcome.usage?.inputTokens).toBe(120);
  });

  it("reports refusals as provider errors", async () => {
    const { client } = fakeClient(message({ stop_reason: "refusal" }));
    await expect(provider(client).json(jsonRequest)).resolves.toMatchObject({
      error: "provider_error",
      message: "Model refused the request",
    });
  });

  it("retries once after a rate limit", async () => {
    const limited = new Anthropic.RateLimitError(429, undefined, "limit", new Headers());
    const { client, create } = fakeClient(
      limited,
      message({ content: [{ type: "text", text: '{"priority":"normal","confidence":1}' }] }),
    );
    await expect(provider(client).json(jsonRequest)).resolves.toMatchObject({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("returns rate_limited when the retry also fails", async () => {
    const limited = () => new Anthropic.RateLimitError(429, undefined, "limit", new Headers());
    const { client, create } = fakeClient(limited(), limited());
    await expect(provider(client).json(jsonRequest)).resolves.toMatchObject({
      ok: false,
      error: "rate_limited",
      model: "claude-haiku-5-5",
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a bad request", async () => {
    const bad = new Anthropic.BadRequestError(400, undefined, "invalid", new Headers());
    const { client, create } = fakeClient(bad);
    await expect(provider(client).json(jsonRequest)).resolves.toMatchObject({
      error: "provider_error",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging request", async () => {
    const create = vi.fn(
      (_body: unknown, options?: Anthropic.RequestOptions) =>
        new Promise<Anthropic.Message>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Anthropic.APIUserAbortError()),
          );
        }),
    );
    const outcome = await provider({ messages: { create } }).json({
      ...jsonRequest,
      timeoutMs: 20,
    });
    expect(outcome).toMatchObject({ ok: false, error: "timeout" });
  });

  it("never throws when schema conversion fails", async () => {
    const { client } = fakeClient();
    const outcome = await provider(client).json({
      ...jsonRequest,
      schema: { safeParse: () => ({ success: true }) } as unknown as z.ZodType<never>,
    });
    expect(outcome).toMatchObject({ ok: false, error: "provider_error" });
  });

  it("returns plain text", async () => {
    const { client, create } = fakeClient(
      message({ content: [{ type: "text", text: "  Итог смены: всё в норме. " }] }),
    );
    const outcome = await provider(client).text({
      feature: "shift_summary",
      tier: "smart",
      system: "Сводка",
      prompt: "Данные",
    });
    expect(outcome).toMatchObject({ ok: true, value: "Итог смены: всё в норме." });
    expect(bodyOf(create)[0].output_config).toEqual({ effort: "medium" });
    expect(bodyOf(create)[0].model).toBe("claude-sonnet-5-5");
  });

  it("reports empty, truncated and refused text", async () => {
    const { client } = fakeClient(
      message({ content: [] }),
      message({ content: [], stop_reason: "max_tokens" }),
      message({ stop_reason: "refusal" }),
    );
    const claude = provider(client);
    const request = {
      feature: "shift_summary" as const,
      tier: "fast" as const,
      system: "",
      prompt: "x",
    };
    await expect(claude.text(request)).resolves.toMatchObject({
      error: "invalid_response",
      message: "Empty response",
    });
    await expect(claude.text(request)).resolves.toMatchObject({
      message: "Response was cut off by max_tokens",
    });
    await expect(claude.text(request)).resolves.toMatchObject({ error: "provider_error" });
  });

  it("rejects unsupported images for text", async () => {
    const { client } = fakeClient();
    await expect(
      provider(client).text({
        feature: "photo_vision",
        tier: "smart",
        system: "",
        prompt: "x",
        images: [{ mediaType: "image/png", base64: "" }],
      }),
    ).resolves.toMatchObject({ error: "provider_error" });
  });

  it("runs a tool turn with caching enabled", async () => {
    const { client, create } = fakeClient(
      message({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "list_overdue", input: {} }],
      }),
    );
    const outcome = await provider(client).tools({
      feature: "assistant",
      tier: "smart",
      system: "Ассистент мастера",
      messages: [{ role: "user", content: "Что просрочено?" }],
      tools: [{ name: "list_overdue", description: "Просрочки", inputSchema: { type: "object" } }],
    });
    expect(outcome).toMatchObject({
      ok: true,
      value: { stopReason: "tool_use", toolCalls: [{ id: "t1", name: "list_overdue" }] },
    });
    const [body] = bodyOf(create);
    expect(body.cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools).toHaveLength(1);
  });

  it("omits an empty tool list and refuses conversations that end with the assistant", async () => {
    const { client, create } = fakeClient(message({ content: [{ type: "text", text: "Привет" }] }));
    const claude = provider(client);
    await expect(
      claude.tools({
        feature: "assistant",
        tier: "fast",
        system: "",
        messages: [{ role: "assistant", content: "Здравствуйте" }],
        tools: [],
      }),
    ).resolves.toMatchObject({ error: "provider_error" });
    expect(create).not.toHaveBeenCalled();
    await expect(
      claude.tools({
        feature: "assistant",
        tier: "fast",
        system: "",
        messages: [{ role: "user", content: "Привет" }],
        tools: [],
      }),
    ).resolves.toMatchObject({ ok: true, value: { text: "Привет", stopReason: "end" } });
    expect(bodyOf(create)[0].tools).toBeUndefined();
  });

  it("reports refusals in tool turns", async () => {
    const { client } = fakeClient(message({ stop_reason: "refusal" }));
    await expect(
      provider(client).tools({
        feature: "assistant",
        tier: "fast",
        system: "",
        messages: [{ role: "user", content: "?" }],
        tools: [],
      }),
    ).resolves.toMatchObject({ error: "provider_error" });
  });

  it("exposes the configured model per tier", () => {
    const { client } = fakeClient();
    expect(provider(client).modelFor("smart")).toBe("claude-sonnet-5-5");
    expect(provider(client).modelFor("fast")).toBe("claude-haiku-5-5");
  });
});
