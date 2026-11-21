import { describe, it, expect } from "vite-plus/test";
import { PASSWORD, createTestApp, createUser } from "./helpers";

const NEW_PASSWORD = "brand new passphrase";
const LINK_INVALID = {
  error: {
    code: "PASSWORD_RESET_LINK_INVALID",
    message: "再設定のリンクが無効です。もう一度再設定を申し込んでください",
  },
};

type TestApp = ReturnType<typeof createTestApp>;

function resetTokenFrom(t: TestApp, email: string): string {
  const token = /#token=([^\s]+)/.exec(t.lastMailTo(email).text)?.[1];
  if (token === undefined) throw new Error("メール本文に再設定リンクがありません");
  return token;
}

async function requestReset(t: TestApp, email: string) {
  return await t.request("POST", "/auth/password-reset/request", { body: { email } });
}

describe("POST /api/auth/password-reset/request", () => {
  it("登録済みのメールアドレスには 202 を返し、再設定リンクを送る", async () => {
    const t = createTestApp();
    const user = await createUser();

    const response = await requestReset(t, user.email);

    expect(response.status).toBe(202);
    const token = resetTokenFrom(t, user.email);
    expect(t.lastMailTo(user.email)).toEqual({
      to: user.email,
      subject: "パスワード再設定のご案内",
      text:
        "次のリンクからパスワードを再設定してください。\n" +
        `https://example.com/password-reset/confirm#token=${token}\n\n` +
        "リンクの有効期限は 30 分です。\n" +
        "心当たりが無い場合は、このメールを破棄してください。\n",
    });
  });

  it("未登録のメールアドレスにも 202 を返し、メールは送らない", async () => {
    const t = createTestApp();

    const response = await requestReset(t, "nobody@example.com");

    expect(response.status).toBe(202);
    expect(t.mails).toEqual([]);
  });

  it("60 秒以内の 2 回目の申し込みではメールを送らない", async () => {
    const t = createTestApp();
    const user = await createUser();
    await requestReset(t, user.email);

    t.advance(59_999);
    await requestReset(t, user.email);
    t.advance(1);
    await requestReset(t, user.email);

    expect(t.mails.length).toBe(2);
  });
});

describe("POST /api/auth/password-reset/complete", () => {
  it("新しいパスワードを保存し、古いパスワードと既存のセッションを使えなくする", async () => {
    const t = createTestApp();
    const user = await createUser();
    const session = await t.loginFully(user.email);
    await requestReset(t, user.email);

    const response = await t.request("POST", "/auth/password-reset/complete", {
      body: { token: resetTokenFrom(t, user.email), password: NEW_PASSWORD },
    });
    t.advance(60_000);
    const oldLogin = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });
    const newLogin = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: NEW_PASSWORD },
    });
    const me = await t.request("GET", "/me", { token: session });

    expect(response.status).toBe(204);
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(202);
    expect(me.status).toBe(401);
  });

  it("再設定の前に始めたログインはコードを入力しても完了しない", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    const code = t.lastCodeFor(user.email);
    await requestReset(t, user.email);
    await t.request("POST", "/auth/password-reset/complete", {
      body: { token: resetTokenFrom(t, user.email), password: NEW_PASSWORD },
    });

    const response = await t.request("POST", "/auth/otp/verify", {
      body: { challengeToken, code },
    });

    expect(response.status).toBe(401);
  });

  it("ロック中の利用者も再設定するとすぐにログインできる", async () => {
    const t = createTestApp();
    const user = await createUser();
    for (let i = 0; i < 10; i += 1) {
      await t.request("POST", "/auth/login", { body: { email: user.email, password: "wrong" } });
    }
    await requestReset(t, user.email);

    await t.request("POST", "/auth/password-reset/complete", {
      body: { token: resetTokenFrom(t, user.email), password: NEW_PASSWORD },
    });
    const login = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: NEW_PASSWORD },
    });

    expect(login.status).toBe(202);
  });

  it("確認コードの入力がロック中でも、再設定するとすぐにログインできる", async () => {
    const t = createTestApp();
    const user = await createUser();
    const challengeToken = await t.startLogin(user.email);
    for (let i = 0; i < 5; i += 1) {
      await t.request("POST", "/auth/otp/verify", { body: { challengeToken, code: "000000" } });
    }
    await requestReset(t, user.email);

    await t.request("POST", "/auth/password-reset/complete", {
      body: { token: resetTokenFrom(t, user.email), password: NEW_PASSWORD },
    });
    t.advance(60_000);
    const login = await t.request("POST", "/auth/login", {
      body: { email: user.email, password: NEW_PASSWORD },
    });

    expect(login.status).toBe(202);
  });

  it("一度使ったリンクは 422 を返す", async () => {
    const t = createTestApp();
    const user = await createUser();
    await requestReset(t, user.email);
    const token = resetTokenFrom(t, user.email);
    await t.request("POST", "/auth/password-reset/complete", {
      body: { token, password: NEW_PASSWORD },
    });

    const reused = await t.request("POST", "/auth/password-reset/complete", {
      body: { token, password: "another passphrase" },
    });

    expect([reused.status, await reused.json()]).toEqual([422, LINK_INVALID]);
  });

  it("リンクは作成から 30 分で使えなくなる", async () => {
    const t = createTestApp();
    const user = await createUser();
    await requestReset(t, user.email);

    t.advance(30 * 60_000);
    const response = await t.request("POST", "/auth/password-reset/complete", {
      body: { token: resetTokenFrom(t, user.email), password: NEW_PASSWORD },
    });

    expect([response.status, await response.json()]).toEqual([422, LINK_INVALID]);
  });

  it("新しいリンクを申し込むと古いリンクは使えなくなる", async () => {
    const t = createTestApp();
    const user = await createUser();
    await requestReset(t, user.email);
    const oldToken = resetTokenFrom(t, user.email);
    t.advance(60_000);
    await requestReset(t, user.email);

    const response = await t.request("POST", "/auth/password-reset/complete", {
      body: { token: oldToken, password: NEW_PASSWORD },
    });

    expect([response.status, await response.json()]).toEqual([422, LINK_INVALID]);
  });

  it("12 文字未満のパスワードは 422 VALIDATION_FAILED を返し、リンクは使えるまま残る", async () => {
    const t = createTestApp();
    const user = await createUser();
    await requestReset(t, user.email);
    const token = resetTokenFrom(t, user.email);

    const short = await t.request("POST", "/auth/password-reset/complete", {
      body: { token, password: "short" },
    });
    const valid = await t.request("POST", "/auth/password-reset/complete", {
      body: { token, password: NEW_PASSWORD },
    });

    expect([short.status, await short.json()]).toEqual([
      422,
      { error: { code: "VALIDATION_FAILED", message: "入力内容が正しくありません" } },
    ]);
    expect(valid.status).toBe(204);
  });
});
