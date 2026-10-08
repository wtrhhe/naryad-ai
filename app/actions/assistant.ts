"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { resolveLocale } from "@/i18n/config";
import { getAiProvider } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createRlsGateway } from "@/lib/assistant/gateway";
import { runAssistant } from "@/lib/assistant/run";
import type { AssistantActionResult, ConversationTurn } from "@/lib/assistant/types";

const RATE_LIMIT_HITS = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const HISTORY_LIMIT = 12;

const inputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(60),
});

function conversationTail(messages: readonly ConversationTurn[]): ConversationTurn[] {
  const tail = messages.slice(-HISTORY_LIMIT);
  const firstUser = tail.findIndex((message) => message.role === "user");
  return firstUser < 0 ? [] : tail.slice(firstUser);
}

async function withinRateLimit(employeeId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient().rpc("hit_rate_limit", {
    bucket: `assistant:${employeeId}`,
    max_hits: RATE_LIMIT_HITS,
    window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (error) {
    throw new Error(`rate limit check failed: ${error.message}`);
  }
  return data === true;
}

export async function askAssistant(raw: unknown): Promise<AssistantActionResult> {
  const employee = await requireRole("master", "manager");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "validation" };
  }
  const messages = conversationTail(parsed.data.messages);
  const last = messages.at(-1);
  if (!last || last.role !== "user" || last.content.length > 1000) {
    return { ok: false, error: "validation" };
  }
  try {
    if (!(await withinRateLimit(employee.id))) {
      return { ok: false, error: "rate_limited" };
    }
    const [locale, gateway] = await Promise.all([
      getLocale(),
      createRlsGateway({ id: employee.id, role: employee.role }),
    ]);
    const reply = await runAssistant({
      messages,
      fallbackLocale: resolveLocale(locale),
      gateway,
      provider: getAiProvider(),
      now: new Date(),
    });
    return { ok: true, data: reply };
  } catch (error) {
    console.error("assistant request failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "unavailable" };
  }
}
