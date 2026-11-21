import { fromHex, toHex } from "./encoding";

async function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signHmac(message: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret, "sign"),
    new TextEncoder().encode(message),
  );
  return toHex(new Uint8Array(signature));
}

/** `crypto.subtle.verify` で比べるので、一致した接頭辞の長さが応答時間に出ない。 */
export async function verifyHmac(message: string, hash: string, secret: string): Promise<boolean> {
  const signature = fromHex(hash);
  if (signature === null) return false;
  return await crypto.subtle.verify(
    "HMAC",
    await importKey(secret, "verify"),
    signature,
    new TextEncoder().encode(message),
  );
}
