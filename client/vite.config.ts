import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// The root .env file (optional) is shared with the server.
const rootDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const apiTarget = `http://localhost:${env.PORT || "3001"}`;
  const clientPort = Number(env.CLIENT_PORT || "5173");

  // Forward /api requests to the Express server so the browser only talks
  // to one origin during development and preview.
  const proxy = { "/api": { target: apiTarget, changeOrigin: true } };

  return {
    plugins: [react()],
    envDir: rootDir,
    server: { port: clientPort, strictPort: true, proxy },
    preview: { port: clientPort, strictPort: true, proxy },
    test: {
      environment: "jsdom",
      include: ["tests/**/*.test.{ts,tsx}"],
      setupFiles: ["tests/setup.ts"],
    },
  };
});
