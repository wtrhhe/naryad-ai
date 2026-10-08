import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  OllamaHttpError,
  OllamaProvider,
  OllamaResponseError,
  classifyOllamaError,
  jsonInstruction,
  toOllamaMessages,
  toOllamaTools,
  toOllamaToolsResponse,
  toOllamaUsage,
  type OllamaChatBody,
} from "@/lib/ai/ollama";

const PNG_BASE64 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("IEND", "latin1"),
  Buffer.alloc(4),
]).toString("base64");

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function chatReply(content: string, extra: Record<string, unknown> = {}) {
  return jsonResponse({
    model: "qwen2.5vl:7b",
    message: { role: "assistant", content },
    done_reason: "stop",
    prompt_eval_count: 200,
    eval_count: 40,
    ...extra,
  });
}

function fakeFetch(...responses: (Response | Error)[]) {
  const mock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) {
      throw new Error("no more responses");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  return mock;
}

function provider(fetchImpl: ReturnType<typeof fakeFetch>) {
  return new OllamaProvider({
    baseUrl: "http://ollama.local:11434/",
    model: "qwen2.5vl:7b",
    fetch: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
  });
}

function sentBody(fetchImpl: ReturnType<typeof fakeFetch>, index = 0): OllamaChatBody {
  const init = fetchImpl.mock.calls[index]?.[1];
  return JSON.parse(String(init?.body)) as OllamaChatBody;
}

const schema = z.object({ verdict: z.enum(["ok", "bad"]), score: z.number().min(0).max(5) });

describe("classifyOllamaError", () => {
  it("maps HTTP failures", () => {
    expect(classifyOllamaError(new OllamaHttpError(429, "busy", 1000))).toEqual({
      code: "rate_limited",
      retryable: true,
      message: "HTTP 429: busy",
      retryAfterMs: 1000,
    });
    expect(classifyOllamaError(new OllamaHttpError(503, "loading"))).toMatchObject({
      code: "provider_error",
      retryable: true,
    });
    expect(classifyOllamaError(new OllamaHttpError(404, "model not found"))).toMatchObject({
      code: "provider_error",
      retryable: false,
    });
  });

  it("maps transport, timeout and parsing failures", () => {
    expect(classifyOllamaError(new TypeError("fetch failed"))).toMatchObject({
      code: "provider_error",
      retryable: true,
    });
    expect(classifyOllamaError(new DOMException("aborted", "AbortError"))).toMatchObject({
      code: "timeout",
    });
    expect(classifyOllamaError(new OllamaResponseError("bad body"))).toMatchObject({
      code: "invalid_response",
      retryable: false,
    });
    expect(classifyOllamaError("weird")).toMatchObject({
      code: "provider_error",
      retryable: false,
    });
  });
});

describe("message mapping", () => {
  it("maps history with tool calls and resolves tool names", () => {
    expect(
      toOllamaMessages("Система", [
        { role: "user", content: "Что просрочено?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "a", name: "list_overdue", input: { site: "CRUSH" } },
            { id: "b", name: "shift_report", input: 1 },
          ],
        },
        { role: "tool", toolCallId: "a", content: "[]" },
        { role: "tool", toolCallId: "b", content: "нет данных", isError: true },
        { role: "tool", toolCallId: "zzz", content: "?" },
        { role: "assistant", content: "Готово" },
      ]),
    ).toEqual([
      { role: "system", content: "Система" },
      { role: "user", content: "Что просрочено?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { function: { name: "list_overdue", arguments: { site: "CRUSH" } } },
          { function: { name: "shift_report", arguments: {} } },
        ],
      },
      { role: "tool", content: "[]", tool_name: "list_overdue" },
      { role: "tool", content: "Error: нет данных", tool_name: "shift_report" },
      { role: "tool", content: "?" },
      { role: "assistant", content: "Готово" },
    ]);
    expect(toOllamaMessages(" ", [])).toEqual([]);
  });

  it("maps tool definitions", () => {
    expect(
      toOllamaTools([
        {
          name: "find_free_workers",
          description: "Свободные",
          inputSchema: { $schema: "x", properties: {} },
        },
      ]),
    ).toEqual([
      {
        type: "function",
        function: {
          name: "find_free_workers",
          description: "Свободные",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("maps tool responses with generated ids and string arguments", () => {
    const response = toOllamaToolsResponse(
      {
        message: {
          content: " ",
          tool_calls: [
            { function: { name: "a", arguments: '{"x":1}' } },
            { id: "given", function: { name: "b", arguments: "broken" } },
            { function: { name: "c", arguments: null } },
          ],
        },
      },
      "m",
      3,
    );
    expect(response.toolCalls).toEqual([
      { id: "ollama-3-0", name: "a", input: { x: 1 } },
      { id: "given", name: "b", input: {} },
      { id: "ollama-3-2", name: "c", input: {} },
    ]);
    expect(response.stopReason).toBe("tool_use");
    expect(response.assistantMessage).toMatchObject({ providerContent: { provider: "ollama" } });
    expect(toOllamaToolsResponse({ done_reason: "length" }, "m", 0).stopReason).toBe("max_tokens");
    expect(toOllamaToolsResponse({ message: { content: "ok" } }, "m", 0)).toMatchObject({
      text: "ok",
      stopReason: "end",
    });
  });

  it("reads token counters", () => {
    expect(toOllamaUsage({ prompt_eval_count: 3, eval_count: 4 })).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(toOllamaUsage({}).inputTokens).toBe(0);
  });
});

describe("OllamaProvider", () => {
  it("is disabled without a model", async () => {
    const fetchImpl = fakeFetch();
    const disabled = new OllamaProvider({ baseUrl: "http://x", model: " ", fetch: fetchImpl });
    expect(disabled.enabled).toBe(false);
    await expect(
      disabled.json({ feature: "order_review", tier: "smart", system: "", prompt: "", schema }),
    ).resolves.toMatchObject({ error: "disabled" });
    await expect(
      disabled.text({ feature: "shift_summary", tier: "smart", system: "", prompt: "" }),
    ).resolves.toMatchObject({ error: "disabled" });
    await expect(
      disabled.tools({ feature: "assistant", tier: "smart", system: "", messages: [], tools: [] }),
    ).resolves.toMatchObject({ error: "disabled" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requests JSON with the schema as format and validates the answer", async () => {
    const fetchImpl = fakeFetch(chatReply('{"verdict":"ok","score":4}'));
    const outcome = await provider(fetchImpl).json({
      feature: "photo_vision",
      tier: "smart",
      system: "Проверка фото",
      prompt: "Оцени",
      schema,
      images: [{ mediaType: "image/png", base64: PNG_BASE64 }],
    });
    expect(outcome).toEqual({
      ok: true,
      value: { verdict: "ok", score: 4 },
      model: "qwen2.5vl:7b",
      cached: false,
      usage: { inputTokens: 200, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://ollama.local:11434/api/chat");
    const body = sentBody(fetchImpl);
    expect(body.stream).toBe(false);
    expect(body.format).toMatchObject({ type: "object", required: ["verdict", "score"] });
    expect(body.options).toEqual({ temperature: 0, num_predict: 8000 });
    expect(body.messages[0]).toEqual({ role: "system", content: "Проверка фото" });
    expect(body.messages[1]?.images).toEqual([PNG_BASE64]);
    expect(body.messages[1]?.content).toContain(jsonInstruction(body.format ?? {}));
  });

  it("reports invalid, truncated and mismatching JSON", async () => {
    const fetchImpl = fakeFetch(
      chatReply("не json"),
      chatReply('{"verdict":', { done_reason: "length" }),
      chatReply('{"verdict":"maybe","score":9}'),
    );
    const ollama = provider(fetchImpl);
    const request = {
      feature: "order_review" as const,
      tier: "fast" as const,
      system: "",
      prompt: "x",
      schema,
    };
    await expect(ollama.json(request)).resolves.toMatchObject({
      error: "invalid_response",
      message: "Response is not valid JSON",
    });
    await expect(ollama.json(request)).resolves.toMatchObject({
      message: "Response was cut off by num_predict",
    });
    await expect(ollama.json(request)).resolves.toMatchObject({ error: "invalid_response" });
  });

  it("rejects unsupported images before calling Ollama", async () => {
    const fetchImpl = fakeFetch();
    const ollama = provider(fetchImpl);
    const images = [{ mediaType: "image/png" as const, base64: "AAAA" }];
    await expect(
      ollama.json({
        feature: "photo_vision",
        tier: "smart",
        system: "",
        prompt: "",
        schema,
        images,
      }),
    ).resolves.toMatchObject({ error: "provider_error" });
    await expect(
      ollama.text({ feature: "photo_vision", tier: "smart", system: "", prompt: "", images }),
    ).resolves.toMatchObject({ error: "provider_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries a 503 once and surfaces HTTP errors", async () => {
    const fetchImpl = fakeFetch(
      jsonResponse({ error: "loading model" }, 503),
      chatReply("Готово"),
      jsonResponse({ error: "model 'x' not found" }, 404),
    );
    const ollama = provider(fetchImpl);
    const request = {
      feature: "shift_summary" as const,
      tier: "fast" as const,
      system: "",
      prompt: "x",
    };
    await expect(ollama.text(request)).resolves.toMatchObject({ ok: true, value: "Готово" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(ollama.text(request)).resolves.toMatchObject({
      error: "provider_error",
      message: "HTTP 404: model 'x' not found",
      model: "qwen2.5vl:7b",
    });
  });

  it("maps rate limits, broken bodies and unreachable servers", async () => {
    const fetchImpl = fakeFetch(
      jsonResponse("busy", 429, { "retry-after": "99" }),
      jsonResponse("<html>", 200),
      jsonResponse({ message: 5 }, 200),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
    );
    const ollama = provider(fetchImpl);
    const request = {
      feature: "shift_summary" as const,
      tier: "fast" as const,
      system: "",
      prompt: "x",
    };
    await expect(ollama.text(request)).resolves.toMatchObject({
      error: "rate_limited",
      message: "HTTP 429: busy",
    });
    await expect(ollama.text(request)).resolves.toMatchObject({ error: "invalid_response" });
    await expect(ollama.text(request)).resolves.toMatchObject({ error: "invalid_response" });
    await expect(ollama.text(request)).resolves.toMatchObject({ error: "provider_error" });
  });

  it("reports an empty text answer", async () => {
    const fetchImpl = fakeFetch(chatReply("   "));
    await expect(
      provider(fetchImpl).text({ feature: "insight_text", tier: "smart", system: "", prompt: "x" }),
    ).resolves.toMatchObject({ error: "invalid_response", message: "Empty response" });
  });

  it("times out a hanging request", async () => {
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const ollama = new OllamaProvider({
      baseUrl: "http://x",
      model: "m",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      ollama.text({
        feature: "insight_text",
        tier: "fast",
        system: "",
        prompt: "x",
        timeoutMs: 20,
      }),
    ).resolves.toMatchObject({ error: "timeout" });
  });

  it("runs a tool turn", async () => {
    const fetchImpl = fakeFetch(
      jsonResponse({
        model: "qwen2.5vl:7b",
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "list_overdue", arguments: { site: "CRUSH" } } }],
        },
        done_reason: "stop",
      }),
    );
    const outcome = await provider(fetchImpl).tools({
      feature: "assistant",
      tier: "smart",
      system: "Ассистент",
      messages: [{ role: "user", content: "Что просрочено?" }],
      tools: [{ name: "list_overdue", description: "Просрочки", inputSchema: {} }],
    });
    expect(outcome).toMatchObject({
      ok: true,
      value: {
        stopReason: "tool_use",
        toolCalls: [{ id: "ollama-1-0", name: "list_overdue", input: { site: "CRUSH" } }],
      },
    });
    const body = sentBody(fetchImpl);
    expect(body.tools).toHaveLength(1);
    expect(body.messages).toHaveLength(2);
  });

  it("omits tools when none are given and reports failures", async () => {
    const fetchImpl = fakeFetch(chatReply("Привет"), jsonResponse("down", 400));
    const ollama = provider(fetchImpl);
    const request = {
      feature: "assistant" as const,
      tier: "fast" as const,
      system: "",
      messages: [{ role: "user" as const, content: "Привет" }],
      tools: [],
    };
    await expect(ollama.tools(request)).resolves.toMatchObject({ ok: true });
    expect(sentBody(fetchImpl).tools).toBeUndefined();
    await expect(ollama.tools(request)).resolves.toMatchObject({ error: "provider_error" });
  });

  it("never throws on unexpected errors", async () => {
    const ollama = provider(fakeFetch());
    const broken = { safeParse: () => ({ success: true }) } as unknown as z.ZodType<never>;
    await expect(
      ollama.json({
        feature: "order_review",
        tier: "fast",
        system: "",
        prompt: "",
        schema: broken,
      }),
    ).resolves.toMatchObject({ error: "provider_error" });
  });

  it("uses one model for both tiers", () => {
    const ollama = provider(fakeFetch());
    expect(ollama.modelFor("smart")).toBe("qwen2.5vl:7b");
    expect(ollama.modelFor("fast")).toBe("qwen2.5vl:7b");
  });
});
