import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { ulid } from "ulid";
import { createApp } from "../../../src/server/app";
import { hashPassword } from "../../../src/server/modules/auth/domain/passwordHash";
import type { MailMessage } from "../../../src/server/modules/auth/domain/ports";

export const ORIGIN = "https://example.com";
export const START = Date.parse("2026-01-01T00:00:00.000Z");
export const PASSWORD = "correct horse battery";

let sequence = 0;

/** テストごとに重ならないメールアドレスで利用者を 1 人作る。 */
export async function createUser(password = PASSWORD): Promise<{ id: string; email: string }> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  sequence += 1;
  const id = ulid();
  const email = `user-${id.toLowerCase()}-${sequence}@example.com`;
  const passwordHash = await hashPassword(password, env.AUTH_PASSWORD_PEPPER, (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
  );
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(id, email, passwordHash, new Date(START).toISOString())
    .run();
  return { id, email };
}

type RequestOptions = { body?: unknown; token?: string; origin?: string | null };

/** 時計とメール送信を差し替えた app。時刻は `advance` で進める。 */
export function createTestApp() {
  let now = START;
  let mailAccepts = true;
  const mails: MailMessage[] = [];
  // コードが連番になるよう uint32 を固定し、再送の前後で同じコードが出ないようにする。
  let otpSeed = 100_000;
  const app = createApp({
    clock: () => now,
    random: {
      bytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      uint32: () => (otpSeed += 1),
    },
    mail: {
      send: async (message) => {
        if (!mailAccepts) return false;
        mails.push(message);
        return true;
      },
    },
  });

  async function request(method: string, path: string, options: RequestOptions = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    if (origin !== null) headers.Origin = origin;
    if (options.token !== undefined) headers.Authorization = `Bearer ${options.token}`;
    const ctx = createExecutionContext();
    const response = await app.request(
      `${ORIGIN}/api${path}`,
      {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
  }

  function lastMailTo(email: string): MailMessage {
    const mail = mails.findLast((message) => message.to === email);
    if (mail === undefined) throw new Error(`${email} 宛のメールがありません`);
    return mail;
  }

  function lastCodeFor(email: string): string {
    const code = /\b(\d{6})\b/.exec(lastMailTo(email).text)?.[1];
    if (code === undefined) throw new Error("メール本文にコードがありません");
    return code;
  }

  async function startLogin(email: string, password = PASSWORD): Promise<string> {
    const response = await request("POST", "/auth/login", { body: { email, password } });
    if (response.status !== 202) throw new Error(`login が ${response.status} を返しました`);
    const body = await response.json<{ challengeToken: string }>();
    return body.challengeToken;
  }

  /** パスワードとメールコードを通してセッショントークンを得る。 */
  async function loginFully(email: string, password = PASSWORD): Promise<string> {
    const challengeToken = await startLogin(email, password);
    const response = await request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: lastCodeFor(email) },
    });
    if (response.status !== 200) throw new Error(`verify が ${response.status} を返しました`);
    return (await response.json<{ token: string }>()).token;
  }

  return {
    request,
    mails,
    lastMailTo,
    lastCodeFor,
    startLogin,
    loginFully,
    advance: (ms: number) => {
      now += ms;
    },
    setMailAccepts: (accepts: boolean) => {
      mailAccepts = accepts;
    },
    iso: (offsetMs = 0) => new Date(now + offsetMs).toISOString(),
  };
}
