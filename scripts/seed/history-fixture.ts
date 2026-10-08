import { buildCatalog } from "./catalog";
import { indexCatalog } from "./catalog-index";
import { generateHistory } from "./history";

export const TEST_SEED = 20261016;
export const TEST_NOW = new Date("2026-10-08T07:30:00Z");

export const fixtureCatalog = buildCatalog(TEST_NOW);
export const fixtureIndex = indexCatalog(fixtureCatalog);
export const fixtureHistory = generateHistory(TEST_SEED, TEST_NOW);
