import { describe, it, expect } from "vite-plus/test";
import { isAcceptablePassword } from "../../../src/server/modules/auth/domain/passwordPolicy";

describe("isAcceptablePassword", () => {
  it.each([
    ["11 文字", "a".repeat(11), false],
    ["12 文字", "a".repeat(12), true],
    ["128 文字", "a".repeat(128), true],
    ["129 文字", "a".repeat(129), false],
    ["絵文字 12 個 (UTF-16 では 24 単位)", "🔑".repeat(12), true],
    ["絵文字 65 個 (UTF-16 では 130 単位だがコードポイントは 65)", "🔑".repeat(65), true],
    ["絵文字 129 個", "🔑".repeat(129), false],
  ])("%s は %s", (_label, password, expected) => {
    expect(isAcceptablePassword(password)).toBe(expected);
  });
});
