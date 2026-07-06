import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reuse cached data across navigations; refresh in the background.
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Reuse preloaded/loaded data on navigation instead of always refetching.
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 60_000,
    // Give short async transitions (e.g. re-running `beforeLoad` after auth
    // events) a grace window before the router unmounts the current view
    // to show a pending state. Without this, quick `getUser()` checks make
    // protected pages like /admin blink out for ~100ms right after login
    // or session restore.
    defaultPendingMs: 800,
    defaultPendingMinMs: 0,
  });

  return router;
};
