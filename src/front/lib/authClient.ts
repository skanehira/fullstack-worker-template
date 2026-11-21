export type PendingChallenge = {
  challengeToken: string;
  challengeExpiresAt: string;
  codeExpiresAt: string;
  resendAvailableAt: string;
  emailHint: string;
};

export type Me = { id: string; email: string };

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAt: string | undefined;

  constructor(status: number, code: string, message: string, retryAt?: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

export type AuthClient = {
  getToken: () => string | null;
  getPendingChallenge: () => PendingChallenge | null;
  login: (email: string, password: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  cancelOtp: () => Promise<void>;
  getMe: () => Promise<Me>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (token: string, password: string) => Promise<void>;
};

type Deps = { fetch: typeof fetch; local: Storage; session: Storage };

const TOKEN_KEY = "auth.token";
/** コード入力中の challenge はタブを閉じれば要らないので sessionStorage に置く。 */
const PENDING_KEY = "auth.pending";

const NETWORK_ERROR = new AuthApiError(
  0,
  "NETWORK_ERROR",
  "通信に失敗しました。時間をおいてやり直してください",
);

export function createAuthClient({ fetch, local, session }: Deps): AuthClient {
  const getToken = () => local.getItem(TOKEN_KEY);
  const clearToken = () => local.removeItem(TOKEN_KEY);
  const getPendingChallenge = (): PendingChallenge | null => {
    const raw = session.getItem(PENDING_KEY);
    return raw === null ? null : (JSON.parse(raw) as PendingChallenge);
  };
  const savePending = (pending: PendingChallenge) =>
    session.setItem(PENDING_KEY, JSON.stringify(pending));
  const clearPending = () => session.removeItem(PENDING_KEY);

  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    options: { body?: unknown; token?: string | null } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const response = await fetch(`/api${path}`, init).catch(() => {
      throw NETWORK_ERROR;
    });
    if (response.ok) {
      const isJson = response.headers.get("Content-Type")?.includes("application/json") ?? false;
      return (isJson ? await response.json() : undefined) as T;
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { code: string; message: string; retryAt?: string };
    } | null;
    const error = body?.error;
    if (options.token && response.status === 401) clearToken();
    if (error === undefined) {
      throw new AuthApiError(
        response.status,
        "UNKNOWN",
        "処理に失敗しました。時間をおいてやり直してください",
      );
    }
    throw new AuthApiError(response.status, error.code, error.message, error.retryAt);
  }

  /** challenge を使う要求。challenge が無効と分かったら捨て、画面がログインからやり直せるようにする。 */
  async function withChallenge<T>(send: (challengeToken: string) => Promise<T>): Promise<T> {
    const pending = getPendingChallenge();
    if (pending === null) {
      throw new AuthApiError(401, "OTP_CHALLENGE_INVALID", "ログインをやり直してください");
    }
    try {
      return await send(pending.challengeToken);
    } catch (error) {
      if (error instanceof AuthApiError && error.code === "OTP_CHALLENGE_INVALID") clearPending();
      throw error;
    }
  }

  return {
    getToken,
    getPendingChallenge,
    login: async (email, password) => {
      const { status: _status, ...pending } = await request<PendingChallenge & { status: string }>(
        "POST",
        "/auth/login",
        { body: { email, password } },
      );
      savePending(pending);
    },
    verifyOtp: async (code) => {
      const { token } = await withChallenge((challengeToken) =>
        request<{ token: string }>("POST", "/auth/otp/verify", { body: { challengeToken, code } }),
      );
      local.setItem(TOKEN_KEY, token);
      clearPending();
    },
    resendOtp: async () => {
      const pending = getPendingChallenge();
      const times = await withChallenge((challengeToken) =>
        request<Omit<PendingChallenge, "challengeToken" | "emailHint">>(
          "POST",
          "/auth/otp/resend",
          {
            body: { challengeToken },
          },
        ),
      );
      if (pending !== null) savePending({ ...pending, ...times });
    },
    cancelOtp: async () => {
      const pending = getPendingChallenge();
      clearPending();
      if (pending !== null) {
        await request("DELETE", "/auth/otp/challenge", {
          body: { challengeToken: pending.challengeToken },
        });
      }
    },
    getMe: async () => await request<Me>("GET", "/me", { token: getToken() }),
    logout: async () => {
      const token = getToken();
      clearToken();
      await request("POST", "/auth/logout", { token });
    },
    logoutAll: async () => {
      const token = getToken();
      clearToken();
      await request("POST", "/auth/logout-all", { token });
    },
    requestPasswordReset: async (email) => {
      await request("POST", "/auth/password-reset/request", { body: { email } });
    },
    completePasswordReset: async (token, password) => {
      await request("POST", "/auth/password-reset/complete", { body: { token, password } });
    },
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof AuthApiError
    ? error.message
    : "処理に失敗しました。時間をおいてやり直してください";
}
