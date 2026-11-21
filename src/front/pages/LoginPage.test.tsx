import { describe, it, expect } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthApiError } from "../lib/authClient";
import { createFakeAuthClient } from "../test/fakeAuthClient";
import { renderRoutes, stub } from "../test/renderRoutes";
import { LoginPage } from "./LoginPage";

function renderLogin(client = createFakeAuthClient()) {
  renderRoutes([{ path: "/login", element: <LoginPage /> }, stub("/login/otp")], "/login", client);
  return client;
}

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("メールアドレス"), email);
  await user.type(screen.getByLabelText("パスワード"), password);
  await user.click(screen.getByRole("button", { name: "ログイン" }));
}

describe("LoginPage", () => {
  it("パスワードが通ると、入力した値で login を呼び確認コードの画面へ進む", async () => {
    const client = renderLogin();

    await submit("user@example.com", "correct horse battery");

    expect(await screen.findByText("stub:/login/otp")).toBeInTheDocument();
    expect(client.login).toHaveBeenCalledWith("user@example.com", "correct horse battery");
  });

  it("失敗するとサーバのメッセージを表示し、画面に留まる", async () => {
    const client = createFakeAuthClient();
    client.login.mockRejectedValue(
      new AuthApiError(401, "AUTH_FAILED", "メールアドレスまたはパスワードが正しくありません"),
    );
    renderLogin(client);

    await submit("user@example.com", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^メールアドレスまたはパスワードが正しくありません$/,
    );
    expect(screen.getByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });
});
