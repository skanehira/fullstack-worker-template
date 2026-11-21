import { signHmac, verifyHmac } from "./hmac";
import type { RandomUint32 } from "./random";

type OtpBinding = { userId: string; challengeId: string };

/** 1,000,000 の倍数のうち uint32 に収まる最大値。これ以上を引き直して剰余の偏りを消す。 */
const UINT32_REJECTION_BOUNDARY = 4_294_000_000;

export function generateOtpCode(uint32: RandomUint32): string {
  let value: number;
  do {
    value = uint32();
  } while (value >= UINT32_REJECTION_BOUNDARY);
  return String(value % 1_000_000).padStart(6, "0");
}

/** 利用者と challenge をメッセージに含め、あるログイン要求に送ったコードを別の要求で使えなくする。 */
const message = (input: OtpBinding & { code: string }) =>
  JSON.stringify(["otp.v1", input.userId, input.challengeId, input.code]);

export async function hashOtpCode(
  input: OtpBinding & { code: string },
  secret: string,
): Promise<string> {
  return await signHmac(message(input), secret);
}

export async function matchesOtpCode(
  input: OtpBinding & { code: unknown },
  codeHash: string,
  secret: string,
): Promise<boolean> {
  if (typeof input.code !== "string" || !/^[0-9]{6}$/.test(input.code)) return false;
  return await verifyHmac(message({ ...input, code: input.code }), codeHash, secret);
}

/** コードの送り先を画面で示すための伏せ字。パスワードが正しいと分かった後にだけ返す。 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
