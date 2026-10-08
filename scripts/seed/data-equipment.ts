import type { EquipmentType, SiteCode } from "./types";

export type BearingSpec = {
  readonly rpm: number;
  readonly rollingElements: number;
  readonly ballDiameterMm: number;
  readonly pitchDiameterMm: number;
  readonly contactAngleDeg: number;
};

export type EquipmentSpec = {
  readonly inventoryNumber: string;
  readonly name: string;
  readonly siteCode: SiteCode;
  readonly type: EquipmentType;
  readonly criticality: 1 | 2 | 3;
  readonly downtimeCostPerHour: number;
  readonly requiresLockout: boolean;
  readonly rpm?: number;
  readonly bearing?: BearingSpec;
};

export const SITE_SPECS: ReadonlyArray<{ readonly code: SiteCode; readonly name: string }> = [
  { code: "CRUSH", name: "Дробление" },
  { code: "ENRICH", name: "Обогащение" },
  { code: "RMC", name: "РМЦ" },
  { code: "LOAD", name: "Погрузка" },
];

const motorBearing6312 = (rpm: number): BearingSpec => ({
  rpm,
  rollingElements: 8,
  ballDiameterMm: 22.225,
  pitchDiameterMm: 96.5,
  contactAngleDeg: 0,
});

const pumpBearing6310 = (rpm: number): BearingSpec => ({
  rpm,
  rollingElements: 8,
  ballDiameterMm: 17.463,
  pitchDiameterMm: 80,
  contactAngleDeg: 0,
});

export const EQUIPMENT_SPECS: readonly EquipmentSpec[] = [
  {
    inventoryNumber: "ДР-001",
    name: "Дробилка КМД-1750",
    siteCode: "CRUSH",
    type: "crusher",
    criticality: 3,
    downtimeCostPerHour: 1_500_000,
    requiresLockout: true,
    rpm: 250,
    bearing: {
      rpm: 250,
      rollingElements: 17,
      ballDiameterMm: 24,
      pitchDiameterMm: 190,
      contactAngleDeg: 10,
    },
  },
  {
    inventoryNumber: "ДР-002",
    name: "Дробилка КСД-2200",
    siteCode: "CRUSH",
    type: "crusher",
    criticality: 3,
    downtimeCostPerHour: 1_100_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ДР-003",
    name: "Конвейер К-1",
    siteCode: "CRUSH",
    type: "conveyor",
    criticality: 2,
    downtimeCostPerHour: 450_000,
    requiresLockout: true,
    rpm: 1480,
    bearing: motorBearing6312(1480),
  },
  {
    inventoryNumber: "ДР-004",
    name: "Конвейер К-2",
    siteCode: "CRUSH",
    type: "conveyor",
    criticality: 2,
    downtimeCostPerHour: 420_000,
    requiresLockout: true,
    rpm: 1480,
    bearing: motorBearing6312(1480),
  },
  {
    inventoryNumber: "ДР-005",
    name: "Конвейер К-3",
    siteCode: "CRUSH",
    type: "conveyor",
    criticality: 3,
    downtimeCostPerHour: 650_000,
    requiresLockout: true,
    rpm: 1480,
    bearing: motorBearing6312(1480),
  },
  {
    inventoryNumber: "ДР-006",
    name: "Грохот ГИТ-52",
    siteCode: "CRUSH",
    type: "screen",
    criticality: 2,
    downtimeCostPerHour: 380_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ДР-007",
    name: "Питатель пластинчатый ПП-1",
    siteCode: "CRUSH",
    type: "feeder",
    criticality: 2,
    downtimeCostPerHour: 350_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ДР-008",
    name: "Насос Н-5",
    siteCode: "CRUSH",
    type: "pump",
    criticality: 1,
    downtimeCostPerHour: 150_000,
    requiresLockout: false,
  },
  {
    inventoryNumber: "ОБ-001",
    name: "Мельница МШР-3600×5000",
    siteCode: "ENRICH",
    type: "mill",
    criticality: 3,
    downtimeCostPerHour: 1_400_000,
    requiresLockout: true,
    rpm: 16.8,
  },
  {
    inventoryNumber: "ОБ-002",
    name: "Мельница МШЦ-3200×3100",
    siteCode: "ENRICH",
    type: "mill",
    criticality: 3,
    downtimeCostPerHour: 900_000,
    requiresLockout: true,
    rpm: 18.2,
  },
  {
    inventoryNumber: "ОБ-003",
    name: "Классификатор спиральный КСН-24",
    siteCode: "ENRICH",
    type: "classifier",
    criticality: 2,
    downtimeCostPerHour: 260_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ОБ-004",
    name: "Гидроциклон ГЦ-500",
    siteCode: "ENRICH",
    type: "classifier",
    criticality: 1,
    downtimeCostPerHour: 180_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ОБ-005",
    name: "Грохот ГИЛ-72",
    siteCode: "ENRICH",
    type: "screen",
    criticality: 2,
    downtimeCostPerHour: 340_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ОБ-006",
    name: "Конвейер К-4",
    siteCode: "ENRICH",
    type: "conveyor",
    criticality: 2,
    downtimeCostPerHour: 380_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ОБ-007",
    name: "Конвейер К-5",
    siteCode: "ENRICH",
    type: "conveyor",
    criticality: 2,
    downtimeCostPerHour: 300_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ОБ-008",
    name: "Насос Н-1",
    siteCode: "ENRICH",
    type: "pump",
    criticality: 2,
    downtimeCostPerHour: 320_000,
    requiresLockout: true,
    rpm: 1450,
    bearing: pumpBearing6310(1450),
  },
  {
    inventoryNumber: "ОБ-009",
    name: "Насос Н-2",
    siteCode: "ENRICH",
    type: "pump",
    criticality: 2,
    downtimeCostPerHour: 320_000,
    requiresLockout: true,
    rpm: 1450,
    bearing: pumpBearing6310(1450),
  },
  {
    inventoryNumber: "ОБ-010",
    name: "Насос Н-3",
    siteCode: "ENRICH",
    type: "pump",
    criticality: 2,
    downtimeCostPerHour: 280_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ОБ-011",
    name: "Насос Н-4",
    siteCode: "ENRICH",
    type: "pump",
    criticality: 3,
    downtimeCostPerHour: 540_000,
    requiresLockout: true,
    rpm: 1450,
    bearing: pumpBearing6310(1450),
  },
  {
    inventoryNumber: "ОБ-012",
    name: "Вентилятор ВЦ-14",
    siteCode: "ENRICH",
    type: "fan",
    criticality: 1,
    downtimeCostPerHour: 220_000,
    requiresLockout: true,
    rpm: 980,
    bearing: {
      rpm: 980,
      rollingElements: 8,
      ballDiameterMm: 17.463,
      pitchDiameterMm: 72.5,
      contactAngleDeg: 0,
    },
  },
  {
    inventoryNumber: "РМЦ-001",
    name: "Компрессор ВК-25",
    siteCode: "RMC",
    type: "compressor",
    criticality: 2,
    downtimeCostPerHour: 180_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "РМЦ-002",
    name: "Кран мостовой 12,5 т",
    siteCode: "RMC",
    type: "other",
    criticality: 1,
    downtimeCostPerHour: 160_000,
    requiresLockout: false,
  },
  {
    inventoryNumber: "ПГ-001",
    name: "Конвейер К-6",
    siteCode: "LOAD",
    type: "conveyor",
    criticality: 1,
    downtimeCostPerHour: 250_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ПГ-002",
    name: "Питатель ленточный ПЛ-2",
    siteCode: "LOAD",
    type: "feeder",
    criticality: 1,
    downtimeCostPerHour: 200_000,
    requiresLockout: true,
  },
  {
    inventoryNumber: "ПГ-003",
    name: "Вагоноопрокидыватель ВРС-93",
    siteCode: "LOAD",
    type: "other",
    criticality: 3,
    downtimeCostPerHour: 600_000,
    requiresLockout: true,
  },
];

export const CRUSHER_NAME = "Дробилка КМД-1750";
export const CONVEYOR_K3_NAME = "Конвейер К-3";
export const PUMP_N4_NAME = "Насос Н-4";

export const EQUIPMENT_TYPE_LABELS: Readonly<Record<EquipmentType, string>> = {
  crusher: "дробилка",
  conveyor: "конвейер",
  pump: "насос",
  screen: "грохот",
  mill: "мельница",
  classifier: "классификатор",
  feeder: "питатель",
  fan: "вентилятор",
  compressor: "компрессор",
  other: "прочее оборудование",
};
