import { compareItems } from "@/lib/offline/schedule";
import type { ConflictEntry, OutboxItem, OutboxStore, StoredBlob } from "@/lib/offline/types";

export function createMemoryOutboxStore(): OutboxStore {
  const items = new Map<string, OutboxItem>();
  const blobs = new Map<string, StoredBlob[]>();
  const conflicts = new Map<string, ConflictEntry>();
  return {
    async add(item, itemBlobs) {
      items.set(item.id, { ...item });
      blobs.set(item.id, [...itemBlobs]);
    },
    async list() {
      return [...items.values()].map((item) => ({ ...item })).sort(compareItems);
    },
    async update(id, changes) {
      const current = items.get(id);
      if (current) {
        items.set(id, { ...current, ...changes });
      }
    },
    async remove(id) {
      items.delete(id);
      blobs.delete(id);
    },
    async blobsFor(id) {
      return [...(blobs.get(id) ?? [])].sort((left, right) => left.position - right.position);
    },
    async addConflict(entry) {
      conflicts.set(entry.id, { ...entry });
    },
    async listConflicts() {
      return [...conflicts.values()].sort((left, right) =>
        right.detectedAt.localeCompare(left.detectedAt),
      );
    },
    async removeConflict(id) {
      conflicts.delete(id);
    },
  };
}
