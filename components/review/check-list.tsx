import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle, type LucideIcon } from "lucide-react";
import type { ReviewCheckView } from "@/lib/review/view";
import type { CheckStatus } from "@/lib/review/types";
import { messageValues } from "@/lib/review/values";
import { cn } from "@/lib/utils";

const STATUS_ICONS: Record<CheckStatus, LucideIcon> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  skip: MinusCircle,
};

const STATUS_STYLES: Record<CheckStatus, { icon: string; row: string }> = {
  pass: { icon: "text-status-free", row: "border-border" },
  warn: { icon: "text-status-busy", row: "border-status-busy/60" },
  fail: { icon: "text-danger", row: "border-danger bg-danger/10" },
  skip: { icon: "text-muted", row: "border-border opacity-75" },
};

function CheckRow({ check }: { check: ReviewCheckView }) {
  const t = useTranslations("review");
  const Icon = STATUS_ICONS[check.status];
  const styles = STATUS_STYLES[check.status];
  const label = check.knownKey ? t(`label.${check.knownKey}`) : check.label || check.key;
  const summary = check.code ? t(`summary.${check.code}`, messageValues(check.values)) : check.detail;
  return (
    <li className={cn("bg-surface flex gap-3 rounded-lg border-2 p-3", styles.row)}>
      <Icon className={cn("mt-0.5 size-6 shrink-0", styles.icon)} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 font-semibold">
          <span>{label}</span>
          <span className={cn("text-xs font-bold tracking-wide uppercase", styles.icon)}>
            {t(`checkStatus.${check.status}`)}
          </span>
        </p>
        {summary ? <p className="text-muted text-sm">{summary}</p> : null}
        {check.code && check.findings.length > 0 ? (
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
            {check.findings.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                {t(`finding.${item.code}`, messageValues(item.values))}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

const STATUS_ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2, skip: 3 };

export function CheckList({ checks }: { checks: readonly ReviewCheckView[] }) {
  const t = useTranslations("review");
  const ordered = [...checks].sort(
    (left, right) => STATUS_ORDER[left.status] - STATUS_ORDER[right.status],
  );
  return (
    <section aria-labelledby="review-checks-title" className="flex flex-col gap-2">
      <h3 id="review-checks-title" className="text-muted text-sm font-bold tracking-wide uppercase">
        {t("checksTitle")}
      </h3>
      <ul className="flex flex-col gap-2">
        {ordered.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </ul>
    </section>
  );
}
