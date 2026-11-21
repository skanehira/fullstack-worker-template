import { useState } from "react";
import { Link, useLocation } from "react-router";
import { AuthLayout, inputClass, primaryButtonClass } from "../components/AuthLayout";
import { errorMessage } from "../lib/authClient";
import { useAuthClient } from "../lib/authClientContext";

function tokenFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, "")).get("token");
}

/**
 * アドレスバーと履歴から token を消す。useEffect ではなく form の ref で行う:
 * ref は DOM に付いた時点で 1 度呼ばれ、描画のやり直しでは呼ばれない。
 */
function stripTokenFromUrl(form: HTMLFormElement | null) {
  if (form === null || !window.location.hash.includes("token=")) return;
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
}

export function PasswordResetConfirmPage() {
  const client = useAuthClient();
  const location = useLocation();
  // URL から消すのは window.history の書き換えで、router の location には hash が残る。
  const token = tokenFromHash(location.hash);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (token === null) {
    return (
      <AuthLayout title="パスワードの再設定">
        <p role="alert">再設定のリンクが正しくありません。もう一度申し込んでください。</p>
        <Link to="/password-reset" className="text-sm underline">
          再設定を申し込む
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="パスワードの再設定">
        <p role="status">パスワードを変更しました。新しいパスワードでログインしてください。</p>
        <Link to="/login" className="text-sm underline">
          ログイン画面へ
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="パスワードの再設定">
      <form
        ref={stripTokenFromUrl}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSubmitting(true);
          client
            .completePasswordReset(token, password)
            .then(() => setDone(true))
            .catch((e: unknown) => setError(errorMessage(e)))
            .finally(() => setSubmitting(false));
        }}
      >
        <label className="flex flex-col gap-1">
          新しいパスワード
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <p className="text-sm">12 文字以上で入力してください。</p>
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          パスワードを変更する
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
    </AuthLayout>
  );
}
