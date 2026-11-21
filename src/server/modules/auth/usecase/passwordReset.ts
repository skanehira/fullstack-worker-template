import { PASSWORD_RESET_INTERVAL_MS, PASSWORD_RESET_TTL_MS, isoAfter } from "../domain/authPolicy";
import { passwordResetMail, passwordResetUrl } from "../domain/mailMessages";
import { hashPassword } from "../domain/passwordHash";
import { isAcceptablePassword } from "../domain/passwordPolicy";
import { createOpaqueToken, matchesOpaqueToken, parseOpaqueToken } from "../domain/secretToken";
import type { AuthDeps, Failure } from "./deps";
import { normalizeEmail } from "./login";

/**
 * 登録の有無に依らず呼び出し側は同じ応答を返す。送信の可否も返さない
 * (返すと、応答からメールアドレスの登録が分かる)。
 */
export async function requestPasswordReset(
  deps: AuthDeps,
  input: { email: string },
): Promise<void> {
  const user = await deps.users.findByEmail(normalizeEmail(input.email));
  if (user === null) return;
  const nowMs = deps.clock();
  const id = deps.newId();
  const { token, tokenHash } = await createOpaqueToken(
    id,
    "password_reset",
    deps.secrets.otpSecret,
    deps.random.bytes,
  );
  const issued = await deps.passwordResets.issue({
    link: {
      id,
      userId: user.id,
      authGeneration: user.authGeneration,
      tokenHash,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: isoAfter(nowMs, PASSWORD_RESET_TTL_MS),
      consumedAt: null,
      revokedAt: null,
    },
    intervalStartIso: new Date(nowMs - PASSWORD_RESET_INTERVAL_MS).toISOString(),
  });
  if (!issued) return;
  await deps.mail.send(passwordResetMail(user.email, passwordResetUrl(deps.publicBaseUrl, token)));
}

export type CompleteResetResult =
  | { ok: true }
  | Failure<"PASSWORD_RESET_LINK_INVALID" | "VALIDATION_FAILED">;

/**
 * パスワードを保存し、認証世代を進めて既存のセッションと未完了のログインを使えなくする。
 * ログインはさせない (新しいパスワードとメールコードでログインし直す)。
 */
export async function completePasswordReset(
  deps: AuthDeps,
  input: { token: string; password: string },
): Promise<CompleteResetResult> {
  const invalid = { ok: false, code: "PASSWORD_RESET_LINK_INVALID" } as const;
  const parsed = parseOpaqueToken(input.token);
  if (parsed === null) return invalid;
  const link = await deps.passwordResets.find(parsed.id);
  if (
    link === null ||
    !(await matchesOpaqueToken(parsed, "password_reset", link.tokenHash, deps.secrets.otpSecret))
  ) {
    return invalid;
  }
  const user = await deps.users.findById(link.userId);
  if (
    user === null ||
    user.authGeneration !== link.authGeneration ||
    link.consumedAt !== null ||
    link.revokedAt !== null ||
    deps.clock() >= Date.parse(link.expiresAt)
  ) {
    return invalid;
  }
  if (!isAcceptablePassword(input.password)) return { ok: false, code: "VALIDATION_FAILED" };

  const passwordHash = await hashPassword(
    input.password,
    deps.secrets.passwordPepper,
    deps.random.bytes,
  );
  const completed = await deps.passwordResets.complete({
    link,
    passwordHash,
    nowIso: new Date(deps.clock()).toISOString(),
  });
  return completed ? { ok: true } : invalid;
}
