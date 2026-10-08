import Link from "next/link";
import { useTranslations } from "next-intl";
import { PERIOD_OPTIONS, type PeriodDays } from "@/lib/dashboard/period";
import { cn } from "@/lib/utils";

export function PeriodSwitcher({ current, basePath }: { current: PeriodDays; basePath: string }) {
  const t = useTranslations("dashboard.period");
  return (
    <nav aria-label={t("label")} className="border-border bg-surface flex rounded-lg border-2 p-1">
      {PERIOD_OPTIONS.map((days) => (
        <Link
          key={days}
          href={`${basePath}?period=${days}`}
          scroll={false}
          aria-current={days === current ? "page" : undefined}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold whitespace-nowrap transition-colors",
            days === current
              ? "bg-accent text-accent-foreground"
              : "text-muted hover:bg-surface-raised hover:text-foreground",
          )}
        >
          {t("option", { days })}
        </Link>
      ))}
    </nav>
  );
}
