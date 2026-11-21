import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      AUTH_JWT_SECRET: string;
      AUTH_PASSWORD_PEPPER: string;
      AUTH_OTP_SECRET: string;
    }
  }
}
