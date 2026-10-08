import { useFormatter, useTranslations } from "next-intl";
import {
  filterBrigades,
  filterEmployees,
  shortName,
  summarize,
  type RatedBrigade,
  type RatedEmployee,
  type RatingFilter,
  type RatingSummary,
} from "@/lib/rating/board";
import type { RatingView } from "@/lib/rating/params";
import type { RatingWeights } from "@/lib/rating/formula";
import { cn } from "@/lib/utils";
import { RATING_PALETTE_CLASS } from "./palette";
import { RatingChart, type RatingChartRow } from "./rating-chart";
import { WeightsNote } from "./rating-header";
import { RatingLegend } from "./rating-legend";
import { RatingTable } from "./rating-table";

const LABEL_WIDTH: Record<RatingView, number> = { employees: 128, brigades: 156 };

function SummaryTiles({ summary }: { summary: RatingSummary }) {
  const t = useTranslations("rating.summary");
  const format = useFormatter();
  const tiles = [
    { key: "closed", value: format.number(summary.closed) },
    { key: "average", value: summary.average === null ? "—" : format.number(summary.average) },
    {
      key: "onTime",
      value: summary.onTimeShare === null ? "—" : t("percent", { value: summary.onTimeShare }),
    },
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.key} className="border-border bg-surface rounded-xl border-2 px-4 py-3">
          <dt className="text-muted text-xs font-semibold tracking-wide uppercase">
            {t(tile.key)}
          </dt>
          <dd className="font-mono text-3xl font-bold">{tile.value}</dd>
        </div>
      ))}
      <div className="border-border bg-surface rounded-xl border-2 px-4 py-3">
        <dt className="text-muted text-xs font-semibold tracking-wide uppercase">{t("leader")}</dt>
        <dd className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-semibold">{summary.leader?.name ?? "—"}</span>
          {summary.leader ? (
            <span className="text-accent font-mono text-2xl font-bold">
              {format.number(summary.leader.score)}
            </span>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

function chartRows(rows: (RatedEmployee | RatedBrigade)[], view: RatingView): RatingChartRow[] {
  return rows
    .filter((row) => row.closedCount > 0 || row.unexcusedRefusals > 0)
    .map((row) => {
      const name = row.name ?? "—";
      return {
        id: row.subjectId,
        name,
        label: view === "employees" ? (shortName(row.name) ?? name) : name,
        quality: row.contributions.quality,
        onTime: row.contributions.onTime,
        noRework: row.contributions.noRework,
        volume: row.contributions.volume,
        penalty: -row.components.refusalPenalty,
        score: row.score,
      };
    });
}

export function RatingBoardView({
  employees,
  brigades,
  weights,
  view,
  filter,
}: {
  employees: RatedEmployee[];
  brigades: RatedBrigade[];
  weights: RatingWeights;
  view: RatingView;
  filter: RatingFilter;
}) {
  const t = useTranslations("rating");
  const rows: (RatedEmployee | RatedBrigade)[] =
    view === "brigades" ? filterBrigades(brigades, filter) : filterEmployees(employees, filter);
  return (
    <div className={cn("flex flex-col gap-5", RATING_PALETTE_CLASS)}>
      <SummaryTiles summary={summarize(rows)} />
      <section
        aria-labelledby="rating-chart-title"
        className="border-border bg-surface flex flex-col gap-3 rounded-xl border-2 p-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id="rating-chart-title" className="text-lg font-bold">
            {t("chart.title")}
          </h2>
          <p className="text-muted text-sm">{t("chart.caption")}</p>
        </div>
        <RatingLegend weights={weights} />
        <RatingChart rows={chartRows(rows, view)} labelWidth={LABEL_WIDTH[view]} />
      </section>
      <section aria-labelledby="rating-table-title" className="flex flex-col gap-3">
        <h2 id="rating-table-title" className="text-lg font-bold">
          {t("table.title")}
        </h2>
        <RatingTable rows={rows} view={view} />
      </section>
      <WeightsNote weights={weights} />
    </div>
  );
}
