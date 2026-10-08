import { buildOrderAcousticSamples } from "./acoustic-samples";
import type { SeedContext } from "./context";
import { MASTER_BY_SITE_DAY, NIGHT_DUTY_MASTER } from "./data-people";
import { deriveFacts, type OrderFacts } from "./facts";
import { buildLockout } from "./lockouts";
import { buildEvents } from "./order-events";
import { buildOrderRow } from "./order-row";
import { buildPhotos } from "./photos";
import type { Rng } from "./random";
import { buildReviews } from "./reviews";
import type { OrderSlot } from "./slots-common";
import { shiftPeriodAt } from "./time";
import { placeSteps, type TimelineStep } from "./timeline";
import type {
  AcousticSampleRow,
  AiReviewRow,
  EmployeeRow,
  LockoutRow,
  MaterialWriteoffRow,
  PhotoRow,
  WorkOrderEventRow,
  WorkOrderPriority,
  WorkOrderRow,
} from "./types";
import { buildWriteoffs } from "./writeoffs";

export type OrderBundle = {
  readonly slot: OrderSlot;
  readonly facts: OrderFacts;
  readonly order: WorkOrderRow;
  readonly events: readonly WorkOrderEventRow[];
  readonly photos: readonly PhotoRow[];
  readonly writeoffs: readonly MaterialWriteoffRow[];
  readonly reviews: readonly AiReviewRow[];
  readonly lockout: LockoutRow | null;
  readonly acousticSamples: readonly AcousticSampleRow[];
};

export type AssembleInput = {
  readonly slot: OrderSlot;
  readonly initial: EmployeeRow;
  readonly executor: EmployeeRow;
  readonly steps: readonly TimelineStep[];
  readonly pausedMs: number;
  readonly scale: number;
  readonly escalateTo: WorkOrderPriority | null;
  readonly rng: Rng;
};

export function assembleBundle(context: SeedContext, input: AssembleInput): OrderBundle {
  const { slot, rng } = input;
  const { index } = context;
  const equipment = index.equipmentById.get(slot.equipmentId);
  const fault = index.faultByCode.get(slot.faultCode) ?? null;
  const siteCode = equipment ? index.siteCodeById.get(equipment.site_id) : undefined;
  if (!equipment || !siteCode) throw new Error(`Unknown equipment ${slot.equipmentId}`);
  const period = shiftPeriodAt(new Date(slot.issuedAtMs));
  const masterNumber = period === "day" ? MASTER_BY_SITE_DAY[siteCode] : NIGHT_DUTY_MASTER;
  const master = index.employeeByNumber.get(masterNumber);
  if (!master) throw new Error(`Unknown master ${masterNumber}`);
  const facts = deriveFacts({
    orderId: rng.uuid(),
    equipment,
    fault,
    executor: input.executor,
    master,
    siteCode,
    period,
    standardHours: slot.standardHours,
    steps: placeSteps(input.steps, slot.issuedAtMs, input.scale),
    pausedMs: Math.round(input.pausedMs * input.scale),
  });
  const norms = fault ? (index.normsByFaultId.get(fault.id) ?? []) : [];
  const writeoffs = buildWriteoffs(facts, norms, index.materialById, rng);
  const photos = buildPhotos(facts, rng);
  const reviews = buildReviews(facts, { writeoffs, norms, photos }, rng);
  const order = buildOrderRow({
    slot,
    facts,
    faultRows: context.catalog.faultCodes,
    executor: input.executor,
    finalPriority: input.escalateTo ?? slot.priority,
    rng,
  });
  const reasonPools = {
    reject: index.reasonsByKind.get("reject") ?? [],
    pause: index.reasonsByKind.get("pause") ?? [],
  };
  return {
    slot,
    facts,
    order,
    events: buildEvents(facts, input.initial, reasonPools, rng),
    photos,
    writeoffs,
    reviews,
    lockout: buildLockout(facts, rng),
    acousticSamples: buildOrderAcousticSamples(
      facts,
      { startMs: context.windowStartMs, endMs: context.windowEndMs },
      rng,
    ),
  };
}
