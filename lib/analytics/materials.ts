import { inWindow, shortPersonName, type AnalysisContext } from "@/lib/analytics/dataset";
import {
  chip,
  type InsightEntityType,
  type InsightOf,
  type MaterialDimension,
} from "@/lib/analytics/insight";
import { mean, median, round, significanceOfZ, sum, welchZ } from "@/lib/analytics/stats";
import type { OrderFact, ShiftPeriod } from "@/lib/analytics/types";

export const OVERUSE_MIN_ORDERS = 8;
export const OVERUSE_MIN_LIFT = 1.15;
export const OVERUSE_MIN_Z = 4;
export const OVERUSE_MAX_FINDINGS = 5;

interface MaterialLine {
  materialId: string;
  logRatio: number;
  excessCost: number;
}

export interface OrderUsage {
  order: OrderFact;
  logRatio: number;
  excessCost: number;
  lines: MaterialLine[];
}

const DIMENSIONS: readonly MaterialDimension[] = [
  "site_period",
  "site",
  "period",
  "crew",
  "worker",
  "brigade",
  "fault",
];

function normKey(faultCodeId: string, materialId: string): string {
  return `${faultCodeId}:${materialId}`;
}

export function collectUsage(context: AnalysisContext): OrderUsage[] {
  const { dataset, index } = context;
  const norms = new Map(
    dataset.norms
      .filter((norm) => norm.qtyTypical > 0)
      .map((norm) => [normKey(norm.faultCodeId, norm.materialId), norm.qtyTypical]),
  );
  const ordersById = new Map(dataset.orders.map((order) => [order.id, order]));
  const history = new Map<string, number[]>();
  for (const line of dataset.writeoffs) {
    const order = ordersById.get(line.orderId);
    if (!order?.faultCodeId) continue;
    const key = normKey(order.faultCodeId, line.materialId);
    history.set(key, [...(history.get(key) ?? []), line.quantity]);
  }
  const linesByOrder = new Map<string, MaterialLine[]>();
  for (const line of dataset.writeoffs) {
    const order = ordersById.get(line.orderId);
    if (!order?.faultCodeId || !inWindow(order.issuedAt, context.window) || line.quantity <= 0) {
      continue;
    }
    const key = normKey(order.faultCodeId, line.materialId);
    const baseline = norms.get(key) ?? median(history.get(key) ?? []);
    if (!(baseline > 0)) continue;
    const price = index.materials.get(line.materialId)?.price ?? 0;
    linesByOrder.set(order.id, [
      ...(linesByOrder.get(order.id) ?? []),
      {
        materialId: line.materialId,
        logRatio: Math.log(line.quantity / baseline),
        excessCost: Math.max(0, line.quantity - baseline) * price,
      },
    ]);
  }
  return [...linesByOrder.entries()].map(([orderId, lines]) => ({
    order: ordersById.get(orderId) as OrderFact,
    logRatio: mean(lines.map((line) => line.logRatio)),
    excessCost: sum(lines.map((line) => line.excessCost)),
    lines,
  }));
}

function keyOf(usage: OrderUsage, dimension: MaterialDimension): string | null {
  const { order } = usage;
  switch (dimension) {
    case "site_period":
      return `${order.siteId}|${order.shiftPeriod}`;
    case "site":
      return order.siteId;
    case "period":
      return order.shiftPeriod;
    case "crew":
      return order.shiftCrew;
    case "worker":
      return order.assigneeId;
    case "brigade":
      return order.brigadeId;
    case "fault":
      return order.faultCodeId;
  }
}

interface Candidate {
  dimension: MaterialDimension;
  key: string;
  members: OrderUsage[];
  restMean: number;
  z: number;
}

function bestCandidate(active: readonly OrderUsage[]): Candidate | null {
  let best: Candidate | null = null;
  for (const dimension of DIMENSIONS) {
    const groups = new Map<string, OrderUsage[]>();
    for (const usage of active) {
      const key = keyOf(usage, dimension);
      if (key) groups.set(key, [...(groups.get(key) ?? []), usage]);
    }
    for (const [key, members] of groups) {
      const memberIds = new Set(members.map((usage) => usage.order.id));
      const rest = active.filter((usage) => !memberIds.has(usage.order.id));
      if (members.length < OVERUSE_MIN_ORDERS || rest.length < OVERUSE_MIN_ORDERS) continue;
      const groupValues = members.map((usage) => usage.logRatio);
      const restValues = rest.map((usage) => usage.logRatio);
      const restMean = mean(restValues);
      if (mean(groupValues) - restMean < Math.log(OVERUSE_MIN_LIFT)) continue;
      const z = welchZ(groupValues, restValues);
      if (z < OVERUSE_MIN_Z) continue;
      if (!best || z > best.z) best = { dimension, key, members, restMean, z };
    }
  }
  return best;
}

function topMaterial(members: readonly OrderUsage[]): { id: string; percent: number } | null {
  const byMaterial = new Map<string, MaterialLine[]>();
  for (const line of members.flatMap((usage) => usage.lines)) {
    byMaterial.set(line.materialId, [...(byMaterial.get(line.materialId) ?? []), line]);
  }
  const ranked = [...byMaterial.entries()]
    .map(([id, lines]) => ({
      id,
      excess: sum(lines.map((line) => line.excessCost)),
      percent: round((Math.exp(mean(lines.map((line) => line.logRatio))) - 1) * 100),
    }))
    .sort((a, b) => b.excess - a.excess);
  const first = ranked[0];
  return first && first.excess > 0 ? { id: first.id, percent: first.percent } : null;
}

function describe(
  context: AnalysisContext,
  candidate: Candidate,
): {
  entityType: InsightEntityType | null;
  entityId: string | null;
  siteId: string | null;
  labels: {
    site: string | null;
    period: ShiftPeriod | null;
    crew: string | null;
    worker: string | null;
    brigade: string | null;
    faultCode: string | null;
    faultName: string | null;
  };
} {
  const { index } = context;
  const empty = {
    site: null,
    period: null,
    crew: null,
    worker: null,
    brigade: null,
    faultCode: null,
    faultName: null,
  };
  switch (candidate.dimension) {
    case "site_period": {
      const [siteId, period] = candidate.key.split("|") as [string, ShiftPeriod];
      return {
        entityType: "site",
        entityId: siteId,
        siteId,
        labels: { ...empty, site: index.sites.get(siteId)?.name ?? null, period },
      };
    }
    case "site":
      return {
        entityType: "site",
        entityId: candidate.key,
        siteId: candidate.key,
        labels: { ...empty, site: index.sites.get(candidate.key)?.name ?? null },
      };
    case "period":
      return {
        entityType: "shift",
        entityId: null,
        siteId: null,
        labels: { ...empty, period: candidate.key as ShiftPeriod },
      };
    case "crew":
      return {
        entityType: "shift",
        entityId: null,
        siteId: null,
        labels: { ...empty, crew: candidate.key },
      };
    case "worker": {
      const employee = index.employees.get(candidate.key);
      const brigade = employee?.brigadeId ? index.brigades.get(employee.brigadeId) : undefined;
      return {
        entityType: "employee",
        entityId: candidate.key,
        siteId: brigade?.siteId ?? null,
        labels: { ...empty, worker: employee ? shortPersonName(employee.fullName) : null },
      };
    }
    case "brigade": {
      const brigade = index.brigades.get(candidate.key);
      return {
        entityType: "brigade",
        entityId: candidate.key,
        siteId: brigade?.siteId ?? null,
        labels: { ...empty, brigade: brigade?.name ?? null },
      };
    }
    case "fault": {
      const fault = index.faults.get(candidate.key);
      return {
        entityType: null,
        entityId: null,
        siteId: null,
        labels: { ...empty, faultCode: fault?.code ?? null, faultName: fault?.name ?? null },
      };
    }
  }
}

export function findMaterialOveruse(context: AnalysisContext): InsightOf<"material_overuse">[] {
  let active = collectUsage(context);
  const findings: InsightOf<"material_overuse">[] = [];
  for (let step = 0; step < OVERUSE_MAX_FINDINGS; step += 1) {
    const candidate = bestCandidate(active);
    if (!candidate) break;
    const groupMean = mean(candidate.members.map((usage) => usage.logRatio));
    const overusePercent = round((Math.exp(groupMean) - 1) * 100);
    const vsRestPercent = round((Math.exp(groupMean - candidate.restMean) - 1) * 100);
    const excessCost = Math.round(sum(candidate.members.map((usage) => usage.excessCost)));
    const material = topMaterial(candidate.members);
    const z = round(candidate.z, 1);
    const described = describe(context, candidate);
    findings.push({
      kind: "material_overuse",
      entityType: described.entityType,
      entityId: described.entityId,
      severity: overusePercent >= 30 && candidate.z >= 6 ? 3 : 2,
      significance: significanceOfZ(candidate.z),
      siteId: described.siteId,
      equipmentId: null,
      faultCodeId: candidate.dimension === "fault" ? candidate.key : null,
      relatedOrderIds: [...candidate.members]
        .sort((a, b) => b.excessCost - a.excessCost)
        .slice(0, 20)
        .map((usage) => usage.order.id),
      rcaCaseId: null,
      params: {
        dimension: candidate.dimension,
        ...described.labels,
        orders: candidate.members.length,
        overusePercent,
        vsRestPercent,
        excessCost,
        topMaterial: material ? (context.index.materials.get(material.id)?.name ?? null) : null,
        topMaterialPercent: material?.percent ?? null,
        z,
      },
      chips: [
        chip("overuse", overusePercent, "percent"),
        chip("excessCost", excessCost, "money"),
        chip("orders", candidate.members.length, "count"),
        chip("zScore", z, "number"),
      ],
      stats: { z: candidate.z, groupMean, restMean: candidate.restMean },
    });
    const explained = new Set(candidate.members.map((usage) => usage.order.id));
    active = active.filter((usage) => !explained.has(usage.order.id));
  }
  return findings;
}
