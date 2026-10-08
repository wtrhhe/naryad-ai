export type OrderKind = "planned" | "unplanned";
export type ShiftPeriod = "day" | "night";
export type FaultCategory = "mechanical" | "electrical" | "hydraulic" | "pneumatic" | "lubrication";
export type RcaStatus = "open" | "in_progress" | "closed";

export interface OrderFact {
  id: string;
  number: number;
  kind: OrderKind;
  status: string;
  siteId: string;
  equipmentId: string;
  faultCodeId: string | null;
  assigneeId: string | null;
  brigadeId: string | null;
  shiftPeriod: ShiftPeriod;
  shiftCrew: string | null;
  standardHours: number | null;
  issuedAt: number;
  doneAt: number | null;
  closedAt: number | null;
  downtimeHours: number;
  downtimeCost: number;
}

export interface WriteoffFact {
  orderId: string;
  materialId: string;
  quantity: number;
}

export interface MaterialNormFact {
  faultCodeId: string;
  materialId: string;
  qtyMin: number;
  qtyTypical: number;
  qtyMax: number;
}

export interface AcousticFact {
  equipmentId: string;
  recordedAt: number;
  peakDb: number | null;
  kurtosis: number | null;
  rms: number;
}

export interface EquipmentInfo {
  id: string;
  name: string;
  inventoryNumber: string;
  siteId: string;
  type: string;
  criticality: number;
  downtimeCostPerHour: number;
}

export interface SiteInfo {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeInfo {
  id: string;
  fullName: string;
  personnelNumber: string;
  role: string;
  brigadeId: string | null;
  crew: string | null;
  isActive: boolean;
  locale: "ru" | "kk";
  siteIds: string[];
}

export interface BrigadeInfo {
  id: string;
  name: string;
  siteId: string | null;
}

export interface FaultInfo {
  id: string;
  code: string;
  name: string;
  category: FaultCategory;
  standardHours: number;
}

export interface MaterialInfo {
  id: string;
  name: string;
  unit: string;
  price: number;
}

export interface RcaCaseFact {
  id: string;
  equipmentId: string;
  faultCodeId: string | null;
  status: RcaStatus;
  relatedOrderIds: string[];
  openedAt: number;
  closedAt: number | null;
}

export interface AnalyticsDataset {
  now: number;
  since: number;
  orders: OrderFact[];
  writeoffs: WriteoffFact[];
  norms: MaterialNormFact[];
  acoustic: AcousticFact[];
  equipment: EquipmentInfo[];
  sites: SiteInfo[];
  employees: EmployeeInfo[];
  brigades: BrigadeInfo[];
  faults: FaultInfo[];
  materials: MaterialInfo[];
  rcaCases: RcaCaseFact[];
}

export interface AnalysisWindow {
  days: number;
  start: number;
  end: number;
}
