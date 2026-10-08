import { z } from "zod";
import type { AiProvider } from "@/lib/ai/types";
import { anonymizeText, type PersonAlias } from "@/lib/review/anonymize";
import { lateMinutes, standardHoursOf, workSeconds } from "@/lib/review/checks/time";
import { round } from "@/lib/review/checks/result";
import { capVerdict, clampToVerdict, ratingFor } from "@/lib/review/score";
import {
  capNoteFor,
  failedImprovements,
  improvementsFor,
  MAX_IMPROVEMENTS,
  MAX_STRENGTHS,
  mismatchNote,
  rulesOnlyReview,
  strengthsFor,
  uniqueTexts,
} from "@/lib/review/templates";
import {
  REVIEW_VERDICTS,
  type CheckResult,
  type FinalReview,
  type ReviewContext,
  type ReviewSettings,
  type RulesOutcome,
} from "@/lib/review/types";

export const REVIEW_TIMEOUT_MS = 45_000;
export const REVIEW_MAX_TOKENS = 1600;
export const WORKER_ALIAS = "И-1";
export const MASTER_ALIAS = "М-1";

export const llmReviewSchema = z.object({
  verdict: z.enum(REVIEW_VERDICTS),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  strengths: z.array(z.string()).max(8),
  improvements: z.array(z.string()).max(8),
  worker_explanation: z.string().min(1).max(2000),
  master_explanation: z.string().min(1).max(3000),
  problem_matches_work: z.boolean(),
  notes: z.string().max(2000),
});

export type LlmReview = z.infer<typeof llmReviewSchema>;

export const REVIEW_SYSTEM_PROMPT = [
  "Ты — инженер по качеству ремонтов на горно-обогатительной фабрике. Ты проверяешь закрытый наряд на ремонт оборудования.",
  "На входе JSON: описание проблемы, выполненные работы, шифр неисправности, списанные материалы с нормами, время и результаты автоматических проверок (status: pass, warn, fail, skip).",
  "Оцени: устраняют ли выполненные работы описанную проблему (problem_matches_work); логична ли связка «проблема → шифр → работы → материалы»; насколько понятно описаны работы.",
  "Правила:",
  "- Если хотя бы одна проверка имеет status fail, verdict = rework, score не выше 59.",
  "- verdict accepted — score 80–100, accepted_with_remarks — 60–79, rework — 0–59.",
  "- confidence от 0 до 1 — насколько ты уверен в вердикте; ставь ниже 0.6, если данных мало или они противоречат друг другу.",
  "- strengths и improvements — до 4 коротких конкретных пунктов каждый.",
  "- worker_explanation — 2–3 предложения для исполнителя, уважительно, на «вы», без канцелярита.",
  "- master_explanation — 2–4 предложения для мастера: вердикт, ключевые факты, на что обратить внимание при приёмке.",
  "- Не выдумывай факты, которых нет во входных данных. Люди обозначены кодами (И-1, М-1), не пытайся угадать имена.",
  "- notes — короткая служебная заметка или пустая строка.",
  "Пиши по-русски. Ответ — строго JSON по схеме.",
].join("\n");

export interface LlmReviewInput {
  context: ReviewContext;
  checks: readonly CheckResult[];
  rules: RulesOutcome;
  people: readonly PersonAlias[];
}

function scrub(text: string | null, people: readonly PersonAlias[]): string | null {
  return text === null ? null : anonymizeText(text, people);
}

export function buildReviewPayload(input: LlmReviewInput) {
  const { context, checks, rules, people } = input;
  const { order } = context;
  const seconds = workSeconds({ ...order, events: context.events });
  return {
    order: {
      number: order.number,
      kind: order.kind,
      revision: order.reworkCount,
      executor: WORKER_ALIAS,
      master: MASTER_ALIAS,
      equipment: { name: context.equipment.name, type: context.equipment.type },
      problem_description: scrub(order.description, people),
      work_performed: scrub(order.workPerformed, people),
      worker_comment: scrub(order.closeComment, people),
    },
    fault_code: context.faultCode
      ? {
          code: context.faultCode.code,
          name: context.faultCode.name,
          category: context.faultCode.category,
          standard_hours: context.faultCode.standardHours,
        }
      : null,
    materials: context.materials.map((line) => ({
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      categories: line.categories,
      norm: line.norm,
      history_median: line.historyMedian,
    })),
    time: {
      actual_hours: seconds === null ? null : round(seconds / 3600, 2),
      standard_hours: standardHoursOf(order, context.faultCode),
      late_minutes: lateMinutes(order.dueAt, order.doneAt),
    },
    checks: checks.map((check) => ({
      key: check.key,
      status: check.status,
      detail: scrub(check.detail, people),
    })),
    rules_result: { score: rules.score, verdict: rules.verdict },
  };
}

export function buildReviewPrompt(input: LlmReviewInput): string {
  return JSON.stringify(buildReviewPayload(input), null, 2);
}

export function mergeLlmReview(
  rules: RulesOutcome,
  checks: readonly CheckResult[],
  llm: LlmReview,
  model: string,
  settings: ReviewSettings,
): FinalReview {
  const verdict = capVerdict(llm.verdict, checks);
  const score = clampToVerdict(llm.score, verdict);
  const capped = verdict !== llm.verdict;
  const fallbackImprovements =
    verdict !== "accepted" && llm.improvements.length === 0 ? improvementsFor(checks) : [];
  const improvements = uniqueTexts(
    [...(capped ? failedImprovements(checks) : []), ...llm.improvements, ...fallbackImprovements],
    MAX_IMPROVEMENTS,
  );
  const strengths = uniqueTexts(
    llm.strengths.length > 0 ? llm.strengths : strengthsFor(checks),
    MAX_STRENGTHS,
  );
  const masterExplanation = [
    capped ? capNoteFor(checks) : null,
    llm.problem_matches_work ? null : mismatchNote(),
    llm.master_explanation.trim(),
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" ");
  return {
    verdict,
    score,
    rating: ratingFor(score),
    confidence: Math.round(llm.confidence * 1000) / 1000,
    needsMasterReview:
      llm.confidence < settings.lowConfidenceThreshold || !llm.problem_matches_work,
    usedLlm: true,
    model,
    strengths,
    improvements,
    workerExplanation: llm.worker_explanation.trim(),
    masterExplanation,
    problemMatchesWork: llm.problem_matches_work,
    notes: llm.notes.trim() || null,
  };
}

export function reviewCacheKey(orderId: string, revision: number): string {
  return `order_review:${orderId}:${revision}`;
}

export async function reviewWithLlm(
  provider: AiProvider,
  input: LlmReviewInput,
  settings: ReviewSettings,
): Promise<FinalReview> {
  const fallback = () => rulesOnlyReview(input.rules, input.checks);
  if (!provider.enabled) {
    return fallback();
  }
  try {
    const outcome = await provider.json({
      feature: "order_review",
      tier: "smart",
      workOrderId: input.context.order.id,
      cacheKey: reviewCacheKey(input.context.order.id, input.context.order.reworkCount),
      timeoutMs: REVIEW_TIMEOUT_MS,
      maxTokens: REVIEW_MAX_TOKENS,
      system: REVIEW_SYSTEM_PROMPT,
      prompt: buildReviewPrompt(input),
      schema: llmReviewSchema,
    });
    if (!outcome.ok) {
      if (outcome.error !== "disabled") {
        console.warn("order review fell back to rules", outcome.error, outcome.message);
      }
      return fallback();
    }
    const parsed = llmReviewSchema.safeParse(outcome.value);
    return parsed.success
      ? mergeLlmReview(input.rules, input.checks, parsed.data, outcome.model, settings)
      : fallback();
  } catch (error) {
    console.warn("order review fell back to rules", error instanceof Error ? error.message : error);
    return fallback();
  }
}
