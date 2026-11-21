import { expect, test } from "@playwright/test";
import { loginWithCode } from "./flows";
import { LOGIN_USER } from "./users";

test("未ログインで開いたマイページへ、パスワードとメールのコードで入り、ログアウトで出られる", async ({
  page,
}) => {
  await page.goto("/mypage");
  await expect(page).toHaveURL(/\/login$/);

  await loginWithCode(page, LOGIN_USER.email, LOGIN_USER.password);
  await expect(page).toHaveURL(/\/mypage$/);
  await expect(page.getByText(LOGIN_USER.email)).toBeVisible();

  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/mypage");
  await expect(page).toHaveURL(/\/login$/);
});
