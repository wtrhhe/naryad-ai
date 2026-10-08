import { describe, expect, it } from "vitest";
import {
  floorAt,
  levelAt,
  nearestBinIndex,
  overallLevel,
  prominenceAt,
} from "@/lib/acoustic/spectrum";
import { logBinCenters, powerToDb } from "@/lib/acoustic/bins";
import type { SpectrumBin } from "@/lib/acoustic/types";

const flat = (db: number): SpectrumBin[] =>
  logBinCenters().map((f) => ({ f: Number(f.toFixed(2)), db }));

function withLine(spectrum: SpectrumBin[], index: number, db: number): SpectrumBin[] {
  return spectrum.map((bin, position) => (position === index ? { ...bin, db } : bin));
}

describe("nearestBinIndex", () => {
  const spectrum = flat(30);

  it("finds the closest bin on a log scale", () => {
    expect(nearestBinIndex(spectrum, 20)).toBe(0);
    expect(nearestBinIndex(spectrum, 75.94)).toBe(12);
    expect(nearestBinIndex(spectrum, 20_000)).toBe(63);
  });

  it("returns -1 outside the covered range or for empty spectra", () => {
    expect(nearestBinIndex(spectrum, 10)).toBe(-1);
    expect(nearestBinIndex(spectrum, 30_000)).toBe(-1);
    expect(nearestBinIndex(spectrum, 0)).toBe(-1);
    expect(nearestBinIndex([], 100)).toBe(-1);
  });
});

describe("levels and prominence", () => {
  const spectrum = withLine(flat(30), 12, 55);

  it("reads the level of the containing bin", () => {
    expect(levelAt(spectrum, 75.94)).toBe(55);
    expect(levelAt(spectrum, 1_000)).toBe(30);
    expect(levelAt(spectrum, 5)).toBeNull();
  });

  it("estimates the local floor with a median that skips the guard bins", () => {
    expect(floorAt(spectrum, 12)).toBe(30);
    const tilted = spectrum.map((bin, index) => ({ ...bin, db: index }));
    expect(floorAt(tilted, 10)).toBe(10);
    expect(floorAt([{ f: 100, db: 1 }], 0)).toBeNaN();
  });

  it("measures how far a component rises above its neighbours", () => {
    const measured = prominenceAt(spectrum, 76);
    expect(measured).toMatchObject({ index: 12, levelDb: 55, floorDb: 30, prominenceDb: 25 });
    expect(prominenceAt(spectrum, 3)).toBeNull();
    expect(prominenceAt([{ f: 100, db: 40 }], 100)?.prominenceDb).toBe(0);
  });

  it("sums band powers into an overall level", () => {
    expect(overallLevel([])).toBeNull();
    expect(overallLevel([{ f: 100, db: 40 }])).toBeCloseTo(40, 9);
    expect(
      overallLevel([
        { f: 100, db: 40 },
        { f: 200, db: 40 },
      ]),
    ).toBeCloseTo(40 + 10 * Math.log10(2), 9);
    expect(overallLevel(flat(powerToDb(1e-6)))).toBeCloseTo(powerToDb(64e-6), 6);
  });
});
