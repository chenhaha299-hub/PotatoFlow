import { defineConfig, devices } from "@playwright/test";

const localNoProxy = "127.0.0.1,localhost";
process.env.NO_PROXY = process.env.NO_PROXY
  ? `${localNoProxy},${process.env.NO_PROXY}`
  : localNoProxy;
process.env.no_proxy = process.env.NO_PROXY;

const baseURL = process.env.POTATOFLOW_E2E_BASE_URL || "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL,
    channel: "msedge",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-edge",
      use: { ...devices["Desktop Edge"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-edge",
      use: {
        viewport: { width: 390, height: 844 },
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
});
