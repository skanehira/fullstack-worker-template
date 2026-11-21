-- 認証 (パスワード + メールコードの二段階認証)。時刻はすべて ISO 8601 UTC の文字列で、
-- 文字列の大小比較が時刻の前後と一致する。

-- email は小文字に正規化して保存する。auth_generation を 1 増やすと、その利用者の
-- セッション・未完了のコード入力・再設定リンクがすべて使えなくなる。
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  auth_generation INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  otp_failed_attempts INTEGER NOT NULL DEFAULT 0,
  otp_locked_until TEXT,
  otp_last_sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_generation INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

-- パスワードが通った後、メールコードの入力を待つ要求。token_hash / code_hash は
-- AUTH_OTP_SECRET による HMAC で、トークンもコードも平文では保存しない。
CREATE TABLE auth_otp_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_generation INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  code_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_session_id TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_auth_otp_challenges_user ON auth_otp_challenges(user_id);

CREATE TABLE auth_password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_generation INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_auth_password_resets_user ON auth_password_resets(user_id, created_at);
