export const APP_ROLES = ["master", "worker", "manager", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_HOME: Record<AppRole, string> = {
  master: "/master",
  worker: "/worker",
  manager: "/manager",
  admin: "/admin",
};

export const PROTECTED_PREFIXES = Object.values(ROLE_HOME);

export function homeForRole(role: AppRole): string {
  return ROLE_HOME[role];
}

export function roleForPath(pathname: string): AppRole | null {
  const match = APP_ROLES.find((role) => {
    const home = ROLE_HOME[role];
    return pathname === home || pathname.startsWith(`${home}/`);
  });
  return match ?? null;
}

export function isProtectedPath(pathname: string): boolean {
  return roleForPath(pathname) !== null;
}
