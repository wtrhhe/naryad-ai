import { describe, expect, it } from "vitest";
import { createAlignmentEngine } from "@/lib/ghost/engine";
import { parseCssColor, renderContours } from "@/lib/ghost/contours";
import { renderScene, toRgba } from "@/lib/phash/test-images";

const width = 96;
const height = 72;

function frame(seed: number, shift = 0): Uint8ClampedArray<ArrayBuffer> {
  return toRgba(renderScene(width, height, seed, { shiftX: shift }));
}

describe("alignment engine", () => {
  it("returns a null score until a reference is set", () => {
    const engine = createAlignmentEngine();
    expect(engine.handle({ type: "frame", id: 1, width, height, rgba: frame(1) })).toEqual({
      response: { type: "score", id: 1, score: null },
      transfer: [],
    });
  });

  it("scores frames against the reference", () => {
    const engine = createAlignmentEngine();
    expect(engine.handle({ type: "reference", width, height, rgba: frame(1) })?.response).toEqual({
      type: "reference",
      width,
      height,
    });
    const same = engine.handle({ type: "frame", id: 2, width, height, rgba: frame(1) });
    const other = engine.handle({ type: "frame", id: 3, width, height, rgba: frame(9) });
    expect(same?.response).toMatchObject({ type: "score", id: 2 });
    expect(same?.response.type === "score" && same.response.score).toBeGreaterThan(0.99);
    expect(other?.response.type === "score" && other.response.score).toBeLessThan(0.3);
  });

  it("reports mismatched frames as errors and forgets the reference on clear", () => {
    const engine = createAlignmentEngine();
    engine.handle({ type: "reference", width, height, rgba: frame(1) });
    expect(
      engine.handle({ type: "frame", id: 4, width: 10, height: 10, rgba: frame(1) })?.response,
    ).toMatchObject({ type: "error", id: 4 });
    expect(engine.handle({ type: "clear" })).toBeNull();
    expect(
      engine.handle({ type: "frame", id: 5, width, height, rgba: frame(1) })?.response,
    ).toEqual({ type: "score", id: 5, score: null });
  });

  it("rejects a malformed reference", () => {
    const engine = createAlignmentEngine();
    expect(
      engine.handle({ type: "reference", width, height, rgba: new Uint8ClampedArray(4) })?.response,
    ).toMatchObject({ type: "error", id: null });
  });

  it("renders a transferable contour overlay", () => {
    const engine = createAlignmentEngine();
    const reply = engine.handle({
      type: "contours",
      id: 6,
      width,
      height,
      rgba: frame(1),
      color: [0, 200, 255],
    });
    expect(reply?.response.type).toBe("contours");
    expect(reply?.transfer).toHaveLength(1);
    const bad = engine.handle({
      type: "contours",
      id: 7,
      width,
      height,
      rgba: new Uint8ClampedArray(3),
    });
    expect(bad?.response).toMatchObject({ type: "error", id: 7 });
  });
});

describe("contours", () => {
  it("paints edges opaque and flat areas transparent", () => {
    const rgba = renderContours(frame(1), width, height, [1, 2, 3]);
    const alphas = Array.from({ length: width * height }, (_, index) => rgba[index * 4 + 3] ?? 0);
    expect(rgba[0]).toBe(1);
    expect(rgba[1]).toBe(2);
    expect(rgba[2]).toBe(3);
    expect(Math.max(...alphas)).toBe(255);
    expect(alphas.filter((alpha) => alpha === 0).length).toBeGreaterThan(alphas.length / 2);
  });

  it("parses CSS colors", () => {
    expect(parseCssColor("#f5a524")).toEqual([245, 165, 36]);
    expect(parseCssColor(" #fff ")).toEqual([255, 255, 255]);
    expect(parseCssColor("rgb(10, 20, 300)")).toEqual([10, 20, 255]);
    expect(parseCssColor("oklch(0.7 0.1 50)", [1, 1, 1])).toEqual([1, 1, 1]);
  });
});
