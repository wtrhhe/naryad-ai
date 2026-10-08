import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { getAiProvider } from "@/lib/ai/provider";
import { PageHeader } from "@/components/ui/page-header";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export async function generateMetadata() {
  const t = await getTranslations("assistant");
  return { title: t("title") };
}

export default async function AssistantPage() {
  await requireRole("master");
  const t = await getTranslations("assistant");
  return (
    <>
      <PageHeader title={t("title")} />
      <AssistantChat llmEnabled={getAiProvider().enabled} />
    </>
  );
}
