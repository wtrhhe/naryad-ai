import { buildCatalog, type Catalog } from "./catalog";
import type { SeedMode } from "./cli-options";
import { generateHistory, type History } from "./history";
import { generateEmployeePermits } from "./permits";
import type { EmployeePermitRow } from "./types";

export type SeedDataset = {
  readonly catalog: Catalog;
  readonly permits: readonly EmployeePermitRow[];
  readonly history: History | null;
};

export type DatasetRequest = {
  readonly mode: SeedMode;
  readonly seed: number;
  readonly now: Date;
};

export function buildDataset({ mode, seed, now }: DatasetRequest): SeedDataset {
  const catalog = buildCatalog(now);
  if (mode === "minimal") {
    return { catalog, permits: generateEmployeePermits(seed, now), history: null };
  }
  const history = generateHistory(seed, now);
  return { catalog, permits: history.employeePermits, history };
}
