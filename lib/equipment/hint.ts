import type { Locale } from "@/i18n/config";
import type { AiProvider } from "@/lib/ai/types";
import {
  fallbackCheckHints,
  type CheckHint,
  type EquipmentMemorySummary,
} from "@/lib/equipment/memory";

const HINT_TIMEOUT_MS = 6000;
const HINT_MAX_TOKENS = 400;
const MAX_ITEMS = 4;
const MAX_ITEM_LENGTH = 240;

const LANGUAGE: Record<Locale, string> = { ru: "русском", kk: "казахском" };

export function buildHintSystemPrompt(locale: Locale): string {
  return [
    "Ты — опытный механик горно-обогатительного предприятия.",
    "По истории ремонтов оборудования подскажи исполнителю, что проверить в этот раз, чтобы устранить первопричину, а не только симптом.",
    `Ответь на ${LANGUAGE[locale]} языке: от 2 до 4 коротких пунктов, каждый с новой строки, без вступления и без markdown.`,
    "Не придумывай фактов, которых нет в данных; это рекомендация, решение принимает мастер.",
  ].join("\n");
}

export function buildHintPrompt(summary: EquipmentMemorySummary): string {
  const focus = summary.focus;
  const lines = [
    `Оборудование: ${summary.equipmentName} (участок ${summary.siteName}, критичность ${summary.criticality}/3).`,
    `Внеплановых отказов за ${summary.windowDays} дней: ${summary.unplannedInWindow}; за последние 30 дней: ${summary.trend.recent}, за предыдущие 30: ${summary.trend.previous}.`,
  ];
  if (focus) {
    lines.push(
      `Повторяющийся отказ: ${focus.code} «${focus.name}», ${focus.count} раз(а) за ${focus.spanDays} дн.`,
    );
    if (focus.interval) {
      lines.push(`Интервал между повторами: ${focus.interval.min}–${focus.interval.max} дн.`);
    }
    if (focus.materials.length > 0) lines.push(`Меняли: ${focus.materials.join(", ")}.`);
    if (focus.rcaHypothesis) lines.push(`Гипотеза открытого RCA: ${focus.rcaHypothesis}`);
  }
  summary.lastRepairs.slice(0, 3).forEach((repair) => {
    const fault = repair.faultCode ? `${repair.faultCode} ${repair.faultName ?? ""}`.trim() : "—";
    lines.push(
      `Ремонт №${repair.number} (${repair.kind === "planned" ? "плановый" : "внеплановый"}, ${fault}): ${repair.workPerformed ?? "—"}`,
    );
  });
  return lines.join("\n");
}

export function parseHintText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-•*–—]|\d+[.)])\s*/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter((line) => line.length > 2)
    .map((line) =>
      line.length > MAX_ITEM_LENGTH ? `${line.slice(0, MAX_ITEM_LENGTH - 1).trimEnd()}…` : line,
    )
    .slice(0, MAX_ITEMS);
}

export function hintCacheKey(summary: EquipmentMemorySummary, locale: Locale): string {
  const focus = summary.focus;
  return [
    "equipment_hint",
    summary.equipmentId,
    focus?.faultCodeId ?? "none",
    focus?.count ?? 0,
    summary.lastRepairs[0]?.orderId ?? "none",
    locale,
  ].join(":");
}

export async function requestCheckHint(
  provider: AiProvider,
  summary: EquipmentMemorySummary,
  locale: Locale,
): Promise<CheckHint> {
  const fallback = fallbackCheckHints(summary, locale);
  if (!provider.enabled || (!summary.focus && summary.lastRepairs.length === 0)) return fallback;
  try {
    const outcome = await provider.text({
      tier: "fast",
      feature: "order_suggestion",
      system: buildHintSystemPrompt(locale),
      prompt: buildHintPrompt(summary),
      cacheKey: hintCacheKey(summary, locale),
      timeoutMs: HINT_TIMEOUT_MS,
      maxTokens: HINT_MAX_TOKENS,
    });
    if (!outcome.ok) return fallback;
    const items = parseHintText(outcome.value);
    return items.length > 0 ? { source: "ai", items } : fallback;
  } catch {
    return fallback;
  }
}
