import type { RandomBytes } from "./random";

/**
 * 保存値は `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`。反復回数を値に埋め込むので、
 * 将来回数を変えても既存の保存値はその回数のまま検証できる。
 *
 * パスワードは pepper (`AUTH_PASSWORD_PEPPER`) で HMAC してから PBKDF2 に掛ける。pepper は
 * D1 に入らないため、DB だけが漏れても総当たりの足がかりにならない。
 *
 * `scripts/create-user.ts` が Node から直接 import するため、実行時の相対 import を持たない
 * (Node は拡張子なしの import を解決しない)。base64 と比較の補助を encoding.ts から借りないのはこのため。
 */

const ALGORITHM = "pbkdf2-sha256";

/** OWASP 推奨の 600,000 回ではなく 100,000 回: workerd の PBKDF2 は 100,000 回を上限として拒否する。 */
export const PASSWORD_HASH_ITERATIONS = 100_000;

const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

/**
 * 未登録のメールアドレスでも照合を 1 回走らせるための保存値。これが無いと未登録の応答だけが速く返り、
 * 応答時間から登録の有無が分かる。どのパスワードとも一致しない。
 */
export const DUMMY_PASSWORD_HASH =
  "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function hashPassword(
  password: string,
  pepper: string,
  randomBytes: RandomBytes,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveKey(password, pepper, salt, PASSWORD_HASH_ITERATIONS);
  return [ALGORITHM, String(PASSWORD_HASH_ITERATIONS), toBase64(salt), toBase64(hash)].join("$");
}

/** 形式が壊れた保存値は例外にせず false を返す (呼び出し側は認証失敗として一律に扱う)。 */
export async function verifyPassword(
  password: string,
  stored: string,
  pepper: string,
): Promise<boolean> {
  const parsed = parseStored(stored);
  if (parsed === null) return false;
  const hash = await deriveKey(password, pepper, parsed.salt, parsed.iterations);
  return equalsInConstantTime(hash, parsed.hash);
}

function parseStored(
  stored: string,
): { iterations: number; salt: Uint8Array; hash: Uint8Array } | null {
  const parts = stored.split("$");
  if (parts.length !== 4) return null;
  const [algorithm, rawIterations = "", rawSalt = "", rawHash = ""] = parts;
  if (algorithm !== ALGORITHM || !/^\d+$/.test(rawIterations)) return null;
  const iterations = Number(rawIterations);
  if (iterations < 1 || iterations > PASSWORD_HASH_ITERATIONS) return null;
  const salt = fromBase64(rawSalt);
  const hash = fromBase64(rawHash);
  if (salt === null || hash === null) return null;
  return { iterations, salt, hash };
}

async function deriveKey(
  password: string,
  pepper: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const pepperKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const peppered = await crypto.subtle.sign("HMAC", pepperKey, new TextEncoder().encode(password));
  const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    DERIVED_KEY_BITS,
  );
  return new Uint8Array(bits);
}

function equalsInConstantTime(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
