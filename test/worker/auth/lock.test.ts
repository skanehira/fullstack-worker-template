import { describe, it, expect } from "vite-plus/test";
import { isLocked, lockAfterFailure } from "../../../src/server/modules/auth/domain/lock";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");
const policy = { maxFailures: 3, lockMs: 60_000 };

describe("lockAfterFailure", () => {
  it("上限に満たない失敗は回数だけを増やす", () => {
    expect(lockAfterFailure({ failedAttempts: 1, lockedUntil: null }, NOW, policy)).toEqual({
      failedAttempts: 2,
      lockedUntil: null,
    });
  });

  it("上限に達した失敗でロックを掛ける", () => {
    expect(lockAfterFailure({ failedAttempts: 2, lockedUntil: null }, NOW, policy)).toEqual({
      failedAttempts: 3,
      lockedUntil: "2026-01-01T00:01:00.000Z",
    });
  });

  it("ロック中の失敗は状態を変えない (ロックを延長しない)", () => {
    const locked = { failedAttempts: 3, lockedUntil: "2026-01-01T00:00:30.000Z" };

    expect(lockAfterFailure(locked, NOW, policy)).toEqual(locked);
  });

  it("ロックが明けた後の失敗は 1 回目から数え直す", () => {
    const expired = { failedAttempts: 3, lockedUntil: "2026-01-01T00:00:00.000Z" };

    expect(lockAfterFailure(expired, NOW, policy)).toEqual({
      failedAttempts: 1,
      lockedUntil: null,
    });
  });
});

describe("isLocked", () => {
  it("lockedUntil より前はロック中、ちょうどでは解ける", () => {
    const state = { failedAttempts: 3, lockedUntil: "2026-01-01T00:00:00.000Z" };

    expect(isLocked(state, NOW - 1)).toBe(true);
    expect(isLocked(state, NOW)).toBe(false);
  });

  it("lockedUntil が null ならロックしていない", () => {
    expect(isLocked({ failedAttempts: 2, lockedUntil: null }, NOW)).toBe(false);
  });
});
