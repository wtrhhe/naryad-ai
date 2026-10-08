import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { LiveRefresh } from "@/components/board/live-refresh";
import { formatElapsed, downtimeHours } from "@/lib/safety/downtime";

interface LockoutRow {
  id: string;
  locked_at: string;
  work_order: { id: string; number: number } | null;
  equipment: { name: string; inventory_number: string } | null;
  locker: { full_name: string } | null;
}

export async function generateMetadata() {
  const t = await getTranslations("safety.lockouts");
  return { title: t("title") };
}

export default async function LockoutsPage() {
  const employee = await requireRole("master", "manager", "admin");
  const [t, workOrder, format, supabase] = await Promise.all([
    getTranslations("safety.lockouts"),
    getTranslations("workOrder"),
    getFormatter(),
    createSupabaseServerClient(),
  ]);
  const { data, error } = await supabase
    .from("lockouts")
    .select(
      "id, locked_at, work_order:work_order_id(id, number), equipment:equipment_id(name, inventory_number), locker:employees!lockouts_locked_by_fkey(full_name)",
    )
    .is("released_at", null)
    .order("locked_at", { ascending: false });
  if (error) throw new Error(`Failed to load lockouts: ${error.message}`);
  const rows = (data ?? []) as unknown as LockoutRow[];
  const now = new Date();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{t("title")}</h1>
        <LiveRefresh channel={`lockouts-${employee.id}`} />
      </div>
      {rows.length === 0 ? (
        <p className="border-border text-muted rounded-xl border-2 border-dashed p-8 text-center">
          {t("empty")}
        </p>
      ) : null}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-accent/70 bg-surface flex flex-col gap-2 rounded-xl border-2 p-4"
          >
            <span className="bg-accent text-accent-foreground inline-flex w-fit items-center gap-2 rounded-md px-2 py-1 text-xs font-bold uppercase">
              <Lock className="size-4" aria-hidden />
              {t("badge")}
            </span>
            <span className="text-lg font-bold">{row.equipment?.name}</span>
            <span className="text-muted font-mono text-sm">{row.equipment?.inventory_number}</span>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">{t("lockedBy")}</dt>
              <dd className="font-semibold">{row.locker?.full_name}</dd>
              <dt className="text-muted">{t("since")}</dt>
              <dd className="font-mono">
                {format.dateTime(new Date(row.locked_at), {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })}
              </dd>
              <dt className="text-muted">{t("duration")}</dt>
              <dd className="font-mono">
                {formatElapsed(downtimeHours(row.locked_at, null, now))}
              </dd>
              <dt className="text-muted">{t("order")}</dt>
              <dd>
                {row.work_order ? (
                  <Link
                    href={`/master/orders/${row.work_order.id}`}
                    className="text-accent font-semibold hover:underline"
                  >
                    {workOrder("number", { number: row.work_order.number })}
                  </Link>
                ) : null}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
