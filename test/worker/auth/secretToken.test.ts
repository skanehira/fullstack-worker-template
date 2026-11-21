import { describe, it, expect } from "vite-plus/test";
import {
  createOpaqueToken,
  matchesOpaqueToken,
  parseOpaqueToken,
} from "../../../src/server/modules/auth/domain/secretToken";

const SECRET = "test-otp-secret";
const ID = "01JAAAAAAAAAAAAAAAAAAAAAAA";
const bytes = (length: number) => new Uint8Array(length).fill(1);

describe("createOpaqueToken / parseOpaqueToken / matchesOpaqueToken", () => {
  it("発行したトークンは同じ用途で照合すると一致する", async () => {
    const { token, tokenHash } = await createOpaqueToken(ID, "challenge", SECRET, bytes);
    const parsed = parseOpaqueToken(token);

    expect(parsed?.id).toBe(ID);
    expect(await matchesOpaqueToken(parsed!, "challenge", tokenHash, SECRET)).toBe(true);
  });

  it("用途が違うと一致しない (再設定リンクを challenge として使えない)", async () => {
    const { token, tokenHash } = await createOpaqueToken(ID, "password_reset", SECRET, bytes);

    expect(await matchesOpaqueToken(parseOpaqueToken(token)!, "challenge", tokenHash, SECRET)).toBe(
      false,
    );
  });

  it("保存値はトークンそのものを含まない", async () => {
    const { token, tokenHash } = await createOpaqueToken(ID, "challenge", SECRET, bytes);

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash.includes(token.split(".")[1] ?? "")).toBe(false);
  });

  it.each([
    ["区切りが無い", "abc"],
    ["ID が ULID でない", "not-ulid.AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"],
    ["秘密部分の長さが違う", `${ID}.AQEB`],
    ["区切りが多い", `${ID}.a.b`],
  ])("形式が壊れたトークン (%s) は null を返す", (_label, token) => {
    expect(parseOpaqueToken(token)).toBeNull();
  });
});
