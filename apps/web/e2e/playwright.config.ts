import { defineConfig } from "@playwright/test";

const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "../test-results",
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // Headless Linux has no GPU; MapLibre still exercises its real WebGL renderer.
      args: ["--enable-unsafe-swiftshader"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 900 } } },
    {
      name: "phone",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "node e2e/static-server.mjs",
    cwd: new URL("..", import.meta.url).pathname,
    url: "http://127.0.0.1:4173/signin",
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
