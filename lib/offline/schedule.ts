import type {
  ConflictEntry,
  ConflictResolution,
  FlushStopReason,
  OutboxItem,
  OutboxKind,
  SendOutcome,
} from "@/lib/offline/types";

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 12;

const CONFLICT_CODES: ReadonlySet<string> = new Set(["stale_status", "invalid_transition"]);
const TRANSIENT_CODES: ReadonlySet<string> = new Set(["unavailable"]);
const NETWORK_MESSAGE =
  /failed to fetch|load failed|networkerror|network request failed|network error/i;

export class OutboxTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`Timed out after ${milliseconds} ms`);
    this.name = "OutboxTimeoutError";
  }
}

export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempts - 1);
  const raw = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
  const jitter = 0.8 + 0.4 * Math.min(1, Math.max(0, random()));
  return Math.round(Math.min(BACKOFF_MAX_MS, raw * jitter));
}

export function nextSequence(nowMs: number, previous: number): number {
  return Math.max(nowMs, previous + 1);
}

export function compareItems(left: OutboxItem, right: OutboxItem): number {
  return (
    left.sequence - right.sequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

export function isDue(item: OutboxItem, now: Date, force = false): boolean {
  if (force || item.nextAttemptAt === null) {
    return true;
  }
  return Date.parse(item.nextAttemptAt) <= now.getTime();
}

export function buildChains(items: readonly OutboxItem[]): OutboxItem[][] {
  const chains = new Map<string, OutboxItem[]>();
  for (const item of [...items].sort(compareItems)) {
    const chain = chains.get(item.chainKey);
    if (chain) {
      chain.push(item);
    } else {
      chains.set(item.chainKey, [item]);
    }
  }
  return [...chains.values()];
}

export interface RunnableOptions {
  ownerId: string;
  now: Date;
  force?: boolean;
  kinds: ReadonlySet<OutboxKind>;
}

export function runnableChains(
  items: readonly OutboxItem[],
  { ownerId, now, force = false, kinds }: RunnableOptions,
): OutboxItem[][] {
  return buildChains(items.filter((item) => item.ownerId === ownerId)).filter((chain) => {
    const head = chain[0];
    return head !== undefined && kinds.has(head.kind) && isDue(head, now, force);
  });
}

export function nextWakeAt(items: readonly OutboxItem[]): string | null {
  const times = items
    .map((item) => (item.nextAttemptAt === null ? Number.NaN : Date.parse(item.nextAttemptAt)))
    .filter((time) => Number.isFinite(time));
  return times.length === 0 ? null : new Date(Math.min(...times)).toISOString();
}

function readCode(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function classifyActionResult(result: unknown): SendOutcome {
  if (typeof result !== "object" || result === null || !("ok" in result)) {
    return { type: "retry", code: "malformed_response" };
  }
  const { ok, error } = result as { ok: unknown; error?: unknown };
  if (ok === true) {
    return { type: "sent" };
  }
  const code = readCode(error) ?? "unknown";
  if (CONFLICT_CODES.has(code)) {
    return { type: "conflict", code };
  }
  if (TRANSIENT_CODES.has(code)) {
    return { type: "retry", code };
  }
  return { type: "rejected", code };
}

export function isRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  const { digest } = error as { digest: unknown };
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof OutboxTimeoutError) {
    return true;
  }
  return error instanceof Error && NETWORK_MESSAGE.test(error.message);
}

export function classifyError(error: unknown, online = true): SendOutcome {
  if (isRedirectError(error)) {
    return { type: "auth", code: "unauthenticated" };
  }
  if (error instanceof OutboxTimeoutError) {
    return { type: "offline", code: "timeout" };
  }
  if (!online || isNetworkError(error)) {
    return { type: "offline", code: "network" };
  }
  return { type: "retry", code: "unexpected" };
}

export function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new OutboxTimeoutError(milliseconds)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function toConflictEntry(
  item: OutboxItem,
  reason: string,
  resolution: ConflictResolution,
  now: Date,
): ConflictEntry {
  const action = item.payload.action;
  return {
    id: item.id,
    ownerId: item.ownerId,
    kind: item.kind,
    chainKey: item.chainKey,
    action: typeof action === "string" ? action : null,
    label: item.label,
    reason,
    resolution,
    attempts: item.attempts,
    createdAt: item.createdAt,
    detectedAt: now.toISOString(),
    payload: item.payload,
  };
}

export interface OutcomeDecision {
  remove: boolean;
  changes: Partial<Omit<OutboxItem, "id">> | null;
  conflict: ConflictEntry | null;
  stop: "chain" | "all" | null;
  stopReason: FlushStopReason | null;
}

const KEEP_GOING = { changes: null, conflict: null, stop: null, stopReason: null } as const;

export function decideOutcome(
  item: OutboxItem,
  outcome: SendOutcome,
  now: Date,
  random: () => number = Math.random,
): OutcomeDecision {
  switch (outcome.type) {
    case "sent":
      return { ...KEEP_GOING, remove: true };
    case "conflict":
      return {
        ...KEEP_GOING,
        remove: true,
        conflict: toConflictEntry(item, outcome.code, "server_wins", now),
      };
    case "rejected":
      return {
        ...KEEP_GOING,
        remove: true,
        conflict: toConflictEntry(item, outcome.code, "rejected", now),
      };
    case "retry": {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        return {
          ...KEEP_GOING,
          remove: true,
          conflict: toConflictEntry({ ...item, attempts }, outcome.code, "gave_up", now),
          stop: "chain",
        };
      }
      return {
        ...KEEP_GOING,
        remove: false,
        changes: {
          status: "failed",
          attempts,
          lastError: outcome.code,
          nextAttemptAt: new Date(now.getTime() + backoffDelay(attempts, random)).toISOString(),
        },
        stop: "chain",
      };
    }
    case "offline":
    case "auth":
      return {
        ...KEEP_GOING,
        remove: false,
        changes: { status: "pending", lastError: outcome.code },
        stop: "all",
        stopReason: outcome.type,
      };
  }
}
