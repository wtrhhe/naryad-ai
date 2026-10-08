import { createTranslator } from "next-intl";
import ruRating from "@/messages/ru/rating.json";
import kkRating from "@/messages/kk/rating.json";
import type { Locale } from "@/i18n/config";
import { getAiProvider } from "@/lib/ai/provider";
import type { AiProvider } from "@/lib/ai/types";
import type { SubjectRating } from "@/lib/rating/aggregate";
import type { RatingWeights } from "@/lib/rating/formula";

export type ExplainKey = keyof (typeof ruRating)["explain"];

export type RatingComponentKey = "quality" | "onTime" | "noRework" | "volume";

export const RATING_COMPONENT_KEYS: readonly RatingComponentKey[] = [
  "quality",
  "onTime",
  "noRework",
  "volume",
];

export interface ExplanationLine {
  key: ExplainKey;
  values: Record<string, number>;
}

export interface RatingExplanation {
  text: string;
  lines: string[];
  source: "llm" | "template";
}

export type ExplainableRating = Pick<
  SubjectRating,
  | "score"
  | "components"
  | "contributions"
  | "closedCount"
  | "onTimeCount"
  | "cleanCount"
  | "repeatCount"
  | "reworkedCount"
  | "workload"
  | "unexcusedRefusals"
>;

const MESSAGES = { ru: ruRating, kk: kkRating } as const;

const TIP_KEYS: Record<RatingComponentKey, ExplainKey> = {
  quality: "tipQuality",
  onTime: "tipOnTime",
  noRework: "tipNoRework",
  volume: "tipVolume",
};

const MIN_TIP_GAP = 1;
const LLM_TIMEOUT_MS = 6000;
const LLM_MAX_TOKENS = 400;
const LLM_MIN_LENGTH = 20;
const LLM_MAX_LENGTH = 1200;

const SYSTEM_PROMPT = [
  "Ты помогаешь работникам ремонтной службы горно-обогатительного комбината понять их рейтинг.",
  "Перескажи объяснение простым доброжелательным языком в двух–четырёх предложениях.",
  "Используй только числа из исходных данных, ничего не придумывай и не упоминай людей по именам.",
  "Обязательно назови итоговый балл, главную причину потерь и одно практическое действие для роста.",
  "Отвечай только текстом объяснения, без заголовков, списков и разметки.",
].join(" ");

const LANGUAGE_PROMPT: Record<Locale, string> = {
  ru: "Пиши на русском языке.",
  kk: "Пиши на казахском языке.",
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function maxPoints(weights: RatingWeights): Record<RatingComponentKey, number> {
  return {
    quality: round1(weights.quality * 100),
    onTime: round1(weights.on_time * 100),
    noRework: round1(weights.no_rework * 100),
    volume: round1(weights.volume * 100),
  };
}

export function weakestComponent(
  rating: ExplainableRating,
  weights: RatingWeights,
): RatingComponentKey | null {
  const max = maxPoints(weights);
  const gaps = RATING_COMPONENT_KEYS.map((key) => ({
    key,
    gap: max[key] - rating.contributions[key],
  })).sort((a, b) => b.gap - a.gap);
  const top = gaps[0];
  return top && top.gap >= MIN_TIP_GAP ? top.key : null;
}

export function explanationLines(
  rating: ExplainableRating,
  weights: RatingWeights,
): ExplanationLine[] {
  const refusals: ExplanationLine[] =
    rating.unexcusedRefusals > 0
      ? [
          {
            key: "refusals",
            values: {
              count: rating.unexcusedRefusals,
              penalty: round1(rating.components.refusalPenalty),
            },
          },
        ]
      : [];
  if (rating.closedCount === 0) {
    return [{ key: "noData", values: {} }, ...refusals];
  }
  const max = maxPoints(weights);
  const total = rating.closedCount;
  const lines: ExplanationLine[] = [
    { key: "summary", values: { score: rating.score, closed: total } },
    {
      key: "quality",
      values: {
        value: round1(rating.components.quality),
        points: rating.contributions.quality,
        max: max.quality,
      },
    },
    {
      key: "onTime",
      values: {
        count: rating.onTimeCount,
        total,
        points: rating.contributions.onTime,
        max: max.onTime,
      },
    },
    {
      key: "noRework",
      values: {
        count: rating.cleanCount,
        total,
        points: rating.contributions.noRework,
        max: max.noRework,
      },
    },
  ];
  if (rating.reworkedCount > 0) {
    lines.push({ key: "reworked", values: { count: rating.reworkedCount } });
  }
  if (rating.repeatCount > 0) {
    lines.push({ key: "repeated", values: { count: rating.repeatCount } });
  }
  lines.push({
    key: "volume",
    values: {
      hours: round1(rating.workload),
      value: Math.round(rating.components.volume),
      points: rating.contributions.volume,
      max: max.volume,
    },
  });
  lines.push(...refusals);
  const weakest = weakestComponent(rating, weights);
  if (weakest) lines.push({ key: TIP_KEYS[weakest], values: {} });
  return lines;
}

export function renderExplanation(lines: readonly ExplanationLine[], locale: Locale): string[] {
  const t = createTranslator({
    locale,
    messages: { rating: MESSAGES[locale] },
    namespace: "rating.explain",
  });
  return lines.map((line) => t(line.key, line.values));
}

export function templateExplanation(
  rating: ExplainableRating,
  weights: RatingWeights,
  locale: Locale,
): RatingExplanation {
  const lines = renderExplanation(explanationLines(rating, weights), locale);
  return { text: lines.join(" "), lines, source: "template" };
}

export function explanationPrompt(
  rating: ExplainableRating,
  weights: RatingWeights,
  template: RatingExplanation,
  locale: Locale,
): string {
  const facts = {
    score: rating.score,
    closedOrders: rating.closedCount,
    onTime: rating.onTimeCount,
    withoutReworkOrRepeat: rating.cleanCount,
    returnedForRework: rating.reworkedCount,
    repeatFailuresWithin7Days: rating.repeatCount,
    standardHours: round1(rating.workload),
    unexcusedRefusals: rating.unexcusedRefusals,
    components: {
      quality: round1(rating.components.quality),
      onTime: round1(rating.components.onTime),
      noRework: round1(rating.components.noRework),
      volume: round1(rating.components.volume),
      refusalPenalty: round1(rating.components.refusalPenalty),
    },
    points: rating.contributions,
    maxPoints: maxPoints(weights),
  };
  return [
    LANGUAGE_PROMPT[locale],
    "Объяснение по формуле:",
    template.lines.map((line) => `- ${line}`).join("\n"),
    "Данные:",
    JSON.stringify(facts),
  ].join("\n");
}

function acceptable(text: string, rating: ExplainableRating): boolean {
  const length = text.length;
  return (
    length >= LLM_MIN_LENGTH &&
    length <= LLM_MAX_LENGTH &&
    text.includes(String(Math.trunc(rating.score)))
  );
}

export interface ExplainRatingInput {
  rating: ExplainableRating;
  weights: RatingWeights;
  locale: Locale;
  cacheKey?: string;
  provider?: AiProvider;
}

export async function explainRating(input: ExplainRatingInput): Promise<RatingExplanation> {
  const template = templateExplanation(input.rating, input.weights, input.locale);
  const provider = input.provider ?? getAiProvider();
  if (!provider.enabled || input.rating.closedCount === 0) return template;
  try {
    const outcome = await provider.text({
      tier: "fast",
      feature: "rating_explanation",
      system: SYSTEM_PROMPT,
      prompt: explanationPrompt(input.rating, input.weights, template, input.locale),
      cacheKey: input.cacheKey,
      timeoutMs: LLM_TIMEOUT_MS,
      maxTokens: LLM_MAX_TOKENS,
    });
    if (!outcome.ok) return template;
    const text = outcome.value.trim();
    if (!acceptable(text, input.rating)) return template;
    return { text, lines: [text], source: "llm" };
  } catch {
    return template;
  }
}
