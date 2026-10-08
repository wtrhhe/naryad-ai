import type { Locale } from "@/i18n/config";
import { TIME_ZONE } from "@/i18n/config";
import type { AiChatMessage, AiProvider } from "@/lib/ai/types";
import { currentShiftWindow } from "@/lib/board/shift";
import { formatCards, formatFailure, formatHelp } from "@/lib/assistant/format";
import { detectLocale, routeQuestion } from "@/lib/assistant/router";
import {
  executeTool,
  memoizeGateway,
  TOOL_DEFINITIONS,
  toModelPayload,
  type ToolContext,
} from "@/lib/assistant/tools";
import type {
  AssistantCard,
  AssistantGateway,
  AssistantReply,
  ConversationTurn,
} from "@/lib/assistant/types";

export const MAX_TOOL_ROUNDS = 4;
export const MAX_CALLS_PER_ROUND = 4;
const MAX_TOKENS = 700;
const TIMEOUT_MS = 25_000;

export interface RunAssistantOptions {
  messages: readonly ConversationTurn[];
  fallbackLocale: Locale;
  gateway: AssistantGateway;
  provider: AiProvider;
  now: Date;
}

const LANGUAGE_NAMES: Record<Locale, string> = { ru: "русский", kk: "казахский" };

export function buildSystemPrompt(input: {
  now: Date;
  locale: Locale;
  sites: readonly string[];
}): string {
  const shift = currentShiftWindow(input.now);
  const moment = new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIME_ZONE,
    dateStyle: "long",
    timeStyle: "short",
  }).format(input.now);
  return [
    "Ты — «Ассистент мастера» в системе НарядAI на горно-обогатительном предприятии АО «Костанайские Минералы». Помогаешь мастеру смены: кто свободен, что просрочено, история оборудования, отчёт смены, проблемы участка, черновик наряда.",
    "Правила:",
    "- Любые факты и числа бери только из результатов инструментов. Ничего не придумывай и не пересчитывай по памяти.",
    "- Отвечай кратко: 1–4 предложения простым текстом, без таблиц и markdown. Подробности мастер увидит в карточках под ответом.",
    `- Отвечай на языке последнего сообщения мастера (русский или казахский). Сейчас: ${LANGUAGE_NAMES[input.locale]}.`,
    "- Ты ничего не меняешь в системе. Для нового наряда вызови create_work_order_draft и предложи мастеру проверить черновик и нажать «Создать наряд».",
    "- Людей называй только так, как они указаны в данных инструментов (фамилия и инициал). Не запрашивай и не раскрывай персональные данные.",
    "- Если данных нет, участок или оборудование не найдены, или вопрос не о работе смены — скажи об этом коротко и предложи уточнить.",
    `Контекст: сейчас ${moment} (время Костаная), ${shift.period === "day" ? "дневная" : "ночная"} смена. Участки: ${input.sites.join(", ") || "нет данных"}.`,
  ].join("\n");
}

function lastQuestion(messages: readonly ConversationTurn[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function draftLinkOf(cards: readonly AssistantCard[]): string | null {
  const draft = [...cards].reverse().find((card) => card.kind === "draft");
  return draft?.kind === "draft" ? draft.link : null;
}

function reply(
  text: string,
  cards: AssistantCard[],
  mode: AssistantReply["mode"],
  locale: Locale,
): AssistantReply {
  return { text, cards, draftLink: draftLinkOf(cards), mode, locale };
}

function cardKey(tool: string, input: unknown): string {
  return `${tool}:${JSON.stringify(input ?? {})}`;
}

async function runWithModel(
  options: RunAssistantOptions,
  context: ToolContext,
  locale: Locale,
): Promise<AssistantReply | null> {
  const sites = await context.gateway.sites().catch(() => []);
  const system = buildSystemPrompt({
    now: options.now,
    locale,
    sites: sites.map((site) => site.name),
  });
  const conversation: AiChatMessage[] = options.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const cards = new Map<string, AssistantCard>();
  const collected = () => [...cards.values()];
  for (let round = 0; ; round += 1) {
    const outcome = await options.provider.tools({
      feature: "assistant",
      tier: "fast",
      system,
      messages: conversation,
      tools: TOOL_DEFINITIONS,
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
    });
    if (!outcome.ok) {
      return cards.size > 0
        ? reply(formatCards(collected(), locale), collected(), "rules", locale)
        : null;
    }
    const { text, toolCalls } = outcome.value;
    if (toolCalls.length === 0 || round >= MAX_TOOL_ROUNDS) {
      const finalText = text.trim() || formatCards(collected(), locale) || formatHelp(locale);
      return reply(finalText, collected(), "ai", locale);
    }
    conversation.push({ role: "assistant", content: text, toolCalls });
    for (const [index, call] of toolCalls.entries()) {
      if (index >= MAX_CALLS_PER_ROUND) {
        conversation.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ error: "skipped" }),
        });
        continue;
      }
      const execution = await executeTool(call.name, call.input, context);
      if (execution.ok) {
        cards.set(cardKey(call.name, call.input), execution.card);
      }
      conversation.push({ role: "tool", toolCallId: call.id, content: toModelPayload(execution) });
    }
  }
}

async function runWithRules(
  question: string,
  context: ToolContext,
  locale: Locale,
): Promise<AssistantReply> {
  const call = routeQuestion(question, context.now);
  if (!call) {
    return reply(formatHelp(locale), [], "rules", locale);
  }
  const execution = await executeTool(call.tool, call.input, context);
  if (!execution.ok) {
    return reply(formatFailure(locale), [], "rules", locale);
  }
  return reply(formatCards([execution.card], locale), [execution.card], "rules", locale);
}

export async function runAssistant(options: RunAssistantOptions): Promise<AssistantReply> {
  const question = lastQuestion(options.messages);
  const locale = detectLocale(question, options.fallbackLocale);
  const context: ToolContext = { gateway: memoizeGateway(options.gateway), now: options.now };
  if (options.provider.enabled) {
    const answer = await runWithModel(options, context, locale);
    if (answer) {
      return answer;
    }
  }
  return runWithRules(question, context, locale);
}
