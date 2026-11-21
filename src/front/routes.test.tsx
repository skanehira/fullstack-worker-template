import { describe, it, expect } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "./routes";
import { createFakeAuthClient } from "./test/fakeAuthClient";
import { renderRoutes } from "./test/renderRoutes";

describe("ログインの流れ", () => {
  it("未ログインで /mypage を開くとログインへ送られ、パスワードとコードを通すと /mypage に着く", async () => {
    renderRoutes(routes, "/mypage", createFakeAuthClient());
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("メールアドレス"), "user@example.com");
    await user.type(screen.getByLabelText("パスワード"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    await user.type(await screen.findByLabelText("確認コード"), "123456");
    await user.click(screen.getByRole("button", { name: "確認" }));

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "マイページ" })).toBeInTheDocument();
  });
});
