import { newUuid } from "@/lib/offline/ids";
import {
  classifyError,
  decideOutcome,
  isDue,
  nextSequence,
  nextWakeAt,
  runnableChains,
  withTimeout,
  type OutcomeDecision,
} from "@/lib/offline/schedule";
import type {
  FlushReport,
  OutboxBlobInput,
  OutboxItem,
  OutboxKind,
  OutboxPayload,
  OutboxSender,
  OutboxSenders,
  OutboxStore,
  SendOutcome,
  StoredBlob,
} from "@/lib/offline/types";

export const SEND_TIMEOUT_MS = 30_000;

export interface EnqueueInput {
  kind: OutboxKind;
  ownerId: string;
  payload: OutboxPayload;
  id?: string;
  chainKey?: string;
  label?: string | null;
  createdAt?: string;
  blobs?: readonly OutboxBlobInput[];
}

export interface Clock {
  now: () => Date;
  newId: () => string;
}

const systemClock: Clock = { now: () => new Date(), newId: () => newUuid() };

let lastSequence = 0;

export function buildOutboxItem(
  input: EnqueueInput,
  clock: Clock = systemClock,
): { item: OutboxItem; blobs: StoredBlob[] } {
  const id = input.id ?? clock.newId();
  const now = clock.now();
  lastSequence = nextSequence(now.getTime(), lastSequence);
  const blobs = (input.blobs ?? []).map((blob, position) => ({
    ...blob,
    id: `${id}:${position}`,
    actionId: id,
    position,
  }));
  const item: OutboxItem = {
    id,
    kind: input.kind,
    ownerId: input.ownerId,
    chainKey: input.chainKey ?? id,
    sequence: lastSequence,
    payload: input.payload,
    label: input.label ?? null,
    createdAt: input.createdAt ?? now.toISOString(),
    attempts: 0,
    lastError: null,
    status: "pending",
    nextAttemptAt: null,
    blobCount: blobs.length,
  };
  return { item, blobs };
}

export async function enqueue(
  store: OutboxStore,
  input: EnqueueInput,
  clock: Clock = systemClock,
): Promise<OutboxItem> {
  const { item, blobs } = buildOutboxItem(input, clock);
  await store.add(item, blobs);
  return item;
}

export interface FlushOptions {
  store: OutboxStore;
  senders: OutboxSenders;
  ownerId: string;
  force?: boolean;
  now?: () => Date;
  random?: () => number;
  isOnline?: () => boolean;
  timeoutMs?: number;
}

async function runSender(
  sender: OutboxSender,
  item: OutboxItem,
  options: FlushOptions,
): Promise<SendOutcome> {
  try {
    const blobs = item.blobCount > 0 ? await options.store.blobsFor(item.id) : [];
    return await withTimeout(sender(item, blobs), options.timeoutMs ?? SEND_TIMEOUT_MS);
  } catch (error) {
    return classifyError(error, options.isOnline?.() ?? true);
  }
}

async function applyDecision(
  store: OutboxStore,
  item: OutboxItem,
  decision: OutcomeDecision,
): Promise<void> {
  if (decision.conflict) {
    await store.addConflict(decision.conflict);
  }
  if (decision.remove) {
    await store.remove(item.id);
  } else if (decision.changes) {
    await store.update(item.id, decision.changes);
  }
}

async function releaseInterrupted(store: OutboxStore, items: OutboxItem[]): Promise<OutboxItem[]> {
  const interrupted = items.filter((item) => item.status === "sending");
  await Promise.all(interrupted.map((item) => store.update(item.id, { status: "pending" })));
  return items.map((item) =>
    item.status === "sending" ? { ...item, status: "pending" as const } : item,
  );
}

function availableKinds(senders: OutboxSenders): Set<OutboxKind> {
  return new Set(
    (Object.keys(senders) as OutboxKind[]).filter((kind) => senders[kind] !== undefined),
  );
}

type FlushTally = Omit<FlushReport, "remaining" | "nextAttemptAt">;

interface ChainContext {
  options: FlushOptions;
  now: () => Date;
  random: () => number;
  tally: FlushTally;
}

function count(tally: FlushTally, outcome: SendOutcome, decision: OutcomeDecision): void {
  if (outcome.type === "sent") {
    tally.sent += 1;
  } else if (decision.conflict) {
    tally.conflicts += 1;
  } else if (outcome.type === "retry") {
    tally.failed += 1;
  }
}

async function flushChain(chain: readonly OutboxItem[], context: ChainContext): Promise<boolean> {
  const { options, now, random, tally } = context;
  for (const item of chain) {
    const sender = options.senders[item.kind];
    if (!sender || !isDue(item, now(), options.force)) {
      return false;
    }
    await options.store.update(item.id, { status: "sending" });
    const outcome = await runSender(sender, item, options);
    const decision = decideOutcome(item, outcome, now(), random);
    await applyDecision(options.store, item, decision);
    count(tally, outcome, decision);
    if (decision.stop === "all") {
      tally.stopped = decision.stopReason;
      return true;
    }
    if (decision.stop === "chain") {
      return false;
    }
  }
  return false;
}

export async function flushOutbox(options: FlushOptions): Promise<FlushReport> {
  const { store, senders, ownerId } = options;
  const now = options.now ?? (() => new Date());
  const context: ChainContext = {
    options,
    now,
    random: options.random ?? Math.random,
    tally: { sent: 0, conflicts: 0, failed: 0, stopped: null },
  };
  const items = await releaseInterrupted(store, await store.list());
  const chains = runnableChains(items, {
    ownerId,
    now: now(),
    force: options.force,
    kinds: availableKinds(senders),
  });
  for (const chain of chains) {
    if (await flushChain(chain, context)) {
      break;
    }
  }
  const remaining = (await store.list()).filter((item) => item.ownerId === ownerId);
  return { ...context.tally, remaining: remaining.length, nextAttemptAt: nextWakeAt(remaining) };
}
