import type { LockPolicy } from "./lock";

export const SESSION_TTL_MS = 12 * 60 * 60_000;

export const LOGIN_LOCK_POLICY: LockPolicy = { maxFailures: 10, lockMs: 15 * 60_000 };
export const OTP_LOCK_POLICY: LockPolicy = { maxFailures: 5, lockMs: 15 * 60_000 };

export const OTP_CODE_TTL_MS = 5 * 60_000;
export const OTP_CHALLENGE_TTL_MS = 30 * 60_000;
export const OTP_RESEND_INTERVAL_MS = 60_000;

export const PASSWORD_RESET_TTL_MS = 30 * 60_000;
export const PASSWORD_RESET_INTERVAL_MS = 60_000;

export function isoAfter(nowMs: number, durationMs: number): string {
  return new Date(nowMs + durationMs).toISOString();
}
