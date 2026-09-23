import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", fullyParallel: false, workers: 1,
  use: { baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000", trace: "retain-on-failure",
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {} },
  projects: [ { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } } ],
});
