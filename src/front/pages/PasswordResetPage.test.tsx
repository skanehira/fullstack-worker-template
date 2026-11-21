import { describe, it, expect } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthApiError } from "../lib/authClient";
import { createFakeAuthClient } from "../test/fakeAuthClient";
import { renderRoutes } from "../test/renderRoutes";
import { PasswordResetPage } from "./PasswordResetPage";

function renderPage(client = createFakeAuthClient()) {
  renderRoutes(
    [{ path: "/password-reset", element: <PasswordResetPage /> }],
    "/password-reset",
    client,
  );
  return client;
}

async function submit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("メールアドレス"), email);
  await user.click(screen.getByRole("button", { name: "再設定のリンクを送る" }));
}

describe("PasswordResetPage", () => {
  it("申し込むと、登録の有無に触れない案内を出す", async () => {
    const client = renderPage();

    await submit("user@example.com");

    expect(await screen.findByRole("status")).toHaveTextContent(
      /^入力したメールアドレスが登録されていれば、再設定のリンクを送りました。リンクは 30 分間有効です。$/,
    );
    expect(client.requestPasswordReset).toHaveBeenCalledWith("user@example.com");
  });

  it("送れなかったらサーバのメッセージを表示する", async () => {
    const client = createFakeAuthClient();
    client.requestPasswordReset.mockRejectedValue(
      new AuthApiError(0, "NETWORK_ERROR", "通信に失敗しました。時間をおいてやり直してください"),
    );
    renderPage(client);

    await submit("user@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^通信に失敗しました。時間をおいてやり直してください$/,
    );
  });
});
