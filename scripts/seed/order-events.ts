import type { Json } from "../../lib/supabase/database.types";
import type { OrderFacts } from "./facts";
import type { Rng } from "./random";
import { MS_PER_MINUTE } from "./time";
import type { PlacedStep, StepActor } from "./timeline";
import type { EmployeeRow, ReasonCodeRow, WorkOrderEventRow } from "./types";

const INVALID_REJECT_SHARE = 0.25;
const INVALID_PAUSE_SHARE = 0.1;
const REASON_TEXT_CHANCE = 0.5;
const OFFLINE_CHANCE = 0.08;
const OFFLINE_DELAY_MINUTES = [2, 40] as const;
const ONLINE_DELAY_SECONDS = [0, 3] as const;
const REASON_TEXTS: readonly string[] = [
  "Сообщил мастеру по телефону",
  "Подробности устно",
  "Вернусь к работе после согласования",
];

export type ReasonPools = {
  readonly reject: readonly ReasonCodeRow[];
  readonly pause: readonly ReasonCodeRow[];
};

type EventActors = {
  readonly master: EmployeeRow;
  readonly initial: EmployeeRow;
  readonly executor: EmployeeRow;
};

const actorIdOf = (actor: StepActor, actors: EventActors): string | null => {
  if (actor === "system") return null;
  return actors[actor].id;
};

function pickReason(kind: "reject" | "pause", pools: ReasonPools, rng: Rng): ReasonCodeRow {
  const pool = pools[kind];
  const invalidShare = kind === "reject" ? INVALID_REJECT_SHARE : INVALID_PAUSE_SHARE;
  const wantInvalid = rng.chance(invalidShare);
  const matching = pool.filter((reason) => (reason.is_valid_excuse === false) === wantInvalid);
  return rng.pick(matching.length > 0 ? matching : pool);
}

function deviceTimeMs(step: PlacedStep, rng: Rng): number | null {
  if (step.actor !== "initial" && step.actor !== "executor") return null;
  if (rng.chance(OFFLINE_CHANCE))
    return step.atMs - Math.round(rng.float(...OFFLINE_DELAY_MINUTES) * MS_PER_MINUTE);
  return step.atMs - Math.round(rng.float(...ONLINE_DELAY_SECONDS) * 1000);
}

function payloadOf(step: PlacedStep, actors: EventActors): NonNullable<Json> {
  if (step.action === "issue") return { assignee_id: actors.initial.id };
  if (step.action === "reassign") return { from: actors.initial.id, to: actors.executor.id };
  return { ...(step.payload ?? {}) };
}

export function buildEvents(
  facts: OrderFacts,
  initial: EmployeeRow,
  pools: ReasonPools,
  rng: Rng,
): WorkOrderEventRow[] {
  const actors: EventActors = { master: facts.master, initial, executor: facts.executor };
  return facts.steps.map((step) => {
    const reason = step.reasonKind ? pickReason(step.reasonKind, pools, rng) : null;
    const deviceMs = deviceTimeMs(step, rng);
    const reasonText =
      reason && reason.is_valid_excuse === false && rng.chance(REASON_TEXT_CHANCE)
        ? rng.pick(REASON_TEXTS)
        : null;
    return {
      id: rng.uuid(),
      work_order_id: facts.orderId,
      actor_id: actorIdOf(step.actor, actors),
      action: step.action,
      from_status: step.from,
      to_status: step.to,
      reason_code_id: reason?.id ?? null,
      reason_text: reasonText,
      comment: step.comment ?? null,
      payload: payloadOf(step, actors),
      device_at: deviceMs === null ? null : new Date(deviceMs).toISOString(),
      occurred_at: new Date(step.atMs).toISOString(),
    };
  });
}
