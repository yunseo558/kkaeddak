import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const frontendRoot = __dirname;
const backendRoot = path.resolve(frontendRoot, "../backend");
const databaseUrl = `sqlite+aiosqlite:////private/tmp/kkaeddak-playwright-e2e-${process.pid}.sqlite3`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:13000",
    colorScheme: "light",
    locale: "ko-KR",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit-mobile",
      use: {
        browserName: "webkit",
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command:
        ".venv/bin/alembic upgrade head && .venv/bin/uvicorn kkaeddak.main:app --host 127.0.0.1 --port 18080",
      cwd: backendRoot,
      env: {
        ...process.env,
        KKAEDDAK_DATABASE_URL: databaseUrl,
        KKAEDDAK_ENVIRONMENT: "test",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: "http://127.0.0.1:18080/api/v1/health",
    },
    {
      command:
        "npm run build -- --webpack && npm run start -- --hostname 127.0.0.1 --port 13000",
      cwd: frontendRoot,
      env: {
        ...process.env,
        KKAEDDAK_BACKEND_ORIGIN: "http://127.0.0.1:18080",
        NEXT_PUBLIC_API_MOCKING: "disabled",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      url: "http://127.0.0.1:13000",
    },
  ],
});
