import { z } from "zod";

export const ratingWeightsSchema = z
  .object({
    quality: z.number().min(0).max(1),
    on_time: z.number().min(0).max(1),
    no_rework: z.number().min(0).max(1),
    volume: z.number().min(0).max(1),
    max_refusal_penalty: z.number().min(0).max(50),
  })
  .refine(
    (weights) =>
      Math.abs(weights.quality + weights.on_time + weights.no_rework + weights.volume - 1) < 0.001,
    { message: "weights_must_sum_to_one" },
  );

export type RatingWeights = z.infer<typeof ratingWeightsSchema>;

export const DEFAULT_RATING_WEIGHTS: RatingWeights = {
  quality: 0.4,
  on_time: 0.25,
  no_rework: 0.2,
  volume: 0.15,
  max_refusal_penalty: 10,
};

export const REFUSAL_PENALTY_POINTS = 2.5;

export interface RatingComponents {
  quality: number;
  onTime: number;
  noRework: number;
  volume: number;
  refusalPenalty: number;
}

export interface RatingResult {
  score: number;
  components: RatingComponents;
  contributions: Omit<RatingComponents, "refusalPenalty">;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function parseRatingWeights(value: unknown): RatingWeights {
  const parsed = ratingWeightsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_RATING_WEIGHTS;
}

export function refusalPenalty(unexcusedRefusals: number, weights: RatingWeights): number {
  return Math.min(
    weights.max_refusal_penalty,
    Math.max(0, unexcusedRefusals) * REFUSAL_PENALTY_POINTS,
  );
}

export function computeRating(components: RatingComponents, weights: RatingWeights): RatingResult {
  const contributions = {
    quality: clamp(components.quality, 0, 100) * weights.quality,
    onTime: clamp(components.onTime, 0, 100) * weights.on_time,
    noRework: clamp(components.noRework, 0, 100) * weights.no_rework,
    volume: clamp(components.volume, 0, 100) * weights.volume,
  };
  const total =
    contributions.quality +
    contributions.onTime +
    contributions.noRework +
    contributions.volume -
    clamp(components.refusalPenalty, 0, weights.max_refusal_penalty);
  return {
    score: round1(clamp(total, 0, 100)),
    components,
    contributions: {
      quality: round1(contributions.quality),
      onTime: round1(contributions.onTime),
      noRework: round1(contributions.noRework),
      volume: round1(contributions.volume),
    },
  };
}
