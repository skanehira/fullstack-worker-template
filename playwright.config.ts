import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const PORT = resolvePort();

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

/** E2E_PORT があればそれを使い、無ければ空きポートを選ぶ。worktree ごとに同時に流しても衝突しない。 */
function resolvePort(): number {
  if (process.env.E2E_PORT === undefined) {
    // config は同期的に評価されるため、net の非同期 API を子プロセスで同期的に待つ。
    // host を省いて listen し、vite の localhost が ::1 と 127.0.0.1 のどちらに解決されても空いているポートを取る。
    const script =
      "const s=require('node:net').createServer();s.listen(0,()=>{process.stdout.write(String(s.address().port));s.close()})";
    // worker プロセスも config を読み直すので、書き戻して全プロセスで同じポートを使う。
    process.env.E2E_PORT = execFileSync(process.execPath, ["-e", script], { encoding: "utf8" });
  }
  const port = Number(process.env.E2E_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`E2E_PORT にはポート番号を指定してください: ${process.env.E2E_PORT}`);
  }
  return port;
}
