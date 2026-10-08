import { createTranslator } from "next-intl";
import ruAcoustic from "@/messages/ru/acoustic.json";
import kkAcoustic from "@/messages/kk/acoustic.json";
import type { Locale } from "@/i18n/config";
import type { AiProvider } from "@/lib/ai/types";
import type { DefectKey } from "@/lib/acoustic/types";
import type {
  AcousticComparison,
  ComparisonRecommendation,
  ComparisonVerdict,
} from "@/lib/acoustic/compare";
import { parseDefectLabel } from "@/lib/acoustic/bearing";

export interface ConclusionFacts {
  verdict: ComparisonVerdict;
  recommendation: ComparisonRecommendation;
  frequencyHz: number | null;
  label: string | null;
  defect: DefectKey | null;
  harmonic: number | null;
  changeDb: number | null;
  prominenceAfterDb: number | null;
  overallChangeDb: number;
  healthBefore: number;
  healthAfter: number;
}

export interface PhrasedConclusion {
  text: string;
  source: "llm" | "template";
  model: string | null;
}

export interface PhraseContext {
  workOrderId?: string | null;
  timeoutMs?: number;
}

const MESSAGES = { ru: ruAcoustic, kk: kkAcoustic } as const;
const MINUS = "−";
const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 400;
const LLM_TIMEOUT_MS = 8_000;
const LLM_MAX_TOKENS = 200;

const SYSTEM_PROMPTS: Record<Locale, string> = {
  ru: "Ты инженер-диагност горно-обогатительного предприятия. По числам сравнения акустических замеров до и после ремонта напиши вывод для мастера смены: одно или два коротких предложения на русском языке. Используй только числа из входных данных, не добавляй новых чисел, не меняй вердикт и рекомендацию. Без markdown и списков.",
  kk: "Сен тау-кен байыту кәсіпорнының диагност инженерісің. Жөндеуге дейінгі және кейінгі акустикалық өлшемдерді салыстыру сандары бойынша ауысым шеберіне қазақ тілінде бір немесе екі қысқа сөйлеммен қорытынды жаз. Тек кіріс деректеріндегі сандарды қолдан, жаңа сандар қоспа, үкім мен ұсынымды өзгертпе. Markdown пен тізімдерсіз.",
};

export function formatSigned(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `${MINUS}${Math.abs(rounded)}`;
}

export function conclusionFacts(comparison: AcousticComparison): ConclusionFacts {
  const target = comparison.target;
  const parsed = parseDefectLabel(target?.label);
  return {
    verdict: comparison.verdict,
    recommendation: comparison.recommendation,
    frequencyHz: target ? Math.round(target.f) : null,
    label: target?.label ?? null,
    defect: target?.key ?? parsed?.key ?? null,
    harmonic: target?.harmonic ?? parsed?.harmonic ?? null,
    changeDb: target ? Math.round(target.deltaDb) : null,
    prominenceAfterDb: target ? Math.round(target.afterProminenceDb) : null,
    overallChangeDb: Math.round(comparison.overallDeltaDb ?? comparison.rmsDeltaDb ?? 0),
    healthBefore: comparison.healthBefore,
    healthAfter: comparison.healthAfter,
  };
}

function translatorFor(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale] });
}

export function conclusionText(comparison: AcousticComparison, locale: Locale): string {
  const t = translatorFor(locale);
  const facts = conclusionFacts(comparison);
  if (facts.frequencyHz === null || facts.changeDb === null) {
    return t("conclusion.no_defect", { delta: formatSigned(facts.overallChangeDb) });
  }
  const source =
    facts.label === null
      ? ""
      : facts.defect !== null && facts.defect !== "shaft"
        ? t("conclusion.source", {
            label: facts.label,
            part: t(`defects.${facts.defect}`).toLocaleLowerCase(locale),
          })
        : t("conclusion.sourceLabel", { label: facts.label });
  const frequency = facts.frequencyHz;
  switch (facts.verdict) {
    case "resolved":
      return t("conclusion.resolved", { frequency, source, drop: Math.abs(facts.changeDb) });
    case "improved":
      return t("conclusion.improved", { frequency, source, drop: Math.abs(facts.changeDb) });
    case "worsened":
      return t("conclusion.worsened", { frequency, source, rise: Math.abs(facts.changeDb) });
    case "new_defect":
      return t("conclusion.new_defect", {
        frequency,
        source,
        rise: Math.max(0, facts.prominenceAfterDb ?? 0),
      });
    case "no_defect":
      return t("conclusion.no_defect", { delta: formatSigned(facts.overallChangeDb) });
    default:
      return t("conclusion.persists", { frequency, source, delta: formatSigned(facts.changeDb) });
  }
}

function allowedNumbers(facts: ConclusionFacts): Set<number> {
  const values = [
    facts.frequencyHz,
    facts.changeDb,
    facts.prominenceAfterDb,
    facts.overallChangeDb,
    facts.harmonic,
    facts.healthBefore,
    facts.healthAfter,
    100,
  ];
  return new Set(
    values.filter((value): value is number => value !== null).map((value) => Math.abs(value)),
  );
}

export function isFaithful(text: string, facts: ConclusionFacts): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH || trimmed.length > MAX_TEXT_LENGTH) return false;
  if (/[#*`]|\n\s*\n/.test(trimmed)) return false;
  const allowed = allowedNumbers(facts);
  const numbers = (trimmed.match(/\d+(?:[.,]\d+)?/g) ?? []).map((token) =>
    Number(token.replace(",", ".")),
  );
  if (numbers.some((value) => !allowed.has(value))) return false;
  return facts.frequencyHz === null || numbers.includes(facts.frequencyHz);
}

function hashKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export async function phraseConclusion(
  comparison: AcousticComparison,
  locale: Locale,
  provider: AiProvider,
  context: PhraseContext = {},
): Promise<PhrasedConclusion> {
  const fallback: PhrasedConclusion = {
    text: conclusionText(comparison, locale),
    source: "template",
    model: null,
  };
  if (!provider.enabled) return fallback;
  const facts = conclusionFacts(comparison);
  const payload = JSON.stringify({ facts, draft: fallback.text });
  try {
    const result = await provider.text({
      tier: "fast",
      feature: "acoustic_text",
      system: SYSTEM_PROMPTS[locale],
      prompt: payload,
      maxTokens: LLM_MAX_TOKENS,
      timeoutMs: context.timeoutMs ?? LLM_TIMEOUT_MS,
      workOrderId: context.workOrderId ?? null,
      cacheKey: `acoustic_text:${locale}:${hashKey(payload)}`,
    });
    if (!result.ok) return fallback;
    const text = result.value.trim();
    return isFaithful(text, facts) ? { text, source: "llm", model: result.model } : fallback;
  } catch {
    return fallback;
  }
}
