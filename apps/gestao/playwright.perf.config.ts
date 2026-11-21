import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STATE, E2E_PORT } from "./e2e/support/env";

/** Medições de performance (e2e/perf/*.perf.ts), fora da suíte e2e. Reaproveita a sessão do admin E2E. */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/perf-artifacts",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${E2E_PORT}`, locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  projects: [
    { name: "setup", testMatch: "**/auth.setup.e2e.ts" },
    {
      name: "perf",
      testMatch: "**/perf/*.perf.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: ADMIN_STATE },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
  },
});
