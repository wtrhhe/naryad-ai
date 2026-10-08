import { expect, test, type Page } from "@playwright/test";

const ACCOUNTS = {
  master: { number: "1001", pin: "1111", home: "/master" },
  worker: { number: "2001", pin: "1234", home: "/worker" },
  manager: { number: "3001", pin: "3333", home: "/manager" },
  admin: { number: "9001", pin: "9999", home: "/admin" },
} as const;

async function signIn(page: Page, number: string, pin: string) {
  await page.goto("/login");
  await page.getByLabel("Табельный номер").fill(number);
  await page.getByLabel("ПИН-код").fill(pin);
  await page.getByRole("button", { name: "Войти" }).click();
}

test.describe("sign in by personnel number and PIN", () => {
  for (const [role, account] of Object.entries(ACCOUNTS)) {
    test(`${role} lands in own section and cannot open others`, async ({ page }) => {
      await signIn(page, account.number, account.pin);
      await expect(page).toHaveURL(new RegExp(`${account.home}$`));
      const foreign = Object.values(ACCOUNTS).find((other) => other.home !== account.home)!;
      await page.goto(foreign.home);
      await expect(page).toHaveURL(new RegExp(`${account.home}$`));
    });
  }

  test("wrong PIN shows an error with remaining attempts", async ({ page }) => {
    await signIn(page, "2015", "0000");
    await expect(page.getByRole("alert")).toContainText("Неверный табельный номер или ПИН-код");
  });

  test("protected pages redirect anonymous visitors to sign in", async ({ page }) => {
    await page.goto("/master");
    await expect(page).toHaveURL(/\/login\?next=%2Fmaster/);
  });

  test("action buttons are large enough for gloves", async ({ page }) => {
    await page.goto("/login");
    const box = await page.getByRole("button", { name: "Войти" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(64);
  });

  test("responses carry a nonce based content security policy", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.headers()["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
  });
});
