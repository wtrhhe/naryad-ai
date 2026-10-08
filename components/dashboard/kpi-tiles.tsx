import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlarmClock,
  CheckCheck,
  ClipboardList,
  FileSearch,
  Lock,
  Send,
  Timer,
  Wrench,
} from "lucide-react";
import type { DashboardKpis } from "@/lib/dashboard/kpi";
import { durationKey, sharePercent, splitMinutes } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";

function Tile({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "accent" | "muted";
}) {
  return (
    <div
      className={cn(
        "bg-surface flex min-w-0 flex-col gap-1 rounded-xl border-2 px-4 py-3",
        tone === "danger" ? "border-danger/60" : "border-border",
      )}
    >
      <dt className="text-muted flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className={cn(
          "font-mono text-2xl font-bold md:text-3xl",
          tone === "danger" && "text-danger",
          tone === "accent" && "text-accent",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </dd>
      {hint ? <dd className="text-muted truncate text-xs">{hint}</dd> : null}
    </div>
  );
}

function DurationValue({ minutes }: { minutes: number | null }) {
  const t = useTranslations("dashboard");
  if (minutes === null) {
    return <span className="text-muted text-lg">{t("kpi.noData")}</span>;
  }
  const duration = splitMinutes(minutes);
  return <>{t(`duration.${durationKey(duration)}`, { ...duration })}</>;
}

const ICON = "size-4";

export function KpiTiles({
  kpis,
  lockouts,
  rca,
}: {
  kpis: DashboardKpis;
  lockouts: number;
  rca: number;
}) {
  const t = useTranslations("dashboard.kpi");
  return (
    <dl aria-label={t("label")} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        icon={<Wrench className={ICON} />}
        label={t("open")}
        value={kpis.open}
        hint={t("openHint", { count: kpis.executing })}
      />
      <Tile
        icon={<AlarmClock className={ICON} />}
        label={t("overdue")}
        value={kpis.overdue}
        hint={t("overdueHint", { total: kpis.open })}
        tone={kpis.overdue > 0 ? "danger" : "muted"}
      />
      <Tile
        icon={<Timer className={ICON} />}
        label={t("reaction")}
        value={<DurationValue minutes={kpis.reaction.minutes} />}
        hint={t("reactionHint", { count: kpis.reaction.count })}
      />
      <Tile
        icon={<ClipboardList className={ICON} />}
        label={t("completion")}
        value={<DurationValue minutes={kpis.completion.minutes} />}
        hint={t("completionHint", { count: kpis.completion.count })}
      />
      <Tile icon={<Send className={ICON} />} label={t("issued")} value={kpis.issued} />
      <Tile
        icon={<CheckCheck className={ICON} />}
        label={t("closed")}
        value={kpis.closed}
        hint={t("closedHint", { share: sharePercent(kpis.closed, kpis.issued) })}
      />
      <Tile
        icon={<Lock className={ICON} />}
        label={t("lockouts")}
        value={lockouts}
        hint={t("lockoutsHint")}
        tone={lockouts > 0 ? "accent" : "muted"}
      />
      <Tile
        icon={<FileSearch className={ICON} />}
        label={t("rca")}
        value={rca}
        hint={t("rcaHint")}
        tone={rca > 0 ? "accent" : "muted"}
      />
    </dl>
  );
}
