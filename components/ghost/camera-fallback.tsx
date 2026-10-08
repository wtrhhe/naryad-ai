"use client";

import type { ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { CameraOff, ImagePlus, RotateCcw } from "lucide-react";
import type { CameraFailure } from "@/lib/ghost/camera";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CameraFallback({
  failure,
  decodeError,
  busy,
  onPick,
  onRetry,
}: {
  failure: CameraFailure;
  decodeError: boolean;
  busy: boolean;
  onPick: (file: File) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("ghost.fallback");
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onPick(file);
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center">
      <CameraOff className="text-muted size-16" aria-hidden />
      <h2 className="text-2xl font-bold">{t("title")}</h2>
      <p className="max-w-md text-lg">{t(failure)}</p>
      {decodeError ? (
        <p
          role="alert"
          className="border-danger bg-danger/10 w-full max-w-md rounded-lg border-2 p-3 font-medium"
        >
          {t("decodeError")}
        </p>
      ) : null}
      <label
        className={cn(
          buttonVariants({ variant: "primary", block: true }),
          "max-w-md cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50",
        )}
      >
        <ImagePlus className="size-6" aria-hidden />
        {t("pick")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={change}
        />
      </label>
      {failure === "unsupported" ? null : (
        <Button variant="secondary" block className="max-w-md" onClick={onRetry} disabled={busy}>
          <RotateCcw className="size-6" aria-hidden />
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
