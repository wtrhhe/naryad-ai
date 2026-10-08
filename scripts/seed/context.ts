import type { Assigner } from "./assignment";
import type { EquipmentCalendar } from "./calendar";
import type { Catalog } from "./catalog";
import type { CatalogIndex } from "./catalog-index";
import type { Rng } from "./random";
import type { EmployeePermitRow } from "./types";

export type SeedContext = {
  readonly nowMs: number;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly catalog: Catalog;
  readonly index: CatalogIndex;
  readonly permits: readonly EmployeePermitRow[];
  readonly rng: Rng;
  readonly calendar: EquipmentCalendar;
  readonly assigner: Assigner;
};
