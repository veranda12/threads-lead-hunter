import { defineConfig, devices } from "@playwright/test";

// Smoke test terhadap deployment production (tanpa web server lokal).
//   E2E_BASE_URL=https://... E2E_EMAIL=... E2E_PASSWORD=... npx playwright test -c playwright.prod.config.ts
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
