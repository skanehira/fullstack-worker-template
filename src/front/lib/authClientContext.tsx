import { createContext, useContext, type ReactNode } from "react";
import useSWR from "swr";
import type { AuthClient } from "./authClient";

const AuthClientContext = createContext<AuthClient | null>(null);

export function AuthClientProvider({
  client,
  children,
}: {
  client: AuthClient;
  children: ReactNode;
}) {
  return <AuthClientContext value={client}>{children}</AuthClientContext>;
}

export function useAuthClient(): AuthClient {
  const client = useContext(AuthClientContext);
  if (client === null) throw new Error("AuthClientProvider の内側で使う");
  return client;
}

/**
 * ログイン中の利用者。キーに token を含めるので、別の利用者でログインし直すと前の利用者の
 * キャッシュを使わない。
 */
export function useMe() {
  const client = useAuthClient();
  const token = client.getToken();
  const result = useSWR(token === null ? null : ["/api/me", token], () => client.getMe());
  return { token, ...result };
}
