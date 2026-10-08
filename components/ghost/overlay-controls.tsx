"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Image as ImageIcon, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

export type OverlayMode = "photo" | "contours";

const RANGE_CLASS = cn(
  "h-touch w-full cursor-pointer appearance-none bg-transparent",
  "[&::-webkit-slider-runnable-track]:bg-border-strong [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-full",
  "[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:-mt-[18px] [&::-webkit-slider-thumb]:size-12 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
  "[&::-moz-range-track]:bg-border-strong [&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-full",
  "[&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:size-12 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
);

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-touch flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-3 text-base font-semibold",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border-strong bg-surface-raised text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function OverlayControls({
  mode,
  onModeChange,
  opacity,
  onOpacityChange,
}: {
  mode: OverlayMode;
  onModeChange: (mode: OverlayMode) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}) {
  const t = useTranslations("ghost.camera");
  const sliderId = useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div role="group" aria-label={t("overlayMode")} className="flex gap-2 sm:w-80">
        <ModeButton active={mode === "photo"} onClick={() => onModeChange("photo")}>
          <ImageIcon className="size-6" aria-hidden />
          {t("overlayPhoto")}
        </ModeButton>
        <ModeButton active={mode === "contours"} onClick={() => onModeChange("contours")}>
          <ScanLine className="size-6" aria-hidden />
          {t("overlayContours")}
        </ModeButton>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={sliderId} className="text-muted text-sm font-semibold">
          {t("opacity")}
        </label>
        <input
          id={sliderId}
          type="range"
          min={10}
          max={90}
          step={5}
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
          className={RANGE_CLASS}
        />
      </div>
    </div>
  );
}
