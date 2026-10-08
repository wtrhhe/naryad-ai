import type { OrderBundle } from "./assemble";
import type { SeedContext } from "./context";
import { REPEAT_FAILURE_WORKER } from "./data-people";
import { FAULT_SPEC_BY_CODE } from "./data-faults";
import { standardHoursFor } from "./norms";
import type { Rng } from "./random";
import { reserveIssueTime, type OrderSlot } from "./slots-common";
import { CRUSHER_FAILURE_CODES } from "./slots-scripted";
import { describeFailure } from "./slots-unplanned";
import { MS_PER_DAY, MS_PER_MINUTE } from "./time";

const CRUSHER_FAILURE_DELAY_DAYS = [1, 4.2] as const;
const CRUSHER_FAILURE_LATEST_DAYS = 4.7;
const REPEAT_CHANCE = 0.55;
const REPEAT_DELAY_DAYS = [1, 5.5] as const;
const REPEAT_LATEST_DAYS = 6.5;
const PLACEMENT_ATTEMPTS = 8;
const FAILURE_LEAD_MINUTES = [5, 25] as const;
const CRUSHER_PRIORITY_WEIGHTS: ReadonlyArray<readonly ["emergency" | "high", number]> = [
  ["emergency", 40],
  ["high", 60],
];

type FollowUpDraft = {
  readonly key: string;
  readonly equipmentId: string;
  readonly faultCode: string;
  readonly priority: OrderSlot["priority"];
  readonly description: string;
  readonly tag: OrderSlot["tag"];
  readonly avoidAssigneeId: string | null;
  readonly standardHours: number;
};

function placeFollowUp(
  context: SeedContext,
  draft: FollowUpDraft,
  baseMs: number,
  delayDays: readonly [number, number],
  latestDays: number,
  rng: Rng,
): OrderSlot[] {
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
    const issuedAtMs = reserveIssueTime(context, {
      equipmentId: draft.equipmentId,
      kind: "unplanned",
      standardHours: draft.standardHours,
      desiredMs: baseMs + rng.float(...delayDays) * MS_PER_DAY,
      latestMs: baseMs + latestDays * MS_PER_DAY,
    });
    if (issuedAtMs !== null) {
      return [
        {
          ...draft,
          kind: "unplanned",
          issuedAtMs,
          failureAtMs: issuedAtMs - Math.round(rng.float(...FAILURE_LEAD_MINUTES) * MS_PER_MINUTE),
        },
      ];
    }
  }
  return [];
}

function crusherFailure(context: SeedContext, bundle: OrderBundle, rng: Rng): OrderSlot[] {
  const closedAtMs = bundle.facts.steps.find((step) => step.action === "approve")?.atMs;
  if (closedAtMs === undefined) return [];
  const faultCode = rng.weighted(CRUSHER_FAILURE_CODES);
  const spec = FAULT_SPEC_BY_CODE.get(faultCode);
  if (!spec) return [];
  const equipmentName = bundle.facts.equipment.name;
  const draft: FollowUpDraft = {
    key: `${bundle.slot.key}:failure`,
    equipmentId: bundle.slot.equipmentId,
    faultCode,
    priority: rng.weighted(CRUSHER_PRIORITY_WEIGHTS),
    description: `${describeFailure(faultCode, equipmentName, rng)} (после планового ремонта)`,
    tag: "crusher-failure",
    avoidAssigneeId: null,
    standardHours: standardHoursFor(spec.standardHours, bundle.facts.equipment.equipment_type),
  };
  return placeFollowUp(
    context,
    draft,
    closedAtMs,
    CRUSHER_FAILURE_DELAY_DAYS,
    CRUSHER_FAILURE_LATEST_DAYS,
    rng,
  );
}

function repeatFailure(context: SeedContext, bundle: OrderBundle, rng: Rng): OrderSlot[] {
  const doneAtMs = bundle.facts.completionsMs.at(-1);
  if (doneAtMs === undefined || !rng.chance(REPEAT_CHANCE)) return [];
  const draft: FollowUpDraft = {
    key: `${bundle.slot.key}:repeat`,
    equipmentId: bundle.slot.equipmentId,
    faultCode: bundle.slot.faultCode,
    priority: bundle.slot.priority === "emergency" ? "high" : bundle.slot.priority,
    description: `${describeFailure(bundle.slot.faultCode, bundle.facts.equipment.name, rng)} (повторная неисправность)`,
    tag: "repeat-follow-up",
    avoidAssigneeId: bundle.facts.executor.id,
    standardHours: bundle.slot.standardHours,
  };
  return placeFollowUp(context, draft, doneAtMs, REPEAT_DELAY_DAYS, REPEAT_LATEST_DAYS, rng);
}

export function deriveFollowUps(context: SeedContext, bundle: OrderBundle): OrderSlot[] {
  const rng = context.rng.fork(`follow-up:${bundle.slot.key}`);
  if (bundle.slot.tag === "crusher-repair" && bundle.facts.finalStatus === "closed")
    return crusherFailure(context, bundle, rng);
  const repeatProne =
    bundle.slot.tag === "regular" &&
    bundle.slot.kind === "unplanned" &&
    bundle.facts.finalStatus === "closed" &&
    bundle.facts.executor.personnel_number === REPEAT_FAILURE_WORKER;
  return repeatProne ? repeatFailure(context, bundle, rng) : [];
}
