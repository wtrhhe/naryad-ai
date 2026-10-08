import { z } from "zod";
import {
  ACOUSTIC_KINDS,
  type AcousticSampleData,
  type SpectrumBin,
  type SpectrumPeak,
} from "@/lib/acoustic/types";
import type { HistorySample } from "@/lib/acoustic/trend";

const numeric = z.union([
  z.number(),
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number),
]);

export const spectrumBinSchema = z.object({ f: z.number().positive(), db: z.number() });

export const spectrumSchema = z.array(spectrumBinSchema);

export const spectrumPeakSchema = z.preprocess(
  (value) => {
    if (value && typeof value === "object" && !("f" in value) && "frequency" in value) {
      const legacy = value as { frequency: unknown; amplitude?: unknown; label?: unknown };
      return { f: legacy.frequency, db: legacy.amplitude, label: legacy.label };
    }
    return value;
  },
  z.object({ f: z.number().positive(), db: z.number(), label: z.string().min(1).optional() }),
);

export const peaksSchema = z.array(spectrumPeakSchema);

export const storedSampleRowSchema = z.object({
  id: z.string(),
  kind: z.enum(ACOUSTIC_KINDS),
  recorded_at: z.string(),
  spectrum: spectrumSchema,
  peaks: peaksSchema.catch([]),
  rms: numeric,
  spectral_kurtosis: numeric.nullable(),
  sample_rate: numeric,
  duration_seconds: numeric,
  storage_path: z.string().nullable().optional(),
  work_order_id: z.string().nullable().optional(),
});

export type StoredSampleRow = z.infer<typeof storedSampleRowSchema>;

export interface StoredAcousticSample extends HistorySample {
  id: string;
  sampleRate: number;
  durationSeconds: number;
  storagePath: string | null;
  workOrderId: string | null;
}

function sortBins(spectrum: readonly SpectrumBin[]): SpectrumBin[] {
  return [...spectrum].sort((a, b) => a.f - b.f);
}

function cleanPeaks(peaks: readonly SpectrumPeak[]): SpectrumPeak[] {
  return peaks.map(({ f, db, label }) => (label === undefined ? { f, db } : { f, db, label }));
}

export function toStoredSample(row: StoredSampleRow): StoredAcousticSample {
  return {
    id: row.id,
    kind: row.kind,
    recordedAt: row.recorded_at,
    spectrum: sortBins(row.spectrum),
    peaks: cleanPeaks(row.peaks),
    rms: row.rms,
    spectralKurtosis: row.spectral_kurtosis,
    sampleRate: row.sample_rate,
    durationSeconds: row.duration_seconds,
    storagePath: row.storage_path ?? null,
    workOrderId: row.work_order_id ?? null,
  };
}

export function parseStoredSample(raw: unknown): StoredAcousticSample | null {
  const parsed = storedSampleRowSchema.safeParse(raw);
  return parsed.success ? toStoredSample(parsed.data) : null;
}

export function parseStoredSamples(rows: readonly unknown[]): StoredAcousticSample[] {
  return rows
    .map(parseStoredSample)
    .filter((sample): sample is StoredAcousticSample => sample !== null);
}

export function toSampleData(sample: AcousticSampleData): AcousticSampleData {
  return {
    spectrum: sample.spectrum,
    peaks: sample.peaks,
    rms: sample.rms,
    spectralKurtosis: sample.spectralKurtosis,
  };
}
