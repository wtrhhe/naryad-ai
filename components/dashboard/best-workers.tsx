import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import type { WorkerScore } from "@/lib/dashboard/kpi";
import { EmptyState, Panel } from "@/components/dashboard/panel";

export function BestWorkers({ items }: { items: WorkerScore[] }) {
  const t = useTranslations("dashboard.workers");
  return (
    <Panel title={t("title")}>
      {items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-muted text-left text-xs uppercase">
              <th scope="col" className="pb-2 font-semibold">
                {t("name")}
              </th>
              <th scope="col" className="w-20 pb-2 text-right font-semibold sm:w-24">
                {t("closed")}
              </th>
              <th scope="col" className="w-24 pb-2 text-right font-semibold sm:w-28">
                {t("score")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.employeeId} className="border-border border-t">
                <td className="py-2 pr-2">
                  <span className="flex min-h-11 items-center gap-2">
                    <span className="text-muted font-mono text-xs">{index + 1}</span>
                    <span className="truncate font-semibold">{item.name}</span>
                  </span>
                </td>
                <td className="py-2 text-right font-mono text-lg font-bold tabular-nums">
                  {item.closed}
                </td>
                <td className="py-2 text-right">
                  {item.avgScore === null ? (
                    <span className="text-muted">{"—"}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-lg font-bold tabular-nums">
                      <Star className="text-accent size-4" aria-hidden />
                      {Math.round(item.avgScore)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
