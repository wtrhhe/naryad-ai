"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { setLocale, setTheme } from "@/app/actions/preferences";
import { LOCALES } from "@/i18n/config";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function PreferencesMenu({ theme }: { theme: Theme }) {
  const locale = useLocale();
  const t = useTranslations("shell");
  const common = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  return (
    <div className="flex items-center gap-2" aria-busy={isPending}>
      <div
        role="group"
        aria-label={t("language")}
        className="border-border flex overflow-hidden rounded-lg border-2"
      >
        {LOCALES.map((option) => (
          <button
            key={option}
            type="button"
            lang={option}
            onClick={() => startTransition(() => setLocale(option))}
            aria-pressed={locale === option}
            title={common(`locales.${option}`)}
            className={cn(
              "min-h-11 min-w-11 px-2 font-mono text-sm font-semibold uppercase",
              locale === option ? "bg-surface-raised text-foreground" : "text-muted",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => startTransition(() => setTheme(nextTheme))}
        aria-label={`${t("theme")}: ${nextTheme === "light" ? t("themeLight") : t("themeDark")}`}
        className="border-border text-muted hover:text-foreground flex min-h-11 min-w-11 items-center justify-center rounded-lg border-2"
      >
        {theme === "dark" ? (
          <Sun className="size-5" aria-hidden />
        ) : (
          <Moon className="size-5" aria-hidden />
        )}
      </button>
    </div>
  );
}
