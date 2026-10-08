import type { Database } from "@/lib/supabase/database.types";
import { hammingDistance, isPhash } from "@/lib/phash/phash";

export const DUPLICATE_MAX_DISTANCE = 6;

export type HashedPhotoKind = Database["public"]["Enums"]["photo_kind"];

export interface HashedPhoto {
  id: string;
  workOrderId: string;
  kind: HashedPhotoKind;
  phash: string;
}

export interface PhotoDuplicate {
  photoId: string;
  kind: HashedPhotoKind;
  matchPhotoId: string;
  matchOrderId: string;
  matchKind: HashedPhotoKind;
  distance: number;
}

export function findDuplicates(
  own: readonly HashedPhoto[],
  others: readonly HashedPhoto[],
  maxDistance: number = DUPLICATE_MAX_DISTANCE,
): PhotoDuplicate[] {
  const ownOrders = new Set(own.map((photo) => photo.workOrderId));
  const candidates = others.filter(
    (photo) => isPhash(photo.phash) && !ownOrders.has(photo.workOrderId),
  );
  const duplicates: PhotoDuplicate[] = [];
  for (const photo of own) {
    if (!isPhash(photo.phash)) continue;
    for (const candidate of candidates) {
      const distance = hammingDistance(photo.phash, candidate.phash);
      if (distance <= maxDistance) {
        duplicates.push({
          photoId: photo.id,
          kind: photo.kind,
          matchPhotoId: candidate.id,
          matchOrderId: candidate.workOrderId,
          matchKind: candidate.kind,
          distance,
        });
      }
    }
  }
  return duplicates.sort((a, b) => a.distance - b.distance || a.photoId.localeCompare(b.photoId));
}
