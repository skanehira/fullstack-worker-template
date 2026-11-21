export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * 文字種の組み合わせは強制せず長さだけで判定する (NIST SP 800-63B)。長さは UTF-16 の単位ではなく
 * コードポイントで数え、絵文字 1 文字を 2 文字と数えない。
 */
export function isAcceptablePassword(password: string): boolean {
  const length = Array.from(password).length;
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}
