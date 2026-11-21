# fullstack-worker-template

React 19 + Vite + Hono + Cloudflare D1 (Drizzle ORM) を単一の Cloudflare Workers プロジェクトにまとめたフルスタックテンプレート。SPA (`src/front`) と API Worker (`src/server`) を `@cloudflare/vite-plugin` で同一プロジェクトとして開発・デプロイする。

`skanehira/demo-site-template`（フロントオンリー静的 SPA 用）のバックエンド版。DB・決済・ログインが必要なフルスタックプロジェクトはこちらを起点にする。

## 前提条件

`vp` / `wrangler` 以外に、以下の機能を使う場合は追加のツールが必要:

| コマンド | 用途                                                              | 導入                                                                                           |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `stripe` | Stripe API のローカル開発（webhook 転送・イベント送信・ログ監視） | `nix develop` + `direnv allow`（[direnv](https://direnv.net) 要導入）。初回のみ `stripe login` |

direnv 未導入の場合は `nix develop` を手動実行してもよい。

## 技術構成

| 領域                         | 技術                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| フロントエンド               | React 19 / React Router v8 系 (`createBrowserRouter`) / Tailwind CSS v4                                                                                                                                            |
| データ取得                   | [SWR](https://swr.vercel.app)（`useEffect` は lint で禁止）                                                                                                                                                        |
| バックエンド                 | Hono / Cloudflare D1 / Drizzle ORM                                                                                                                                                                                 |
| 認証                         | Worker 内の自前実装。パスワードとメールの確認コードによる二段階認証（下記「認証」参照）                                                                                                                            |
| ビルド・ローカル開発         | Vite 8 + `@cloudflare/vite-plugin`（SPA と Worker を単一 `vp dev` で同時起動）                                                                                                                                     |
| 言語                         | TypeScript 7.0.2                                                                                                                                                                                                   |
| ツールチェーン               | [`vp` (Vite+)](https://vite.plus) — `vp install` / `vp dev` / `vp test` / `vp check` / `vp build` に統合                                                                                                           |
| テスト                       | フロント: Vitest (jsdom) 経由 `vp test`。バックエンド: `@cloudflare/vitest-plugin` 経由 `vp exec vitest run -c vitest.workers.config.ts`。どちらも Vite+ 同梱の Vitest 5 で動く。E2E: Playwright 経由 `vp run e2e` |
| 事前同梱の外部連携ライブラリ | `stripe` / `@stripe/stripe-js` / `@stripe/react-stripe-js` / `jose` / `zod` / `neverthrow` / `ulid`                                                                                                                |
| CI/CD                        | GitHub Actions（`ci.yml` がテスト・check・build と E2E、`deploy.yml` が D1 マイグレーションとデプロイ。どちらも `vp` ベース）                                                                                      |

## 使い方

### 1. テンプレートから新規プロジェクトを作成

```bash
gh repo create <project-name> \
  --template skanehira/fullstack-worker-template \
  --private --clone
cd <project-name>
```

### 2. プロジェクト名のリネーム

このテンプレートはプレースホルダ置換方式を採らず、`fullstack-worker-template` という具体名を直接埋め込んでいる（CI (`ci.yml`) がテンプレートのままでも green になるようにするため）。新規プロジェクトを始めるときは、以下の箇所を手動でプロジェクト名に置き換える:

| ファイル                       | 箇所                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `package.json`                 | `"name"`                                                         |
| `wrangler.jsonc`               | `"name"`、`d1_databases[0].database_name`                        |
| `index.html`                   | `<title>`                                                        |
| `src/front/pages/HomePage.tsx` | 画面見出し（`HomePage.test.tsx` の期待値も同時に直す）           |
| `.github/workflows/deploy.yml` | `wrangler d1 migrations apply <db-name> --remote` の `<db-name>` |

`scripts/rename-project.sh` が `package.json` / `wrangler.jsonc` / `index.html` / `.github/workflows/deploy.yml` を置き換える（`HomePage.tsx` は対象外なので手で直す）:

```bash
bash scripts/rename-project.sh <project-name>
```

スクリプトの挙動で押さえておく点が 3 つある。

- **`deploy.yml` は D1 データベース名の行だけを置換する。** `if: github.event.repository.name != 'fullstack-worker-template'` はテンプレートリポジトリ自身でデプロイを走らせないためのガードで、リネーム対象ではない。ここを一括置換すると条件が常に false になり、Secrets を設定しても deploy ジョブが一度も実行されなくなる。スクリプトは置換後にガードが原文のまま残っていることを検査し、壊れていれば非 0 で終了する
- **`compatibility_date` は更新しない。** 同梱 `workerd` が対応する上限より新しい日付にすると、`@cloudflare/vitest-plugin` を使う worker テストが `ERR_RUNTIME_FAILURE`（`This Worker requires compatibility date "..."`）で起動しなくなる。`wrangler` を上げたときに、その `workerd` が対応する範囲で手動更新する
- **`.bak` を残さない。** 置換に使った `.bak` はすべて削除し、`find` で残骸が無いことを検査してから終了する

`d1_databases[0].database_id` は `wrangler d1 create <db-name>` で発行される実際の ID に置き換える（プレースホルダ `__D1_DATABASE_ID__` のままでも `vp build` / CI は通るが、実際の `wrangler deploy` はこの ID で対象データベースを解決するため本番投入前に必須）。

### 3. 依存インストール + 動作確認

```bash
vp install --frozen-lockfile
cp .dev.vars.example .dev.vars   # ローカル用の秘密の値（git 管理外）
vp test                   # フロントエンドテスト
vp exec vitest run -c vitest.workers.config.ts   # バックエンドテスト
vp exec playwright install chromium   # 初回のみ。E2E が使うブラウザ
vp run e2e                # E2E（専用の D1 を作り直して dev サーバを起動する）
vp check                  # 型チェック + lint + フォーマット確認
vp build                  # dist/ にクライアント + Worker をビルド
vp exec wrangler d1 migrations apply DB --local   # ローカルの D1 にテーブルを作る
vp run user:create --email you@example.com --password 'twelve chars or more'
vp dev                    # http://localhost:5173 で起動、/api/health が D1 疎通を返す
```

`vp dev` の後、`/login` から作成した利用者でログインできる。確認コードのメールは実際には送られず、本文がファイルに保存される（下記「ローカルのメール」）。

### `worker-configuration.d.ts`（`Env` 型定義）について

`wrangler.jsonc` の bindings（`d1_databases` / `vars` 等）と `main` から `wrangler types` で生成される型定義。秘密情報を含まないため commit 済み。`name` など bindings/`main` 以外のフィールドを変更しても中身は変わらない。

**bindings か `main` を変更したときだけ**、`vp exec wrangler types` で再生成して commit し直す。`postinstall`（`wrangler types && vp fmt worker-configuration.d.ts --write`）でも生成されるが、`node_modules` が既にインストール済みで pnpm が再インストールをスキップした場合は走らないため過信しないこと。bindings/`main` を変更したのに再生成 + commit を忘れると、postinstall が走らなかった環境で `vp check` が型エラーで検出する。

CI は `vp install --frozen-lockfile` の postinstall で毎回再生成するため、commit 済みの内容には依存しない（`ci.yml` の実行ログで確認できる）。そのため commit 済みのファイルと CI が生成する内容は一致しないことがある。`vars` の型は生成時に `.dev.vars` でその変数が定義されているかで決まり、定義があれば `string`、無ければリテラル型（`""`）になるためである（変数ごとの判定で、キーの並び順も変わる）。`.dev.vars` にだけ書く秘密の値（`AUTH_JWT_SECRET` など）は、`.dev.vars` が無い環境では型に現れない。Worker のコードは `src/server/modules/auth/adapter/authMiddleware.ts` の `AuthBindings` で bindings を型付けしているので、生成物の差には左右されない。

すべてグリーンになればセットアップ完了。

### Git hooks（lefthook）

`vp install` で [lefthook](https://github.com/evilmartians/lefthook) が `pre-push` フックを自動設定する（`lefthook.yml`）。`git push` のたびに `vp check` と `vp build` が実行され、失敗すると push がブロックされる。手動で確認したい場合は `lefthook run pre-push`。

## ディレクトリ構成

```
src/
├── front/                  # React SPA（features/ で機能ごとにコロケーション推奨）
│   ├── components/
│   ├── lib/
│   ├── pages/
│   ├── main.tsx
│   └── routes.tsx
├── server/                 # Hono Worker（main エントリ）
│   ├── index.ts            # Worker のエントリ（createApp() を export するだけ）
│   ├── app.ts              # composition root（Hono app の組み立てと依存の注入）
│   ├── db/schema.ts        # Drizzle スキーマ（テーブル定義）
│   └── modules/            # bounded context ごとのレイヤ分離
│       ├── auth/
│       │   ├── domain/     # 依存ゼロ（フレームワークも外側レイヤも import しない）
│       │   ├── usecase/    # domain と Port を組み合わせる手順（ログイン・コード照合など）
│       │   └── adapter/    # Hono の route / middleware、D1 とメールの実装
│       └── health/
│           └── adapter/
├── shared/                 # client/server 共有の型・スキーマ（共有する型が出た時点で作る。現状は未作成）
├── test/                   # jsdom テストの setup（vite.config.ts の setupFiles が参照）
└── index.css               # Tailwind のエントリ

test/worker/                # @cloudflare/vitest-plugin によるバックエンドテスト
e2e/                        # Playwright の E2E（golden path だけを置く）
scripts/                    # rename-project.sh / create-user.ts
migrations/                 # D1 マイグレーション SQL（手書き。schema.ts と揃える）
```

bounded context は独立して変更できる機能のまとまりで、`modules/<bounded context>/`（`auth` / `health` 等）が 1 つに対応する。その下は Clean Architecture のレイヤに対応し、レイヤ方向の依存は lint で機械的に強制される（後述の「レイヤ境界の lint」。bounded context 間の依存は lint の対象外）。

`usecase/`（アプリケーションサービス）は必要になった時点で作る。1 つの adapter が単一の domain 関数を呼ぶだけなら挟まない（`modules/health/` は adapter だけを持つ）。複数の domain 関数や Port をまたぐ調整が出てきた時点で `usecase/` を作る（`modules/auth/usecase/login.ts` はパスワードの照合・ロック・確認コードの送信をまとめている）。

バックエンドのテストは `test/worker/` に置く。`vitest.workers.config.ts` の `include` が `test/worker/**/*.test.ts` 固定のため、`src/server/modules/` 配下にコロケーションすると Workers ランナーではなく jsdom 側で実行されてしまう（純関数なら通ってしまうので気付きにくい）。

## レイヤ境界の lint

`vite.config.ts` の `lint.overrides` が `no-restricted-imports` で import 方向を検査する。違反は `vp lint` / `vp check`（および pre-push フックと CI）でエラーになる。

| 対象ファイル                                                       | 禁止する import                                                                                                                                                                                                                                                                                                                                                                                                                                          | 理由                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/**/domain/**`                                                 | 外側レイヤ（`**/adapter/**`・`**/adapters/**`・`**/infrastructure/**`・`**/infra/**`・`**/presentation/**`・`**/middleware/**`・`**/routes/**`・`**/db/**`・`**/usecase/**`・`**/usecases/**`・`**/application/**`）／フレームワーク・IO ライブラリ（`hono`・`drizzle-orm`・`react`・`react-dom`・`react-router`・`swr`・`@cloudflare/*`。いずれも `hono/factory`・`swr/infinite` のようなサブパスを含む。`jose` は除く）／`**/front/**`・`**/server/**` | domain は依存ゼロの最内層。IO は関数注入（DI）で外側から受け取る   |
| `src/**/usecase/**`・`src/**/usecases/**`・`src/**/application/**` | 外側レイヤ（`**/adapter/**`・`**/adapters/**`・`**/infrastructure/**`・`**/infra/**`・`**/presentation/**`・`**/middleware/**`・`**/routes/**`・`**/db/**`）／domain 行と同じフレームワーク・IO ライブラリ／`**/front/**`・`**/server/**`                                                                                                                                                                                                                | usecase が依存してよいのは domain だけ                             |
| `src/front/**`                                                     | `**/server/**`／`react` の `useEffect`                                                                                                                                                                                                                                                                                                                                                                                                                   | front は server の実装を知らず、通信は HTTP 経由で行う             |
| `src/server/**`                                                    | `**/front/**`                                                                                                                                                                                                                                                                                                                                                                                                                                            | server は front の実装を知らない（共有する型は `src/shared` 経由） |
| `src/shared/**`                                                    | `**/front/**`・`**/server/**`／`react` の `useEffect`                                                                                                                                                                                                                                                                                                                                                                                                    | shared は front / server の両方から参照される独立層                |

glob は import 文字列に対してマッチするため、`../adapter/authRoutes` のような相対 import も捕捉される。`jose` は JWT の署名と検証を行う純計算ライブラリで IO を持たないので、domain / usecase でも使ってよい。

レイヤ境界の違反は `oxlint-disable` で回避せず、Port と DI に直す（`useEffect` 禁止と違って例外を認めない）。

### 正しい書き方（Port と DI）

domain は interface（Port）だけを持ち、IO を伴う実装は adapter に置いて `app.ts` で注入する。テンプレート内の参照実装は `src/server/modules/auth/` で、時計（`Clock`）・乱数（`Random`）・メール送信（`MailSender`）・D1 の読み書き（`UserStore` など）の Port を `domain/ports.ts` と `domain/random.ts` に置き、実装を `adapter/d1Stores.ts` と `adapter/mailSender.ts` に置いている。`app.ts` の `createApp(overrides)` は時計・乱数・メール送信を差し替える口を持ち、`test/worker/auth/helpers.ts` はそこへ進められる時計と送ったメールを記録する送信を渡す。これにより、テストは本物の D1 を使いながら 5 分・30 分・12 時間の期限を待たずに確かめられる。

D1 を使う機能も同じ形にする。テーブル定義は `db/schema.ts` に置いたまま、Repository の interface を `modules/<context>/domain/` に、Drizzle を使う実装を `modules/<context>/adapter/` に置き、`app.ts` で組み立てる。認証の `adapter/d1Stores.ts` だけは Drizzle を使わず SQL を直接書いている。D1 の `batch` は 0 行しか変えなかった文があってもロールバックしないため、後続の文を `INSERT ... SELECT ... WHERE EXISTS` で条件付けする必要があり、この形は Drizzle のクエリビルダで書けないためである。

```
src/server/
├── app.ts                                    # d1OrderRepository を組み立てて usecase / adapter に渡す
├── db/schema.ts                              # orders テーブルの定義
└── modules/order/
    ├── domain/orderRepository.ts             # interface OrderRepository（drizzle-orm を import しない）
    └── adapter/d1OrderRepository.ts          # OrderRepository の Drizzle 実装
```

### 設定を編集するときの注意

- `overrides` はルール単位で上書きされる。ある範囲に `no-restricted-imports` を設定すると、その範囲では上位の設定が効かなくなるため、各 `override` は自己完結させる（`src/front/**` と `src/shared/**` にも `useEffect` 禁止を、`src/**/domain/**`・`src/**/usecase/**` にも front / server 双方の境界を再掲している。`domain` / `usecase` は `react` 自体を禁止しているので `useEffect` の再掲は不要）
- 禁止パターンを定数変数に括り出すと `defineConfig` の型比較が深度超過してエラー（TS2321）になる。重複してもリテラルで書く

## フロント/バックエンドのテストを分けている理由

`@cloudflare/vite-plugin`（Worker 用の Vite environment）と Vitest の jsdom environment は同一 `vite.config.ts` 内で共存できない（`resolve.external` の Node 組み込みモジュール一覧が Worker environment の検証に引っかかる）。そのため `vite.config.ts` は `process.env.VITEST` が立っているときだけ `cloudflare()` プラグインを無効化し、バックエンドの Workers テストは `vitest.workers.config.ts`（`@cloudflare/vitest-plugin` の `cloudflareTest` プラグインを使用）という別ファイルに分離している。

### Vitest のバージョン（catalog）

`vp test` は `vite-plus` に同梱された Vitest（`vp --version` の `vitest` 行）で動き、`vp exec vitest` は `package.json` の `vitest`（`pnpm-workspace.yaml` の `catalog` の版）で動く。2 つのランナーが同じ Vitest で動くのは、この 2 つのバージョンが一致しているときだけである。そのため catalog の `vitest` には同梱版と同じバージョンを完全一致で書く。ずれると node_modules に Vitest が 2 本入る。そうなると `src/test/setup.ts` が読み込む jest-dom の型拡張が片方の Vitest にしか当たらず、`vite-plus/test` から import するテストで `vp check` が TS2339（`toBeInTheDocument` などが存在しない）を出す。

`vite-plus` を上げるときは、catalog の `vite` / `vite-plus` と同時に `vitest` も同梱版へ書き換え、`pnpm-lock.yaml` の `vitest@` が 1 バージョンだけであることを確認する。

## 認証

ログインは Worker 内の自前実装で、外部の IdP を使わない。メールアドレスとパスワードが合うと登録メールに 6 桁の確認コードを送り、コードを入力した時点でログインが完了する（二段階認証は全員・毎回必須）。自己サインアップは無く、利用者は `scripts/create-user.ts` で作る。

### 流れと API

1. `/login` でメールアドレスとパスワードを送る（`POST /api/auth/login`）。合えば確認コードをメールで送り、コード入力待ちの要求（challenge）を表すトークンを返す
2. `/login/otp` でコードを送る（`POST /api/auth/otp/verify`）。合えばセッショントークン（HS256 の JWT）を返し、画面は `localStorage` の `auth.token` に保存して `/mypage` へ進む
3. 以後の API は `Authorization: Bearer <token>` で呼ぶ。Worker は JWT の署名と期限に加え、D1 の `auth_sessions` の行と `users.auth_generation` を毎回照合する

| Method | Path                                | 認証           | 主な応答                                                                                                                                                                                               |
| ------ | ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/auth/login`                   | なし           | 202 `{status:"otp_required", challengeToken, challengeExpiresAt, codeExpiresAt, resendAvailableAt, emailHint}` / 401 `AUTH_FAILED` / 429 `OTP_LOCKED`・`OTP_SEND_RATE_LIMITED` / 503 `OTP_SEND_FAILED` |
| POST   | `/api/auth/otp/verify`              | challenge      | 200 `{token}` / 422 `OTP_INVALID`・`OTP_EXPIRED` / 401 `OTP_CHALLENGE_INVALID` / 429 `OTP_LOCKED`                                                                                                      |
| POST   | `/api/auth/otp/resend`              | challenge      | 200 `{challengeExpiresAt, codeExpiresAt, resendAvailableAt}` / 401 `OTP_CHALLENGE_INVALID` / 429 `OTP_LOCKED`・`OTP_SEND_RATE_LIMITED` / 503 `OTP_SEND_FAILED`                                         |
| DELETE | `/api/auth/otp/challenge`           | challenge      | 204（トークンが合わなくても 204）                                                                                                                                                                      |
| POST   | `/api/auth/logout`                  | Bearer         | 204。そのセッションだけを失効させる                                                                                                                                                                    |
| POST   | `/api/auth/logout-all`              | Bearer         | 204。`auth_generation` を進め、その利用者の全セッションを失効させる                                                                                                                                    |
| POST   | `/api/auth/password-reset/request`  | なし           | 常に 202。照合と送信は応答の後（`waitUntil`）に行う                                                                                                                                                    |
| POST   | `/api/auth/password-reset/complete` | 再設定トークン | 204 / 422 `PASSWORD_RESET_LINK_INVALID`・`VALIDATION_FAILED`                                                                                                                                           |
| GET    | `/api/me`                           | Bearer         | 200 `{id, email}` / 401 `UNAUTHORIZED`                                                                                                                                                                 |

エラーの本文は `{error:{code, message, retryAt?}}` で、429 には `Retry-After`（秒）が付く。本文の形が違う要求は 422 `VALIDATION_FAILED` を返す。`/api/auth/*` の応答は `Cache-Control: no-store` で、GET 以外は `Origin` が要求先の origin と完全一致しなければ 403 `FORBIDDEN` を返す（ログインと再設定はトークンを持たずに呼べるため、別サイトからの送信を拒否する）。

### 守りの値

値は `src/server/modules/auth/domain/authPolicy.ts` と `passwordPolicy.ts` が正本。

| 項目             | 値                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| パスワードの保存 | `AUTH_PASSWORD_PEPPER` で HMAC-SHA256 → PBKDF2-SHA256 100,000 回（workerd の上限）/ salt 16 byte。保存形式は `pbkdf2-sha256$<回数>$<salt>$<hash>`                                                    |
| パスワードの規則 | 12〜128 文字（コードポイント数）。文字種は問わない                                                                                                                                                   |
| ログインのロック | 10 回続けて失敗すると 15 分。ロック中は正しいパスワードでも 401 `AUTH_FAILED` で、未登録・誤りと区別しない（応答時間も揃えるため、未登録とロック中もダミーの保存値と照合する）                       |
| 確認コード       | 6 桁 / 有効 5 分 / 再送は 60 秒に 1 回 / 5 回誤ると 15 分ロックし、入力待ちの challenge をすべて失効させる                                                                                           |
| challenge        | 有効 30 分。1 回使うと使えない                                                                                                                                                                       |
| セッション       | 12 時間で切れる（延長しない）                                                                                                                                                                        |
| 再設定リンク     | 有効 30 分 / 申し込みは 60 秒に 1 回 / 新しいリンクを作ると古いリンクは使えない。完了すると `auth_generation` を進め、既存のセッションと入力途中のログインを使えなくする（自動ではログインさせない） |

challenge・確認コード・再設定トークンは平文で保存せず、`AUTH_OTP_SECRET` の HMAC だけを D1 に置く。再設定リンクのトークンは URL の `#` 以降に置き（`/password-reset/confirm#token=...`）、サーバのアクセスログと `Referer` に残らないようにしている。

### 秘密の値と設定

| 名前                   | 置き場所                                                      | 用途                                                       | 変えたときに起きること                                             |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `AUTH_JWT_SECRET`      | `.dev.vars` / `wrangler secret put`                           | セッショントークンの署名                                   | 発行済みのセッションがすべて無効になる（漏洩時の一斉失効に使える） |
| `AUTH_PASSWORD_PEPPER` | `.dev.vars` / `wrangler secret put`                           | パスワードのハッシュ                                       | 保存済みのパスワードがすべて照合できなくなる。運用開始後は変えない |
| `AUTH_OTP_SECRET`      | `.dev.vars` / `wrangler secret put`                           | challenge・確認コード・再設定トークンの HMAC               | 入力途中のログインと未使用の再設定リンクが使えなくなる             |
| `PUBLIC_BASE_URL`      | `wrangler.jsonc` の `vars`（ローカルは `.dev.vars` で上書き） | 再設定リンクの URL の起点（例: `https://app.example.com`） | メールのリンクの行き先が変わる                                     |
| `MAIL_FROM`            | `wrangler.jsonc` の `vars`（ローカルは `.dev.vars` で上書き） | メールの差出人                                             | —                                                                  |
| `EMAIL`                | `wrangler.jsonc` の `send_email`                              | Cloudflare Email Service の送信 binding                    | —                                                                  |

どれかが空だと、認証の API は 500 を返す（`src/server/app.ts` の `required`）。

### ローカルのメール

`vp dev` と E2E の dev サーバでは、`send_email` binding が実際には送らず、1 通ごとに本文を `.wrangler/tmp/email/miniflare-*/email-text/<uuid>.txt` に保存する。ターミナルには From / To / Subject と保存先のパスが出る。

```bash
cat "$(ls -t .wrangler/tmp/email/miniflare-*/email-text/*.txt | head -1)"   # 最新のメール
```

### 本番に出すとき

1. 送信元のドメインを Cloudflare Email Service に登録する（`wrangler email sending enable <ドメイン>`。DNS レコードが追加される）。`MAIL_FROM` はそのドメインのアドレスにする
2. `wrangler.jsonc` の `vars` に `PUBLIC_BASE_URL` と `MAIL_FROM` を書く
3. 秘密の値を入れる。値は `openssl rand -base64 32` などで作り、`.dev.vars.example` の値を使い回さない

   ```bash
   vp exec wrangler secret put AUTH_JWT_SECRET
   vp exec wrangler secret put AUTH_PASSWORD_PEPPER
   vp exec wrangler secret put AUTH_OTP_SECRET
   ```

4. デプロイ（`deploy.yml` がリモートの D1 にマイグレーションを当てる）の後、最初の利用者を作る。本番の pepper は環境変数で渡す（`--remote` のときは `.dev.vars` を読まない）

   ```bash
   AUTH_PASSWORD_PEPPER='<本番の値>' vp run user:create --email you@example.com --password '...' --remote
   ```

### 既知の制限

- 期限切れ・失効済みのセッション・challenge・再設定リンクの行を消す処理は無く、行は溜まり続ける。必要なら Cron Triggers で消す
- 送信元 IP 単位のレート制限は持たない（ロックはアカウント単位）。IP 単位の制限は Cloudflare の WAF で掛ける
- セッショントークンは `localStorage` に置くため、XSS があれば読まれる。`dangerouslySetInnerHTML` などで外部の文字列を HTML として描画しない
- パスワードを変えたことを知らせるメールは送らない
- ログイン中にパスワードを変える画面は無い（再設定リンクで変える）

### 認証が不要な場合

このプロジェクトで認証を使わないなら、以下を削除する:

- `src/server/modules/auth/`（`src/server/app.ts` の `createAuthRoutes` の登録と `resolveAuthDeps`、`Bindings` の認証の項目も削除）
- `migrations/0001_auth.sql` と `src/server/db/schema.ts` の `users` / `auth_*` テーブル（まだリモートに当てていない場合。当てた後なら、テーブルを消す新しいマイグレーションを足す）
- `test/worker/auth/`
- `src/front/lib/authClient.ts`（+test）/ `src/front/lib/authClientContext.tsx` / `src/front/test/` / `src/front/components/AuthLayout.tsx` / `src/front/components/RequireAuth.tsx`（+test）/ `src/front/pages/` の `LoginPage` `OtpPage` `PasswordResetPage` `PasswordResetConfirmPage` `MyPage`（各 +test）/ `src/front/routes.test.tsx`（`routes.tsx` の該当ルートと `main.tsx` の `AuthClientProvider` も削除）
- `e2e/login.spec.ts` / `e2e/passwordReset.spec.ts` / `e2e/flows.ts` / `e2e/mail.ts` / `e2e/users.ts`（E2E 自体が要らなければ `e2e/` / `playwright.config.ts` / `ci.yml` の `e2e` ジョブ / `@playwright/test` も削除）
- `scripts/create-user.ts` と `package.json` の `user:create`
- `wrangler.jsonc` の `send_email` と `vars`（`PUBLIC_BASE_URL` / `MAIL_FROM`）、`.dev.vars.example` の認証の値、`vitest.workers.config.ts` と `test/worker/env.d.ts` の認証の bindings
- `package.json` の `jose` 依存

bindings を消したら `vp exec wrangler types` で `worker-configuration.d.ts` を再生成して commit し直す。削除後は次のコマンドが全て通ることを確認する:

```bash
vp check
vp test
vp exec vitest run -c vitest.workers.config.ts
vp build
```

## E2E テスト

`vp run e2e` は Playwright で `e2e/*.spec.ts` を実行する。`playwright.config.ts` の `webServer` が `e2e/start-server.sh` を起動し、このスクリプトが E2E 専用の D1（`.wrangler/e2e-state`）を作り直してマイグレーションを当て、`e2e/users.ts` の利用者を作ってから `vp dev --port 5273` を起動する。開発用の D1（`.wrangler/state`）には触れない（`vite.config.ts` が `WRANGLER_PERSIST_TO` で永続化先を切り替える）。

確認コードと再設定リンクは、`e2e/mail.ts` が操作の前後でメールのファイルの差分を取って読む。保存されるファイルに宛先が書かれないため、E2E は 1 worker で直列に流す。再設定リンクの URL は `PUBLIC_BASE_URL`（5173）で作られるので、パスと `#` 以降だけを使う。

E2E は golden path（ログイン → コード → マイページ → ログアウト、パスワード再設定 → 新しいパスワードでログイン）だけを置く。期限・ロック・失効などの境界は `test/worker/auth/` が時計を進めて確かめ、画面の文言は各画面の単体テストが確かめる。

## このテンプレート自体の CI/CD について

`ci.yml`（`ci` ジョブが install → test → check → build、`e2e` ジョブが Playwright の E2E）はこのテンプレートリポジトリ自身でも green になる。`deploy.yml` はリポジトリ名ガード（`if: github.event.repository.name != 'fullstack-worker-template'`）により skip される（Secrets 未設定でもジョブは失敗しない。テンプレは実運用のデプロイ対象ではない）。新規プロジェクトでは上記「2. プロジェクト名のリネーム」を実施し（`deploy.yml` のリポジトリ名ガードの削除を含む）、Secrets を設定すればデプロイが実行される。

## 各プロジェクト側で追加する設定（テンプレートには含まれない）

- R2 バインディング・Cron Triggers（`wrangler.jsonc` にプロジェクトごとの要件に応じて追記。期限切れの認証の行を消す定期処理もここで足す）
- ドメイン固有のスキーマ・API・UI
