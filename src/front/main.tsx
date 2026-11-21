import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "../index.css";
import { createAuthClient } from "./lib/authClient";
import { AuthClientProvider } from "./lib/authClientContext";
import { routes } from "./routes";

const router = createBrowserRouter(routes);
const authClient = createAuthClient({
  fetch: window.fetch.bind(window),
  local: window.localStorage,
  session: window.sessionStorage,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthClientProvider client={authClient}>
      <RouterProvider router={router} />
    </AuthClientProvider>
  </StrictMode>,
);
