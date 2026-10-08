"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createAlignmentEngine,
  type AlignmentRequest,
  type AlignmentResponse,
} from "@/lib/ghost/engine";
import { parseCssColor } from "@/lib/ghost/contours";
import { CONTOUR_LONG_SIDE, coverCrop, sizeForAspect } from "@/lib/ghost/geometry";
import { FRAME_INTERVAL_MS, nextAligned, smoothScore } from "@/lib/ghost/indicator";
import { analysisRaster, createCanvas, rasterize, type Raster } from "@/components/ghost/media";

interface AlignmentPort {
  post(request: AlignmentRequest, transfer: Transferable[]): void;
  close(): void;
}

function openPort(onMessage: (response: AlignmentResponse) => void): AlignmentPort {
  try {
    const worker = new Worker(new URL("../../lib/ghost/alignment.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<AlignmentResponse>) => onMessage(event.data);
    return {
      post: (request, transfer) => worker.postMessage(request, transfer),
      close: () => worker.terminate(),
    };
  } catch {
    const engine = createAlignmentEngine();
    let closed = false;
    return {
      post: (request) =>
        window.setTimeout(() => {
          const reply = closed ? null : engine.handle(request);
          if (reply) onMessage(reply.response);
        }, 0),
      close: () => {
        closed = true;
      },
    };
  }
}

export interface AlignmentReading {
  score: number | null;
  aligned: boolean;
}

interface AlignmentOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  reference: ImageBitmap | null;
  aspect: number;
  threshold: number;
  active: boolean;
  onAligned?: () => void;
}

const IDLE: AlignmentReading = { score: null, aligned: false };

export function useAlignment({
  videoRef,
  reference,
  aspect,
  threshold,
  active,
  onAligned,
}: AlignmentOptions) {
  const portRef = useRef<AlignmentPort | null>(null);
  const pendingRef = useRef(new Map<number, (score: number | null) => void>());
  const nextIdRef = useRef(1);
  const onAlignedRef = useRef(onAligned);
  const [reading, setReading] = useState<AlignmentReading>(IDLE);
  const [contours, setContours] = useState<Raster | null>(null);

  useEffect(() => {
    onAlignedRef.current = onAligned;
  }, [onAligned]);

  useEffect(() => {
    const pending = pendingRef.current;
    const port = openPort((response) => {
      if (response.type === "contours") {
        setContours({ width: response.width, height: response.height, rgba: response.rgba });
        return;
      }
      if (response.type === "score" || (response.type === "error" && response.id !== null)) {
        const resolve = pending.get(response.id ?? -1);
        pending.delete(response.id ?? -1);
        resolve?.(response.type === "score" ? response.score : null);
      }
    });
    portRef.current = port;
    return () => {
      port.close();
      portRef.current = null;
      pending.forEach((resolve) => resolve(null));
      pending.clear();
    };
  }, []);

  const score = useCallback((raster: Raster): Promise<number | null> => {
    const port = portRef.current;
    if (!port) return Promise.resolve(null);
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    return new Promise((resolve) => {
      pendingRef.current.set(id, resolve);
      port.post({ type: "frame", id, ...raster }, [raster.rgba.buffer]);
    });
  }, []);

  useEffect(() => {
    const port = portRef.current;
    if (!port) return;
    if (!reference) {
      port.post({ type: "clear" }, []);
      return;
    }
    const size = { width: reference.width, height: reference.height };
    const raster = analysisRaster(reference, size, aspect);
    port.post({ type: "reference", ...raster }, [raster.rgba.buffer]);
    const contourRaster = rasterize(
      reference,
      coverCrop(size.width, size.height, aspect),
      sizeForAspect(aspect, CONTOUR_LONG_SIDE),
    );
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent");
    port.post({ type: "contours", id: 0, ...contourRaster, color: parseCssColor(accent) }, [
      contourRaster.rgba.buffer,
    ]);
  }, [reference, aspect]);

  useEffect(() => {
    if (!active || !reference) return;
    const canvas = createCanvas({ width: 1, height: 1 });
    let busy = false;
    let smoothed: number | null = null;
    let aligned = false;
    let stopped = false;
    const tick = async () => {
      const video = videoRef.current;
      if (busy || !video || video.videoWidth === 0 || video.readyState < 2) return;
      busy = true;
      try {
        const raster = analysisRaster(
          video,
          { width: video.videoWidth, height: video.videoHeight },
          aspect,
          canvas,
        );
        const value = await score(raster);
        if (stopped) return;
        smoothed = value === null ? null : smoothScore(smoothed, value);
        const next = nextAligned(aligned, smoothed, threshold);
        if (next && !aligned) onAlignedRef.current?.();
        aligned = next;
        setReading({ score: smoothed, aligned });
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void tick(), FRAME_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [active, reference, aspect, threshold, videoRef, score]);

  const measure = useCallback(
    (canvas: HTMLCanvasElement): Promise<number | null> =>
      reference
        ? score(analysisRaster(canvas, { width: canvas.width, height: canvas.height }, aspect))
        : Promise.resolve(null),
    [reference, aspect, score],
  );

  return {
    reading: active && reference ? reading : IDLE,
    contours: reference ? contours : null,
    measure,
  };
}
