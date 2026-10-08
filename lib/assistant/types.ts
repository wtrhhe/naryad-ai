import type { Locale } from "@/i18n/config";
import type { WorkerLiveStatus } from "@/lib/board/model";
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export type Specialty = Enums["specialty"];
export type Priority = Enums["work_order_priority"];
export type OrderStatus = Enums["work_order_status"];
export type OrderKind = Enums["work_order_type"];
export type RcaStatus = Enums["rca_status"];

export const SPECIALTIES = [
  "fitter",
  "electrician",
  "welder",
  "hydraulic",
  "lubricator",
  "instrumentation",
] as const satisfies readonly Specialty[];

export const PRIORITIES = [
  "emergency",
  "high",
  "normal",
  "planned",
] as const satisfies readonly Priority[];

export const TOOL_NAMES = [
  "find_free_workers",
  "list_overdue",
  "equipment_history",
  "shift_report",
  "site_problems",
  "create_work_order_draft",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface SiteRef {
  id: string;
  name: string;
  code: string;
}

export interface EquipmentRef {
  id: string;
  name: string;
  inventoryNumber: string;
  siteId: string;
  downtimeCostPerHour: number;
}

export interface WorkerRecord {
  id: string;
  fullName: string;
  specialty: Specialty | null;
  onShift: boolean;
  activeOrderNumber: number | null;
  queueLength: number;
  siteIds: string[];
}

export interface FaultRef {
  code: string;
  name: string;
}

export interface OrderRecord {
  id: string;
  number: number;
  kind: OrderKind;
  priority: Priority;
  status: OrderStatus;
  description: string;
  siteId: string;
  siteName: string;
  equipmentId: string;
  equipmentName: string;
  downtimeCostPerHour: number;
  assigneeName: string | null;
  issuedAt: string;
  dueAt: string | null;
  standardHours: number | null;
  doneAt: string | null;
  closedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
  faultCode: FaultRef | null;
}

export interface InsightRecord {
  id: string;
  kind: string;
  severity: number;
  summary: string;
  recommendation: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface RcaRecord {
  id: string;
  equipmentId: string;
  equipmentName: string;
  status: RcaStatus;
  faultCode: FaultRef | null;
  rootCause: string | null;
  openedAt: string;
}

export interface AssistantGateway {
  sites(): Promise<SiteRef[]>;
  equipment(): Promise<EquipmentRef[]>;
  workers(): Promise<WorkerRecord[]>;
  openOrders(): Promise<OrderRecord[]>;
  ordersActiveBetween(from: Date, to: Date): Promise<OrderRecord[]>;
  ordersIssuedSince(
    since: Date,
    scope: { siteId?: string; equipmentId?: string },
  ): Promise<OrderRecord[]>;
  insightsSince(since: Date): Promise<InsightRecord[]>;
  openRca(equipmentIds: readonly string[]): Promise<RcaRecord[]>;
  viewerSiteIds(): Promise<string[] | null>;
}

export interface LookupMiss {
  target: "equipment" | "site";
  status: "not_found" | "ambiguous";
  query: string;
  candidates: string[];
}

export interface WorkerItem {
  id: string;
  name: string;
  specialty: Specialty | null;
  status: WorkerLiveStatus;
  activeOrderNumber: number | null;
  queueLength: number;
}

export interface WorkersCard {
  kind: "workers";
  specialty: Specialty | null;
  site: string | null;
  onShiftCount: number;
  freeCount: number;
  workers: WorkerItem[];
}

export interface OverdueItem {
  id: string;
  number: number;
  equipment: string;
  site: string;
  assignee: string | null;
  status: OrderStatus;
  priority: Priority;
  dueAt: string;
  lateMinutes: number;
}

export interface OverdueCard {
  kind: "overdue";
  site: string | null;
  total: number;
  orders: OverdueItem[];
}

export interface DowntimeTotals {
  hours: number;
  cost: number;
}

export interface FaultTally {
  code: string;
  name: string;
  count: number;
}

export interface OrderBrief {
  id: string;
  number: number;
  kind: OrderKind;
  priority: Priority;
  status: OrderStatus;
  issuedAt: string;
  faultCode: string | null;
  description: string;
  assignee: string | null;
}

export interface RcaBrief {
  id: string;
  equipment: string;
  faultCode: string | null;
  status: RcaStatus;
  rootCause: string | null;
}

export interface EquipmentHistoryCard {
  kind: "equipment_history";
  equipment: { id: string; name: string; inventoryNumber: string; site: string };
  days: number;
  total: number;
  unplanned: number;
  open: number;
  downtime: DowntimeTotals;
  topFaults: FaultTally[];
  recent: OrderBrief[];
  openRca: RcaBrief[];
}

export interface ShiftLoad {
  onShift: number;
  busy: number;
  queue: number;
  free: number;
  percent: number;
}

export interface ShiftReportCard {
  kind: "shift_report";
  scope: "current_shift" | "day";
  period: "day" | "night" | null;
  date: string | null;
  from: string;
  to: string;
  issued: number;
  done: number;
  overdue: number;
  rejected: number;
  equipmentDown: number;
  downtime: DowntimeTotals;
  load: ShiftLoad | null;
}

export interface EquipmentProblem {
  id: string;
  name: string;
  total: number;
  unplanned: number;
  downtimeHours: number;
  downtimeCost: number;
}

export interface InsightBrief {
  id: string;
  severity: number;
  summary: string;
  recommendation: string | null;
}

export interface SiteProblemsCard {
  kind: "site_problems";
  site: { id: string; name: string } | null;
  days: number;
  limited: boolean;
  total: number;
  unplanned: number;
  emergency: number;
  overdueNow: number;
  downtime: DowntimeTotals;
  topEquipment: EquipmentProblem[];
  topFaults: FaultTally[];
  insights: InsightBrief[];
  openRca: RcaBrief[];
}

export interface DraftCard {
  kind: "draft";
  description: string;
  priority: Priority;
  equipment: { id: string; name: string; inventoryNumber: string; site: string } | null;
  equipmentMiss: LookupMiss | null;
  link: string;
}

export interface LookupCard {
  kind: "lookup";
  tool: ToolName;
  miss: LookupMiss;
}

export type AssistantCard =
  | WorkersCard
  | OverdueCard
  | EquipmentHistoryCard
  | ShiftReportCard
  | SiteProblemsCard
  | DraftCard
  | LookupCard;

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantReply {
  text: string;
  cards: AssistantCard[];
  draftLink: string | null;
  mode: "ai" | "rules";
  locale: Locale;
}

export type AssistantActionResult =
  | { ok: true; data: AssistantReply }
  | { ok: false; error: "validation" | "rate_limited" | "unavailable" };
