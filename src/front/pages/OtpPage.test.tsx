import { describe, it, expect } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthApiError } from "../lib/authClient";
import { FAKE_PENDING, createFakeAuthClient } from "../test/fakeAuthClient";
import { renderRoutes, stub } from "../test/renderRoutes";
import { OtpPage } from "./OtpPage";

function renderOtp(client = createFakeAuthClient({ pending: FAKE_PENDING })) {
  renderRoutes(
    [{ path: "/login/otp", element: <OtpPage /> }, stub("/login"), stub("/mypage")],
    "/login/otp",
    client,
  );
  return client;
}

describe("OtpPage", () => {
  it("入力待ちの challenge が無ければログイン画面へ戻す", async () => {
    renderOtp(createFakeAuthClient());

    expect(await screen.findByText("stub:/login")).toBeInTheDocument();
  });

  it("送り先を伏せ字で示し、正しいコードでマイページへ進む", async () => {
    const client = renderOtp();
    const user = userEvent.setup();

    expect(screen.getByText("u***@example.com に確認コードを送りました。")).toBeInTheDocument();
    await user.type(screen.getByLabelText("確認コード"), "123456");
    await user.click(screen.getByRole("button", { name: "確認" }));

    expect(await screen.findByText("stub:/mypage")).toBeInTheDocument();
    expect(client.verifyOtp).toHaveBeenCalledWith("123456");
  });

  it("コードが誤っていればサーバのメッセージを表示する", async () => {
    const client = createFakeAuthClient({ pending: FAKE_PENDING });
    client.verifyOtp.mockRejectedValue(
      new AuthApiError(422, "OTP_INVALID", "確認コードが正しくありません"),
    );
    renderOtp(client);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("確認コード"), "000000");
    await user.click(screen.getByRole("button", { name: "確認" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/^確認コードが正しくありません$/);
  });

  it("再送すると、再送したことを知らせる", async () => {
    const client = renderOtp();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "コードを再送する" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/^確認コードを再送しました。$/);
    expect(client.resendOtp).toHaveBeenCalledTimes(1);
  });

  it("再送できなければサーバのメッセージを表示する", async () => {
    const client = createFakeAuthClient({ pending: FAKE_PENDING });
    client.resendOtp.mockRejectedValue(
      new AuthApiError(429, "OTP_SEND_RATE_LIMITED", "確認コードの送信は 60 秒に 1 回までです"),
    );
    renderOtp(client);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "コードを再送する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^確認コードの送信は 60 秒に 1 回までです$/,
    );
  });

  it("やり直すと challenge を取り消してログイン画面へ戻る", async () => {
    const client = renderOtp();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "ログインをやり直す" }));

    expect(await screen.findByText("stub:/login")).toBeInTheDocument();
    expect(client.cancelOtp).toHaveBeenCalledTimes(1);
  });
});
