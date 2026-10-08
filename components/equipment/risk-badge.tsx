import { useTranslations } from "next-intl";
import { Lock, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { RiskLevel } from "@/lib/equipment/risk";
import { cn } from "@/lib/utils";

const STYLES: Record<RiskLevel, string> = {
  high: "bg-danger text-danger-foreground border-danger",
  medium: "border-status-busy text-status-busy bg-status-busy/10",
  low: "border-border text-muted",
};

const ICONS = { high: ShieldAlert, medium: TriangleAlert, low: ShieldCheck } as const;

export function RiskBadge({
  level,
  score,
  className,
}: {
  level: RiskLevel;
  score?: number;
  className?: string;
}) {
  const t = useTranslations("equipment.risk");
  const Icon = ICONS[level];
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-md border-2 px-2 text-xs font-bold tracking-wide whitespace-nowrap uppercase",
        STYLES[level],
        className,
      )}
      title={score === undefined ? undefined : t("score", { score })}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`level.${level}`)}
    </span>
  );
}

export function LockoutBadge({ label }: { label: string }) {
  return (
    <span className="bg-accent text-accent-foreground inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-bold tracking-wide uppercase">
      <Lock className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
