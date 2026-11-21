import type { MailMessage } from "./ports";

export function otpMail(to: string, code: string): MailMessage {
  return {
    to,
    subject: "ログイン確認コード",
    text:
      `ログイン確認コード: ${code}\n\n` +
      "このコードの有効期限は 5 分です。\n" +
      "心当たりが無い場合は、このメールを破棄してください。" +
      "パスワードが第三者に知られている可能性があるため、パスワードの再設定をおすすめします。\n",
  };
}

/** トークンは `#` 以降に置く。ブラウザはサーバへ送らないので、アクセスログと Referer に残らない。 */
export function passwordResetUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl}/password-reset/confirm#token=${token}`;
}

export function passwordResetMail(to: string, url: string): MailMessage {
  return {
    to,
    subject: "パスワード再設定のご案内",
    text:
      "次のリンクからパスワードを再設定してください。\n" +
      `${url}\n\n` +
      "リンクの有効期限は 30 分です。\n" +
      "心当たりが無い場合は、このメールを破棄してください。\n",
  };
}
