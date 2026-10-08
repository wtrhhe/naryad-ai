import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { renderScene } from "@/lib/phash/test-images";

vi.mock("server-only", () => ({}));

const { findOrderPhotoDuplicates, hashPendingOrderPhotos } = await import("@/lib/phash/store");
type Client = Parameters<typeof hashPendingOrderPhotos>[0];

interface Row {
  id: string;
  work_order_id: string;
  kind: "before" | "after" | "loto";
  storage_path: string;
  phash: string | null;
  created_at: string;
}

type Filter = (row: Row) => boolean;

function fakeClient(rows: Row[], files: Record<string, Buffer>, failUpdates = false) {
  const updates: Array<{ id: string; phash: string }> = [];
  const query = (filters: Filter[] = [], window?: [number, number]) => {
    const run = () => {
      const result = rows.filter((row) => filters.every((filter) => filter(row)));
      return window ? result.slice(window[0], window[1] + 1) : result;
    };
    const builder = {
      select: () => builder,
      eq: (column: keyof Row, value: unknown) =>
        query([...filters, (row) => row[column] === value], window),
      neq: (column: keyof Row, value: unknown) =>
        query([...filters, (row) => row[column] !== value], window),
      is: (column: keyof Row) => query([...filters, (row) => row[column] === null], window),
      not: (column: keyof Row) => query([...filters, (row) => row[column] !== null], window),
      order: () => builder,
      limit: (count: number) => query(filters, [0, count - 1]),
      range: (from: number, to: number) => query(filters, [from, to]),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve),
    };
    return builder;
  };
  const client = {
    from: () => ({
      select: () => query(),
      update: (values: { phash: string }) => ({
        eq: (_column: string, id: string) => ({
          is: async () => {
            if (failUpdates) return { error: { message: "denied" } };
            updates.push({ id, phash: values.phash });
            const row = rows.find((candidate) => candidate.id === id);
            if (row) row.phash = values.phash;
            return { error: null };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        download: async (path: string) => {
          const file = files[path];
          return file
            ? { data: new Blob([new Uint8Array(file)]), error: null }
            : { data: null, error: { message: "not found" } };
        },
      }),
    },
  };
  return { client: client as unknown as Client, updates };
}

async function png(seed: number): Promise<Buffer> {
  const gray = renderScene(96, 72, seed);
  return sharp(Buffer.from(gray.map((value) => Math.round(value))), {
    raw: { width: 96, height: 72, channels: 1 },
  })
    .png()
    .toBuffer();
}

function row(id: string, orderId: string, kind: Row["kind"], phash: string | null = null): Row {
  return {
    id,
    work_order_id: orderId,
    kind,
    storage_path: `${orderId}/${kind}/${id}.png`,
    phash,
    created_at: "2026-10-12T08:00:00Z",
  };
}

describe("hashPendingOrderPhotos", () => {
  it("hashes unhashed photos of the order and reports failures", async () => {
    const rows = [
      row("p1", "order-a", "before"),
      row("p2", "order-a", "after"),
      row("p3", "order-a", "after", "0123456789abcdef"),
      row("p4", "order-b", "after"),
    ];
    const files = {
      "order-a/before/p1.png": await png(1),
      "order-b/after/p4.png": await png(2),
    };
    const { client, updates } = fakeClient(rows, files);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const summary = await hashPendingOrderPhotos(client, "order-a");
    expect(summary).toEqual({ hashed: ["p1"], failed: ["p2"] });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.phash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("marks photos as failed when the update is rejected", async () => {
    const rows = [row("p1", "order-a", "before")];
    const { client } = fakeClient(rows, { "order-a/before/p1.png": await png(1) }, true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await hashPendingOrderPhotos(client, "order-a")).toEqual({
      hashed: [],
      failed: ["p1"],
    });
  });
});

describe("findOrderPhotoDuplicates", () => {
  it("compares the order photos with other orders only", async () => {
    const rows = [
      row("a1", "order-a", "after", "0000000000000000"),
      row("a2", "order-a", "before", "0000000000000001"),
      row("b1", "order-b", "after", "0000000000000003"),
      row("c1", "order-c", "before", "ffffffffffffffff"),
      row("c2", "order-c", "after", null),
    ];
    const { client } = fakeClient(rows, {});
    const duplicates = await findOrderPhotoDuplicates(client, "order-a");
    expect(duplicates.map((item) => [item.photoId, item.matchPhotoId, item.distance])).toEqual([
      ["a2", "b1", 1],
      ["a1", "b1", 2],
    ]);
  });

  it("returns nothing when the order has no hashed photos", async () => {
    const { client } = fakeClient([row("b1", "order-b", "after", "0000000000000000")], {});
    expect(await findOrderPhotoDuplicates(client, "order-a")).toEqual([]);
  });
});
