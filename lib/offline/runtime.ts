import { createDexieOutboxStore, openOfflineDatabase } from "@/lib/offline/dexie-store";
import { createMemoryOutboxStore } from "@/lib/offline/memory-store";
import { enqueue as enqueueItem, flushOutbox, type EnqueueInput } from "@/lib/offline/outbox";
import { DEFAULT_SENDERS } from "@/lib/offline/senders";
import { flushReply, isFlushRequest, OUTBOX_SYNC_TAG } from "@/lib/offline/sw-sync";
import type {
  ConflictEntry,
  FlushReport,
  FlushStopReason,
  OutboxItem,
  OutboxKind,
  OutboxSender,
  OutboxSenders,
  OutboxStore,
} from "@/lib/offline/types";

export interface OutboxSnapshot {
  ready: boolean;
  online: boolean;
  pending: number;
  failed: number;
  flushing: boolean;
  stopped: FlushStopReason | null;
  conflicts: readonly ConflictEntry[];
  lastDeliveredAt: number | null;
}

const LOCK_NAME = "naryad-outbox-flush";
const CHANNEL_NAME = "naryad-outbox";
const MIN_WAKE_MS = 1_000;
const MAX_WAKE_MS = 10 * 60_000;
const OFFLINE_RETRY_MS = 30_000;

const SERVER_SNAPSHOT: OutboxSnapshot = {
  ready: false,
  online: true,
  pending: 0,
  failed: 0,
  flushing: false,
  stopped: null,
  conflicts: [],
  lastDeliveredAt: null,
};

const BUSY_REPORT: FlushReport = {
  sent: 0,
  conflicts: 0,
  failed: 0,
  remaining: 0,
  stopped: "busy",
  nextAttemptAt: null,
};

function browserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function openStore(): Promise<OutboxStore> {
  if (typeof indexedDB === "undefined") {
    return createMemoryOutboxStore();
  }
  try {
    const database = openOfflineDatabase();
    await database.open();
    return createDexieOutboxStore(database);
  } catch (error) {
    console.warn("Offline storage is unavailable, actions are kept in memory", error);
    return createMemoryOutboxStore();
  }
}

async function registerBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && "sync" in registration) {
      await registration.sync.register(OUTBOX_SYNC_TAG);
    }
  } catch (error) {
    console.warn("Background sync registration failed", error);
  }
}

export class OutboxRuntime {
  private ownerId: string | null = null;
  private storePromise: Promise<OutboxStore> | null = null;
  private snapshot: OutboxSnapshot = SERVER_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private senders: OutboxSenders = { ...DEFAULT_SENDERS };
  private flushing: Promise<FlushReport> | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel | null = null;
  private detach: (() => void) | null = null;
  private starts = 0;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): OutboxSnapshot => this.snapshot;

  readonly getServerSnapshot = (): OutboxSnapshot => SERVER_SNAPSHOT;

  owner(): string | null {
    return this.ownerId;
  }

  start(ownerId: string): () => void {
    this.starts += 1;
    if (this.ownerId !== ownerId) {
      this.ownerId = ownerId;
      this.patch({ ...SERVER_SNAPSHOT, online: browserOnline() });
    }
    this.detach ??= this.attach();
    void this.refresh().then(() => this.flush());
    return () => {
      this.starts -= 1;
      if (this.starts <= 0) {
        this.starts = 0;
        this.detach?.();
        this.detach = null;
        this.clearWake();
      }
    };
  }

  registerSender(kind: OutboxKind, sender: OutboxSender): () => void {
    this.senders = { ...this.senders, [kind]: sender };
    return () => {
      if (this.senders[kind] === sender) {
        const { [kind]: _removed, ...rest } = this.senders;
        this.senders = rest;
      }
    };
  }

  async enqueue(input: Omit<EnqueueInput, "ownerId">): Promise<OutboxItem> {
    const ownerId = this.ownerId;
    if (ownerId === null) {
      throw new Error("The outbox is not started");
    }
    const item = await enqueueItem(await this.store(), { ...input, ownerId });
    await this.refresh();
    this.announce();
    void registerBackgroundSync();
    if (browserOnline()) {
      this.scheduleWake(MIN_WAKE_MS);
    }
    return item;
  }

  async hasPending(chainKey: string): Promise<boolean> {
    if (this.ownerId === null) {
      return false;
    }
    const items = await (await this.store()).list();
    return items.some((item) => item.ownerId === this.ownerId && item.chainKey === chainKey);
  }

  flush(options: { force?: boolean } = {}): Promise<FlushReport> {
    this.flushing ??= this.runFlush(options.force ?? false).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async dismissConflict(id: string): Promise<void> {
    await (await this.store()).removeConflict(id);
    await this.refresh();
    this.announce();
  }

  async dismissAllConflicts(): Promise<void> {
    const store = await this.store();
    await Promise.all(this.snapshot.conflicts.map((entry) => store.removeConflict(entry.id)));
    await this.refresh();
    this.announce();
  }

  async refresh(): Promise<void> {
    const ownerId = this.ownerId;
    if (ownerId === null) {
      return;
    }
    const store = await this.store();
    const [items, conflicts] = await Promise.all([store.list(), store.listConflicts()]);
    const mine = items.filter((item) => item.ownerId === ownerId);
    this.patch({
      ready: true,
      online: browserOnline(),
      pending: mine.length,
      failed: mine.filter((item) => item.status === "failed").length,
      conflicts: conflicts.filter((entry) => entry.ownerId === ownerId),
    });
  }

  private store(): Promise<OutboxStore> {
    this.storePromise ??= openStore();
    return this.storePromise;
  }

  private patch(changes: Partial<OutboxSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }

  private async runFlush(force: boolean): Promise<FlushReport> {
    const ownerId = this.ownerId;
    if (ownerId === null) {
      return BUSY_REPORT;
    }
    this.clearWake();
    this.patch({ flushing: true, online: browserOnline() });
    try {
      const report = await this.exclusive(async () =>
        flushOutbox({
          store: await this.store(),
          senders: this.senders,
          ownerId,
          force,
          isOnline: browserOnline,
        }),
      );
      await this.refresh();
      this.afterFlush(report);
      return report;
    } catch (error) {
      console.error("Outbox flush failed", error);
      return BUSY_REPORT;
    } finally {
      this.patch({ flushing: false });
    }
  }

  private afterFlush(report: FlushReport): void {
    if (report.stopped === "busy") {
      return;
    }
    this.patch({
      stopped: report.stopped,
      lastDeliveredAt:
        report.sent > 0 && report.remaining === 0 ? Date.now() : this.snapshot.lastDeliveredAt,
    });
    if (report.sent > 0 || report.conflicts > 0) {
      this.announce();
    }
    if (report.stopped === "offline" && report.remaining > 0) {
      this.scheduleWake(OFFLINE_RETRY_MS);
    } else if (report.nextAttemptAt !== null && report.stopped === null) {
      this.scheduleWake(Date.parse(report.nextAttemptAt) - Date.now());
    }
    if (report.remaining > 0) {
      void registerBackgroundSync();
    }
  }

  private async exclusive(task: () => Promise<FlushReport>): Promise<FlushReport> {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (!locks) {
      return task();
    }
    let report: FlushReport = BUSY_REPORT;
    await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock) {
        report = await task();
      }
    });
    return report;
  }

  private scheduleWake(delay: number): void {
    this.clearWake();
    const bounded = Math.min(MAX_WAKE_MS, Math.max(MIN_WAKE_MS, delay));
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      void this.flush();
    }, bounded);
  }

  private clearWake(): void {
    if (this.wakeTimer !== null) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
  }

  private announce(): void {
    this.channel?.postMessage("changed");
  }

  private attach(): () => void {
    const handleOnline = () => {
      this.patch({ online: true });
      void this.flush({ force: true });
    };
    const handleOffline = () => {
      this.patch({ online: false });
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void this.refresh().then(() => this.flush());
      }
    };
    const handleWorkerMessage = (event: MessageEvent) => {
      if (!isFlushRequest(event.data)) {
        return;
      }
      const port = event.ports[0];
      void this.flush({ force: true }).then((report) => {
        port?.postMessage(
          flushReply(report.stopped === "busy" ? this.snapshot.pending : report.remaining),
        );
      });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pageshow", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    const worker = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    worker?.addEventListener("message", handleWorkerMessage);
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = () => {
        void this.refresh();
      };
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pageshow", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
      worker?.removeEventListener("message", handleWorkerMessage);
      this.channel?.close();
      this.channel = null;
    };
  }
}

export const outboxRuntime = new OutboxRuntime();
