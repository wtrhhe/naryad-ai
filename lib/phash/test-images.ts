export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Blob2D {
  x: number;
  y: number;
  radius: number;
  value: number;
}

export function sceneBlobs(seed: number, count = 9): Blob2D[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    radius: 0.06 + random() * 0.2,
    value: random() > 0.5 ? 150 : -150,
  }));
}

export function renderScene(
  width: number,
  height: number,
  seed: number,
  options: { shiftX?: number; shiftY?: number; brightness?: number; contrast?: number } = {},
): Float32Array {
  const { shiftX = 0, shiftY = 0, brightness = 0, contrast = 1 } = options;
  const blobs = sceneBlobs(seed);
  const random = seededRandom(seed * 7 + 3);
  const angle = random() * Math.PI;
  const pixels = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x - shiftX) / width;
      const v = (y - shiftY) / height;
      let value = 110 + 50 * (u * Math.cos(angle) + v * Math.sin(angle));
      for (const blob of blobs) {
        const dx = u - blob.x;
        const dy = v - blob.y;
        if (dx * dx + dy * dy < blob.radius * blob.radius) value += blob.value * 0.5;
      }
      const adjusted = (value - 128) * contrast + 128 + brightness;
      pixels[y * width + x] = Math.max(0, Math.min(255, adjusted));
    }
  }
  return pixels;
}

export function addNoise(pixels: Float32Array, amplitude: number, seed: number): Float32Array {
  const random = seededRandom(seed);
  return pixels.map((value) => Math.max(0, Math.min(255, value + (random() * 2 - 1) * amplitude)));
}

export function toRgba(gray: Float32Array): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(gray.length * 4);
  gray.forEach((value, index) => {
    rgba[index * 4] = value;
    rgba[index * 4 + 1] = value;
    rgba[index * 4 + 2] = value;
    rgba[index * 4 + 3] = 255;
  });
  return rgba;
}
