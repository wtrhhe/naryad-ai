import { describe, expect, it } from "vitest";
import {
  alignmentScore,
  boxBlur,
  edgeMap,
  grayImage,
  normalizeEdges,
  normalizedCrossCorrelation,
  rgbaToGray,
  sobelMagnitude,
  weightedSsim,
  type GrayImage,
} from "@/lib/ghost/alignment";
import { addNoise, renderScene, toRgba } from "@/lib/phash/test-images";

const width = 128;
const height = 96;

function scene(seed: number, options: Parameters<typeof renderScene>[3] = {}): GrayImage {
  return grayImage(
    width,
    height,
    renderScene(width, height, seed, options).map((value) => value / 255),
  );
}

function stripes(): GrayImage {
  const image = grayImage(16, 16);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) image.data[y * 16 + x] = x < 8 ? 0 : 1;
  }
  return image;
}

describe("primitives", () => {
  it("validates dimensions", () => {
    expect(() => grayImage(0, 4)).toThrow(RangeError);
    expect(() => grayImage(2, 2, [1, 2, 3])).toThrow(RangeError);
    expect(() => rgbaToGray(new Uint8ClampedArray(8), 2, 2)).toThrow(RangeError);
  });

  it("converts RGBA to luminance in 0..1", () => {
    const image = rgbaToGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(image.data[0]).toBeCloseTo(1, 5);
    expect(image.data[1]).toBe(0);
  });

  it("keeps a flat image flat when blurring", () => {
    const flat = grayImage(10, 7, new Float32Array(70).fill(0.4));
    boxBlur(flat, 3).data.forEach((value) => expect(value).toBeCloseTo(0.4, 5));
    expect(boxBlur(flat, 0).data).toEqual(flat.data);
  });

  it("finds a vertical edge with Sobel", () => {
    const magnitude = sobelMagnitude(stripes());
    expect(magnitude.data[4 * 16 + 2]).toBe(0);
    expect(magnitude.data[4 * 16 + 7]).toBeGreaterThan(3);
    expect(magnitude.data[4 * 16 + 8]).toBeGreaterThan(3);
  });

  it("normalizes edges to 0..1 and leaves an empty map empty", () => {
    const normalized = normalizeEdges(sobelMagnitude(stripes()));
    expect(Math.max(...normalized.data)).toBe(1);
    expect(Math.min(...normalized.data)).toBe(0);
    expect(Math.max(...normalizeEdges(grayImage(4, 4)).data)).toBe(0);
  });
});

describe("similarity measures", () => {
  it("correlates identical maps perfectly and inverted maps negatively", () => {
    const edges = edgeMap(scene(11));
    const inverted = grayImage(
      width,
      height,
      edges.data.map((value) => 1 - value),
    );
    expect(normalizedCrossCorrelation(edges, edges)).toBeCloseTo(1, 5);
    expect(normalizedCrossCorrelation(edges, inverted)).toBeCloseTo(-1, 5);
    expect(normalizedCrossCorrelation(grayImage(4, 4), grayImage(4, 4))).toBe(0);
  });

  it("gives SSIM 1 for identical maps and 0 when there are no edges at all", () => {
    const edges = edgeMap(scene(11));
    expect(weightedSsim(edges, edges)).toBeCloseTo(1, 5);
    expect(weightedSsim(grayImage(32, 32), grayImage(32, 32))).toBe(0);
  });

  it("rejects images of different sizes", () => {
    expect(() => normalizedCrossCorrelation(grayImage(4, 4), grayImage(5, 4))).toThrow(RangeError);
    expect(() => weightedSsim(grayImage(4, 4), grayImage(4, 5))).toThrow(RangeError);
  });
});

describe("alignmentScore", () => {
  it("is about 1 for the same image", () => {
    expect(alignmentScore(scene(11), scene(11))).toBeGreaterThan(0.99);
  });

  it("tolerates lighting changes and sensor noise", () => {
    const relit = grayImage(
      width,
      height,
      addNoise(renderScene(width, height, 11, { brightness: 25, contrast: 0.8 }), 10, 9).map(
        (value) => value / 255,
      ),
    );
    expect(alignmentScore(scene(11), relit)).toBeGreaterThan(0.9);
  });

  it("drops as the frame shifts away", () => {
    [11, 3, 42].forEach((seed) => {
      const reference = scene(seed);
      const scores = [2, 6, 12].map((shift) =>
        alignmentScore(reference, scene(seed, { shiftX: shift, shiftY: shift / 2 })),
      );
      expect(scores[0]).toBeGreaterThan(0.8);
      expect(scores[0]).toBeGreaterThan(scores[1] ?? 1);
      expect(scores[1]).toBeGreaterThan(scores[2] ?? 1);
      expect(scores[2]).toBeLessThan(0.45);
    });
  });

  it("is low for unrelated scenes", () => {
    [5, 77, 91].forEach((seed) => expect(alignmentScore(scene(11), scene(seed))).toBeLessThan(0.2));
  });

  it("stays within 0..1", () => {
    const value = alignmentScore(
      scene(3),
      rgbaToGray(toRgba(new Float32Array(width * height)), width, height),
    );
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});
