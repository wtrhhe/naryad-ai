import {
  encodeToTarget,
  fitWithin,
  resolveTakenAt,
  targetBytesFor,
  type EncodeFn,
} from "@/lib/photos/compression";
import type { CompressedPhoto } from "@/lib/photos/types";

async function readTakenAt(file: File): Promise<string | null> {
  try {
    const exifr = await import("exifr");
    const tags = await exifr.parse(file, ["DateTimeOriginal", "CreateDate", "DateTimeDigitized"]);
    return resolveTakenAt(tags as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

function canvasEncoder(bitmap: ImageBitmap, width: number, height: number): EncodeFn {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    return async (type, quality) => {
      try {
        return await canvas.convertToBlob({ type, quality });
      } catch {
        return null;
      }
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  return (type, quality) =>
    new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const takenAt = await readTakenAt(file);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = fitWithin({ width: bitmap.width, height: bitmap.height });
  const encoded = await encodeToTarget(
    canvasEncoder(bitmap, size.width, size.height),
    targetBytesFor(size),
  );
  bitmap.close();
  return {
    id: crypto.randomUUID(),
    blob: encoded.blob,
    mimeType: encoded.mimeType,
    width: size.width,
    height: size.height,
    sizeBytes: encoded.blob.size,
    takenAt: takenAt ?? new Date().toISOString(),
    previewUrl: URL.createObjectURL(encoded.blob),
  };
}
