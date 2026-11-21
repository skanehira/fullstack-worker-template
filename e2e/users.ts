/** e2e/start-server.sh が作る利用者 (値を変えるときは同スクリプトも直す)。spec ごとに分け、互いの送信間隔やパスワード変更が干渉しないようにする。 */
export const LOGIN_USER = { email: "e2e-login@example.com", password: "e2e login passphrase" };
export const RESET_USER = { email: "e2e-reset@example.com", password: "e2e reset passphrase" };
