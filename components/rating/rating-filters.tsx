"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

interface Option {
  id: string;
  name: string;
}

const FILTER_KEYS = ["site", "brigade"] as const;

function FilterSelect({
  label,
  name,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: Option[];
  allLabel: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label className="text-muted flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold uppercase sm:flex-none">
      {label}
      <select
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

export function RatingFilters({
  sites,
  brigades,
}: {
  sites: Option[];
  brigades: (Option & { siteId: string | null })[];
}) {
  const t = useTranslations("rating.filters");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const site = params.get("site") ?? "";
  const brigade = params.get("brigade") ?? "";
  const replace = (query: URLSearchParams) => {
    const search = query.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }),
    );
  };
  const update = (name: string, value: string) => {
    const query = new URLSearchParams(params);
    if (value) query.set(name, value);
    else query.delete(name);
    if (name === "site") query.delete("brigade");
    replace(query);
  };
  const reset = () => {
    const query = new URLSearchParams(params);
    FILTER_KEYS.forEach((key) => query.delete(key));
    replace(query);
  };
  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <FilterSelect
        label={t("site")}
        name="site"
        value={site}
        options={sites}
        allLabel={t("all")}
        onChange={update}
      />
      <FilterSelect
        label={t("brigade")}
        name="brigade"
        value={brigade}
        options={brigades.filter((item) => !site || item.siteId === site)}
        allLabel={t("all")}
        onChange={update}
      />
      {site || brigade ? (
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
