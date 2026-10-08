import { describe, expect, it, vi } from "vitest";
import { disabledProvider } from "@/lib/ai/provider";
import type {
  AiOutcome,
  AiProvider,
  AiToolCall,
  AiToolsRequest,
  AiToolsResponse,
} from "@/lib/ai/types";
import { buildSystemPrompt, MAX_TOOL_ROUNDS, runAssistant } from "@/lib/assistant/run";
import { FIXTURE_NOW, fakeGateway } from "@/lib/assistant/test-fixtures";

type Step = AiOutcome<AiToolsResponse>;

function scriptedProvider(steps: Step[] | ((request: AiToolsRequest) => Step)) {
  const requests: AiToolsRequest[] = [];
  const provider: AiProvider = {
    name: "mock",
    enabled: true,
    json: async () => ({ ok: false, error: "disabled", message: "" }),
    text: async () => ({ ok: false, error: "disabled", message: "" }),
    tools: async (request) => {
      requests.push(structuredClone(request));
      if (typeof steps === "function") return steps(request);
      return steps[requests.length - 1] ?? steps[steps.length - 1]!;
    },
  };
  return { provider, requests };
}

function toolUse(...calls: AiToolCall[]): Step {
  return {
    ok: true,
    value: { text: "", toolCalls: calls, stopReason: "tool_use" },
    model: "mock",
    cached: false,
  };
}

function final(text: string): Step {
  return {
    ok: true,
    value: { text, toolCalls: [], stopReason: "end" },
    model: "mock",
    cached: false,
  };
}

function ask(question: string, provider: AiProvider, options = {}) {
  return runAssistant({
    messages: [{ role: "user", content: question }],
    fallbackLocale: "ru",
    gateway: fakeGateway(options).gateway,
    provider,
    now: FIXTURE_NOW,
  });
}

describe("runAssistant without a language model", () => {
  it("answers reference questions through the router", async () => {
    const reply = await ask("Кто сейчас свободен из электриков?", disabledProvider);
    expect(reply).toMatchObject({ mode: "rules", locale: "ru", draftLink: null });
    expect(reply.text).toBe("Сейчас свободен 1 исполнитель (электрики): Петров И.");
    expect(reply.cards).toHaveLength(1);
    expect(reply.cards[0]?.kind).toBe("workers");
  });

  it("answers in Kazakh when asked in Kazakh", async () => {
    const reply = await ask("Ауысымда қандай наряд мерзімі өтті?", disabledProvider);
    expect(reply.locale).toBe("kk");
    expect(reply.text).toContain("Мерзімі өткен нарядтар: 2");
  });

  it("returns the draft link", async () => {
    const reply = await ask("Создай наряд: течь сальника на насосе Н-4", disabledProvider);
    expect(reply.draftLink).toMatch(/^\/master\/orders\/new\?draft=/);
  });

  it("offers help for unknown questions", async () => {
    const reply = await ask("Как дела?", disabledProvider);
    expect(reply).toMatchObject({ cards: [], mode: "rules" });
    expect(reply.text).toContain("Например");
  });

  it("reports data failures politely", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reply = await ask("Что просрочено?", disabledProvider, { failOn: "openOrders" });
    expect(reply.text).toContain("Не удалось получить данные");
    spy.mockRestore();
  });

  it("uses the last user message of the conversation", async () => {
    const reply = await runAssistant({
      messages: [
        { role: "user", content: "Что просрочено?" },
        { role: "assistant", content: "Просрочено 2 наряда." },
        { role: "user", content: "Отчёт за смену" },
      ],
      fallbackLocale: "ru",
      gateway: fakeGateway().gateway,
      provider: disabledProvider,
      now: FIXTURE_NOW,
    });
    expect(reply.cards[0]?.kind).toBe("shift_report");
  });
});

describe("runAssistant with a language model", () => {
  it("runs tools and returns the model's answer with cards", async () => {
    const { provider, requests } = scriptedProvider([
      toolUse({ id: "t1", name: "list_overdue", input: {} }),
      final("Просрочено два наряда, дольше всех №101."),
    ]);
    const reply = await ask("Что горит?", provider);
    expect(reply).toMatchObject({ mode: "ai", text: "Просрочено два наряда, дольше всех №101." });
    expect(reply.cards.map((card) => card.kind)).toEqual(["overdue"]);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ feature: "assistant", tier: "fast" });
    expect(requests[0]?.tools).toHaveLength(6);
    const toolMessage = requests[1]?.messages.find((message) => message.role === "tool");
    expect(toolMessage).toMatchObject({ role: "tool", toolCallId: "t1" });
    const content = toolMessage?.role === "tool" ? toolMessage.content : "";
    expect(content).toContain("Ахметов Е.");
    expect(content).not.toMatch(/Маратович|"id"/);
  });

  it("feeds tool errors back to the model", async () => {
    const { provider, requests } = scriptedProvider([
      toolUse({ id: "t1", name: "equipment_history", input: {} }),
      final("Уточните оборудование."),
    ]);
    const reply = await ask("История", provider);
    expect(reply.cards).toEqual([]);
    const toolMessage = requests[1]?.messages.at(-1);
    expect(toolMessage).toEqual({
      role: "tool",
      toolCallId: "t1",
      content: '{"error":"invalid_input"}',
    });
  });

  it("stops after the maximum number of tool rounds", async () => {
    let counter = 0;
    const { provider, requests } = scriptedProvider(() => {
      counter += 1;
      return toolUse({ id: `t${counter}`, name: "list_overdue", input: { site: `${counter}` } });
    });
    const reply = await ask("Что просрочено?", provider);
    expect(requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(reply.mode).toBe("ai");
    expect(reply.text.length).toBeGreaterThan(0);
  });

  it("answers every tool call even beyond the per-round limit", async () => {
    const calls = Array.from({ length: 6 }, (_, index) => ({
      id: `c${index}`,
      name: "shift_report",
      input: {},
    }));
    const { provider, requests } = scriptedProvider([toolUse(...calls), final("Готово.")]);
    const reply = await ask("Отчёт", provider);
    const results = requests[1]?.messages.filter((message) => message.role === "tool") ?? [];
    expect(results).toHaveLength(6);
    expect(results.at(-1)).toMatchObject({ content: '{"error":"skipped"}' });
    expect(reply.cards).toHaveLength(1);
  });

  it("formats the cards when the model returns no text", async () => {
    const { provider } = scriptedProvider([
      toolUse({ id: "t1", name: "find_free_workers", input: { specialty: "electrician" } }),
      final("   "),
    ]);
    const reply = await ask("Кто свободен?", provider);
    expect(reply.text).toBe("Сейчас свободен 1 исполнитель (электрики): Петров И.");
  });

  it("falls back to the router when the model is unavailable", async () => {
    const { provider } = scriptedProvider([{ ok: false, error: "timeout", message: "slow" }]);
    const reply = await ask("Что просрочено на смене?", provider);
    expect(reply.mode).toBe("rules");
    expect(reply.cards[0]?.kind).toBe("overdue");
  });

  it("keeps collected cards when the model fails mid-way", async () => {
    const { provider } = scriptedProvider([
      toolUse({ id: "t1", name: "list_overdue", input: {} }),
      { ok: false, error: "provider_error", message: "boom" },
    ]);
    const reply = await ask("Что горит?", provider);
    expect(reply.mode).toBe("rules");
    expect(reply.text).toContain("Просрочено 2 наряда");
  });

  it("returns the draft link proposed by the model", async () => {
    const { provider } = scriptedProvider([
      toolUse({
        id: "t1",
        name: "create_work_order_draft",
        input: { description: "Порыв ленты", equipment: "К-3", priority: "emergency" },
      }),
      final("Черновик готов, проверьте и создайте наряд."),
    ]);
    const reply = await ask("Оформи наряд на К-3, порыв ленты", provider);
    expect(reply.draftLink).toMatch(/^\/master\/orders\/new\?draft=/);
  });
});

describe("buildSystemPrompt", () => {
  it("describes role, rules, language and plant context", () => {
    const prompt = buildSystemPrompt({
      now: FIXTURE_NOW,
      locale: "kk",
      sites: ["Дробление", "Обогащение"],
    });
    expect(prompt).toContain("Ассистент мастера");
    expect(prompt).toContain("только из результатов инструментов");
    expect(prompt).toContain("казахский");
    expect(prompt).toContain("Дробление, Обогащение");
    expect(prompt).toContain("дневная смена");
    expect(buildSystemPrompt({ now: FIXTURE_NOW, locale: "ru", sites: [] })).toContain(
      "нет данных",
    );
  });
});
