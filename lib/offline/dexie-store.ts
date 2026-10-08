import { Dexie, type DexieOptions, type EntityTable } from "dexie";
import type { ConflictEntry, OutboxItem, OutboxStore, StoredBlob } from "@/lib/offline/types";

export const OFFLINE_DB_NAME = "naryad-offline";

interface BlobRow {
  id: string;
  actionId: string;
  position: number;
  mimeType: string;
  name?: string;
  meta?: Record<string, unknown>;
  data: ArrayBuffer;
}

type OfflineDatabase = Dexie & {
  outbox: EntityTable<OutboxItem, "id">;
  blobs: EntityTable<BlobRow, "id">;
  conflicts: EntityTable<ConflictEntry, "id">;
};

export function openOfflineDatabase(options?: DexieOptions): OfflineDatabase {
  const database = new Dexie(OFFLINE_DB_NAME, options) as OfflineDatabase;
  database.version(1).stores({
    outbox: "id, ownerId, chainKey, sequence, status",
    blobs: "id, actionId",
    conflicts: "id, ownerId, detectedAt",
  });
  return database;
}

async function toRow(blob: StoredBlob): Promise<BlobRow> {
  return {
    id: blob.id,
    actionId: blob.actionId,
    position: blob.position,
    mimeType: blob.mimeType,
    name: blob.name,
    meta: blob.meta,
    data: await blob.blob.arrayBuffer(),
  };
}

function fromRow(row: BlobRow): StoredBlob {
  return {
    id: row.id,
    actionId: row.actionId,
    position: row.position,
    mimeType: row.mimeType,
    name: row.name,
    meta: row.meta,
    blob: new Blob([row.data], { type: row.mimeType }),
  };
}

export function createDexieOutboxStore(database: OfflineDatabase): OutboxStore {
  return {
    async add(item, blobs) {
      const rows = await Promise.all(blobs.map(toRow));
      await database.transaction("rw", database.outbox, database.blobs, async () => {
        await database.blobs.where("actionId").equals(item.id).delete();
        await database.outbox.put(item);
        if (rows.length > 0) {
          await database.blobs.bulkPut(rows);
        }
      });
    },
    async list() {
      return database.outbox.orderBy("sequence").toArray();
    },
    async update(id, changes) {
      await database.outbox.update(id, changes);
    },
    async remove(id) {
      await database.transaction("rw", database.outbox, database.blobs, async () => {
        await database.outbox.delete(id);
        await database.blobs.where("actionId").equals(id).delete();
      });
    },
    async blobsFor(id) {
      const rows = await database.blobs.where("actionId").equals(id).sortBy("position");
      return rows.map(fromRow);
    },
    async addConflict(entry) {
      await database.conflicts.put(entry);
    },
    async listConflicts() {
      return database.conflicts.orderBy("detectedAt").reverse().toArray();
    },
    async removeConflict(id) {
      await database.conflicts.delete(id);
    },
  };
}
