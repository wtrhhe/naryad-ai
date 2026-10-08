"use client";

import { useEffect, useRef } from "react";
import { coverCrop, sizeForAspect } from "@/lib/ghost/geometry";
import type { Raster } from "@/components/ghost/media";

const OVERLAY_LONG_SIDE = 1280;

export function BitmapLayer({
  bitmap,
  aspect,
  opacity,
}: {
  bitmap: ImageBitmap;
  aspect: number;
  opacity: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const size = sizeForAspect(
      aspect,
      Math.min(OVERLAY_LONG_SIDE, Math.max(bitmap.width, bitmap.height)),
    );
    const crop = coverCrop(bitmap.width, bitmap.height, aspect);
    canvas.width = size.width;
    canvas.height = size.height;
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
  }, [bitmap, aspect]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      style={{ opacity }}
    />
  );
}

export function ContourLayer({ raster, opacity }: { raster: Raster; opacity: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = raster.width;
    canvas.height = raster.height;
    context.putImageData(new ImageData(raster.rgba, raster.width, raster.height), 0, 0);
  }, [raster]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      style={{ opacity }}
    />
  );
}
