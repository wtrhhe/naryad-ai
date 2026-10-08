import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { EquipmentProblem } from "@/lib/dashboard/kpi";
import { formatHours } from "@/lib/dashboard/format";
import { formatTenge } from "@/lib/safety/downtime";
import { EmptyState, Panel } from "@/components/dashboard/panel";

export function TopEquipment({ items, hrefBase }: { items: EquipmentProblem[]; hrefBase: string }) {
  const t = useTranslations("dashboard.topEquipment");
  const stats = useTranslations("equipment.stats");
  const locale = useLocale();
  const maxCost = Math.max(1, ...items.map((item) => item.downtimeCost));
  return (
    <Panel title={t("title")}>
      {items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-muted text-left text-xs uppercase">
              <th scope="col" className="pb-2 font-semibold">
                {t("equipment")}
              </th>
              <th scope="col" className="w-16 pb-2 text-right font-semibold sm:w-24">
                {t("unplanned")}
              </th>
              <th scope="col" className="w-32 pb-2 pl-3 text-right font-semibold sm:w-40">
                {t("downtime")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.equipmentId} className="border-border border-t">
                <td className="py-2 pr-2">
                  <Link
                    href={`${hrefBase}/${item.equipmentId}`}
                    className="group hover:text-accent flex min-h-11 items-center gap-2"
                    title={t("open")}
                  >
                    <span className="text-muted font-mono text-xs">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className="text-muted block truncate text-xs">
                        {item.inventoryNumber}
                        {" · "}
                        {item.siteName}
                      </span>
                    </span>
                    <ChevronRight
                      className="text-muted group-hover:text-accent ml-auto size-4 shrink-0"
                      aria-hidden
                    />
                  </Link>
                </td>
                <td className="py-2 text-right font-mono text-lg font-bold tabular-nums">
                  {item.unplanned}
                </td>
                <td className="py-2 pl-3 text-right">
                  <span className="block font-mono font-semibold whitespace-nowrap tabular-nums">
                    {formatTenge(item.downtimeCost)}
                  </span>
                  <span className="text-muted block text-xs whitespace-nowrap">
                    {stats("hours", { value: formatHours(item.downtimeHours, locale) })}
                  </span>
                  <span className="bg-surface-raised mt-1 ml-auto block h-1 w-full max-w-24 overflow-hidden rounded-full">
                    <span
                      className="bg-accent block h-full rounded-full"
                      style={{ width: `${(item.downtimeCost / maxCost) * 100}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
