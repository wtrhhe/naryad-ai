"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
      <h1 className="text-2xl font-bold">{t("errors.generic")}</h1>
      <Button onClick={reset} block>
        {t("retry")}
      </Button>
    </main>
  );
}
