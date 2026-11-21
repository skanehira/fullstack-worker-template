import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const ERRORS = {
  AUTH_FAILED: [401, "メールアドレスまたはパスワードが正しくありません"],
  UNAUTHORIZED: [401, "認証が必要です"],
  OTP_CHALLENGE_INVALID: [401, "ログインをやり直してください"],
  FORBIDDEN: [403, "許可されていない送信元です"],
  VALIDATION_FAILED: [422, "入力内容が正しくありません"],
  OTP_INVALID: [422, "確認コードが正しくありません"],
  OTP_EXPIRED: [422, "確認コードの有効期限が切れています。コードを再送してください"],
  PASSWORD_RESET_LINK_INVALID: [
    422,
    "再設定のリンクが無効です。もう一度再設定を申し込んでください",
  ],
  OTP_LOCKED: [429, "確認コードの入力を続けて間違えたため、しばらく入力できません"],
  OTP_SEND_RATE_LIMITED: [429, "確認コードの送信は 60 秒に 1 回までです"],
  OTP_SEND_FAILED: [503, "確認コードを送信できませんでした。しばらくしてからやり直してください"],
} as const satisfies Record<string, readonly [ContentfulStatusCode, string]>;

export type ErrorCode = keyof typeof ERRORS;

export function errorResponse(
  c: Context,
  failure: { code: ErrorCode; retryAt?: string },
  nowMs: number,
) {
  const [status, message] = ERRORS[failure.code];
  if (failure.retryAt === undefined) {
    return c.json({ error: { code: failure.code, message } }, status);
  }
  const seconds = Math.max(1, Math.ceil((Date.parse(failure.retryAt) - nowMs) / 1000));
  c.header("Retry-After", String(seconds));
  return c.json({ error: { code: failure.code, message, retryAt: failure.retryAt } }, status);
}
