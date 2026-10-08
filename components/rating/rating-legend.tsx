import { useTranslations } from "next-intl";
import { maxPoints } from "@/lib/rating/explain";
import type { RatingWeights } from "@/lib/rating/formula";
import { PENALTY_PATTERN, RATING_SERIES, SERIES_COLOR } from "./palette";

export function RatingLegend({ weights }: { weights: RatingWeights }) {
  const t = useTranslations("rating");
  const max = maxPoints(weights);
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium">
      {RATING_SERIES.map((series) => (
        <li key={series} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-sm"
            style={{ background: series === "penalty" ? PENALTY_PATTERN : SERIES_COLOR[series] }}
          />
          <span>{t(`components.${series}`)}</span>
          <span className="text-muted font-mono">
            {series === "penalty"
              ? t("chart.penalty", { value: weights.max_refusal_penalty })
              : t("chart.points", { value: max[series] })}
          </span>
        </li>
      ))}
    </ul>
  );
}
