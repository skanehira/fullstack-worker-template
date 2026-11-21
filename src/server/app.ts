import { Hono } from "hono";
import { ulid } from "ulid";
import type { AuthBindings } from "./modules/auth/adapter/authMiddleware";
import { createAuthRoutes } from "./modules/auth/adapter/authRoutes";
import {
  createOtpStore,
  createPasswordResetStore,
  createSessionStore,
  createUserStore,
} from "./modules/auth/adapter/d1Stores";
import { createMailSender } from "./modules/auth/adapter/mailSender";
import type { Clock, MailSender } from "./modules/auth/domain/ports";
import type { Random } from "./modules/auth/domain/random";
import type { AuthDeps } from "./modules/auth/usecase/deps";
import { healthRoute } from "./modules/health/adapter/health";

export type Bindings = AuthBindings;

export type AppOverrides = { clock?: Clock; random?: Random; mail?: MailSender };

const systemRandom: Random = {
  bytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  uint32: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
};

type StringBinding =
  | "AUTH_JWT_SECRET"
  | "AUTH_PASSWORD_PEPPER"
  | "AUTH_OTP_SECRET"
  | "PUBLIC_BASE_URL"
  | "MAIL_FROM";

function required(env: Bindings, name: StringBinding): string {
  // secret を入れ忘れた環境では、型と違って値は "" ではなく undefined になる。
  const value: string | undefined = env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} が設定されていません (.dev.vars か wrangler secret put で設定する)`);
  }
  return value;
}

export function createApp(overrides: AppOverrides = {}) {
  const resolveAuthDeps = (env: Bindings): AuthDeps => ({
    users: createUserStore(env.DB),
    otp: createOtpStore(env.DB),
    sessions: createSessionStore(env.DB),
    passwordResets: createPasswordResetStore(env.DB),
    mail: overrides.mail ?? createMailSender(env.EMAIL, required(env, "MAIL_FROM")),
    clock: overrides.clock ?? Date.now,
    random: overrides.random ?? systemRandom,
    newId: ulid,
    secrets: {
      jwtSecret: required(env, "AUTH_JWT_SECRET"),
      passwordPepper: required(env, "AUTH_PASSWORD_PEPPER"),
      otpSecret: required(env, "AUTH_OTP_SECRET"),
    },
    publicBaseUrl: required(env, "PUBLIC_BASE_URL"),
  });

  return new Hono<{ Bindings: Bindings }>()
    .basePath("/api")
    .route("/", healthRoute)
    .route("/", createAuthRoutes(resolveAuthDeps));
}
