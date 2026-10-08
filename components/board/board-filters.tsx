"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { WORK_ORDER_PRIORITIES } from "@/lib/domain/work-order-schemas";

interface Option {
  id: string;
  name: string;
}

export interface BoardFiltersProps {
  firstFieldId: string;
  sites: Option[];
  equipment: (Option & { siteId: string })[];
  workers: Option[];
}

const FILTER_KEYS = ["site", "equipment", "assignee", "priority"] as const;

function Select({
  id,
  label,
  name,
  value,
  options,
  onChange,
  allLabel,
}: {
  id?: string;
  label: string;
  name: string;
  value: string;
  options: Option[];
  onChange: (name: string, value: string) => void;
  allLabel: string;
}) {
  return (
    <label className="text-muted flex min-w-36 flex-1 flex-col gap-1 text-xs font-semibold uppercase">
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        className="border-border bg-surface text-foreground focus:border-accent min-h-11 rounded-lg border-2 px-2 text-sm font-medium normal-case"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BoardFilters({ firstFieldId, sites, equipment, workers }: BoardFiltersProps) {
  const t = useTranslations("board.filters");
  const priorities = useTranslations("workOrder.priority");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const site = params.get("site") ?? "";
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name === "site") next.delete("equipment");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const reset = () => startTransition(() => router.replace(pathname, { scroll: false }));
  const hasFilters = FILTER_KEYS.some((key) => params.has(key));
  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <Select
        id={firstFieldId}
        label={t("site")}
        name="site"
        value={site}
        options={sites}
        onChange={update}
        allLabel={t("all")}
      />
      <Select
        label={t("equipment")}
        name="equipment"
        value={params.get("equipment") ?? ""}
        options={equipment.filter((item) => !site || item.siteId === site)}
        onChange={update}
        allLabel={t("all")}
      />
      <Select
        label={t("assignee")}
        name="assignee"
        value={params.get("assignee") ?? ""}
        options={workers}
        onChange={update}
        allLabel={t("all")}
      />
      <Select
        label={t("priority")}
        name="priority"
        value={params.get("priority") ?? ""}
        options={WORK_ORDER_PRIORITIES.map((priority) => ({
          id: priority,
          name: priorities(priority),
        }))}
        onChange={update}
        allLabel={t("all")}
      />
      {hasFilters ? (
        <button
          type="button"
          onClick={reset}
          className="text-accent min-h-11 rounded-lg px-3 text-sm font-semibold hover:underline"
        >
          {t("reset")}
        </button>
      ) : null}
    </div>
  );
}
