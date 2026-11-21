import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const kvExample = sqliteTable("kv_example", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull(),
});

// 認証のテーブル。DDL の正本は migrations/0001_auth.sql。認証の adapter (d1Stores.ts) は
// SQL を直接書くのでこの定義を使わないが、テーブルの一覧を schema.ts に揃えておく。
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  authGeneration: integer("auth_generation").notNull().default(0),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  otpFailedAttempts: integer("otp_failed_attempts").notNull().default(0),
  otpLockedUntil: text("otp_locked_until"),
  otpLastSentAt: text("otp_last_sent_at"),
  createdAt: text("created_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  authGeneration: integer("auth_generation").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
});

export const authOtpChallenges = sqliteTable("auth_otp_challenges", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  authGeneration: integer("auth_generation").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  codeHash: text("code_hash").notNull(),
  codeExpiresAt: text("code_expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  consumedSessionId: text("consumed_session_id"),
  revokedAt: text("revoked_at"),
});

export const authPasswordResets = sqliteTable("auth_password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  authGeneration: integer("auth_generation").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  revokedAt: text("revoked_at"),
});
