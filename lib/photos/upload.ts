import type { ActionResult } from "@/lib/domain/action-result";
import type { CompressedPhoto, PhotoKind } from "@/lib/photos/types";

export type UploadOrderPhotos = (
  orderId: string,
  kind: PhotoKind,
  photos: readonly CompressedPhoto[],
) => Promise<ActionResult<{ photoIds: string[] }>>;

export const uploadOrderPhotos: UploadOrderPhotos = async (_orderId, _kind, photos) =>
  photos.length === 0 ? { ok: true, data: { photoIds: [] } } : { ok: false, error: "unavailable" };
