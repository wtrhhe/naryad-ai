import {
  DEFECT_KEYS,
  type BearingGeometry,
  type DefectBand,
  type DefectKey,
  type Kinematics,
} from "@/lib/acoustic/types";
import { SPECTRUM_MAX_HZ, SPECTRUM_MIN_HZ } from "@/lib/acoustic/bins";

export interface DefectFrequencies {
  shaft: number;
  bpfo: number;
  bpfi: number;
  bsf: number;
  ftf: number;
}

export interface EquipmentKinematicsRow {
  rpm: number | null;
  bearing_rolling_elements: number | null;
  bearing_ball_diameter_mm: number | null;
  bearing_pitch_diameter_mm: number | null;
  bearing_contact_angle_deg: number | null;
}

export interface DefectBandOptions {
  harmonics?: number;
  relativeWidth?: number;
  minHz?: number;
  maxHz?: number;
}

export const DEFAULT_HARMONICS = 3;
export const DEFAULT_BAND_WIDTH = 0.04;
export const LABEL_TOLERANCE = 0.03;

const SECONDS_PER_MINUTE = 60;

const BASE_LABELS: Record<Exclude<DefectKey, "shaft">, string> = {
  bpfo: "BPFO",
  bpfi: "BPFI",
  bsf: "BSF",
  ftf: "FTF",
};

export function bearingDefectFrequencies(bearing: BearingGeometry): DefectFrequencies {
  const shaft = bearing.rpm / SECONDS_PER_MINUTE;
  const contactAngle = (bearing.contactAngleDeg * Math.PI) / 180;
  const ratio = (bearing.ballDiameterMm / bearing.pitchDiameterMm) * Math.cos(contactAngle);
  const halfElements = bearing.rollingElements / 2;
  return {
    shaft,
    bpfo: halfElements * shaft * (1 - ratio),
    bpfi: halfElements * shaft * (1 + ratio),
    bsf: (bearing.pitchDiameterMm / (2 * bearing.ballDiameterMm)) * shaft * (1 - ratio ** 2),
    ftf: (shaft / 2) * (1 - ratio),
  };
}

const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function kinematicsFromEquipment(row: EquipmentKinematicsRow): Kinematics {
  const rpm = positive(row.rpm) ? row.rpm : null;
  const ball = row.bearing_ball_diameter_mm;
  const pitch = row.bearing_pitch_diameter_mm;
  const elements = row.bearing_rolling_elements;
  const bearing =
    rpm !== null && positive(elements) && positive(ball) && positive(pitch) && ball < pitch
      ? {
          rpm,
          rollingElements: elements,
          ballDiameterMm: ball,
          pitchDiameterMm: pitch,
          contactAngleDeg: row.bearing_contact_angle_deg ?? 0,
        }
      : null;
  return { rpm, bearing };
}

export function defectLabel(key: DefectKey, harmonic: number): string {
  if (key === "shaft") return `${harmonic}x`;
  const base = BASE_LABELS[key];
  return harmonic === 1 ? base : `${harmonic}x${base}`;
}

const LABEL_PATTERN = /^(?:(\d+)x)?(BPFO|BPFI|BSF|FTF)?$/;

export function parseDefectLabel(
  label: string | undefined,
): { key: DefectKey; harmonic: number } | null {
  if (!label) return null;
  const match = LABEL_PATTERN.exec(label);
  if (!match) return null;
  const [, multiple, base] = match;
  const harmonic = multiple === undefined ? 1 : Number(multiple);
  if (base === undefined) return multiple === undefined ? null : { key: "shaft", harmonic };
  return { key: base.toLowerCase() as DefectKey, harmonic };
}

export function fundamentalFrequencies(kinematics: Kinematics): Partial<Record<DefectKey, number>> {
  if (kinematics.bearing) {
    const { shaft, bpfo, bpfi, bsf, ftf } = bearingDefectFrequencies(kinematics.bearing);
    return { bpfo, bpfi, bsf, ftf, shaft };
  }
  return kinematics.rpm !== null ? { shaft: kinematics.rpm / SECONDS_PER_MINUTE } : {};
}

export function defectBands(
  kinematics: Kinematics,
  {
    harmonics = DEFAULT_HARMONICS,
    relativeWidth = DEFAULT_BAND_WIDTH,
    minHz = SPECTRUM_MIN_HZ,
    maxHz = SPECTRUM_MAX_HZ,
  }: DefectBandOptions = {},
): DefectBand[] {
  const fundamentals = fundamentalFrequencies(kinematics);
  return DEFECT_KEYS.flatMap((key) => {
    const base = fundamentals[key];
    if (base === undefined) return [];
    return Array.from({ length: harmonics }, (_, index) => index + 1)
      .map((harmonic) => ({ harmonic, frequency: base * harmonic }))
      .filter(({ frequency }) => frequency >= minHz && frequency <= maxHz)
      .map(({ harmonic, frequency }) => ({
        key,
        harmonic,
        label: defectLabel(key, harmonic),
        frequency,
        lowHz: frequency * (1 - relativeWidth),
        highHz: frequency * (1 + relativeWidth),
      }));
  });
}

export function matchDefectBand(
  frequency: number,
  bands: readonly DefectBand[],
  tolerance = LABEL_TOLERANCE,
  minToleranceHz = 0,
): DefectBand | undefined {
  let best: DefectBand | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const band of bands) {
    const distance = Math.abs(frequency - band.frequency);
    const allowed = Math.max(tolerance * band.frequency, minToleranceHz);
    if (distance <= allowed && distance < bestDistance) {
      best = band;
      bestDistance = distance;
    }
  }
  return best;
}
