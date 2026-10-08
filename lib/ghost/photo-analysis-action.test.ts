import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  lookup: { data: null as unknown, error: null as null | { message: string } },
  update: { data: [{ id: "x" }] as unknown, error: null as null | { message: string } },
  updates: [] as unknown[],
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async () => ({ id: "emp-1", role: "worker" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => state.lookup,
    };
    return { from: () => chain };
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: () => ({
      update: (values: unknown) => {
        state.updates.push(values);
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: async () => state.update,
        };
        return chain;
      },
    }),
  })),
}));

vi.mock("@/lib/phash/store", () => ({
  hashPendingOrderPhotos: vi.fn(async () => ({ hashed: ["p1", "p2"], failed: ["p3"] })),
  findOrderPhotoDuplicates: vi.fn(async () => [
    {
      photoId: "p1",
      kind: "after",
      matchPhotoId: "q1",
      matchOrderId: "other",
      matchKind: "after",
      distance: 2,
    },
  ]),
}));

const { analyzeOrderPhotos, saveGhostScore } = await import("@/app/actions/photo-analysis");
const { requireRole } = await import("@/lib/auth/session");
const store = await import("@/lib/phash/store");

const orderId = "1c7d3c34-1d0e-4bb2-8d77-0d4f38a0d001";
const photoId = "7b0c6a52-8a4f-4a0e-9a53-5b8f3f1f2d10";

function photo(overrides: Record<string, unknown> = {}) {
  return {
    id: photoId,
    author_id: "emp-1",
    kind: "after",
    ghost_score: null,
    forced_reason: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  state.lookup = { data: null, error: null };
  state.update = { data: [{ id: photoId }], error: null };
  state.updates = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("analyzeOrderPhotos", () => {
  it("requires a worker or master and a valid id", async () => {
    expect(await analyzeOrderPhotos("nope")).toEqual({ ok: false, error: "validation" });
    expect(requireRole).toHaveBeenCalledWith("worker", "master");
  });

  it("refuses orders the caller cannot see", async () => {
    expect(await analyzeOrderPhotos(orderId)).toEqual({ ok: false, error: "not_found" });
    expect(store.hashPendingOrderPhotos).not.toHaveBeenCalled();
  });

  it("hashes pending photos and returns duplicates", async () => {
    state.lookup = { data: { id: orderId }, error: null };
    const result = await analyzeOrderPhotos(orderId);
    expect(result).toMatchObject({ ok: true, data: { hashed: 2, failed: 1 } });
    expect(result.ok && result.data.duplicates[0]?.matchPhotoId).toBe("q1");
  });

  it("reports storage failures as unavailable", async () => {
    state.lookup = { data: { id: orderId }, error: null };
    vi.mocked(store.hashPendingOrderPhotos).mockRejectedValueOnce(new Error("boom"));
    expect(await analyzeOrderPhotos(orderId)).toEqual({ ok: false, error: "unavailable" });
    state.lookup = { data: null, error: { message: "db down" } };
    expect(await analyzeOrderPhotos(orderId)).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("saveGhostScore", () => {
  it("validates the score and the reason", async () => {
    expect(await saveGhostScore(photoId, 1.4)).toMatchObject({ ok: false, error: "validation" });
    expect(await saveGhostScore(photoId, null, "  ")).toMatchObject({
      ok: false,
      error: "validation",
    });
  });

  it("stores a rounded score for the author's fresh after photo", async () => {
    state.lookup = { data: photo(), error: null };
    expect(await saveGhostScore(photoId, 0.87654)).toEqual({
      ok: true,
      data: { photoId, ghostScore: 0.877 },
    });
    expect(state.updates).toEqual([{ ghost_score: 0.877, forced_reason: null }]);
  });

  it("stores a null score with the fallback reason", async () => {
    state.lookup = { data: photo(), error: null };
    expect(await saveGhostScore(photoId, null, "Камера недоступна")).toMatchObject({ ok: true });
    expect(state.updates).toEqual([{ ghost_score: null, forced_reason: "Камера недоступна" }]);
  });

  it("refuses photos of other authors, other kinds or already scored ones", async () => {
    for (const overrides of [
      { author_id: "emp-2" },
      { kind: "before" },
      { ghost_score: 0.9 },
      { forced_reason: "Плохое освещение" },
      { created_at: "2020-01-01T00:00:00Z" },
    ]) {
      state.lookup = { data: photo(overrides), error: null };
      expect(await saveGhostScore(photoId, 0.9)).toEqual({ ok: false, error: "forbidden" });
    }
    expect(state.updates).toEqual([]);
  });

  it("handles missing photos, lost races and database errors", async () => {
    expect(await saveGhostScore(photoId, 0.9)).toEqual({ ok: false, error: "not_found" });
    state.lookup = { data: photo(), error: null };
    state.update = { data: [], error: null };
    expect(await saveGhostScore(photoId, 0.9)).toEqual({ ok: false, error: "forbidden" });
    state.update = { data: null, error: { message: "denied" } };
    expect(await saveGhostScore(photoId, 0.9)).toEqual({ ok: false, error: "unavailable" });
    state.lookup = { data: null, error: { message: "db down" } };
    expect(await saveGhostScore(photoId, 0.9)).toEqual({ ok: false, error: "unavailable" });
  });
});
