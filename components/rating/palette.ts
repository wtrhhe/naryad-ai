import type { RatingComponentKey } from "@/lib/rating/explain";

export type RatingSeries = RatingComponentKey | "penalty";

export const RATING_SERIES: readonly RatingSeries[] = [
  "quality",
  "onTime",
  "noRework",
  "volume",
  "penalty",
];

export const RATING_PALETTE_CLASS = [
  "[--rating-quality:var(--status-free)]",
  "[--rating-on-time:var(--status-queue)]",
  "[--rating-no-rework:var(--accent)]",
  "[--rating-volume:color-mix(in_oklch,var(--status-queue),var(--status-emergency))]",
  "[--rating-penalty:var(--danger)]",
  "dark:[--rating-quality:color-mix(in_oklab,var(--status-free)_82%,black)]",
  "dark:[--rating-no-rework:color-mix(in_oklab,var(--accent)_82%,black)]",
].join(" ");

export const SERIES_COLOR: Record<RatingSeries, string> = {
  quality: "var(--rating-quality)",
  onTime: "var(--rating-on-time)",
  noRework: "var(--rating-no-rework)",
  volume: "var(--rating-volume)",
  penalty: "var(--rating-penalty)",
};

export const PENALTY_PATTERN =
  "repeating-linear-gradient(135deg, var(--rating-penalty) 0 3px, transparent 3px 6px)";
