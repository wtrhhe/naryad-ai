import type { Database } from "@/lib/supabase/database.types";

export type PhotoKind = Database["public"]["Enums"]["photo_kind"];

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_TARGET_BYTES = 300 * 1024;
export const PHOTO_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/webp", "image/jpeg"] as const;

export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

export interface CompressedPhoto {
  id: string;
  blob: Blob;
  mimeType: PhotoMimeType;
  width: number;
  height: number;
  sizeBytes: number;
  takenAt: string | null;
  previewUrl: string;
}

export interface PhotoPickerProps {
  max: number;
  value: readonly CompressedPhoto[];
  onChange: (next: readonly CompressedPhoto[]) => void;
  required?: boolean;
  label: string;
}
