import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(__dirname, "migrations");
      const migrations = await readD1Migrations(migrationsPath);

      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            AUTH_JWT_SECRET: "test-jwt-secret",
            AUTH_PASSWORD_PEPPER: "test-password-pepper",
            AUTH_OTP_SECRET: "test-otp-secret",
            PUBLIC_BASE_URL: "https://example.com",
            MAIL_FROM: "noreply@example.com",
          },
        },
      };
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
  },
});
