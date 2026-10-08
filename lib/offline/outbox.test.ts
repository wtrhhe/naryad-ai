import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { createDexieOutboxStore, openOfflineDatabase } from "@/lib/offline/dexie-store";
import { createMemoryOutboxStore } from "@/lib/offline/memory-store";
import { buildOutboxItem, enqueue, flushOutbox, type Clock } from "@/lib/offline/outbox";
import { BACKOFF_BASE_MS } from "@/lib/offline/schedule";
import type { OutboxSender, OutboxStore, SendOutcome, StoredBlob } from "@/lib/offline/types";

const OWNER = "worker-1";

function clockAt(start: string): Clock & { tick(ms: number): void } {
  let current = Date.parse(start);
  let counter = 0;
  return {
    now: () => new Date(current),
    newId: () => `id-${++counter}`,
    tick(ms: number) {
      current += ms;
    },
  };
}

function scripted(outcomes: Record<string, SendOutcome | Error>) {
  const calls: string[] = [];
  const sender: OutboxSender = async (item) => {
    calls.push(item.id);
    const outcome = outcomes[item.id] ?? { type: "sent" };
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  };
  return { sender, calls };
}

async function seed(store: OutboxStore, clock: Clock, entries: [string, string][]) {
  for (const [id, chainKey] of entries) {
    await enqueue(
      store,
      { kind: "transition", ownerId: OWNER, id, chainKey, payload: { action: "accept" } },
      clock,
    );
  }
}

describe("buildOutboxItem", () => {
  it("creates a pending item keyed by the client action id", () => {
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    const { item, blobs } = buildOutboxItem(
      {
        kind: "photo",
        ownerId: OWNER,
        payload: { orderId: "o1", photoKind: "after" },
        chainKey: "o1",
        blobs: [{ blob: new Blob(["x"]), mimeType: "image/webp" }],
      },
      clock,
    );
    expect(item).toMatchObject({
      id: "id-1",
      chainKey: "o1",
      status: "pending",
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      blobCount: 1,
      createdAt: "2026-10-11T08:00:00.000Z",
    });
    expect(blobs[0]).toMatchObject({ id: "id-1:0", actionId: "id-1", position: 0 });
  });

  it("defaults the chain to the action itself", () => {
    const { item } = buildOutboxItem({ kind: "audio", ownerId: OWNER, payload: {} });
    expect(item.chainKey).toBe(item.id);
  });
});

describe("flushOutbox", () => {
  it("sends every order chain in the order actions were made", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [
      ["a1", "o1"],
      ["b1", "o2"],
      ["a2", "o1"],
    ]);
    const { sender, calls } = scripted({});
    const report = await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
    });
    expect(calls).toEqual(["a1", "a2", "b1"]);
    expect(report).toMatchObject({ sent: 3, remaining: 0, stopped: null, nextAttemptAt: null });
  });

  it("holds the rest of an order behind a failed action but serves other orders", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [
      ["a1", "o1"],
      ["a2", "o1"],
      ["b1", "o2"],
    ]);
    const { sender, calls } = scripted({ a1: { type: "retry", code: "unavailable" } });
    const report = await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
      random: () => 0.5,
    });
    expect(calls).toEqual(["a1", "b1"]);
    expect(report).toMatchObject({ sent: 1, failed: 1, remaining: 2 });
    expect(report.nextAttemptAt).toBe(
      new Date(clock.now().getTime() + BACKOFF_BASE_MS).toISOString(),
    );
    const [failed] = await store.list();
    expect(failed).toMatchObject({ id: "a1", status: "failed", attempts: 1 });

    const early = await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
    });
    expect(early.sent).toBe(0);
    expect(calls).toEqual(["a1", "b1"]);

    clock.tick(BACKOFF_BASE_MS * 2);
    const { sender: healthy, calls: later } = scripted({});
    const retried = await flushOutbox({
      store,
      senders: { transition: healthy },
      ownerId: OWNER,
      now: clock.now,
    });
    expect(later).toEqual(["a1", "a2"]);
    expect(retried).toMatchObject({ sent: 2, remaining: 0 });
  });

  it("ignores the backoff when forced", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [["a1", "o1"]]);
    await store.update("a1", {
      status: "failed",
      attempts: 3,
      nextAttemptAt: "2026-10-11T09:00:00.000Z",
    });
    const { sender, calls } = scripted({});
    await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
      force: true,
    });
    expect(calls).toEqual(["a1"]);
  });

  it("drops stale actions with a journal entry and keeps going", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [
      ["a1", "o1"],
      ["a2", "o1"],
    ]);
    const { sender, calls } = scripted({
      a1: { type: "conflict", code: "stale_status" },
      a2: { type: "conflict", code: "invalid_transition" },
    });
    const report = await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
    });
    expect(calls).toEqual(["a1", "a2"]);
    expect(report).toMatchObject({ sent: 0, conflicts: 2, remaining: 0 });
    const conflicts = await store.listConflicts();
    expect(conflicts.map((entry) => [entry.id, entry.reason, entry.resolution])).toEqual(
      expect.arrayContaining([
        ["a1", "stale_status", "server_wins"],
        ["a2", "invalid_transition", "server_wins"],
      ]),
    );
  });

  it("stops everything on a sign-in problem and keeps the actions", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [
      ["a1", "o1"],
      ["b1", "o2"],
    ]);
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    const { sender, calls } = scripted({ a1: redirect });
    const report = await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
    });
    expect(calls).toEqual(["a1"]);
    expect(report).toMatchObject({ stopped: "auth", remaining: 2 });
    const items = await store.list();
    expect(items[0]).toMatchObject({
      status: "pending",
      lastError: "unauthenticated",
      attempts: 0,
    });
  });

  it("stops on network failures without spending attempts", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [
      ["a1", "o1"],
      ["b1", "o2"],
    ]);
    const { sender, calls } = scripted({ a1: new TypeError("Failed to fetch") });
    const report = await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
    });
    expect(calls).toEqual(["a1"]);
    expect(report).toMatchObject({ stopped: "offline", remaining: 2 });
    expect((await store.list())[0]).toMatchObject({ attempts: 0, lastError: "network" });
  });

  it("times out hanging senders", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [["a1", "o1"]]);
    const report = await flushOutbox({
      store,
      senders: { transition: () => new Promise(() => undefined) },
      ownerId: OWNER,
      now: clock.now,
      timeoutMs: 5,
    });
    expect(report.stopped).toBe("offline");
    expect((await store.list())[0]?.lastError).toBe("timeout");
  });

  it("only sends actions of the signed-in employee", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [["a1", "o1"]]);
    await enqueue(
      store,
      { kind: "transition", ownerId: "worker-2", id: "z1", chainKey: "o9", payload: {} },
      clock,
    );
    const { sender, calls } = scripted({});
    const report = await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: clock.now,
    });
    expect(calls).toEqual(["a1"]);
    expect(report.remaining).toBe(0);
    expect((await store.list()).map((entry) => entry.id)).toEqual(["z1"]);
  });

  it("leaves kinds without a sender waiting", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await enqueue(store, { kind: "audio", ownerId: OWNER, id: "m1", payload: {} }, clock);
    const report = await flushOutbox({ store, senders: {}, ownerId: OWNER, now: clock.now });
    expect(report).toMatchObject({ sent: 0, remaining: 1 });
  });

  it("recovers actions left in flight by a closed tab", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [["a1", "o1"]]);
    await store.update("a1", { status: "sending" });
    const { sender, calls } = scripted({});
    await flushOutbox({ store, senders: { transition: sender }, ownerId: OWNER, now: clock.now });
    expect(calls).toEqual(["a1"]);
  });

  it("hands stored blobs to the sender in order", async () => {
    const store = createMemoryOutboxStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await enqueue(
      store,
      {
        kind: "photo",
        ownerId: OWNER,
        id: "p1",
        chainKey: "o1",
        payload: { orderId: "o1", photoKind: "after" },
        blobs: [
          { blob: new Blob(["first"]), mimeType: "image/webp" },
          { blob: new Blob(["second"]), mimeType: "image/webp" },
        ],
      },
      clock,
    );
    const received = vi.fn<(blobs: readonly StoredBlob[]) => void>();
    const photo: OutboxSender = async (_item, blobs) => {
      received(blobs);
      return { type: "sent" };
    };
    await flushOutbox({ store, senders: { photo }, ownerId: OWNER, now: clock.now });
    const blobs = received.mock.calls[0]?.[0] ?? [];
    expect(await Promise.all(blobs.map((entry) => entry.blob.text()))).toEqual(["first", "second"]);
    expect(await store.blobsFor("p1")).toEqual([]);
  });
});

describe("dexie outbox store", () => {
  function dexieStore() {
    return createDexieOutboxStore(
      openOfflineDatabase({ indexedDB: new IDBFactory(), IDBKeyRange }),
    );
  }

  it("keeps items, blobs and conflicts in IndexedDB", async () => {
    const store = dexieStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await enqueue(
      store,
      {
        kind: "audio",
        ownerId: OWNER,
        id: "m1",
        chainKey: "o1",
        payload: { orderId: "o1" },
        blobs: [{ blob: new Blob(["wave"], { type: "audio/webm" }), mimeType: "audio/webm" }],
      },
      clock,
    );
    await seed(store, clock, [["a1", "o1"]]);
    expect((await store.list()).map((entry) => entry.id)).toEqual(["m1", "a1"]);

    await store.update("a1", { status: "failed", attempts: 2 });
    expect((await store.list())[1]).toMatchObject({ status: "failed", attempts: 2 });

    const [blob] = await store.blobsFor("m1");
    expect(blob?.mimeType).toBe("audio/webm");
    expect(await blob?.blob.text()).toBe("wave");

    await store.remove("m1");
    expect(await store.blobsFor("m1")).toEqual([]);
    expect((await store.list()).map((entry) => entry.id)).toEqual(["a1"]);
  });

  it("lists the newest conflicts first and forgets dismissed ones", async () => {
    const store = dexieStore();
    const clock = clockAt("2026-10-11T08:00:00.000Z");
    await seed(store, clock, [
      ["a1", "o1"],
      ["a2", "o1"],
    ]);
    const { sender } = scripted({
      a1: { type: "conflict", code: "stale_status" },
      a2: { type: "rejected", code: "forbidden" },
    });
    let step = 0;
    await flushOutbox({
      store,
      senders: { transition: sender },
      ownerId: OWNER,
      now: () => new Date(Date.parse("2026-10-11T08:00:00.000Z") + step++ * 1000),
    });
    expect((await store.listConflicts()).map((entry) => entry.id)).toEqual(["a2", "a1"]);
    await store.removeConflict("a2");
    expect((await store.listConflicts()).map((entry) => entry.id)).toEqual(["a1"]);
  });
});
