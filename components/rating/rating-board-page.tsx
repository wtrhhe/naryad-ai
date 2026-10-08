import { getTranslations } from "next-intl/server";
import type { CurrentEmployee } from "@/lib/auth/session";
import { parseRatingSearch } from "@/lib/rating/params";
import { loadRatingBoard } from "@/lib/rating/queries";
import { RatingBoardView } from "./rating-board";
import { RatingFilters } from "./rating-filters";
import { RatingHeader } from "./rating-header";
import { RatingTabs } from "./rating-tabs";

export async function RatingBoardPage({
  viewer,
  searchParams,
  withFilters,
}: {
  viewer: CurrentEmployee;
  searchParams: Record<string, string | string[] | undefined>;
  withFilters: boolean;
}) {
  const search = parseRatingSearch(searchParams, new Date());
  const [board, t] = await Promise.all([
    loadRatingBoard(search.period, viewer),
    getTranslations("rating"),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <RatingHeader title={t("boardTitle")} period={search.period} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <RatingTabs view={search.view} />
        {withFilters ? (
          <RatingFilters sites={board.sites} brigades={board.brigadeOptions} />
        ) : null}
      </div>
      <RatingBoardView
        employees={board.employees}
        brigades={board.brigades}
        weights={board.weights}
        view={search.view}
        filter={withFilters ? search.filter : {}}
      />
    </div>
  );
}
