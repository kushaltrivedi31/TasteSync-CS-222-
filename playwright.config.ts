import { defineConfig, devices } from "@playwright/test";

// Ports are fixed here so the smoke test does not depend on a local .env file.
const API_PORT = 3101;
const CLIENT_PORT = 5273;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Starts the real Express server and the Vite dev server (which proxies /api).
  webServer: [
    {
      command: "npm run dev -w server",
      url: `http://localhost:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w client",
      url: `http://localhost:${CLIENT_PORT}`,
      env: { PORT: String(API_PORT), CLIENT_PORT: String(CLIENT_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
