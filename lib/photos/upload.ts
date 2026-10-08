import type { ActionResult } from "@/lib/domain/action-result";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildStoragePath, validateUploadPhoto } from "@/lib/photos/compression";
import type { CompressedPhoto, PhotoKind } from "@/lib/photos/types";

export type UploadOrderPhotos = (
  orderId: string,
  kind: PhotoKind,
  photos: readonly CompressedPhoto[],
) => Promise<ActionResult<{ photoIds: string[] }>>;

export const uploadOrderPhotos: UploadOrderPhotos = async (orderId, kind, photos) => {
  if (photos.length === 0) return { ok: true, data: { photoIds: [] } };
  if (photos.some((photo) => validateUploadPhoto(photo) !== null)) {
    return { ok: false, error: "validation" };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: employeeId, error: employeeError } = await supabase.rpc("current_employee_id");
  if (employeeError || !employeeId) return { ok: false, error: "forbidden" };
  const photoIds: string[] = [];
  for (const photo of photos) {
    const path = buildStoragePath(orderId, kind, photo.id, photo.mimeType);
    const upload = await supabase.storage
      .from("photos")
      .upload(path, photo.blob, { contentType: photo.mimeType, upsert: false });
    if (upload.error) {
      console.error("photo upload failed", upload.error.message);
      return { ok: false, error: "unavailable" };
    }
    const { data, error } = await supabase
      .from("photos")
      .insert({
        work_order_id: orderId,
        kind,
        storage_path: path,
        mime_type: photo.mimeType,
        size_bytes: photo.sizeBytes,
        width: photo.width || null,
        height: photo.height || null,
        taken_at: photo.takenAt,
        author_id: employeeId,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("photo record failed", error?.message);
      return { ok: false, error: "unavailable" };
    }
    photoIds.push(data.id);
  }
  return { ok: true, data: { photoIds } };
};
