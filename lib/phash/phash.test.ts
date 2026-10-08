import { describe, expect, it } from "vitest";
import {
  dctLowFrequencies,
  hammingDistance,
  isPhash,
  PHASH_SIZE,
  phashFromGrayscale,
} from "@/lib/phash/phash";
import { DUPLICATE_MAX_DISTANCE, findDuplicates, type HashedPhoto } from "@/lib/phash/duplicates";
import { addNoise, renderScene } from "@/lib/phash/test-images";

const size = PHASH_SIZE;

describe("dctLowFrequencies", () => {
  it("keeps only the DC term for a flat image", () => {
    const coefficients = dctLowFrequencies(new Float32Array(size * size).fill(100));
    expect(coefficients[0]).toBeCloseTo(100 * size * size, 6);
    coefficients.slice(1).forEach((value) => expect(Math.abs(value)).toBeLessThan(1e-6));
  });

  it("rejects a raster of the wrong size", () => {
    expect(() => dctLowFrequencies(new Float32Array(10))).toThrow(RangeError);
    expect(() => dctLowFrequencies(new Float32Array(16), 4, 8)).toThrow(RangeError);
  });
});

describe("phashFromGrayscale", () => {
  const scene = renderScene(size, size, 11);

  it("produces 16 lowercase hex characters", () => {
    expect(phashFromGrayscale(scene)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("gives distance 0 for identical images", () => {
    const copy = Float32Array.from(scene);
    expect(hammingDistance(phashFromGrayscale(scene), phashFromGrayscale(copy))).toBe(0);
  });

  it("gives a small distance for a slightly brightened and noisy copy", () => {
    const brightened = renderScene(size, size, 11, { brightness: 18, contrast: 1.08 });
    const noisy = addNoise(scene, 6, 5);
    const hash = phashFromGrayscale(scene);
    expect(hammingDistance(hash, phashFromGrayscale(brightened))).toBeLessThanOrEqual(
      DUPLICATE_MAX_DISTANCE,
    );
    expect(hammingDistance(hash, phashFromGrayscale(noisy))).toBeLessThanOrEqual(6);
  });

  it("gives a large distance for different images", () => {
    const hash = phashFromGrayscale(scene);
    const distances = [23, 37, 58, 91].map((seed) =>
      hammingDistance(hash, phashFromGrayscale(renderScene(size, size, seed))),
    );
    distances.forEach((distance) => expect(distance).toBeGreaterThan(20));
  });
});

describe("hammingDistance", () => {
  it("counts differing bits", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("0000000000000001", "0000000000000000")).toBe(1);
    expect(hammingDistance("8000000000000003", "0000000000000000")).toBe(3);
  });

  it("rejects malformed hashes", () => {
    expect(() => hammingDistance("XYZ", "0000000000000000")).toThrow(RangeError);
    expect(() => hammingDistance("FFFFFFFFFFFFFFFF", "0000000000000000")).toThrow(RangeError);
    expect(isPhash("0123456789abcdef")).toBe(true);
    expect(isPhash(null)).toBe(false);
  });
});

describe("findDuplicates", () => {
  const own: HashedPhoto[] = [
    { id: "a1", workOrderId: "order-a", kind: "after", phash: "0000000000000000" },
    { id: "a2", workOrderId: "order-a", kind: "before", phash: "ffffffffffffffff" },
  ];

  it("matches photos of other orders within the distance", () => {
    const others: HashedPhoto[] = [
      { id: "b1", workOrderId: "order-b", kind: "after", phash: "000000000000003f" },
      { id: "b2", workOrderId: "order-b", kind: "before", phash: "0000000000000007" },
      { id: "c1", workOrderId: "order-c", kind: "after", phash: "00000000000000ff" },
      { id: "a3", workOrderId: "order-a", kind: "after", phash: "0000000000000000" },
    ];
    expect(findDuplicates(own, others)).toEqual([
      {
        photoId: "a1",
        kind: "after",
        matchPhotoId: "b2",
        matchOrderId: "order-b",
        matchKind: "before",
        distance: 3,
      },
      {
        photoId: "a1",
        kind: "after",
        matchPhotoId: "b1",
        matchOrderId: "order-b",
        matchKind: "after",
        distance: 6,
      },
    ]);
  });

  it("honours a custom distance and skips malformed hashes", () => {
    const others: HashedPhoto[] = [
      { id: "b1", workOrderId: "order-b", kind: "after", phash: "000000000000003f" },
      { id: "b2", workOrderId: "order-b", kind: "after", phash: "bad" },
    ];
    expect(findDuplicates(own, others, 2)).toEqual([]);
    expect(findDuplicates([], others)).toEqual([]);
  });
});
