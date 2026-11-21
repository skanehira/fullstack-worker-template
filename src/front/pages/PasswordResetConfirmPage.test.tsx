import { describe, it, expect } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthApiError } from "../lib/authClient";
import { createFakeAuthClient } from "../test/fakeAuthClient";
import { renderRoutes } from "../test/renderRoutes";
import { PasswordResetConfirmPage } from "./PasswordResetConfirmPage";

function renderPage(entry: string, client = createFakeAuthClient()) {
  renderRoutes(
    [{ path: "/password-reset/confirm", element: <PasswordResetConfirmPage /> }],
    entry,
    client,
  );
  return client;
}

async function submit(password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("新しいパスワード"), password);
  await user.click(screen.getByRole("button", { name: "パスワードを変更する" }));
}

describe("PasswordResetConfirmPage", () => {
  it("リンクの token と入力したパスワードで変更し、ログインを促す", async () => {
    const client = renderPage("/password-reset/confirm#token=01JRESET.secret");

    await submit("brand new passphrase");

    expect(await screen.findByRole("status")).toHaveTextContent(
      /^パスワードを変更しました。新しいパスワードでログインしてください。$/,
    );
    expect(client.completePasswordReset).toHaveBeenCalledWith(
      "01JRESET.secret",
      "brand new passphrase",
    );
    expect(screen.getByRole("link", { name: "ログイン画面へ" })).toHaveAttribute("href", "/login");
  });

  it("リンクに token が無ければ、申し込み直しを案内する", () => {
    renderPage("/password-reset/confirm");

    expect(screen.getByRole("alert")).toHaveTextContent(
      /^再設定のリンクが正しくありません。もう一度申し込んでください。$/,
    );
    expect(screen.getByRole("link", { name: "再設定を申し込む" })).toHaveAttribute(
      "href",
      "/password-reset",
    );
  });

  it("変更できなければサーバのメッセージを表示する", async () => {
    const client = createFakeAuthClient();
    client.completePasswordReset.mockRejectedValue(
      new AuthApiError(
        422,
        "PASSWORD_RESET_LINK_INVALID",
        "再設定のリンクが無効です。もう一度再設定を申し込んでください",
      ),
    );
    renderPage("/password-reset/confirm#token=01JRESET.secret", client);

    await submit("brand new passphrase");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^再設定のリンクが無効です。もう一度再設定を申し込んでください$/,
    );
  });
});
