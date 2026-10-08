export function mean(signal: ArrayLike<number>): number {
  if (signal.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < signal.length; index += 1) sum += signal[index] as number;
  return sum / signal.length;
}

export function rms(signal: ArrayLike<number>): number {
  if (signal.length === 0) return 0;
  const offset = mean(signal);
  let sum = 0;
  for (let index = 0; index < signal.length; index += 1) {
    const value = (signal[index] as number) - offset;
    sum += value * value;
  }
  return Math.sqrt(sum / signal.length);
}

export function clippingRatio(signal: ArrayLike<number>, threshold = 0.999): number {
  if (signal.length === 0) return 0;
  let clipped = 0;
  for (let index = 0; index < signal.length; index += 1) {
    if (Math.abs(signal[index] as number) >= threshold) clipped += 1;
  }
  return clipped / signal.length;
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}
