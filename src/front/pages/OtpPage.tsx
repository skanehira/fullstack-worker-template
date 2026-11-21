import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  AuthLayout,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../components/AuthLayout";
import { errorMessage } from "../lib/authClient";
import { useAuthClient } from "../lib/authClientContext";

export function OtpPage() {
  const client = useAuthClient();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 照合が通ると client は challenge を消す。描画のたびに読み直すと、/mypage への遷移が
  // 終わる前の再描画で「challenge が無い」と判定して /login へ戻してしまう。
  const [pending] = useState(() => client.getPendingChallenge());

  if (pending === null) return <Navigate to="/login" replace />;

  function run(action: () => Promise<void>, onSuccess: () => void) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    action()
      .then(onSuccess)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setSubmitting(false));
  }

  return (
    <AuthLayout title="確認コードの入力">
      <p>{`${pending.emailHint} に確認コードを送りました。`}</p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => client.verifyOtp(code),
            () => void navigate("/mypage"),
          );
        }}
      >
        <label className="flex flex-col gap-1">
          確認コード
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          確認
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}
      <button
        type="button"
        disabled={submitting}
        className={secondaryButtonClass}
        onClick={() =>
          run(
            () => client.resendOtp(),
            () => setNotice("確認コードを再送しました。"),
          )
        }
      >
        コードを再送する
      </button>
      <button
        type="button"
        disabled={submitting}
        className={secondaryButtonClass}
        onClick={() => {
          // 取り消しの要求が失敗しても challenge は 30 分で切れるので、画面は待たずに戻す。
          void client.cancelOtp().catch(() => undefined);
          void navigate("/login");
        }}
      >
        ログインをやり直す
      </button>
    </AuthLayout>
  );
}
