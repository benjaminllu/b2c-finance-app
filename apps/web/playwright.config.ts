import { defineConfig, devices } from "@playwright/test";

const PORT = 3105;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Escape hatch for machines where `playwright install` cannot fetch the pinned build.
        launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    // Empty DATABASE_URL pins the seed-JSON path even when a local .env points at Postgres.
    env: { ADMIN_PASSWORD: "test", DATABASE_URL: "" },
  },
});
