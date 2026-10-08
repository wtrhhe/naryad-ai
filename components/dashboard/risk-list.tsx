import Link from "next/link";
import { useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";
import type { RiskRow } from "@/lib/dashboard/kpi";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { RiskBadge } from "@/components/equipment/risk-badge";
import { cn } from "@/lib/utils";

export function RiskList({ items, hrefBase }: { items: RiskRow[]; hrefBase: string }) {
  const t = useTranslations("dashboard.risks");
  const reasons = useTranslations("equipment.risk.reasons");
  const fromInsights = items.some((item) => item.source === "insight");
  return (
    <Panel
      title={t("title")}
      description={items.length > 0 ? t(fromInsights ? "sourceInsight" : "sourceTrend") : undefined}
    >
      {items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.equipmentId}>
              <Link
                href={`${hrefBase}/${item.equipmentId}`}
                className={cn(
                  "hover:border-accent flex flex-col gap-1.5 rounded-lg border-2 px-3 py-2 transition-colors",
                  item.level === "high" ? "border-danger/50" : "border-border",
                )}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{item.name}</span>
                    <span className="text-muted block truncate text-xs">{item.siteName}</span>
                  </span>
                  <RiskBadge level={item.level} score={item.score} />
                </span>
                {item.summary ? <span className="text-sm">{item.summary}</span> : null}
                {item.recommendation ? (
                  <span className="text-muted text-xs">{item.recommendation}</span>
                ) : null}
                <span className="text-muted inline-flex items-center gap-1.5 text-xs">
                  <TrendingUp className="size-3.5 shrink-0" aria-hidden />
                  {t("trend", { recent: item.recent, previous: item.previous })}
                  {item.reasons
                    .filter((reason) => reason.code === "repeat" || reason.code === "rca")
                    .map((reason) => (
                      <span key={reason.code}>
                        {" · "}
                        {reasons(reason.code, { value: reason.value })}
                      </span>
                    ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
