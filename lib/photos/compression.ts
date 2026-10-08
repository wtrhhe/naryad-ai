import {
  PHOTO_MAX_SIDE,
  PHOTO_MAX_UPLOAD_BYTES,
  PHOTO_MIME_TYPES,
  PHOTO_TARGET_BYTES,
  type PhotoKind,
  type PhotoMimeType,
} from "@/lib/photos/types";

export const INPUT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
] as const;

export const QUALITY_START = 0.86;
export const QUALITY_MIN = 0.4;
export const QUALITY_STEP = 0.08;

export interface Size {
  width: number;
  height: number;
}

export function fitWithin(source: Size, maxSide: number = PHOTO_MAX_SIDE): Size {
  const width = Math.max(1, Math.round(source.width));
  const height = Math.max(1, Math.round(source.height));
  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    return { width, height };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function targetBytesFor(size: Size, target: number = PHOTO_TARGET_BYTES): number {
  const pixels = size.width * size.height;
  const fullPixels = PHOTO_MAX_SIDE * PHOTO_MAX_SIDE * 0.75;
  const ratio = Math.min(1, pixels / fullPixels);
  return Math.max(48 * 1024, Math.round(target * Math.sqrt(ratio)));
}

export function qualitySteps(
  start: number = QUALITY_START,
  min: number = QUALITY_MIN,
  step: number = QUALITY_STEP,
): number[] {
  if (step <= 0 || start < min) {
    return [Math.max(0.05, Math.min(1, start))];
  }
  const steps: number[] = [];
  for (let quality = start; quality >= min - 1e-9; quality -= step) {
    steps.push(Math.round(quality * 100) / 100);
  }
  return steps;
}

export function isAcceptedInputType(type: string): boolean {
  return (INPUT_MIME_TYPES as readonly string[]).includes(type.toLowerCase());
}

export function isUploadMimeType(type: string): type is PhotoMimeType {
  return (PHOTO_MIME_TYPES as readonly string[]).includes(type);
}

export function extensionFor(mime: PhotoMimeType): "webp" | "jpg" {
  return mime === "image/webp" ? "webp" : "jpg";
}

export function buildStoragePath(
  orderId: string,
  kind: PhotoKind,
  fileId: string,
  mime: PhotoMimeType,
): string {
  return `${orderId}/${kind}/${fileId}.${extensionFor(mime)}`;
}

export type EncodeFn = (type: PhotoMimeType, quality: number) => Promise<Blob | null>;

export interface EncodedResult {
  blob: Blob;
  mimeType: PhotoMimeType;
  quality: number;
}

export async function pickOutputType(encode: EncodeFn, quality: number): Promise<EncodedResult> {
  const webp = await encode("image/webp", quality);
  if (webp && webp.type === "image/webp" && webp.size > 0) {
    return { blob: webp, mimeType: "image/webp", quality };
  }
  const jpeg = await encode("image/jpeg", quality);
  if (!jpeg || jpeg.size === 0) {
    throw new Error("encode_failed");
  }
  return { blob: jpeg, mimeType: "image/jpeg", quality };
}

export async function encodeToTarget(
  encode: EncodeFn,
  targetBytes: number,
  steps: readonly number[] = qualitySteps(),
): Promise<EncodedResult> {
  const [first, ...rest] = steps;
  if (first === undefined) {
    throw new Error("encode_failed");
  }
  let best = await pickOutputType(encode, first);
  for (const quality of rest) {
    if (best.blob.size <= targetBytes) {
      break;
    }
    const blob = await encode(best.mimeType, quality);
    if (blob && blob.size > 0 && blob.size < best.blob.size) {
      best = { blob, mimeType: best.mimeType, quality };
    }
  }
  return best;
}

export type PhotoValidationError = "photo_type" | "photo_size" | "photo_empty";

export function validateUploadPhoto(photo: {
  mimeType: string;
  sizeBytes: number;
  blob: { size: number };
}): PhotoValidationError | null {
  if (!isUploadMimeType(photo.mimeType)) {
    return "photo_type";
  }
  if (photo.blob.size === 0 || photo.sizeBytes <= 0) {
    return "photo_empty";
  }
  if (photo.blob.size > PHOTO_MAX_UPLOAD_BYTES || photo.sizeBytes > PHOTO_MAX_UPLOAD_BYTES) {
    return "photo_size";
  }
  return null;
}

export function validateInputFile(file: {
  type: string;
  size: number;
}): PhotoValidationError | null {
  if (file.type !== "" && !isAcceptedInputType(file.type)) {
    return "photo_type";
  }
  if (file.size === 0) {
    return "photo_empty";
  }
  if (file.size > 4 * PHOTO_MAX_UPLOAD_BYTES) {
    return "photo_size";
  }
  return null;
}

const MIN_EXIF_YEAR = 2000;

export function resolveTakenAt(
  tags: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!tags) {
    return null;
  }
  const candidates = [tags.DateTimeOriginal, tags.CreateDate, tags.DateTimeDigitized];
  for (const value of candidates) {
    const date = toDate(value);
    if (
      date &&
      date.getUTCFullYear() >= MIN_EXIF_YEAR &&
      date.getTime() <= now.getTime() + 86_400_000
    ) {
      return date.toISOString();
    }
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    const date = match
      ? new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        )
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
