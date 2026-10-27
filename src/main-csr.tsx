import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// CSR root — no TanStack Start SSR shell
import { Route as rootRoute } from "./csr-root";
// Re-use the existing file-based route modules (createFileRoute is CSR-compatible)
import { Route as indexRoute } from "./routes/index";
import { Route as editorRoute } from "./routes/editor";
import { Route as historyRoute } from "./routes/history";

// Manually assemble the route tree (replaces the generated routeTree.gen.ts which
// references TanStack Start SSR types we don't want in the static build).
const routeTree = rootRoute.addChildren([indexRoute, editorRoute, historyRoute]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
});

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Import global styles
import "./styles.css";

const rootEl = document.getElementById("root")!;
const root = createRoot(rootEl);
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
