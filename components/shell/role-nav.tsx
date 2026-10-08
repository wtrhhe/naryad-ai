"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreHorizontal, X } from "lucide-react";
import { isActiveNavItem, NAVIGATION, splitNavigation, type NavItem } from "@/lib/navigation";
import type { AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

const bottomItemClass =
  "min-h-touch flex flex-col items-center justify-center gap-1 px-1 text-[11px] leading-tight font-semibold transition-colors";

function itemTone(active: boolean): string {
  return active
    ? "bg-accent text-accent-foreground"
    : "text-muted hover:bg-surface-raised hover:text-foreground";
}

function SidebarNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const t = useTranslations("nav");
  return (
    <nav className="border-border bg-surface hidden w-60 shrink-0 flex-col gap-1 border-r-2 p-3 md:flex">
      {items.map((item) => {
        const active = isActiveNavItem(pathname, item, items);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-semibold transition-colors",
              itemTone(active),
            )}
          >
            <NavIcon name={item.icon} className="size-5" />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const { primary, more } = splitNavigation(items);
  const moreActive = more.some((item) => isActiveNavItem(pathname, item, items));
  const columns = primary.length + (more.length > 0 ? 1 : 0);
  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}
      {open ? (
        <div className="border-border bg-surface fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-2 gap-2 border-t-2 p-3 md:hidden">
          {more.map((item) => {
            const active = isActiveNavItem(pathname, item, items);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "min-h-touch flex items-center gap-3 rounded-lg px-3 font-semibold",
                  itemTone(active),
                )}
              >
                <NavIcon name={item.icon} className="size-6" />
                <span className="line-clamp-2">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
      <nav
        className="border-border bg-surface fixed inset-x-0 bottom-0 z-40 grid border-t-2 pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {primary.map((item) => {
          const active = isActiveNavItem(pathname, item, items);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(bottomItemClass, itemTone(active))}
            >
              <NavIcon name={item.icon} className="size-6" />
              <span className="line-clamp-1 text-center">{t(item.labelKey)}</span>
            </Link>
          );
        })}
        {more.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={cn(bottomItemClass, itemTone(moreActive && !open))}
          >
            {open ? (
              <X className="size-6" aria-hidden />
            ) : (
              <MoreHorizontal className="size-6" aria-hidden />
            )}
            <span>{open ? t("menu.close") : t("menu.more")}</span>
          </button>
        ) : null}
      </nav>
    </>
  );
}

export function RoleNav({ role, variant }: { role: AppRole; variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const items = NAVIGATION[role];
  return variant === "sidebar" ? (
    <SidebarNav items={items} pathname={pathname} />
  ) : (
    <BottomNav items={items} pathname={pathname} />
  );
}
