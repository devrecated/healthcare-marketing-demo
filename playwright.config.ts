import { defineConfig, devices } from "@playwright/test"

const liveHost = process.env.LIVE_HOST_URL?.replace(/\/$/, "")
const liveScan = process.env.LIVE_SCAN_URL?.replace(/\/$/, "")
const useLive = Boolean(liveHost && liveScan)

const hostURL = liveHost || "http://127.0.0.1:3000"
const scanURL = liveScan || "http://127.0.0.1:5173"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "host-chromium",
      testMatch: /host-.*\.spec\.ts|brand-guard\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: hostURL,
      },
    },
    {
      name: "scan-mobile",
      testMatch: /scan-mfe\.spec\.ts|brand-guard\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        baseURL: scanURL,
      },
    },
  ],
  webServer: useLive
    ? undefined
    : [
        {
          command: "pnpm exec next dev --hostname 127.0.0.1 --port 3000",
          cwd: "demo",
          url: "http://127.0.0.1:3000/login",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
        {
          command: "pnpm exec vite --port 5173 --host 127.0.0.1",
          cwd: "scan-mfe",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      ],
})

export { hostURL, scanURL, useLive }
