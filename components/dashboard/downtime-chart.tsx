"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_TICK,
  CHART_HEIGHT,
  DataTable,
  GRID_STROKE,
  TooltipCard,
  useDayLabel,
} from "@/components/dashboard/chart-parts";
import { compactNumber, formatHours } from "@/lib/dashboard/format";
import { formatTenge } from "@/lib/safety/downtime";

export interface DowntimePoint {
  day: string;
  downtimeCost: number;
  downtimeHours: number;
}

const BAR_COLOR = "var(--accent)";

export function DowntimeChart({ data }: { data: DowntimePoint[] }) {
  const t = useTranslations("dashboard.charts");
  const locale = useLocale();
  const dayLabel = useDayLabel();
  return (
    <figure className="flex flex-col gap-3">
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2}>
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
              tickFormatter={(value: number) => compactNumber(value, locale)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-raised)" }}
              content={({ active, payload, label }) => {
                const point = payload?.[0]?.payload as DowntimePoint | undefined;
                return active && point ? (
                  <TooltipCard
                    title={dayLabel(String(label))}
                    rows={[
                      {
                        key: "cost",
                        label: t("cost"),
                        value: formatTenge(point.downtimeCost),
                        color: BAR_COLOR,
                      },
                      {
                        key: "hours",
                        label: t("hours"),
                        value: t("downtimeHours", {
                          value: formatHours(point.downtimeHours, locale),
                        }),
                      },
                    ]}
                  />
                ) : null;
              }}
            />
            <Bar
              dataKey="downtimeCost"
              name={t("cost")}
              fill={BAR_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={t("downtime")}
        headers={[t("date"), t("cost"), t("hours")]}
        rows={data.map((point) => ({
          key: point.day,
          cells: [
            dayLabel(point.day),
            formatTenge(point.downtimeCost),
            formatHours(point.downtimeHours, locale),
          ],
        }))}
      />
    </figure>
  );
}
