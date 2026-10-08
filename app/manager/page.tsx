import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderPanel } from "@/components/ui/placeholder-panel";

export async function generateMetadata() {
  const t = await getTranslations("shell");
  return { title: t("pages.managerDashboard") };
}

export default async function ManagerDashboardPage() {
  const t = await getTranslations("shell");
  return (
    <>
      <PageHeader title={t("pages.managerDashboard")} />
      <PlaceholderPanel message={t("comingSoon")} />
    </>
  );
}
