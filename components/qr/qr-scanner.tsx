"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CameraOff, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/public-env";
import { cn } from "@/lib/utils";
import { cameraErrorKey, fitWithin, parseQrToken, type CameraErrorKey } from "./qr-token";

const SCAN_INTERVAL_MS = 180;
const INVALID_VISIBLE_MS = 2_500;
const MAX_DECODE_SIDE = 720;
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

type Detect = (video: HTMLVideoElement) => Promise<string | null>;
type ScannerStatus = "starting" | "scanning" | CameraErrorKey;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

async function nativeDetector(): Promise<Detect | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) {
    return null;
  }
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? ["qr_code"];
    if (!formats.includes("qr_code")) {
      return null;
    }
    const detector = new Detector({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  } catch (error) {
    console.warn("BarcodeDetector is unavailable, using the fallback decoder", error);
    return null;
  }
}

async function fallbackDetector(): Promise<Detect> {
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }
    const { width, height } = fitWithin(video.videoWidth, video.videoHeight, MAX_DECODE_SIDE);
    if (width === 0 || height === 0) {
      return null;
    }
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    return jsQR(frame.data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

async function createDetector(): Promise<Detect> {
  return (await nativeDetector()) ?? (await fallbackDetector());
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function defaultOrigins(): string[] {
  return [publicEnv.NEXT_PUBLIC_APP_URL, window.location.origin];
}

export interface QrScannerProps {
  onToken: (token: string) => void;
  allowedOrigins?: readonly string[];
  className?: string;
}

export function QrScanner({ onToken, allowedOrigins, className }: QrScannerProps) {
  const t = useTranslations("qr.scanner");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTokenRef = useRef(onToken);
  const originsRef = useRef(allowedOrigins);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [invalidAt, setInvalidAt] = useState<number | null>(null);

  useEffect(() => {
    onTokenRef.current = onToken;
    originsRef.current = allowedOrigins;
  }, [onToken, allowedOrigins]);

  useEffect(() => {
    if (invalidAt === null) {
      return;
    }
    const timer = setTimeout(() => setInvalidAt(null), INVALID_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [invalidAt]);

  useEffect(() => {
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scan = async (detect: Detect, origins: readonly string[]) => {
      if (cancelled || !video) {
        return;
      }
      const raw = await detect(video).catch(() => null);
      if (cancelled) {
        return;
      }
      if (raw) {
        const token = parseQrToken(raw, origins);
        if (token) {
          cancelled = true;
          stopStream(stream);
          onTokenRef.current(token);
          return;
        }
        setInvalidAt(Date.now());
      }
      timer = setTimeout(() => void scan(detect, origins), SCAN_INTERVAL_MS);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new TypeError("Camera access is not supported");
      }
      stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (cancelled || !video) {
        stopStream(stream);
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const detect = await createDetector();
      if (cancelled) {
        return;
      }
      setStatus("scanning");
      void scan(detect, originsRef.current ?? defaultOrigins());
    };

    start().catch((error: unknown) => {
      if (!cancelled) {
        console.warn("QR scanner could not start the camera", error);
        setStatus(cameraErrorKey(error));
      }
    });

    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      stopStream(stream);
      if (video) {
        video.srcObject = null;
      }
    };
  }, []);

  const failed = status !== "starting" && status !== "scanning";

  return (
    <div className={cn("relative flex flex-1 items-center justify-center bg-black", className)}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className={cn("h-full w-full object-cover", failed ? "hidden" : null)}
      />
      {failed ? (
        <div className="flex max-w-sm flex-col items-center gap-3 p-6 text-center text-white">
          <CameraOff className="size-12" aria-hidden />
          <p className="text-lg font-semibold">{t(status)}</p>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
          <div className="border-accent aspect-square w-[min(70vw,18rem)] rounded-2xl border-4 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
          <p
            role="status"
            className="rounded-lg bg-black/70 px-4 py-2 text-center text-base font-semibold text-white"
          >
            {status === "starting" ? t("starting") : invalidAt !== null ? t("invalid") : t("hint")}
          </p>
        </div>
      )}
    </div>
  );
}

export interface QrScanButtonProps {
  onToken: (token: string) => void;
  allowedOrigins?: readonly string[];
  className?: string;
  block?: boolean;
}

export function QrScanButton({ onToken, allowedOrigins, className, block }: QrScanButtonProps) {
  const t = useTranslations("qr.scanner");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="touch"
        block={block}
        className={className}
        onClick={() => setOpen(true)}
      >
        <QrCode className="size-6" aria-hidden />
        {t("open")}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          className="fixed inset-0 z-50 flex flex-col bg-black"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] text-white">
            <h2 className="text-lg font-bold">{t("title")}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="flex min-h-16 min-w-16 items-center justify-center"
            >
              <X className="size-8" aria-hidden />
            </button>
          </div>
          <QrScanner
            allowedOrigins={allowedOrigins}
            onToken={(token) => {
              setOpen(false);
              onToken(token);
            }}
          />
        </div>
      ) : null}
    </>
  );
}
