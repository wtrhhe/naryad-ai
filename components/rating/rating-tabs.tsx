"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { RATING_VIEWS, type RatingView } from "@/lib/rating/params";
import { cn } from "@/lib/utils";

export function RatingTabs({ view }: { view: RatingView }) {
  const t = useTranslations("rating.tabs");
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (next: RatingView) => {
    const query = new URLSearchParams(params);
    if (next === "employees") query.delete("view");
    else query.set("view", next);
    const search = query.toString();
    return search ? `${pathname}?${search}` : pathname;
  };
  return (
    <nav
      aria-label={t("label")}
      className="bg-surface-raised border-border flex w-full gap-1 rounded-xl border-2 p-1 sm:w-fit"
    >
      {RATING_VIEWS.map((option) => (
        <Link
          key={option}
          href={href(option)}
          replace
          scroll={false}
          aria-current={option === view ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center rounded-lg px-5 text-sm font-semibold sm:flex-none",
            option === view
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          {t(option)}
        </Link>
      ))}
    </nav>
  );
}
