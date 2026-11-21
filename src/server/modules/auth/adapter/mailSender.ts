import type { MailSender } from "../domain/ports";

/** Cloudflare Email Service の `send_email` binding。ローカルでは Miniflare がファイルに書き出す。 */
export function createMailSender(binding: SendEmail, from: string): MailSender {
  return {
    send: async (message) => {
      try {
        await binding.send({ from, to: message.to, subject: message.subject, text: message.text });
        return true;
      } catch (error) {
        // 宛先や本文 (確認コード) をログに残さない。
        console.error("mail send failed", error instanceof Error ? error.name : "unknown");
        return false;
      }
    },
  };
}
