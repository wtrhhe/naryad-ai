import type {
  AssistantGateway,
  EquipmentRef,
  InsightRecord,
  OrderRecord,
  RcaRecord,
  SiteRef,
  WorkerRecord,
} from "@/lib/assistant/types";

export const FIXTURE_NOW = new Date("2026-10-08T09:30:00Z");

export const FIXTURE_SITES: SiteRef[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Дробление", code: "CRUSH" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Обогащение", code: "ENRICH" },
];

const [CRUSH, ENRICH] = FIXTURE_SITES.map((site) => site.id) as [string, string];

export const FIXTURE_EQUIPMENT: EquipmentRef[] = [
  {
    id: "00000000-0000-4000-8000-0000000000e1",
    name: "Конвейер К-3",
    inventoryNumber: "ДР-005",
    siteId: CRUSH,
    downtimeCostPerHour: 300_000,
  },
  {
    id: "00000000-0000-4000-8000-0000000000e2",
    name: "Конвейер К-1",
    inventoryNumber: "ДР-003",
    siteId: CRUSH,
    downtimeCostPerHour: 200_000,
  },
  {
    id: "00000000-0000-4000-8000-0000000000e3",
    name: "Дробилка КМД-1750",
    inventoryNumber: "ДР-001",
    siteId: CRUSH,
    downtimeCostPerHour: 1_500_000,
  },
  {
    id: "00000000-0000-4000-8000-0000000000e4",
    name: "Насос Н-4",
    inventoryNumber: "ОБ-011",
    siteId: ENRICH,
    downtimeCostPerHour: 100_000,
  },
];

const [K3, K1, KMD, N4] = FIXTURE_EQUIPMENT as [
  EquipmentRef,
  EquipmentRef,
  EquipmentRef,
  EquipmentRef,
];

export const FIXTURE_WORKERS: WorkerRecord[] = [
  {
    id: "w1",
    fullName: "Ахметов Ерлан Маратович",
    specialty: "electrician",
    onShift: true,
    activeOrderNumber: 101,
    queueLength: 0,
    siteIds: [CRUSH],
  },
  {
    id: "w2",
    fullName: "Петров Иван Сергеевич",
    specialty: "electrician",
    onShift: true,
    activeOrderNumber: null,
    queueLength: 0,
    siteIds: [CRUSH],
  },
  {
    id: "w3",
    fullName: "Сидоров Пётр Ильич",
    specialty: "electrician",
    onShift: true,
    activeOrderNumber: null,
    queueLength: 2,
    siteIds: [ENRICH],
  },
  {
    id: "w4",
    fullName: "Ким Олег",
    specialty: "fitter",
    onShift: true,
    activeOrderNumber: null,
    queueLength: 0,
    siteIds: [ENRICH],
  },
  {
    id: "w5",
    fullName: "Иванов Иван Иванович",
    specialty: "electrician",
    onShift: false,
    activeOrderNumber: null,
    queueLength: 0,
    siteIds: [CRUSH],
  },
];

function order(overrides: Partial<OrderRecord> & Pick<OrderRecord, "id" | "number">): OrderRecord {
  return {
    kind: "unplanned",
    priority: "normal",
    status: "issued",
    description: "Замена ролика",
    siteId: K3.siteId,
    siteName: "Дробление",
    equipmentId: K3.id,
    equipmentName: K3.name,
    downtimeCostPerHour: K3.downtimeCostPerHour,
    assigneeName: null,
    issuedAt: "2026-10-08T03:30:00Z",
    dueAt: null,
    standardHours: null,
    doneAt: null,
    closedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    downtimeStartedAt: null,
    downtimeEndedAt: null,
    faultCode: null,
    ...overrides,
  };
}

export const FIXTURE_ORDERS: OrderRecord[] = [
  order({
    id: "o1",
    number: 101,
    status: "in_progress",
    priority: "high",
    dueAt: "2026-10-08T05:00:00Z",
    assigneeName: "Ахметов Ерлан Маратович",
    faultCode: { code: "М-02", name: "Износ подшипника" },
    downtimeStartedAt: "2026-10-08T04:00:00Z",
  }),
  order({
    id: "o2",
    number: 102,
    kind: "planned",
    siteId: N4.siteId,
    siteName: "Обогащение",
    equipmentId: N4.id,
    equipmentName: N4.name,
    downtimeCostPerHour: N4.downtimeCostPerHour,
    issuedAt: "2026-10-08T06:00:00Z",
    standardHours: 2,
  }),
  order({
    id: "o3",
    number: 103,
    kind: "planned",
    status: "accepted",
    equipmentId: KMD.id,
    equipmentName: KMD.name,
    downtimeCostPerHour: KMD.downtimeCostPerHour,
    issuedAt: "2026-10-07T20:00:00Z",
    dueAt: "2026-10-08T12:00:00Z",
    assigneeName: "Петров Иван Сергеевич",
  }),
  order({
    id: "o4",
    number: 90,
    status: "closed",
    issuedAt: "2026-10-01T03:00:00Z",
    dueAt: "2026-10-01T08:00:00Z",
    doneAt: "2026-10-01T06:00:00Z",
    closedAt: "2026-10-01T07:00:00Z",
    faultCode: { code: "М-02", name: "Износ подшипника" },
    downtimeStartedAt: "2026-10-01T03:00:00Z",
    downtimeEndedAt: "2026-10-01T05:00:00Z",
    description: "Замена подшипника приводного барабана после остановки конвейера",
  }),
  order({
    id: "o5",
    number: 95,
    status: "closed",
    siteId: N4.siteId,
    siteName: "Обогащение",
    equipmentId: N4.id,
    equipmentName: N4.name,
    downtimeCostPerHour: N4.downtimeCostPerHour,
    issuedAt: "2026-10-08T03:10:00Z",
    dueAt: "2026-10-08T04:00:00Z",
    doneAt: "2026-10-08T05:00:00Z",
    closedAt: "2026-10-08T06:00:00Z",
    faultCode: { code: "Г-01", name: "Утечка гидравлической жидкости" },
  }),
  order({
    id: "o6",
    number: 96,
    status: "rejected",
    siteId: N4.siteId,
    siteName: "Обогащение",
    equipmentId: N4.id,
    equipmentName: N4.name,
    issuedAt: "2026-10-08T03:20:00Z",
    dueAt: "2026-10-08T04:00:00Z",
    rejectedAt: "2026-10-08T03:40:00Z",
  }),
  order({
    id: "o7",
    number: 80,
    status: "cancelled",
    equipmentId: K1.id,
    equipmentName: K1.name,
    issuedAt: "2026-09-30T03:00:00Z",
    cancelledAt: "2026-09-30T04:00:00Z",
  }),
];

export const FIXTURE_INSIGHTS: InsightRecord[] = [
  {
    id: "i1",
    kind: "repeat_failure",
    severity: 3,
    summary: "Конвейер К-3: 2 внеплановые остановки за 30 дней, обе по М-02",
    recommendation: "Проверить соосность привода",
    entityType: "equipment",
    entityId: K3.id,
    createdAt: "2026-10-07T00:00:00Z",
  },
  {
    id: "i2",
    kind: "material_anomaly",
    severity: 2,
    summary: "Ночная смена обогащения расходует больше уплотнений",
    recommendation: null,
    entityType: "site",
    entityId: ENRICH,
    createdAt: "2026-10-06T00:00:00Z",
  },
];

export const FIXTURE_RCA: RcaRecord[] = [
  {
    id: "r1",
    equipmentId: K3.id,
    equipmentName: K3.name,
    status: "open",
    faultCode: { code: "М-02", name: "Износ подшипника" },
    rootCause: null,
    openedAt: "2026-10-02T00:00:00Z",
  },
];

export interface FakeGatewayOptions {
  viewerSiteIds?: string[] | null;
  failOn?: keyof AssistantGateway;
}

export function fakeGateway(options: FakeGatewayOptions = {}) {
  const calls: Record<string, number> = {};
  const track = <T>(name: keyof AssistantGateway, value: () => T): Promise<T> => {
    calls[name] = (calls[name] ?? 0) + 1;
    if (options.failOn === name) {
      return Promise.reject(new Error(`${name} failed`));
    }
    return Promise.resolve(value());
  };
  const gateway: AssistantGateway = {
    sites: () => track("sites", () => FIXTURE_SITES),
    equipment: () => track("equipment", () => FIXTURE_EQUIPMENT),
    workers: () => track("workers", () => FIXTURE_WORKERS),
    openOrders: () =>
      track("openOrders", () =>
        FIXTURE_ORDERS.filter((item) => !["closed", "cancelled"].includes(item.status)),
      ),
    ordersActiveBetween: (from, to) =>
      track("ordersActiveBetween", () =>
        FIXTURE_ORDERS.filter((item) => {
          const issued = Date.parse(item.issuedAt) < to.getTime();
          const closed = item.closedAt ? Date.parse(item.closedAt) >= from.getTime() : null;
          const cancelled = item.cancelledAt
            ? Date.parse(item.cancelledAt) >= from.getTime()
            : null;
          return (
            issued &&
            ((closed === null && cancelled === null) || closed === true || cancelled === true)
          );
        }),
      ),
    ordersIssuedSince: (since, scope) =>
      track("ordersIssuedSince", () =>
        FIXTURE_ORDERS.filter(
          (item) =>
            Date.parse(item.issuedAt) >= since.getTime() &&
            (!scope.siteId || item.siteId === scope.siteId) &&
            (!scope.equipmentId || item.equipmentId === scope.equipmentId),
        ),
      ),
    insightsSince: (since) =>
      track("insightsSince", () =>
        FIXTURE_INSIGHTS.filter((item) => Date.parse(item.createdAt) >= since.getTime()),
      ),
    openRca: (equipmentIds) =>
      track("openRca", () => FIXTURE_RCA.filter((item) => equipmentIds.includes(item.equipmentId))),
    viewerSiteIds: () =>
      track("viewerSiteIds", () =>
        options.viewerSiteIds === undefined ? [CRUSH] : options.viewerSiteIds,
      ),
  };
  return { gateway, calls };
}
