"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  CAMERA_CONSTRAINTS,
  cameraUnsupportedError,
  classifyCameraError,
  type CameraStatus,
} from "@/lib/ghost/camera";

const FRAME_WAIT_MS = 5000;

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

function waitForFrames(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, FRAME_WAIT_MS);
    video.addEventListener(
      "loadeddata",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [attempt, setAttempt] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let attached: HTMLVideoElement | null = null;
    const start = async () => {
      const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
      if (!devices?.getUserMedia) throw cameraUnsupportedError();
      const opened = await devices.getUserMedia(CAMERA_CONSTRAINTS);
      if (cancelled) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = opened;
      const video = videoRef.current;
      if (!video) throw new Error("Video element is not mounted");
      attached = video;
      video.srcObject = opened;
      await video.play().catch(() => undefined);
      await waitForFrames(video);
      if (cancelled) return;
      const track = opened.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const capabilities: TorchCapabilities | undefined = track?.getCapabilities?.();
      setTorchSupported(Boolean(capabilities?.torch));
      setTorchOn(false);
      setStatus("live");
    };
    start().catch((error: unknown) => {
      if (!cancelled) setStatus(classifyCameraError(error));
    });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
      if (attached) attached.srcObject = null;
    };
  }, [attempt, videoRef]);

  const retry = useCallback(() => {
    setStatus("starting");
    setAttempt((value) => value + 1);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  return { status, retry, torchSupported, torchOn, toggleTorch };
}
