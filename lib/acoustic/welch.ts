import { fft, isPowerOfTwo, nextPowerOfTwo, previousPowerOfTwo } from "@/lib/acoustic/fft";
import { hannWindow, windowPower } from "@/lib/acoustic/window";

export interface WelchOptions {
  segmentSize?: number;
  overlap?: number;
}

export interface PowerSpectralDensity {
  sampleRate: number;
  segmentSize: number;
  segmentCount: number;
  resolution: number;
  density: Float64Array;
}

export const DEFAULT_RESOLUTION_HZ = 1.5;
export const MIN_SEGMENT_SIZE = 256;
const MIN_SEGMENTS = 8;

export function chooseSegmentSize(
  length: number,
  sampleRate: number,
  targetResolutionHz = DEFAULT_RESOLUTION_HZ,
): number {
  const wanted = nextPowerOfTwo(sampleRate / targetResolutionHz);
  const affordable = previousPowerOfTwo((2 * length) / (MIN_SEGMENTS + 1));
  return Math.max(MIN_SEGMENT_SIZE, Math.min(wanted, affordable));
}

export function welch(
  signal: ArrayLike<number>,
  sampleRate: number,
  options: WelchOptions = {},
): PowerSpectralDensity {
  if (!(sampleRate > 0)) throw new RangeError("welch: sample rate must be positive");
  const overlap = options.overlap ?? 0.5;
  if (overlap < 0 || overlap >= 1) throw new RangeError("welch: overlap must be in [0, 1)");
  const segmentSize = options.segmentSize ?? chooseSegmentSize(signal.length, sampleRate);
  if (!isPowerOfTwo(segmentSize))
    throw new RangeError("welch: segment size must be a power of two");
  if (signal.length < segmentSize) throw new RangeError("welch: signal is shorter than a segment");
  const hop = Math.max(1, Math.round(segmentSize * (1 - overlap)));
  const segmentCount = Math.floor((signal.length - segmentSize) / hop) + 1;
  const window = hannWindow(segmentSize);
  const re = new Float64Array(segmentSize);
  const im = new Float64Array(segmentSize);
  const half = segmentSize / 2;
  const accumulated = new Float64Array(half + 1);
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = segment * hop;
    let mean = 0;
    for (let index = 0; index < segmentSize; index += 1) mean += signal[start + index] as number;
    mean /= segmentSize;
    for (let index = 0; index < segmentSize; index += 1) {
      re[index] = ((signal[start + index] as number) - mean) * (window[index] as number);
      im[index] = 0;
    }
    fft(re, im);
    for (let bin = 0; bin <= half; bin += 1) {
      const real = re[bin] as number;
      const imaginary = im[bin] as number;
      accumulated[bin] = (accumulated[bin] as number) + real * real + imaginary * imaginary;
    }
  }
  const scale = 1 / (segmentCount * sampleRate * windowPower(window));
  const density = new Float64Array(half + 1);
  for (let bin = 0; bin <= half; bin += 1) {
    const oneSided = bin === 0 || bin === half ? 1 : 2;
    density[bin] = (accumulated[bin] as number) * scale * oneSided;
  }
  return {
    sampleRate,
    segmentSize,
    segmentCount,
    resolution: sampleRate / segmentSize,
    density,
  };
}

export function totalPower(psd: PowerSpectralDensity): number {
  let sum = 0;
  for (let bin = 0; bin < psd.density.length; bin += 1) sum += psd.density[bin] as number;
  return sum * psd.resolution;
}
