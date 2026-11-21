import { useNavigate } from "react-router";
import { AuthLayout, primaryButtonClass, secondaryButtonClass } from "../components/AuthLayout";
import { useAuthClient, useMe } from "../lib/authClientContext";

export function MyPage() {
  const client = useAuthClient();
  const navigate = useNavigate();
  const { data: me } = useMe();

  function leave(action: () => Promise<void>) {
    // token は要求の前に消えるので、要求の成否に依らずログイン画面へ戻す。
    void action()
      .catch(() => undefined)
      .then(() => navigate("/login"));
  }

  return (
    <AuthLayout title="マイページ">
      {me !== undefined && <p>{me.email}</p>}
      <button type="button" className={primaryButtonClass} onClick={() => leave(client.logout)}>
        ログアウト
      </button>
      <button
        type="button"
        className={secondaryButtonClass}
        onClick={() => leave(client.logoutAll)}
      >
        すべての端末からログアウト
      </button>
    </AuthLayout>
  );
}
