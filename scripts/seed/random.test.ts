import { describe, expect, it } from "vitest";
import { createRng } from "./random";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const first = createRng(42);
    const second = createRng(42);
    const sequenceOf = (rng: ReturnType<typeof createRng>) =>
      Array.from({ length: 20 }, () => rng.next());
    expect(sequenceOf(first)).toEqual(sequenceOf(second));
  });

  it("produces different sequences for different seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("keeps next() inside [0, 1)", () => {
    const rng = createRng(7);
    for (let index = 0; index < 5000; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("returns integers within inclusive bounds and reaches both ends", () => {
    const rng = createRng(11);
    const values = Array.from({ length: 2000 }, () => rng.int(3, 6));
    expect(Math.min(...values)).toBe(3);
    expect(Math.max(...values)).toBe(6);
    expect(values.every(Number.isInteger)).toBe(true);
  });

  it("returns floats within bounds", () => {
    const rng = createRng(12);
    const values = Array.from({ length: 1000 }, () => rng.float(-2, 5));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...values)).toBeLessThan(5);
  });

  it("picks only listed items and throws for an empty list", () => {
    const rng = createRng(3);
    const items = ["a", "b", "c"] as const;
    for (let index = 0; index < 100; index += 1) {
      expect(items).toContain(rng.pick(items));
    }
    expect(() => rng.pick([])).toThrow();
  });

  it("follows weights in weighted picks", () => {
    const rng = createRng(5);
    const counts = { heavy: 0, light: 0, never: 0 };
    const entries: Array<readonly [keyof typeof counts, number]> = [
      ["heavy", 3],
      ["light", 1],
      ["never", 0],
    ];
    for (let index = 0; index < 6000; index += 1) {
      counts[rng.weighted(entries)] += 1;
    }
    expect(counts.never).toBe(0);
    expect(counts.heavy / counts.light).toBeGreaterThan(2.5);
    expect(counts.heavy / counts.light).toBeLessThan(3.6);
  });

  it("throws when all weights are zero", () => {
    expect(() => createRng(1).weighted([["a", 0]])).toThrow();
  });

  it("generates a normal distribution around the mean", () => {
    const rng = createRng(21);
    const values = Array.from({ length: 8000 }, () => rng.normal(10, 2));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    expect(mean).toBeGreaterThan(9.9);
    expect(mean).toBeLessThan(10.1);
    expect(Math.sqrt(variance)).toBeGreaterThan(1.9);
    expect(Math.sqrt(variance)).toBeLessThan(2.1);
  });

  it("honours chance extremes and rough probability", () => {
    const rng = createRng(9);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    const hits = Array.from({ length: 5000 }, () => rng.chance(0.3)).filter(Boolean).length;
    expect(hits / 5000).toBeGreaterThan(0.27);
    expect(hits / 5000).toBeLessThan(0.33);
  });

  it("shuffles into a new array with the same members", () => {
    const rng = createRng(4);
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(original);
    expect(shuffled).not.toBe(original);
    expect([...shuffled].sort()).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("rounds stochastically around the fractional part", () => {
    const rng = createRng(6);
    const values = Array.from({ length: 4000 }, () => rng.stochasticRound(2.3));
    expect(new Set(values)).toEqual(new Set([2, 3]));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(2.25);
    expect(mean).toBeLessThan(2.35);
  });

  it("generates valid v4-shaped uuids that are unique", () => {
    const rng = createRng(8);
    const uuids = Array.from({ length: 500 }, () => rng.uuid());
    expect(new Set(uuids).size).toBe(500);
    for (const uuid of uuids) {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("generates lowercase hex strings of the requested length", () => {
    expect(createRng(2).hex(16)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("forks independent deterministic streams without consuming the parent", () => {
    const parent = createRng(100);
    const parentBefore = createRng(100).next();
    const forkA = parent.fork("alpha");
    const forkB = parent.fork("beta");
    expect(forkA.next()).not.toBe(forkB.next());
    expect(parent.next()).toBe(parentBefore);
    expect(createRng(100).fork("alpha").next()).toBe(createRng(100).fork("alpha").next());
  });
});
