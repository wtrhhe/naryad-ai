import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { hammingDistance, phashFromGrayscale, PHASH_SIZE } from "@/lib/phash/phash";
import { renderScene } from "@/lib/phash/test-images";

vi.mock("server-only", () => ({}));

const { computeImagePhash, decodeGrayscale } = await import("@/lib/phash/server");

const width = 320;
const height = 240;

function rgbScene(seed: number, options?: Parameters<typeof renderScene>[3]): Buffer {
  const gray = renderScene(width, height, seed, options);
  const rgb = Buffer.alloc(width * height * 3);
  gray.forEach((value, index) => {
    rgb[index * 3] = Math.round(value);
    rgb[index * 3 + 1] = Math.round(value * 0.9);
    rgb[index * 3 + 2] = Math.round(value * 0.8);
  });
  return rgb;
}

function encode(raw: Buffer, format: "png" | "jpeg", quality = 90): Promise<Buffer> {
  const image = sharp(raw, { raw: { width, height, channels: 3 } });
  return format === "png" ? image.png().toBuffer() : image.jpeg({ quality }).toBuffer();
}

describe("decodeGrayscale", () => {
  it("resizes to the requested raster", async () => {
    const raster = await decodeGrayscale(await encode(rgbScene(3), "png"), 32, 24);
    expect(raster.width).toBe(32);
    expect(raster.height).toBe(24);
    expect(raster.data).toHaveLength(32 * 24);
    expect(Math.max(...raster.data)).toBeGreaterThan(0);
  });

  it("accepts array buffers and typed arrays", async () => {
    const png = await encode(rgbScene(3), "png");
    const fromArrayBuffer = await decodeGrayscale(new Uint8Array(png).buffer, 8, 8);
    const fromView = await decodeGrayscale(new Uint8Array(png), 8, 8);
    expect(Array.from(fromArrayBuffer.data)).toEqual(Array.from(fromView.data));
  });
});

describe("computeImagePhash", () => {
  it("is stable for the same file", async () => {
    const png = await encode(rgbScene(5), "png");
    expect(await computeImagePhash(png)).toBe(await computeImagePhash(png));
  });

  it("agrees with the pure hash of a 32x32 grayscale render", async () => {
    const png = await encode(rgbScene(5), "png");
    const reference = phashFromGrayscale(renderScene(PHASH_SIZE, PHASH_SIZE, 5));
    expect(hammingDistance(await computeImagePhash(png), reference)).toBeLessThanOrEqual(8);
  });

  it("survives JPEG recompression and brightening", async () => {
    const original = await computeImagePhash(await encode(rgbScene(5), "png"));
    const jpeg = await computeImagePhash(await encode(rgbScene(5), "jpeg", 55));
    const brighter = await computeImagePhash(
      await encode(rgbScene(5, { brightness: 15, contrast: 1.05 }), "jpeg"),
    );
    expect(hammingDistance(original, jpeg)).toBeLessThanOrEqual(4);
    expect(hammingDistance(original, brighter)).toBeLessThanOrEqual(6);
  });

  it("separates different scenes", async () => {
    const first = await computeImagePhash(await encode(rgbScene(5), "png"));
    const second = await computeImagePhash(await encode(rgbScene(77), "png"));
    expect(hammingDistance(first, second)).toBeGreaterThan(14);
  });

  it("rejects data that is not an image", async () => {
    await expect(computeImagePhash(Buffer.from("not an image"))).rejects.toThrow();
  });
});
