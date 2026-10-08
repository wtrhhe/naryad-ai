"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { downtimeCost, downtimeHours, formatElapsed, formatTenge } from "@/lib/safety/downtime";
import { cn } from "@/lib/utils";

export interface DowntimeCounterProps {
  startedAt: string;
  endedAt: string | null;
  costPerHour: number;
  compact?: boolean;
}

function useNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function DowntimeCounter({
  startedAt,
  endedAt,
  costPerHour,
  compact = false,
}: DowntimeCounterProps) {
  const t = useTranslations("safety.downtime");
  const now = useNow(endedAt === null);
  const cost = downtimeCost(startedAt, endedAt, costPerHour, now);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-2 font-mono",
        endedAt === null ? "text-accent" : "text-muted",
      )}
      aria-live="off"
      title={t("perHour", { cost: formatTenge(costPerHour) })}
    >
      {compact ? null : (
        <span className="font-sans text-xs font-semibold uppercase">{t("label")}</span>
      )}
      <span className="font-bold tabular-nums">{formatTenge(cost)}</span>
      {compact ? null : (
        <span className="text-xs tabular-nums">
          {formatElapsed(downtimeHours(startedAt, endedAt, now))}
        </span>
      )}
    </span>
  );
}

export function DowntimeTotal({ items }: { items: Omit<DowntimeCounterProps, "compact">[] }) {
  const t = useTranslations("safety.downtime");
  const now = useNow(items.some((item) => item.endedAt === null));
  const total = items.reduce(
    (sum, item) => sum + downtimeCost(item.startedAt, item.endedAt, item.costPerHour, now),
    0,
  );
  return (
    <div className="border-accent/60 bg-surface rounded-xl border-2 px-4 py-3">
      <p className="text-muted text-xs font-semibold tracking-wide uppercase">{t("total")}</p>
      <p className="text-accent font-mono text-3xl font-bold tabular-nums">{formatTenge(total)}</p>
    </div>
  );
}
