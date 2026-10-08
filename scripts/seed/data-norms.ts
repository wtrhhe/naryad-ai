export type NormSpec = readonly [materialCode: string, min: number, typical: number, max: number];

export const NORM_SPECS: Readonly<Record<string, readonly NormSpec[]>> = {
  "М-01": [
    ["LINER-MILL", 1, 4, 8],
    ["LINER-CRUSH", 1, 1, 2],
    ["SCREEN-DECK", 1, 2, 4],
    ["BOLT-M24", 4, 8, 16],
    ["WELD-ROD", 0, 1, 2],
  ],
  "М-02": [
    ["BRG-22234", 1, 1, 2],
    ["BRG-22320", 1, 1, 2],
    ["BRG-6312", 1, 1, 2],
    ["BRG-6310", 1, 1, 2],
    ["BRG-6309", 1, 1, 2],
    ["GREASE-LITOL", 0.2, 0.5, 1],
  ],
  "М-03": [
    ["BELT-1000", 2, 6, 12],
    ["BELT-CLAMP", 1, 2, 4],
  ],
  "М-04": [
    ["ROLLER-159", 1, 2, 4],
    ["GREASE-LITOL", 0.1, 0.3, 0.6],
    ["BOLT-M24", 0, 2, 4],
  ],
  "М-05": [
    ["PKG-GLAND", 0.3, 0.8, 1.5],
    ["SLEEVE-SHAFT", 0, 1, 1],
    ["SEAL-GASKET", 0, 0.3, 0.6],
  ],
  "М-06": [
    ["WELD-ROD", 1, 3, 6],
    ["STEEL-PLATE", 5, 12, 30],
  ],
  "М-07": [
    ["COUPLING-INS", 1, 2, 4],
    ["GEAR-PINION", 0, 1, 1],
    ["OIL-TAD17", 2, 5, 12],
    ["BOLT-M24", 2, 6, 12],
  ],
  "Э-01": [
    ["VARNISH-INS", 0.5, 1, 2],
    ["FUSE-NH", 0, 1, 3],
    ["SENSOR-PT100", 0, 1, 1],
    ["CABLE-KG", 0, 3, 8],
  ],
  "Э-02": [
    ["WIRE-WINDING", 2, 6, 14],
    ["VARNISH-INS", 1, 3, 6],
  ],
  "Э-03": [
    ["CONTACTOR-25A", 1, 1, 2],
    ["FUSE-NH", 1, 2, 4],
  ],
  "Э-04": [
    ["CABLE-KG", 3, 12, 30],
    ["LUG-CABLE", 1, 2, 4],
  ],
  "Э-05": [
    ["SENSOR-PT100", 0, 1, 1],
    ["SENSOR-VIB", 0, 1, 1],
    ["SENSOR-LEVEL", 0, 1, 1],
  ],
  "Г-01": [
    ["HOSE-RVD", 1, 3, 8],
    ["HYD-OIL", 5, 20, 50],
    ["HYD-SEALKIT", 0, 1, 1],
  ],
  "Г-02": [
    ["HYD-SEALKIT", 1, 1, 2],
    ["HYD-OIL", 10, 30, 60],
  ],
  "Г-03": [
    ["HYD-OIL", 20, 40, 80],
    ["OIL-FILTER", 1, 1, 2],
    ["HYD-SEALKIT", 0, 1, 1],
  ],
  "П-01": [
    ["AIR-HOSE", 2, 6, 16],
    ["AIR-FILTER", 0, 1, 2],
  ],
  "П-02": [
    ["VALVE-52", 1, 1, 2],
    ["AIR-HOSE", 0, 2, 6],
  ],
  "С-01": [
    ["GREASE-LITOL", 0.5, 1.5, 3],
    ["GREASE-EP2", 0, 0.5, 1.5],
    ["OIL-I40A", 0, 2, 5],
  ],
  "С-02": [
    ["OIL-I40A", 5, 15, 40],
    ["OIL-FILTER", 1, 1, 2],
    ["OIL-TAD17", 0, 5, 15],
  ],
  "С-03": [
    ["GREASE-EP2", 1, 3, 8],
    ["OIL-FILTER", 0, 1, 2],
    ["SENSOR-LEVEL", 0, 1, 1],
  ],
};
