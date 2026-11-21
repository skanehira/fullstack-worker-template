import {
  LOGIN_LOCK_POLICY,
  OTP_CHALLENGE_TTL_MS,
  OTP_CODE_TTL_MS,
  OTP_RESEND_INTERVAL_MS,
  isoAfter,
} from "../domain/authPolicy";
import { isLocked, lockAfterFailure } from "../domain/lock";
import { otpMail } from "../domain/mailMessages";
import { generateOtpCode, hashOtpCode, maskEmail } from "../domain/otp";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "../domain/passwordHash";
import type { User } from "../domain/ports";
import { createOpaqueToken } from "../domain/secretToken";
import { CAS_ATTEMPTS, type AuthDeps, type Failure } from "./deps";

export type LoginResult =
  | {
      ok: true;
      challengeToken: string;
      challengeExpiresAt: string;
      codeExpiresAt: string;
      resendAvailableAt: string;
      emailHint: string;
    }
  | Failure<"AUTH_FAILED" | "OTP_LOCKED" | "OTP_SEND_RATE_LIMITED" | "OTP_SEND_FAILED">;

/** パスワードを確かめ、通ればメールで確認コードを送る。ログインはコードの入力で完了する。 */
export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<LoginResult> {
  const user = await verifyCredential(deps, input);
  if (user === null) return { ok: false, code: "AUTH_FAILED" };
  return await startChallenge(deps, user);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 未登録・パスワードの誤り・ロック中のどれも null に畳み、どの項目が誤りかを応答に出さない。
 */
async function verifyCredential(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<User | null> {
  const user = await deps.users.findByEmail(normalizeEmail(input.email));
  // 未登録とロック中も DUMMY と照合して、パスワードを照合した場合と同じだけ時間を掛ける。
  // 照合を省くと応答の速さから「登録済みでロック中」と分かり、10 回誤るだけで登録の有無を調べられる。
  // ロック中に本物のハッシュと照合しないのは、結果を使わないうえ、一致の有無が時間に出かねないため。
  if (user === null || isLocked(user.loginLock, deps.clock())) {
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH, deps.secrets.passwordPepper);
    return null;
  }
  if (await verifyPassword(input.password, user.passwordHash, deps.secrets.passwordPepper)) {
    return user;
  }
  await recordLoginFailure(deps, user);
  return null;
}

async function recordLoginFailure(deps: AuthDeps, user: User): Promise<void> {
  let current: User | null = user;
  for (let attempt = 0; attempt < CAS_ATTEMPTS && current !== null; attempt += 1) {
    const next = lockAfterFailure(current.loginLock, deps.clock(), LOGIN_LOCK_POLICY);
    if (await deps.users.saveLoginLock({ userId: user.id, expected: current.loginLock, next })) {
      return;
    }
    current = await deps.users.findById(user.id);
  }
}

export function sendBlocker(
  user: User,
  nowMs: number,
): Failure<"OTP_LOCKED" | "OTP_SEND_RATE_LIMITED"> | null {
  if (isLocked(user.otpLock, nowMs) && user.otpLock.lockedUntil !== null) {
    return { ok: false, code: "OTP_LOCKED", retryAt: user.otpLock.lockedUntil };
  }
  if (user.otpLastSentAt !== null) {
    const availableAt = Date.parse(user.otpLastSentAt) + OTP_RESEND_INTERVAL_MS;
    if (nowMs < availableAt) {
      return {
        ok: false,
        code: "OTP_SEND_RATE_LIMITED",
        retryAt: new Date(availableAt).toISOString(),
      };
    }
  }
  return null;
}

async function startChallenge(deps: AuthDeps, user: User): Promise<LoginResult> {
  const nowMs = deps.clock();
  const blocker = sendBlocker(user, nowMs);
  if (blocker !== null) return blocker;

  const challengeId = deps.newId();
  const code = generateOtpCode(deps.random.uint32);
  const { token, tokenHash } = await createOpaqueToken(
    challengeId,
    "challenge",
    deps.secrets.otpSecret,
    deps.random.bytes,
  );
  const nowIso = new Date(nowMs).toISOString();
  const challenge = {
    id: challengeId,
    userId: user.id,
    authGeneration: user.authGeneration,
    tokenHash,
    codeHash: await hashOtpCode({ userId: user.id, challengeId, code }, deps.secrets.otpSecret),
    codeExpiresAt: isoAfter(nowMs, OTP_CODE_TTL_MS),
    createdAt: nowIso,
    expiresAt: isoAfter(nowMs, OTP_CHALLENGE_TTL_MS),
    consumedAt: null,
    revokedAt: null,
  };
  const slot = { userId: user.id, previousSentAt: user.otpLastSentAt, sentAt: nowIso };

  if (!(await deps.otp.createChallenge({ challenge, slot }))) {
    // 同じ利用者の別のログインが先に枠を取った。読み直した状態で理由を返す。
    const latest = await deps.users.findById(user.id);
    return (latest && sendBlocker(latest, deps.clock())) ?? { ok: false, code: "OTP_SEND_FAILED" };
  }
  if (!(await deps.mail.send(otpMail(user.email, code)))) {
    await deps.otp.revokeChallenge({ challengeId, nowIso });
    await deps.otp.releaseSendSlot(slot);
    return { ok: false, code: "OTP_SEND_FAILED" };
  }
  return {
    ok: true,
    challengeToken: token,
    challengeExpiresAt: challenge.expiresAt,
    codeExpiresAt: challenge.codeExpiresAt,
    resendAvailableAt: isoAfter(nowMs, OTP_RESEND_INTERVAL_MS),
    emailHint: maskEmail(user.email),
  };
}
