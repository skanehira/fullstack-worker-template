#!/usr/bin/env bash
# E2E 用の dev サーバ。開発用とは別の D1 を毎回作り直し、e2e/users.ts の利用者を入れて起動する。
set -euo pipefail
PORT="$1"
STATE=".wrangler/e2e-state"

cd "$(dirname "${BASH_SOURCE[0]}")/.."
rm -rf "${STATE:?}"
wrangler d1 migrations apply DB --local --persist-to "$STATE" >/dev/null
node scripts/create-user.ts --email e2e-login@example.com --password 'e2e login passphrase' --persist-to "$STATE" >/dev/null
node scripts/create-user.ts --email e2e-reset@example.com --password 'e2e reset passphrase' --persist-to "$STATE" >/dev/null
WRANGLER_PERSIST_TO="$STATE" exec vp dev --port "$PORT" --strictPort
