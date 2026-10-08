import { describe, expect, it, vi } from "vitest";
import type { AiProvider, AiTextRequest } from "@/lib/ai/types";
import { DEFAULT_RATING_WEIGHTS } from "@/lib/rating/formula";
import {
  explainRating,
  explanationLines,
  templateExplanation,
  weakestComponent,
  type ExplainableRating,
} from "@/lib/rating/explain";

function rating(overrides: Partial<ExplainableRating> = {}): ExplainableRating {
  return {
    score: 72.4,
    components: { quality: 86, onTime: 80, noRework: 60, volume: 55, refusalPenalty: 2.5 },
    contributions: { quality: 34.4, onTime: 20, noRework: 12, volume: 8.3 },
    closedCount: 10,
    onTimeCount: 8,
    cleanCount: 6,
    repeatCount: 1,
    reworkedCount: 2,
    workload: 23.75,
    unexcusedRefusals: 1,
    ...overrides,
  };
}

function provider(text: (request: AiTextRequest) => Promise<string | null>): AiProvider {
  return {
    name: "mock",
    enabled: true,
    json: async () => ({ ok: false, error: "disabled", message: "" }),
    tools: async () => ({ ok: false, error: "disabled", message: "" }),
    text: async (request) => {
      const value = await text(request);
      return value === null
        ? { ok: false, error: "provider_error", message: "down" }
        : { ok: true, value, model: "fast", cached: false };
    },
  };
}

describe("templateExplanation", () => {
  it("explains every component in Russian", () => {
    const { lines, source } = templateExplanation(rating(), DEFAULT_RATING_WEIGHTS, "ru");
    expect(source).toBe("template");
    expect(lines).toEqual([
      "Итоговый рейтинг — 72,4 из 100 по 10 закрытым нарядам.",
      "Качество 86 → 34,4 балла из 40: это средняя оценка ИИ и мастера.",
      "В срок 8 из 10 → 20 баллов из 25.",
      "Без доработок и повторных поломок 6 из 10 → 12 баллов из 20.",
      "2 наряда вернулись на доработку.",
      "После 1 наряда оборудование снова сломалось в течение 7 дней.",
      "Объём и сложность: 23,8 нормо-часа (55% от лучшего результата) → 8,3 балла из 15.",
      "1 отказ без уважительной причины → −2,5.",
      "Резерв роста — доработки: проверяйте результат перед сдачей, чтобы наряд не возвращался.",
    ]);
  });

  it("uses the same structure in Kazakh", () => {
    const ru = templateExplanation(rating(), DEFAULT_RATING_WEIGHTS, "ru");
    const kk = templateExplanation(rating(), DEFAULT_RATING_WEIGHTS, "kk");
    expect(kk.lines).toHaveLength(ru.lines.length);
    expect(kk.lines[1]).toBe("Сапа 86 → 40 ұпайдан 34,4 ұпай: бұл ЖИ мен шебердің орташа бағасы.");
    expect(kk.text).toContain("Дәлелді себепсіз бас тарту: 1 → −2,5.");
  });

  it("explains an empty period", () => {
    const empty = rating({
      closedCount: 0,
      score: 0,
      unexcusedRefusals: 0,
      components: { quality: 0, onTime: 0, noRework: 0, volume: 0, refusalPenalty: 0 },
      contributions: { quality: 0, onTime: 0, noRework: 0, volume: 0 },
    });
    expect(templateExplanation(empty, DEFAULT_RATING_WEIGHTS, "ru").lines).toEqual([
      "За выбранный период нет закрытых нарядов, поэтому рейтинг равен нулю.",
    ]);
  });

  it("skips optional lines for a clean record", () => {
    const keys = explanationLines(
      rating({
        score: 100,
        reworkedCount: 0,
        repeatCount: 0,
        unexcusedRefusals: 0,
        contributions: { quality: 40, onTime: 25, noRework: 20, volume: 15 },
      }),
      DEFAULT_RATING_WEIGHTS,
    ).map((line) => line.key);
    expect(keys).toEqual(["summary", "quality", "onTime", "noRework", "volume"]);
  });
});

describe("weakestComponent", () => {
  it("points at the component with the largest gap", () => {
    expect(weakestComponent(rating(), DEFAULT_RATING_WEIGHTS)).toBe("noRework");
    expect(
      weakestComponent(
        rating({ contributions: { quality: 10, onTime: 25, noRework: 20, volume: 15 } }),
        DEFAULT_RATING_WEIGHTS,
      ),
    ).toBe("quality");
  });
});

describe("explainRating", () => {
  it("falls back to the template when the provider is disabled", async () => {
    const result = await explainRating({
      rating: rating(),
      weights: DEFAULT_RATING_WEIGHTS,
      locale: "ru",
    });
    expect(result.source).toBe("template");
  });

  it("uses the fast model text and keeps the prompt anonymous", async () => {
    const calls: AiTextRequest[] = [];
    const llm = provider(async (request) => {
      calls.push(request);
      return "Ваш рейтинг 72,4: качество высокое, но два наряда вернулись на доработку.";
    });
    const result = await explainRating({
      rating: rating(),
      weights: DEFAULT_RATING_WEIGHTS,
      locale: "kk",
      cacheKey: "rating:test",
      provider: llm,
    });
    expect(result).toMatchObject({ source: "llm" });
    expect(calls[0]).toMatchObject({
      tier: "fast",
      feature: "rating_explanation",
      cacheKey: "rating:test",
    });
    expect(calls[0]?.prompt).toContain("казахском");
    expect(calls[0]?.prompt).not.toMatch(/[А-Я][а-я]+ [А-Я][а-я]+ович/);
  });

  it("rejects failures and answers without the score", async () => {
    const failing = provider(async () => null);
    const vague = provider(async () => "У вас всё хорошо, продолжайте в том же духе!");
    const throwing = provider(async () => {
      throw new Error("network");
    });
    for (const llm of [failing, vague, throwing]) {
      const result = await explainRating({
        rating: rating(),
        weights: DEFAULT_RATING_WEIGHTS,
        locale: "ru",
        provider: llm,
      });
      expect(result.source).toBe("template");
    }
  });

  it("does not call the model for an empty period", async () => {
    const text = vi.fn(async () => "Рейтинг 0");
    await explainRating({
      rating: rating({ closedCount: 0 }),
      weights: DEFAULT_RATING_WEIGHTS,
      locale: "ru",
      provider: provider(text),
    });
    expect(text).not.toHaveBeenCalled();
  });
});
