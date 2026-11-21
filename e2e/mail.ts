import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";

/** ローカルの send_email binding は送ったメールの本文を、1 通ずつこの下のファイルに書く。 */
const MAIL_ROOT = ".wrangler/tmp/email";

function listMailFiles(): string[] {
  let dirs: string[];
  try {
    dirs = readdirSync(MAIL_ROOT).filter((name) => name.startsWith("miniflare-"));
  } catch {
    return [];
  }
  return dirs.flatMap((dir) => {
    const textDir = path.join(MAIL_ROOT, dir, "email-text");
    try {
      return readdirSync(textDir).map((file) => path.join(textDir, file));
    } catch {
      return [];
    }
  });
}

/** 操作の前に呼び、その後に届いたメールだけを `nextMail` で取り出せるようにする。 */
export function snapshotMails(): Set<string> {
  return new Set(listMailFiles());
}

export async function nextMail(before: Set<string>): Promise<string> {
  let found: string[] = [];
  await expect
    .poll(() => {
      found = listMailFiles().filter((file) => !before.has(file));
      return found.length;
    })
    .toBe(1);
  const [file] = found.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  return readFileSync(file!, "utf8");
}

export function codeFrom(mail: string): string {
  const code = /\b(\d{6})\b/.exec(mail)?.[1];
  if (code === undefined) throw new Error(`確認コードがありません: ${mail}`);
  return code;
}

/** リンクの URL は PUBLIC_BASE_URL (E2E とは別のポート) で作られるので、パスと # 以降だけを使う。 */
export function resetPathFrom(mail: string): string {
  const url = /(https?:\/\/\S+\/password-reset\/confirm#token=\S+)/.exec(mail)?.[1];
  if (url === undefined) throw new Error(`再設定リンクがありません: ${mail}`);
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.hash}`;
}
