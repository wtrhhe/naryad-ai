import { useFormatter, useTranslations } from "next-intl";
import type { RatedBrigade, RatedEmployee } from "@/lib/rating/board";
import type { RatingView } from "@/lib/rating/params";
import { cn } from "@/lib/utils";
import { ContributionBar } from "./contribution-bar";

type RatedRow = RatedEmployee | RatedBrigade;

function isBrigade(row: RatedRow): row is RatedBrigade {
  return "memberCount" in row;
}

const PLACE_STYLES: Record<number, string> = {
  1: "bg-accent text-accent-foreground",
  2: "bg-surface-raised text-foreground border-2 border-border-strong",
  3: "bg-surface-raised text-foreground border-2 border-border",
};

export function RatingTable({ rows, view }: { rows: RatedRow[]; view: RatingView }) {
  const t = useTranslations("rating.table");
  const format = useFormatter();
  if (rows.length === 0) {
    return (
      <p className="border-border text-muted rounded-xl border-2 border-dashed p-8 text-center">
        {t("empty")}
      </p>
    );
  }
  const numericCell = "px-3 py-3 text-right font-mono tabular-nums";
  return (
    <div className="border-border bg-surface overflow-hidden rounded-xl border-2">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t("title")}</caption>
        <thead className="bg-surface-raised text-muted text-xs font-semibold tracking-wide uppercase">
          <tr>
            <th scope="col" className="w-14 px-3 py-2 text-left">
              {t("place")}
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              {view === "brigades" ? t("brigade") : t("employee")}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {t("score")}
            </th>
            <th scope="col" className="hidden w-[28%] px-3 py-2 text-left md:table-cell">
              {t("components")}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right sm:table-cell">
              {t("closed")}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right lg:table-cell">
              {t("onTime")}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right lg:table-cell">
              {t("rework")}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right lg:table-cell">
              {t("repeat")}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right lg:table-cell">
              {t("refusals")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const idle = row.closedCount === 0;
            const subtitle = isBrigade(row)
              ? t("members", { count: row.memberCount })
              : (row.brigadeName ?? undefined);
            return (
              <tr key={row.subjectId} className={cn("border-border border-t", idle && "opacity-60")}>
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-full font-mono text-sm font-bold",
                      idle
                        ? "text-muted"
                        : (PLACE_STYLES[row.place] ?? "text-foreground bg-transparent"),
                    )}
                  >
                    {idle ? "—" : row.place}
                  </span>
                </td>
                <th scope="row" className="px-3 py-3 text-left align-top font-normal">
                  <span className="block font-semibold">{row.name ?? t("unknown")}</span>
                  {subtitle ? <span className="text-muted block text-xs">{subtitle}</span> : null}
                  {idle ? (
                    <span className="text-muted block text-xs">{t("noData")}</span>
                  ) : (
                    <span className="mt-2 flex items-center gap-2 md:hidden">
                      <ContributionBar
                        contributions={row.contributions}
                        penalty={row.components.refusalPenalty}
                      />
                      <span className="text-muted shrink-0 font-mono text-xs sm:hidden">
                        {t("closedCount", { count: row.closedCount })}
                      </span>
                    </span>
                  )}
                </th>
                <td className={cn(numericCell, "align-top text-xl font-bold")}>
                  {format.number(row.score)}
                </td>
                <td className="hidden px-3 py-3 align-middle md:table-cell">
                  {idle ? null : (
                    <ContributionBar
                      contributions={row.contributions}
                      penalty={row.components.refusalPenalty}
                    />
                  )}
                </td>
                <td className={cn(numericCell, "hidden sm:table-cell")}>{row.closedCount}</td>
                <td className={cn(numericCell, "hidden lg:table-cell")}>
                  {idle ? (
                    "—"
                  ) : (
                    <>
                      {row.onTimeCount}/{row.closedCount}
                    </>
                  )}
                </td>
                <td className={cn(numericCell, "hidden lg:table-cell")}>{row.reworkedCount}</td>
                <td
                  className={cn(
                    numericCell,
                    "hidden lg:table-cell",
                    row.repeatCount > 0 && "text-danger font-bold",
                  )}
                >
                  {row.repeatCount}
                </td>
                <td
                  className={cn(
                    numericCell,
                    "hidden lg:table-cell",
                    row.unexcusedRefusals > 0 && "text-danger font-bold",
                  )}
                >
                  {row.unexcusedRefusals}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
