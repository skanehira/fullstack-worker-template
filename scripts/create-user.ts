// 利用者を 1 人作る。自己サインアップを持たないため、最初の利用者はこのスクリプトで作る。
//
//   vp run user:create -- --email you@example.com --password 'twelve chars or more'
//   vp run user:create -- --email you@example.com --password '...' --remote   # 本番の D1
//
// パスワードは AUTH_PASSWORD_PEPPER でハッシュする。環境変数に無ければ .dev.vars から読む
// (--remote では読まない。本番の pepper を環境変数で渡す)。
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ulid } from "ulid";
import { hashPassword } from "../src/server/modules/auth/domain/passwordHash.ts";
import { isAcceptablePassword } from "../src/server/modules/auth/domain/passwordPolicy.ts";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    remote: { type: "boolean", default: false },
    "persist-to": { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function pepperFromDevVars(): string | undefined {
  try {
    const line = readFileSync(".dev.vars", "utf8")
      .split("\n")
      .find((entry) => entry.startsWith("AUTH_PASSWORD_PEPPER="));
    return line?.slice("AUTH_PASSWORD_PEPPER=".length).trim();
  } catch {
    return undefined;
  }
}

const email = values.email?.trim().toLowerCase();
const password = values.password;
if (email === undefined || !/^[^\s@']+@[^\s@']+$/.test(email)) {
  fail("--email にメールアドレスを指定してください");
}
if (password === undefined || !isAcceptablePassword(password)) {
  fail("--password に 12〜128 文字のパスワードを指定してください");
}
const pepper =
  process.env.AUTH_PASSWORD_PEPPER ?? (values.remote ? undefined : pepperFromDevVars());
if (pepper === undefined || pepper === "") {
  fail("AUTH_PASSWORD_PEPPER を環境変数か .dev.vars で設定してください");
}

const passwordHash = await hashPassword(password, pepper, (length) =>
  crypto.getRandomValues(new Uint8Array(length)),
);
// email は上の検査で ' を含まない。ハッシュは英数字と + / = $ だけで構成される。
const sql =
  "INSERT INTO users (id, email, password_hash, created_at) VALUES " +
  `('${ulid()}', '${email}', '${passwordHash}', '${new Date().toISOString()}');`;

const args = ["d1", "execute", "DB", values.remote ? "--remote" : "--local", "--command", sql];
if (values["persist-to"] !== undefined) args.push("--persist-to", values["persist-to"]);
const result = spawnSync("wrangler", args, { stdio: "inherit" });
if (result.status !== 0)
  fail("利用者を作れませんでした (同じメールアドレスが既にあるかもしれません)");
console.log(`created: ${email}`);
