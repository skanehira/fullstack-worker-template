import { describe, it, expect } from "vite-plus/test";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "../../../src/server/modules/auth/domain/passwordHash";

const PEPPER = "test-pepper";
const fixedSalt = (length: number) => new Uint8Array(length).fill(7);

describe("hashPassword / verifyPassword", () => {
  it("同じパスワードと pepper で照合すると true を返す", async () => {
    const stored = await hashPassword("correct horse battery", PEPPER, fixedSalt);

    expect(await verifyPassword("correct horse battery", stored, PEPPER)).toBe(true);
  });

  it("保存値はアルゴリズム・反復回数・salt・hash を $ で区切った形式になる", async () => {
    const stored = await hashPassword("correct horse battery", PEPPER, fixedSalt);

    const [algorithm, iterations, salt, hash] = stored.split("$");
    expect([algorithm, iterations, salt]).toEqual([
      "pbkdf2-sha256",
      "100000",
      btoa(String.fromCharCode(...fixedSalt(16))),
    ]);
    expect(atob(hash ?? "").length).toBe(32);
  });

  it("異なるパスワードでは false を返す", async () => {
    const stored = await hashPassword("correct horse battery", PEPPER, fixedSalt);

    expect(await verifyPassword("wrong horse battery", stored, PEPPER)).toBe(false);
  });

  it("pepper が異なると同じパスワードでも false を返す", async () => {
    const stored = await hashPassword("correct horse battery", PEPPER, fixedSalt);

    expect(await verifyPassword("correct horse battery", stored, "other-pepper")).toBe(false);
  });

  it.each([
    ["区切りが足りない", "pbkdf2-sha256$100000$AAAA"],
    ["アルゴリズムが違う", "bcrypt$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"],
    ["反復回数が数字でない", "pbkdf2-sha256$abc$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"],
    ["反復回数が workerd の上限を超える", "pbkdf2-sha256$100001$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"],
    ["base64 でない", "pbkdf2-sha256$100000$!!!$AAAA"],
  ])("保存値の形式が壊れている (%s) と false を返す", async (_label, stored) => {
    expect(await verifyPassword("anything", stored, PEPPER)).toBe(false);
  });

  it("DUMMY_PASSWORD_HASH はどのパスワードとも一致しない", async () => {
    expect(await verifyPassword("", DUMMY_PASSWORD_HASH, PEPPER)).toBe(false);
    expect(DUMMY_PASSWORD_HASH.startsWith("pbkdf2-sha256$100000$")).toBe(true);
  });
});
