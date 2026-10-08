const cache = new Map<number, Float64Array>();

export function hannWindow(length: number): Float64Array {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError("hannWindow: length must be a positive integer");
  }
  const cached = cache.get(length);
  if (cached) return cached;
  const window = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / length);
  }
  cache.set(length, window);
  return window;
}

export function windowPower(window: ArrayLike<number>): number {
  let sum = 0;
  for (let index = 0; index < window.length; index += 1) {
    const value = window[index] as number;
    sum += value * value;
  }
  return sum;
}
