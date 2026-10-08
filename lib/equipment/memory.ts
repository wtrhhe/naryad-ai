import { createTranslator } from "next-intl";
import ruEquipment from "@/messages/ru/equipment.json";
import kkEquipment from "@/messages/kk/equipment.json";
import type { Locale } from "@/i18n/config";
import type { WorkOrderStatus } from "@/lib/domain/work-order-machine";
import type { Database } from "@/lib/supabase/database.types";
import { assessRisk, unplannedTrend, type RiskAssessment } from "@/lib/equipment/risk";

export const MEMORY_WINDOW_DAYS = 60;
const LAST_REPAIRS = 5;
const TOP_MATERIALS = 6;
const FOCUS_MATERIALS = 3;
const HINT_ITEMS = 3;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

export interface MemoryMaterial {
  materialId: string;
  name: string;
  unit: string;
  quantity: number;
}

export interface MemoryOrder {
  id: string;
  number: number;
  kind: "planned" | "unplanned";
  priority: Database["public"]["Enums"]["work_order_priority"];
  status: WorkOrderStatus;
  issuedAt: string;
  doneAt: string | null;
  closedAt: string | null;
  faultCodeId: string | null;
  faultCode: string | null;
  faultName: string | null;
  workPerformed: string | null;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
  downtimeCost: number | null;
  materials: readonly MemoryMaterial[];
}

export interface MemoryEquipment {
  id: string;
  name: string;
  inventoryNumber: string;
  siteName: string;
  criticality: number;
  downtimeCostPerHour: number;
}

export interface MemoryRca {
  id: string;
  faultCodeId: string | null;
  hypothesis: string | null;
}

export interface MemoryInput {
  equipment: MemoryEquipment;
  orders: readonly MemoryOrder[];
  openRca: readonly MemoryRca[];
  activeLockout: boolean;
  riskInsight?: { severity: number; score: number | null } | null;
}

export interface MemoryOptions {
  now: Date;
  windowDays?: number;
  faultCodeId?: string | null;
}

export interface RepeatInterval {
  min: number;
  max: number;
  typical: number;
}

export interface FaultRepeat {
  faultCodeId: string;
  code: string;
  name: string;
  count: number;
  firstAt: string;
  lastAt: string;
  spanDays: number;
  daysSinceLast: number;
  interval: RepeatInterval | null;
  nextExpectedAt: string | null;
  materials: string[];
  orderNumbers: number[];
  rcaHypothesis: string | null;
}

export interface RepairEntry {
  orderId: string;
  number: number;
  kind: "planned" | "unplanned";
  finishedAt: string;
  faultCode: string | null;
  faultName: string | null;
  workPerformed: string | null;
  materials: MemoryMaterial[];
}

export interface ReplacedMaterial {
  name: string;
  unit: string;
  quantity: number;
  times: number;
}

export interface MemoryDowntime {
  hours: number;
  cost: number;
  windowHours: number;
  windowCost: number;
  openSince: string | null;
}

export interface EquipmentMemorySummary {
  equipmentId: string;
  equipmentName: string;
  inventoryNumber: string;
  siteName: string;
  criticality: number;
  downtimeCostPerHour: number;
  windowDays: number;
  generatedAt: string;
  totalOrders: number;
  unplannedInWindow: number;
  trend: { recent: number; previous: number };
  focus: FaultRepeat | null;
  repeats: FaultRepeat[];
  lastUnplanned: {
    number: number;
    faultCode: string | null;
    faultName: string | null;
    issuedAt: string;
    daysAgo: number;
  } | null;
  lastRepairs: RepairEntry[];
  replacedMaterials: ReplacedMaterial[];
  downtime: MemoryDowntime;
  activeLockout: boolean;
  openRcaCount: number;
  risk: RiskAssessment;
}

export type CheckHintSource = "ai" | "rules";

export interface CheckHint {
  source: CheckHintSource;
  items: string[];
}

export interface EquipmentMemoryCard {
  summary: EquipmentMemorySummary;
  sentence: string;
  hint: CheckHint;
}

export function rcaHypothesis(item: {
  rootCause: string | null;
  fiveWhys: readonly { answer: string }[];
}): string | null {
  const lastAnswer = [...item.fiveWhys].reverse().find((why) => why.answer.trim().length > 0);
  return item.rootCause?.trim() || lastAnswer?.answer.trim() || null;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function isFailure(order: MemoryOrder): boolean {
  return order.kind === "unplanned" && order.status !== "cancelled";
}

export function repeatInterval(issuedAt: readonly string[]): RepeatInterval | null {
  const times = issuedAt.map((iso) => new Date(iso).getTime()).sort((a, b) => a - b);
  const gaps = times.slice(1).map((time, index) => (time - (times[index] ?? time)) / MS_PER_DAY);
  if (gaps.length === 0) return null;
  const typical = round(median(gaps));
  if (gaps.length === 1) {
    const exact = Math.max(1, Math.round(gaps[0] ?? 0));
    return { min: exact, max: exact, typical };
  }
  const min = Math.max(1, Math.floor(Math.min(...gaps)));
  const max = Math.max(min, Math.ceil(Math.max(...gaps)));
  return { min, max, typical };
}

function rankMaterials(orders: readonly MemoryOrder[]): ReplacedMaterial[] {
  const tally = new Map<string, ReplacedMaterial>();
  for (const order of orders) {
    for (const material of order.materials) {
      const current = tally.get(material.materialId);
      tally.set(material.materialId, {
        name: material.name,
        unit: material.unit,
        quantity: round((current?.quantity ?? 0) + material.quantity, 3),
        times: (current?.times ?? 0) + 1,
      });
    }
  }
  return [...tally.values()].sort(
    (a, b) => b.times - a.times || b.quantity - a.quantity || a.name.localeCompare(b.name, "ru"),
  );
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, (toMs - fromMs) / MS_PER_DAY);
}

function faultRepeats(
  failures: readonly MemoryOrder[],
  rca: readonly MemoryRca[],
  now: Date,
): FaultRepeat[] {
  const groups = new Map<string, MemoryOrder[]>();
  for (const order of failures) {
    if (!order.faultCodeId) continue;
    groups.set(order.faultCodeId, [...(groups.get(order.faultCodeId) ?? []), order]);
  }
  const nowMs = now.getTime();
  return [...groups.entries()]
    .map(([faultCodeId, group]) => {
      const ordered = [...group].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
      const first = ordered[0] as MemoryOrder;
      const last = ordered[ordered.length - 1] as MemoryOrder;
      const interval = repeatInterval(ordered.map((order) => order.issuedAt));
      const lastMs = new Date(last.issuedAt).getTime();
      return {
        faultCodeId,
        code: first.faultCode ?? "",
        name: first.faultName ?? "",
        count: ordered.length,
        firstAt: first.issuedAt,
        lastAt: last.issuedAt,
        spanDays: Math.max(1, Math.ceil(daysBetween(new Date(first.issuedAt).getTime(), nowMs))),
        daysSinceLast: Math.floor(daysBetween(lastMs, nowMs)),
        interval,
        nextExpectedAt: interval
          ? new Date(lastMs + interval.typical * MS_PER_DAY).toISOString()
          : null,
        materials: rankMaterials(ordered)
          .slice(0, FOCUS_MATERIALS)
          .map((material) => material.name),
        orderNumbers: ordered.map((order) => order.number),
        rcaHypothesis: rca.find((item) => item.faultCodeId === faultCodeId)?.hypothesis ?? null,
      };
    })
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

function overlapHours(
  startIso: string,
  endIso: string | null,
  fromMs: number,
  now: Date,
): { total: number; inside: number } {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : now.getTime();
  const total = Math.max(0, end - start) / MS_PER_HOUR;
  const inside = Math.max(0, end - Math.max(start, fromMs)) / MS_PER_HOUR;
  return { total, inside: Math.min(total, inside) };
}

function memoryDowntime(
  orders: readonly MemoryOrder[],
  costPerHour: number,
  fromMs: number,
  now: Date,
): MemoryDowntime {
  const totals = orders.reduce(
    (sum, order) => {
      if (!order.downtimeStartedAt) return sum;
      const { total, inside } = overlapHours(
        order.downtimeStartedAt,
        order.downtimeEndedAt,
        fromMs,
        now,
      );
      const fullCost =
        order.downtimeEndedAt && order.downtimeCost !== null
          ? order.downtimeCost
          : total * costPerHour;
      const windowCost = total === 0 ? 0 : fullCost * (inside / total);
      const open = order.downtimeEndedAt === null;
      return {
        hours: sum.hours + total,
        cost: sum.cost + fullCost,
        windowHours: sum.windowHours + inside,
        windowCost: sum.windowCost + windowCost,
        openSince:
          open && (!sum.openSince || order.downtimeStartedAt < sum.openSince)
            ? order.downtimeStartedAt
            : sum.openSince,
      };
    },
    { hours: 0, cost: 0, windowHours: 0, windowCost: 0, openSince: null as string | null },
  );
  return {
    hours: round(totals.hours),
    cost: Math.round(totals.cost),
    windowHours: round(totals.windowHours),
    windowCost: Math.round(totals.windowCost),
    openSince: totals.openSince,
  };
}

export function summarizeEquipmentMemory(
  input: MemoryInput,
  options: MemoryOptions,
): EquipmentMemorySummary {
  const { now } = options;
  const windowDays = options.windowDays ?? MEMORY_WINDOW_DAYS;
  const nowMs = now.getTime();
  const fromMs = nowMs - windowDays * MS_PER_DAY;
  const inWindow = (iso: string) => {
    const time = new Date(iso).getTime();
    return time >= fromMs && time <= nowMs;
  };
  const failures = input.orders.filter(isFailure);
  const windowFailures = failures.filter((order) => inWindow(order.issuedAt));
  const allRepeats = faultRepeats(windowFailures, input.openRca, now);
  const repeats = allRepeats.filter((repeat) => repeat.count >= 2);
  const requested = options.faultCodeId
    ? (allRepeats.find((repeat) => repeat.faultCodeId === options.faultCodeId) ?? null)
    : null;
  const focus = requested ?? repeats[0] ?? null;
  const lastFailure = [...failures].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
  const finished = input.orders
    .filter((order) => order.status !== "cancelled" && (order.closedAt || order.doneAt))
    .map((order) => ({ order, finishedAt: (order.closedAt ?? order.doneAt) as string }))
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const trend = unplannedTrend(input.orders, now);
  return {
    equipmentId: input.equipment.id,
    equipmentName: input.equipment.name,
    inventoryNumber: input.equipment.inventoryNumber,
    siteName: input.equipment.siteName,
    criticality: input.equipment.criticality,
    downtimeCostPerHour: input.equipment.downtimeCostPerHour,
    windowDays,
    generatedAt: now.toISOString(),
    totalOrders: input.orders.length,
    unplannedInWindow: windowFailures.length,
    trend,
    focus,
    repeats,
    lastUnplanned: lastFailure
      ? {
          number: lastFailure.number,
          faultCode: lastFailure.faultCode,
          faultName: lastFailure.faultName,
          issuedAt: lastFailure.issuedAt,
          daysAgo: Math.floor(daysBetween(new Date(lastFailure.issuedAt).getTime(), nowMs)),
        }
      : null,
    lastRepairs: finished.slice(0, LAST_REPAIRS).map(({ order, finishedAt }) => ({
      orderId: order.id,
      number: order.number,
      kind: order.kind,
      finishedAt,
      faultCode: order.faultCode,
      faultName: order.faultName,
      workPerformed: order.workPerformed,
      materials: [...order.materials],
    })),
    replacedMaterials: rankMaterials(
      input.orders.filter((order) => inWindow(order.closedAt ?? order.doneAt ?? order.issuedAt)),
    ).slice(0, TOP_MATERIALS),
    downtime: memoryDowntime(input.orders, input.equipment.downtimeCostPerHour, fromMs, now),
    activeLockout: input.activeLockout,
    openRcaCount: input.openRca.length,
    risk: assessRisk({
      unplannedRecent: trend.recent,
      unplannedPrevious: trend.previous,
      repeatMax: repeats[0]?.count ?? 0,
      openRca: input.openRca.length,
      criticality: input.equipment.criticality,
      insightSeverity: input.riskInsight?.severity ?? null,
      insightScore: input.riskInsight?.score ?? null,
    }),
  };
}

const MESSAGES: Record<Locale, typeof ruEquipment> = { ru: ruEquipment, kk: kkEquipment };

function translator(locale: Locale) {
  return createTranslator({ locale, messages: { equipment: MESSAGES[locale] } });
}

export function lowerFirst(text: string): string {
  const [first, second] = [...text];
  if (!first || (second && second !== second.toLowerCase())) return text;
  return first.toLowerCase() + text.slice(first.length);
}

function joinMaterials(names: readonly string[]): string {
  return names.map(lowerFirst).join(", ");
}

export function buildMemorySentence(summary: EquipmentMemorySummary, locale: Locale): string {
  const t = translator(locale);
  const equipment = summary.equipmentName;
  const focus = summary.focus;
  const parts: string[] = [];
  if (focus && focus.count >= 2) {
    parts.push(
      t("equipment.sentence.repeat", {
        equipment,
        fault: lowerFirst(focus.name),
        count: focus.count,
        days: focus.spanDays,
      }),
    );
  } else if (focus) {
    parts.push(
      t("equipment.sentence.once", {
        equipment,
        fault: lowerFirst(focus.name),
        days: focus.daysSinceLast,
      }),
    );
  } else if (summary.unplannedInWindow > 0) {
    parts.push(
      t("equipment.sentence.noRepeats", {
        equipment,
        count: summary.unplannedInWindow,
        days: summary.windowDays,
      }),
    );
  } else {
    parts.push(t("equipment.sentence.quiet", { equipment, days: summary.windowDays }));
  }
  if (focus && focus.materials.length > 0) {
    parts.push(t("equipment.sentence.replaced", { materials: joinMaterials(focus.materials) }));
  }
  if (focus?.interval) {
    parts.push(
      focus.interval.min === focus.interval.max
        ? t("equipment.sentence.intervalExact", { days: focus.interval.min })
        : t("equipment.sentence.interval", { min: focus.interval.min, max: focus.interval.max }),
    );
  }
  return parts.join("; ");
}

export function fallbackCheckHints(summary: EquipmentMemorySummary, locale: Locale): CheckHint {
  const t = translator(locale);
  const focus = summary.focus;
  const lastWork = summary.lastRepairs.find((repair) => repair.workPerformed);
  const candidates = [
    focus?.rcaHypothesis
      ? t("equipment.hint.rca", { hypothesis: focus.rcaHypothesis.replace(/\.$/, "") })
      : null,
    focus && focus.materials.length > 0
      ? t("equipment.hint.materials", { materials: joinMaterials(focus.materials) })
      : null,
    focus?.interval && focus.count >= 2
      ? t("equipment.hint.interval", { min: focus.interval.min, max: focus.interval.max })
      : null,
    lastWork?.workPerformed
      ? t("equipment.hint.lastWork", {
          number: lastWork.number,
          work: lowerFirst(lastWork.workPerformed.replace(/\.$/, "")),
        })
      : null,
    summary.trend.recent > summary.trend.previous && summary.trend.recent >= 2
      ? t("equipment.hint.trend", {
          recent: summary.trend.recent,
          previous: summary.trend.previous,
        })
      : null,
  ].filter((item): item is string => item !== null);
  const items = candidates.slice(0, HINT_ITEMS);
  return { source: "rules", items: items.length > 0 ? items : [t("equipment.hint.general")] };
}
