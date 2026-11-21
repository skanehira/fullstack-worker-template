import { describe, it, expect } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeAuthClient } from "../test/fakeAuthClient";
import { renderRoutes, stub } from "../test/renderRoutes";
import { MyPage } from "./MyPage";

function renderMyPage() {
  const client = createFakeAuthClient({ token: "session-token" });
  renderRoutes([{ path: "/mypage", element: <MyPage /> }, stub("/login")], "/mypage", client);
  return client;
}

describe("MyPage", () => {
  it("ログイン中の利用者のメールアドレスを表示する", async () => {
    renderMyPage();

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
  });

  it.each([
    ["ログアウト", "logout"],
    ["すべての端末からログアウト", "logoutAll"],
  ] as const)("「%s」でログアウトしてログイン画面へ戻る", async (label, method) => {
    const client = renderMyPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: label }));

    expect(await screen.findByText("stub:/login")).toBeInTheDocument();
    expect(client[method]).toHaveBeenCalledTimes(1);
  });
});
