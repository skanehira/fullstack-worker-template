import { defineConfig, devices } from "@playwright/test";

const PORT = 5273;

export default defineConfig({
  testDir: "./e2e",
  // メールはファイルに宛先を書かないため、送信前後の差分で自分宛を見分ける。並列にすると混ざる。
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bash e2e/start-server.sh ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
