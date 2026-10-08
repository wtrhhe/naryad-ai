import type { BearingGeometry } from "@/lib/acoustic/types";
import { bearingDefectFrequencies } from "@/lib/acoustic/bearing";

export type Random = () => number;

export interface ToneSpec {
  frequency: number;
  amplitude: number;
  phase?: number;
}

export interface ImpulseSpec {
  rateHz: number;
  resonanceHz: number;
  amplitude: number;
  decaySeconds: number;
  jitter?: number;
  spread?: number;
}

export interface SynthSpec {
  sampleRate: number;
  durationSeconds: number;
  seed: number;
  noiseRms: number;
  tones?: readonly ToneSpec[];
  impulses?: readonly ImpulseSpec[];
}

export type DemoCondition = "defect" | "healthy";

export interface DemoSignalOptions {
  sampleRate?: number;
  durationSeconds?: number;
  seed?: number;
}

export const DEMO_SAMPLE_RATE = 22_050;
export const DEMO_DURATION_SECONDS = 8;
export const DEMO_NOISE_RMS = 0.03;
export const DEMO_RESONANCE_HZ = 3_500;
const IMPULSE_TAIL_DECAYS = 8;

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function gaussian(random: Random): number {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function addImpulses(
  output: Float32Array,
  sampleRate: number,
  spec: ImpulseSpec,
  random: Random,
): void {
  const duration = output.length / sampleRate;
  const tail = Math.ceil(spec.decaySeconds * IMPULSE_TAIL_DECAYS * sampleRate);
  const period = 1 / spec.rateHz;
  for (let time = random() * period; time < duration;) {
    const start = Math.ceil(time * sampleRate);
    const end = Math.min(output.length, start + tail);
    const strength = spec.amplitude * Math.max(0, 1 + (spec.spread ?? 0) * gaussian(random));
    for (let index = start; index < end; index += 1) {
      const elapsed = index / sampleRate - time;
      output[index] =
        (output[index] as number) +
        strength *
          Math.exp(-elapsed / spec.decaySeconds) *
          Math.sin(2 * Math.PI * spec.resonanceHz * elapsed);
    }
    time += period * (1 + (spec.jitter ?? 0) * gaussian(random));
  }
}

export function synthesize(spec: SynthSpec): Float32Array {
  const random = createRandom(spec.seed);
  const length = Math.round(spec.sampleRate * spec.durationSeconds);
  const output = new Float32Array(length);
  const tones = (spec.tones ?? []).map((tone) => ({
    ...tone,
    phase: tone.phase ?? random() * 2 * Math.PI,
  }));
  for (let index = 0; index < length; index += 1) {
    const time = index / spec.sampleRate;
    let value = spec.noiseRms * gaussian(random);
    for (const tone of tones) {
      value += tone.amplitude * Math.sin(2 * Math.PI * tone.frequency * time + tone.phase);
    }
    output[index] = value;
  }
  for (const impulse of spec.impulses ?? []) addImpulses(output, spec.sampleRate, impulse, random);
  return output;
}

export function demoBearingSpec(
  bearing: BearingGeometry,
  condition: DemoCondition,
  {
    sampleRate = DEMO_SAMPLE_RATE,
    durationSeconds = DEMO_DURATION_SECONDS,
    seed = condition === "defect" ? 3 : 7,
  }: DemoSignalOptions = {},
): SynthSpec {
  const { shaft, bpfo, bpfi } = bearingDefectFrequencies(bearing);
  const rotation: ToneSpec[] = [
    { frequency: shaft, amplitude: 0.02 },
    { frequency: shaft * 2, amplitude: 0.008 },
  ];
  if (condition === "healthy") {
    return { sampleRate, durationSeconds, seed, noiseRms: DEMO_NOISE_RMS, tones: rotation };
  }
  return {
    sampleRate,
    durationSeconds,
    seed,
    noiseRms: DEMO_NOISE_RMS,
    tones: [
      ...rotation,
      { frequency: bpfo, amplitude: 0.04 },
      { frequency: bpfo * 2, amplitude: 0.02 },
      { frequency: bpfo * 3, amplitude: 0.01 },
      { frequency: bpfi, amplitude: 0.006 },
    ],
    impulses: [
      {
        rateHz: bpfo,
        resonanceHz: DEMO_RESONANCE_HZ,
        amplitude: 0.3,
        decaySeconds: 0.0006,
        jitter: 0.004,
        spread: 0.35,
      },
    ],
  };
}

export function demoBearingSignal(
  bearing: BearingGeometry,
  condition: DemoCondition,
  options: DemoSignalOptions = {},
): Float32Array {
  return synthesize(demoBearingSpec(bearing, condition, options));
}
