import { defineConfig, devices } from "@playwright/test";

const frontendUrl = "http://127.0.0.1:5173";
const backendUrl = "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: frontendUrl,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
      cwd: "../backend",
      url: `${backendUrl}/`,
      name: "Backend",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ALLOWED_ORIGINS: frontendUrl,
        POKINEX_E2E: "1",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      cwd: ".",
      url: `${frontendUrl}/`,
      name: "Frontend",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: `${backendUrl}/api/auth`,
        VITE_WS_URL: "ws://127.0.0.1:8000/ws",
      },
    },
  ],
});
