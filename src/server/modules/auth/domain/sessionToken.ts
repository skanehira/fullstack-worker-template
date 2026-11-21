import { SignJWT, jwtVerify } from "jose";
import { SESSION_TTL_MS } from "./authPolicy";

/**
 * セッショントークンは HS256 の JWT。載せるのは利用者 ID・セッション ID (`sid`)・認証世代
 * (`auth_generation`) だけで、毎リクエスト D1 の行と照合して失効を反映する。検証者が Worker 自身
 * だけなので非対称鍵にはしない。`AUTH_JWT_SECRET` を差し替えると発行済みトークンが一斉に無効になる。
 */

const ISSUER = "app-session";

export type SessionTokenSubject = {
  userId: string;
  sid: string;
  authGeneration: number;
  expiresAt: string;
};

export async function signSessionToken(input: {
  userId: string;
  sid: string;
  authGeneration: number;
  secret: string;
  nowMs: number;
}): Promise<string> {
  const issuedAt = Math.floor(input.nowMs / 1000);
  return await new SignJWT({ sid: input.sid, auth_generation: input.authGeneration })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(input.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_MS / 1000)
    .sign(new TextEncoder().encode(input.secret));
}

/** 失敗の理由は区別せず null を返す (呼び出し側は理由に依らず 401 を返す)。 */
export async function verifySessionToken(
  token: string,
  options: { secret: string; nowMs: number },
): Promise<SessionTokenSubject | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(options.secret), {
      issuer: ISSUER,
      algorithms: ["HS256"],
      currentDate: new Date(options.nowMs),
    });
    const generation = payload.auth_generation;
    if (
      typeof payload.sub !== "string" ||
      payload.sub === "" ||
      typeof payload.sid !== "string" ||
      payload.sid === "" ||
      typeof generation !== "number" ||
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      sid: payload.sid,
      authGeneration: generation,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}
