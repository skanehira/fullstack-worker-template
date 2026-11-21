import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { SWRConfig } from "swr";
import type { AuthClient } from "../lib/authClient";
import { AuthClientProvider } from "../lib/authClientContext";

/** テストごとに SWR のキャッシュを分け、メモリ上の router で描画する。 */
export function renderRoutes(routes: RouteObject[], initialEntry: string, client: AuthClient) {
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <AuthClientProvider client={client}>
        <RouterProvider router={router} />
      </AuthClientProvider>
    </SWRConfig>,
  );
  return router;
}

export const stub = (path: string) => ({ path, element: <p>{`stub:${path}`}</p> });
