import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderPanel } from "@/components/ui/placeholder-panel";

export async function generateMetadata() {
  const t = await getTranslations("shell");
  return { title: t("pages.adminReferences") };
}

export default async function AdminReferencesPage() {
  const t = await getTranslations("shell");
  return (
    <>
      <PageHeader title={t("pages.adminReferences")} />
      <PlaceholderPanel message={t("comingSoon")} />
    </>
  );
}
