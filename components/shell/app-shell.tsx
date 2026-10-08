import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { CurrentEmployee } from "@/lib/auth/session";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";
import { PreferencesMenu } from "./preferences-menu";
import { RoleNav } from "./role-nav";
import { SignOutButton } from "./sign-out-button";

export async function AppShell({
  employee,
  children,
}: {
  employee: CurrentEmployee;
  children: ReactNode;
}) {
  const [common, auth, cookieStore] = await Promise.all([
    getTranslations("common"),
    getTranslations("auth"),
    cookies(),
  ]);
  const theme = resolveTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border bg-background/95 sticky top-0 z-30 flex items-center justify-between gap-3 border-b-2 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex min-h-16 min-w-0 flex-col justify-center">
          <span className="text-accent font-mono text-xs tracking-[0.25em] uppercase">
            {common("appName")}
          </span>
          <span className="truncate text-sm font-semibold">
            {employee.fullName}
            <span className="text-muted">
              {" · "}
              {common(`roles.${employee.role}`)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PreferencesMenu theme={theme} />
          <SignOutButton label={auth("signOut")} />
        </div>
      </header>
      <div className="flex flex-1">
        <RoleNav role={employee.role} variant="sidebar" />
        <main className="w-full flex-1 px-4 pt-5 pb-28 md:px-8 md:pb-10">{children}</main>
      </div>
      <RoleNav role={employee.role} variant="bottom" />
    </div>
  );
}
