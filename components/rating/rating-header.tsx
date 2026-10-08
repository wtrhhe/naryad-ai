import { useFormatter, useTranslations } from "next-intl";
import { REFUSAL_PENALTY_POINTS, type RatingWeights } from "@/lib/rating/formula";
import type { RatingPeriod } from "@/lib/rating/period";
import { PeriodSwitcher } from "./period-switcher";

function PeriodRange({ period }: { period: RatingPeriod }) {
  const t = useTranslations("rating");
  const format = useFormatter();
  const last = new Date(period.end.getTime() - 1);
  if (period.preset === "shift") {
    return t("range", {
      start: format.dateTime(period.start, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      end: format.dateTime(period.end, { hour: "2-digit", minute: "2-digit" }),
    });
  }
  if (period.from === period.to) {
    return format.dateTime(period.start, { day: "numeric", month: "long", year: "numeric" });
  }
  return t("range", {
    start: format.dateTime(period.start, { day: "numeric", month: "short" }),
    end: format.dateTime(last, { day: "numeric", month: "short", year: "numeric" }),
  });
}

export function RatingHeader({ title, period }: { title: string; period: RatingPeriod }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        <p className="text-muted text-sm">
          <PeriodRange period={period} />
        </p>
      </div>
      <PeriodSwitcher
        key={`${period.preset}:${period.from}:${period.to}`}
        preset={period.preset}
        from={period.from}
        to={period.to}
      />
    </div>
  );
}

export function WeightsNote({ weights }: { weights: RatingWeights }) {
  const t = useTranslations("rating");
  return (
    <p className="text-muted text-xs leading-relaxed">
      {t("weights", {
        quality: Math.round(weights.quality * 100),
        onTime: Math.round(weights.on_time * 100),
        noRework: Math.round(weights.no_rework * 100),
        volume: Math.round(weights.volume * 100),
        penalty: REFUSAL_PENALTY_POINTS,
        maxPenalty: weights.max_refusal_penalty,
      })}
    </p>
  );
}
