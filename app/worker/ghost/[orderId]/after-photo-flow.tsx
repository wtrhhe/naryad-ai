"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, Copy, RotateCcw } from "lucide-react";
import { analyzeOrderPhotos, saveGhostScore } from "@/app/actions/photo-analysis";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { GhostCamera, type GhostCapture } from "@/components/ghost/ghost-camera";
import { Button } from "@/components/ui/button";

export interface ReferencePhoto {
  id: string;
  url: string;
}

type Phase =
  | { kind: "choose" }
  | { kind: "camera" }
  | { kind: "sending"; step: "uploading" | "analyzing" }
  | { kind: "failed"; message: "uploadFailed" | "saveFailed" }
  | { kind: "duplicate" };

interface Progress {
  capture: GhostCapture;
  path: string | null;
  photoId: string | null;
  scored: boolean;
}

class StepError extends Error {
  constructor(readonly step: "uploadFailed" | "saveFailed") {
    super(step);
  }
}

export function AfterPhotoFlow({
  orderId,
  employeeId,
  references,
  threshold,
  backHref,
}: {
  orderId: string;
  employeeId: string;
  references: readonly ReferencePhoto[];
  threshold: number;
  backHref: string;
}) {
  const t = useTranslations("ghost.after");
  const router = useRouter();
  const [referenceId, setReferenceId] = useState<string | null>(references[0]?.id ?? null);
  const [phase, setPhase] = useState<Phase>(
    references.length > 1 ? { kind: "choose" } : { kind: "camera" },
  );
  const progressRef = useRef<Progress | null>(null);
  const referenceUrl = references.find((item) => item.id === referenceId)?.url ?? null;

  const leave = () => router.push(backHref);

  const store = async (progress: Progress) => {
    const supabase = getSupabaseBrowserClient();
    if (!progress.path) {
      const path = `${orderId}/after/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(path, progress.capture.blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw new StepError("uploadFailed");
      progress.path = path;
    }
    if (!progress.photoId) {
      const { data, error } = await supabase
        .from("photos")
        .insert({
          work_order_id: orderId,
          kind: "after",
          storage_path: progress.path,
          mime_type: "image/jpeg",
          size_bytes: progress.capture.blob.size,
          width: progress.capture.width,
          height: progress.capture.height,
          taken_at: progress.capture.takenAt,
          author_id: employeeId,
        })
        .select("id")
        .single();
      if (error || !data) throw new StepError("uploadFailed");
      progress.photoId = data.id;
    }
    if (!progress.scored) {
      const result = await saveGhostScore(
        progress.photoId,
        progress.capture.ghostScore,
        progress.capture.forcedReason,
      );
      if (!result.ok && result.error === "unavailable") throw new StepError("saveFailed");
      progress.scored = true;
    }
    return progress.photoId;
  };

  const send = async () => {
    const progress = progressRef.current;
    if (!progress) return;
    setPhase({ kind: "sending", step: "uploading" });
    let photoId: string;
    try {
      photoId = await store(progress);
    } catch (cause) {
      setPhase({
        kind: "failed",
        message: cause instanceof StepError ? cause.step : "uploadFailed",
      });
      return;
    }
    setPhase({ kind: "sending", step: "analyzing" });
    const analysis = await analyzeOrderPhotos(orderId).catch(() => null);
    const duplicate =
      analysis?.ok === true && analysis.data.duplicates.some((item) => item.photoId === photoId);
    if (duplicate) {
      setPhase({ kind: "duplicate" });
      return;
    }
    leave();
  };

  const capture = async (shot: GhostCapture) => {
    progressRef.current = { capture: shot, path: null, photoId: null, scored: false };
    await send();
  };

  const reshoot = () => {
    progressRef.current = null;
    setPhase({ kind: "camera" });
  };

  if (phase.kind === "camera") {
    return (
      <GhostCamera
        referenceUrl={referenceUrl}
        threshold={threshold}
        onCapture={capture}
        onClose={references.length > 1 ? () => setPhase({ kind: "choose" }) : leave}
      />
    );
  }

  if (phase.kind === "choose") {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="ghost-reference-title">
        <h2 id="ghost-reference-title" className="text-xl font-bold">
          {t("chooseReference")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {references.map((reference, index) => (
            <button
              key={reference.id}
              type="button"
              onClick={() => {
                setReferenceId(reference.id);
                setPhase({ kind: "camera" });
              }}
              className="border-border hover:border-accent focus-visible:border-accent relative aspect-[3/4] overflow-hidden rounded-lg border-2"
            >
              <Image
                src={reference.url}
                alt={t("referenceAlt", { index: index + 1 })}
                fill
                unoptimized
                sizes="(min-width: 640px) 33vw, 50vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
        <Button variant="secondary" block onClick={leave}>
          {t("back")}
        </Button>
      </section>
    );
  }

  if (phase.kind === "sending") {
    return (
      <p role="status" className="text-muted animate-pulse py-10 text-center text-xl font-semibold">
        {phase.step === "uploading" ? t("uploading") : t("analyzing")}
      </p>
    );
  }

  if (phase.kind === "duplicate") {
    return (
      <section
        role="alert"
        className="border-status-busy bg-status-busy/10 flex flex-col gap-4 rounded-lg border-2 p-4"
      >
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Copy className="size-6" aria-hidden />
          {t("duplicateTitle")}
        </h2>
        <p className="text-lg">{t("duplicateBody")}</p>
        <Button block onClick={leave}>
          {t("continue")}
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <p
        role="alert"
        className="border-danger bg-danger/10 rounded-lg border-2 p-4 text-lg font-medium"
      >
        {t(phase.message)}
      </p>
      <Button block onClick={() => void send()}>
        <RotateCcw className="size-6" aria-hidden />
        {t("retry")}
      </Button>
      {phase.message === "uploadFailed" ? (
        <Button variant="secondary" block onClick={reshoot}>
          <Camera className="size-6" aria-hidden />
          {t("reshoot")}
        </Button>
      ) : (
        <Button variant="secondary" block onClick={leave}>
          {t("back")}
        </Button>
      )}
    </section>
  );
}
