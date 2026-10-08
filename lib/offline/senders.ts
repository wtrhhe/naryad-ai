import { z } from "zod";
import { transitionWorkOrder } from "@/app/actions/work-orders";
import { uploadOrderPhotos } from "@/lib/photos/upload";
import { PHOTO_MIME_TYPES, type CompressedPhoto } from "@/lib/photos/types";
import { classifyActionResult } from "@/lib/offline/schedule";
import type { OutboxSender, OutboxSenders, StoredBlob } from "@/lib/offline/types";

const photoPayloadSchema = z.object({
  orderId: z.uuid(),
  photoKind: z.enum(["before", "after", "loto"]),
});

const photoMetaSchema = z
  .object({
    width: z.number().nonnegative().catch(0),
    height: z.number().nonnegative().catch(0),
    takenAt: z.string().nullable().catch(null),
  })
  .catch({ width: 0, height: 0, takenAt: null });

function toCompressedPhoto(blob: StoredBlob): CompressedPhoto {
  const meta = photoMetaSchema.parse(blob.meta ?? {});
  return {
    id: blob.id,
    blob: blob.blob,
    mimeType: blob.mimeType === PHOTO_MIME_TYPES[0] ? PHOTO_MIME_TYPES[0] : PHOTO_MIME_TYPES[1],
    width: meta.width,
    height: meta.height,
    sizeBytes: blob.blob.size,
    takenAt: meta.takenAt,
    previewUrl: "",
  };
}

export const transitionSender: OutboxSender = async (item) =>
  classifyActionResult(await transitionWorkOrder({ ...item.payload, clientActionId: item.id }));

export const photoSender: OutboxSender = async (item, blobs) => {
  const parsed = photoPayloadSchema.safeParse(item.payload);
  if (!parsed.success) {
    return { type: "rejected", code: "validation" };
  }
  if (blobs.length !== item.blobCount) {
    return { type: "rejected", code: "blob_missing" };
  }
  const result = await uploadOrderPhotos(
    parsed.data.orderId,
    parsed.data.photoKind,
    blobs.map(toCompressedPhoto),
  );
  return classifyActionResult(result);
};

export const DEFAULT_SENDERS: OutboxSenders = {
  transition: transitionSender,
  photo: photoSender,
};
