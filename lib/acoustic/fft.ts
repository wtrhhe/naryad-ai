interface FftTables {
  cos: Float64Array;
  sin: Float64Array;
  reversed: Uint32Array;
}

const tables = new Map<number, FftTables>();

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

export function nextPowerOfTwo(value: number): number {
  if (!Number.isFinite(value) || value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

export function previousPowerOfTwo(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 0;
  return 2 ** Math.floor(Math.log2(value));
}

function tablesFor(size: number): FftTables {
  const cached = tables.get(size);
  if (cached) return cached;
  const half = size >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let index = 0; index < half; index += 1) {
    const angle = (-2 * Math.PI * index) / size;
    cos[index] = Math.cos(angle);
    sin[index] = Math.sin(angle);
  }
  const bits = Math.log2(size);
  const reversed = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let value = index;
    let result = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      result = (result << 1) | (value & 1);
      value >>= 1;
    }
    reversed[index] = result;
  }
  const built = { cos, sin, reversed };
  tables.set(size, built);
  return built;
}

function transform(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const size = re.length;
  if (im.length !== size) throw new RangeError("fft: real and imaginary parts differ in length");
  if (!isPowerOfTwo(size)) throw new RangeError("fft: length must be a power of two");
  const { cos, sin, reversed } = tablesFor(size);
  for (let index = 0; index < size; index += 1) {
    const target = reversed[index] as number;
    if (target > index) {
      const re0 = re[index] as number;
      re[index] = re[target] as number;
      re[target] = re0;
      const im0 = im[index] as number;
      im[index] = im[target] as number;
      im[target] = im0;
    }
  }
  const direction = inverse ? -1 : 1;
  for (let span = 2; span <= size; span <<= 1) {
    const half = span >> 1;
    const stride = size / span;
    for (let start = 0; start < size; start += span) {
      for (let offset = 0; offset < half; offset += 1) {
        const wr = cos[offset * stride] as number;
        const wi = direction * (sin[offset * stride] as number);
        const a = start + offset;
        const b = a + half;
        const br = re[b] as number;
        const bi = im[b] as number;
        const tr = wr * br - wi * bi;
        const ti = wr * bi + wi * br;
        const ar = re[a] as number;
        const ai = im[a] as number;
        re[b] = ar - tr;
        im[b] = ai - ti;
        re[a] = ar + tr;
        im[a] = ai + ti;
      }
    }
  }
  if (inverse) {
    for (let index = 0; index < size; index += 1) {
      re[index] = (re[index] as number) / size;
      im[index] = (im[index] as number) / size;
    }
  }
}

export function fft(re: Float64Array, im: Float64Array): void {
  transform(re, im, false);
}

export function inverseFft(re: Float64Array, im: Float64Array): void {
  transform(re, im, true);
}
