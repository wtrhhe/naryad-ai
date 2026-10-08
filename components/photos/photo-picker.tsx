"use client";

import type { ChangeEvent } from "react";
import {
  PHOTO_MAX_UPLOAD_BYTES,
  type CompressedPhoto,
  type PhotoPickerProps,
} from "@/lib/photos/types";

function toCompressedPhoto(file: File): CompressedPhoto {
  return {
    id: crypto.randomUUID(),
    blob: file,
    mimeType: file.type === "image/webp" ? "image/webp" : "image/jpeg",
    width: 0,
    height: 0,
    sizeBytes: file.size,
    takenAt: null,
    previewUrl: URL.createObjectURL(file),
  };
}

export function PhotoPicker({ max, value, onChange, required, label }: PhotoPickerProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(
      (file) => file.size <= PHOTO_MAX_UPLOAD_BYTES,
    );
    onChange([...value, ...files.map(toCompressedPhoto)].slice(0, max));
  };
  return (
    <label className="flex flex-col gap-2">
      <span className="font-semibold">{label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        required={required}
        onChange={handleChange}
      />
    </label>
  );
}
