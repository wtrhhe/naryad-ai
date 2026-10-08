import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function WorkerLayout({ children }: { children: ReactNode }) {
  const employee = await requireRole("worker");
  return <AppShell employee={employee}>{children}</AppShell>;
}
