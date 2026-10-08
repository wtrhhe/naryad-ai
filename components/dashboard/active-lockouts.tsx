import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import type { LockoutRow } from "@/lib/dashboard/kpi";
import { EmptyState, Panel } from "@/components/dashboard/panel";

export function ActiveLockouts({ items, hrefBase }: { items: LockoutRow[]; hrefBase: string }) {
  const t = useTranslations("dashboard.lockouts");
  const format = useFormatter();
  return (
    <Panel title={t("title")}>
      {items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${hrefBase}/${item.equipmentId}`}
                className="border-accent/50 hover:border-accent flex min-h-14 items-start gap-3 rounded-lg border-2 px-3 py-2 transition-colors"
              >
                <Lock className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.equipmentName}</span>
                  <span className="text-muted block text-xs">
                    {item.orderNumber !== null ? t("order", { number: item.orderNumber }) : null}
                    {item.orderNumber !== null && item.lockedBy ? " · " : null}
                    {item.lockedBy ? t("by", { name: item.lockedBy }) : null}
                  </span>
                </span>
                <span className="text-muted shrink-0 font-mono text-xs">
                  {t("since", {
                    time: format.dateTime(new Date(item.lockedAt), {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
