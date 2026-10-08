"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bot, Send } from "lucide-react";
import { askAssistant } from "@/app/actions/assistant";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Entry {
  role: "user" | "assistant";
  content: string;
  draftLink?: string | null;
  error?: boolean;
}

const SUGGESTIONS = [
  "freeElectricians",
  "overdue",
  "weeklyEnrichment",
  "crushingProblems",
] as const;

export function AssistantChat({ llmEnabled }: { llmEnabled: boolean }) {
  const t = useTranslations("assistant");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  const ask = (question: string) => {
    const content = question.trim();
    if (!content || pending) return;
    const history = [
      ...entries.filter((entry) => !entry.error),
      { role: "user" as const, content },
    ];
    setEntries([...entries, { role: "user", content }]);
    setText("");
    startTransition(async () => {
      const result = await askAssistant({
        messages: history.map(({ role, content: body }) => ({ role, content: body })),
      });
      setEntries((current) => [
        ...current,
        result.ok
          ? {
              role: "assistant",
              content: result.data.text,
              draftLink: result.data.draftLink ?? null,
            }
          : { role: "assistant", content: t(`errors.${result.error}`), error: true },
      ]);
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {!llmEnabled ? (
        <p className="border-border text-muted rounded-lg border-2 p-3 text-sm">
          <span className="text-accent font-semibold">{t("rulesBadge")}</span>
          {" · "}
          {t("rulesHint")}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t("intro")}</p>
          <span className="font-semibold">{t("suggestionsTitle")}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => ask(t(`suggestions.${key}`))}
                className="border-border bg-surface hover:border-accent min-h-14 rounded-lg border-2 px-3 text-left font-semibold"
              >
                {t(`suggestions.${key}`)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <ol className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <li
            key={index}
            className={cn(
              "max-w-[90%] rounded-xl border-2 p-3 whitespace-pre-line",
              entry.role === "user"
                ? "border-accent bg-accent/10 self-end"
                : entry.error
                  ? "border-danger bg-danger/10"
                  : "border-border bg-surface",
            )}
          >
            <span className="text-muted mb-1 flex items-center gap-1 text-xs font-semibold uppercase">
              {entry.role === "assistant" ? <Bot className="size-4" aria-hidden /> : null}
              {entry.role === "user" ? t("you") : t("bot")}
            </span>
            {entry.content}
            {entry.draftLink ? (
              <Link
                href={entry.draftLink}
                className="text-accent mt-2 block font-semibold underline"
              >
                {t("cards.draft.create")}
              </Link>
            ) : null}
          </li>
        ))}
        {pending ? <li className="text-muted animate-pulse">{t("thinking")}</li> : null}
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(text);
        }}
      >
        <input
          aria-label={t("input.label")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("input.placeholder")}
          className="min-h-touch border-border-strong bg-surface focus:border-accent flex-1 rounded-lg border-2 px-3 text-base focus:outline-none"
        />
        <Button type="submit" disabled={pending || !text.trim()} aria-label={t("input.send")}>
          <Send className="size-6" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
