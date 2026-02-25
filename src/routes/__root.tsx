/**
 * Root route with auth guards for protected routes.
 * Public routes render immediately; protected routes await auth init as needed.
 */
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { HeadContent } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ensureAuthForPath, getAuthRedirect, getCachedSession } from "@/lib/auth";

interface RouterContext {
  queryClient: QueryClient;
}

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((mod) => ({
        default: mod.TanStackRouterDevtools,
      }))
    )
  : null;

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    await ensureAuthForPath(location.pathname);

    const session = getCachedSession();
    const redirectTo = getAuthRedirect(location.pathname, session);

    if (redirectTo) {
      throw redirect({
        to: redirectTo,
        search:
          redirectTo === "/login" ? { redirect: location.pathname } : undefined,
      });
    }

    return { session };
  },
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <HeadContent />
      <Outlet />
      <Toaster position="bottom-center" richColors />
      {TanStackRouterDevtools ? (
        <Suspense fallback={null}>
          <TanStackRouterDevtools />
        </Suspense>
      ) : null}
    </>
  );
}
