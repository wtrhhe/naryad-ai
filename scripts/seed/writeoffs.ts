import { MATERIAL_SPECS } from "./data-materials";
import { reachedDone, type OrderFacts } from "./facts";
import type { Rng } from "./random";
import type { MaterialNormRow, MaterialRow, MaterialWriteoffRow } from "./types";

export const NIGHT_ENRICHMENT_FACTOR = 1.4;
const REGULAR_FACTOR = 1;
const REGULAR_DEVIATION = 0.08;
const NIGHT_ENRICHMENT_DEVIATION = 0.12;
const MIN_FACTOR = 0.5;
const OPTIONAL_MATERIAL_CHANCE = 0.55;
const CONTINUOUS_STEP = 10;
const DISCRETE_UNITS: readonly string[] = ["шт", "компл", "уп"];
const FITS_TYPES_BY_CODE = new Map(MATERIAL_SPECS.map((spec) => [spec.code, spec.fitsTypes]));

export function usageFactor(facts: OrderFacts, rng: Rng): number {
  const nightEnrichment = facts.siteCode === "ENRICH" && facts.period === "night";
  const mean = nightEnrichment ? NIGHT_ENRICHMENT_FACTOR : REGULAR_FACTOR;
  const deviation = nightEnrichment ? NIGHT_ENRICHMENT_DEVIATION : REGULAR_DEVIATION;
  return Math.max(MIN_FACTOR, rng.normal(mean, deviation));
}

function quantityFor(typical: number, factor: number, unit: string, rng: Rng): number {
  const expected = typical * factor;
  if (DISCRETE_UNITS.includes(unit)) return Math.max(1, rng.stochasticRound(expected));
  return Math.max(1 / CONTINUOUS_STEP, Math.round(expected * CONTINUOUS_STEP) / CONTINUOUS_STEP);
}

function isApplicable(material: MaterialRow, facts: OrderFacts): boolean {
  const fits = FITS_TYPES_BY_CODE.get(material.code);
  return fits === undefined || fits.includes(facts.equipment.equipment_type);
}

export function buildWriteoffs(
  facts: OrderFacts,
  norms: readonly MaterialNormRow[],
  materialById: ReadonlyMap<string, MaterialRow>,
  rng: Rng,
): MaterialWriteoffRow[] {
  if (!facts.fault || !reachedDone(facts)) return [];
  const factor = usageFactor(facts, rng);
  const writtenAt = new Date(facts.completionsMs.at(-1) as number).toISOString();
  return norms.flatMap((norm) => {
    const material = materialById.get(norm.material_id);
    if (!material || !isApplicable(material, facts)) return [];
    if (norm.qty_min === 0 && !rng.chance(OPTIONAL_MATERIAL_CHANCE)) return [];
    return [
      {
        id: rng.uuid(),
        work_order_id: facts.orderId,
        material_id: material.id,
        quantity: quantityFor(norm.qty_typical, factor, material.unit, rng),
        created_at: writtenAt,
      },
    ];
  });
}
