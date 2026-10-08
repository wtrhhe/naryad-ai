const UINT32_RANGE = 4_294_967_296;
const UUID_VERSION_FOUR_MASK = 0x40;
const UUID_VARIANT_MASK = 0x80;

export type WeightedEntry<T> = readonly [T, number];

export type Rng = {
  readonly next: () => number;
  readonly int: (min: number, max: number) => number;
  readonly float: (min: number, max: number) => number;
  readonly pick: <T>(items: readonly T[]) => T;
  readonly weighted: <T>(entries: ReadonlyArray<WeightedEntry<T>>) => T;
  readonly normal: (mean: number, standardDeviation: number) => number;
  readonly chance: (probability: number) => boolean;
  readonly shuffle: <T>(items: readonly T[]) => T[];
  readonly stochasticRound: (value: number) => number;
  readonly uuid: () => string;
  readonly hex: (length: number) => string;
  readonly fork: (label: string) => Rng;
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

function hashLabel(seed: number, label: string): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = Math.imul(hash ^ label.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

export function createRng(seed: number): Rng {
  const nextValue = mulberry32(seed);

  const float = (min: number, max: number): number => min + nextValue() * (max - min);
  const int = (min: number, max: number): number => Math.floor(float(min, max + 1));

  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)];
    if (items.length === 0 || item === undefined) {
      throw new Error("Cannot pick from an empty list");
    }
    return item;
  };

  const weighted = <T>(entries: ReadonlyArray<WeightedEntry<T>>): T => {
    const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    if (total <= 0) {
      throw new Error("Weighted pick needs at least one positive weight");
    }
    let threshold = nextValue() * total;
    for (const [value, weight] of entries) {
      threshold -= Math.max(0, weight);
      if (threshold < 0) {
        return value;
      }
    }
    const lastPositive = [...entries].reverse().find(([, weight]) => weight > 0);
    return (lastPositive as WeightedEntry<T>)[0];
  };

  const normal = (mean: number, standardDeviation: number): number => {
    const u = 1 - nextValue();
    const v = nextValue();
    return mean + standardDeviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = int(0, index);
      const current = result[index] as T;
      result[index] = result[swapIndex] as T;
      result[swapIndex] = current;
    }
    return result;
  };

  const stochasticRound = (value: number): number => {
    const whole = Math.floor(value);
    return nextValue() < value - whole ? whole + 1 : whole;
  };

  const hex = (length: number): string =>
    Array.from({ length: Math.ceil(length / 2) }, () => toHex(int(0, 255)))
      .join("")
      .slice(0, length);

  const uuid = (): string => {
    const bytes = Array.from({ length: 16 }, () => int(0, 255));
    bytes[6] = ((bytes[6] as number) & 0x0f) | UUID_VERSION_FOUR_MASK;
    bytes[8] = ((bytes[8] as number) & 0x3f) | UUID_VARIANT_MASK;
    const digits = bytes.map(toHex).join("");
    return [
      digits.slice(0, 8),
      digits.slice(8, 12),
      digits.slice(12, 16),
      digits.slice(16, 20),
      digits.slice(20),
    ].join("-");
  };

  return {
    next: nextValue,
    int,
    float,
    pick,
    weighted,
    normal,
    chance: (probability) => nextValue() < probability,
    shuffle,
    stochasticRound,
    uuid,
    hex,
    fork: (label) => createRng(hashLabel(seed, label)),
  };
}
