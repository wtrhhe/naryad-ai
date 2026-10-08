export const PHASH_SIZE = 32;
export const PHASH_LOW_FREQUENCIES = 8;
export const PHASH_BITS = PHASH_LOW_FREQUENCIES * PHASH_LOW_FREQUENCIES;
export const PHASH_HEX_LENGTH = PHASH_BITS / 4;

const PHASH_PATTERN = /^[0-9a-f]{16}$/;
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

function buildCosineTable(size: number, frequencies: number): Float64Array {
  const table = new Float64Array(size * frequencies);
  for (let u = 0; u < frequencies; u += 1) {
    for (let x = 0; x < size; x += 1) {
      table[u * size + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size));
    }
  }
  return table;
}

const cosineTables = new Map<string, Float64Array>();

function cosineTable(size: number, frequencies: number): Float64Array {
  const key = `${size}:${frequencies}`;
  let table = cosineTables.get(key);
  if (!table) {
    table = buildCosineTable(size, frequencies);
    cosineTables.set(key, table);
  }
  return table;
}

export function dctLowFrequencies(
  pixels: ArrayLike<number>,
  size: number = PHASH_SIZE,
  frequencies: number = PHASH_LOW_FREQUENCIES,
): Float64Array {
  if (!Number.isInteger(size) || size < frequencies || frequencies < 1) {
    throw new RangeError("Invalid DCT dimensions");
  }
  if (pixels.length !== size * size) {
    throw new RangeError(`Expected ${size * size} pixels, got ${pixels.length}`);
  }
  const cos = cosineTable(size, frequencies);
  const rows = new Float64Array(size * frequencies);
  for (let y = 0; y < size; y += 1) {
    for (let u = 0; u < frequencies; u += 1) {
      let sum = 0;
      for (let x = 0; x < size; x += 1) {
        sum += (pixels[y * size + x] ?? 0) * (cos[u * size + x] ?? 0);
      }
      rows[y * frequencies + u] = sum;
    }
  }
  const result = new Float64Array(frequencies * frequencies);
  for (let v = 0; v < frequencies; v += 1) {
    for (let u = 0; u < frequencies; u += 1) {
      let sum = 0;
      for (let y = 0; y < size; y += 1) {
        sum += (rows[y * frequencies + u] ?? 0) * (cos[v * size + y] ?? 0);
      }
      result[v * frequencies + u] = sum;
    }
  }
  return result;
}

function median(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function phashFromGrayscale(pixels: ArrayLike<number>, size: number = PHASH_SIZE): string {
  const coefficients = dctLowFrequencies(pixels, size, PHASH_LOW_FREQUENCIES);
  const threshold = median(coefficients);
  let hex = "";
  for (let nibble = 0; nibble < PHASH_HEX_LENGTH; nibble += 1) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      value = (value << 1) | ((coefficients[nibble * 4 + bit] ?? 0) > threshold ? 1 : 0);
    }
    hex += value.toString(16);
  }
  return hex;
}

export function isPhash(value: unknown): value is string {
  return typeof value === "string" && PHASH_PATTERN.test(value);
}

export function hammingDistance(a: string, b: string): number {
  if (!isPhash(a) || !isPhash(b)) {
    throw new RangeError("Perceptual hashes must be 16 lowercase hex characters");
  }
  let distance = 0;
  for (let index = 0; index < PHASH_HEX_LENGTH; index += 1) {
    distance += NIBBLE_BITS[parseInt(a[index] ?? "0", 16) ^ parseInt(b[index] ?? "0", 16)] ?? 0;
  }
  return distance;
}
