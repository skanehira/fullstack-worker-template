import { createMiddleware } from "hono/factory";
import type { AuthDeps } from "../usecase/deps";
import { authenticateSession, type AuthenticatedUser } from "../usecase/session";
import { errorResponse } from "./errors";

export type AuthVariables = { user: AuthenticatedUser };

const BEARER = /^Bearer +(\S+)$/i;

export type AuthBindings = {
  DB: D1Database;
  EMAIL: SendEmail;
  AUTH_JWT_SECRET: string;
  AUTH_PASSWORD_PEPPER: string;
  AUTH_OTP_SECRET: string;
  PUBLIC_BASE_URL: string;
  MAIL_FROM: string;
};

export type ResolveAuthDeps = (env: AuthBindings) => AuthDeps;

export function createAuthMiddleware(resolveDeps: ResolveAuthDeps) {
  return createMiddleware<{ Bindings: AuthBindings; Variables: AuthVariables }>(async (c, next) => {
    const deps = resolveDeps(c.env);
    const token = BEARER.exec(c.req.header("Authorization") ?? "")?.[1];
    const user = token === undefined ? null : await authenticateSession(deps, token);
    if (user === null) return errorResponse(c, { code: "UNAUTHORIZED" }, deps.clock());
    c.set("user", user);
    await next();
  });
}
