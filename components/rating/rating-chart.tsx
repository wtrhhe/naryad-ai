"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RATING_COMPONENT_KEYS } from "@/lib/rating/explain";
import { PENALTY_PATTERN, RATING_SERIES, SERIES_COLOR } from "./palette";

export interface RatingChartRow {
  id: string;
  name: string;
  label: string;
  quality: number;
  onTime: number;
  noRework: number;
  volume: number;
  penalty: number;
  score: number;
}

const ROW_HEIGHT = 34;
const AXIS_HEIGHT = 28;
const BAR_SIZE = 18;
const MAX_LABEL = 18;
const SCORE_TICKS = [0, 25, 50, 75, 100];
const LAST_KEY = RATING_COMPONENT_KEYS[RATING_COMPONENT_KEYS.length - 1];

function truncate(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1).trimEnd()}…` : label;
}

function RatingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const t = useTranslations("rating");
  const format = useFormatter();
  const row = payload?.[0]?.payload as RatingChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="border-border-strong bg-surface text-foreground min-w-52 rounded-lg border-2 px-3 py-2 text-sm shadow-xl">
      <p className="font-semibold">{row.name}</p>
      <p className="text-muted mb-2 font-mono text-xs">{t("chart.score", { score: row.score })}</p>
      <ul className="flex flex-col gap-1">
        {RATING_SERIES.map((series) => {
          const value = row[series];
          if (series === "penalty" && value === 0) return null;
          return (
            <li key={series} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{
                  background: series === "penalty" ? PENALTY_PATTERN : SERIES_COLOR[series],
                }}
              />
              <span className="flex-1">{t(`components.${series}`)}</span>
              <span className="font-mono tabular-nums">
                {series === "penalty"
                  ? t("chart.penalty", { value: Math.abs(value) })
                  : format.number(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RatingChart({ rows, labelWidth }: { rows: RatingChartRow[]; labelWidth: number }) {
  const t = useTranslations("rating.chart");
  const format = useFormatter();
  if (rows.length === 0) {
    return <p className="text-muted py-6 text-center text-sm">{t("empty")}</p>;
  }
  const hasPenalty = rows.some((row) => row.penalty < 0);
  const minimum = hasPenalty ? Math.min(-10, ...rows.map((row) => row.penalty)) : 0;
  const height = rows.length * ROW_HEIGHT + AXIS_HEIGHT;
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 320, height }}
      >
        <BarChart
          data={rows}
          layout="vertical"
          stackOffset="sign"
          margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis
            type="number"
            domain={[minimum, 100]}
            ticks={hasPenalty ? [minimum, ...SCORE_TICKS] : SCORE_TICKS}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickFormatter={(value: number) => format.number(value)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            interval={0}
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            tickFormatter={(value: string) => truncate(value)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            content={(props) => <RatingTooltip active={props.active} payload={props.payload} />}
            wrapperStyle={{ outline: "none", zIndex: 20 }}
          />
          <ReferenceLine x={0} stroke="var(--border-strong)" />
          <Bar
            dataKey="penalty"
            stackId="rating"
            fill={SERIES_COLOR.penalty}
            barSize={BAR_SIZE}
            radius={[4, 0, 0, 4]}
            isAnimationActive={false}
          />
          {RATING_COMPONENT_KEYS.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="rating"
              fill={SERIES_COLOR[key]}
              stroke="var(--surface)"
              strokeWidth={1}
              barSize={BAR_SIZE}
              radius={key === LAST_KEY ? [0, 4, 4, 0] : 0}
              isAnimationActive={false}
            >
              {key === LAST_KEY ? (
                <LabelList
                  dataKey="score"
                  position="right"
                  fill="var(--foreground)"
                  fontSize={12}
                  fontWeight={700}
                  formatter={(value) => format.number(Number(value))}
                />
              ) : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
