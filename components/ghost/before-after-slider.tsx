"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronsLeftRight } from "lucide-react";
import { scorePercent } from "@/lib/ghost/indicator";
import { DEFAULT_ASPECT } from "@/lib/ghost/geometry";
import { cn } from "@/lib/utils";

export interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  aspect?: number;
  ghostScore?: number | null;
  initial?: number;
  className?: string;
}

const KEY_STEP = 5;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  aspect = DEFAULT_ASPECT,
  ghostScore = null,
  initial = 50,
  className,
}: BeforeAfterSliderProps) {
  const t = useTranslations("ghost.slider");
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => clampPercent(initial));
  const [dragging, setDragging] = useState(false);
  const percent = scorePercent(ghostScore);

  const moveTo = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(clampPercent(((clientX - rect.left) / rect.width) * 100));
  };

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    moveTo(event.clientX);
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, number> = {
      ArrowLeft: position - KEY_STEP,
      ArrowDown: position - KEY_STEP,
      ArrowRight: position + KEY_STEP,
      ArrowUp: position + KEY_STEP,
      Home: 0,
      End: 100,
    };
    const value = next[event.key];
    if (value === undefined) return;
    event.preventDefault();
    setPosition(clampPercent(value));
  };

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div
        ref={containerRef}
        className="border-border bg-surface-raised relative w-full cursor-ew-resize touch-pan-y overflow-hidden rounded-lg border-2 select-none"
        style={{ aspectRatio: aspect }}
        onPointerDown={pointerDown}
        onPointerMove={(event) => {
          if (dragging) moveTo(event.clientX);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <Image
          src={afterUrl}
          alt={t("afterAlt")}
          fill
          unoptimized
          draggable={false}
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <Image
            src={beforeUrl}
            alt={t("beforeAlt")}
            fill
            unoptimized
            draggable={false}
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <span className="bg-background/80 absolute top-2 left-2 rounded-md px-3 py-1 text-sm font-bold">
          {t("before")}
        </span>
        <span className="bg-background/80 absolute top-2 right-2 rounded-md px-3 py-1 text-sm font-bold">
          {t("after")}
        </span>
        <div
          className="bg-accent pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2"
          style={{ left: `${position}%` }}
          aria-hidden
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("handle")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          onKeyDown={keyDown}
          className="bg-accent text-accent-foreground size-touch absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-lg"
          style={{ left: `${position}%` }}
        >
          <ChevronsLeftRight className="size-8" aria-hidden />
        </div>
      </div>
      <figcaption className="text-muted flex items-center justify-between gap-3 text-sm">
        <span>{t("label")}</span>
        {percent === null ? null : (
          <span className="font-semibold tabular-nums">{t("alignment", { percent })}</span>
        )}
      </figcaption>
    </figure>
  );
}
