import { describe, it, expect } from "vite-plus/test";
import { PASSWORD, createTestApp, createUser } from "./helpers";

const AUTH_FAILED = {
  error: { code: "AUTH_FAILED", message: "メールアドレスまたはパスワードが正しくありません" },
};

describe("POST /api/auth/login", () => {
  it("正しいメールアドレスとパスワードで 202 を返し、確認コードをメールで送る", async () => {
    const t = createTestApp();
    const user = await createUser();

    const response = await t.request("POST", "/auth/login", {
      body: { email: user.email.toUpperCase(), password: PASSWORD },
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json<Record<string, unknown>>();
    expect(body).toEqual({
      status: "otp_required",
      challengeToken: expect.stringMatching(/^[0-9A-Z]{26}\.[A-Za-z0-9_-]{43}$/),
      challengeExpiresAt: t.iso(30 * 60_000),
      codeExpiresAt: t.iso(5 * 60_000),
      resendAvailableAt: t.iso(60_000),
      emailHint: `u***@example.com`,
    });
    const code = t.lastCodeFor(user.email);
    expect(t.lastMailTo(user.email)).toEqual({
      to: user.email,
      subject: "ログイン確認コード",
      text:
        `ログイン確認コード: ${code}\n\n` +
        "このコードの有効期限は 5 分です。\n" +
        "心当たりが無い場合は、このメールを破棄してください。" +
        "パスワードが第三者に知られている可能性があるため、パスワードの再設定をおすすめします。\n",
    });
  });

  it("パスワードの誤りと未登録のメールアドレスは同じ 401 を返し、メールを送らない", async () => {
    const t = createTestApp();
    const user = await createUser();

    const wrong = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: "wrong password!!" },
    });
    const unknown = await t.request("POST", "/auth/login", {
      body: { email: "nobody@example.com", password: PASSWORD },
    });

    expect([wrong.status, await wrong.json()]).toEqual([401, AUTH_FAILED]);
    expect([unknown.status, await unknown.json()]).toEqual([401, AUTH_FAILED]);
    expect(t.mails).toEqual([]);
  });

  it("10 回続けて失敗するとロックし、正しいパスワードでも 15 分間は 401 を返す", async () => {
    const t = createTestApp();
    const user = await createUser();
    for (let i = 0; i < 10; i += 1) {
      await t.request("POST", "/auth/login", { body: { email: user.email, password: "wrong" } });
    }

    const locked = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });
    t.advance(15 * 60_000);
    const unlocked = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });

    expect([locked.status, await locked.json()]).toEqual([401, AUTH_FAILED]);
    expect(unlocked.status).toBe(202);
  });

  it("9 回失敗した後に成功すると失敗回数が消え、再び 10 回まで試せる", async () => {
    const t = createTestApp();
    const user = await createUser();
    for (let i = 0; i < 9; i += 1) {
      await t.request("POST", "/auth/login", { body: { email: user.email, password: "wrong" } });
    }
    await t.loginFully(user.email);
    for (let i = 0; i < 9; i += 1) {
      await t.request("POST", "/auth/login", { body: { email: user.email, password: "wrong" } });
    }
    t.advance(60_000);

    const response = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });

    expect(response.status).toBe(202);
  });

  it("前回のコード送信から 60 秒以内のログインは 429 を返し、60 秒後は受け付ける", async () => {
    const t = createTestApp();
    const user = await createUser();
    await t.startLogin(user.email);

    t.advance(59_999);
    const early = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });
    t.advance(1);
    const later = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });

    expect(early.status).toBe(429);
    expect(early.headers.get("Retry-After")).toBe("1");
    expect(await early.json()).toEqual({
      error: {
        code: "OTP_SEND_RATE_LIMITED",
        message: "確認コードの送信は 60 秒に 1 回までです",
        retryAt: t.iso(),
      },
    });
    expect(later.status).toBe(202);
  });

  it("メールを送れなければ 503 を返し、送信の間隔を待たずにやり直せる", async () => {
    const t = createTestApp();
    const user = await createUser();
    t.setMailAccepts(false);

    const failed = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });
    t.setMailAccepts(true);
    const retried = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
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
    expect(retried.status).toBe(202);
  });

  it("本文の形が違えば 422 を返す", async () => {
    const t = createTestApp();

    const response = await t.request("POST", "/auth/login", { body: { email: "a@example.com" } });

    expect([response.status, await response.json()]).toEqual([
      422,
      { error: { code: "VALIDATION_FAILED", message: "入力内容が正しくありません" } },
    ]);
  });

  it.each([
    ["別の origin", "https://evil.example"],
    ["Origin ヘッダが無い", null],
  ])("%s からの送信は 403 を返す", async (_label, origin) => {
    const t = createTestApp();
    const user = await createUser();

    const response = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
      origin,
    });

    expect([response.status, await response.json()]).toEqual([
      403,
      { error: { code: "FORBIDDEN", message: "許可されていない送信元です" } },
    ]);
    expect(t.mails).toEqual([]);
  });
});
