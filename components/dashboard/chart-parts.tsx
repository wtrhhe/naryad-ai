"use client";

import type { ReactNode } from "react";
import { useFormatter } from "next-intl";

export const CHART_HEIGHT = 240;

export const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 };

export const GRID_STROKE = "var(--border)";

export function useDayLabel(): (day: string) => string {
  const format = useFormatter();
  return (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00+05:00`), { day: "2-digit", month: "2-digit" });
}

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  color?: string;
}

export function TooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="border-border-strong bg-surface-raised text-foreground rounded-lg border-2 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            {row.color ? (
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: row.color }}
                aria-hidden
              />
            ) : null}
            <span className="text-muted">{row.label}</span>
            <span className="ml-auto pl-3 font-mono font-semibold tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LegendItem({
  color,
  label,
  line = false,
}: {
  color: string;
  label: string;
  line?: boolean;
}) {
  return (
    <span className="text-muted inline-flex items-center gap-2 text-xs font-semibold">
      <span
        className={line ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-sm"}
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) => (
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
