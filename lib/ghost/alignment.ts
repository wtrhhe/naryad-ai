export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export const SSIM_WINDOW = 8;
export const SSIM_STRIDE = 4;
const SSIM_C1 = 0.01 ** 2;
const SSIM_C2 = 0.03 ** 2;
const EDGE_TOLERANCE_RADIUS = 4;
const NOISE_RADIUS = 1;
const EPSILON = 1e-9;

export function grayImage(width: number, height: number, data?: ArrayLike<number>): GrayImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Image dimensions must be positive integers");
  }
  const pixels = data ? Float32Array.from(data) : new Float32Array(width * height);
  if (pixels.length !== width * height) {
    throw new RangeError(`Expected ${width * height} pixels, got ${pixels.length}`);
  }
  return { width, height, data: pixels };
}

export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): GrayImage {
  if (rgba.length !== width * height * 4) {
    throw new RangeError("RGBA buffer does not match the dimensions");
  }
  const image = grayImage(width, height);
  for (let index = 0; index < image.data.length; index += 1) {
    const offset = index * 4;
    image.data[index] =
      (0.299 * (rgba[offset] ?? 0) +
        0.587 * (rgba[offset + 1] ?? 0) +
        0.114 * (rgba[offset + 2] ?? 0)) /
      255;
  }
  return image;
}

function blurPass(
  source: Float32Array,
  target: Float32Array,
  length: number,
  lines: number,
  step: number,
  lineStep: number,
  radius: number,
) {
  const size = radius * 2 + 1;
  for (let line = 0; line < lines; line += 1) {
    const base = line * lineStep;
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const clamped = Math.min(length - 1, Math.max(0, offset));
      sum += source[base + clamped * step] ?? 0;
    }
    for (let position = 0; position < length; position += 1) {
      target[base + position * step] = sum / size;
      const leaving = Math.max(0, position - radius);
      const entering = Math.min(length - 1, position + radius + 1);
      sum += (source[base + entering * step] ?? 0) - (source[base + leaving * step] ?? 0);
    }
  }
}

export function boxBlur(image: GrayImage, radius: number): GrayImage {
  if (radius < 1) return grayImage(image.width, image.height, image.data);
  const { width, height } = image;
  const horizontal = new Float32Array(width * height);
  const result = grayImage(width, height);
  blurPass(image.data, horizontal, width, height, 1, width, radius);
  blurPass(horizontal, result.data, height, width, width, 1, radius);
  return result;
}

export function sobelMagnitude(image: GrayImage): GrayImage {
  const { width, height, data } = image;
  const result = grayImage(width, height);
  const at = (x: number, y: number) =>
    data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1);
      const gy =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1);
      result.data[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return result;
}

export function normalizeEdges(image: GrayImage): GrayImage {
  const { data } = image;
  let sum = 0;
  let squares = 0;
  for (const value of data) {
    sum += value;
    squares += value * value;
  }
  const mean = sum / data.length;
  const deviation = Math.sqrt(Math.max(0, squares / data.length - mean * mean));
  const scale = mean + 2 * deviation;
  const result = grayImage(image.width, image.height);
  if (scale < EPSILON) return result;
  for (let index = 0; index < data.length; index += 1) {
    result.data[index] = Math.min(1, (data[index] ?? 0) / scale);
  }
  return result;
}

export function edgeMap(image: GrayImage, toleranceRadius = EDGE_TOLERANCE_RADIUS): GrayImage {
  const edges = normalizeEdges(sobelMagnitude(boxBlur(image, NOISE_RADIUS)));
  return boxBlur(boxBlur(edges, toleranceRadius), toleranceRadius);
}

function assertSameSize(a: GrayImage, b: GrayImage) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError("Images must have the same dimensions");
  }
}

export function normalizedCrossCorrelation(a: GrayImage, b: GrayImage): number {
  assertSameSize(a, b);
  const count = a.data.length;
  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < count; index += 1) {
    meanA += a.data[index] ?? 0;
    meanB += b.data[index] ?? 0;
  }
  meanA /= count;
  meanB /= count;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < count; index += 1) {
    const da = (a.data[index] ?? 0) - meanA;
    const db = (b.data[index] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator < EPSILON ? 0 : covariance / denominator;
}

export function weightedSsim(
  a: GrayImage,
  b: GrayImage,
  window: number = SSIM_WINDOW,
  stride: number = SSIM_STRIDE,
): number {
  assertSameSize(a, b);
  const { width, height } = a;
  const size = Math.min(window, width, height);
  const area = size * size;
  let weighted = 0;
  let totalWeight = 0;
  for (let top = 0; top + size <= height; top += stride) {
    for (let left = 0; left + size <= width; left += stride) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;
      for (let y = top; y < top + size; y += 1) {
        for (let x = left; x < left + size; x += 1) {
          const va = a.data[y * width + x] ?? 0;
          const vb = b.data[y * width + x] ?? 0;
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      }
      const meanA = sumA / area;
      const meanB = sumB / area;
      const varianceA = Math.max(0, sumAA / area - meanA * meanA);
      const varianceB = Math.max(0, sumBB / area - meanB * meanB);
      const covariance = sumAB / area - meanA * meanB;
      const weight = meanA + meanB;
      if (weight < EPSILON) continue;
      const ssim =
        ((2 * meanA * meanB + SSIM_C1) * (2 * covariance + SSIM_C2)) /
        ((meanA * meanA + meanB * meanB + SSIM_C1) * (varianceA + varianceB + SSIM_C2));
      weighted += ssim * weight;
      totalWeight += weight;
    }
  }
  return totalWeight < EPSILON ? 0 : weighted / totalWeight;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function compareEdgeMaps(reference: GrayImage, frame: GrayImage): number {
  const correlation = clampUnit(normalizedCrossCorrelation(reference, frame));
  const structure = clampUnit(weightedSsim(reference, frame));
  return clampUnit(0.5 * correlation + 0.5 * structure);
}

export function alignmentScore(reference: GrayImage, frame: GrayImage): number {
  return compareEdgeMaps(edgeMap(reference), edgeMap(frame));
}
