import { useState } from "react";
import { Link } from "react-router";
import { AuthLayout, inputClass, primaryButtonClass } from "../components/AuthLayout";
import { errorMessage } from "../lib/authClient";
import { useAuthClient } from "../lib/authClientContext";

export function PasswordResetPage() {
  const client = useAuthClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthLayout title="パスワードの再設定">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSubmitting(true);
          client
            .requestPasswordReset(email)
            .then(() => setSent(true))
            .catch((e: unknown) => setError(errorMessage(e)))
            .finally(() => setSubmitting(false));
        }}
      >
        <label className="flex flex-col gap-1">
          メールアドレス
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          再設定のリンクを送る
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
      {sent && (
        <p role="status">
          入力したメールアドレスが登録されていれば、再設定のリンクを送りました。リンクは 30
          分間有効です。
        </p>
      )}
      <Link to="/login" className="text-sm underline">
        ログイン画面へ
      </Link>
    </AuthLayout>
  );
}
