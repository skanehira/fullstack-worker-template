import type {
  OtpChallenge,
  OtpStore,
  PasswordResetLink,
  PasswordResetStore,
  SendSlot,
  SessionStore,
  User,
  UserStore,
} from "../domain/ports";

/**
 * D1 の batch は 1 つのトランザクションで実行されるが、0 行しか変えなかった文があっても
 * ロールバックしない。そこで後続の文に「先頭の文が書いた行が在ること」を `WHERE EXISTS` で
 * 条件付けし、各文の `meta.changes` で成立を判定する。Drizzle のクエリビルダでは
 * `INSERT ... SELECT ... WHERE EXISTS` を書けないため、ここは SQL を直接書く。
 */

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  auth_generation: number;
  failed_login_attempts: number;
  locked_until: string | null;
  otp_failed_attempts: number;
  otp_locked_until: string | null;
  otp_last_sent_at: string | null;
};

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  authGeneration: row.auth_generation,
  loginLock: { failedAttempts: row.failed_login_attempts, lockedUntil: row.locked_until },
  otpLock: { failedAttempts: row.otp_failed_attempts, lockedUntil: row.otp_locked_until },
  otpLastSentAt: row.otp_last_sent_at,
});

const changed = (result: D1Result) => result.meta.changes === 1;

export function createUserStore(db: D1Database): UserStore {
  const select = "SELECT * FROM users WHERE";
  return {
    findByEmail: async (email) => {
      const row = await db.prepare(`${select} email = ?`).bind(email).first<UserRow>();
      return row === null ? null : toUser(row);
    },
    findById: async (id) => {
      const row = await db.prepare(`${select} id = ?`).bind(id).first<UserRow>();
      return row === null ? null : toUser(row);
    },
    saveLoginLock: async ({ userId, expected, next }) => {
      const result = await db
        .prepare(
          `UPDATE users SET failed_login_attempts = ?, locked_until = ?
           WHERE id = ? AND failed_login_attempts = ? AND locked_until IS ?`,
        )
        .bind(
          next.failedAttempts,
          next.lockedUntil,
          userId,
          expected.failedAttempts,
          expected.lockedUntil,
        )
        .run();
      return changed(result);
    },
    saveOtpLock: async ({ userId, authGeneration, expected, next, nowIso }) => {
      const [saved] = await db.batch([
        db
          .prepare(
            `UPDATE users SET otp_failed_attempts = ?, otp_locked_until = ?
             WHERE id = ? AND auth_generation = ? AND otp_failed_attempts = ? AND otp_locked_until IS ?`,
          )
          .bind(
            next.failedAttempts,
            next.lockedUntil,
            userId,
            authGeneration,
            expected.failedAttempts,
            expected.lockedUntil,
          ),
        // ロックしたら未完了の challenge を捨て、ロックが明けた後はパスワードからやり直させる。
        db
          .prepare(
            `UPDATE auth_otp_challenges SET revoked_at = ?
             WHERE user_id = ? AND consumed_at IS NULL AND revoked_at IS NULL
               AND EXISTS (SELECT 1 FROM users WHERE id = ? AND otp_locked_until IS NOT NULL AND otp_locked_until = ?)`,
          )
          .bind(nowIso, userId, userId, next.lockedUntil),
      ]);
      return saved !== undefined && changed(saved);
    },
  };
}

type ChallengeRow = {
  id: string;
  user_id: string;
  auth_generation: number;
  token_hash: string;
  code_hash: string;
  code_expires_at: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};

const toChallenge = (row: ChallengeRow): OtpChallenge => ({
  id: row.id,
  userId: row.user_id,
  authGeneration: row.auth_generation,
  tokenHash: row.token_hash,
  codeHash: row.code_hash,
  codeExpiresAt: row.code_expires_at,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  consumedAt: row.consumed_at,
  revokedAt: row.revoked_at,
});

function reserveSlot(db: D1Database, slot: SendSlot, authGeneration: number) {
  return db
    .prepare(
      `UPDATE users SET otp_last_sent_at = ?
       WHERE id = ? AND auth_generation = ? AND otp_last_sent_at IS ?`,
    )
    .bind(slot.sentAt, slot.userId, authGeneration, slot.previousSentAt);
}

const SLOT_HELD = `EXISTS (SELECT 1 FROM users WHERE id = ? AND otp_last_sent_at = ? AND auth_generation = ?)`;

function releaseSlot(db: D1Database, slot: SendSlot) {
  return db
    .prepare("UPDATE users SET otp_last_sent_at = ? WHERE id = ? AND otp_last_sent_at = ?")
    .bind(slot.previousSentAt, slot.userId, slot.sentAt)
    .run();
}

export function createOtpStore(db: D1Database): OtpStore {
  return {
    createChallenge: async ({ challenge, slot }) => {
      const [reserved, inserted] = await db.batch([
        reserveSlot(db, slot, challenge.authGeneration),
        db
          .prepare(
            `INSERT INTO auth_otp_challenges
               (id, user_id, auth_generation, token_hash, code_hash, code_expires_at, created_at, expires_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${SLOT_HELD}`,
          )
          .bind(
            challenge.id,
            challenge.userId,
            challenge.authGeneration,
            challenge.tokenHash,
            challenge.codeHash,
            challenge.codeExpiresAt,
            challenge.createdAt,
            challenge.expiresAt,
            slot.userId,
            slot.sentAt,
            challenge.authGeneration,
          ),
      ]);
      return (
        reserved !== undefined && inserted !== undefined && changed(reserved) && changed(inserted)
      );
    },
    findChallenge: async (id) => {
      const row = await db
        .prepare("SELECT * FROM auth_otp_challenges WHERE id = ?")
        .bind(id)
        .first<ChallengeRow>();
      return row === null ? null : toChallenge(row);
    },
    replaceCode: async ({ challengeId, authGeneration, codeHash, codeExpiresAt, slot }) => {
      const [reserved, replaced] = await db.batch([
        reserveSlot(db, slot, authGeneration),
        db
          .prepare(
            `UPDATE auth_otp_challenges SET code_hash = ?, code_expires_at = ?
             WHERE id = ? AND user_id = ? AND auth_generation = ?
               AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?
               AND ${SLOT_HELD}`,
          )
          .bind(
            codeHash,
            codeExpiresAt,
            challengeId,
            slot.userId,
            authGeneration,
            slot.sentAt,
            slot.userId,
            slot.sentAt,
            authGeneration,
          ),
      ]);
      if (reserved === undefined || replaced === undefined || !changed(reserved)) return false;
      if (changed(replaced)) return true;
      await releaseSlot(db, slot);
      return false;
    },
    releaseSendSlot: async (slot) => {
      await releaseSlot(db, slot);
    },
    consumeChallenge: async ({ challengeId, codeHash, session, nowIso }) => {
      const [consumed, inserted] = await db.batch([
        db
          .prepare(
            `UPDATE auth_otp_challenges SET consumed_at = ?, consumed_session_id = ?
             WHERE id = ? AND user_id = ? AND code_hash = ? AND auth_generation = ?
               AND consumed_at IS NULL AND revoked_at IS NULL
               AND expires_at > ? AND code_expires_at > ?
               AND EXISTS (SELECT 1 FROM users WHERE id = ? AND auth_generation = ?)`,
          )
          .bind(
            nowIso,
            session.id,
            challengeId,
            session.userId,
            codeHash,
            session.authGeneration,
            nowIso,
            nowIso,
            session.userId,
            session.authGeneration,
          ),
        db
          .prepare(
            `INSERT INTO auth_sessions (id, user_id, auth_generation, created_at, expires_at)
             SELECT ?, ?, ?, ?, ?
             WHERE EXISTS (SELECT 1 FROM auth_otp_challenges WHERE id = ? AND consumed_session_id = ?)`,
          )
          .bind(
            session.id,
            session.userId,
            session.authGeneration,
            session.createdAt,
            session.expiresAt,
            challengeId,
            session.id,
          ),
        db
          .prepare(
            `UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
               otp_failed_attempts = 0, otp_locked_until = NULL
             WHERE id = ? AND EXISTS (SELECT 1 FROM auth_sessions WHERE id = ?)`,
          )
          .bind(session.userId, session.id),
      ]);
      return (
        consumed !== undefined && inserted !== undefined && changed(consumed) && changed(inserted)
      );
    },
    revokeChallenge: async ({ challengeId, nowIso }) => {
      await db
        .prepare(
          `UPDATE auth_otp_challenges SET revoked_at = ?
           WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
        )
        .bind(nowIso, challengeId)
        .run();
    },
  };
}

export function createSessionStore(db: D1Database): SessionStore {
  return {
    findActive: async ({ sid, userId, authGeneration, nowIso }) =>
      await db
        .prepare(
          `SELECT u.id AS id, u.email AS email FROM auth_sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = ? AND s.user_id = ? AND s.auth_generation = ? AND u.auth_generation = ?
             AND s.revoked_at IS NULL AND s.expires_at > ?`,
        )
        .bind(sid, userId, authGeneration, authGeneration, nowIso)
        .first<{ id: string; email: string }>(),
    revoke: async ({ sid, userId, nowIso }) => {
      await db
        .prepare(
          "UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
        )
        .bind(nowIso, sid, userId)
        .run();
    },
    revokeAll: async ({ userId, authGeneration }) => {
      await db
        .prepare(
          "UPDATE users SET auth_generation = auth_generation + 1 WHERE id = ? AND auth_generation = ?",
        )
        .bind(userId, authGeneration)
        .run();
    },
  };
}

type ResetRow = {
  id: string;
  user_id: string;
  auth_generation: number;
  token_hash: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};

const toLink = (row: ResetRow): PasswordResetLink => ({
  id: row.id,
  userId: row.user_id,
  authGeneration: row.auth_generation,
  tokenHash: row.token_hash,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  consumedAt: row.consumed_at,
  revokedAt: row.revoked_at,
});

export function createPasswordResetStore(db: D1Database): PasswordResetStore {
  return {
    issue: async ({ link, intervalStartIso }) => {
      const [inserted] = await db.batch([
        db
          .prepare(
            `INSERT INTO auth_password_resets (id, user_id, auth_generation, token_hash, created_at, expires_at)
             SELECT ?, ?, ?, ?, ?, ?
             WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND auth_generation = ?)
               AND NOT EXISTS (SELECT 1 FROM auth_password_resets WHERE user_id = ? AND created_at > ?)`,
          )
          .bind(
            link.id,
            link.userId,
            link.authGeneration,
            link.tokenHash,
            link.createdAt,
            link.expiresAt,
            link.userId,
            link.authGeneration,
            link.userId,
            intervalStartIso,
          ),
        db
          .prepare(
            `UPDATE auth_password_resets SET revoked_at = ?
             WHERE user_id = ? AND id <> ? AND consumed_at IS NULL AND revoked_at IS NULL
               AND EXISTS (SELECT 1 FROM auth_password_resets WHERE id = ?)`,
          )
          .bind(link.createdAt, link.userId, link.id, link.id),
      ]);
      return inserted !== undefined && changed(inserted);
    },
    find: async (id) => {
      const row = await db
        .prepare("SELECT * FROM auth_password_resets WHERE id = ?")
        .bind(id)
        .first<ResetRow>();
      return row === null ? null : toLink(row);
    },
    complete: async ({ link, passwordHash, nowIso }) => {
      const [consumed, updated] = await db.batch([
        db
          .prepare(
            `UPDATE auth_password_resets SET consumed_at = ?
             WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
          )
          .bind(nowIso, link.id, nowIso),
        db
          .prepare(
            `UPDATE users SET password_hash = ?, auth_generation = auth_generation + 1,
               failed_login_attempts = 0, locked_until = NULL,
               otp_failed_attempts = 0, otp_locked_until = NULL
             WHERE id = ? AND auth_generation = ?
               AND EXISTS (SELECT 1 FROM auth_password_resets WHERE id = ? AND consumed_at = ?)`,
          )
          .bind(passwordHash, link.userId, link.authGeneration, link.id, nowIso),
      ]);
      return (
        consumed !== undefined && updated !== undefined && changed(consumed) && changed(updated)
      );
    },
  };
}
