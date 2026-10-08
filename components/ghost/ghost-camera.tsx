"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Flashlight, FlashlightOff, Lock, X } from "lucide-react";
import { isCameraFailure } from "@/lib/ghost/camera";
import { DEFAULT_ASPECT, safeAspect } from "@/lib/ghost/geometry";
import { alignmentLevel, canShoot, roundScore, scorePercent } from "@/lib/ghost/indicator";
import { DEFAULT_MIN_ALIGNMENT } from "@/lib/ghost/settings";
import { AlignmentMeter, LEVEL_RING } from "@/components/ghost/alignment-meter";
import { CameraFallback } from "@/components/ghost/camera-fallback";
import { primeFeedback, signalAligned } from "@/components/ghost/feedback";
import { ForceReasonSheet } from "@/components/ghost/force-reason-sheet";
import { canvasToJpeg, captureVideoFrame, fileToJpeg } from "@/components/ghost/media";
import { OverlayControls, type OverlayMode } from "@/components/ghost/overlay-controls";
import { BitmapLayer, ContourLayer } from "@/components/ghost/overlay-layers";
import { useAlignment } from "@/components/ghost/use-alignment";
import { useCamera } from "@/components/ghost/use-camera";
import { useReferenceImage } from "@/components/ghost/use-reference";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface GhostCapture {
  blob: Blob;
  width: number;
  height: number;
  takenAt: string;
  ghostScore: number | null;
  forcedReason: string | null;
}

export interface GhostCameraProps {
  referenceUrl: string | null;
  threshold?: number;
  onCapture: (capture: GhostCapture) => void | Promise<void>;
  onClose?: () => void;
  busy?: boolean;
}

export function GhostCamera({
  referenceUrl,
  threshold = DEFAULT_MIN_ALIGNMENT,
  onCapture,
  onClose,
  busy = false,
}: GhostCameraProps) {
  const t = useTranslations("ghost");
  const titleId = useId();
  const lockedId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera(videoRef);
  const reference = useReferenceImage(referenceUrl);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [mode, setMode] = useState<OverlayMode>("photo");
  const [opacity, setOpacity] = useState(45);
  const [forcing, setForcing] = useState(false);
  const [forcedReason, setForcedReason] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [decodeError, setDecodeError] = useState(false);

  const bitmap = reference.bitmap;
  const hasReference = bitmap !== null;
  const aspect = bitmap ? safeAspect(bitmap.width, bitmap.height) : (videoAspect ?? DEFAULT_ASPECT);
  const live = camera.status === "live";
  const { reading, contours, measure } = useAlignment({
    videoRef,
    reference: bitmap,
    aspect,
    threshold,
    active: live,
    onAligned: signalAligned,
  });
  const percent = scorePercent(reading.score);
  const level = alignmentLevel(reading.score, threshold, reading.aligned);
  const referencePending = reference.status === "loading";
  const shootable =
    live &&
    !referencePending &&
    canShoot({ hasReference, aligned: reading.aligned, forcedReason, busy: busy || capturing });
  const failure = isCameraFailure(camera.status) ? camera.status : null;

  const shoot = async () => {
    const video = videoRef.current;
    if (!video || !shootable) return;
    setCapturing(true);
    try {
      const takenAt = new Date().toISOString();
      const alignedAtPress = reading.aligned;
      const canvas = captureVideoFrame(video, aspect);
      const [blob, measured] = await Promise.all([canvasToJpeg(canvas), measure(canvas)]);
      const value = hasReference ? (measured ?? reading.score) : null;
      const ghostScore = value === null ? null : roundScore(value);
      const reason = !hasReference
        ? t("reasons.noReference")
        : alignedAtPress
          ? null
          : forcedReason;
      await onCapture({
        blob,
        width: canvas.width,
        height: canvas.height,
        takenAt,
        ghostScore,
        forcedReason: ghostScore === null && reason === null ? t("reasons.noReference") : reason,
      });
    } finally {
      setCapturing(false);
    }
  };

  const pickFile = async (file: File) => {
    setDecodeError(false);
    setCapturing(true);
    try {
      const image = await fileToJpeg(file).catch(() => null);
      if (!image) {
        setDecodeError(true);
        return;
      }
      const reasonKey = failure ?? "failed";
      await onCapture({
        ...image,
        takenAt: new Date(file.lastModified || Date.now()).toISOString(),
        ghostScore: null,
        forcedReason: t(`fallback.reasons.${reasonKey}`),
      });
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div
      data-theme="dark"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="bg-background text-foreground fixed inset-0 z-50 flex flex-col"
      onPointerDown={primeFeedback}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !forcing) onClose?.();
      }}
    >
      <h2 id={titleId} className="sr-only">
        {t("camera.title")}
      </h2>
      <header className="flex items-start gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Button
          variant="secondary"
          className="size-touch shrink-0 rounded-full p-0"
          aria-label={t("camera.close")}
          onClick={onClose}
          disabled={!onClose}
        >
          <X className="size-8" aria-hidden />
        </Button>
        <div className="flex min-w-0 flex-1 justify-center">
          {failure ? null : (
            <AlignmentMeter
              percent={percent}
              thresholdPercent={scorePercent(threshold) ?? 70}
              level={level}
              hasReference={hasReference || referencePending}
            />
          )}
        </div>
        {camera.torchSupported && !failure ? (
          <Button
            variant={camera.torchOn ? "primary" : "secondary"}
            className="size-touch shrink-0 rounded-full p-0"
            aria-pressed={camera.torchOn}
            aria-label={camera.torchOn ? t("camera.torchOff") : t("camera.torchOn")}
            onClick={() => void camera.toggleTorch()}
          >
            {camera.torchOn ? (
              <FlashlightOff className="size-7" aria-hidden />
            ) : (
              <Flashlight className="size-7" aria-hidden />
            )}
          </Button>
        ) : (
          <span className="size-touch shrink-0" aria-hidden />
        )}
      </header>

      {failure ? (
        <CameraFallback
          failure={failure}
          decodeError={decodeError}
          busy={busy || capturing}
          onPick={(file) => void pickFile(file)}
          onRetry={camera.retry}
        />
      ) : (
        <>
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2"
            style={{ containerType: "size" }}
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-lg ring-4 transition-shadow",
                LEVEL_RING[hasReference ? level : "unknown"],
              )}
              style={{ aspectRatio: aspect, width: `min(100cqw, calc(100cqh * ${aspect}))` }}
            >
              <video
                ref={videoRef}
                className="absolute inset-0 size-full object-cover"
                playsInline
                muted
                autoPlay
                onLoadedMetadata={(event) =>
                  setVideoAspect(
                    safeAspect(event.currentTarget.videoWidth, event.currentTarget.videoHeight),
                  )
                }
              />
              {bitmap && mode === "photo" ? (
                <BitmapLayer bitmap={bitmap} aspect={aspect} opacity={opacity / 100} />
              ) : null}
              {bitmap && mode === "contours" && contours ? (
                <ContourLayer raster={contours} opacity={Math.max(0.5, opacity / 100)} />
              ) : null}
              {camera.status === "starting" || referencePending || capturing ? (
                <div className="absolute inset-0 grid place-items-center bg-black/60">
                  <p className="animate-pulse text-lg font-semibold">
                    {capturing ? t("camera.processing") : t("camera.starting")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="bg-surface border-border flex flex-col gap-3 border-t-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {bitmap ? (
              <OverlayControls
                mode={mode}
                onModeChange={setMode}
                opacity={opacity}
                onOpacityChange={setOpacity}
              />
            ) : null}
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1">
                {hasReference && forcedReason ? (
                  <div className="border-danger bg-danger/10 min-h-touch flex min-w-0 flex-1 items-center gap-2 rounded-lg border-2 pl-3">
                    <p className="min-w-0 flex-1 text-sm font-semibold break-words">
                      {t("camera.forced", { reason: forcedReason })}
                    </p>
                    <Button
                      variant="ghost"
                      className="size-touch shrink-0 p-0"
                      aria-label={t("camera.cancelForce")}
                      onClick={() => setForcedReason(null)}
                    >
                      <X className="size-6" aria-hidden />
                    </Button>
                  </div>
                ) : null}
                {hasReference && !forcedReason ? (
                  <Button
                    variant="secondary"
                    block
                    className="text-base leading-tight"
                    onClick={() => setForcing(true)}
                    disabled={!live || reading.aligned}
                  >
                    {t("camera.force")}
                  </Button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void shoot()}
                disabled={!shootable}
                aria-label={t("camera.shutter")}
                aria-describedby={shootable ? undefined : lockedId}
                className={cn(
                  "border-foreground grid size-24 shrink-0 place-items-center rounded-full border-4 transition-transform active:scale-95",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                <span
                  className={cn(
                    "grid size-18 place-items-center rounded-full",
                    shootable
                      ? reading.aligned
                        ? "bg-status-free"
                        : "bg-accent"
                      : "bg-surface-raised",
                  )}
                >
                  {shootable ? null : <Lock className="size-8" aria-hidden />}
                </span>
              </button>
            </div>
            {shootable ? null : (
              <p id={lockedId} className="text-muted text-center text-sm">
                {t("camera.shutterLocked")}
              </p>
            )}
          </footer>
          {forcing ? (
            <ForceReasonSheet
              onConfirm={(reason) => {
                setForcedReason(reason);
                setForcing(false);
              }}
              onClose={() => setForcing(false)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
