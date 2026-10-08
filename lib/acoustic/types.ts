export const ACOUSTIC_KINDS = ["before", "after"] as const;

export type AcousticKind = (typeof ACOUSTIC_KINDS)[number];

export interface SpectrumBin {
  f: number;
  db: number;
}

export interface SpectrumPeak {
  f: number;
  db: number;
  label?: string;
}

export interface BearingGeometry {
  rpm: number;
  rollingElements: number;
  ballDiameterMm: number;
  pitchDiameterMm: number;
  contactAngleDeg: number;
}

export interface Kinematics {
  rpm: number | null;
  bearing: BearingGeometry | null;
}

export const DEFECT_KEYS = ["bpfo", "bpfi", "bsf", "ftf", "shaft"] as const;

export type DefectKey = (typeof DEFECT_KEYS)[number];

export interface DefectBand {
  key: DefectKey;
  harmonic: number;
  label: string;
  frequency: number;
  lowHz: number;
  highHz: number;
}

export interface AcousticSampleData {
  spectrum: SpectrumBin[];
  peaks: SpectrumPeak[];
  rms: number;
  spectralKurtosis: number | null;
}
