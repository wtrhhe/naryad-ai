import { derivePinPassword, personnelEmail } from "../../lib/auth/pin";
import { TEST_ACCOUNTS } from "./catalog";
import type { SeedEnv } from "./cli-options";
import type { SeedDataset } from "./dataset";

export type SeedGateway = {
  readonly countRows: (table: string) => Promise<number>;
  readonly insert: (table: string, rows: readonly object[]) => Promise<void>;
  readonly createAuthUser: (email: string, password: string) => Promise<string>;
  readonly deleteAuthUser: (id: string) => Promise<void>;
  readonly listAuthEmails: () => Promise<string[]>;
};

export type TableCounts = Readonly<Record<string, number>>;

export class SeedError extends Error {}

export const MAX_BATCH_SIZE = 500;
const AUTH_CONCURRENCY = 5;
const GUARDED_TABLES: readonly string[] = ["sites", "employees", "equipment", "work_orders"];
const RESET_HINT = "Run `supabase db reset` and then run the seed again.";

type TableStep = { readonly table: string; readonly rows: readonly object[] };

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const pinOf = (personnelNumber: string): string => {
  const account = TEST_ACCOUNTS.find((candidate) => candidate.personnelNumber === personnelNumber);
  if (!account) throw new SeedError(`No test account for personnel number ${personnelNumber}`);
  return account.pin;
};

async function assertDatabaseIsEmpty(gateway: SeedGateway, env: SeedEnv): Promise<void> {
  for (const table of GUARDED_TABLES) {
    const count = await gateway.countRows(table);
    if (count > 0)
      throw new SeedError(
        `The database already contains data (${table}: ${count} rows). ${RESET_HINT}`,
      );
  }
  const seedEmails = new Set(
    TEST_ACCOUNTS.map((account) => personnelEmail(account.personnelNumber, env.emailDomain)),
  );
  const existing = (await gateway.listAuthEmails()).filter((email) => seedEmails.has(email));
  if (existing.length > 0)
    throw new SeedError(
      `Seed accounts already exist in auth (${existing.length} users). ${RESET_HINT}`,
    );
}

async function createAuthUsers(
  gateway: SeedGateway,
  env: SeedEnv,
  personnelNumbers: readonly string[],
  created: Map<string, string>,
): Promise<void> {
  for (const group of chunk(personnelNumbers, AUTH_CONCURRENCY)) {
    const results = await Promise.allSettled(
      group.map(async (number) => {
        const id = await gateway.createAuthUser(
          personnelEmail(number, env.emailDomain),
          derivePinPassword(number, pinOf(number), env.pinPepper),
        );
        created.set(number, id);
      }),
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }
}

function referenceSteps(dataset: SeedDataset, authIds: ReadonlyMap<string, string>): TableStep[] {
  const { catalog, permits } = dataset;
  const employees = catalog.employees.map((employee) => ({
    ...employee,
    auth_user_id: authIds.get(employee.personnel_number) ?? null,
  }));
  return [
    { table: "sites", rows: catalog.sites },
    { table: "brigades", rows: catalog.brigades },
    { table: "employees", rows: employees },
    { table: "employee_sites", rows: catalog.employeeSites },
    { table: "equipment", rows: catalog.equipment },
    { table: "fault_codes", rows: catalog.faultCodes },
    { table: "materials", rows: catalog.materials },
    { table: "material_norms", rows: catalog.materialNorms },
    { table: "time_norms", rows: catalog.timeNorms },
    { table: "reason_codes", rows: catalog.reasonCodes },
    { table: "permit_types", rows: catalog.permitTypes },
    { table: "employee_permits", rows: permits },
    { table: "equipment_permit_requirements", rows: catalog.permitRequirements },
  ];
}

function historySteps(dataset: SeedDataset): TableStep[] {
  const { history } = dataset;
  if (!history) return [];
  return [
    { table: "work_orders", rows: history.workOrders },
    { table: "work_order_events", rows: history.events },
    { table: "photos", rows: history.photos },
    { table: "acoustic_samples", rows: history.acousticSamples },
    { table: "material_writeoffs", rows: history.materialWriteoffs },
    { table: "ai_reviews", rows: history.aiReviews },
    { table: "lockouts", rows: history.lockouts },
    { table: "rca_cases", rows: history.rcaCases },
  ];
}

async function insertStep(gateway: SeedGateway, step: TableStep): Promise<void> {
  try {
    for (const batch of chunk(step.rows, MAX_BATCH_SIZE)) {
      await gateway.insert(step.table, batch);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SeedError(`Failed to write ${step.table}: ${reason}. ${RESET_HINT}`);
  }
}

async function removeCreatedUsers(
  gateway: SeedGateway,
  created: ReadonlyMap<string, string>,
): Promise<void> {
  await Promise.allSettled([...created.values()].map((id) => gateway.deleteAuthUser(id)));
}

export async function writeSeed(
  gateway: SeedGateway,
  env: SeedEnv,
  dataset: SeedDataset,
): Promise<TableCounts> {
  await assertDatabaseIsEmpty(gateway, env);
  const created = new Map<string, string>();
  try {
    await createAuthUsers(
      gateway,
      env,
      dataset.catalog.employees.map((employee) => employee.personnel_number),
      created,
    );
    const steps = [...referenceSteps(dataset, created), ...historySteps(dataset)];
    for (const step of steps) {
      await insertStep(gateway, step);
    }
    return Object.fromEntries(steps.map((step) => [step.table, step.rows.length]));
  } catch (error) {
    await removeCreatedUsers(gateway, created);
    throw error;
  }
}
