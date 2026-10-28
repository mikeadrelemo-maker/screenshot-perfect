
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Route as rootRoute } from "./csr-root";
import { Route as indexRoute } from "./routes/index";
import { Route as editorRoute } from "./routes/editor";
import { Route as historyRoute } from "./routes/history";

import "./styles.css";

// Register each file-based route with its ID, path, and parent.
const indexChild = indexRoute.update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRoute,
} as any);

const editorChild = editorRoute.update({
  id: "/editor",
  path: "/editor",
  getParentRoute: () => rootRoute,
} as any);

const historyChild = historyRoute.update({
  id: "/history",
  path: "/history",
  getParentRoute: () => rootRoute,
} as any);

const routeTree = rootRoute.addChildren([
  indexChild,
  editorChild,
  historyChild,
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000 },
  },
});

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error('Could not find the root element "#root" in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
