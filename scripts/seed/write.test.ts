import { describe, expect, it } from "vitest";
import { derivePinPassword, personnelEmail } from "../../lib/auth/pin";
import { buildDataset } from "./dataset";
import { SeedError, writeSeed, type SeedGateway } from "./write";

const now = new Date("2026-10-08T07:30:00Z");
const env = {
  supabaseUrl: "http://127.0.0.1:54321",
  serviceRoleKey: "k".repeat(30),
  pinPepper: "p".repeat(32),
  emailDomain: "naryad.local",
};

type FakeState = {
  readonly inserts: Array<{ table: string; rows: readonly Record<string, unknown>[] }>;
  readonly created: Array<{ email: string; password: string; id: string }>;
  readonly deleted: string[];
};

function createFakeGateway(
  options: {
    existingRows?: Record<string, number>;
    existingEmails?: string[];
    failOnTable?: string;
  } = {},
) {
  const state: FakeState = { inserts: [], created: [], deleted: [] };
  const gateway: SeedGateway = {
    countRows: async (table) => options.existingRows?.[table] ?? 0,
    listAuthEmails: async () => options.existingEmails ?? [],
    insert: async (table, rows) => {
      if (table === options.failOnTable) throw new Error(`insert into ${table} failed`);
      state.inserts.push({ table, rows: rows as readonly Record<string, unknown>[] });
    },
    createAuthUser: async (email, password) => {
      const id = `00000000-0000-4000-8000-${String(state.created.length).padStart(12, "0")}`;
      state.created.push({ email, password, id });
      return id;
    },
    deleteAuthUser: async (id) => {
      state.deleted.push(id);
    },
  };
  return { gateway, state };
}

const tablesInOrder = (state: FakeState) => [
  ...new Set(state.inserts.map((insert) => insert.table)),
];

describe("buildDataset", () => {
  it("contains no history in minimal mode but keeps permits", () => {
    const dataset = buildDataset({ mode: "minimal", seed: 1, now });
    expect(dataset.history).toBeNull();
    expect(dataset.permits.length).toBeGreaterThan(30);
  });

  it("contains reused permits and history in full mode", () => {
    const dataset = buildDataset({ mode: "full", seed: 1, now });
    expect(dataset.history?.workOrders.length).toBeGreaterThanOrEqual(600);
    expect(dataset.history?.employeePermits).toBe(dataset.permits);
  });
});

describe("writeSeed minimal", () => {
  const dataset = buildDataset({ mode: "minimal", seed: 1, now });

  it("inserts reference tables in foreign key order and no history", async () => {
    const { gateway, state } = createFakeGateway();
    await writeSeed(gateway, env, dataset);
    expect(tablesInOrder(state)).toEqual([
      "sites",
      "brigades",
      "employees",
      "employee_sites",
      "equipment",
      "fault_codes",
      "materials",
      "material_norms",
      "time_norms",
      "reason_codes",
      "permit_types",
      "employee_permits",
      "equipment_permit_requirements",
    ]);
  });

  it("creates one confirmed auth user per employee with the derived password", async () => {
    const { gateway, state } = createFakeGateway();
    await writeSeed(gateway, env, dataset);
    expect(state.created).toHaveLength(19);
    const worker = state.created.find(
      (user) => user.email === personnelEmail("2004", "naryad.local"),
    );
    expect(worker?.password).toBe(derivePinPassword("2004", "1234", env.pinPepper));
    const master = state.created.find(
      (user) => user.email === personnelEmail("1001", "naryad.local"),
    );
    expect(master?.password).toBe(derivePinPassword("1001", "1111", env.pinPepper));
  });

  it("links employees to the created auth users", async () => {
    const { gateway, state } = createFakeGateway();
    await writeSeed(gateway, env, dataset);
    const employees = state.inserts.find((insert) => insert.table === "employees")?.rows ?? [];
    const authIds = new Set(state.created.map((user) => user.id));
    expect(employees).toHaveLength(19);
    expect(employees.every((employee) => authIds.has(employee.auth_user_id as string))).toBe(true);
  });

  it("returns row counts per table", async () => {
    const { gateway } = createFakeGateway();
    const counts = await writeSeed(gateway, env, dataset);
    expect(counts.sites).toBe(4);
    expect(counts.equipment).toBe(25);
    expect(counts.employees).toBe(19);
    expect(counts.materials).toBe(40);
    expect(counts.work_orders).toBeUndefined();
  });
});

describe("writeSeed full", () => {
  const dataset = buildDataset({ mode: "full", seed: 1, now });

  it("inserts history after reference data in foreign key order", async () => {
    const { gateway, state } = createFakeGateway();
    await writeSeed(gateway, env, dataset);
    const order = tablesInOrder(state);
    expect(order.slice(-8)).toEqual([
      "work_orders",
      "work_order_events",
      "photos",
      "acoustic_samples",
      "material_writeoffs",
      "ai_reviews",
      "lockouts",
      "rca_cases",
    ]);
  });

  it("never sends more than 500 rows in one insert", async () => {
    const { gateway, state } = createFakeGateway();
    await writeSeed(gateway, env, dataset);
    expect(Math.max(...state.inserts.map((insert) => insert.rows.length))).toBeLessThanOrEqual(500);
    const insertedOrders = state.inserts
      .filter((insert) => insert.table === "work_orders")
      .reduce((sum, insert) => sum + insert.rows.length, 0);
    expect(insertedOrders).toBe(dataset.history?.workOrders.length);
  });

  it("inserts work orders chronologically so numbers follow issue order", async () => {
    const { gateway, state } = createFakeGateway();
    await writeSeed(gateway, env, dataset);
    const issued = state.inserts
      .filter((insert) => insert.table === "work_orders")
      .flatMap((insert) => insert.rows.map((row) => row.issued_at as string));
    expect(issued).toEqual([...issued].sort());
  });
});

describe("writeSeed safety", () => {
  const dataset = buildDataset({ mode: "minimal", seed: 1, now });

  it("refuses to run when the database already contains rows", async () => {
    const { gateway, state } = createFakeGateway({ existingRows: { sites: 4 } });
    await expect(writeSeed(gateway, env, dataset)).rejects.toThrow(/supabase db reset/);
    await expect(writeSeed(gateway, env, dataset)).rejects.toBeInstanceOf(SeedError);
    expect(state.inserts).toHaveLength(0);
    expect(state.created).toHaveLength(0);
  });

  it("refuses to run when seed accounts already exist in auth", async () => {
    const { gateway, state } = createFakeGateway({
      existingEmails: [personnelEmail("1001", "naryad.local")],
    });
    await expect(writeSeed(gateway, env, dataset)).rejects.toThrow(/supabase db reset/);
    expect(state.created).toHaveLength(0);
  });

  it("removes the auth users it created when a later insert fails", async () => {
    const { gateway, state } = createFakeGateway({ failOnTable: "equipment" });
    await expect(writeSeed(gateway, env, dataset)).rejects.toThrow(/equipment/);
    expect(state.deleted.sort()).toEqual(state.created.map((user) => user.id).sort());
  });
});
