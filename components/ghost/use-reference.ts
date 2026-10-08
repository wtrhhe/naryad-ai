"use client";

import { useEffect, useState } from "react";
import { loadBitmap } from "@/components/ghost/media";

export type ReferenceState =
  | { status: "none"; bitmap: null }
  | { status: "loading"; bitmap: null }
  | { status: "ready"; bitmap: ImageBitmap }
  | { status: "error"; bitmap: null };

interface Loaded {
  url: string;
  bitmap: ImageBitmap | null;
  failed: boolean;
}

export function useReferenceImage(url: string | null): ReferenceState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let bitmap: ImageBitmap | null = null;
    loadBitmap(url, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          result.close();
          return;
        }
        bitmap = result;
        setLoaded({ url, bitmap: result, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ url, bitmap: null, failed: true });
      });
    return () => {
      controller.abort();
      bitmap?.close();
    };
  }, [url]);

  if (!url) return { status: "none", bitmap: null };
  if (!loaded || loaded.url !== url) return { status: "loading", bitmap: null };
  if (loaded.failed || !loaded.bitmap) return { status: "error", bitmap: null };
  return { status: "ready", bitmap: loaded.bitmap };
}
