import { useTranslations } from "next-intl";
import { RATING_COMPONENT_KEYS } from "@/lib/rating/explain";
import type { RatingResult } from "@/lib/rating/formula";
import { cn } from "@/lib/utils";
import { PENALTY_PATTERN, SERIES_COLOR } from "./palette";

export function ContributionBar({
  contributions,
  penalty,
  className,
}: {
  contributions: RatingResult["contributions"];
  penalty: number;
  className?: string;
}) {
  const t = useTranslations("rating.table");
  const total = RATING_COMPONENT_KEYS.reduce((sum, key) => sum + contributions[key], 0);
  const penaltyWidth = Math.min(penalty, total);
  return (
    <div
      role="img"
      aria-label={t("breakdown", { ...contributions, penalty })}
      className={cn("bg-surface-raised relative h-3 w-full overflow-hidden rounded-full", className)}
    >
      <div className="flex h-full">
        {RATING_COMPONENT_KEYS.filter((key) => contributions[key] > 0).map((key) => (
          <span
            key={key}
            className="border-surface h-full border-r-2 last:border-r-0"
            style={{ width: `${contributions[key]}%`, background: SERIES_COLOR[key] }}
          />
        ))}
      </div>
      {penaltyWidth > 0 ? (
        <span
          className="bg-surface absolute inset-y-0"
          style={{ left: `${total - penaltyWidth}%`, width: `${penaltyWidth}%` }}
        >
          <span className="block h-full w-full" style={{ background: PENALTY_PATTERN }} />
        </span>
      ) : null}
    </div>
  );
}

export function PointsMeter({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const width = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="bg-surface-raised h-2.5 w-full overflow-hidden rounded-full" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}
