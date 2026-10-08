import type { BearingSpec } from "./data-equipment";

export type DefectFrequencies = {
  readonly shaft: number;
  readonly outerRace: number;
  readonly innerRace: number;
  readonly ball: number;
  readonly cage: number;
};

const SECONDS_PER_MINUTE = 60;

export function bearingDefectFrequencies(bearing: BearingSpec): DefectFrequencies {
  const shaft = bearing.rpm / SECONDS_PER_MINUTE;
  const contactAngleRad = (bearing.contactAngleDeg * Math.PI) / 180;
  const diameterRatio =
    (bearing.ballDiameterMm / bearing.pitchDiameterMm) * Math.cos(contactAngleRad);
  const halfElements = bearing.rollingElements / 2;
  return {
    shaft,
    outerRace: halfElements * shaft * (1 - diameterRatio),
    innerRace: halfElements * shaft * (1 + diameterRatio),
    ball:
      (bearing.pitchDiameterMm / (2 * bearing.ballDiameterMm)) * shaft * (1 - diameterRatio ** 2),
    cage: (shaft / 2) * (1 - diameterRatio),
  };
}
