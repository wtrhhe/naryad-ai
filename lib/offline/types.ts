export const OUTBOX_KINDS = ["transition", "photo", "audio"] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

export const OUTBOX_STATUSES = ["pending", "sending", "failed"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export type OutboxPayload = Record<string, unknown>;

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  ownerId: string;
  chainKey: string;
  sequence: number;
  payload: OutboxPayload;
  label: string | null;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  status: OutboxStatus;
  nextAttemptAt: string | null;
  blobCount: number;
}

export interface OutboxBlobInput {
  blob: Blob;
  mimeType: string;
  name?: string;
  meta?: Record<string, unknown>;
}

export interface StoredBlob extends OutboxBlobInput {
  id: string;
  actionId: string;
  position: number;
}

export const CONFLICT_RESOLUTIONS = ["server_wins", "rejected", "gave_up"] as const;
export type ConflictResolution = (typeof CONFLICT_RESOLUTIONS)[number];

export interface ConflictEntry {
  id: string;
  ownerId: string;
  kind: OutboxKind;
  chainKey: string;
  action: string | null;
  label: string | null;
  reason: string;
  resolution: ConflictResolution;
  attempts: number;
  createdAt: string;
  detectedAt: string;
  payload: OutboxPayload;
}

export type SendOutcome =
  | { type: "sent" }
  | { type: "conflict"; code: string }
  | { type: "rejected"; code: string }
  | { type: "retry"; code: string }
  | { type: "offline"; code: string }
  | { type: "auth"; code: string };

export type OutboxSender = (item: OutboxItem, blobs: readonly StoredBlob[]) => Promise<SendOutcome>;

export type OutboxSenders = Partial<Record<OutboxKind, OutboxSender>>;

export interface OutboxStore {
  add(item: OutboxItem, blobs: readonly StoredBlob[]): Promise<void>;
  list(): Promise<OutboxItem[]>;
  update(id: string, changes: Partial<Omit<OutboxItem, "id">>): Promise<void>;
  remove(id: string): Promise<void>;
  blobsFor(id: string): Promise<StoredBlob[]>;
  addConflict(entry: ConflictEntry): Promise<void>;
  listConflicts(): Promise<ConflictEntry[]>;
  removeConflict(id: string): Promise<void>;
}

export type FlushStopReason = "offline" | "auth" | "busy";

export interface FlushReport {
  sent: number;
  conflicts: number;
  failed: number;
  remaining: number;
  stopped: FlushStopReason | null;
  nextAttemptAt: string | null;
}
