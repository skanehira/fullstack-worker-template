import { verifySessionToken } from "../domain/sessionToken";
import type { AuthDeps } from "./deps";

export type AuthenticatedUser = { id: string; email: string; sid: string; authGeneration: number };

/** JWT の署名と期限に加え、D1 のセッションと認証世代を照合する。どれかが合わなければ null。 */
export async function authenticateSession(
  deps: Pick<AuthDeps, "sessions" | "clock" | "secrets">,
  token: string,
): Promise<AuthenticatedUser | null> {
  const nowMs = deps.clock();
  const subject = await verifySessionToken(token, { secret: deps.secrets.jwtSecret, nowMs });
  if (subject === null) return null;
  const user = await deps.sessions.findActive({
    sid: subject.sid,
    userId: subject.userId,
    authGeneration: subject.authGeneration,
    nowIso: new Date(nowMs).toISOString(),
  });
  if (user === null) return null;
  return { ...user, sid: subject.sid, authGeneration: subject.authGeneration };
}

export async function logout(
  deps: Pick<AuthDeps, "sessions" | "clock">,
  user: AuthenticatedUser,
): Promise<void> {
  await deps.sessions.revoke({
    sid: user.sid,
    userId: user.id,
    nowIso: new Date(deps.clock()).toISOString(),
  });
}

export async function logoutAll(
  deps: Pick<AuthDeps, "sessions">,
  user: AuthenticatedUser,
): Promise<void> {
  await deps.sessions.revokeAll({ userId: user.id, authGeneration: user.authGeneration });
}
