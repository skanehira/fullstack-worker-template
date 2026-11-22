# AGENTS.md

React 19 (SPA) + Hono (API Worker) + Cloudflare D1 (Drizzle ORM) を単一の Cloudflare Workers プロジェクトにまとめたフルスタックテンプレート。`@cloudflare/vite-plugin` で SPA と Worker を同一 `vp dev` で開発する。詳細は README.md を参照。

## 新規プロジェクトとして使い始めるとき

このリポジトリから `gh repo create --template` で clone した直後に必ず行う:

```bash
bash scripts/rename-project.sh <project-name>
wrangler d1 create <project-name>-db   # database_id を wrangler.jsonc に反映
```

スクリプト実行後に手で始末するものが 3 つある（詳細は README「2. プロジェクト名のリネーム」）。

- `.github/workflows/deploy.yml` の `if: github.event.repository.name != ...` ガード行を削除する（スクリプトの一括置換でこの行も新プロジェクト名に書き換わり、放置すると deploy ジョブが常に skip される）
- `.github/workflows/deploy.yml.bak` を削除する（スクリプトの `.bak` 掃除が深さ 3 に届かない）
- `src/front/pages/HomePage.tsx` の見出しと `HomePage.test.tsx` の期待値を直す（スクリプトの置換対象外）

## コマンド

`vp`（Vite+）に統一。生の `pnpm` / `vite` / `vitest` を直接叩かない。

- `vp install` — 依存インストール（`postinstall` で `worker-configuration.d.ts` も生成・フォーマットされる。ただし node_modules 既存時は走らないことがある）
- `vp dev` — SPA + Worker を同時起動
- `vp test` — フロントエンドテスト（jsdom）
- `vp exec vitest run -c vitest.workers.config.ts` — バックエンドテスト（`@cloudflare/vitest-plugin`）
- `vp check` / `vp check --fix` — 型チェック + lint + フォーマット
- `vp lint` — lint のみ実行（レイヤ境界違反の確認に使う）
- `vp run e2e` — Playwright の E2E（`e2e/start-server.sh` が専用の D1 を作り直して dev サーバを起動する。初回は `vp exec playwright install chromium`）
- `vp build` — `dist/client`（SPA）+ `dist/<name>`（Worker）をビルド
- `vp exec wrangler types` — `wrangler.jsonc` の bindings/`main` から `Env` 型を再生成

`git push` 時は lefthook の `pre-push` フックが `vp check` + `vp build` を自動実行する（`lefthook.yml`、`vp install` で自動セットアップ）。失敗すると push はブロックされる。

## 守るべき規約

- **`useEffect` は import 禁止**（`vite.config.ts` の `no-restricted-imports` で lint エラー）。データ取得は `useSWR` を使う。他の用途でどうしても必要なら oxlint-disable コメントで理由を明記する
- ディレクトリ構成: `src/front`（SPA）/ `src/server`（Worker）/ `src/shared`（両者共有の型。現状は未作成）。`src/server` は `index.ts`（Worker のエントリ）・`app.ts`（composition root）・`db/schema.ts` を直下に置き、機能は `modules/<bounded context>/{domain,usecase,adapter}` に分ける。`usecase/` は該当するロジックが出てきた時点で作る（現状は空のまま置かない）
- **レイヤ境界は lint で強制される**（`vite.config.ts` の `lint.overrides`）。`domain/` はフレームワーク（`hono` / `drizzle-orm` / `react` 等）も外側レイヤ（`adapter` / `db` / `routes` / `usecase` 等）も import できない。`usecase/` が依存してよいのは `domain/` のみ。`src/front` ↔ `src/server` の直接 import は双方向で禁止（共有する型は `src/shared` に置く）。違反は `oxlint-disable` で回避せず Port と DI に直す。禁止 import の一覧・Port と DI の書き方・設定を編集するときの注意は README「レイヤ境界の lint」が正本
- フロント/バックエンドのテストは別ランナー（`vite.config.ts` の jsdom テストと `vitest.workers.config.ts` の Workers pool テストは同一プロセスで共存できない。`vite.config.ts` は `process.env.VITEST` のとき `cloudflare()` プラグインを無効化している）。バックエンドのテストは `test/worker/` に置く（Workers ランナーの `include` が `test/worker/**` 固定のため、`src/server/modules/` にコロケートすると jsdom 側で実行されてしまう）
- `pnpm-workspace.yaml` の catalog `vitest` は `vite-plus` が同梱する Vitest（`vp --version` の `vitest` 行）と同じバージョンに揃える。ずれると Vitest が 2 本入り、jest-dom の型拡張が片方にしか当たらず `vp check` が TS2339 を出す。`vite-plus` を上げるときは catalog の `vite` / `vite-plus` と同時に書き換える（詳細は README「Vitest のバージョン（catalog）」が正本）
- `worker-configuration.d.ts` は commit 済みの生成物。**bindings（`d1_databases` / `vars` 等）か `main` を変更したときだけ** `vp exec wrangler types` で再生成して commit し直す（`name` 等それ以外のフィールドは型に影響しない）。CI は `vp install` の postinstall で毎回再生成するため commit 済みの内容に依存しないが、postinstall が走らなかったローカル環境では commit 済みの型が使われ、再生成を忘れると `vp check` が型エラーで検出する。`vars` の型は生成時に `.dev.vars` でその変数が定義されているかで決まる（定義があれば `string`、無ければリテラル型）ため、commit 済みと再生成結果は一致しないことがある
- `wrangler.jsonc` の `assets.directory` は必ず `./dist/client` を指す。トップレベル `./dist/` を指定すると Worker ビルド成果物（ローカルシークレットを含む `.dev.vars` 等）まで静的配信対象に入ってしまう

## 認証

- 認証は Worker 内の自前実装（パスワード + メールの確認コードによる二段階認証、HS256 の JWT を Bearer で送る）。外部の IdP は使わない。API・守りの値・秘密の値・本番手順は README「認証」が正本
- セッションの失効は D1 の照合で行う。JWT に `sid` と `auth_generation` を載せ、`/api/me` などの保護された API は毎回 `auth_sessions` の行と `users.auth_generation` を見る。失効を足すときは JWT ではなく D1 側を変える
- `src/server/modules/auth/adapter/d1Stores.ts` は Drizzle を使わず SQL を直接書く。D1 の `batch` は 0 行しか変えなかった文をロールバックしないため、後続の文を `WHERE EXISTS` で条件付けし `meta.changes` で成立を判定している。複数の行を書く変更はこの形を崩さない
- ローカルの秘密の値は `cp .dev.vars.example .dev.vars` で用意する。利用者は `vp run user:create --email ... --password ...` で作る（自己サインアップは無い）。確認コードのメールは `.wrangler/tmp/email/miniflare-*/email-text/*.txt` に保存される
- `AUTH_PASSWORD_PEPPER` を変えると保存済みのパスワードがすべて照合できなくなる
- 認証が不要なプロジェクトでは README「認証が不要な場合」に列挙されたファイル・依存を削除する

## テスト・実装方針

- TDD（RED→GREEN→REFACTOR）で実装する
- 時計・乱数・メール送信などの外界は Port（`src/server/modules/auth/domain/ports.ts`）で DI し、`src/server/app.ts` の `createApp(overrides)` から差し替える。D1 はテストでも本物を使う（`test/worker/auth/helpers.ts` の `createTestApp` を参照）
