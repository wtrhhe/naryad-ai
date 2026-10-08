"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Factory } from "lucide-react";
import { liveDowntime, type OpenDowntime } from "@/lib/dashboard/kpi";
import { formatHours } from "@/lib/dashboard/format";
import { formatTenge } from "@/lib/safety/downtime";

export interface DowntimeHeroProps {
  days: number;
  closedHours: number;
  closedCost: number;
  open: OpenDowntime[];
  equipmentDown: number;
  renderedAt: string;
}

function useTicking(initial: string, active: boolean): Date {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function DowntimeHero({
  days,
  closedHours,
  closedCost,
  open,
  equipmentDown,
  renderedAt,
}: DowntimeHeroProps) {
  const t = useTranslations("dashboard.downtime");
  const locale = useLocale();
  const now = useTicking(renderedAt, open.length > 0);
  const live = liveDowntime({ closedHours, closedCost }, open, now);
  return (
    <section
      aria-label={t("title", { days })}
      className="border-accent/60 bg-surface flex min-w-0 flex-col justify-between gap-3 rounded-xl border-2 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">
          {t("title", { days })}
        </h2>
        <p className="text-accent font-mono text-4xl font-bold tabular-nums md:text-5xl">
          {formatTenge(live.cost)}
        </p>
        <p className="text-muted text-sm">
          {t("hours", { value: formatHours(live.hours, locale) })}
        </p>
      </div>
      <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 pt-3 text-sm">
        {open.length > 0 ? (
          <>
            <span className="inline-flex items-center gap-2 font-semibold">
              <span className="bg-accent size-2.5 animate-pulse rounded-full" aria-hidden />
              <Factory className="text-accent size-4" aria-hidden />
              {t("now", { count: equipmentDown })}
            </span>
            <span className="text-muted">
              {t("nowCost")}{" "}
              <span className="text-foreground font-mono font-bold tabular-nums">
                {formatTenge(live.currentCost)}
              </span>
            </span>
          </>
        ) : (
          <span className="text-muted">{t("none")}</span>
        )}
      </div>
    </section>
  );
}
