import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { AuthApiError, errorMessage } from "../lib/authClient";
import { useMe } from "../lib/authClientContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, data, error } = useMe();

  if (token === null) return <Navigate to="/login" replace />;
  if (error instanceof AuthApiError && error.status === 401) {
    return <Navigate to="/login" replace />;
  }
  // 401 以外 (通信の失敗・500) で /login へ送ると、token が残ったままログインし直させ、
  // 確認コードのメールを無駄に送らせることになる。
  if (error !== undefined) return <p role="alert">{errorMessage(error)}</p>;
  if (data === undefined) return null;
  return children;
}
