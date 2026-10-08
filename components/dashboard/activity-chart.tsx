"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_TICK,
  CHART_HEIGHT,
  DataTable,
  GRID_STROKE,
  LegendItem,
  TooltipCard,
  useDayLabel,
} from "@/components/dashboard/chart-parts";

export interface ActivityPoint {
  day: string;
  issued: number;
  closed: number;
}

const ISSUED_COLOR = "var(--status-queue)";
const CLOSED_COLOR = "var(--status-free)";

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const t = useTranslations("dashboard.charts");
  const dayLabel = useDayLabel();
  const series = [
    { key: "issued" as const, label: t("issued"), color: ISSUED_COLOR },
    { key: "closed" as const, label: t("closed"), color: CLOSED_COLOR },
  ];
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap gap-4">
        {series.map((item) => (
          <LegendItem key={item.key} color={item.color} label={item.label} line />
        ))}
      </figcaption>
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={dayLabel}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={dayLabel(String(label))}
                    rows={series.map((item) => ({
                      key: item.key,
                      label: item.label,
                      color: item.color,
                      value: String(
                        payload.find((entry) => entry.dataKey === item.key)?.value ?? 0,
                      ),
                    }))}
                  />
                ) : null
              }
            />
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={data.length <= 31 ? { r: 3, strokeWidth: 0, fill: item.color } : false}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2, fill: item.color }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={t("activity")}
        headers={[t("date"), t("issued"), t("closed")]}
        rows={data.map((point) => ({
          key: point.day,
          cells: [dayLabel(point.day), point.issued, point.closed],
        }))}
      />
    </figure>
  );
}
