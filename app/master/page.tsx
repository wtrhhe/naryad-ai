import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderPanel } from "@/components/ui/placeholder-panel";

export async function generateMetadata() {
  const t = await getTranslations("shell");
  return { title: t("pages.masterBoard") };
}

export default async function MasterBoardPage() {
  const t = await getTranslations("shell");
  return (
    <>
      <PageHeader title={t("pages.masterBoard")} />
      <PlaceholderPanel message={t("comingSoon")} />
    </>
  );
}
