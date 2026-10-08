import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MOCK_MODELS,
  MockProvider,
  registerMockDefault,
  resetMockFixtures,
  sampleFromJsonSchema,
  sampleFromSchema,
  setMockFixture,
} from "@/lib/ai/mock";

afterEach(() => {
  resetMockFixtures();
});

const review = z.object({
  verdict: z.enum(["accepted", "needs_master", "rejected"]),
  score: z.number().int().min(0).max(100),
  stars: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  good: z.array(z.string()).max(5),
  improve: z.array(z.string().min(10)).min(2),
  note: z.string().nullable(),
  reviewedAt: z.string().datetime(),
  id: z.string().uuid(),
  flag: z.boolean(),
  mode: z.literal("llm"),
  optional: z.string().optional(),
  extra: z.object({ code: z.string().max(2) }),
});

describe("sampleFromSchema", () => {
  it("builds a deterministic value that passes the schema", () => {
    const value = sampleFromSchema(review);
    expect(review.safeParse(value).success).toBe(true);
    expect(value).toEqual(sampleFromSchema(review));
    expect(value).toMatchObject({
      verdict: "accepted",
      score: 0,
      stars: 1,
      flag: false,
      mode: "llm",
      extra: { code: "Де" },
    });
    expect(value).not.toHaveProperty("optional");
  });

  it("handles roots, defaults, refs and edge numbers", () => {
    expect(sampleFromSchema(z.array(z.number()).min(2))).toEqual([0, 0]);
    expect(sampleFromSchema(z.number().default(7))).toBe(7);
    expect(sampleFromJsonSchema({ type: "integer", exclusiveMinimum: 3 })).toBe(4);
    expect(sampleFromJsonSchema({ type: "number", exclusiveMinimum: 3 })).toBe(3.5);
    expect(sampleFromJsonSchema({ type: "integer", maximum: -2.5 })).toBe(-3);
    expect(sampleFromJsonSchema({ type: "number", exclusiveMaximum: -1 })).toBe(-1.5);
    expect(sampleFromJsonSchema({ type: "integer", exclusiveMaximum: 0 })).toBe(-1);
    expect(sampleFromJsonSchema({ type: ["null", "string"] })).toBe("Демо");
    expect(sampleFromJsonSchema({ type: "null" })).toBeNull();
    expect(sampleFromJsonSchema({ oneOf: [{ type: "boolean" }] })).toBe(false);
    expect(sampleFromJsonSchema({ anyOf: [{ type: "null" }] })).toBeNull();
    expect(
      sampleFromJsonSchema({ $defs: { a: { type: "string", format: "date" } }, $ref: "#/$defs/a" }),
    ).toBe("2026-01-01");
    expect(sampleFromJsonSchema({ $ref: "#/$defs/missing" })).toBeNull();
    expect(sampleFromJsonSchema({ type: "string" }, {}, 99)).toBeNull();
    expect(sampleFromJsonSchema({})).toBeNull();
  });
});

describe("MockProvider", () => {
  const provider = new MockProvider();

  it("is always enabled and names its models", () => {
    expect(provider.enabled).toBe(true);
    expect(provider.name).toBe("mock");
    expect(provider.modelFor("smart")).toBe(MOCK_MODELS.smart);
  });

  it("returns a schema-valid value for features without fixtures", async () => {
    const outcome = await provider.json({
      feature: "order_review",
      tier: "smart",
      system: "s",
      prompt: "p",
      schema: review,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.model).toBe("mock-smart");
    expect(outcome.ok && outcome.usage?.inputTokens).toBe(1);
  });

  it("uses overrides and restores the previous fixture", async () => {
    const schema = z.object({ verdict: z.string() });
    const request = {
      feature: "order_review" as const,
      tier: "fast" as const,
      system: "",
      prompt: "",
      schema,
    };
    const restoreFirst = setMockFixture("order_review", { json: () => ({ verdict: "first" }) });
    const restoreSecond = setMockFixture("order_review", { json: () => ({ verdict: "second" }) });
    await expect(provider.json(request)).resolves.toMatchObject({ value: { verdict: "second" } });
    restoreSecond();
    await expect(provider.json(request)).resolves.toMatchObject({ value: { verdict: "first" } });
    restoreFirst();
    await expect(provider.json(request)).resolves.toMatchObject({ value: { verdict: "Демо" } });
  });

  it("prefers instance fixtures over global overrides", async () => {
    setMockFixture("shift_summary", { text: () => "global" });
    const local = new MockProvider({ fixtures: { shift_summary: { text: () => "local" } } });
    const request = {
      feature: "shift_summary" as const,
      tier: "smart" as const,
      system: "",
      prompt: "",
    };
    await expect(local.text(request)).resolves.toMatchObject({ value: "local" });
    await expect(provider.text(request)).resolves.toMatchObject({ value: "global" });
  });

  it("reports fixture values that break the schema", async () => {
    setMockFixture("order_review", { json: () => ({ verdict: 1 }) });
    await expect(
      provider.json({
        feature: "order_review",
        tier: "fast",
        system: "",
        prompt: "",
        schema: z.object({ verdict: z.string() }),
      }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_response" });
  });

  it("simulates failures for every call kind", async () => {
    setMockFixture("assistant", { failure: "timeout" });
    await expect(
      provider.json({
        feature: "assistant",
        tier: "fast",
        system: "",
        prompt: "",
        schema: z.string(),
      }),
    ).resolves.toMatchObject({ error: "timeout" });
    await expect(
      provider.text({ feature: "assistant", tier: "fast", system: "", prompt: "" }),
    ).resolves.toMatchObject({ error: "timeout" });
    await expect(
      provider.tools({ feature: "assistant", tier: "fast", system: "", messages: [], tools: [] }),
    ).resolves.toMatchObject({ error: "timeout" });
  });

  it("turns throwing fixtures into provider errors", async () => {
    const boom = () => {
      throw new Error("fixture exploded");
    };
    setMockFixture("insight_text", { json: boom, text: boom, tools: boom });
    await expect(
      provider.json({
        feature: "insight_text",
        tier: "fast",
        system: "",
        prompt: "",
        schema: z.string(),
      }),
    ).resolves.toMatchObject({ error: "provider_error", message: "fixture exploded" });
    await expect(
      provider.text({ feature: "insight_text", tier: "fast", system: "", prompt: "" }),
    ).resolves.toMatchObject({ error: "provider_error" });
    await expect(
      provider.tools({
        feature: "insight_text",
        tier: "fast",
        system: "",
        messages: [],
        tools: [],
      }),
    ).resolves.toMatchObject({ error: "provider_error" });
  });

  it("ships readable default texts", async () => {
    const outcome = await provider.text({
      feature: "acoustic_text",
      tier: "fast",
      system: "",
      prompt: "",
    });
    expect(outcome).toMatchObject({ ok: true, value: expect.stringContaining("вибрации") });
    await expect(
      provider.text({ feature: "photo_vision", tier: "fast", system: "", prompt: "" }),
    ).resolves.toMatchObject({ value: "Готово." });
  });

  it("answers tool requests with text or fixture tool calls", async () => {
    const plain = await provider.tools({
      feature: "assistant",
      tier: "smart",
      system: "",
      messages: [{ role: "user", content: "Привет" }],
      tools: [],
    });
    expect(plain).toMatchObject({
      ok: true,
      value: {
        text: "Готово.",
        stopReason: "end",
        assistantMessage: { role: "assistant", content: "Готово." },
      },
    });
    setMockFixture("assistant", {
      tools: (request) => ({
        text: "",
        toolCalls: [{ id: "m1", name: request.tools[0]?.name ?? "none", input: {} }],
        stopReason: "tool_use",
      }),
    });
    const withCall = await provider.tools({
      feature: "assistant",
      tier: "smart",
      system: "",
      messages: [{ role: "user", content: "Что просрочено?" }],
      tools: [{ name: "list_overdue", description: "", inputSchema: {} }],
    });
    expect(withCall).toMatchObject({
      value: { stopReason: "tool_use", toolCalls: [{ name: "list_overdue" }] },
    });
  });

  it("passes the last user message to text fixtures in tool mode", async () => {
    setMockFixture("assistant", { text: (request) => `echo:${request.prompt}` });
    await expect(
      provider.tools({
        feature: "assistant",
        tier: "smart",
        system: "",
        messages: [
          { role: "user", content: "первый" },
          { role: "assistant", content: "ок" },
          { role: "user", content: "второй" },
        ],
        tools: [],
      }),
    ).resolves.toMatchObject({ value: { text: "echo:второй" } });
  });

  it("merges registered defaults", async () => {
    registerMockDefault("rca_draft", { json: () => ({ cause: "износ" }) });
    const outcome = await provider.json({
      feature: "rca_draft",
      tier: "smart",
      system: "",
      prompt: "",
      schema: z.object({ cause: z.string() }),
    });
    expect(outcome).toMatchObject({ value: { cause: "износ" } });
    await expect(
      provider.text({ feature: "rca_draft", tier: "smart", system: "", prompt: "" }),
    ).resolves.toMatchObject({ value: expect.stringContaining("износ узла") });
  });
});
