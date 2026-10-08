"use client";

import { useTranslations } from "next-intl";
import type { AlignmentLevel } from "@/lib/ghost/indicator";
import { cn } from "@/lib/utils";

const LEVEL_TEXT: Record<AlignmentLevel, string> = {
  unknown: "text-muted",
  low: "text-danger",
  near: "text-status-busy",
  aligned: "text-status-free",
};

export const LEVEL_FILL: Record<AlignmentLevel, string> = {
  unknown: "bg-status-off",
  low: "bg-danger",
  near: "bg-status-busy",
  aligned: "bg-status-free",
};

export const LEVEL_RING: Record<AlignmentLevel, string> = {
  unknown: "ring-border",
  low: "ring-danger",
  near: "ring-status-busy",
  aligned: "ring-status-free",
};

export function AlignmentMeter({
  percent,
  thresholdPercent,
  level,
  hasReference,
}: {
  percent: number | null;
  thresholdPercent: number;
  level: AlignmentLevel;
  hasReference: boolean;
}) {
  const t = useTranslations("ghost.camera");
  if (!hasReference) {
    return (
      <p className="bg-surface/90 rounded-lg px-4 py-3 text-center text-base font-semibold">
        {t("noReference")}
      </p>
    );
  }
  const hint =
    level === "aligned" ? t("hintAligned") : level === "near" ? t("hintNear") : t("hintLow");
  return (
    <div className="bg-surface/90 flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-4 py-2">
      <p className={cn("text-3xl leading-tight font-bold tabular-nums", LEVEL_TEXT[level])}>
        {percent === null ? t("measuring") : t("aligned", { percent })}
      </p>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
        aria-label={t("threshold", { percent: thresholdPercent })}
        className="bg-surface-raised relative h-3 w-full max-w-64 overflow-hidden rounded-full"
      >
        <div
          className={cn("h-full transition-[width] duration-300", LEVEL_FILL[level])}
          style={{ width: `${percent ?? 0}%` }}
        />
        <div
          aria-hidden
          className="bg-foreground absolute inset-y-0 w-1"
          style={{ left: `${thresholdPercent}%` }}
        />
      </div>
      <p className="text-muted text-center text-sm">{hint}</p>
      <p className="sr-only" aria-live="polite">
        {level === "aligned" ? t("statusAligned") : t("statusNotAligned")}
      </p>
    </div>
  );
}
