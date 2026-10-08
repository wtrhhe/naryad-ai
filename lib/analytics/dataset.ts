import { MS_PER_DAY, median } from "@/lib/analytics/stats";
import type {
  AnalysisWindow,
  AnalyticsDataset,
  BrigadeInfo,
  EmployeeInfo,
  EquipmentInfo,
  FaultInfo,
  MaterialInfo,
  OrderFact,
  RcaCaseFact,
  SiteInfo,
} from "@/lib/analytics/types";

export const PLANT_UTC_OFFSET_HOURS = 5;

export interface DatasetIndex {
  equipment: Map<string, EquipmentInfo>;
  sites: Map<string, SiteInfo>;
  employees: Map<string, EmployeeInfo>;
  brigades: Map<string, BrigadeInfo>;
  faults: Map<string, FaultInfo>;
  materials: Map<string, MaterialInfo>;
  openRcaByPair: Map<string, RcaCaseFact>;
  lastClosedRcaByPair: Map<string, RcaCaseFact>;
}

export interface AnalysisContext {
  dataset: AnalyticsDataset;
  index: DatasetIndex;
  window: AnalysisWindow;
  historyDays: number;
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function pairKey(equipmentId: string, faultCodeId: string | null): string {
  return `${equipmentId}:${faultCodeId ?? "none"}`;
}

export function indexDataset(dataset: AnalyticsDataset): DatasetIndex {
  const openRcaByPair = new Map<string, RcaCaseFact>();
  const lastClosedRcaByPair = new Map<string, RcaCaseFact>();
  for (const rcaCase of dataset.rcaCases) {
    const key = pairKey(rcaCase.equipmentId, rcaCase.faultCodeId);
    if (rcaCase.status !== "closed") {
      openRcaByPair.set(key, rcaCase);
      continue;
    }
    const previous = lastClosedRcaByPair.get(key);
    if (!previous || (rcaCase.closedAt ?? 0) > (previous.closedAt ?? 0)) {
      lastClosedRcaByPair.set(key, rcaCase);
    }
  }
  return {
    equipment: byId(dataset.equipment),
    sites: byId(dataset.sites),
    employees: byId(dataset.employees),
    brigades: byId(dataset.brigades),
    faults: byId(dataset.faults),
    materials: byId(dataset.materials),
    openRcaByPair,
    lastClosedRcaByPair,
  };
}

export function createContext(dataset: AnalyticsDataset, windowDays: number): AnalysisContext {
  const historyDays = Math.max(1, (dataset.now - dataset.since) / MS_PER_DAY);
  const days = Math.min(windowDays, Math.round(historyDays));
  return {
    dataset,
    index: indexDataset(dataset),
    window: { days, start: dataset.now - days * MS_PER_DAY, end: dataset.now },
    historyDays,
  };
}

export function isFailure(order: OrderFact): boolean {
  return order.kind === "unplanned" && order.status !== "cancelled";
}

export function inWindow(timestamp: number, window: AnalysisWindow): boolean {
  return timestamp >= window.start && timestamp <= window.end;
}

export function repairFinishedAt(order: OrderFact): number | null {
  return order.doneAt ?? order.closedAt;
}

export function shortPersonName(fullName: string): string {
  const [surname, ...rest] = fullName.trim().split(/\s+/);
  const initials = rest
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0)}.`)
    .join(" ");
  return initials ? `${surname} ${initials}` : (surname ?? fullName);
}

export function plantHour(timestamp: number): number {
  return new Date(timestamp + PLANT_UTC_OFFSET_HOURS * 3_600_000).getUTCHours();
}

export function plantWeekday(timestamp: number): number {
  return new Date(timestamp + PLANT_UTC_OFFSET_HOURS * 3_600_000).getUTCDay();
}

export function topBy<T>(
  items: readonly T[],
  key: (item: T) => string | null,
): {
  key: string | null;
  count: number;
} {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: { key: string | null; count: number } = { key: null, count: 0 };
  for (const [value, count] of counts) {
    if (count > best.count || (count === best.count && best.key !== null && value < best.key)) {
      best = { key: value, count };
    }
  }
  return best;
}

export function peersOf(context: AnalysisContext, equipment: EquipmentInfo): EquipmentInfo[] {
  const others = context.dataset.equipment.filter((unit) => unit.id !== equipment.id);
  const sameType = others.filter((unit) => unit.type === equipment.type);
  return sameType.length >= 2 ? sameType : others;
}

export function failureCountsByEquipment(
  orders: readonly OrderFact[],
  from: number,
  to: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (isFailure(order) && order.issuedAt >= from && order.issuedAt <= to) {
      counts.set(order.equipmentId, (counts.get(order.equipmentId) ?? 0) + 1);
    }
  }
  return counts;
}

export function peerDailyRate(
  context: AnalysisContext,
  equipment: EquipmentInfo,
  historyCounts: ReadonlyMap<string, number>,
): number {
  const peers = peersOf(context, equipment);
  if (peers.length === 0) return 0;
  return median(peers.map((peer) => historyCounts.get(peer.id) ?? 0)) / context.historyDays;
}
