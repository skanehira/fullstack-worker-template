import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { AuthApiError, createAuthClient } from "./authClient";

const PENDING = {
  challengeToken: "01JCHALLENGE.secret",
  challengeExpiresAt: "2026-01-01T00:30:00.000Z",
  codeExpiresAt: "2026-01-01T00:05:00.000Z",
  resendAvailableAt: "2026-01-01T00:01:00.000Z",
  emailHint: "a***@example.com",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const response = responses.shift();
    if (response === undefined) throw new Error("想定外の fetch");
    return response;
  });
  const client = createAuthClient({ fetch, local: localStorage, session: sessionStorage });
  return { client, fetch };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("login / verifyOtp", () => {
  it("login は入力待ちの challenge を保存し、verifyOtp はそれを使って token を保存する", async () => {
    const { client, fetch } = setup([
      json(202, { status: "otp_required", ...PENDING }),
      json(200, { token: "session-token" }),
    ]);

    await client.login("a@example.com", "password");
    const pendingAfterLogin = client.getPendingChallenge();
    await client.verifyOtp("123456");

    expect(pendingAfterLogin).toEqual(PENDING);
    expect(fetch.mock.calls[1]).toEqual([
      "/api/auth/otp/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: PENDING.challengeToken, code: "123456" }),
      },
    ]);
    expect([client.getToken(), client.getPendingChallenge()]).toEqual(["session-token", null]);
  });

  it("失敗の応答は code・message・retryAt を持つ AuthApiError になる", async () => {
    const { client } = setup([
      json(429, {
        error: { code: "OTP_SEND_RATE_LIMITED", message: "送信は 60 秒に 1 回まで", retryAt: "t" },
      }),
    ]);

    const error = await client.login("a@example.com", "password").catch((e: unknown) => e);

    expect(error).toEqual(
      new AuthApiError(429, "OTP_SEND_RATE_LIMITED", "送信は 60 秒に 1 回まで", "t"),
    );
    expect(client.getPendingChallenge()).toBeNull();
  });

  it("challenge が無効になったら入力待ちの challenge を捨てる", async () => {
    const { client } = setup([
      json(202, { status: "otp_required", ...PENDING }),
      json(401, { error: { code: "OTP_CHALLENGE_INVALID", message: "やり直し" } }),
    ]);
    await client.login("a@example.com", "password");

    await client.verifyOtp("123456").catch(() => undefined);

    expect(client.getPendingChallenge()).toBeNull();
  });
});

describe("getMe", () => {
  it("token を Bearer で送り、利用者を返す", async () => {
    localStorage.setItem("auth.token", "session-token");
    const { client, fetch } = setup([json(200, { id: "u1", email: "a@example.com" })]);

    const me = await client.getMe();

    expect(me).toEqual({ id: "u1", email: "a@example.com" });
    expect(fetch.mock.calls[0]).toEqual([
      "/api/me",
      { method: "GET", headers: { Authorization: "Bearer session-token" } },
    ]);
  });

  it("401 なら保存した token を捨てる", async () => {
    localStorage.setItem("auth.token", "expired-token");
    const { client } = setup([json(401, { error: { code: "UNAUTHORIZED", message: "要認証" } })]);

    const error = await client.getMe().catch((e: unknown) => e);

    expect(error).toEqual(new AuthApiError(401, "UNAUTHORIZED", "要認証"));
    expect(client.getToken()).toBeNull();
  });
});

describe("logout", () => {
  it("サーバの応答に依らず token を捨てる", async () => {
    localStorage.setItem("auth.token", "session-token");
    const { client } = setup([new Response(null, { status: 500 })]);

    await client.logout().catch(() => undefined);

    expect(client.getToken()).toBeNull();
  });
});

describe("通信の失敗", () => {
  it("fetch が投げたら NETWORK_ERROR の AuthApiError にする", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("offline"));
    const client = createAuthClient({ fetch, local: localStorage, session: sessionStorage });

    const error = await client.requestPasswordReset("a@example.com").catch((e: unknown) => e);

    expect(error).toEqual(
      new AuthApiError(0, "NETWORK_ERROR", "通信に失敗しました。時間をおいてやり直してください"),
    );
  });
});
