"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isActiveNavItem, NAVIGATION } from "@/lib/navigation";
import type { AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

export function RoleNav({ role, variant }: { role: AppRole; variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const items = NAVIGATION[role];
  return (
    <nav
      className={cn(
        variant === "sidebar"
          ? "border-border bg-surface hidden w-60 shrink-0 flex-col gap-1 border-r-2 p-3 md:flex"
          : "border-border bg-surface fixed inset-x-0 bottom-0 z-20 grid border-t-2 pb-[env(safe-area-inset-bottom)] md:hidden",
      )}
      style={
        variant === "bottom"
          ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {items.map((item) => {
        const active = isActiveNavItem(pathname, item, items);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 font-semibold transition-colors",
              variant === "sidebar"
                ? "min-h-12 rounded-lg px-3 text-base"
                : "min-h-touch flex-col justify-center gap-1 px-1 text-[11px] leading-tight",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-surface-raised hover:text-foreground",
            )}
          >
            <NavIcon name={item.icon} className={variant === "sidebar" ? "size-5" : "size-6"} />
            <span className={variant === "bottom" ? "line-clamp-1 text-center" : undefined}>
              {t(item.labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
