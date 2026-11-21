import {
  OTP_CODE_TTL_MS,
  OTP_LOCK_POLICY,
  OTP_RESEND_INTERVAL_MS,
  SESSION_TTL_MS,
  isoAfter,
} from "../domain/authPolicy";
import { isLocked, lockAfterFailure } from "../domain/lock";
import { otpMail } from "../domain/mailMessages";
import { generateOtpCode, hashOtpCode, matchesOtpCode } from "../domain/otp";
import type { OtpChallenge, User } from "../domain/ports";
import { matchesOpaqueToken, parseOpaqueToken } from "../domain/secretToken";
import { signSessionToken } from "../domain/sessionToken";
import { CAS_ATTEMPTS, type AuthDeps, type Failure } from "./deps";
import { sendBlocker } from "./login";

type PendingFailure = Failure<"OTP_CHALLENGE_INVALID" | "OTP_LOCKED">;

/**
 * トークンが指す未完了の challenge と利用者を引く。トークンが合わないうちは失敗回数に数えない
 * (第三者が他人の challenge ID でコードを外し続け、本人をロックさせることを防ぐ)。
 */
async function findPending(
  deps: AuthDeps,
  challengeToken: unknown,
): Promise<{ ok: true; user: User; challenge: OtpChallenge } | PendingFailure> {
  const invalid = { ok: false, code: "OTP_CHALLENGE_INVALID" } as const;
  const parsed = typeof challengeToken === "string" ? parseOpaqueToken(challengeToken) : null;
  if (parsed === null) return invalid;
  const challenge = await deps.otp.findChallenge(parsed.id);
  if (
    challenge === null ||
    !(await matchesOpaqueToken(parsed, "challenge", challenge.tokenHash, deps.secrets.otpSecret))
  ) {
    return invalid;
  }
  const user = await deps.users.findById(challenge.userId);
  const nowMs = deps.clock();
  if (
    user === null ||
    user.authGeneration !== challenge.authGeneration ||
    challenge.consumedAt !== null ||
    challenge.revokedAt !== null ||
    nowMs >= Date.parse(challenge.expiresAt)
  ) {
    return invalid;
  }
  if (isLocked(user.otpLock, nowMs) && user.otpLock.lockedUntil !== null) {
    return { ok: false, code: "OTP_LOCKED", retryAt: user.otpLock.lockedUntil };
  }
  return { ok: true, user, challenge };
}

export type VerifyResult =
  | { ok: true; token: string }
  | Failure<"OTP_CHALLENGE_INVALID" | "OTP_LOCKED" | "OTP_INVALID" | "OTP_EXPIRED">;

export async function verifyOtp(
  deps: AuthDeps,
  input: { challengeToken: unknown; code: unknown },
): Promise<VerifyResult> {
  const pending = await findPending(deps, input.challengeToken);
  if (!pending.ok) return pending;
  const { user, challenge } = pending;

  if (deps.clock() >= Date.parse(challenge.codeExpiresAt))
    return { ok: false, code: "OTP_EXPIRED" };
  const matched = await matchesOtpCode(
    { userId: user.id, challengeId: challenge.id, code: input.code },
    challenge.codeHash,
    deps.secrets.otpSecret,
  );
  if (!matched) return await recordOtpFailure(deps, user);

  const nowMs = deps.clock();
  const nowIso = new Date(nowMs).toISOString();
  const session = {
    id: deps.newId(),
    userId: user.id,
    authGeneration: user.authGeneration,
    createdAt: nowIso,
    expiresAt: isoAfter(nowMs, SESSION_TTL_MS),
  };
  const consumed = await deps.otp.consumeChallenge({
    challengeId: challenge.id,
    codeHash: challenge.codeHash,
    session,
    nowIso,
  });
  if (!consumed) return { ok: false, code: "OTP_CHALLENGE_INVALID" };
  const token = await signSessionToken({
    userId: user.id,
    sid: session.id,
    authGeneration: user.authGeneration,
    secret: deps.secrets.jwtSecret,
    nowMs,
  });
  return { ok: true, token };
}

async function recordOtpFailure(
  deps: AuthDeps,
  user: User,
): Promise<Failure<"OTP_INVALID" | "OTP_LOCKED" | "OTP_CHALLENGE_INVALID">> {
  let current: User | null = user;
  for (let attempt = 0; attempt < CAS_ATTEMPTS && current !== null; attempt += 1) {
    const nowMs = deps.clock();
    const next = lockAfterFailure(current.otpLock, nowMs, OTP_LOCK_POLICY);
    const saved = await deps.users.saveOtpLock({
      userId: user.id,
      authGeneration: user.authGeneration,
      expected: current.otpLock,
      next,
      nowIso: new Date(nowMs).toISOString(),
    });
    if (saved) {
      return isLocked(next, nowMs) && next.lockedUntil !== null
        ? { ok: false, code: "OTP_LOCKED", retryAt: next.lockedUntil }
        : { ok: false, code: "OTP_INVALID" };
    }
    current = await deps.users.findById(user.id);
  }
  return { ok: false, code: "OTP_CHALLENGE_INVALID" };
}

export type ResendResult =
  | { ok: true; challengeExpiresAt: string; codeExpiresAt: string; resendAvailableAt: string }
  | Failure<"OTP_CHALLENGE_INVALID" | "OTP_LOCKED" | "OTP_SEND_RATE_LIMITED" | "OTP_SEND_FAILED">;

/** 新しいコードを送る。差し替えた時点で前のコードは使えなくなる。 */
export async function resendOtp(
  deps: AuthDeps,
  input: { challengeToken: unknown },
): Promise<ResendResult> {
  const pending = await findPending(deps, input.challengeToken);
  if (!pending.ok) return pending;
  const { user, challenge } = pending;
  const nowMs = deps.clock();
  const blocker = sendBlocker(user, nowMs);
  if (blocker !== null) return blocker;

  const code = generateOtpCode(deps.random.uint32);
  const codeExpiresAt = isoAfter(nowMs, OTP_CODE_TTL_MS);
  const slot = {
    userId: user.id,
    previousSentAt: user.otpLastSentAt,
    sentAt: new Date(nowMs).toISOString(),
  };
  const replaced = await deps.otp.replaceCode({
    challengeId: challenge.id,
    authGeneration: user.authGeneration,
    codeHash: await hashOtpCode(
      { userId: user.id, challengeId: challenge.id, code },
      deps.secrets.otpSecret,
    ),
    codeExpiresAt,
    slot,
  });
  if (!replaced) {
    const latest = await deps.users.findById(user.id);
    return (
      (latest && sendBlocker(latest, deps.clock())) ?? { ok: false, code: "OTP_CHALLENGE_INVALID" }
    );
  }
  if (!(await deps.mail.send(otpMail(user.email, code)))) {
    await deps.otp.releaseSendSlot(slot);
    return { ok: false, code: "OTP_SEND_FAILED" };
  }
  return {
    ok: true,
    challengeExpiresAt: challenge.expiresAt,
    codeExpiresAt,
    resendAvailableAt: isoAfter(nowMs, OTP_RESEND_INTERVAL_MS),
  };
}

/** 入力を取りやめる。トークンが合わなくても応答を変えない。 */
export async function cancelOtp(deps: AuthDeps, input: { challengeToken: unknown }): Promise<void> {
  const parsed =
    typeof input.challengeToken === "string" ? parseOpaqueToken(input.challengeToken) : null;
  if (parsed === null) return;
  const challenge = await deps.otp.findChallenge(parsed.id);
  if (
    challenge === null ||
    !(await matchesOpaqueToken(parsed, "challenge", challenge.tokenHash, deps.secrets.otpSecret))
  ) {
    return;
  }
  await deps.otp.revokeChallenge({
    challengeId: challenge.id,
    nowIso: new Date(deps.clock()).toISOString(),
  });
}
