import "server-only";
import sharp from "sharp";
import { getAiProvider } from "@/lib/ai/provider";
import type { AiImage, AiProvider } from "@/lib/ai/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { PHOTOS_BUCKET, type PhotoStoreClient } from "@/lib/phash/store";
import {
  assessRepairPhotos,
  VISION_LOW_CONFIDENCE,
  VISION_MAX_IMAGES_PER_SIDE,
  type PhotoVisionResult,
  type VisionLanguage,
} from "@/lib/ghost/vision";

export const VISION_IMAGE_SIDE = 1024;
const LOW_CONFIDENCE_KEY = "review.low_confidence_threshold";

export interface OrderVisionOptions {
  client?: PhotoStoreClient;
  provider?: AiProvider;
  language?: VisionLanguage;
}

interface VisionPhotoRow {
  id: string;
  kind: "before" | "after" | "loto";
  storage_path: string;
}

export async function loadVisionImage(
  client: PhotoStoreClient,
  storagePath: string,
): Promise<AiImage | null> {
  const { data, error } = await client.storage.from(PHOTOS_BUCKET).download(storagePath);
  if (error || !data) {
    console.error("vision photo download failed", storagePath, error?.message);
    return null;
  }
  try {
    const jpeg = await sharp(Buffer.from(await data.arrayBuffer()), { failOn: "none" })
      .autoOrient()
      .resize(VISION_IMAGE_SIDE, VISION_IMAGE_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { mediaType: "image/jpeg", base64: jpeg.toString("base64") };
  } catch (cause) {
    console.error(
      "vision photo decode failed",
      storagePath,
      cause instanceof Error ? cause.message : cause,
    );
    return null;
  }
}

function confidenceThreshold(value: unknown): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  return typeof numeric === "number" && numeric > 0 && numeric < 1
    ? numeric
    : VISION_LOW_CONFIDENCE;
}

async function loadImages(
  client: PhotoStoreClient,
  photos: readonly VisionPhotoRow[],
): Promise<AiImage[]> {
  const images = await Promise.all(
    photos.map((photo) => loadVisionImage(client, photo.storage_path)),
  );
  return images.filter((image): image is AiImage => image !== null);
}

export async function assessOrderPhotoVision(
  orderId: string,
  options: OrderVisionOptions = {},
): Promise<PhotoVisionResult | null> {
  const provider = options.provider ?? getAiProvider();
  if (!provider.enabled) return null;
  const client = options.client ?? getSupabaseAdminClient();
  const [orderResult, photosResult, settingResult] = await Promise.all([
    client
      .from("work_orders")
      .select("id, description, work_performed, equipment:equipment_id (name)")
      .eq("id", orderId)
      .maybeSingle(),
    client
      .from("photos")
      .select("id, kind, storage_path")
      .eq("work_order_id", orderId)
      .in("kind", ["before", "after"])
      .order("taken_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    client.from("settings").select("value").eq("key", LOW_CONFIDENCE_KEY).maybeSingle(),
  ]);
  if (orderResult.error || photosResult.error) {
    console.error(
      "vision order load failed",
      orderId,
      orderResult.error?.message ?? photosResult.error?.message,
    );
    return { status: "failed", error: "provider_error", message: "order data unavailable" };
  }
  const order = orderResult.data;
  if (!order) return null;
  const photos = photosResult.data ?? [];
  const beforeRows = photos
    .filter((photo) => photo.kind === "before")
    .slice(0, VISION_MAX_IMAGES_PER_SIDE);
  const afterRows = photos
    .filter((photo) => photo.kind === "after")
    .slice(-VISION_MAX_IMAGES_PER_SIDE);
  if (afterRows.length === 0) return null;
  const [before, after] = await Promise.all([
    loadImages(client, beforeRows),
    loadImages(client, afterRows),
  ]);
  return assessRepairPhotos(
    {
      workOrderId: order.id,
      problemDescription: order.description,
      equipmentName: order.equipment?.name ?? null,
      workPerformed: order.work_performed,
      before,
      after,
      language: options.language,
      minConfidence: confidenceThreshold(settingResult.data?.value),
      cacheKey: `photo_vision:${[...beforeRows, ...afterRows].map((photo) => photo.id).join(",")}`,
    },
    provider,
  );
}
