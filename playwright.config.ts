import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const RULES_RUN = !!process.env.FIRESTORE_EMULATOR_HOST;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "unit", testDir: "tests/unit", retries: 0 },
    ...(RULES_RUN ? [{ name: "rules", testDir: "tests/rules", retries: 0 }] : []),
    { name: "e2e", testDir: "tests/e2e", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: RULES_RUN
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
      },
});
