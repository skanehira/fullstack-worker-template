import { expect, type Page } from "@playwright/test";
import { codeFrom, nextMail, snapshotMails } from "./mail";

export async function loginWithCode(page: Page, email: string, password: string) {
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  const before = snapshotMails();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/login\/otp$/);
  await page.getByLabel("確認コード").fill(codeFrom(await nextMail(before)));
  await page.getByRole("button", { name: "確認" }).click();
}
