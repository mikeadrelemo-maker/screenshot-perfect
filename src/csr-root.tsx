import {
  createRootRouteWithContext,
  Link,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

// CSR-compatible root — no HeadContent / Scripts / shellComponent (those require SSR).
// The HTML document shell is provided by index.html.

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn&apos;t load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. You can try refreshing or head back home.
        </p>
        <p className="mt-1 text-xs text-muted-foreground font-mono">{String(error)}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="."
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const nav =
    "rounded-md px-3 py-1.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <header className="bg-navy-deep text-sidebar-foreground">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-3">
            <Link to="/" className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-sidebar-foreground text-navy-deep">
                <FileText className="h-5 w-5" />
              </span>
              <span className="leading-tight">
                <span className="block text-base font-semibold tracking-tight">
                  SOS Invoice Template Converter
                </span>
                <span className="block text-xs text-sidebar-foreground/60">by: Adrian Llano</span>
              </span>
            </Link>
            <nav className="flex gap-1">
              <Link
                to="/"
                className={nav}
                activeOptions={{ exact: true, includeSearch: false }}
                activeProps={{ className: "bg-sidebar-accent !text-sidebar-foreground" }}
              >
                Convert
              </Link>
              <Link
                to="/editor"
                className={nav}
                activeProps={{ className: "bg-sidebar-accent !text-sidebar-foreground" }}
              >
                Print Layout Editor
              </Link>
              <Link
                to="/history"
                className={nav}
                activeProps={{ className: "bg-sidebar-accent !text-sidebar-foreground" }}
              >
                History
              </Link>
            </nav>
          </div>
        </header>
        <Outlet />
      </div>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
