# React Router Cheatsheet (v8)

> **Part 18 · Reference · Cheatsheet 5 of 9**
> Package: `react-router` (v8). In v8 there is **no `react-router-dom`** — DOM components such as `RouterProvider` and `BrowserRouter` come from `react-router/dom`. Minimum versions: `node@22.22+`, `react@19.2.7+`, `vite@7+` when using framework mode.

---

## 1. The three modes — pick one deliberately

| Mode | Top-level API | Use when |
| --- | --- | --- |
| **Declarative** | `<BrowserRouter>` + `<Routes>/<Route>` | small apps, embedding, learning |
| **Data** | `createBrowserRouter` + `RouterProvider` (+ `loader`/`action`/`lazy`) | most SPAs: data loading, mutations, error elements |
| **Framework** | `@react-router/dev` Vite plugin, file-based routes | SSR, nested data with typegen, full framework |

```bash
npm i react-router
```

```tsx
// Data mode entry point (this book's default)
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createRoot } from 'react-dom/client';

const router = createBrowserRouter(routes);          // created ONCE, outside the React tree
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
```

---

## 2. Routes as data

```tsx
import type { RouteObject } from 'react-router';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,                       // layout route: renders <Outlet />
    errorElement: <RouteError />,              // caught errors for this branch
    children: [
      { index: true, element: <HomePage /> },  // matches "/" exactly
      { path: 'tasks', element: <TaskListPage /> },
      { path: 'tasks/new', element: <TaskCreatePage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'tasks/:id/edit', element: <TaskEditPage /> },
      { path: 'files/*', element: <FilesPage /> },        // splat: params['*']
      { path: 'optional/:id?', element: <OptionalPage /> },// optional segment
      { path: '*', element: <NotFoundPage /> },            // catch-all, keep last
    ],
  },
];
```

| Concept | Meaning |
| --- | --- |
| `index: true` | the default child route for its parent's path |
| `path: '/tasks'` on a child | absolute path (from the root), allowed in data mode |
| nested `children` | path nesting + `<Outlet />` rendering |
| `:id` | dynamic segment → `useParams().id` |
| `*` | splat → `useParams()['*']` |
| static beats dynamic | `/tasks/new` wins over `/tasks/:id` regardless of order |
| `errorElement` | renders when a loader/action/element in the branch throws |

---

## 3. Navigation

```tsx
import { Link, NavLink, Outlet, useNavigate, useParams, useSearchParams, useLocation } from 'react-router';

<Link to="/tasks/42">Open</Link>
<Link to="/tasks/42" state={{ from: 'list' }}>Open</Link>
<NavLink to="/tasks" className={({ isActive }) => (isActive ? 'nav nav--active' : 'nav')}>Tasks</NavLink>
<Link to={{ pathname: '/tasks', search: '?filter=open' }}>Open tasks</Link>

const navigate = useNavigate();
navigate('/tasks/42');                       // push
navigate(-1);                                // back
navigate('/login', { replace: true });        // no new history entry
navigate('/login', { state: { from: location.pathname } });
```

```tsx
// Read the URL
const { id = '' } = useParams();
const [searchParams, setSearchParams] = useSearchParams();
const filter = searchParams.get('filter') ?? 'all';
const page = Number(searchParams.get('page') ?? '1');
setSearchParams({ filter: 'done', page: '1' });               // replaces the query string
setSearchParams((current) => { const next = new URLSearchParams(current); next.set('page', '2'); return next; });

const location = useLocation();                                // pathname, search, hash, state, key
const from = (location.state as { from?: string } | null)?.from ?? '/';
```

⚠️ `searchParams` is stable but **mutable**: never mutate it directly — update through `setSearchParams` or the URL and the UI drift apart.

---

## 4. Layouts and nesting

```tsx
function Layout() {
  return (
    <>
      <header><nav><Link to="/">Home</Link> <Link to="/tasks">Tasks</Link></nav></header>
      <main><Outlet /></main>                  {/* the matched child renders here */}
      <footer>© Taskboard</footer>
    </>
  );
}
```

- A **layout route** has `element` (or `Component`) and children but often no `path`.
- A **pathless** route (`element` only) groups children for guards or providers.
- Nesting is for shared *layout*; use one level when you only need a guard (see §8).

---

## 5. Lazy routes and code splitting

```tsx
{
  path: 'reports',
  lazy: async () => ({ Component: (await import('./pages/ReportsPage')).default }),
}
```

```tsx
// v8 lazy shape: return any of Component / loader / action / ErrorBoundary / handle
{
  path: 'admin',
  lazy: async () => {
    const mod = await import('./pages/AdminPage');
    return { Component: mod.AdminPage, loader: mod.adminLoader };
  },
}
```

⚠️ **`HydrateFallback` must live on a non-lazy route.** A fallback declared inside the lazy module is not known when the first render happens, and React Router logs `No \`HydrateFallback\` element provided to render during initial hydration`. Put it on the parent (or the root route) instead:

```tsx
{ path: '/', element: <Layout />, HydrateFallback: () => <p role="status">Loading…</p>, children: [ … ] }
```

---

## 6. Loaders and actions (data mode)

```tsx
// Loader: runs before the route renders; data arrives with the UI
export async function taskLoader({ params }: LoaderFunctionArgs) {
  const task = await api.getTask(params.id!);
  if (task === null) throw new Response('Not found', { status: 404 });   // → nearest errorElement
  return { task };
}

// Action: handles form submissions (POST/PUT/PATCH/DELETE)
export async function taskAction({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  await api.updateTask(params.id!, { title: String(formData.get('title')) });
  return redirect(`/tasks/${params.id}`);                                 // actions usually redirect
}

{ path: 'tasks/:id', loader: taskLoader, action: taskAction, element: <TaskDetailPage /> }
```

```tsx
const { task } = useLoaderData() as { task: Task };
const navigation = useNavigation();                 // navigation.state: 'idle' | 'loading' | 'submitting'
const submit = useSubmit();
<Form method="post"><input name="title" /><button>Save</button></Form>
```

| Piece | Purpose |
| --- | --- |
| `loader` | read data for the route; runs in parallel for nested routes |
| `action` | handle a mutation from a `<Form>`; automatically revalidates loaders |
| `redirect()` | return from a loader/action to navigate |
| `shouldRevalidate` | control revalidation after navigations |
| `middleware` | run code around loaders/actions (`throw redirect('/login')` for auth) |

---

## 7. Error handling

```tsx
{ path: 'tasks/:id', element: <TaskDetailPage />, errorElement: <RouteError /> }
```

```tsx
import { isRouteErrorResponse, useRouteError } from 'react-router';

function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <p role="alert">{error.status} — {error.statusText}</p>;      // thrown Response (404/401/…)
  }
  return <p role="alert">{error instanceof Error ? error.message : 'Something went wrong'}</p>;
}
```

Errors from a loader, action or element bubble to the nearest `errorElement` in the branch. React error boundaries still catch render errors inside components (use both: `errorElement` for data errors, a boundary for render errors).

---

## 8. Protected routes (guards)

```tsx
function ProtectedRoute({ role }: { role?: string }) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role !== undefined && !hasRole(session, role)) return <p role="alert">You do not have permission to view this page.</p>;
  return <Outlet />;
}

<Route element={<ProtectedRoute />}>
  <Route element={<ProtectedRoute role="admin" />}>
    <Route path="/admin" element={<AdminPage />} />
  </Route>
</Route>
```

```tsx
// Data-mode equivalent: do it in a loader so no component renders first
export function requireRole(role: string): LoaderFunction {
  return ({ request }) => {
    if (!tokenStore.read()) throw redirect(`/login?from=${encodeURIComponent(new URL(request.url).pathname)}`);
    if (!hasRole(tokenStore.read(), role)) throw new Response('Forbidden', { status: 403 });
    return null;
  };
}
```

**The guard is UX, not security** — the API must enforce the same rule.

---

## 9. Testing a router

```tsx
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}

it('redirects an anonymous visitor and returns them after login', async () => {
  const { router } = renderAt('/admin');
  expect(router.state.location.pathname).toBe('/login');
  await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(router.state.location.pathname).toBe('/admin');       // `from` was honoured
});
```

Assert navigation through `router.state.location` (precise) plus a visible heading; inject the router into the app so tests use the same route table as production.

---

## 10. Deployment gotcha (SPA fallback)

```nginx
# nginx: unknown paths must return index.html, or a refresh on /tasks/42 is a 404
location / {
  try_files $uri $uri/ /index.html;
}
```

```jsonc
// Vercel: vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```text
// Netlify: public/_redirects
/*  /index.html  200
```

---

## 11. Migration cheatsheet (v6/v7 → v8)

| Before | After |
| --- | --- |
| `import { BrowserRouter } from 'react-router-dom'` | `from 'react-router/dom'` |
| `react-router-dom` package | removed — everything lives in `react-router` |
| `v7_*` future flags | `v8_middleware`, `v8_splitRouteModules`, `v8_viteEnvironmentApi` |
| React 18 / Node 20 | React 19.2.7+ / Node 22.22+ |
| `lazy: () => import('./route')` returning just the module | `lazy: async () => ({ Component, loader })` |

---

## 12. Quick reference

| Task | API |
| --- | --- |
| Link without a page reload | `<Link to="…" />`, `<NavLink />` |
| Programmatic navigation | `useNavigate()` |
| Current path / state | `useLocation()` |
| Path params | `useParams()` |
| Query string | `useSearchParams()` |
| Render the matched child | `<Outlet />` |
| Redirect during render | `<Navigate to="…" replace />` |
| Redirect in data code | `throw redirect('/login')` |
| Data before render | `loader` + `useLoaderData()` |
| Mutations from forms | `action` + `<Form method="post">` |
| Pending indicators | `useNavigation().state`, `useFormStatus()` |
| Errors | `errorElement` + `isRouteErrorResponse`, `useRouteError` |
| Code splitting | `lazy: async () => ({ Component })` |
| First-hydration fallback | `HydrateFallback` on a **non-lazy** route |
| Tests | `createMemoryRouter(routes, { initialEntries })` |
