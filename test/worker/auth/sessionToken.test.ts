import { describe, it, expect } from "vite-plus/test";
import {
  signSessionToken,
  verifySessionToken,
} from "../../../src/server/modules/auth/domain/sessionToken";

const SECRET = "test-jwt-secret";
const NOW = Date.parse("2026-01-01T00:00:00.000Z");
const subject = { userId: "01JUSER", sid: "01JSESSION", authGeneration: 3 };

describe("signSessionToken / verifySessionToken", () => {
  it("発行したトークンを検証すると利用者・セッション・世代・期限を返す", async () => {
    const token = await signSessionToken({ ...subject, secret: SECRET, nowMs: NOW });

    expect(await verifySessionToken(token, { secret: SECRET, nowMs: NOW })).toEqual({
      ...subject,
      expiresAt: "2026-01-01T12:00:00.000Z",
    });
  });

  it("12 時間ちょうどで期限切れになり null を返す", async () => {
    const token = await signSessionToken({ ...subject, secret: SECRET, nowMs: NOW });

    const justBefore = await verifySessionToken(token, {
      secret: SECRET,
      nowMs: NOW + 12 * 3600_000 - 1000,
    });
    const atExpiry = await verifySessionToken(token, {
      secret: SECRET,
      nowMs: NOW + 12 * 3600_000,
    });

    expect(justBefore?.userId).toBe("01JUSER");
    expect(atExpiry).toBeNull();
  });

  it("別のシークレットで署名されたトークンは null を返す", async () => {
    const token = await signSessionToken({ ...subject, secret: "other", nowMs: NOW });

    expect(await verifySessionToken(token, { secret: SECRET, nowMs: NOW })).toBeNull();
  });

  it("JWT として壊れた文字列は null を返す", async () => {
    expect(await verifySessionToken("not-a-jwt", { secret: SECRET, nowMs: NOW })).toBeNull();
  });
});
