import type { LockState } from "./lock";

/** 現在時刻 (ミリ秒)。domain と usecase は `Date.now()` を直接呼ばない。 */
export type Clock = () => number;

export type MailMessage = { to: string; subject: string; text: string };

/** 送信を受け付けたら true。失敗は例外ではなく false で返す。 */
export type MailSender = { send: (message: MailMessage) => Promise<boolean> };

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  authGeneration: number;
  loginLock: LockState;
  otpLock: LockState;
  otpLastSentAt: string | null;
};

export type UserStore = {
  findByEmail: (email: string) => Promise<User | null>;
  findById: (id: string) => Promise<User | null>;
  /** `expected` のときだけ書き換える (compare-and-set)。書き換えたら true。 */
  saveLoginLock: (input: {
    userId: string;
    expected: LockState;
    next: LockState;
  }) => Promise<boolean>;
  /**
   * `expected` のときだけ書き換える。`next` がロック中なら、同じ束で未完了の challenge を
   * すべて失効させる。書き換えたら true。
   */
  saveOtpLock: (input: {
    userId: string;
    authGeneration: number;
    expected: LockState;
    next: LockState;
    nowIso: string;
  }) => Promise<boolean>;
};

export type OtpChallenge = {
  id: string;
  userId: string;
  authGeneration: number;
  tokenHash: string;
  codeHash: string;
  codeExpiresAt: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

export type NewSession = {
  id: string;
  userId: string;
  authGeneration: number;
  createdAt: string;
  expiresAt: string;
};

/** コード送信の枠。`users.otp_last_sent_at` を `previousSentAt` から `sentAt` へ進めて確保する。 */
export type SendSlot = { userId: string; previousSentAt: string | null; sentAt: string };

export type OtpStore = {
  /** 送信枠の確保と challenge の作成を 1 つの束で行う。枠を取れなければ false。 */
  createChallenge: (input: { challenge: OtpChallenge; slot: SendSlot }) => Promise<boolean>;
  findChallenge: (id: string) => Promise<OtpChallenge | null>;
  /** 送信枠を確保し、未完了の challenge のコードを差し替える。どちらかが成立しなければ false。 */
  replaceCode: (input: {
    challengeId: string;
    authGeneration: number;
    codeHash: string;
    codeExpiresAt: string;
    slot: SendSlot;
  }) => Promise<boolean>;
  /** メールを送れなかったとき、確保した枠を戻して次の送信をすぐ受け付ける。 */
  releaseSendSlot: (slot: SendSlot) => Promise<void>;
  /**
   * challenge の消費・セッションの作成・失敗回数の消去を 1 つの束で行う。`codeHash` は照合に
   * 使った値で、その間に再送でコードが替わっていれば成立しない。成立したら true。
   */
  consumeChallenge: (input: {
    challengeId: string;
    codeHash: string;
    session: NewSession;
    nowIso: string;
  }) => Promise<boolean>;
  revokeChallenge: (input: { challengeId: string; nowIso: string }) => Promise<void>;
};

export type SessionStore = {
  /** 失効していない・期限内・世代が一致するセッションの利用者を返す。 */
  findActive: (input: {
    sid: string;
    userId: string;
    authGeneration: number;
    nowIso: string;
  }) => Promise<{ id: string; email: string } | null>;
  revoke: (input: { sid: string; userId: string; nowIso: string }) => Promise<void>;
  /** 認証世代を進め、その利用者のセッションをすべて使えなくする。 */
  revokeAll: (input: { userId: string; authGeneration: number }) => Promise<void>;
};

export type PasswordResetLink = {
  id: string;
  userId: string;
  authGeneration: number;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

export type PasswordResetStore = {
  /**
   * リンクを作り、同じ利用者の古いリンクを失効させる。`intervalStartIso` より後に作った行が
   * あれば作らずに false を返す。
   */
  issue: (input: { link: PasswordResetLink; intervalStartIso: string }) => Promise<boolean>;
  find: (id: string) => Promise<PasswordResetLink | null>;
  /**
   * リンクの消費・パスワードの保存・認証世代の更新・ロックの解除を 1 つの束で行う。
   * 成立したら true。
   */
  complete: (input: {
    link: PasswordResetLink;
    passwordHash: string;
    nowIso: string;
  }) => Promise<boolean>;
};
