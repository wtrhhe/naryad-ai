import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import type { ReviewVerdict } from "@/lib/review/types";
import { cn } from "@/lib/utils";

const MAX_RATING = 5;

const SCORE_COLORS: Record<ReviewVerdict, string> = {
  accepted: "text-status-free",
  accepted_with_remarks: "text-status-busy",
  rework: "text-danger",
};

export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const t = useTranslations("review");
  return (
    <span
      role="img"
      aria-label={t("stars", { rating })}
      className={cn("text-accent inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: MAX_RATING }, (_, index) => (
        <Star
          key={index}
          aria-hidden
          className={cn("size-6", index < rating ? "fill-current" : "opacity-35")}
        />
      ))}
    </span>
  );
}

export function ScoreDisplay({
  score,
  rating,
  verdict,
  compact = false,
}: {
  score: number;
  rating: number;
  verdict: ReviewVerdict;
  compact?: boolean;
}) {
  const t = useTranslations("review");
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-xs font-semibold tracking-wide uppercase">{t("score")}</span>
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono leading-none font-bold tabular-nums",
            compact ? "text-4xl" : "text-6xl",
            SCORE_COLORS[verdict],
          )}
        >
          {score}
        </span>
        <span className="text-muted text-sm font-semibold">{t("scoreOutOf")}</span>
      </span>
      <RatingStars rating={rating} />
    </div>
  );
}
