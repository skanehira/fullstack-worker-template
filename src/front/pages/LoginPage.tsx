import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthLayout, inputClass, primaryButtonClass } from "../components/AuthLayout";
import { errorMessage } from "../lib/authClient";
import { useAuthClient } from "../lib/authClientContext";

export function LoginPage() {
  const client = useAuthClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthLayout title="ログイン">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSubmitting(true);
          client
            .login(email, password)
            .then(() => navigate("/login/otp"))
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
        <label className="flex flex-col gap-1">
          パスワード
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          ログイン
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
      <Link to="/password-reset" className="text-sm underline">
        パスワードを忘れた方
      </Link>
    </AuthLayout>
  );
}
