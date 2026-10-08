import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RetryButton } from "@/components/pwa/retry-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pwa");
  return { title: t("offline.title") };
}

export default async function OfflinePage() {
  const t = await getTranslations("pwa");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0B0F14] px-6 py-12 text-[#F4F6F8]">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <div className="flex size-28 items-center justify-center rounded-full border-4 border-[#F5A524] text-[#F5A524]">
          <WifiOff aria-hidden="true" className="size-14" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl leading-tight font-extrabold">{t("offline.title")}</h1>
        <p className="text-xl leading-relaxed text-[#C9D1DA]">{t("offline.body")}</p>
        <RetryButton label={t("offline.retry")} />
      </div>
    </main>
  );
}
