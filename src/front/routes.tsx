import { Navigate, type RouteObject } from "react-router";
import { RequireAuth } from "./components/RequireAuth";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MyPage } from "./pages/MyPage";
import { OtpPage } from "./pages/OtpPage";
import { PasswordResetConfirmPage } from "./pages/PasswordResetConfirmPage";
import { PasswordResetPage } from "./pages/PasswordResetPage";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/home" replace /> },
  { path: "/home", element: <HomePage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/login/otp", element: <OtpPage /> },
  { path: "/password-reset", element: <PasswordResetPage /> },
  { path: "/password-reset/confirm", element: <PasswordResetConfirmPage /> },
  {
    path: "/mypage",
    element: (
      <RequireAuth>
        <MyPage />
      </RequireAuth>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
];
