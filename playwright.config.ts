import { defineConfig, devices } from "@playwright/test";

/** E2E smoke tests. Start the app first (`npm run dev` or `npm start`) against a seeded database. */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1, // tests share one seeded database and compete for real slots
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
