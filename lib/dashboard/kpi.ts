import { isOverdue } from "@/lib/domain/overdue";
import { OPEN_STATUSES, type WorkOrderStatus } from "@/lib/domain/work-order-machine";
import {
  assessRisk,
  latestRiskInsights,
  levelForSeverity,
  maxRepeat,
  unplannedTrend,
  type RiskInsight,
  type RiskLevel,
  type RiskReason,
} from "@/lib/equipment/risk";
import {
  dayKeys,
  dayStartMs,
  localDayKey,
  periodWindow,
  type PeriodDays,
  type PeriodWindow,
} from "@/lib/dashboard/period";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
export const TOP_LIMIT = 5;
export const MIN_CLOSED_FOR_RANKING = 3;
export const RISK_REPEAT_WINDOW_DAYS = 60;

export interface DashboardOrder {
  id: string;
  number: number;
  kind: "planned" | "unplanned";
  status: WorkOrderStatus;
  issuedAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  doneAt: string | null;
  closedAt: string | null;
  dueAt: string | null;
  standardHours: number | null;
  pausedSeconds: number;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
  downtimeCost: number | null;
  equipmentId: string;
  faultCodeId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  score: number | null;
}

export interface DashboardEquipment {
  id: string;
  name: string;
  inventoryNumber: string;
  siteName: string;
  criticality: number;
  downtimeCostPerHour: number;
}

export interface OpenDowntime {
  startedAt: string;
  costPerHour: number;
}

export interface DowntimeKpi {
  hours: number;
  cost: number;
  closedHours: number;
  closedCost: number;
  open: OpenDowntime[];
  equipmentDown: number;
}

export interface DurationKpi {
  minutes: number | null;
  count: number;
}

export interface DashboardKpis {
  open: number;
  executing: number;
  overdue: number;
  issued: number;
  closed: number;
  reaction: DurationKpi;
  completion: DurationKpi;
  downtime: DowntimeKpi;
}

export interface DayPoint {
  day: string;
  issued: number;
  closed: number;
  downtimeHours: number;
  downtimeCost: number;
}

export interface EquipmentProblem {
  equipmentId: string;
  name: string;
  inventoryNumber: string;
  siteName: string;
  unplanned: number;
  downtimeHours: number;
  downtimeCost: number;
}

export interface WorkerScore {
  employeeId: string;
  name: string;
  closed: number;
  avgScore: number | null;
}

export interface LockoutRow {
  id: string;
  equipmentId: string;
  equipmentName: string;
  orderNumber: number | null;
  lockedAt: string;
  lockedBy: string | null;
}

export interface RcaRow {
  id: string;
  equipmentId: string;
  equipmentName: string;
  faultCode: string | null;
  faultName: string | null;
  status: "open" | "in_progress";
  openedAt: string;
  relatedOrders: number;
}

export interface RiskRow {
  equipmentId: string;
  name: string;
  siteName: string;
  level: RiskLevel;
  score: number;
  source: "insight" | "trend";
  recent: number;
  previous: number;
  summary: string | null;
  recommendation: string | null;
  reasons: RiskReason[];
}

export interface DashboardInput {
  orders: readonly DashboardOrder[];
  equipment: readonly DashboardEquipment[];
  lockouts: readonly LockoutRow[];
  rca: readonly RcaRow[];
  insights: readonly RiskInsight[];
}

export interface DashboardModel {
  period: { days: PeriodDays; start: string; end: string };
  kpis: DashboardKpis;
  series: DayPoint[];
  topEquipment: EquipmentProblem[];
  bestWorkers: WorkerScore[];
  lockouts: LockoutRow[];
  rca: RcaRow[];
  risks: RiskRow[];
}

export interface ReviewScoreSource {
  revision: number;
  score: number | null;
  masterScore: number | null;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function within(iso: string | null, window: PeriodWindow): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= window.start.getTime() && time <= window.end.getTime();
}

function average(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function reviewScore(reviews: readonly ReviewScoreSource[]): number | null {
  const latest = [...reviews].sort((a, b) => b.revision - a.revision)[0];
  return latest ? (latest.masterScore ?? latest.score ?? null) : null;
}

export function isOpenOrder(order: DashboardOrder): boolean {
  return OPEN_STATUSES.includes(order.status);
}

export interface DowntimeSlice {
  start: number;
  end: number;
  hours: number;
  cost: number;
  costPerHour: number;
  open: boolean;
}

export function downtimeSlice(
  order: DashboardOrder,
  rate: number,
  fromMs: number,
  now: Date,
): DowntimeSlice | null {
  if (!order.downtimeStartedAt) return null;
  const startedMs = new Date(order.downtimeStartedAt).getTime();
  const open = order.downtimeEndedAt === null;
  const endedMs = open ? now.getTime() : new Date(order.downtimeEndedAt as string).getTime();
  const start = Math.max(startedMs, fromMs);
  const end = Math.min(endedMs, now.getTime());
  if (end <= start) return null;
  const totalHours = (endedMs - startedMs) / MS_PER_HOUR;
  const costPerHour =
    !open && order.downtimeCost !== null && totalHours > 0 ? order.downtimeCost / totalHours : rate;
  const hours = (end - start) / MS_PER_HOUR;
  return { start, end, hours, cost: hours * costPerHour, costPerHour, open };
}

function rates(equipment: readonly DashboardEquipment[]): Map<string, number> {
  return new Map(equipment.map((item) => [item.id, item.downtimeCostPerHour]));
}

export function summarizeKpis(
  orders: readonly DashboardOrder[],
  equipment: readonly DashboardEquipment[],
  window: PeriodWindow,
  now: Date,
): DashboardKpis {
  const open = orders.filter(isOpenOrder);
  const reactions = orders
    .filter((order) => within(order.issuedAt, window) && order.acceptedAt)
    .map(
      (order) =>
        (new Date(order.acceptedAt as string).getTime() - new Date(order.issuedAt).getTime()) /
        MS_PER_MINUTE,
    )
    .filter((minutes) => minutes >= 0);
  const completions = orders
    .filter((order) => within(order.doneAt, window) && order.startedAt)
    .map((order) =>
      Math.max(
        0,
        (new Date(order.doneAt as string).getTime() -
          new Date(order.startedAt as string).getTime()) /
          MS_PER_MINUTE -
          order.pausedSeconds / 60,
      ),
    );
  const rateOf = rates(equipment);
  const slices = orders
    .map((order) => ({
      order,
      slice: downtimeSlice(order, rateOf.get(order.equipmentId) ?? 0, window.start.getTime(), now),
    }))
    .filter((entry): entry is { order: DashboardOrder; slice: DowntimeSlice } => !!entry.slice);
  const closedSlices = slices.filter(({ slice }) => !slice.open);
  const openSlices = slices.filter(({ slice }) => slice.open);
  const closedHours = closedSlices.reduce((sum, { slice }) => sum + slice.hours, 0);
  const closedCost = closedSlices.reduce((sum, { slice }) => sum + slice.cost, 0);
  const openHours = openSlices.reduce((sum, { slice }) => sum + slice.hours, 0);
  const openCost = openSlices.reduce((sum, { slice }) => sum + slice.cost, 0);
  return {
    open: open.length,
    executing: open.filter((order) => order.status === "in_progress").length,
    overdue: open.filter((order) => isOverdue(order, now)).length,
    issued: orders.filter((order) => within(order.issuedAt, window)).length,
    closed: orders.filter((order) => order.status === "closed" && within(order.closedAt, window))
      .length,
    reaction: { minutes: average(reactions), count: reactions.length },
    completion: { minutes: average(completions), count: completions.length },
    downtime: {
      hours: round(closedHours + openHours, 2),
      cost: Math.round(closedCost + openCost),
      closedHours: round(closedHours, 4),
      closedCost: Math.round(closedCost),
      open: openSlices.map(({ slice }) => ({
        startedAt: new Date(slice.start).toISOString(),
        costPerHour: slice.costPerHour,
      })),
      equipmentDown: new Set(openSlices.map(({ order }) => order.equipmentId)).size,
    },
  };
}

export function liveDowntime(
  base: { closedHours: number; closedCost: number },
  open: readonly OpenDowntime[],
  now: Date,
): { hours: number; cost: number; currentCost: number } {
  const running = open.map((item) => {
    const hours = Math.max(0, now.getTime() - new Date(item.startedAt).getTime()) / MS_PER_HOUR;
    return { hours, cost: hours * item.costPerHour };
  });
  const openHours = running.reduce((sum, item) => sum + item.hours, 0);
  const openCost = running.reduce((sum, item) => sum + item.cost, 0);
  return {
    hours: base.closedHours + openHours,
    cost: Math.round(base.closedCost + openCost),
    currentCost: Math.round(openCost),
  };
}

export function dailySeries(
  orders: readonly DashboardOrder[],
  equipment: readonly DashboardEquipment[],
  window: PeriodWindow,
  now: Date,
): DayPoint[] {
  const points = new Map<string, DayPoint>(
    dayKeys(window).map((day) => [
      day,
      { day, issued: 0, closed: 0, downtimeHours: 0, downtimeCost: 0 },
    ]),
  );
  const rateOf = rates(equipment);
  for (const order of orders) {
    if (within(order.issuedAt, window)) {
      const point = points.get(localDayKey(order.issuedAt));
      if (point) point.issued += 1;
    }
    if (order.status === "closed" && within(order.closedAt, window)) {
      const point = points.get(localDayKey(order.closedAt as string));
      if (point) point.closed += 1;
    }
    const slice = downtimeSlice(
      order,
      rateOf.get(order.equipmentId) ?? 0,
      window.start.getTime(),
      now,
    );
    if (!slice) continue;
    for (let cursor = dayStartMs(localDayKey(slice.start)); cursor < slice.end;) {
      const next = cursor + MS_PER_DAY;
      const hours = (Math.min(slice.end, next) - Math.max(slice.start, cursor)) / MS_PER_HOUR;
      const point = points.get(localDayKey(cursor));
      if (point && hours > 0) {
        point.downtimeHours += hours;
        point.downtimeCost += hours * slice.costPerHour;
      }
      cursor = next;
    }
  }
  return [...points.values()].map((point) => ({
    ...point,
    downtimeHours: round(point.downtimeHours, 2),
    downtimeCost: Math.round(point.downtimeCost),
  }));
}

export function topEquipment(
  orders: readonly DashboardOrder[],
  equipment: readonly DashboardEquipment[],
  window: PeriodWindow,
  now: Date,
  limit = TOP_LIMIT,
): EquipmentProblem[] {
  const tally = new Map<string, { unplanned: number; hours: number; cost: number }>();
  const rateOf = rates(equipment);
  for (const order of orders) {
    const current = tally.get(order.equipmentId) ?? { unplanned: 0, hours: 0, cost: 0 };
    if (
      order.kind === "unplanned" &&
      order.status !== "cancelled" &&
      within(order.issuedAt, window)
    ) {
      current.unplanned += 1;
    }
    const slice = downtimeSlice(
      order,
      rateOf.get(order.equipmentId) ?? 0,
      window.start.getTime(),
      now,
    );
    if (slice) {
      current.hours += slice.hours;
      current.cost += slice.cost;
    }
    tally.set(order.equipmentId, current);
  }
  return equipment
    .map((item) => {
      const stats = tally.get(item.id) ?? { unplanned: 0, hours: 0, cost: 0 };
      return {
        equipmentId: item.id,
        name: item.name,
        inventoryNumber: item.inventoryNumber,
        siteName: item.siteName,
        unplanned: stats.unplanned,
        downtimeHours: round(stats.hours),
        downtimeCost: Math.round(stats.cost),
      };
    })
    .filter((item) => item.unplanned > 0 || item.downtimeCost > 0)
    .sort(
      (a, b) =>
        b.unplanned - a.unplanned ||
        b.downtimeCost - a.downtimeCost ||
        a.name.localeCompare(b.name, "ru"),
    )
    .slice(0, limit);
}

export function bestWorkers(
  orders: readonly DashboardOrder[],
  window: PeriodWindow,
  limit = TOP_LIMIT,
  minClosed = MIN_CLOSED_FOR_RANKING,
): WorkerScore[] {
  const tally = new Map<string, { name: string; closed: number; scores: number[] }>();
  for (const order of orders) {
    if (order.status !== "closed" || !order.assigneeId || !within(order.closedAt, window)) continue;
    const current = tally.get(order.assigneeId) ?? {
      name: order.assigneeName ?? "",
      closed: 0,
      scores: [],
    };
    current.closed += 1;
    if (order.score !== null) current.scores.push(order.score);
    tally.set(order.assigneeId, current);
  }
  const rows = [...tally.entries()].map(([employeeId, stats]) => ({
    employeeId,
    name: stats.name,
    closed: stats.closed,
    avgScore: average(stats.scores),
  }));
  const qualified = (row: WorkerScore) => (row.closed >= minClosed ? 0 : 1);
  return rows
    .sort(
      (a, b) =>
        qualified(a) - qualified(b) ||
        (b.avgScore ?? -1) - (a.avgScore ?? -1) ||
        b.closed - a.closed ||
        a.name.localeCompare(b.name, "ru"),
    )
    .slice(0, limit);
}

export function riskList(
  input: Pick<DashboardInput, "orders" | "equipment" | "insights" | "rca">,
  now: Date,
  limit = TOP_LIMIT,
): RiskRow[] {
  const byEquipment = new Map<string, DashboardOrder[]>();
  for (const order of input.orders) {
    byEquipment.set(order.equipmentId, [...(byEquipment.get(order.equipmentId) ?? []), order]);
  }
  const openRca = new Map<string, number>();
  for (const item of input.rca) {
    openRca.set(item.equipmentId, (openRca.get(item.equipmentId) ?? 0) + 1);
  }
  const insights = latestRiskInsights(input.insights);
  const rows = input.equipment.map((item): RiskRow => {
    const orders = byEquipment.get(item.id) ?? [];
    const trend = unplannedTrend(orders, now);
    const insight = insights.get(item.id);
    const assessed = assessRisk({
      unplannedRecent: trend.recent,
      unplannedPrevious: trend.previous,
      repeatMax: maxRepeat(orders, now, RISK_REPEAT_WINDOW_DAYS),
      openRca: openRca.get(item.id) ?? 0,
      criticality: item.criticality,
    });
    const base = {
      equipmentId: item.id,
      name: item.name,
      siteName: item.siteName,
      recent: trend.recent,
      previous: trend.previous,
      reasons: assessed.reasons,
    };
    return insight
      ? {
          ...base,
          level: levelForSeverity(insight.severity),
          score: insight.score ?? assessed.score,
          source: "insight",
          summary: insight.summary,
          recommendation: insight.recommendation,
        }
      : {
          ...base,
          level: assessed.level,
          score: assessed.score,
          source: "trend",
          summary: null,
          recommendation: null,
        };
  });
  const useInsights = insights.size > 0;
  const rank: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
  return rows
    .filter((row) => (useInsights ? row.source === "insight" : row.level !== "low"))
    .sort(
      (a, b) =>
        rank[a.level] - rank[b.level] ||
        b.score - a.score ||
        b.recent - a.recent ||
        a.name.localeCompare(b.name, "ru"),
    )
    .slice(0, limit);
}

export function buildDashboard(input: DashboardInput, now: Date, days: PeriodDays): DashboardModel {
  const window = periodWindow(now, days);
  return {
    period: { days, start: window.start.toISOString(), end: window.end.toISOString() },
    kpis: summarizeKpis(input.orders, input.equipment, window, now),
    series: dailySeries(input.orders, input.equipment, window, now),
    topEquipment: topEquipment(input.orders, input.equipment, window, now),
    bestWorkers: bestWorkers(input.orders, window),
    lockouts: [...input.lockouts].sort((a, b) => b.lockedAt.localeCompare(a.lockedAt)),
    rca: [...input.rca].sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    risks: riskList(input, now),
  };
}

export function loadWindowStart(now: Date, days: PeriodDays): Date {
  const window = periodWindow(now, days);
  const riskStart = now.getTime() - RISK_REPEAT_WINDOW_DAYS * MS_PER_DAY;
  return new Date(Math.min(window.start.getTime(), riskStart));
}
