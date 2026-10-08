"use client";

import { useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { RATING_PRESETS, type RatingPreset } from "@/lib/rating/period";
import { cn } from "@/lib/utils";

const PERIOD_KEYS = ["period", "from", "to"] as const;

export function PeriodSwitcher({
  preset,
  from,
  to,
}: {
  preset: RatingPreset;
  from: string;
  to: string;
}) {
  const t = useTranslations("rating");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const [range, setRange] = useState({ from, to });

  const navigate = (next: Record<string, string>) => {
    const query = new URLSearchParams(params);
    PERIOD_KEYS.forEach((key) => query.delete(key));
    Object.entries(next).forEach(([key, value]) => query.set(key, value));
    startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
  };

  const choose = (option: RatingPreset) => {
    if (option === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    navigate({ period: option });
  };

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!range.from || !range.to) return;
    const [start, end] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
    navigate({ period: "custom", from: start, to: end });
  };

  return (
    <div className="flex flex-col gap-3" aria-busy={isPending}>
      <div
        role="group"
        aria-label={t("presets.label")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
      >
        {RATING_PRESETS.map((option) => {
          const active = option === "custom" ? customOpen : !customOpen && option === preset;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => choose(option)}
              className={cn(
                "min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-semibold transition-colors",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface text-foreground hover:border-border-strong",
              )}
            >
              {t(`presets.${option}`)}
            </button>
          );
        })}
      </div>
      {customOpen ? (
        <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
          <label className="text-muted flex min-w-36 flex-1 flex-col gap-1 text-xs font-semibold uppercase sm:flex-none">
            {t("custom.from")}
            <input
              type="date"
              required
              value={range.from}
              onChange={(event) =>
                setRange((current) => ({ ...current, from: event.target.value }))
              }
              className="border-border bg-surface text-foreground focus:border-accent min-h-11 rounded-lg border-2 px-2 text-sm font-medium normal-case"
            />
          </label>
          <label className="text-muted flex min-w-36 flex-1 flex-col gap-1 text-xs font-semibold uppercase sm:flex-none">
            {t("custom.to")}
            <input
              type="date"
              required
              value={range.to}
              onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
              className="border-border bg-surface text-foreground focus:border-accent min-h-11 rounded-lg border-2 px-2 text-sm font-medium normal-case"
            />
          </label>
          <Button type="submit" size="md" disabled={isPending}>
            {t("custom.apply")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
