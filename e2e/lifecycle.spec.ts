import { expect, test, type Browser, type Page } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQElEQVR4nO3PQQ0AIBDAsANtSMEtEmaDB0kroNnamTnvcyZ3jXiIgICAgICAgICAgICAgICAgICAgICAgICAgMDTA0z9AX+5i/WbAAAAAElFTkSuQmCC",
  "base64",
);

async function signIn(page: Page, number: string, pin: string, home: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Табельный номер").fill(number);
  await page.getByLabel("ПИН-код").fill(pin);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(home);
}

async function newSession(browser: Browser, number: string, pin: string, home: RegExp) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, number, pin, home);
  return page;
}

test.describe("work order lifecycle", () => {
  test.skip(({ browserName }) => browserName !== "chromium");
  test.setTimeout(180_000);

  test("master issues, worker executes and closes, master accepts", async ({ page, browser }) => {
    await signIn(page, "1001", "1111", /\/master$/);
    await page.goto("/master/orders/new");
    await page.getByLabel("Описание").fill("Течь масла из-под сальника насоса, насос остановлен");
    const equipmentSelect = page.locator("select").first();
    const pumpValue = await equipmentSelect
      .locator("option", { hasText: "Насос Н-5" })
      .getAttribute("value");
    await equipmentSelect.selectOption(pumpValue ?? "");
    await page.getByRole("button", { name: /Ахметов/ }).click();
    await page.getByRole("button", { name: "Выдать наряд" }).click();
    await expect(page).toHaveURL(/\/master\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const orderId = page.url().split("/").pop() ?? "";

    const worker = await newSession(browser, "2001", "1234", /\/worker$/);
    await expect(worker.getByText("Насос Н-5").first()).toBeVisible();
    await worker.goto(`/worker/orders/${orderId}`);
    await worker.getByRole("button", { name: "Принять" }).click();
    await worker.getByRole("button", { name: "Начать" }).click();
    await expect(worker.getByText("Чек-лист безопасности")).toBeVisible({ timeout: 15_000 });
    for (const box of await worker.locator('input[type="checkbox"]').all()) await box.check();
    await worker.getByRole("button", { name: "Начать работу" }).click();
    await expect(worker.getByText("В работе").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("В работе").first()).toBeVisible({ timeout: 5_000 });

    await worker.getByRole("button", { name: "Приостановить" }).click();
    await worker.getByRole("button", { name: "Ожидание запчастей" }).click();
    await worker.getByRole("button", { name: "Приостановить" }).last().click();
    await worker.getByRole("button", { name: "Продолжить" }).click();

    await worker.getByRole("button", { name: "Исполнено" }).click();
    await worker
      .getByLabel("Выполненные работы")
      .fill("Заменён сальник, подтянуты крышки, течь устранена");
    await worker.locator("input[type=file][multiple]").setInputFiles({
      name: "after.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(worker.getByText("1 из 5")).toBeVisible({ timeout: 10_000 });
    await worker.getByRole("button", { name: "Отправить на проверку" }).click();
    await expect(worker.getByText(/Исполнено|Проверка ИИ/).first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Приёмка наряда")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    const close = page.getByRole("button", {
      name: /Согласен — закрыть наряд|Закрыть без оценки ИИ/,
    });
    if (await close.count()) {
      await close.first().click();
      await page.getByRole("button", { name: "Нажмите ещё раз — действие необратимо" }).click();
      await expect(page.getByText("Закрыт").first()).toBeVisible({ timeout: 15_000 });
    }
  });
});
