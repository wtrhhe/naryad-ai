import { getTranslations } from "next-intl/server";
import { RatingBoardPage } from "@/components/rating/rating-board-page";
import { requireRole } from "@/lib/auth/session";

export async function generateMetadata() {
  const t = await getTranslations("rating");
  return { title: t("title") };
}

export default async function MasterRatingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireRole("master");
  return (
    <RatingBoardPage viewer={viewer} searchParams={await searchParams} withFilters={false} />
  );
}
