import { describe, expect, it } from "vitest";
import {
  alignmentLevel,
  canShoot,
  nextAligned,
  roundScore,
  scorePercent,
  smoothScore,
} from "@/lib/ghost/indicator";
import { coverCrop, fitWithin, safeAspect, sizeForAspect } from "@/lib/ghost/geometry";
import {
  composeForcedReason,
  DEFAULT_MIN_ALIGNMENT,
  ghostScoreInputSchema,
  isWithinScoreWindow,
  parseMinAlignment,
} from "@/lib/ghost/settings";

const photoId = "7b0c6a52-8a4f-4a0e-9a53-5b8f3f1f2d10";

describe("indicator", () => {
  it("smooths scores with an exponential average", () => {
    expect(smoothScore(null, 0.5)).toBe(0.5);
    expect(smoothScore(0.5, 1, 0.5)).toBe(0.75);
  });

  it("uses hysteresis so the indicator does not flicker", () => {
    expect(nextAligned(false, 0.69, 0.7)).toBe(false);
    expect(nextAligned(false, 0.7, 0.7)).toBe(true);
    expect(nextAligned(true, 0.67, 0.7)).toBe(true);
    expect(nextAligned(true, 0.65, 0.7)).toBe(false);
    expect(nextAligned(true, null, 0.7)).toBe(false);
  });

  it("classifies the level for colouring", () => {
    expect(alignmentLevel(null, 0.7, false)).toBe("unknown");
    expect(alignmentLevel(0.3, 0.7, false)).toBe("low");
    expect(alignmentLevel(0.55, 0.7, false)).toBe("near");
    expect(alignmentLevel(0.68, 0.7, true)).toBe("aligned");
  });

  it("formats percent and rounds stored scores", () => {
    expect(scorePercent(null)).toBeNull();
    expect(scorePercent(0.876)).toBe(88);
    expect(scorePercent(1.2)).toBe(100);
    expect(roundScore(0.87654)).toBe(0.877);
    expect(roundScore(-1)).toBe(0);
  });

  it("enables the shutter only when aligned, forced or without a reference", () => {
    const base = { hasReference: true, aligned: false, forcedReason: null, busy: false };
    expect(canShoot(base)).toBe(false);
    expect(canShoot({ ...base, aligned: true })).toBe(true);
    expect(canShoot({ ...base, forcedReason: "  " })).toBe(false);
    expect(canShoot({ ...base, forcedReason: "Плохое освещение" })).toBe(true);
    expect(canShoot({ ...base, hasReference: false })).toBe(true);
    expect(canShoot({ ...base, aligned: true, busy: true })).toBe(false);
  });
});

describe("geometry", () => {
  it("crops the centre to the requested aspect", () => {
    expect(coverCrop(1600, 900, 1)).toEqual({ sx: 350, sy: 0, sw: 900, sh: 900 });
    expect(coverCrop(900, 1600, 1)).toEqual({ sx: 0, sy: 350, sw: 900, sh: 900 });
    expect(coverCrop(1200, 900, 4 / 3)).toEqual({ sx: 0, sy: 0, sw: 1200, sh: 900 });
  });

  it("sizes the analysis raster by its long side", () => {
    expect(sizeForAspect(4 / 3, 128)).toEqual({ width: 128, height: 96 });
    expect(sizeForAspect(3 / 4, 128)).toEqual({ width: 96, height: 128 });
    expect(sizeForAspect(Number.NaN, 128)).toEqual({ width: 96, height: 128 });
  });

  it("fits a capture within the maximum side", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(safeAspect(0, 10, 2)).toBe(2);
  });
});

describe("settings", () => {
  it("parses the alignment threshold with sane bounds", () => {
    expect(parseMinAlignment(0.75)).toBe(0.75);
    expect(parseMinAlignment("0.8")).toBe(0.8);
    expect(parseMinAlignment(5)).toBe(0.95);
    expect(parseMinAlignment(0)).toBe(0.3);
    expect(parseMinAlignment(null)).toBe(DEFAULT_MIN_ALIGNMENT);
    expect(parseMinAlignment("abc")).toBe(DEFAULT_MIN_ALIGNMENT);
  });

  it("composes a forced reason from a preset and details", () => {
    expect(composeForcedReason("Плохое освещение", "  ")).toBe("Плохое освещение");
    expect(composeForcedReason("Другое", "кожух мешает")).toBe("Другое: кожух мешает");
    expect(composeForcedReason("A", "b".repeat(600))).toHaveLength(500);
  });

  it("requires a reason when there is no score", () => {
    expect(
      ghostScoreInputSchema.safeParse({ photoId, score: 0.8, forcedReason: null }).success,
    ).toBe(true);
    expect(
      ghostScoreInputSchema.safeParse({ photoId, score: null, forcedReason: null }).success,
    ).toBe(false);
    expect(
      ghostScoreInputSchema.safeParse({ photoId, score: null, forcedReason: "Нет камеры" }).success,
    ).toBe(true);
    expect(
      ghostScoreInputSchema.safeParse({ photoId, score: 1.5, forcedReason: null }).success,
    ).toBe(false);
    expect(
      ghostScoreInputSchema.safeParse({ photoId: "x", score: 0.5, forcedReason: null }).success,
    ).toBe(false);
  });

  it("accepts scores only shortly after the photo was stored", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(isWithinScoreWindow("2026-10-12T09:45:00Z", now)).toBe(true);
    expect(isWithinScoreWindow("2026-10-12T09:00:00Z", now)).toBe(false);
    expect(isWithinScoreWindow("2026-10-12T10:30:00Z", now)).toBe(false);
    expect(isWithinScoreWindow("garbage", now)).toBe(false);
  });
});
