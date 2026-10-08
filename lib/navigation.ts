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
  | "settings"
  | "wrench"
  | "search"
  | "assistant"
  | "qr"
  | "demo";

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: NavIcon;
  primary?: boolean;
}

export const MAX_PRIMARY_ITEMS = 4;

export const NAVIGATION: Record<AppRole, NavItem[]> = {
  master: [
    { href: "/master", labelKey: "master.board", icon: "board", primary: true },
    { href: "/master/orders/new", labelKey: "master.newOrder", icon: "plus", primary: true },
    { href: "/master/orders", labelKey: "master.orders", icon: "list", primary: true },
    { href: "/master/assistant", labelKey: "master.assistant", icon: "assistant", primary: true },
    { href: "/master/lockouts", labelKey: "master.lockouts", icon: "lock" },
    { href: "/master/equipment", labelKey: "master.equipment", icon: "wrench" },
    { href: "/master/analytics", labelKey: "master.analytics", icon: "chart" },
    { href: "/master/rca", labelKey: "master.rca", icon: "search" },
    { href: "/master/rating", labelKey: "master.rating", icon: "star" },
    { href: "/master/reports", labelKey: "master.reports", icon: "report" },
  ],
  worker: [
    { href: "/worker", labelKey: "worker.orders", icon: "list", primary: true },
    { href: "/worker/history", labelKey: "worker.history", icon: "history", primary: true },
    { href: "/worker/rating", labelKey: "worker.rating", icon: "star", primary: true },
  ],
  manager: [
    { href: "/manager", labelKey: "manager.dashboard", icon: "board", primary: true },
    { href: "/manager/reports", labelKey: "manager.reports", icon: "report", primary: true },
    { href: "/manager/analytics", labelKey: "manager.analytics", icon: "chart", primary: true },
    { href: "/manager/rating", labelKey: "manager.rating", icon: "star", primary: true },
  ],
  admin: [
    { href: "/admin", labelKey: "admin.references", icon: "database", primary: true },
    { href: "/admin/employees", labelKey: "admin.employees", icon: "users", primary: true },
    { href: "/admin/settings", labelKey: "admin.settings", icon: "settings", primary: true },
    { href: "/admin/demo", labelKey: "admin.demo", icon: "demo", primary: true },
    { href: "/admin/qr", labelKey: "admin.qr", icon: "qr" },
  ],
};

export function splitNavigation(items: readonly NavItem[]): {
  primary: NavItem[];
  more: NavItem[];
} {
  const primary = items.filter((item) => item.primary).slice(0, MAX_PRIMARY_ITEMS);
  return { primary, more: items.filter((item) => !primary.includes(item)) };
}

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
