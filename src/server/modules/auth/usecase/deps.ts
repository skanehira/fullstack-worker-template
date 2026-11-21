import type {
  Clock,
  MailSender,
  OtpStore,
  PasswordResetStore,
  SessionStore,
  UserStore,
} from "../domain/ports";
import type { Random } from "../domain/random";

export type AuthSecrets = {
  /** セッショントークン (JWT) の署名鍵。 */
  jwtSecret: string;
  /** パスワードを PBKDF2 に掛ける前の HMAC 鍵。D1 に入れない。 */
  passwordPepper: string;
  /** challenge・確認コード・再設定リンクを保存するときの HMAC 鍵。 */
  otpSecret: string;
};

export type AuthDeps = {
  users: UserStore;
  otp: OtpStore;
  sessions: SessionStore;
  passwordResets: PasswordResetStore;
  mail: MailSender;
  clock: Clock;
  random: Random;
  newId: () => string;
  secrets: AuthSecrets;
  /** 再設定リンクの URL の起点 (例: `https://app.example.com`)。 */
  publicBaseUrl: string;
};

export type Failure<Code extends string> = { ok: false; code: Code; retryAt?: string };

export const CAS_ATTEMPTS = 3;
