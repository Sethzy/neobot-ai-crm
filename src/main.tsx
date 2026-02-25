/**
 * App entry point for React + TanStack Router/Query.
 * Renders immediately; auth initializes in the background.
 */
import { StrictMode } from "react";
import { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import { routeTree } from "./routeTree.gen";
import { initializeAuth } from "./lib/auth";
import { UploadProvider } from "./contexts/upload-context";
import { HighlightProvider } from "./contexts/highlight-context";

const queryClient = new QueryClient();
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((mod) => ({
        default: mod.ReactQueryDevtools,
      }))
    )
  : null;

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
        <HighlightProvider>
          <RouterProvider router={router} />
        </HighlightProvider>
      </UploadProvider>
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  </StrictMode>
);

void initializeAuth();

requestAnimationFrame(() => {
  document.documentElement.classList.remove("boot-bg-visible");
  document.documentElement.classList.add("app-ready");
  window.setTimeout(() => {
    document.getElementById("app-boot-bg")?.remove();
  }, 260);
});
