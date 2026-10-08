import { describe, expect, it } from "vitest";
import { hannWindow, windowPower } from "@/lib/acoustic/window";

describe("hannWindow", () => {
  it("is periodic: starts at zero and peaks at the middle", () => {
    const window = hannWindow(16);
    expect(window[0]).toBe(0);
    expect(window[8]).toBeCloseTo(1, 12);
    for (let index = 1; index < 16; index += 1) {
      expect(window[index]).toBeCloseTo(window[16 - index] as number, 12);
    }
  });

  it("has a coherent gain of one half and a power sum of 3N/8", () => {
    const size = 1024;
    const window = hannWindow(size);
    const sum = window.reduce((total, value) => total + value, 0);
    expect(sum).toBeCloseTo(size / 2, 9);
    expect(windowPower(window)).toBeCloseTo((3 * size) / 8, 9);
  });

  it("reuses cached windows", () => {
    expect(hannWindow(64)).toBe(hannWindow(64));
  });

  it("rejects invalid lengths", () => {
    expect(() => hannWindow(0)).toThrow(RangeError);
    expect(() => hannWindow(2.5)).toThrow(RangeError);
  });
});

describe("windowPower", () => {
  it("sums squared values", () => {
    expect(windowPower([1, 2, 3])).toBe(14);
    expect(windowPower([])).toBe(0);
  });
});
