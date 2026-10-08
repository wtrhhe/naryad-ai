import type { InsightKind, InsightParams } from "@/lib/analytics/insight";
import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/analytics/stats";
import type {
  AcousticFact,
  AnalyticsDataset,
  BrigadeInfo,
  EmployeeInfo,
  EquipmentInfo,
  FaultInfo,
  MaterialInfo,
  MaterialNormFact,
  OrderFact,
  SiteInfo,
  WriteoffFact,
} from "@/lib/analytics/types";

export const FIXTURE_NOW = Date.parse("2026-10-08T07:30:00Z");
export const HISTORY_DAYS = 90;

export function daysAgo(days: number): number {
  return FIXTURE_NOW - days * MS_PER_DAY;
}

export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SITES: SiteInfo[] = [
  { id: "site-crush", code: "CRUSH", name: "Дробление" },
  { id: "site-enrich", code: "ENRICH", name: "Обогащение" },
];

export const BRIGADES: BrigadeInfo[] = [
  { id: "brigade-crush", name: "Механослужба дробления", siteId: "site-crush" },
  { id: "brigade-enrich", name: "Механослужба обогащения", siteId: "site-enrich" },
];

export const FAULTS: FaultInfo[] = [
  {
    id: "f-bearing",
    code: "М-02",
    name: "Износ/разрушение подшипника",
    category: "mechanical",
    standardHours: 4,
  },
  {
    id: "f-belt",
    code: "М-03",
    name: "Обрыв/повреждение ленты",
    category: "mechanical",
    standardHours: 8,
  },
  {
    id: "f-gland",
    code: "М-05",
    name: "Течь сальникового уплотнения",
    category: "mechanical",
    standardHours: 3,
  },
  {
    id: "f-motor",
    code: "Э-01",
    name: "Перегрев/отключение электродвигателя",
    category: "electrical",
    standardHours: 3,
  },
  {
    id: "f-oil",
    code: "С-02",
    name: "Загрязнение/деградация смазки",
    category: "lubrication",
    standardHours: 2,
  },
];

export const MATERIALS: MaterialInfo[] = [
  { id: "m-grease", name: "Смазка Литол-24", unit: "кг", price: 2_000 },
  { id: "m-bearing", name: "Подшипник 6312", unit: "шт", price: 40_000 },
  { id: "m-packing", name: "Набивка сальниковая", unit: "кг", price: 9_000 },
];

export const NORMS: MaterialNormFact[] = FAULTS.flatMap((fault) => [
  { faultCodeId: fault.id, materialId: "m-grease", qtyMin: 0.5, qtyTypical: 1, qtyMax: 1.5 },
  { faultCodeId: fault.id, materialId: "m-packing", qtyMin: 1, qtyTypical: 2, qtyMax: 3 },
]);

function unit(
  id: string,
  name: string,
  type: string,
  siteId: string,
  criticality = 2,
): EquipmentInfo {
  return {
    id,
    name,
    inventoryNumber: id.toUpperCase(),
    siteId,
    type,
    criticality,
    downtimeCostPerHour: 400_000,
  };
}

export const EQUIPMENT: EquipmentInfo[] = [
  unit("c1", "Конвейер К-1", "conveyor", "site-crush"),
  unit("c2", "Конвейер К-2", "conveyor", "site-crush"),
  unit("c3", "Конвейер К-3", "conveyor", "site-crush", 3),
  unit("c4", "Конвейер К-4", "conveyor", "site-enrich"),
  unit("c5", "Конвейер К-5", "conveyor", "site-enrich"),
  unit("p1", "Насос Н-1", "pump", "site-enrich"),
  unit("p2", "Насос Н-2", "pump", "site-enrich"),
  unit("p3", "Насос Н-3", "pump", "site-enrich"),
  unit("p4", "Насос Н-4", "pump", "site-enrich"),
  unit("k1", "Дробилка КМД-1750", "crusher", "site-crush", 3),
  unit("k2", "Дробилка КСД-2200", "crusher", "site-crush", 3),
];

function worker(id: string, fullName: string, brigadeId: string, crew: string): EmployeeInfo {
  return {
    id,
    fullName,
    personnelNumber: id.replace("w", "20"),
    role: "worker",
    brigadeId,
    crew,
    isActive: true,
    locale: "ru",
    siteIds: [],
  };
}

export const EMPLOYEES: EmployeeInfo[] = [
  worker("w01", "Ахметов Ержан Болатович", "brigade-crush", "A"),
  worker("w02", "Иванов Дмитрий Петрович", "brigade-crush", "B"),
  worker("w03", "Попов Алексей Игоревич", "brigade-crush", "D"),
  worker("w04", "Мукашев Бауыржан Тлеуович", "brigade-enrich", "B"),
  worker("w05", "Федоренко Игорь Владимирович", "brigade-enrich", "C"),
  worker("w06", "Литвинов Павел Сергеевич", "brigade-enrich", "A"),
  {
    id: "m01",
    fullName: "Кравцов Сергей Викторович",
    personnelNumber: "1001",
    role: "master",
    brigadeId: null,
    crew: null,
    isActive: true,
    locale: "ru",
    siteIds: ["site-crush"],
  },
  {
    id: "m02",
    fullName: "Нурланов Ерлан Маратович",
    personnelNumber: "1002",
    role: "master",
    brigadeId: null,
    crew: null,
    isActive: true,
    locale: "kk",
    siteIds: ["site-enrich"],
  },
];

let orderSequence = 0;

export function order(overrides: Partial<OrderFact> = {}): OrderFact {
  orderSequence += 1;
  const issuedAt = overrides.issuedAt ?? daysAgo(10);
  const equipmentId = overrides.equipmentId ?? "c1";
  const equipmentInfo = EQUIPMENT.find((item) => item.id === equipmentId);
  return {
    id: `o-${orderSequence}`,
    number: orderSequence,
    kind: "unplanned",
    status: "closed",
    siteId: equipmentInfo?.siteId ?? "site-crush",
    equipmentId,
    faultCodeId: "f-motor",
    assigneeId: "w01",
    brigadeId: "brigade-crush",
    shiftPeriod: "day",
    shiftCrew: "A",
    standardHours: 3,
    issuedAt,
    doneAt: issuedAt + 4 * MS_PER_HOUR,
    closedAt: issuedAt + 6 * MS_PER_HOUR,
    downtimeHours: 4,
    downtimeCost: 1_600_000,
    ...overrides,
  };
}

export function writeoff(orderId: string, materialId: string, quantity: number): WriteoffFact {
  return { orderId, materialId, quantity };
}

export function acousticSample(
  equipmentId: string,
  daysBeforeNow: number,
  peakDb: number,
  kurtosis: number,
): AcousticFact {
  return {
    equipmentId,
    recordedAt: daysAgo(daysBeforeNow),
    peakDb,
    kurtosis,
    rms: 0.02,
  };
}

export function dataset(overrides: Partial<AnalyticsDataset> = {}): AnalyticsDataset {
  return {
    now: FIXTURE_NOW,
    since: daysAgo(HISTORY_DAYS),
    orders: [],
    writeoffs: [],
    norms: NORMS,
    acoustic: [],
    equipment: EQUIPMENT,
    sites: SITES,
    employees: EMPLOYEES,
    brigades: BRIGADES,
    faults: FAULTS,
    materials: MATERIALS,
    rcaCases: [],
    ...overrides,
  };
}

const BACKGROUND_FAULTS = ["f-motor", "f-belt", "f-oil", "f-bearing"];
const WORKERS_BY_SITE: Record<string, string[]> = {
  "site-crush": ["w01", "w02"],
  "site-enrich": ["w04", "w05", "w06"],
};

export function backgroundFailures(seed: number, perUnit = 12): OrderFact[] {
  const random = createRandom(seed);
  return EQUIPMENT.flatMap((equipmentInfo) =>
    Array.from({ length: perUnit }, () => {
      const issuedAt = daysAgo(1 + random() * (HISTORY_DAYS - 2));
      const workers = WORKERS_BY_SITE[equipmentInfo.siteId] ?? ["w01"];
      const assigneeId = workers[Math.floor(random() * workers.length)] as string;
      const night = random() < 0.5;
      return order({
        equipmentId: equipmentInfo.id,
        issuedAt,
        faultCodeId: BACKGROUND_FAULTS[Math.floor(random() * BACKGROUND_FAULTS.length)] as string,
        assigneeId,
        brigadeId: EMPLOYEES.find((employee) => employee.id === assigneeId)?.brigadeId ?? null,
        shiftPeriod: night ? "night" : "day",
        shiftCrew: ["A", "B", "C", "D"][Math.floor(random() * 4)] as string,
      });
    }),
  );
}

export const SAMPLE_PARAMS: { [K in InsightKind]: InsightParams[K] } = {
  failure_risk: {
    equipment: "Конвейер К-3",
    score: 79,
    level: "high",
    acoustic: { peakSlope: 5.6, kurtosisFrom: 4, kurtosisTo: 10.2, samples: 93 },
    unplanned30: 14,
    peerRatio: 2.5,
    trendPer30: 1.5,
    expectedNext30: 14.4,
    topFaultCode: "М-02",
    topFaultName: "Износ/разрушение подшипника",
    topFaultCategory: "mechanical",
    factors: ["acoustic", "frequency", "trend"],
  },
  problem_equipment: {
    equipment: "Конвейер К-3",
    unplanned: 7,
    days: 30,
    peerMedian: 2.3,
    peerRatio: 3.1,
    topFaultCode: "М-02",
    topFaultName: "Износ/разрушение подшипника",
    topFaultCount: 5,
    topFaultCategory: "mechanical",
    downtimeHours: 42.4,
    downtimeCost: 27_560_000,
  },
  repeat_fault: {
    equipment: "Насос Н-4",
    faultCode: "М-05",
    faultName: "Течь сальникового уплотнения",
    faultCategory: "mechanical",
    occurrences: 3,
    spanDays: 14.2,
    minGapDays: 5.4,
    maxGapDays: 8.8,
    expected: 0.7,
    rcaState: "open",
  },
  post_maintenance_failure: {
    equipment: "Дробилка КМД-1750",
    maintenances: 5,
    followed: 5,
    medianGapDays: 2.1,
    baselinePercent: 12,
    topFaultCode: "М-07",
    topFaultName: "Износ муфты/зацепления привода",
    topFaultCategory: "mechanical",
  },
  worker_repeat_failures: {
    worker: "Попов А. И.",
    personnelNumber: "2004",
    repairs: 32,
    repeats: 26,
    rate: 81,
    teamRate: 17,
    z: 8.1,
  },
  brigade_repeat_failures: {
    brigade: "Механослужба дробления",
    repairs: 120,
    repeats: 40,
    rate: 33,
    teamRate: 15,
    z: 4.2,
  },
  material_overuse: {
    dimension: "site_period",
    site: "Обогащение",
    period: "night",
    crew: null,
    worker: null,
    brigade: null,
    faultCode: null,
    faultName: null,
    orders: 98,
    overusePercent: 37,
    vsRestPercent: 37,
    excessCost: 2_291_785,
    topMaterial: "Набивка сальниковая",
    topMaterialPercent: 41,
    z: 16,
  },
  shift_effect: {
    measure: "failure_share",
    dimension: "period",
    group: "night",
    count: 60,
    total: 80,
    share: 75,
    expectedShare: 50,
    z: 4.5,
  },
  problem_site: {
    site: "Дробление",
    unplanned: 127,
    days: 90,
    downtimeHours: 757,
    downtimeCost: 503_720_256,
    costShare: 49,
    rateRatio: 1.3,
    rateSignificant: true,
    topEquipment: ["Конвейер К-3", "Дробилка КМД-1750"],
  },
};
