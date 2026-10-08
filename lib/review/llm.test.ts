import { describe, expect, it, vi } from "vitest";
import type { AiJsonRequest, AiOutcome, AiProvider } from "@/lib/ai/types";
import { disabledProvider } from "@/lib/ai/provider";
import { reviewContext, settings, withOrder } from "@/lib/review/__fixtures__/context";
import { runChecks } from "@/lib/review/checks";
import {
  buildReviewPayload,
  buildReviewPrompt,
  llmReviewSchema,
  mergeLlmReview,
  REVIEW_SYSTEM_PROMPT,
  reviewCacheKey,
  reviewWithLlm,
  type LlmReview,
  type LlmReviewInput,
} from "@/lib/review/llm";
import { scoreChecks } from "@/lib/review/score";
import type { ReviewContext } from "@/lib/review/types";

const people = [
  { fullName: "Ахметов Ерлан Серикович", alias: "И-1" },
  { fullName: "Петров Иван", alias: "М-1" },
];

function input(context: ReviewContext = reviewContext()): LlmReviewInput {
  const checks = runChecks(context, settings);
  return { context, checks, rules: scoreChecks(checks), people };
}

function llm(overrides: Partial<LlmReview> = {}): LlmReview {
  return {
    verdict: "accepted",
    score: 91,
    confidence: 0.86,
    strengths: ["Сальник заменён по технологии"],
    improvements: [],
    worker_explanation: "Работа выполнена качественно, замечаний нет.",
    master_explanation: "Работы соответствуют проблеме и шифру М-05.",
    problem_matches_work: true,
    notes: "",
    ...overrides,
  };
}

function provider(outcome: AiOutcome<unknown> | Error): AiProvider & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    name: "mock",
    enabled: true,
    calls,
    json: async <T>(request: AiJsonRequest<T>) => {
      calls.push(request);
      if (outcome instanceof Error) throw outcome;
      return outcome as AiOutcome<T>;
    },
    text: async () => ({ ok: false, error: "disabled", message: "" }),
    tools: async () => ({ ok: false, error: "disabled", message: "" }),
  };
}

const lockoutMissing = () => input(reviewContext({ lockouts: [] }));

describe("review payload", () => {
  it("replaces people names with codes", () => {
    const context = withOrder({
      description: "Ахметов сообщил о течи, звонить +7 701 123 45 67",
      workPerformed: "Ерлан Серикович заменил набивку вместе с мастером Петровым Иваном",
      closeComment: "Проверил Петров Иван",
    });
    const prompt = buildReviewPrompt(input(context));
    expect(prompt).not.toMatch(/Ахметов|Ерлан|Серикович|Петров Иван|701/);
    expect(prompt).toContain("И-1 сообщил о течи, звонить [phone]");
    expect(prompt).toContain("Проверил М-1");
  });

  it("includes the fault code, materials with norms, time and check results", () => {
    const payload = buildReviewPayload(input());
    expect(payload.order).toMatchObject({ executor: "И-1", master: "М-1", number: 501 });
    expect(payload.fault_code).toMatchObject({ code: "М-05", category: "mechanical" });
    expect(payload.materials[0]).toMatchObject({
      quantity: 0.5,
      norm: { min: 0.3, typical: 0.5, max: 0.8 },
      history_median: 0.5,
    });
    expect(payload.time).toEqual({ actual_hours: 3, standard_hours: 3, late_minutes: 0 });
    expect(payload.checks).toHaveLength(7);
    expect(payload.rules_result).toEqual({ score: 100, verdict: "accepted" });
  });

  it("handles an order without a fault code or timestamps", () => {
    const payload = buildReviewPayload(
      input(withOrder({ startedAt: null, closeComment: null }, { faultCode: null })),
    );
    expect(payload.fault_code).toBeNull();
    expect(payload.time.actual_hours).toBeNull();
    expect(payload.order.worker_comment).toBeNull();
  });

  it("instructs the model about the fail cap and score bands", () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain("status fail, verdict = rework");
    expect(REVIEW_SYSTEM_PROMPT).toContain("accepted_with_remarks — 60–79");
  });
});

describe("mergeLlmReview", () => {
  it("keeps the model verdict when no check failed", () => {
    const { rules, checks } = input();
    const merged = mergeLlmReview(rules, checks, llm(), "smart-model", settings);
    expect(merged).toMatchObject({
      verdict: "accepted",
      score: 91,
      rating: 5,
      confidence: 0.86,
      needsMasterReview: false,
      usedLlm: true,
      model: "smart-model",
      problemMatchesWork: true,
      notes: null,
      improvements: [],
      strengths: ["Сальник заменён по технологии"],
    });
  });

  it("lets the model lower the verdict", () => {
    const { rules, checks } = input();
    const merged = mergeLlmReview(
      rules,
      checks,
      llm({ verdict: "rework", score: 45, improvements: ["Замените уплотнение повторно"] }),
      "m",
      settings,
    );
    expect(merged).toMatchObject({ verdict: "rework", score: 45, rating: 1 });
    expect(merged.improvements).toEqual(["Замените уплотнение повторно"]);
  });

  it("never raises the verdict above what a failed check allows", () => {
    const { rules, checks } = lockoutMissing();
    const merged = mergeLlmReview(rules, checks, llm({ score: 95 }), "m", settings);
    expect(merged.verdict).toBe("rework");
    expect(merged.score).toBe(59);
    expect(merged.improvements[0]).toBe("Оформляйте блокировку LOTO до начала работ");
    expect(merged.masterExplanation).toMatch(
      /^Вердикт ограничен правилами, не пройдено: Блокировка LOTO\./,
    );
  });

  it("keeps the score inside the verdict band", () => {
    const { rules, checks } = input();
    expect(mergeLlmReview(rules, checks, llm({ score: 62 }), "m", settings).score).toBe(80);
    expect(
      mergeLlmReview(
        rules,
        checks,
        llm({ verdict: "accepted_with_remarks", score: 95 }),
        "m",
        settings,
      ).score,
    ).toBe(79);
  });

  it("asks the master to review on low confidence", () => {
    const { rules, checks } = input();
    const merged = mergeLlmReview(rules, checks, llm({ confidence: 0.45 }), "m", settings);
    expect(merged.needsMasterReview).toBe(true);
    const strict = { ...settings, lowConfidenceThreshold: 0.9 };
    expect(mergeLlmReview(rules, checks, llm(), "m", strict).needsMasterReview).toBe(true);
  });

  it("flags work that does not match the problem", () => {
    const { rules, checks } = input();
    const merged = mergeLlmReview(
      rules,
      checks,
      llm({ problem_matches_work: false, verdict: "accepted_with_remarks", score: 65 }),
      "m",
      settings,
    );
    expect(merged.needsMasterReview).toBe(true);
    expect(merged.masterExplanation).toContain("не соответствуют описанной проблеме");
  });

  it("fills empty strengths and improvements from the rules", () => {
    const context = withOrder({ standardHours: 2 });
    const { rules, checks } = input(context);
    const merged = mergeLlmReview(
      rules,
      checks,
      llm({ verdict: "accepted_with_remarks", score: 72, strengths: [], notes: " заметка " }),
      "m",
      settings,
    );
    expect(merged.strengths.length).toBeGreaterThan(0);
    expect(merged.improvements).toEqual([
      "Время работы превысило норматив на 50%, укажите причину задержки",
    ]);
    expect(merged.notes).toBe("заметка");
  });
});

describe("reviewWithLlm", () => {
  it("falls back to rules when the provider is disabled", async () => {
    const review = await reviewWithLlm(disabledProvider, input(), settings);
    expect(review).toMatchObject({ usedLlm: false, model: null, verdict: "accepted", score: 100 });
    expect(review.workerExplanation).toContain("Наряд принят без замечаний");
  });

  it("calls the smart tier with the schema, cache key and anonymized prompt", async () => {
    const mock = provider({ ok: true, value: llm(), model: "smart-1", cached: false });
    const review = await reviewWithLlm(mock, input(), settings);
    expect(review).toMatchObject({ usedLlm: true, model: "smart-1", score: 91 });
    expect(mock.calls[0]).toMatchObject({
      feature: "order_review",
      tier: "smart",
      workOrderId: "order-1",
      cacheKey: reviewCacheKey("order-1", 0),
      schema: llmReviewSchema,
    });
  });

  it("falls back to rules on provider errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failed = await reviewWithLlm(
      provider({ ok: false, error: "timeout", message: "slow" }),
      lockoutMissing(),
      settings,
    );
    expect(failed).toMatchObject({ usedLlm: false, verdict: "rework", needsMasterReview: true });
    const thrown = await reviewWithLlm(provider(new Error("boom")), input(), settings);
    expect(thrown.usedLlm).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("falls back to rules on an invalid model answer", async () => {
    const review = await reviewWithLlm(
      provider({ ok: true, value: { verdict: "maybe" }, model: "m", cached: false }),
      input(),
      settings,
    );
    expect(review.usedLlm).toBe(false);
  });

  it("stays silent when the provider reports it is disabled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await reviewWithLlm(provider({ ok: false, error: "disabled", message: "" }), input(), settings);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
