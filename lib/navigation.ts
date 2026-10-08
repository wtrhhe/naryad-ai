import type { AppRole } from "@/lib/auth/roles";
import type navMessages from "@/messages/ru/nav.json";

type NavMessages = typeof navMessages;

export type NavLabelKey = {
  [Section in keyof NavMessages]: `${Section & string}.${keyof NavMessages[Section] & string}`;
}[keyof NavMessages];

export type NavIcon =
  | "board"
  | "plus"
  | "list"
  | "lock"
  | "chart"
  | "history"
  | "star"
  | "report"
  | "database"
  | "users"
  | "settings";

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: NavIcon;
}

export const NAVIGATION: Record<AppRole, NavItem[]> = {
  master: [
    { href: "/master", labelKey: "master.board", icon: "board" },
    { href: "/master/orders/new", labelKey: "master.newOrder", icon: "plus" },
    { href: "/master/orders", labelKey: "master.orders", icon: "list" },
    { href: "/master/lockouts", labelKey: "master.lockouts", icon: "lock" },
    { href: "/master/analytics", labelKey: "master.analytics", icon: "chart" },
  ],
  worker: [
    { href: "/worker", labelKey: "worker.orders", icon: "list" },
    { href: "/worker/history", labelKey: "worker.history", icon: "history" },
    { href: "/worker/rating", labelKey: "worker.rating", icon: "star" },
  ],
  manager: [
    { href: "/manager", labelKey: "manager.dashboard", icon: "board" },
    { href: "/manager/reports", labelKey: "manager.reports", icon: "report" },
    { href: "/manager/analytics", labelKey: "manager.analytics", icon: "chart" },
  ],
  admin: [
    { href: "/admin", labelKey: "admin.references", icon: "database" },
    { href: "/admin/employees", labelKey: "admin.employees", icon: "users" },
    { href: "/admin/settings", labelKey: "admin.settings", icon: "settings" },
  ],
};

export function isActiveNavItem(pathname: string, item: NavItem, items: NavItem[]): boolean {
  const matches = items.filter(
    (candidate) => pathname === candidate.href || pathname.startsWith(`${candidate.href}/`),
  );
  const longest = matches.reduce<NavItem | null>(
    (best, candidate) => (!best || candidate.href.length > best.href.length ? candidate : best),
    null,
  );
  return longest?.href === item.href;
}
