import { fromBase64Url, toBase64Url } from "./encoding";
import { signHmac, verifyHmac } from "./hmac";
import type { RandomBytes } from "./random";

/**
 * challenge と再設定リンクに使う `<ULID>.<256bit 乱数の base64url>` のトークン。DB には
 * `AUTH_OTP_SECRET` による HMAC だけを保存し、DB が漏れてもトークンを再現できないようにする。
 * 用途をメッセージに含めるので、ある用途のトークンを別の用途の照合に通せない。
 */

export type TokenPurpose = "challenge" | "password_reset";
export type ParsedToken = { id: string; secret: string };

const SECRET_BYTES = 32;
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const message = (purpose: TokenPurpose, token: ParsedToken) =>
  JSON.stringify([`${purpose}.v1`, token.id, token.secret]);

export async function createOpaqueToken(
  id: string,
  purpose: TokenPurpose,
  hmacSecret: string,
  randomBytes: RandomBytes,
): Promise<{ token: string; tokenHash: string }> {
  const secret = toBase64Url(randomBytes(SECRET_BYTES));
  return {
    token: `${id}.${secret}`,
    tokenHash: await signHmac(message(purpose, { id, secret }), hmacSecret),
  };
}

export function parseOpaqueToken(token: string): ParsedToken | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [id = "", secret = ""] = parts;
  if (!ULID.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  const bytes = fromBase64Url(secret);
  if (bytes === null || bytes.length !== SECRET_BYTES || toBase64Url(bytes) !== secret) return null;
  return { id, secret };
}

export async function matchesOpaqueToken(
  token: ParsedToken,
  purpose: TokenPurpose,
  tokenHash: string,
  hmacSecret: string,
): Promise<boolean> {
  return await verifyHmac(message(purpose, token), tokenHash, hmacSecret);
}
