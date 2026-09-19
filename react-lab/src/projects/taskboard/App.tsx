// Project 6 — the shell: providers, an error boundary, a lazy route and a guard, in one place.
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Outlet, RouterProvider, createBrowserRouter, type RouteObject } from 'react-router';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { ProtectedRoute } from '../../auth/ProtectedRoute';
import { TaskForm } from './features/tasks/TaskForm';
import { TaskList } from './features/tasks/TaskList';
import type { Session } from '../../auth/tokenStore';

/** A boundary for render errors (Part 10 / Part 15, file 04). */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[taskboard] render error', error, info.componentStack);
  }

  render() {
    if (this.state.error !== null) {
      return (
        <div role="alert">
          <p>Something went wrong on this screen.</p>
          <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Layout() {
  const { session, logout } = useAuth();
  return (
    <>
      <header>
        <h1>Taskboard</h1>
        <nav aria-label="Main">
          <Link to="/">Tasks</Link>{' '}
          <Link to="/reports">Reports</Link>
        </nav>
        <p>Signed in as {session?.user.name ?? 'guest'} <button type="button" onClick={logout}>Sign out</button></p>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

// The route table lives here (not in a separate module) because the shell and the routes it
// maps are read together — and because Part 17, file 06 quotes this file as a whole.
// oxlint-disable-next-line react/only-export-components -- route table is part of the shell
export const taskboardRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    // React Router renders this while it resolves a lazy route on the FIRST render of the app.
    // It must live on a NON-lazy route: a fallback declared inside the lazy module is not known
    // yet, so the router cannot see it and logs "No `HydrateFallback` element provided…".
    HydrateFallback: () => <p role="status">Loading…</p>,
    children: [
      { index: true, element: <><TaskForm /><TaskList /></> },
      // A lazy route: React Router calls this when the route is first visited,
      // and the bundler turns the dynamic import into its own chunk.
      {
        path: 'reports',
        lazy: async () => ({ Component: (await import('./pages/ReportsPage')).default }),
      },
    ],
  },
];

// oxlint-disable-next-line react/only-export-components -- same file as the shell, by design
export function createAppRouter() {
  return createBrowserRouter(taskboardRoutes);
}

export function App({ initialSession, router }: { initialSession?: Session | null; router?: ReturnType<typeof createBrowserRouter> }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retries are good in production and poison in tests (they add real seconds
        // of backoff and turn a deterministic failure into a timeout).
        retry: import.meta.env.MODE === 'test' ? false : 1,
      },
    },
  });

  const content = (
    <Boundary>
      <Suspense fallback={<p role="status">Loading…</p>}>
        <RouterProvider router={router ?? createAppRouter()} />
      </Suspense>
    </Boundary>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSession={initialSession}>
        {content}
      </AuthProvider>
    </QueryClientProvider>
  );
}

export { ProtectedRoute };
