"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";

const REFRESH_INTERVAL_MS = 5000;
const MAX_REFRESHES = 36;

export function ReviewPending({ audience = "master" }: { audience?: "master" | "worker" }) {
  const t = useTranslations("review.pending");
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      if (count > MAX_REFRESHES) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <div
      role="status"
      className="border-accent/60 bg-accent/10 flex items-center gap-3 rounded-lg border-2 p-4"
    >
      <LoaderCircle className="text-accent size-7 shrink-0 animate-spin" aria-hidden />
      <div>
        <p className="font-bold">{t("title")}</p>
        <p className="text-muted text-sm">{audience === "worker" ? t("workerHint") : t("hint")}</p>
      </div>
    </div>
  );
}
