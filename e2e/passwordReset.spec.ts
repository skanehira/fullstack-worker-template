import { expect, test } from "@playwright/test";
import { loginWithCode } from "./flows";
import { nextMail, resetPathFrom, snapshotMails } from "./mail";
import { RESET_USER } from "./users";

const NEW_PASSWORD = "e2e renewed passphrase";

test("メールのリンクでパスワードを変え、新しいパスワードでログインできる", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "パスワードを忘れた方" }).click();
  await expect(page.getByRole("heading", { name: "パスワードの再設定" })).toBeVisible();
  const before = snapshotMails();
  await page.getByLabel("メールアドレス").fill(RESET_USER.email);
  await page.getByRole("button", { name: "再設定のリンクを送る" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.goto(resetPathFrom(await nextMail(before)));
  await page.getByLabel("新しいパスワード").fill(NEW_PASSWORD);
  await expect(page).not.toHaveURL(/#token=/);
  await page.getByRole("button", { name: "パスワードを変更する" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.getByRole("link", { name: "ログイン画面へ" }).click();
  await loginWithCode(page, RESET_USER.email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/mypage$/);
});
