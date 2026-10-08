"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { compressPhoto } from "@/lib/photos/browser";
import { validateInputFile } from "@/lib/photos/compression";
import type { PhotoPickerProps } from "@/lib/photos/types";

export function PhotoPicker({ max, value, onChange, required, label }: PhotoPickerProps) {
  const t = useTranslations("photos");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const full = value.length >= max;

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
      .filter((file) => validateInputFile(file) === null)
      .slice(0, max - value.length);
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError(false);
    try {
      const compressed = await Promise.all(files.map(compressPhoto));
      onChange([...value, ...compressed].slice(0, max));
    } catch (failure) {
      console.error("photo compression failed", failure);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="font-semibold">
        {label}
        {required ? <span className="text-danger ml-1">{"+"}</span> : null}
        <span className="text-muted ml-2 text-sm font-normal">
          {t("count", { count: value.length, max })}
        </span>
      </span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={full || busy}
          onClick={() => cameraRef.current?.click()}
          className="min-h-touch border-border-strong bg-surface-raised flex items-center justify-center gap-2 rounded-lg border-2 font-semibold disabled:opacity-50"
        >
          <Camera className="size-6" aria-hidden />
          {t("camera")}
        </button>
        <button
          type="button"
          disabled={full || busy}
          onClick={() => galleryRef.current?.click()}
          className="min-h-touch border-border-strong bg-surface-raised flex items-center justify-center gap-2 rounded-lg border-2 font-semibold disabled:opacity-50"
        >
          <ImagePlus className="size-6" aria-hidden />
          {t("gallery")}
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFiles}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      {busy ? (
        <p className="text-muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("compressing")}
        </p>
      ) : null}
      {error ? <p className="text-danger text-sm">{t("failed")}</p> : null}
      {value.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {value.map((photo) => (
            <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg">
              <Image src={photo.previewUrl} alt="" fill unoptimized className="object-cover" />
              <button
                type="button"
                aria-label={t("remove")}
                onClick={() => onChange(value.filter((item) => item.id !== photo.id))}
                className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
