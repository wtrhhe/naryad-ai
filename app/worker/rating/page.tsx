import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { BrigadeCard, MyRatingCard, RecentOrders } from "@/components/rating/my-rating";
import { RATING_PALETTE_CLASS } from "@/components/rating/palette";
import { ExplanationBody, WorkerExplanation } from "@/components/rating/rating-explanation";
import { RatingHeader, WeightsNote } from "@/components/rating/rating-header";
import { requireRole } from "@/lib/auth/session";
import { templateExplanation } from "@/lib/rating/explain";
import { parseRatingSearch } from "@/lib/rating/params";
import { loadWorkerRating } from "@/lib/rating/queries";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("rating");
  return { title: t("myTitle") };
}

export default async function WorkerRatingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireRole("worker");
  const { period } = parseRatingSearch(await searchParams, new Date());
  const [rating, t, locale] = await Promise.all([
    loadWorkerRating(period, viewer),
    getTranslations("rating"),
    getLocale(),
  ]);
  const template = rating.me
    ? templateExplanation(rating.me, rating.weights, locale, rating.benchmark)
    : null;
  return (
    <div className={cn("flex flex-col gap-5", RATING_PALETTE_CLASS)}>
      <RatingHeader title={t("myTitle")} period={period} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-5">
          <MyRatingCard rating={rating} weights={rating.weights} />
          {template ? (
            <Suspense fallback={<ExplanationBody explanation={template} pending />}>
              <WorkerExplanation rating={rating} locale={locale} />
            </Suspense>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          <BrigadeCard
            brigade={rating.brigade}
            place={rating.brigadePlace}
            total={rating.brigadeTotal}
          />
          <RecentOrders orders={rating.orders} />
        </div>
      </div>
      <WeightsNote weights={rating.weights} />
    </div>
  );
}
