import { defineConfig, devices } from "@playwright/test";

// Ports are fixed here so the smoke tests don't depend on a local .env file.
const API_PORT = 3101;
const CLIENT_PORT = 5273;
const MOCK_GOOGLE_PORT = 3199;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Stand-in for Google Places Text Search (no real Google calls in tests).
      command: "npx tsx e2e/mock-google-places.ts",
      url: `http://127.0.0.1:${MOCK_GOOGLE_PORT}/health`,
      env: { MOCK_GOOGLE_PORT: String(MOCK_GOOGLE_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The real Express server, pointed at the mock instead of Google.
      command: "npm run dev -w server",
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        PORT: String(API_PORT),
        GOOGLE_PLACES_API_KEY: "e2e-test-key",
        GOOGLE_PLACES_API_BASE_URL: `http://127.0.0.1:${MOCK_GOOGLE_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The Vite dev server (proxies /api). No browser Maps key, so the map
      // shows its "not set up" message and the results list is tested on its own.
      command: "npm run dev -w client",
      url: `http://localhost:${CLIENT_PORT}`,
      env: {
        PORT: String(API_PORT),
        CLIENT_PORT: String(CLIENT_PORT),
        VITE_GOOGLE_MAPS_API_KEY: "",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
