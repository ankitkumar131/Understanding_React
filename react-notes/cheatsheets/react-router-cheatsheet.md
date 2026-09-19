# React Router Cheat Sheet (v7)

> Routes, params, navigation and the guards. Deep version: [Part 6](../06-routing/)

## Install

```bash
npm install react-router          # v7: the package is `react-router`, not `react-router-dom`
```

`react-router-dom` still exists as a re-export for compatibility; new projects import from
`react-router`.

## Two APIs

| API | When |
| --- | --- |
| **Declarative** (`<BrowserRouter>` + `<Routes>`) | Simple apps, learning |
| **Data router** (`createBrowserRouter` + `<RouterProvider>`) | Loaders, actions, blockers, deferred data — use this for real apps |

```tsx
// Declarative
import { BrowserRouter, Routes, Route } from 'react-router';

<BrowserRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/tasks/:id" element={<TaskDetail />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
</BrowserRouter>
```

```tsx
// Data router
import { createBrowserRouter, RouterProvider } from 'react-router';

const router = createBrowserRouter([
  { path: '/', element: <Home />, loader: homeLoader },
  { path: '/tasks/:id', element: <TaskDetail />, loader: taskLoader, ErrorBoundary: TaskError },
]);

<RouterProvider router={router} />
```

## Route configuration

```tsx
[
  { path: '/', element: <Home /> },
  { path: '/about', element: <About /> },

  // Params
  { path: '/tasks/:id', element: <TaskDetail /> },
  { path: '/tasks/:taskId/comments/:commentId', element: <Comment /> },
  { path: '/files/*', element: <FileBrowser /> },          // splat: matches the rest

  // Optional segment
  { path: '/archive/:year?', element: <Archive /> },

  // Nested (the parent renders <Outlet />)
  {
    path: '/settings',
    element: <SettingsLayout />,
    children: [
      { index: true, element: <Profile /> },               // matches /settings exactly
      { path: 'profile', element: <Profile /> },           // /settings/profile
      { path: 'billing', element: <Billing /> },           // /settings/billing
    ],
  },

  // Layout without a path
  { element: <AppLayout />, children: [ /* … */ ] },

  // Redirects
  { path: '/home', element: <Navigate to="/" replace /> },

  // 404 — last
  { path: '*', element: <NotFound /> },
]
```

⚠️ **Declare static routes before dynamic ones** (`/tasks/new` before `/tasks/:id`) so the file
reads the way it behaves. React Router ranks static segments above dynamic ones, but the order
still helps the next person.

## Reading the URL

```tsx
import { useParams, useSearchParams, useLocation, useMatches } from 'react-router';

// Path params — every value is string | undefined
const { id = '' } = useParams();
const { taskId, commentId } = useParams();

// Query string
const [searchParams, setSearchParams] = useSearchParams();
const page = Number(searchParams.get('page') ?? 1);
searchParams.get('q');                       // string | null

// Setting a query param without losing the others
const next = new URLSearchParams(searchParams);
if (value) next.set('q', value); else next.delete('q');
setSearchParams(next, { replace: true });    // replace: do not create a history entry per keystroke

// Everything
const { pathname, search, hash, state } = useLocation();
```

→ [Part 6 · 04](../06-routing/04-route-parameters.md) · [Part 6 · 05](../06-routing/05-query-parameters.md)

## Navigation

```tsx
import { Link, NavLink, useNavigate, Navigate, Outlet } from 'react-router';

// Declarative
<Link to="/tasks">Tasks</Link>
<Link to={`/tasks/${id}`}>Open</Link>
<Link to={{ pathname: '/tasks', search: '?status=done' }}>Done</Link>
<Link to="/tasks" state={{ from: 'dashboard' }}>Tasks</Link>
<Link to="/docs" reloadDocument>Full page load</Link>       // escape the SPA

// Active-link styling
<NavLink to="/tasks" className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}>
  Tasks
</NavLink>
<NavLink to="/tasks" style={({ isActive }) => ({ fontWeight: isActive ? 700 : 400 })} />

// Imperative
const navigate = useNavigate();
navigate('/tasks');
navigate(-1);                                   // back
navigate('/login', { replace: true });          // no history entry
navigate(`/tasks/${id}`, { state: { justCreated: true } });

// Declarative redirect during render
<Navigate to="/login" replace />

// Reading navigation state
const { state } = useLocation();
```

⚠️ **Never navigate during render** except by returning `<Navigate>`. Calling `navigate()` in the
component body causes "Cannot update a component while rendering a different component". Put it
in an effect or an event handler.

## Nested layouts

```tsx
// SettingsLayout.tsx
import { NavLink, Outlet } from 'react-router';

export function SettingsLayout() {
  return (
    <div className="split">
      <nav>
        <NavLink to="/settings/profile">Profile</NavLink>
        <NavLink to="/settings/billing">Billing</NavLink>
      </nav>
      <Outlet />           {/* the matched child route renders here */}
    </div>
  );
}
```

→ [Part 6 · 06](../06-routing/06-nested-routes.md)

## Lazy routes + Suspense

```tsx
import { lazy, Suspense } from 'react';

const Settings = lazy(() => import('./features/settings'));

{ path: '/settings', element: <Suspense fallback={<Spinner label="Loading settings" />}><Settings /></Suspense> }
```

One `lazy()` per route is the highest-value performance change in most apps.
→ [Part 10 · 05](../10-advanced-react/05-lazy-loading.md) · [Part 10 · 06](../10-advanced-react/06-code-splitting.md)

## Protected routes

```tsx
// RequireAuth.tsx
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') return <Spinner label="Checking your session" />;   // ← do not skip this
  if (status === 'anonymous') {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

// Usage
{
  path: '/dashboard',
  element: (
    <RequireAuth>
      <RequireRole permission="dashboard:view"><Dashboard /></RequireRole>
    </RequireAuth>
  ),
}
```

```tsx
// After login — validate the target, or you have an open redirect
const returnTo = searchParams.get('returnTo');
const safe = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
navigate(safe, { replace: true });
```

**Three things that make a guard correct:** handle the `loading` state (otherwise a signed-in
user sees the login page flash on every refresh); encode `returnTo`; and validate it before
navigating. Client guards are UX — the API must authorise every request.
→ [Part 6 · 07](../06-routing/07-protected-routes.md) · [Part 14 · 04](../14-authentication/04-protected-routes.md)

## Loaders and actions (data router)

```tsx
{
  path: '/tasks/:id',
  loader: async ({ params }) => {
    const task = await tasksApi.get(params.id!);
    if (!task) throw new Response('Not found', { status: 404 });
    return task;
  },
  action: async ({ request, params }) => {
    const form = await request.formData();
    await tasksApi.update(params.id!, Object.fromEntries(form));
    return redirect('/tasks');
  },
  ErrorBoundary: TaskErrorBoundary,
}

// In the component
const task = useLoaderData() as Task;
const error = useRouteError();
const navigation = useNavigation();          // { state: 'idle' | 'loading' | 'submitting' }
```

## Blocking navigation (unsaved changes)

```tsx
const blocker = useBlocker(({ currentLocation, nextLocation }) =>
  formState.isDirty && currentLocation.pathname !== nextLocation.pathname);

useEffect(() => {
  if (blocker.state !== 'blocked') return;
  if (window.confirm('Discard unsaved changes?')) blocker.proceed();
  else blocker.reset();
}, [blocker]);
```

Requires the data router (`createBrowserRouter`).

## Error handling

```tsx
// Per-route
{ path: '/tasks/:id', element: <Task />, ErrorBoundary: TaskError }

function TaskError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) return <p>{error.status} {error.statusText}</p>;
  return <p>Something went wrong loading this task.</p>;
}
```

## The SPA rewrite rule (the classic deploy bug)

An SPA has no file at `/tasks/42`, so a refresh 404s unless the host rewrites unknown paths to
`index.html`:

```toml
# netlify.toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

```json
// vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```nginx
# nginx
location / { try_files $uri $uri/ /index.html; }
```

Sub-path deploy? Set `base: '/my-app/'` in `vite.config.ts`, or every asset 404s.
→ [Part 15 · 08](../15-production/08-production-checklist.md)

## Quick diagnostics

| Symptom | Cause → fix |
| --- | --- |
| 404 on refresh of a deep link | Missing SPA rewrite rule |
| Blank page, 404s on `/assets/*` | Missing `base` for a sub-path deploy |
| `useParams()` gives `undefined` | The route does not define that param, or the component renders outside the route |
| "Cannot update a component while rendering" | `navigate()` called during render → return `<Navigate>` |
| `/tasks/new` shows the detail page | Route order, or a param named `new` — declare static first |
| The layout does not render children | Missing `<Outlet />` |
| A `NavLink` is always active | `to="/"` matches everything — add `end` |
