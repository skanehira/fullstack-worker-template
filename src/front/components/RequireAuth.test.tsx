import { describe, it, expect } from "vite-plus/test";
import { screen } from "@testing-library/react";
import { AuthApiError } from "../lib/authClient";
import { createFakeAuthClient } from "../test/fakeAuthClient";
import { renderRoutes, stub } from "../test/renderRoutes";
import { RequireAuth } from "./RequireAuth";

function renderGuarded(client: ReturnType<typeof createFakeAuthClient>) {
  renderRoutes(
    [
      {
        path: "/mypage",
        element: (
          <RequireAuth>
            <p>protected</p>
          </RequireAuth>
        ),
      },
      stub("/login"),
    ],
    "/mypage",
    client,
  );
}

describe("RequireAuth", () => {
  it("token が無ければログイン画面へ送る", async () => {
    renderGuarded(createFakeAuthClient());

    expect(await screen.findByText("stub:/login")).toBeInTheDocument();
  });

  it("サーバがセッションを認めれば中身を表示する", async () => {
    renderGuarded(createFakeAuthClient({ token: "session-token" }));

    expect(await screen.findByText("protected")).toBeInTheDocument();
  });

  it("サーバがセッションを認めなければ (401) ログイン画面へ送る", async () => {
    const client = createFakeAuthClient({ token: "revoked-token" });
    client.getMe.mockRejectedValue(new AuthApiError(401, "UNAUTHORIZED", "認証が必要です"));
    renderGuarded(client);

    expect(await screen.findByText("stub:/login")).toBeInTheDocument();
  });

  it("通信に失敗したときはログイン画面へ送らず、読み込めなかったことを知らせる", async () => {
    const client = createFakeAuthClient({ token: "session-token" });
    client.getMe.mockRejectedValue(
      new AuthApiError(0, "NETWORK_ERROR", "通信に失敗しました。時間をおいてやり直してください"),
    );
    renderGuarded(client);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^通信に失敗しました。時間をおいてやり直してください$/,
    );
  });
});
