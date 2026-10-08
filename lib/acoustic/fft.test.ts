import { describe, expect, it } from "vitest";
import {
  fft,
  inverseFft,
  isPowerOfTwo,
  nextPowerOfTwo,
  previousPowerOfTwo,
} from "@/lib/acoustic/fft";
import { createRandom } from "@/lib/acoustic/synth";

function naiveDft(input: readonly number[]): { re: number[]; im: number[] } {
  const size = input.length;
  const re: number[] = [];
  const im: number[] = [];
  for (let k = 0; k < size; k += 1) {
    let sumRe = 0;
    let sumIm = 0;
    for (let n = 0; n < size; n += 1) {
      const angle = (-2 * Math.PI * k * n) / size;
      sumRe += (input[n] as number) * Math.cos(angle);
      sumIm += (input[n] as number) * Math.sin(angle);
    }
    re.push(sumRe);
    im.push(sumIm);
  }
  return { re, im };
}

describe("power of two helpers", () => {
  it("recognises powers of two", () => {
    expect([1, 2, 4, 1024, 65536].every(isPowerOfTwo)).toBe(true);
    expect([0, -4, 3, 6, 1000, 2.5, Number.NaN].some(isPowerOfTwo)).toBe(false);
  });

  it("rounds up and down to powers of two", () => {
    expect(nextPowerOfTwo(1000)).toBe(1024);
    expect(nextPowerOfTwo(1024)).toBe(1024);
    expect(nextPowerOfTwo(0.5)).toBe(1);
    expect(nextPowerOfTwo(Number.POSITIVE_INFINITY)).toBe(1);
    expect(previousPowerOfTwo(1000)).toBe(512);
    expect(previousPowerOfTwo(1024)).toBe(1024);
    expect(previousPowerOfTwo(0.5)).toBe(0);
    expect(previousPowerOfTwo(Number.NaN)).toBe(0);
  });
});

describe("fft", () => {
  it("matches a direct DFT on random data", () => {
    const random = createRandom(11);
    const input = Array.from({ length: 64 }, () => random() * 2 - 1);
    const re = Float64Array.from(input);
    const im = new Float64Array(64);
    fft(re, im);
    const expected = naiveDft(input);
    expected.re.forEach((value, index) => expect(re[index]).toBeCloseTo(value, 9));
    expected.im.forEach((value, index) => expect(im[index]).toBeCloseTo(value, 9));
  });

  it("turns a unit impulse into a flat spectrum", () => {
    const re = new Float64Array(16);
    const im = new Float64Array(16);
    re[0] = 1;
    fft(re, im);
    expect(Array.from(re)).toEqual(Array.from({ length: 16 }, () => 1));
    expect(Array.from(im).every((value) => Math.abs(value) < 1e-12)).toBe(true);
  });

  it("puts a constant signal into the DC bin only", () => {
    const re = new Float64Array(32).fill(0.5);
    const im = new Float64Array(32);
    fft(re, im);
    expect(re[0]).toBeCloseTo(16, 12);
    for (let index = 1; index < 32; index += 1) {
      expect(Math.hypot(re[index] as number, im[index] as number)).toBeLessThan(1e-12);
    }
  });

  it("places a cosine on its bin and the mirrored bin with amplitude N/2", () => {
    const size = 128;
    const bin = 9;
    const re = Float64Array.from({ length: size }, (_, n) =>
      Math.cos((2 * Math.PI * bin * n) / size),
    );
    const im = new Float64Array(size);
    fft(re, im);
    const magnitude = (index: number) => Math.hypot(re[index] as number, im[index] as number);
    expect(magnitude(bin)).toBeCloseTo(size / 2, 9);
    expect(magnitude(size - bin)).toBeCloseTo(size / 2, 9);
    expect(magnitude(bin + 1)).toBeLessThan(1e-9);
  });

  it("satisfies Parseval's theorem", () => {
    const random = createRandom(5);
    const input = Array.from({ length: 256 }, () => random() - 0.5);
    const re = Float64Array.from(input);
    const im = new Float64Array(256);
    fft(re, im);
    const timeEnergy = input.reduce((sum, value) => sum + value * value, 0);
    let frequencyEnergy = 0;
    for (let index = 0; index < 256; index += 1) {
      frequencyEnergy += (re[index] as number) ** 2 + (im[index] as number) ** 2;
    }
    expect(frequencyEnergy / 256).toBeCloseTo(timeEnergy, 9);
  });

  it("round-trips through the inverse transform", () => {
    const random = createRandom(9);
    const input = Array.from({ length: 512 }, () => random() * 2 - 1);
    const imaginary = Array.from({ length: 512 }, () => random() * 2 - 1);
    const re = Float64Array.from(input);
    const im = Float64Array.from(imaginary);
    fft(re, im);
    inverseFft(re, im);
    input.forEach((value, index) => expect(re[index]).toBeCloseTo(value, 10));
    imaginary.forEach((value, index) => expect(im[index]).toBeCloseTo(value, 10));
  });

  it("handles a single sample", () => {
    const re = Float64Array.of(3);
    const im = Float64Array.of(-1);
    fft(re, im);
    expect(Array.from(re)).toEqual([3]);
    expect(Array.from(im)).toEqual([-1]);
  });

  it("rejects lengths that are not powers of two or that differ", () => {
    expect(() => fft(new Float64Array(12), new Float64Array(12))).toThrow(RangeError);
    expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow(RangeError);
  });
});
