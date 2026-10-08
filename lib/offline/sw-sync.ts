export const OUTBOX_SYNC_TAG = "naryad-outbox";
export const OUTBOX_FLUSH_REQUEST = "naryad-outbox:flush";
export const OUTBOX_FLUSH_REPLY = "naryad-outbox:flushed";
export const OUTBOX_SYNC_TIMEOUT_MS = 60_000;

export interface FlushRequestMessage {
  type: typeof OUTBOX_FLUSH_REQUEST;
}

export interface FlushReplyMessage {
  type: typeof OUTBOX_FLUSH_REPLY;
  remaining: number;
}

export interface FlushTarget {
  postMessage(message: FlushRequestMessage, transfer: Transferable[]): void;
}

interface SyncEventLike extends ExtendableEvent {
  tag: string;
}

export function isFlushRequest(data: unknown): data is FlushRequestMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === OUTBOX_FLUSH_REQUEST
  );
}

export function flushReply(remaining: number): FlushReplyMessage {
  return { type: OUTBOX_FLUSH_REPLY, remaining };
}

export function readRemaining(data: unknown): number | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { type, remaining } = data as { type?: unknown; remaining?: unknown };
  return type === OUTBOX_FLUSH_REPLY && typeof remaining === "number" && remaining >= 0
    ? remaining
    : null;
}

export function askClientToFlush(target: FlushTarget, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(readRemaining(event.data));
    };
    target.postMessage({ type: OUTBOX_FLUSH_REQUEST }, [channel.port2]);
  });
}

export async function requestClientFlush(
  targets: readonly FlushTarget[],
  timeoutMs: number = OUTBOX_SYNC_TIMEOUT_MS,
): Promise<void> {
  if (targets.length === 0) {
    throw new Error("No open window can send the outbox");
  }
  const replies = await Promise.all(targets.map((target) => askClientToFlush(target, timeoutMs)));
  if (!replies.some((remaining) => remaining === 0)) {
    throw new Error("The outbox still has actions waiting");
  }
}

export function registerOutboxSync(
  scope: ServiceWorkerGlobalScope,
  timeoutMs: number = OUTBOX_SYNC_TIMEOUT_MS,
): void {
  scope.addEventListener("sync", (event) => {
    const syncEvent = event as SyncEventLike;
    if (syncEvent.tag !== OUTBOX_SYNC_TAG) {
      return;
    }
    syncEvent.waitUntil(
      scope.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windows) => requestClientFlush(windows, timeoutMs)),
    );
  });
}
