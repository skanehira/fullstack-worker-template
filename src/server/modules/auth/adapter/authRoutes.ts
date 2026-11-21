import { Hono } from "hono";
import { z } from "zod";
import { login } from "../usecase/login";
import { cancelOtp, resendOtp, verifyOtp } from "../usecase/otp";
import { completePasswordReset, requestPasswordReset } from "../usecase/passwordReset";
import { logout, logoutAll } from "../usecase/session";
import {
  createAuthMiddleware,
  type AuthBindings,
  type AuthVariables,
  type ResolveAuthDeps,
} from "./authMiddleware";
import { errorResponse } from "./errors";

const loginBody = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(1024),
});
const challengeBody = z.object({ challengeToken: z.string() });
const verifyBody = z.object({ challengeToken: z.string(), code: z.string() });
const resetRequestBody = z.object({ email: z.string().min(1).max(254) });
const resetCompleteBody = z.object({ token: z.string(), password: z.string() });

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
  const json: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * `/auth/*` の API。セッションは Bearer で送るので Cookie による CSRF は起きないが、ログインと
 * パスワード再設定はトークンを持たずに呼べるため、別サイトからの送信を Origin の完全一致で拒否する。
 * Referer や SameSite だけには頼らない。
 */
export function createAuthRoutes(resolveDeps: ResolveAuthDeps) {
  const requireUser = createAuthMiddleware(resolveDeps);
  const routes = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();

  routes.use("/auth/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.req.method !== "GET" && c.req.header("Origin") !== new URL(c.req.url).origin) {
      return errorResponse(c, { code: "FORBIDDEN" }, resolveDeps(c.env).clock());
    }
    await next();
  });

  routes.post("/auth/login", async (c) => {
    const deps = resolveDeps(c.env);
    const body = await parseBody(c.req.raw, loginBody);
    if (body === null) return errorResponse(c, { code: "VALIDATION_FAILED" }, deps.clock());
    const result = await login(deps, body);
    if (!result.ok) return errorResponse(c, result, deps.clock());
    const { ok: _ok, ...challenge } = result;
    return c.json({ status: "otp_required", ...challenge }, 202);
  });

  routes.post("/auth/otp/verify", async (c) => {
    const deps = resolveDeps(c.env);
    const body = await parseBody(c.req.raw, verifyBody);
    if (body === null) return errorResponse(c, { code: "VALIDATION_FAILED" }, deps.clock());
    const result = await verifyOtp(deps, body);
    if (!result.ok) return errorResponse(c, result, deps.clock());
    return c.json({ token: result.token }, 200);
  });

  routes.post("/auth/otp/resend", async (c) => {
    const deps = resolveDeps(c.env);
    const body = await parseBody(c.req.raw, challengeBody);
    if (body === null) return errorResponse(c, { code: "VALIDATION_FAILED" }, deps.clock());
    const result = await resendOtp(deps, body);
    if (!result.ok) return errorResponse(c, result, deps.clock());
    const { ok: _ok, ...times } = result;
    return c.json(times, 200);
  });

  routes.delete("/auth/otp/challenge", async (c) => {
    const body = await parseBody(c.req.raw, challengeBody);
    if (body !== null) await cancelOtp(resolveDeps(c.env), body);
    return c.body(null, 204);
  });

  routes.post("/auth/logout", requireUser, async (c) => {
    await logout(resolveDeps(c.env), c.var.user);
    return c.body(null, 204);
  });

  routes.post("/auth/logout-all", requireUser, async (c) => {
    await logoutAll(resolveDeps(c.env), c.var.user);
    return c.body(null, 204);
  });

  // 登録の有無で応答時間が変わらないよう、照合と送信は応答の後に回す。
  routes.post("/auth/password-reset/request", async (c) => {
    const deps = resolveDeps(c.env);
    const body = await parseBody(c.req.raw, resetRequestBody);
    if (body === null) return errorResponse(c, { code: "VALIDATION_FAILED" }, deps.clock());
    c.executionCtx.waitUntil(
      requestPasswordReset(deps, body).catch((error: unknown) => {
        console.error(
          "password reset request failed",
          error instanceof Error ? error.name : "unknown",
        );
      }),
    );
    return c.body(null, 202);
  });

  routes.post("/auth/password-reset/complete", async (c) => {
    const deps = resolveDeps(c.env);
    const body = await parseBody(c.req.raw, resetCompleteBody);
    if (body === null) return errorResponse(c, { code: "VALIDATION_FAILED" }, deps.clock());
    const result = await completePasswordReset(deps, body);
    if (!result.ok) return errorResponse(c, result, deps.clock());
    return c.body(null, 204);
  });

  routes.get("/me", requireUser, (c) => c.json({ id: c.var.user.id, email: c.var.user.email }));

  return routes;
}
