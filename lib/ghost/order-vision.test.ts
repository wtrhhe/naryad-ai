import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { AiJsonRequest, AiProvider } from "@/lib/ai/types";
import { disabledProvider } from "@/lib/ai/provider";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: vi.fn() }));

const { assessOrderPhotoVision, loadVisionImage, VISION_IMAGE_SIDE } =
  await import("@/lib/ghost/order-vision");
type Client = Parameters<typeof loadVisionImage>[0];

const orderId = "1c7d3c34-1d0e-4bb2-8d77-0d4f38a0d001";

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#808080" } })
    .jpeg()
    .toBuffer();
}

function fakeClient(tables: Record<string, unknown>, files: Record<string, Buffer>) {
  const builder = (data: unknown) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve),
    };
    return chain;
  };
  const downloads: string[] = [];
  const client = {
    from: (table: string) => builder(tables[table] ?? null),
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloads.push(path);
          const file = files[path];
          return file
            ? { data: new Blob([new Uint8Array(file)]), error: null }
            : { data: null, error: { message: "missing" } };
        },
      }),
    },
  };
  return { client: client as unknown as Client, downloads };
}

function provider() {
  const json = vi.fn(async (request: AiJsonRequest<unknown>) => {
    void request;
    return {
      ok: true as const,
      value: {
        problem_fixed: true,
        same_equipment: true,
        quality: 5,
        issues: [],
        explanation: "ok",
        confidence: 0.7,
      },
      model: "m",
      cached: false,
    };
  });
  const instance: AiProvider = {
    name: "mock",
    enabled: true,
    json: json as AiProvider["json"],
    text: vi.fn(),
    tools: vi.fn(),
  };
  return { instance, json };
}

describe("loadVisionImage", () => {
  it("downsizes photos to the vision limit as JPEG", async () => {
    const { client } = fakeClient({}, { "a.jpg": await jpeg(2400, 1800) });
    const image = await loadVisionImage(client, "a.jpg");
    expect(image?.mediaType).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(image?.base64 ?? "", "base64")).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(VISION_IMAGE_SIDE);
  });

  it("returns null for missing or broken files", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = fakeClient({}, { "bad.jpg": Buffer.from("nope") });
    expect(await loadVisionImage(client, "missing.jpg")).toBeNull();
    expect(await loadVisionImage(client, "bad.jpg")).toBeNull();
  });
});

describe("assessOrderPhotoVision", () => {
  const photos = [
    { id: "p1", kind: "before", storage_path: "o/before/1.jpg" },
    { id: "p2", kind: "before", storage_path: "o/before/2.jpg" },
    { id: "p3", kind: "before", storage_path: "o/before/3.jpg" },
    { id: "p4", kind: "after", storage_path: "o/after/4.jpg" },
  ];
  const order = {
    id: orderId,
    description: "Течь сальника",
    work_performed: "Замена уплотнения",
    equipment: { name: "Насос Н-4" },
  };

  it("does nothing while the provider is disabled", async () => {
    const { client, downloads } = fakeClient({ work_orders: order, photos }, {});
    expect(
      await assessOrderPhotoVision(orderId, { client, provider: disabledProvider }),
    ).toBeNull();
    expect(downloads).toEqual([]);
  });

  it("sends the first before photos and the latest after photos", async () => {
    const file = await jpeg(400, 300);
    const files = Object.fromEntries(photos.map((photo) => [photo.storage_path, file]));
    const { client, downloads } = fakeClient(
      { work_orders: order, photos, settings: { value: 0.8 } },
      files,
    );
    const { instance, json } = provider();
    const result = await assessOrderPhotoVision(orderId, { client, provider: instance });
    expect(downloads.sort()).toEqual(["o/after/4.jpg", "o/before/1.jpg", "o/before/2.jpg"]);
    expect(result).toMatchObject({ status: "needs_master_review", reason: "low_confidence" });
    const request = json.mock.calls[0]?.[0];
    expect(request?.images).toHaveLength(3);
    expect(request?.cacheKey).toBe("photo_vision:p1,p2,p4");
    expect(request?.prompt).toContain("Насос Н-4");
  });

  it("skips orders without an after photo or unknown orders", async () => {
    const { instance } = provider();
    const noAfter = fakeClient({ work_orders: order, photos: photos.slice(0, 1) }, {});
    expect(
      await assessOrderPhotoVision(orderId, { client: noAfter.client, provider: instance }),
    ).toBeNull();
    const unknown = fakeClient({ work_orders: null, photos: [] }, {});
    expect(
      await assessOrderPhotoVision(orderId, { client: unknown.client, provider: instance }),
    ).toBeNull();
  });
});
