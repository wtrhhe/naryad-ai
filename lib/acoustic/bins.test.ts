import { describe, expect, it } from "vitest";
import {
  bandPower,
  binSpectrum,
  dbToPower,
  DB_REFERENCE_POWER,
  logBinCenters,
  logBins,
  powerToDb,
  SPECTRUM_BIN_COUNT,
} from "@/lib/acoustic/bins";
import type { PowerSpectralDensity } from "@/lib/acoustic/welch";
import { welch } from "@/lib/acoustic/welch";
import { synthesize } from "@/lib/acoustic/synth";
import { synthesizeMeasurement } from "@/scripts/seed/acoustic-signal";
import { createRng } from "@/scripts/seed/random";

const seedBearing = {
  rpm: 1480,
  rollingElements: 8,
  ballDiameterMm: 22.225,
  pitchDiameterMm: 96.5,
  contactAngleDeg: 0,
};

function flatPsd(density: number, resolution: number, lines: number): PowerSpectralDensity {
  return {
    sampleRate: resolution * 2 * (lines - 1),
    segmentSize: 2 * (lines - 1),
    segmentCount: 1,
    resolution,
    density: new Float64Array(lines).fill(density),
  };
}

describe("log bin layout", () => {
  it("matches the seed generator bin layout exactly", () => {
    const seed = synthesizeMeasurement(seedBearing, 0.3, createRng(1)).spectrum.map((bin) => bin.f);
    const ours = logBinCenters().map((value) => Number(value.toFixed(2)));
    expect(ours).toEqual(seed);
    expect(ours.length).toBe(SPECTRUM_BIN_COUNT);
    expect(ours[0]).toBe(20);
    expect(ours.at(-1)).toBe(20_000);
  });

  it("builds contiguous geometric bands around each centre", () => {
    const bins = logBins();
    bins.slice(1).forEach((bin, index) => {
      expect(bin.low).toBeCloseTo((bins[index] as { high: number }).high, 9);
    });
    bins.forEach((bin) => expect(Math.sqrt(bin.low * bin.high)).toBeCloseTo(bin.center, 9));
  });

  it("supports a custom layout and rejects invalid ones", () => {
    expect(logBinCenters({ count: 3, minHz: 10, maxHz: 1_000 })).toEqual(
      [10, 100, 1_000].map((value) => expect.closeTo(value, 9)),
    );
    expect(() => logBinCenters({ count: 1 })).toThrow(RangeError);
    expect(() => logBinCenters({ minHz: 0 })).toThrow(RangeError);
    expect(() => logBinCenters({ minHz: 100, maxHz: 50 })).toThrow(RangeError);
  });
});

describe("decibel conversion", () => {
  it("uses a fixed power reference", () => {
    expect(powerToDb(DB_REFERENCE_POWER)).toBe(0);
    expect(powerToDb(DB_REFERENCE_POWER * 100)).toBeCloseTo(20, 12);
    expect(dbToPower(30)).toBeCloseTo(DB_REFERENCE_POWER * 1_000, 20);
    expect(powerToDb(dbToPower(47.3))).toBeCloseTo(47.3, 9);
  });

  it("floors zero power instead of returning minus infinity", () => {
    expect(Number.isFinite(powerToDb(0))).toBe(true);
    expect(powerToDb(0)).toBe(powerToDb(-1));
  });
});

describe("bandPower", () => {
  it("integrates a flat density over the band width", () => {
    const psd = flatPsd(2, 1, 1_001);
    expect(bandPower(psd, 100, 150)).toBeCloseTo(100, 9);
  });

  it("accounts for partial overlap with FFT lines wider than the band", () => {
    const psd = flatPsd(1, 10, 101);
    expect(bandPower(psd, 21, 23)).toBeCloseTo(2, 9);
  });

  it("clips the band at the Nyquist frequency and ignores empty bands", () => {
    const psd = flatPsd(1, 1, 101);
    expect(bandPower(psd, 90, 200)).toBeCloseTo(10, 9);
    expect(bandPower(psd, 150, 200)).toBe(0);
    expect(bandPower(psd, 50, 50)).toBe(0);
  });
});

describe("binSpectrum", () => {
  it("returns seed-shaped bins up to the Nyquist frequency", () => {
    const noise = synthesize({ sampleRate: 22_050, durationSeconds: 4, seed: 2, noiseRms: 0.05 });
    const spectrum = binSpectrum(welch(noise, 22_050));
    expect(spectrum.every((bin) => Object.keys(bin).sort().join() === "db,f")).toBe(true);
    expect(spectrum.at(-1)?.f).toBeLessThan(11_025);
    expect(spectrum.length).toBe(logBinCenters().filter((value) => value < 11_025).length);
  });

  it("rises about 10 dB per decade for white noise", () => {
    const noise = synthesize({ sampleRate: 48_000, durationSeconds: 6, seed: 3, noiseRms: 0.05 });
    const spectrum = binSpectrum(welch(noise, 48_000));
    const at = (frequency: number) =>
      spectrum.reduce((best, bin) =>
        Math.abs(Math.log(bin.f / frequency)) < Math.abs(Math.log(best.f / frequency)) ? bin : best,
      );
    expect(at(10_000).db - at(1_000).db).toBeCloseTo(10, 0);
  });

  it("puts a tone's power into the bin that contains it", () => {
    const rate = 48_000;
    const tone = Float64Array.from(
      { length: rate * 4 },
      (_, n) => 0.2 * Math.sin((2 * Math.PI * 1_000 * n) / rate),
    );
    const spectrum = binSpectrum(welch(tone, rate));
    const loudest = spectrum.reduce((best, bin) => (bin.db > best.db ? bin : best));
    expect(loudest.f).toBeCloseTo(1_000, -2);
    expect(loudest.db).toBeCloseTo(powerToDb(0.02), 0);
  });
});
