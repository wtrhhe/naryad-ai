import { fft, isPowerOfTwo, nextPowerOfTwo } from "@/lib/acoustic/fft";
import { hannWindow } from "@/lib/acoustic/window";
import { SPECTRUM_MAX_HZ, SPECTRUM_MIN_HZ } from "@/lib/acoustic/bins";

export interface KurtosisOptions {
  segmentSize?: number;
  minHz?: number;
  maxHz?: number;
}

export interface KurtosisProfile {
  resolution: number;
  segmentCount: number;
  values: Float64Array;
}

export const GAUSSIAN_KURTOSIS = 3;
export const KURTOSIS_WINDOW_SECONDS = 0.004;
const MIN_SEGMENT = 64;
const MAX_SEGMENT = 1024;
const MIN_SEGMENTS = 16;
const HOP_DIVISOR = 4;
const NYQUIST_GUARD = 0.95;

export function kurtosisSegmentSize(sampleRate: number): number {
  return Math.min(
    MAX_SEGMENT,
    Math.max(MIN_SEGMENT, nextPowerOfTwo(sampleRate * KURTOSIS_WINDOW_SECONDS)),
  );
}

export function spectralKurtosisProfile(
  signal: ArrayLike<number>,
  sampleRate: number,
  segmentSize = kurtosisSegmentSize(sampleRate),
): KurtosisProfile {
  if (!isPowerOfTwo(segmentSize))
    throw new RangeError("kurtosis: segment size must be a power of two");
  const hop = segmentSize / HOP_DIVISOR;
  const segmentCount =
    signal.length >= segmentSize ? Math.floor((signal.length - segmentSize) / hop) + 1 : 0;
  if (segmentCount < MIN_SEGMENTS) throw new RangeError("kurtosis: signal is too short");
  const window = hannWindow(segmentSize);
  const re = new Float64Array(segmentSize);
  const im = new Float64Array(segmentSize);
  const half = segmentSize / 2;
  const second = new Float64Array(half + 1);
  const fourth = new Float64Array(half + 1);
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = segment * hop;
    for (let index = 0; index < segmentSize; index += 1) {
      re[index] = (signal[start + index] as number) * (window[index] as number);
      im[index] = 0;
    }
    fft(re, im);
    for (let line = 0; line <= half; line += 1) {
      const real = re[line] as number;
      const imaginary = im[line] as number;
      const power = real * real + imaginary * imaginary;
      second[line] = (second[line] as number) + power;
      fourth[line] = (fourth[line] as number) + power * power;
    }
  }
  const values = new Float64Array(half + 1);
  for (let line = 0; line <= half; line += 1) {
    const m2 = (second[line] as number) / segmentCount;
    const m4 = (fourth[line] as number) / segmentCount;
    values[line] = m2 > 0 ? m4 / (m2 * m2) - 2 : 0;
  }
  return { resolution: sampleRate / segmentSize, segmentCount, values };
}

export function spectralKurtosis(
  signal: ArrayLike<number>,
  sampleRate: number,
  { segmentSize, minHz = SPECTRUM_MIN_HZ, maxHz = SPECTRUM_MAX_HZ }: KurtosisOptions = {},
): number {
  const profile = spectralKurtosisProfile(signal, sampleRate, segmentSize);
  const { values, resolution } = profile;
  const firstLine = Math.max(2, Math.ceil(minHz / resolution));
  const lastLine = Math.min(
    values.length - 3,
    Math.floor(Math.min(maxHz, (NYQUIST_GUARD * sampleRate) / 2) / resolution),
  );
  let maximum = Number.NEGATIVE_INFINITY;
  for (let line = firstLine; line <= lastLine; line += 1) {
    const smoothed =
      ((values[line - 1] as number) + (values[line] as number) + (values[line + 1] as number)) / 3;
    if (smoothed > maximum) maximum = smoothed;
  }
  return GAUSSIAN_KURTOSIS + (Number.isFinite(maximum) ? maximum : 0);
}
