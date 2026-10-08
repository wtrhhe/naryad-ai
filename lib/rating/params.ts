import { z } from "zod";
import type { RatingFilter } from "@/lib/rating/board";
import { resolveRatingPeriod, type RatingPeriod } from "@/lib/rating/period";

export const RATING_VIEWS = ["employees", "brigades"] as const;

export type RatingView = (typeof RATING_VIEWS)[number];

function first<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (Array.isArray(value) ? value[0] : value), schema);
}

const paramsSchema = z.object({
  period: first(z.string().optional().catch(undefined)),
  from: first(z.string().optional().catch(undefined)),
  to: first(z.string().optional().catch(undefined)),
  view: first(z.enum(RATING_VIEWS).catch("employees")),
  site: first(z.uuid().optional().catch(undefined)),
  brigade: first(z.uuid().optional().catch(undefined)),
});

export interface RatingSearch {
  period: RatingPeriod;
  view: RatingView;
  filter: RatingFilter;
}

export function parseRatingSearch(
  params: Record<string, string | string[] | undefined>,
  now: Date,
): RatingSearch {
  const parsed = paramsSchema.parse(params);
  return {
    period: resolveRatingPeriod(parsed, now),
    view: parsed.view,
    filter: { siteId: parsed.site, brigadeId: parsed.brigade },
  };
}
