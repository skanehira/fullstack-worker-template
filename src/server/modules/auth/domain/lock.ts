/**
 * 失敗回数によるロック。ログインのパスワードとメールコードの両方で使う。送信元 IP ではなく
 * アカウント単位で数える (分散した IP からの総当たりを IP 単位の制限では止められないため)。
 */

export type LockState = {
  failedAttempts: number;
  /** ISO 8601 UTC。ロックしていなければ null。 */
  lockedUntil: string | null;
};

export type LockPolicy = { maxFailures: number; lockMs: number };

export const UNLOCKED: LockState = { failedAttempts: 0, lockedUntil: null };

export function isLocked(state: LockState, nowMs: number): boolean {
  return state.lockedUntil !== null && nowMs < Date.parse(state.lockedUntil);
}

export function lockAfterFailure(state: LockState, nowMs: number, policy: LockPolicy): LockState {
  if (isLocked(state, nowMs)) return state;
  const current = state.lockedUntil === null ? state : UNLOCKED;
  const failedAttempts = current.failedAttempts + 1;
  return {
    failedAttempts,
    lockedUntil:
      failedAttempts >= policy.maxFailures ? new Date(nowMs + policy.lockMs).toISOString() : null,
  };
}
