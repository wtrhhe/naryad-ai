import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "ru-RU",
    timezoneId: "Asia/Qostanay",
  },
  projects: [
    { name: "pixel", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 14"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${port}`,
        url: baseURL,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
      },
});
