import { describe, it, expect } from "vite-plus/test";
import { createTestApp, createUser } from "./helpers";

const UNAUTHORIZED = { error: { code: "UNAUTHORIZED", message: "認証が必要です" } };

describe("GET /api/me", () => {
  it.each([
    ["トークンが無い", undefined],
    ["JWT として壊れている", "garbage"],
  ])("%s と 401 を返す", async (_label, token) => {
    const t = createTestApp();

    const response = await t.request("GET", "/me", { token });

    expect([response.status, await response.json()]).toEqual([401, UNAUTHORIZED]);
  });

  it("セッションは発行から 12 時間で切れる", async () => {
    const t = createTestApp();
    const user = await createUser();
    const token = await t.loginFully(user.email);

    t.advance(12 * 60 * 60_000 - 1000);
    const before = await t.request("GET", "/me", { token });
    t.advance(1000);
    const after = await t.request("GET", "/me", { token });

    expect(before.status).toBe(200);
    expect([after.status, await after.json()]).toEqual([401, UNAUTHORIZED]);
  });
});

describe("POST /api/auth/logout", () => {
  it("ログアウトしたトークンは使えなくなり、別の端末のセッションは残る", async () => {
    const t = createTestApp();
    const user = await createUser();
    const first = await t.loginFully(user.email);
    t.advance(60_000);
    const second = await t.loginFully(user.email);

    const response = await t.request("POST", "/auth/logout", { token: first });
    const firstMe = await t.request("GET", "/me", { token: first });
    const secondMe = await t.request("GET", "/me", { token: second });

    expect(response.status).toBe(204);
    expect(firstMe.status).toBe(401);
    expect(secondMe.status).toBe(200);
  });

  it("トークンが無ければ 401 を返す", async () => {
    const t = createTestApp();

    const response = await t.request("POST", "/auth/logout");

    expect([response.status, await response.json()]).toEqual([401, UNAUTHORIZED]);
  });
});

describe("POST /api/auth/logout-all", () => {
  it("その利用者のすべてのセッションを使えなくする", async () => {
    const t = createTestApp();
    const user = await createUser();
    const first = await t.loginFully(user.email);
    t.advance(60_000);
    const second = await t.loginFully(user.email);

    const response = await t.request("POST", "/auth/logout-all", { token: first });
    const firstMe = await t.request("GET", "/me", { token: first });
    const secondMe = await t.request("GET", "/me", { token: second });

    expect(response.status).toBe(204);
    expect([firstMe.status, secondMe.status]).toEqual([401, 401]);
  });
});
