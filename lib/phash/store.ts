import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computeImagePhash } from "@/lib/phash/server";
import { isPhash } from "@/lib/phash/phash";
import {
  DUPLICATE_MAX_DISTANCE,
  findDuplicates,
  type HashedPhoto,
  type HashedPhotoKind,
  type PhotoDuplicate,
} from "@/lib/phash/duplicates";

export type PhotoStoreClient = SupabaseClient<Database>;

export const PHOTOS_BUCKET = "photos";

const PENDING_LIMIT = 24;
const PARALLEL_HASHES = 4;
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export interface HashingSummary {
  hashed: string[];
  failed: string[];
}

interface PhotoHashRow {
  id: string;
  work_order_id: string;
  kind: HashedPhotoKind;
  phash: string | null;
}

async function hashStoredPhoto(client: PhotoStoreClient, path: string): Promise<string | null> {
  const { data, error } = await client.storage.from(PHOTOS_BUCKET).download(path);
  if (error || !data) {
    console.error("photo download failed", path, error?.message);
    return null;
  }
  try {
    return await computeImagePhash(await data.arrayBuffer());
  } catch (cause) {
    console.error("photo hash failed", path, cause instanceof Error ? cause.message : cause);
    return null;
  }
}

async function hashAndStore(
  client: PhotoStoreClient,
  photo: { id: string; storage_path: string },
): Promise<boolean> {
  const hash = await hashStoredPhoto(client, photo.storage_path);
  if (!hash) return false;
  const { error } = await client
    .from("photos")
    .update({ phash: hash })
    .eq("id", photo.id)
    .is("phash", null);
  if (error) {
    console.error("photo hash update failed", photo.id, error.message);
    return false;
  }
  return true;
}

export async function hashPendingOrderPhotos(
  client: PhotoStoreClient,
  orderId: string,
  limit: number = PENDING_LIMIT,
): Promise<HashingSummary> {
  const { data, error } = await client
    .from("photos")
    .select("id, storage_path")
    .eq("work_order_id", orderId)
    .is("phash", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to list unhashed photos: ${error.message}`);
  }
  const summary: HashingSummary = { hashed: [], failed: [] };
  const pending = data ?? [];
  for (let start = 0; start < pending.length; start += PARALLEL_HASHES) {
    const batch = pending.slice(start, start + PARALLEL_HASHES);
    const results = await Promise.all(batch.map((photo) => hashAndStore(client, photo)));
    batch.forEach((photo, index) =>
      (results[index] ? summary.hashed : summary.failed).push(photo.id),
    );
  }
  return summary;
}

function toHashedPhotos(rows: readonly PhotoHashRow[]): HashedPhoto[] {
  return rows.flatMap((row) =>
    isPhash(row.phash)
      ? [{ id: row.id, workOrderId: row.work_order_id, kind: row.kind, phash: row.phash }]
      : [],
  );
}

async function loadOtherOrderHashes(
  client: PhotoStoreClient,
  orderId: string,
): Promise<HashedPhoto[]> {
  const collected: HashedPhoto[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from("photos")
      .select("id, work_order_id, kind, phash")
      .neq("work_order_id", orderId)
      .not("phash", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to load photo hashes: ${error.message}`);
    }
    collected.push(...toHashedPhotos(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return collected;
}

export async function findOrderPhotoDuplicates(
  client: PhotoStoreClient,
  orderId: string,
  maxDistance: number = DUPLICATE_MAX_DISTANCE,
): Promise<PhotoDuplicate[]> {
  const { data, error } = await client
    .from("photos")
    .select("id, work_order_id, kind, phash")
    .eq("work_order_id", orderId)
    .not("phash", "is", null);
  if (error) {
    throw new Error(`Failed to load order photo hashes: ${error.message}`);
  }
  const own = toHashedPhotos(data ?? []);
  if (own.length === 0) return [];
  return findDuplicates(own, await loadOtherOrderHashes(client, orderId), maxDistance);
}
