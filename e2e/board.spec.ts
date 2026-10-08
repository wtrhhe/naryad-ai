import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { derivePinPassword, personnelEmail } from "../lib/auth/pin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const pepper = process.env.AUTH_PIN_PEPPER ?? "";
const domain = process.env.AUTH_EMAIL_DOMAIN ?? "naryad.local";

async function signInMaster(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Табельный номер").fill("1001");
  await page.getByLabel("ПИН-код").fill("1111");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/master$/);
}

function sessionClient() {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

async function signInAs(number: string, pin: string) {
  const client = sessionClient();
  const { error } = await client.auth.signInWithPassword({
    email: personnelEmail(number, domain),
    password: derivePinPassword(number, pin, pepper),
  });
  expect(error).toBeNull();
  return client;
}

async function issueOrderToWorker(workerNumber: string) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: worker } = await admin
    .from("employees")
    .select("id")
    .eq("personnel_number", workerNumber)
    .single();
  const { data: equipment } = await admin
    .from("equipment")
    .select("id, sites!inner(code)")
    .eq("sites.code", "CRUSH")
    .limit(1)
    .single();
  const master = await signInAs("1001", "1111");
  const { data, error } = await master.rpc("create_work_order", {
    payload: {
      kind: "unplanned",
      priority: "high",
      description: "Проверка обновления панели",
      equipment_id: equipment?.id,
      assignee_id: worker?.id,
      standard_hours: 2,
    },
  });
  expect(error).toBeNull();
  return data as { id: string; number: number };
}

test.describe("master shift board", () => {
  test.skip(({ browserName }) => browserName !== "chromium");

  test("shows the shift, counters, people and kanban columns", async ({ page }) => {
    await signInMaster(page);
    await expect(page.getByRole("heading", { name: "Панель смены" })).toBeVisible();
    for (const column of ["Выданные", "В работе", "Просроченные", "На доработке"]) {
      await expect(page.getByRole("heading", { name: new RegExp(column) })).toBeVisible();
    }
    await expect(page.getByText("Люди смены")).toBeVisible();
    await expect(page.getByText("Онлайн")).toBeVisible({ timeout: 10_000 });
  });

  test("reflects a worker accepting an order within five seconds", async ({ page }) => {
    const order = await issueOrderToWorker("2001");
    await signInMaster(page);
    await expect(page.getByText("Онлайн")).toBeVisible({ timeout: 10_000 });
    const card = page.getByRole("link", { name: new RegExp(`Наряд №${order.number}\\b`) });
    await expect(card).toContainText("Выдан");
    const worker = await signInAs("2001", "1234");
    const started = Date.now();
    const { error } = await worker.rpc("transition_work_order", {
      order_id: order.id,
      action: "accept",
      payload: { expected_status: "issued" },
    });
    expect(error).toBeNull();
    await expect(card).toContainText("Принят", { timeout: 5_000 });
    test
      .info()
      .annotations.push({ type: "realtime latency ms", description: String(Date.now() - started) });
  });
});
