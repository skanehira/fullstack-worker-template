import { vi } from "vite-plus/test";
import { AuthApiError, type AuthClient, type PendingChallenge } from "../lib/authClient";

export const FAKE_PENDING: PendingChallenge = {
  challengeToken: "01JCHALLENGE.secret",
  challengeExpiresAt: "2026-01-01T00:30:00.000Z",
  codeExpiresAt: "2026-01-01T00:05:00.000Z",
  resendAvailableAt: "2026-01-01T00:01:00.000Z",
  emailHint: "u***@example.com",
};

export const FAKE_ME = { id: "01JUSER", email: "user@example.com" };

export function createFakeAuthClient(
  initial: { token?: string | null; pending?: PendingChallenge | null } = {},
) {
  let token = initial.token ?? null;
  let pending = initial.pending ?? null;
  const client = {
    getToken: () => token,
    getPendingChallenge: () => pending,
    login: vi.fn(async () => {
      pending = FAKE_PENDING;
    }),
    verifyOtp: vi.fn(async () => {
      token = "fake-session-token";
      pending = null;
    }),
    resendOtp: vi.fn(async () => undefined),
    cancelOtp: vi.fn(async () => {
      pending = null;
    }),
    getMe: vi.fn(async () => {
      if (token === null) throw new AuthApiError(401, "UNAUTHORIZED", "認証が必要です");
      return FAKE_ME;
    }),
    logout: vi.fn(async () => {
      token = null;
    }),
    logoutAll: vi.fn(async () => {
      token = null;
    }),
    requestPasswordReset: vi.fn(async () => undefined),
    completePasswordReset: vi.fn(async () => undefined),
  } satisfies AuthClient;
  return client;
}
