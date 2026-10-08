import { useTranslations } from "next-intl";
import type { ReviewVerdict } from "@/lib/review/types";
import { cn } from "@/lib/utils";

const VERDICT_STYLES: Record<ReviewVerdict, string> = {
  accepted: "border-status-free bg-status-free/15 text-status-free",
  accepted_with_remarks: "border-status-busy bg-status-busy/15 text-status-busy",
  rework: "border-danger bg-danger/15 text-danger",
};

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: ReviewVerdict;
  className?: string;
}) {
  const t = useTranslations("review");
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-md border-2 px-2.5 text-sm font-bold tracking-wide uppercase",
        VERDICT_STYLES[verdict],
        className,
      )}
    >
      {t(`verdict.${verdict}`)}
    </span>
  );
}

export function NoLlmBadge() {
  const t = useTranslations("review");
  return (
    <span className="border-border-strong text-muted inline-flex min-h-8 items-center rounded-md border-2 border-dashed px-2.5 text-xs font-bold tracking-wide uppercase">
      {t("noLlm")}
    </span>
  );
}
