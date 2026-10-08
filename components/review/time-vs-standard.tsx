import { useFormatter, useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import type { ReviewTiming } from "@/lib/review/view";
import { cn } from "@/lib/utils";

const TOLERANCE_PERCENT = 125;
const BAR_LIMIT_PERCENT = 200;

function barColor(percent: number): string {
  if (percent <= 100) return "bg-status-free";
  return percent <= TOLERANCE_PERCENT ? "bg-status-busy" : "bg-danger";
}

export function TimeVsStandard({ timing }: { timing: ReviewTiming }) {
  const t = useTranslations("review.time");
  const format = useFormatter();
  const hours = (value: number) =>
    t("hours", { hours: format.number(value, { maximumFractionDigits: 1 }) });
  const percent = timing.percent;
  return (
    <section
      aria-labelledby="review-time-title"
      className="border-border bg-surface flex flex-col gap-3 rounded-lg border-2 p-4"
    >
      <h3 id="review-time-title" className="flex items-center gap-2 font-bold">
        <Clock className="text-accent size-5" aria-hidden />
        {t("title")}
      </h3>
      {timing.actualHours === null ? (
        <p className="text-muted">{t("unknown")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-muted text-xs font-semibold uppercase">{t("actual")}</dt>
              <dd className="font-mono text-2xl font-bold tabular-nums">
                {hours(timing.actualHours)}
              </dd>
            </div>
            <div>
              <dt className="text-muted text-xs font-semibold uppercase">{t("standard")}</dt>
              <dd className="font-mono text-2xl font-bold tabular-nums">
                {timing.standardHours === null ? t("noStandard") : hours(timing.standardHours)}
              </dd>
            </div>
          </dl>
          {percent !== null ? (
            <div className="flex flex-col gap-1">
              <div
                className="bg-surface-raised h-3 overflow-hidden rounded-full"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={BAR_LIMIT_PERCENT}
                aria-valuenow={Math.min(percent, BAR_LIMIT_PERCENT)}
                aria-label={t("ratio", { percent })}
              >
                <div
                  className={cn("h-full rounded-full", barColor(percent))}
                  style={{ width: `${Math.min(percent, BAR_LIMIT_PERCENT) / 2}%` }}
                />
              </div>
              <p className="text-muted text-sm">{t("ratio", { percent })}</p>
            </div>
          ) : null}
        </>
      )}
      {timing.lateMinutes !== null ? (
        <p
          className={cn(
            "text-sm font-semibold",
            timing.lateMinutes > 0 ? "text-danger" : "text-status-free",
          )}
        >
          {timing.lateMinutes > 0 ? t("late", { minutes: timing.lateMinutes }) : t("onTime")}
        </p>
      ) : null}
    </section>
  );
}
