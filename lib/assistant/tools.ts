import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/types";
import { sortWorkers, workerStatus, type BoardWorker } from "@/lib/board/model";
import { currentShiftWindow } from "@/lib/board/shift";
import { shortName } from "@/lib/deadlines/messages";
import { effectiveDueAt, isOverdue } from "@/lib/domain/overdue";
import { isOpenStatus } from "@/lib/domain/work-order-machine";
import { draftLink } from "@/lib/assistant/draft";
import { findMention, resolveByName, type Resolution } from "@/lib/assistant/match";
import { detectPriority } from "@/lib/assistant/router";
import {
  daysBefore,
  isIsoDate,
  MS_PER_MINUTE,
  overlapHours,
  productionDayWindow,
} from "@/lib/assistant/time";
import {
  PRIORITIES,
  SPECIALTIES,
  TOOL_NAMES,
  type AssistantCard,
  type AssistantGateway,
  type DowntimeTotals,
  type EquipmentProblem,
  type EquipmentRef,
  type FaultTally,
  type LookupMiss,
  type OrderBrief,
  type OrderRecord,
  type RcaBrief,
  type RcaRecord,
  type ShiftLoad,
  type SiteRef,
  type ToolName,
  type WorkerItem,
  type WorkerRecord,
} from "@/lib/assistant/types";

const MAX_WORKERS = 12;
const MAX_OVERDUE = 10;
const MAX_RECENT = 5;
const MAX_TOP = 5;
const DESCRIPTION_LIMIT = 140;

const siteField = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe("Участок в любой форме: «дробление», «участка обогащения», «РМЦ», «погрузка»");

const periodField = z.coerce.number().int().min(1).max(365);

export const TOOL_INPUTS = {
  find_free_workers: z.object({
    specialty: z
      .enum(SPECIALTIES)
      .optional()
      .describe(
        "Специальность: fitter — слесарь, electrician — электрик, welder — сварщик, hydraulic — гидравлик, lubricator — смазчик, instrumentation — КИПиА",
      ),
    site: siteField.optional(),
  }),
  list_overdue: z.object({ site: siteField.optional() }),
  equipment_history: z.object({
    equipment: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe("Название или инвентарный номер: «Конвейер К-3», «к3», «ДР-005», «насос Н-4»"),
    days: periodField.default(30).describe("Период в днях, по умолчанию 30"),
  }),
  shift_report: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isIsoDate)
      .optional()
      .describe("Производственные сутки YYYY-MM-DD (с 08:00 до 08:00). Без даты — текущая смена"),
  }),
  site_problems: z.object({
    site: siteField.optional().describe("Участок в любой форме. Без участка — все доступные"),
    period_days: periodField.default(30).describe("Период в днях: неделя — 7, месяц — 30"),
  }),
  create_work_order_draft: z.object({
    description: z
      .string()
      .trim()
      .min(3)
      .max(1000)
      .describe("Описание неисправности и работ словами мастера"),
    equipment: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("Оборудование: название или инвентарный номер"),
    priority: z
      .enum(PRIORITIES)
      .optional()
      .describe("emergency — аварийный, high — высокий, normal — обычный, planned — плановый"),
  }),
} satisfies Record<ToolName, z.ZodType>;

type ToolInput<Name extends ToolName> = z.output<(typeof TOOL_INPUTS)[Name]>;

const DESCRIPTIONS: Record<ToolName, string> = {
  find_free_workers:
    "Исполнители текущей смены со статусом: свободен, в работе (номер наряда), есть очередь. Фильтры: специальность и участок.",
  list_overdue:
    "Открытые просроченные наряды (истёк срок или норматив), по убыванию просрочки. Фильтр: участок.",
  equipment_history:
    "Память оборудования за период: наряды, внеплановые, простой в часах и ₸, частые шифры неисправностей, открытые разборы RCA.",
  shift_report:
    "Отчёт смены или производственных суток: выдано, выполнено, просрочено, отклонено, простой (часы и ₸), оборудование в простое, загрузка людей.",
  site_problems:
    "Проблемы участка за период: проблемное оборудование, частые шифры, внеплановые и аварийные наряды, простой, выводы аналитики, открытые RCA. Подходит для недельного или месячного отчёта по участку.",
  create_work_order_draft:
    "Готовит ЧЕРНОВИК наряда без записи в базу: определяет оборудование и приоритет, возвращает ссылку на форму. Наряд создаёт и выдаёт только мастер.",
};

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    target: "draft-7",
  }) as Record<string, unknown>;
  return { ...rest, additionalProperties: false };
}

export const TOOL_DEFINITIONS: readonly AiToolDefinition[] = TOOL_NAMES.map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  inputSchema: jsonSchema(TOOL_INPUTS[name]),
}));

export interface ToolContext {
  gateway: AssistantGateway;
  now: Date;
}

export type ToolExecution =
  | { ok: true; tool: ToolName; card: AssistantCard }
  | { ok: false; tool: string; error: "unknown_tool" | "invalid_input" | "unavailable" };

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

const siteLabels = (site: SiteRef) => [site.name, site.code];
const equipmentLabels = (item: EquipmentRef) => [item.name, item.inventoryNumber];

function missFrom<T>(
  target: LookupMiss["target"],
  query: string,
  resolution: Exclude<Resolution<T>, { status: "found" }>,
  label: (item: T) => string,
  fallback: readonly T[],
): LookupMiss {
  const candidates = resolution.status === "ambiguous" ? resolution.items : fallback;
  return { target, status: resolution.status, query, candidates: candidates.map(label) };
}

type Resolved<T> = { item: T; miss: null } | { item: null; miss: LookupMiss };

async function resolveSite(gateway: AssistantGateway, query: string): Promise<Resolved<SiteRef>> {
  const sites = await gateway.sites();
  const resolution = resolveByName(query, sites, siteLabels);
  return resolution.status === "found"
    ? { item: resolution.item, miss: null }
    : { item: null, miss: missFrom("site", query, resolution, (site) => site.name, sites) };
}

async function resolveEquipment(
  gateway: AssistantGateway,
  query: string,
): Promise<Resolved<EquipmentRef>> {
  const catalog = await gateway.equipment();
  const resolution = resolveByName(query, catalog, equipmentLabels);
  return resolution.status === "found"
    ? { item: resolution.item, miss: null }
    : { item: null, miss: missFrom("equipment", query, resolution, (item) => item.name, []) };
}

function toBoardWorker(worker: WorkerRecord): BoardWorker {
  return {
    id: worker.id,
    fullName: worker.fullName,
    specialty: worker.specialty,
    onShift: worker.onShift,
    activeOrderNumber: worker.activeOrderNumber,
    queueLength: worker.queueLength,
  };
}

function displayName(fullName: string | null): string | null {
  return fullName ? (shortName(fullName) ?? fullName) : null;
}

export function shiftLoad(workers: readonly WorkerRecord[]): ShiftLoad {
  const statuses = workers
    .filter((worker) => worker.onShift)
    .map((worker) => workerStatus(toBoardWorker(worker)));
  const count = (status: string) => statuses.filter((value) => value === status).length;
  const busy = count("busy");
  const queue = count("queue");
  const onShift = statuses.length;
  return {
    onShift,
    busy,
    queue,
    free: count("free"),
    percent: onShift === 0 ? 0 : Math.round(((busy + queue) / onShift) * 100),
  };
}

export function sumDowntime(orders: readonly OrderRecord[], from: Date, to: Date): DowntimeTotals {
  return orders.reduce<DowntimeTotals>(
    (totals, order) => {
      if (!order.downtimeStartedAt) {
        return totals;
      }
      const hours = overlapHours(order.downtimeStartedAt, order.downtimeEndedAt, from, to);
      return {
        hours: totals.hours + hours,
        cost: totals.cost + Math.round(hours * order.downtimeCostPerHour),
      };
    },
    { hours: 0, cost: 0 },
  );
}

export function tallyFaults(orders: readonly OrderRecord[], limit: number): FaultTally[] {
  const tally = new Map<string, FaultTally>();
  orders.forEach((order) => {
    if (!order.faultCode) return;
    const current = tally.get(order.faultCode.code);
    tally.set(order.faultCode.code, {
      code: order.faultCode.code,
      name: order.faultCode.name,
      count: (current?.count ?? 0) + 1,
    });
  });
  return [...tally.values()]
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code, "ru"))
    .slice(0, limit);
}

function truncate(text: string, limit: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > limit ? `${single.slice(0, limit - 1)}…` : single;
}

function brief(order: OrderRecord): OrderBrief {
  return {
    id: order.id,
    number: order.number,
    kind: order.kind,
    priority: order.priority,
    status: order.status,
    issuedAt: order.issuedAt,
    faultCode: order.faultCode?.code ?? null,
    description: truncate(order.description, DESCRIPTION_LIMIT),
    assignee: displayName(order.assigneeName),
  };
}

function rcaBrief(record: RcaRecord): RcaBrief {
  return {
    id: record.id,
    equipment: record.equipmentName,
    faultCode: record.faultCode?.code ?? null,
    status: record.status,
    rootCause: record.rootCause ? truncate(record.rootCause, DESCRIPTION_LIMIT) : null,
  };
}

export function wasOverdueDuring(order: OrderRecord, start: Date, cutoff: Date): boolean {
  if (order.status === "cancelled" || order.status === "rejected") {
    return false;
  }
  const due = effectiveDueAt(order);
  if (!due || due.getTime() >= cutoff.getTime()) {
    return false;
  }
  const finished = order.doneAt ?? order.closedAt;
  if (!finished) {
    return true;
  }
  const finishedMs = Date.parse(finished);
  return finishedMs > due.getTime() && finishedMs >= start.getTime();
}

function withoutCancelled(orders: readonly OrderRecord[]): OrderRecord[] {
  return orders.filter((order) => order.status !== "cancelled");
}

function within(iso: string | null, start: Date, end: Date): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return time >= start.getTime() && time < end.getTime();
}

async function findFreeWorkers(
  input: ToolInput<"find_free_workers">,
  { gateway }: ToolContext,
): Promise<AssistantCard> {
  const site = input.site ? await resolveSite(gateway, input.site) : null;
  if (site?.miss) {
    return { kind: "lookup", tool: "find_free_workers", miss: site.miss };
  }
  const workers = await gateway.workers();
  const matching = workers.filter(
    (worker) =>
      worker.onShift &&
      (!input.specialty || worker.specialty === input.specialty) &&
      (!site?.item || worker.siteIds.includes(site.item.id)),
  );
  const byId = new Map(matching.map((worker) => [worker.id, worker]));
  const items: WorkerItem[] = sortWorkers(matching.map(toBoardWorker)).map((worker) => ({
    id: worker.id,
    name: displayName(worker.fullName) ?? worker.fullName,
    specialty: byId.get(worker.id)?.specialty ?? null,
    status: workerStatus(worker),
    activeOrderNumber: worker.activeOrderNumber,
    queueLength: worker.queueLength,
  }));
  return {
    kind: "workers",
    specialty: input.specialty ?? null,
    site: site?.item?.name ?? null,
    onShiftCount: items.length,
    freeCount: items.filter((item) => item.status === "free").length,
    workers: items.slice(0, MAX_WORKERS),
  };
}

async function listOverdue(
  input: ToolInput<"list_overdue">,
  { gateway, now }: ToolContext,
): Promise<AssistantCard> {
  const site = input.site ? await resolveSite(gateway, input.site) : null;
  if (site?.miss) {
    return { kind: "lookup", tool: "list_overdue", miss: site.miss };
  }
  const orders = await gateway.openOrders();
  const overdue = orders
    .filter((order) => (!site?.item || order.siteId === site.item.id) && isOverdue(order, now))
    .map((order) => {
      const due = effectiveDueAt(order) ?? now;
      return {
        id: order.id,
        number: order.number,
        equipment: order.equipmentName,
        site: order.siteName,
        assignee: displayName(order.assigneeName),
        status: order.status,
        priority: order.priority,
        dueAt: due.toISOString(),
        lateMinutes: Math.floor((now.getTime() - due.getTime()) / MS_PER_MINUTE),
      };
    })
    .sort((left, right) => right.lateMinutes - left.lateMinutes);
  return {
    kind: "overdue",
    site: site?.item?.name ?? null,
    total: overdue.length,
    orders: overdue.slice(0, MAX_OVERDUE),
  };
}

async function equipmentHistory(
  input: ToolInput<"equipment_history">,
  { gateway, now }: ToolContext,
): Promise<AssistantCard> {
  const resolved = await resolveEquipment(gateway, input.equipment);
  if (resolved.miss) {
    return { kind: "lookup", tool: "equipment_history", miss: resolved.miss };
  }
  const item = resolved.item;
  const since = daysBefore(now, input.days);
  const [issued, rca, sites] = await Promise.all([
    gateway.ordersIssuedSince(since, { equipmentId: item.id }),
    gateway.openRca([item.id]),
    gateway.sites(),
  ]);
  const orders = withoutCancelled(issued);
  const recent = [...orders]
    .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt))
    .slice(0, MAX_RECENT);
  return {
    kind: "equipment_history",
    equipment: {
      id: item.id,
      name: item.name,
      inventoryNumber: item.inventoryNumber,
      site: sites.find((site) => site.id === item.siteId)?.name ?? "",
    },
    days: input.days,
    total: orders.length,
    unplanned: orders.filter((order) => order.kind === "unplanned").length,
    open: orders.filter((order) => isOpenStatus(order.status)).length,
    downtime: sumDowntime(orders, since, now),
    topFaults: tallyFaults(orders, 3),
    recent: recent.map(brief),
    openRca: rca.map(rcaBrief),
  };
}

async function shiftReport(
  input: ToolInput<"shift_report">,
  { gateway, now }: ToolContext,
): Promise<AssistantCard> {
  const shift = input.date ? null : currentShiftWindow(now);
  const window = shift ?? productionDayWindow(input.date ?? "");
  const cutoff = new Date(Math.min(now.getTime(), window.end.getTime()));
  const [orders, workers] = await Promise.all([
    gateway.ordersActiveBetween(window.start, window.end),
    shift ? gateway.workers() : Promise.resolve(null),
  ]);
  const down = new Set(
    orders
      .filter((order) => order.downtimeStartedAt !== null && order.downtimeEndedAt === null)
      .map((order) => order.equipmentId),
  );
  return {
    kind: "shift_report",
    scope: shift ? "current_shift" : "day",
    period: shift?.period ?? null,
    date: input.date ?? null,
    from: window.start.toISOString(),
    to: window.end.toISOString(),
    issued: orders.filter((order) => within(order.issuedAt, window.start, window.end)).length,
    done: orders.filter((order) => within(order.doneAt ?? order.closedAt, window.start, window.end))
      .length,
    overdue: orders.filter((order) => wasOverdueDuring(order, window.start, cutoff)).length,
    rejected: orders.filter((order) => within(order.rejectedAt, window.start, window.end)).length,
    equipmentDown: shift ? down.size : 0,
    downtime: sumDowntime(orders, window.start, cutoff),
    load: workers ? shiftLoad(workers) : null,
  };
}

async function siteProblems(
  input: ToolInput<"site_problems">,
  { gateway, now }: ToolContext,
): Promise<AssistantCard> {
  const resolved = input.site ? await resolveSite(gateway, input.site) : null;
  if (resolved?.miss) {
    return { kind: "lookup", tool: "site_problems", miss: resolved.miss };
  }
  const site = resolved?.item ?? null;
  const since = daysBefore(now, input.period_days);
  const [catalog, issued, viewerSites, insights] = await Promise.all([
    gateway.equipment(),
    gateway.ordersIssuedSince(since, site ? { siteId: site.id } : {}),
    gateway.viewerSiteIds(),
    gateway.insightsSince(since),
  ]);
  const orders = withoutCancelled(issued);
  const equipmentIds = new Set(
    catalog.filter((item) => !site || item.siteId === site.id).map((item) => item.id),
  );
  const rca = await gateway.openRca([...equipmentIds]);
  const perEquipment = new Map<string, EquipmentProblem>();
  orders.forEach((order) => {
    const current = perEquipment.get(order.equipmentId) ?? {
      id: order.equipmentId,
      name: order.equipmentName,
      total: 0,
      unplanned: 0,
      downtimeHours: 0,
      downtimeCost: 0,
    };
    const downtime = sumDowntime([order], since, now);
    perEquipment.set(order.equipmentId, {
      ...current,
      total: current.total + 1,
      unplanned: current.unplanned + (order.kind === "unplanned" ? 1 : 0),
      downtimeHours: current.downtimeHours + downtime.hours,
      downtimeCost: current.downtimeCost + downtime.cost,
    });
  });
  const relevantInsights = insights
    .filter(
      (insight) =>
        !site ||
        (insight.entityType === "site" && insight.entityId === site.id) ||
        (insight.entityType === "equipment" &&
          insight.entityId !== null &&
          equipmentIds.has(insight.entityId)),
    )
    .sort(
      (left, right) =>
        right.severity - left.severity || right.createdAt.localeCompare(left.createdAt),
    )
    .slice(0, MAX_TOP);
  return {
    kind: "site_problems",
    site: site ? { id: site.id, name: site.name } : null,
    days: input.period_days,
    limited: Boolean(site && viewerSites && !viewerSites.includes(site.id)),
    total: orders.length,
    unplanned: orders.filter((order) => order.kind === "unplanned").length,
    emergency: orders.filter((order) => order.priority === "emergency").length,
    overdueNow: orders.filter((order) => isOverdue(order, now)).length,
    downtime: sumDowntime(orders, since, now),
    topEquipment: [...perEquipment.values()]
      .sort(
        (left, right) =>
          right.unplanned - left.unplanned ||
          right.downtimeCost - left.downtimeCost ||
          right.total - left.total,
      )
      .slice(0, MAX_TOP),
    topFaults: tallyFaults(orders, MAX_TOP),
    insights: relevantInsights.map((insight) => ({
      id: insight.id,
      severity: insight.severity,
      summary: insight.summary,
      recommendation: insight.recommendation,
    })),
    openRca: rca.map(rcaBrief),
  };
}

async function createWorkOrderDraft(
  input: ToolInput<"create_work_order_draft">,
  { gateway }: ToolContext,
): Promise<AssistantCard> {
  const [catalog, sites] = await Promise.all([gateway.equipment(), gateway.sites()]);
  const resolved = input.equipment ? await resolveEquipment(gateway, input.equipment) : null;
  const equipment =
    resolved?.item ??
    (resolved?.miss ? null : findMention(input.description, catalog, equipmentLabels));
  const priority = input.priority ?? detectPriority(input.description) ?? "normal";
  return {
    kind: "draft",
    description: input.description,
    priority,
    equipment: equipment
      ? {
          id: equipment.id,
          name: equipment.name,
          inventoryNumber: equipment.inventoryNumber,
          site: sites.find((site) => site.id === equipment.siteId)?.name ?? "",
        }
      : null,
    equipmentMiss: resolved?.miss ?? null,
    link: draftLink({ description: input.description, equipmentId: equipment?.id, priority }),
  };
}

const EXECUTORS: {
  [Name in ToolName]: (input: ToolInput<Name>, context: ToolContext) => Promise<AssistantCard>;
} = {
  find_free_workers: findFreeWorkers,
  list_overdue: listOverdue,
  equipment_history: equipmentHistory,
  shift_report: shiftReport,
  site_problems: siteProblems,
  create_work_order_draft: createWorkOrderDraft,
};

function withoutBlanks(raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([, value]) => value !== null && value !== "",
    ),
  );
}

export async function executeTool(
  name: string,
  raw: unknown,
  context: ToolContext,
): Promise<ToolExecution> {
  if (!isToolName(name)) {
    return { ok: false, tool: name, error: "unknown_tool" };
  }
  const parsed = TOOL_INPUTS[name].safeParse(withoutBlanks(raw));
  if (!parsed.success) {
    return { ok: false, tool: name, error: "invalid_input" };
  }
  try {
    const executor = EXECUTORS[name] as (
      input: unknown,
      context: ToolContext,
    ) => Promise<AssistantCard>;
    return { ok: true, tool: name, card: await executor(parsed.data, context) };
  } catch (error) {
    console.error("assistant tool failed", name, error instanceof Error ? error.message : error);
    return { ok: false, tool: name, error: "unavailable" };
  }
}

const HIDDEN_KEY = /^(?:id|link|href)$|Id$/;

export function toModelPayload(execution: ToolExecution): string {
  if (!execution.ok) {
    return JSON.stringify({ error: execution.error });
  }
  return JSON.stringify(execution.card, (key, value: unknown) =>
    HIDDEN_KEY.test(key) ? undefined : value,
  );
}

export function memoizeGateway(gateway: AssistantGateway): AssistantGateway {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const cached = cache.get(key);
    if (cached) {
      return cached as Promise<T>;
    }
    const pending = load();
    cache.set(key, pending);
    return pending;
  };
  return {
    sites: () => once("sites", () => gateway.sites()),
    equipment: () => once("equipment", () => gateway.equipment()),
    workers: () => once("workers", () => gateway.workers()),
    openOrders: () => once("openOrders", () => gateway.openOrders()),
    viewerSiteIds: () => once("viewerSiteIds", () => gateway.viewerSiteIds()),
    ordersActiveBetween: (from, to) => gateway.ordersActiveBetween(from, to),
    ordersIssuedSince: (since, scope) => gateway.ordersIssuedSince(since, scope),
    insightsSince: (since) => gateway.insightsSince(since),
    openRca: (equipmentIds) => gateway.openRca(equipmentIds),
  };
}
