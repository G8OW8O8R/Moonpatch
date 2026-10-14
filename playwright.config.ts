import { defineConfig, devices } from "@playwright/test";

const port = 3200;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Slower to draw the scene in software, so they get longer to settle.
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, expect: { timeout: 10_000 } },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, expect: { timeout: 10_000 }, timeout: 90_000, retries: 1 },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${port}`,
    url: `http://localhost:${port}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
