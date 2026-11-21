import { describe, it, expect } from "vite-plus/test";
import { PASSWORD, createTestApp, createUser } from "./helpers";

const CHALLENGE_INVALID = {
  error: { code: "OTP_CHALLENGE_INVALID", message: "ログインをやり直してください" },
};
const OTP_INVALID = { error: { code: "OTP_INVALID", message: "確認コードが正しくありません" } };

/** 送られたコードと 1 桁だけ違うコード。 */
const wrongCode = (code: string) => `${code.slice(0, 5)}${(Number(code[5]) + 1) % 10}`;

describe("POST /api/auth/otp/verify", () => {
  it("正しいコードで 200 とセッショントークンを返し、そのトークンで /api/me を読める", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);

    const response = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: t.lastCodeFor(user.email) },
    });
    const { token } = await response.json<{ token: string }>();
    const me = await t.request("GET", "/me", { token });

    expect(response.status).toBe(200);
    expect([me.status, await me.json()]).toEqual([200, { id: user.id, email: user.email }]);
  });

  it("誤ったコードは 422 を返し、5 回目でロックして 429 を返す", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    const code = t.lastCodeFor(user.email);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await t.request("POST", "/auth/otp/verify", {
        body: { challengeToken, code: wrongCode(code) },
      });
      statuses.push(r.status);
    }
    const fifth = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: wrongCode(code) },
    });
    const afterLock = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code },
    });
    t.advance(60_000);
    const loginWhileLocked = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });

    expect(statuses).toEqual([422, 422, 422, 422]);
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get("Retry-After")).toBe(String(15 * 60));
    expect(await fifth.json()).toEqual({
      error: {
        code: "OTP_LOCKED",
        message: "確認コードの入力を続けて間違えたため、しばらく入力できません",
        retryAt: t.iso(15 * 60_000 - 60_000),
      },
    });
    expect([afterLock.status, await afterLock.json()]).toEqual([401, CHALLENGE_INVALID]);
    expect(loginWhileLocked.status).toBe(429);
  });

  it("1 回だけ誤ったときの応答は OTP_INVALID", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);

    const response = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: wrongCode(t.lastCodeFor(user.email)) },
    });

    expect([response.status, await response.json()]).toEqual([422, OTP_INVALID]);
  });

  it("コードは送信から 5 分で期限が切れ、422 OTP_EXPIRED を返す", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    const code = t.lastCodeFor(user.email);

    t.advance(5 * 60_000);
    const response = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code },
    });

    expect([response.status, await response.json()]).toEqual([
      422,
      {
        error: {
          code: "OTP_EXPIRED",
          message: "確認コードの有効期限が切れています。コードを再送してください",
        },
      },
    ]);
  });

  it("一度使った challenge は再び使えず 401 を返す", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    const code = t.lastCodeFor(user.email);
    await t.request("POST", "/auth/otp/verify", { body: { challengeToken, code } });

    const replay = await t.request("POST", "/auth/otp/verify", { body: { challengeToken, code } });

    expect([replay.status, await replay.json()]).toEqual([401, CHALLENGE_INVALID]);
  });

  it("challenge は作成から 30 分で使えなくなる", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    t.advance(29 * 60_000);
    await t.request("POST", "/auth/otp/resend", { body: { challengeToken } });

    t.advance(60_000);
    const response = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: t.lastCodeFor(user.email) },
    });

    expect([response.status, await response.json()]).toEqual([401, CHALLENGE_INVALID]);
  });

  it("秘密部分を書き換えた challenge トークンは 401 を返し、失敗回数に数えない", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    const [id] = challengeToken.split(".");
    const forged = `${id}.${"A".repeat(43)}`;

    const forgedResponses = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await t.request("POST", "/auth/otp/verify", {
        body: { challengeToken: forged, code: "000000" },
      });
      forgedResponses.push([r.status, await r.json()]);
    }
    const genuine = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: t.lastCodeFor(user.email) },
    });

    expect(forgedResponses).toEqual(Array(5).fill([401, CHALLENGE_INVALID]));
    expect(genuine.status).toBe(200);
  });

  it("ログインに成功すると確認コードの失敗回数が消え、次のログインでも 5 回まで試せる", async () => {
    const t = createTestApp();
    const user = await createUser();
    const first = await t.startLogin(user.email);
    const firstCode = t.lastCodeFor(user.email);
    for (let i = 0; i < 4; i += 1) {
      await t.request("POST", "/auth/otp/verify", {
        body: { challengeToken: first, code: wrongCode(firstCode) },
      });
    }
    await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken: first, code: firstCode },
    });
    t.advance(60_000);
    const second = await t.startLogin(user.email);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await t.request("POST", "/auth/otp/verify", {
        body: { challengeToken: second, code: wrongCode(t.lastCodeFor(user.email)) },
      });
      statuses.push(r.status);
    }

    expect(statuses).toEqual([422, 422, 422, 422]);
  });
});

describe("POST /api/auth/otp/resend", () => {
  it("60 秒経つと新しいコードを送り、古いコードは使えなくなる", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    const oldCode = t.lastCodeFor(user.email);

    t.advance(60_000);
    const resent = await t.request("POST", "/auth/otp/resend", { body: { challengeToken } });
    const newCode = t.lastCodeFor(user.email);
    const withOld = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: oldCode },
    });
    const withNew = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: newCode },
    });

    expect([resent.status, await resent.json()]).toEqual([
      200,
      {
        challengeExpiresAt: t.iso(29 * 60_000),
        codeExpiresAt: t.iso(5 * 60_000),
        resendAvailableAt: t.iso(60_000),
      },
    ]);
    expect(t.mails.length).toBe(2);
    expect([withOld.status, await withOld.json()]).toEqual([422, OTP_INVALID]);
    expect(withNew.status).toBe(200);
  });

  it("前回の送信から 60 秒以内は 429 を返し、メールを送らない", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);

    t.advance(30_000);
    const response = await t.request("POST", "/auth/otp/resend", { body: { challengeToken } });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(t.mails.length).toBe(1);
  });

  it("メールを送れなければ 503 を返し、送信の間隔を待たずに再送できる", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    t.advance(60_000);
    t.setMailAccepts(false);

    const failed = await t.request("POST", "/auth/otp/resend", { body: { challengeToken } });
    t.setMailAccepts(true);
    const retried = await t.request("POST", "/auth/otp/resend", { body: { challengeToken } });
    const verified = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: t.lastCodeFor(user.email) },
    });

    expect([failed.status, await failed.json()]).toEqual([
      503,
      {
        error: {
          code: "OTP_SEND_FAILED",
          message: "確認コードを送信できませんでした。しばらくしてからやり直してください",
        },
      },
    ]);
    expect(retried.status).toBe(200);
    expect(verified.status).toBe(200);
  });
});

describe("DELETE /api/auth/otp/challenge", () => {
  it("取り消した challenge ではコードを入力できない", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);

    const cancelled = await t.request("DELETE", "/auth/otp/challenge", {
      body: { challengeToken },
    });
    const response = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: t.lastCodeFor(user.email) },
    });

    expect(cancelled.status).toBe(204);
    expect([response.status, await response.json()]).toEqual([401, CHALLENGE_INVALID]);
  });

  it("秘密部分が合わないトークンでは 204 を返すが、challenge は取り消さない", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    const [id] = challengeToken.split(".");

    const cancelled = await t.request("DELETE", "/auth/otp/challenge", {
      body: { challengeToken: `${id}.${"A".repeat(43)}` },
    });
    const response = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code: t.lastCodeFor(user.email) },
    });

    expect(cancelled.status).toBe(204);
    expect(response.status).toBe(200);
  });
});
