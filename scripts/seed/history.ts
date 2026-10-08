import { buildRoutineSamples } from "./acoustic-samples";
import { createAssigner } from "./assignment";
import type { OrderBundle } from "./assemble";
import { createEquipmentCalendar } from "./calendar";
import { buildCatalog } from "./catalog";
import { indexCatalog } from "./catalog-index";
import type { SeedContext } from "./context";
import { generateEmployeePermits } from "./permits";
import { buildOpenBundles, reserveOpenWindows } from "./open-orders";
import { processSlots } from "./process";
import { createRng } from "./random";
import { buildGlandLeakCase } from "./rca";
import { generatePlannedSlots } from "./slots-planned";
import { CALENDAR_MARGIN_MS, WINDOW_END_BUFFER_MS } from "./slots-common";
import { generateScriptedSlots } from "./slots-scripted";
import { generateUnplannedSlots } from "./slots-unplanned";
import { MS_PER_DAY } from "./time";
import type {
  AcousticSampleRow,
  AiReviewRow,
  EmployeePermitRow,
  LockoutRow,
  MaterialWriteoffRow,
  PhotoRow,
  RcaCaseRow,
  WorkOrderEventRow,
  WorkOrderRow,
} from "./types";

export const HISTORY_DAYS = 90;

export type History = {
  readonly workOrders: readonly WorkOrderRow[];
  readonly events: readonly WorkOrderEventRow[];
  readonly photos: readonly PhotoRow[];
  readonly materialWriteoffs: readonly MaterialWriteoffRow[];
  readonly aiReviews: readonly AiReviewRow[];
  readonly lockouts: readonly LockoutRow[];
  readonly acousticSamples: readonly AcousticSampleRow[];
  readonly rcaCases: readonly RcaCaseRow[];
  readonly employeePermits: readonly EmployeePermitRow[];
};

function createContext(seed: number, now: Date): SeedContext {
  const rng = createRng(seed);
  const catalog = buildCatalog(now);
  const index = indexCatalog(catalog);
  const permits = generateEmployeePermits(seed, now);
  const nowMs = now.getTime();
  return {
    nowMs,
    windowStartMs: nowMs - HISTORY_DAYS * MS_PER_DAY,
    windowEndMs: nowMs - WINDOW_END_BUFFER_MS,
    catalog,
    index,
    permits,
    rng,
    calendar: createEquipmentCalendar(CALENDAR_MARGIN_MS),
    assigner: createAssigner({ workers: index.workers, permits, rng: rng.fork("assigner") }),
  };
}

function routineAcousticSamples(context: SeedContext): AcousticSampleRow[] {
  const recorders = context.index.workers.filter((worker) => worker.specialty === "lubricator");
  const window = { startMs: context.windowStartMs, endMs: context.windowEndMs };
  return context.catalog.equipment.flatMap((equipment) =>
    buildRoutineSamples(
      equipment,
      recorders,
      window,
      context.rng.fork(`routine:${equipment.inventory_number}`),
    ),
  );
}

const byIssuedAt = (a: OrderBundle, b: OrderBundle): number =>
  a.slot.issuedAtMs - b.slot.issuedAtMs || a.slot.key.localeCompare(b.slot.key);

export function generateHistory(seed: number, now: Date): History {
  const context = createContext(seed, now);
  reserveOpenWindows(context);
  const slots = [
    ...generateScriptedSlots(context),
    ...generateUnplannedSlots(context),
    ...generatePlannedSlots(context),
  ];
  const bundles = [...processSlots(context, slots), ...buildOpenBundles(context)].sort(byIssuedAt);
  const byRecordedAt = (a: AcousticSampleRow, b: AcousticSampleRow) =>
    (a.recorded_at as string).localeCompare(b.recorded_at as string);
  return {
    workOrders: bundles.map((bundle) => bundle.order),
    events: bundles.flatMap((bundle) => bundle.events),
    photos: bundles.flatMap((bundle) => bundle.photos),
    materialWriteoffs: bundles.flatMap((bundle) => bundle.writeoffs),
    aiReviews: bundles.flatMap((bundle) => bundle.reviews),
    lockouts: bundles.flatMap((bundle) => (bundle.lockout ? [bundle.lockout] : [])),
    acousticSamples: [
      ...bundles.flatMap((bundle) => bundle.acousticSamples),
      ...routineAcousticSamples(context),
    ].sort(byRecordedAt),
    rcaCases: buildGlandLeakCase(context, bundles),
    employeePermits: context.permits,
  };
}
