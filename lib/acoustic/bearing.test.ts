import { describe, expect, it } from "vitest";
import {
  bearingDefectFrequencies,
  defectBands,
  defectLabel,
  fundamentalFrequencies,
  kinematicsFromEquipment,
  matchDefectBand,
  parseDefectLabel,
} from "@/lib/acoustic/bearing";
import { bearingDefectFrequencies as seedFrequencies } from "@/scripts/seed/bearing";
import { EQUIPMENT_SPECS } from "@/scripts/seed/data-equipment";
import type { BearingGeometry } from "@/lib/acoustic/types";

const k3: BearingGeometry = {
  rpm: 1480,
  rollingElements: 8,
  ballDiameterMm: 22.225,
  pitchDiameterMm: 96.5,
  contactAngleDeg: 0,
};

const equipmentRow = {
  rpm: 1480,
  bearing_rolling_elements: 8,
  bearing_ball_diameter_mm: 22.225,
  bearing_pitch_diameter_mm: 96.5,
  bearing_contact_angle_deg: null,
};

describe("bearingDefectFrequencies", () => {
  it("computes the classic defect frequencies for conveyor K-3", () => {
    const frequencies = bearingDefectFrequencies(k3);
    expect(frequencies.shaft).toBeCloseTo(24.667, 3);
    expect(frequencies.bpfo).toBeCloseTo(75.94, 2);
    expect(frequencies.bpfi).toBeCloseTo(121.39, 2);
    expect(frequencies.bsf).toBeCloseTo(50.71, 2);
    expect(frequencies.ftf).toBeCloseTo(9.49, 2);
  });

  it("matches the seed generator for every seeded bearing", () => {
    const bearings = EQUIPMENT_SPECS.flatMap((spec) => (spec.bearing ? [spec.bearing] : []));
    expect(bearings.length).toBeGreaterThan(3);
    bearings.forEach((bearing) => {
      const ours = bearingDefectFrequencies(bearing);
      const seed = seedFrequencies(bearing);
      expect(ours.shaft).toBeCloseTo(seed.shaft, 9);
      expect(ours.bpfo).toBeCloseTo(seed.outerRace, 9);
      expect(ours.bpfi).toBeCloseTo(seed.innerRace, 9);
      expect(ours.bsf).toBeCloseTo(seed.ball, 9);
      expect(ours.ftf).toBeCloseTo(seed.cage, 9);
    });
  });

  it("keeps BPFO + BPFI equal to the element count times shaft speed", () => {
    const { bpfo, bpfi, shaft } = bearingDefectFrequencies({ ...k3, contactAngleDeg: 15 });
    expect(bpfo + bpfi).toBeCloseTo(8 * shaft, 9);
  });

  it("shifts frequencies with the contact angle", () => {
    const straight = bearingDefectFrequencies(k3);
    const angled = bearingDefectFrequencies({ ...k3, contactAngleDeg: 40 });
    expect(angled.bpfo).toBeGreaterThan(straight.bpfo);
    expect(angled.bpfi).toBeLessThan(straight.bpfi);
    expect(angled.ftf).toBeGreaterThan(straight.ftf);
  });
});

describe("kinematicsFromEquipment", () => {
  it("builds the bearing geometry and defaults the contact angle to zero", () => {
    expect(kinematicsFromEquipment(equipmentRow)).toEqual({ rpm: 1480, bearing: k3 });
  });

  it("keeps the shaft speed when the bearing is unknown or invalid", () => {
    expect(kinematicsFromEquipment({ ...equipmentRow, bearing_rolling_elements: null })).toEqual({
      rpm: 1480,
      bearing: null,
    });
    expect(
      kinematicsFromEquipment({ ...equipmentRow, bearing_ball_diameter_mm: 120 }).bearing,
    ).toBeNull();
  });

  it("drops everything without a positive rpm", () => {
    expect(kinematicsFromEquipment({ ...equipmentRow, rpm: null })).toEqual({
      rpm: null,
      bearing: null,
    });
    expect(kinematicsFromEquipment({ ...equipmentRow, rpm: 0 }).rpm).toBeNull();
  });
});

describe("defect labels", () => {
  it("uses the seed label format", () => {
    expect(defectLabel("bpfo", 1)).toBe("BPFO");
    expect(defectLabel("bpfo", 2)).toBe("2xBPFO");
    expect(defectLabel("shaft", 1)).toBe("1x");
    expect(defectLabel("ftf", 3)).toBe("3xFTF");
  });

  it("parses labels back into defect keys", () => {
    expect(parseDefectLabel("BPFO")).toEqual({ key: "bpfo", harmonic: 1 });
    expect(parseDefectLabel("2xBPFI")).toEqual({ key: "bpfi", harmonic: 2 });
    expect(parseDefectLabel("3x")).toEqual({ key: "shaft", harmonic: 3 });
    expect(parseDefectLabel("BSF")).toEqual({ key: "bsf", harmonic: 1 });
    expect(parseDefectLabel(undefined)).toBeNull();
    expect(parseDefectLabel("hum")).toBeNull();
  });
});

describe("defectBands", () => {
  it("lists bearing and shaft harmonics inside the analysed range", () => {
    const bands = defectBands({ rpm: 1480, bearing: k3 });
    const labels = bands.map((band) => band.label);
    expect(labels).toEqual([
      "BPFO",
      "2xBPFO",
      "3xBPFO",
      "BPFI",
      "2xBPFI",
      "3xBPFI",
      "BSF",
      "2xBSF",
      "3xBSF",
      "3xFTF",
      "1x",
      "2x",
      "3x",
    ]);
    const bpfo = bands[0];
    expect(bpfo?.lowHz).toBeCloseTo(75.94 * 0.96, 1);
    expect(bpfo?.highHz).toBeCloseTo(75.94 * 1.04, 1);
  });

  it("respects options and an upper limit", () => {
    const bands = defectBands({ rpm: 1480, bearing: k3 }, { harmonics: 1, maxHz: 100 });
    expect(bands.map((band) => band.label)).toEqual(["BPFO", "BSF", "1x"]);
  });

  it("offers shaft harmonics only when the bearing is unknown", () => {
    expect(defectBands({ rpm: 1480, bearing: null }).map((band) => band.key)).toEqual([
      "shaft",
      "shaft",
      "shaft",
    ]);
    expect(defectBands({ rpm: null, bearing: null })).toEqual([]);
    expect(fundamentalFrequencies({ rpm: null, bearing: null })).toEqual({});
  });
});

describe("matchDefectBand", () => {
  const bands = defectBands({ rpm: 1480, bearing: k3 });

  it("matches the nearest band within the tolerance", () => {
    expect(matchDefectBand(76.5, bands)?.label).toBe("BPFO");
    expect(matchDefectBand(49.4, bands)?.label).toBe("2x");
    expect(matchDefectBand(50.6, bands)?.label).toBe("BSF");
    expect(matchDefectBand(300, bands)).toBeUndefined();
  });

  it("widens the tolerance to the frequency resolution", () => {
    expect(matchDefectBand(24.67 - 2, bands)).toBeUndefined();
    expect(matchDefectBand(24.67 - 2, bands, 0.03, 2.5)?.label).toBe("1x");
  });
});
