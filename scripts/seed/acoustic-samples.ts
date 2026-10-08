import { SAMPLE_DURATION_SECONDS, SAMPLE_RATE_HZ, synthesizeMeasurement } from "./acoustic-signal";
import type { BearingSpec } from "./data-equipment";
import { reachedDone, wasStarted, type OrderFacts } from "./facts";
import { isConveyorK3 } from "./slots-unplanned";
import type { Rng } from "./random";
import { MS_PER_DAY, MS_PER_MINUTE } from "./time";
import type { AcousticSampleRow, EmployeeRow, EquipmentRow } from "./types";

export type AcousticWindow = { readonly startMs: number; readonly endMs: number };

const HEALTHY_SEVERITY = 0.12;
const HEALTHY_DEVIATION = 0.035;
const HEALTHY_RANGE = [0.05, 0.3] as const;
const K3_SEVERITY_GROWTH = 0.7;
const K3_DEVIATION = 0.03;
const AFTER_REPAIR_RELIEF = 0.03;
const BEARING_FAULT_CODE = "М-02";
const BEFORE_SAMPLE_CHANCE = 0.6;
const AFTER_SAMPLE_CHANCE = 0.9;
const ROUTINE_INTERVAL_DAYS = 5;
const ROUTINE_JITTER_DAYS = 1;
const SAMPLE_OFFSET_MINUTES = [3, 20] as const;

export function bearingOf(equipment: EquipmentRow): BearingSpec | null {
  if (
    equipment.rpm == null ||
    equipment.bearing_rolling_elements == null ||
    equipment.bearing_ball_diameter_mm == null ||
    equipment.bearing_pitch_diameter_mm == null
  ) {
    return null;
  }
  return {
    rpm: equipment.rpm,
    rollingElements: equipment.bearing_rolling_elements,
    ballDiameterMm: equipment.bearing_ball_diameter_mm,
    pitchDiameterMm: equipment.bearing_pitch_diameter_mm,
    contactAngleDeg: equipment.bearing_contact_angle_deg ?? 0,
  };
}

export function severityAt(
  equipment: EquipmentRow,
  atMs: number,
  window: AcousticWindow,
  rng: Rng,
): number {
  if (!isConveyorK3(equipment)) {
    return Math.min(
      HEALTHY_RANGE[1],
      Math.max(HEALTHY_RANGE[0], rng.normal(HEALTHY_SEVERITY, HEALTHY_DEVIATION)),
    );
  }
  const progress = Math.min(
    1,
    Math.max(0, (atMs - window.startMs) / (window.endMs - window.startMs)),
  );
  return Math.min(
    0.95,
    Math.max(0.05, HEALTHY_SEVERITY + K3_SEVERITY_GROWTH * progress + rng.normal(0, K3_DEVIATION)),
  );
}

function buildSample(
  equipment: EquipmentRow,
  bearing: BearingSpec,
  input: {
    readonly kind: "before" | "after";
    readonly atMs: number;
    readonly orderId: string | null;
    readonly recordedBy: string | null;
  },
  window: AcousticWindow,
  rng: Rng,
): AcousticSampleRow {
  const relief = input.kind === "after" && isConveyorK3(equipment) ? AFTER_REPAIR_RELIEF : 0;
  const measurement = synthesizeMeasurement(
    bearing,
    Math.max(0.05, severityAt(equipment, input.atMs, window, rng) - relief),
    rng,
  );
  const recordedAt = new Date(input.atMs).toISOString();
  return {
    id: rng.uuid(),
    work_order_id: input.orderId,
    equipment_id: equipment.id,
    kind: input.kind,
    storage_path: null,
    spectrum: measurement.spectrum.map((bin) => ({ f: bin.f, db: bin.db })),
    rms: measurement.rms,
    peaks: measurement.peaks.map((peak) => ({ ...peak })),
    spectral_kurtosis: measurement.spectralKurtosis,
    sample_rate: SAMPLE_RATE_HZ,
    duration_seconds: SAMPLE_DURATION_SECONDS,
    recorded_by: input.recordedBy,
    recorded_at: recordedAt,
    created_at: recordedAt,
  };
}

export function buildOrderAcousticSamples(
  facts: OrderFacts,
  window: AcousticWindow,
  rng: Rng,
): AcousticSampleRow[] {
  const bearing = bearingOf(facts.equipment);
  if (!bearing || !wasStarted(facts) || facts.startedAtMs === null) return [];
  const bearingFault = facts.fault?.code === BEARING_FAULT_CODE;
  const recordedBy = facts.executor.id;
  const before = rng.chance(bearingFault ? 1 : BEFORE_SAMPLE_CHANCE)
    ? [
        buildSample(
          facts.equipment,
          bearing,
          {
            kind: "before",
            atMs:
              facts.startedAtMs - Math.round(rng.float(...SAMPLE_OFFSET_MINUTES) * MS_PER_MINUTE),
            orderId: facts.orderId,
            recordedBy,
          },
          window,
          rng,
        ),
      ]
    : [];
  const lastCompletion = facts.completionsMs.at(-1);
  const after =
    before.length > 0 &&
    reachedDone(facts) &&
    lastCompletion !== undefined &&
    rng.chance(AFTER_SAMPLE_CHANCE)
      ? [
          buildSample(
            facts.equipment,
            bearing,
            {
              kind: "after",
              atMs:
                lastCompletion + Math.round(rng.float(...SAMPLE_OFFSET_MINUTES) * MS_PER_MINUTE),
              orderId: facts.orderId,
              recordedBy,
            },
            window,
            rng,
          ),
        ]
      : [];
  return [...before, ...after];
}

export function buildRoutineSamples(
  equipment: EquipmentRow,
  recorders: readonly EmployeeRow[],
  window: AcousticWindow,
  rng: Rng,
): AcousticSampleRow[] {
  const bearing = bearingOf(equipment);
  if (!bearing || recorders.length === 0) return [];
  const samples: AcousticSampleRow[] = [];
  for (
    let day = rng.float(0, ROUTINE_INTERVAL_DAYS);
    window.startMs + day * MS_PER_DAY < window.endMs;
    day += ROUTINE_INTERVAL_DAYS + rng.float(-ROUTINE_JITTER_DAYS, ROUTINE_JITTER_DAYS)
  ) {
    samples.push(
      buildSample(
        equipment,
        bearing,
        {
          kind: "before",
          atMs: window.startMs + Math.round(day * MS_PER_DAY),
          orderId: null,
          recordedBy: rng.pick(recorders).id,
        },
        window,
        rng,
      ),
    );
  }
  return samples;
}
