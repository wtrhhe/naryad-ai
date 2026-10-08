import {
  assessRisk,
  latestRiskInsights,
  maxRepeat,
  unplannedTrend,
  type RiskAssessment,
  type RiskInsight,
} from "@/lib/equipment/risk";
import type { Database } from "@/lib/supabase/database.types";

export const LIST_REPEAT_WINDOW_DAYS = 60;

export type EquipmentType = Database["public"]["Enums"]["equipment_type"];

export interface EquipmentListSource {
  id: string;
  name: string;
  inventoryNumber: string;
  siteId: string;
  siteName: string;
  equipmentType: EquipmentType;
  criticality: number;
}

export interface EquipmentListOrder {
  equipmentId: string;
  kind: "planned" | "unplanned";
  status: string;
  issuedAt: string;
  faultCodeId: string | null;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
}

export interface EquipmentListItem extends EquipmentListSource {
  risk: RiskAssessment;
  lockedOut: boolean;
  down: boolean;
  unplannedRecent: number;
}

export interface EquipmentListInput {
  equipment: readonly EquipmentListSource[];
  orders: readonly EquipmentListOrder[];
  lockedEquipmentIds: readonly string[];
  openRcaEquipmentIds: readonly string[];
  insights: readonly RiskInsight[];
}

export interface EquipmentListFilter {
  query?: string;
  siteId?: string;
}

const LEVEL_RANK = { high: 0, medium: 1, low: 2 } as const;

export function buildEquipmentList(input: EquipmentListInput, now: Date): EquipmentListItem[] {
  const ordersBy = new Map<string, EquipmentListOrder[]>();
  for (const order of input.orders) {
    ordersBy.set(order.equipmentId, [...(ordersBy.get(order.equipmentId) ?? []), order]);
  }
  const locked = new Set(input.lockedEquipmentIds);
  const insights = latestRiskInsights(input.insights);
  return input.equipment
    .map((item) => {
      const orders = ordersBy.get(item.id) ?? [];
      const trend = unplannedTrend(orders, now);
      const insight = insights.get(item.id);
      return {
        ...item,
        risk: assessRisk({
          unplannedRecent: trend.recent,
          unplannedPrevious: trend.previous,
          repeatMax: maxRepeat(orders, now, LIST_REPEAT_WINDOW_DAYS),
          openRca: input.openRcaEquipmentIds.filter((id) => id === item.id).length,
          criticality: item.criticality,
          insightSeverity: insight?.severity ?? null,
          insightScore: insight?.score ?? null,
        }),
        lockedOut: locked.has(item.id),
        down: orders.some((order) => order.downtimeStartedAt && !order.downtimeEndedAt),
        unplannedRecent: trend.recent,
      };
    })
    .sort(
      (a, b) =>
        LEVEL_RANK[a.risk.level] - LEVEL_RANK[b.risk.level] ||
        b.risk.score - a.risk.score ||
        a.name.localeCompare(b.name, "ru"),
    );
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function filterEquipmentList<T extends EquipmentListSource>(
  items: readonly T[],
  filter: EquipmentListFilter,
): T[] {
  const query = normalize(filter.query ?? "");
  return items.filter(
    (item) =>
      (!filter.siteId || item.siteId === filter.siteId) &&
      (!query ||
        normalize(`${item.name} ${item.inventoryNumber} ${item.siteName}`).includes(query)),
  );
}
