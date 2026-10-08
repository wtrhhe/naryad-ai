import { MS_PER_HOUR } from "./time";
import type { PlacedStep } from "./timeline";
import type {
  EmployeeRow,
  EquipmentRow,
  FaultCodeRow,
  ShiftPeriod,
  SiteCode,
  WorkOrderStatus,
} from "./types";

export type OrderFacts = {
  readonly orderId: string;
  readonly equipment: EquipmentRow;
  readonly fault: FaultCodeRow | null;
  readonly executor: EmployeeRow;
  readonly master: EmployeeRow;
  readonly siteCode: SiteCode;
  readonly period: ShiftPeriod;
  readonly standardHours: number;
  readonly steps: readonly PlacedStep[];
  readonly pausedMs: number;
  readonly finalStatus: WorkOrderStatus;
  readonly startedAtMs: number | null;
  readonly completionsMs: readonly number[];
  readonly submissionsMs: readonly number[];
  readonly decisionsMs: readonly number[];
  readonly workHours: number;
};

export type FactsInput = Omit<
  OrderFacts,
  "finalStatus" | "startedAtMs" | "completionsMs" | "submissionsMs" | "decisionsMs" | "workHours"
>;

const timesOf = (steps: readonly PlacedStep[], ...actions: PlacedStep["action"][]): number[] =>
  steps.filter((step) => actions.includes(step.action)).map((step) => step.atMs);

export function finalStatusOf(steps: readonly PlacedStep[]): WorkOrderStatus {
  const lastWithStatus = [...steps].reverse().find((step) => step.to !== null);
  return (lastWithStatus?.to ?? "issued") as WorkOrderStatus;
}

export function deriveFacts(input: FactsInput): OrderFacts {
  const startedAtMs = timesOf(input.steps, "start")[0] ?? null;
  const completionsMs = timesOf(input.steps, "complete");
  const lastCompletion = completionsMs.at(-1);
  const grossMs =
    startedAtMs !== null && lastCompletion !== undefined ? lastCompletion - startedAtMs : 0;
  return {
    ...input,
    finalStatus: finalStatusOf(input.steps),
    startedAtMs,
    completionsMs,
    submissionsMs: timesOf(input.steps, "submit_review"),
    decisionsMs: timesOf(input.steps, "approve", "return_rework"),
    workHours: Math.max(0, grossMs - input.pausedMs) / MS_PER_HOUR,
  };
}

export const reachedDone = (facts: OrderFacts): boolean => facts.completionsMs.length > 0;
export const wasStarted = (facts: OrderFacts): boolean => facts.startedAtMs !== null;
