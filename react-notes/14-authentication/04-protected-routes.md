# 04 — Protected Routes: Guards, Redirects and Return-To

> **Part 14 · Authentication · File 4 of 6**

Why this file exists: once the session exists (file 01), someone has to decide which screens a user may see — and that decision is a routing problem, not a component problem. This file builds the guard with React Router (Part 6): a layout route that renders children or redirects, the `from` state that makes return-to work, the three states a guard must distinguish, role gates for specific sections, nested protection, the interaction with loaders, and the two behaviours users notice most: no login-page flash, and no losing where they were going.

Measured from this lab: `redirects to the login page when there is no session, remembering where the user was going` (163 ms), `renders a protected route for an authenticated session` (8 ms), `blocks a route when the user lacks the role` (13 ms) — all inside `src/auth/session.test.tsx` (`6 tests, 1.73 s`).

---

## 1. The guard as a layout route

React Router's layout routes (a `<Route>` with an `element` but no `path`) are exactly the shape a guard needs: they wrap children, can render `<Outlet />`, and can render something else instead.

```tsx
// src/auth/ProtectedRoute.tsx (this lab)
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { hasRole } from './tokenStore';

export function ProtectedRoute({ role }: { role?: string }) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role !== undefined && !hasRole(session, role)) {
    return <p role="alert">You do not have permission to view this page.</p>;
  }
  return <Outlet />;
}
```

```tsx
// App routing, using the guard twice — once for the app, once for an admin section
<Routes>
  <Route path="/login" element={<LoginPage />} />

  <Route element={<ProtectedRoute />}>            {/* everything inside needs a session */}
    <Route path="/" element={<HomePage />} />
    <Route path="/orders" element={<OrdersPage />} />

    <Route element={<ProtectedRoute role="admin" />}>   {/* nested: session + role */}
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
    </Route>
  </Route>

  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

**Line by line:**

- **`status === 'loading'` renders a placeholder** — the guard must not decide while it does not know (section 3).
- **`<Navigate replace state={{ from }} />`** performs the redirect without adding `/login` to history, and carries the destination so login can restore it.
- **`role` is an optional prop**, so one component serves both "must be signed in" and "must be signed in as an admin"; nesting composes them.
- **`<Outlet />`** renders the matched child route (Part 6) — the guard adds no DOM of its own.

⚠️ **Do not put the guard on a single route and forget the children.** A common leak in a small app: `/admin` is guarded but `/admin/users` is a sibling route (not a child), so it renders unprotected. Nested layout routes make the protection structural — if a new page is added *inside* the guarded block, it inherits the guard. That is the difference between a rule and a habit.

---

## 2. Return-to: the two-line feature users notice

```tsx
// In the guard (measured)
return <Navigate to="/login" replace state={{ from: location.pathname }} />;

// In the login page
const state = location.state as LocationState | null;
navigate(state?.from ?? '/', { replace: true });
```

The measured test drives exactly this path: it starts at `/admin` with no session, lands on the login screen, signs in, and asserts `Admin area` appears — with `tokenStore.read()?.token === 'token-123'` proving the session was persisted (`201 ms`).

⚠️ Two refinements worth making in a real app:

1. **Preserve the full location, not just the pathname**, so query strings and hashes survive: `state={{ from: location.pathname + location.search }}`.
2. **Sanitise the destination before navigating.** If `from` is taken from user-controlled state, an attacker can set it to an external URL and turn your login page into an open redirect. Only use it when it starts with `/`:

```tsx
const target = typeof state?.from === 'string' && state.from.startsWith('/') && !state.from.startsWith('//') ? state.from : '/';
navigate(target, { replace: true });
```

💡 With the Data Router (Part 6's `createBrowserRouter`), the same idea is available from `useLocation()` inside the login route, or via a loader that throws `redirect('/login?from=' + encodeURIComponent(...))`. The query-string variant is simpler to hand to a login *form*; the `state` variant keeps the URL clean. Both are fine — pick one and test it.

---

## 3. The three states, and the flash you must not ship

| Guard decision | If you get it wrong |
| --- | --- |
| `loading` → render a placeholder | rendering the login page here causes the "login flash" on every refresh |
| `anonymous` → redirect to login | rendering the app here shows empty screens and triggers 401s |
| `authenticated` → render the route | rendering a spinner forever means the restore effect never finished (check the effect's dependency) |

```tsx
if (status === 'loading') return <p role="status">Checking your session…</p>;
```

That single line is why the lab's context models three states rather than a boolean (file 01). The measured test "renders a protected route for an authenticated session" passes in **8 ms** because the test injects `initialSession`, skipping the storage read entirely; in production, the restore effect resolves it before the first paint matters.

⚠️ **A subtlety with Data Routers:** a `loader` runs *before* the element renders, so a guard implemented as a component cannot protect a route whose loader has already fetched data. In that architecture, protect in the loader (throw `redirect`) or rely on the server to refuse the request — and remember that a client-side loader redirect is still UX, not security.

---

## 4. Element-level gates and the `can()` helper

Route guards are coarse. The fine-grained decisions ("show the Delete button", "show the price column") belong in one permission module:

```tsx
// src/auth/permissions.ts
import { hasRole, type Session } from './tokenStore';

const rules = {
  'products:write': (session: Session | null) => hasRole(session, 'admin') || hasRole(session, 'editor'),
  'orders:read': (session: Session | null) => session !== null,
  'users:manage': (session: Session | null) => hasRole(session, 'admin'),
} as const;

export type Permission = keyof typeof rules;

export function can(session: Session | null, permission: Permission): boolean {
  return rules[permission](session);
}
```

```tsx
// element-level use
const { session } = useAuth();
{can(session, 'products:write') && <DeleteButton id={product.id} />}
```

Two rules that keep this honest:

1. **Every permission has a matching server check.** Write the endpoint next to the rule in a comment so reviewers can see the pair.
2. **Prefer hiding to disabling, and prefer explaining to hiding** when the action matters. A greyed-out "Publish" with a tooltip ("requires the editor role") is friendlier than a missing button users were told to look for — but it also reveals information, so decide per case.

---

## 5. Nested protection, public sections inside a protected app

Real apps are not all-or-nothing: a public marketing page, a public login page, a protected dashboard, and a public "share link" page may all live in the same router. Two patterns handle it:

```tsx
// A protected layout with public exceptions handled by route order
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/share/:token" element={<SharedView />} />   {/* public */}
  <Route element={<ProtectedRoute />}>                      {/* everything below is private */}
    <Route path="/app" element={<AppLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="orders" element={<OrdersPage />} />
    </Route>
  </Route>
</Routes>
```

```tsx
// The inverse: an app-wide layout where only some pages need a session
function Layout() {
  const { status } = useAuth();
  return (
    <>
      <Header />
      {status === 'loading' ? <Skeleton /> : <Outlet />}
    </>
  );
}
```

⚠️ **Route order does not decide protection** — the guard does. What matters is which routes are *inside* the guarded layout route. Keep the guarded block as large as possible so new pages inherit it, and keep the public exceptions explicit and few.

---

## 6. Redirects: three kinds, three tools

| Situation | Tool | Note |
| --- | --- | --- |
| Not signed in | `<Navigate to="/login" replace state={{ from }} />` | preserve destination; `replace` avoids a history trap |
| Signed in but no permission | render a 403 screen (or `<Navigate to="/" />`) | do not silently redirect — users need to know why |
| Already signed in and visiting `/login` | redirect to home (or the destination) | avoids a confusing "you are logged in" screen |
| After login | `navigate(target, { replace: true })` | replace, so Back does not return to login |
| After logout | `navigate('/login', { replace: true })` | and clear any cached user data (Part 9) |

```tsx
// Already signed in? The login page should get out of the way.
if (status === 'authenticated') return <Navigate to="/" replace />;
```

⚠️ **Do not redirect on 401 from a background request.** An app-level interceptor that navigates on any 401 will yank users out of a form when a prefetch fails; the correct response is to refresh (Part 14, file 03) and, only if the session is truly over, redirect with a message.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Guarding the parent path but not its child routes | sibling routes render unprotected | nested layout routes |
| 2 | Treating `loading` as anonymous | login flash on refresh | three-state guard |
| 3 | `navigate('/')` after login | the destination is lost | `state.from` + `replace` |
| 4 | Using `from` without validation | open redirect | allow only same-origin paths starting with `/` |
| 5 | `replace={false}` (default) on the login redirect | Back returns to login | `replace` |
| 6 | Guard as a wrapper inside a page component | the page's effects and loaders already ran | a layout route (or a loader guard) |
| 7 | Redirecting on every 401 | users thrown out of forms | refresh first; redirect only when the session is gone |
| 8 | Permission checks scattered as inline role comparisons | rules drift | one `can()` helper |
| 9 | Client guard presented as security | data leaks | enforce server-side |
| 10 | Guard that renders `null` while loading | a blank screen with no feedback | a skeleton with `role="status"` |
| 11 | Deep-linking into a guarded route after logout | the destination is forgotten | pass `from` through logout too |
| 12 | Forgetting to clear caches on logout | the next user briefly sees the previous user's data | `queryClient.clear()` / store reset + guard |

---

## 8. Best practices

1. **Guard with layout routes**, so protection is structural and inherited by new pages.
2. **Model three states**, and show a skeleton — never the login page — while the session is unknown.
3. **Always preserve and validate the return destination**; `replace` every auth navigation.
4. **One permission module** feeding both route guards and element-level gates, mirrored by server checks.
5. **Distinguish 401 from 403 in the UI**: "sign in" versus "you do not have access".
6. **Keep public routes explicit and few**; everything else lives inside the guarded block.
7. **Clear caches on logout** (queries, stores, in-memory user data) — this is a data-leak bug, not just tidiness.
8. **Test the guards**: loading, anonymous, authenticated, wrong role, return-to (this lab's six tests are a template).
9. **Do not redirect from background failures**; let the interceptor refresh and retry.
10. **Say it once more in the README**: guards are UX; the API is the authority.

---

## 9. Practice

### Beginner

1. Add a `ProtectedRoute` layout route to a React Router app and protect two pages. Verify with the test that an anonymous user sees the login page and an authenticated one sees the content.
2. Add `state={{ from }}` and make login return there. Write the test that proves it.
3. Add a loading placeholder in the guard and explain what would happen without it (describe the flash).

### Intermediate

1. Add a nested admin guard and write the "wrong role" test; then decide, in writing, whether an unauthorised user should get a 403 screen or a redirect home, with the UX trade-off stated.
2. Build `can()` with three permissions and use it for one route guard and one element-level gate. List the server endpoints that must mirror each rule.
3. Handle "already signed in, visiting /login": implement the redirect and test it.

### Challenge

1. Implement a `RequirePermission` component that supports role *and* permission checks, renders an accessible 403 with a link back, and logs the denial (for product analytics) without leaking data. Test all branches.
2. Convert the guard to work with the Data Router: protect a route in its `loader` (throwing `redirect`), keep the component guard for the UI, and explain in writing what each layer protects and why the client-side one is still not security.
3. Design and implement "share link" access: a public route that shows a subset of a protected resource via a token in the URL, with the server validating the token and returning only the shared fields. Include the tests and a note on what must never be exposed.

---

## 10. Solutions

### Beginner

1. Guard exactly as in section 1, with the app's routes nested inside `<Route element={<ProtectedRoute />}>`. The two tests: `initialSession={null}` → `findByRole('heading', { name: 'Sign in' })`; `initialSession={session}` → the page content.
2. `state={{ from: location.pathname + location.search }}` in the guard; in the login page, read it, validate it starts with `/`, and `navigate(target, { replace: true })`. The measured test asserts the protected content appears after sign-in.
3. Without the placeholder, the first render has `status === 'loading'`, which falls through to the anonymous branch → `<Navigate to="/login" />` → the URL becomes `/login` → the effect resolves the session → the app navigates back. Users see the login page flash, and history gains an entry. The placeholder removes both.

### Intermediate

1. Nested `<Route element={<ProtectedRoute role="admin" />}>` around the admin pages; the test asserts `getByRole('alert')` with "do not have permission". The design decision: a 403 screen is more honest (it tells the user the page exists but is not theirs) while a redirect home is smoother for accidental clicks; most products use the 403 for a whole section and hide the *links* to it, so users rarely hit it.
2. Example module as in section 4 with `products:write`, `orders:read`, `users:manage`; server endpoints: `POST/PUT/PATCH/DELETE /api/products*`, `GET /api/orders`, `GET/PATCH/DELETE /api/users*`. Each rule's comment names its endpoint.
3. `if (status === 'authenticated') return <Navigate to="/" replace />;` at the top of the login page — but respect a `from` destination if present. The test asserts a signed-in user visiting `/login` ends up at `/`.

### Challenge

1. The component takes `role?` and `permission?`, uses `can()` internally, renders `<Outlet />` on success, and on failure renders a `role="alert"` panel with a link back and one analytics event (`permission_denied`, with the route and the required permission — no user data). Branches to test: loading, anonymous, missing role, missing permission, success.
2. In the Data Router, the route for `/admin` gets `loader: () => { const session = tokenStore.read(); if (session === null) throw redirect('/login'); if (!hasRole(session, 'admin')) throw new Response('Forbidden', { status: 403 }); return null; }`. This prevents the page from rendering (and prevents its loaders from fetching) but still trusts the client's storage — so the *server* must reject the corresponding API calls, which is what actually protects the data. The component guard then only handles the "already rendered, session changed" case.
3. Design: `GET /api/share/:token` returns a `SharedView` object containing only the fields the product intends to disclose (title, a summary, an image URL — never internal ids, emails, prices you do not want public), the token is high-entropy and revocable, the route is public and renders a stripped layout with no navigation into the app, and the response includes no cache headers that leak it (`Cache-Control: private, no-store` if it must not be cached by proxies). Tests: valid token renders the allowed fields; expired/revoked token renders a "link no longer works" state; the response type (validated with Zod in a contract test) contains no extra fields.

---

## 11. Summary

- **Guards are layout routes**: a `<Route element={<ProtectedRoute />}>` with `<Outlet />` protects everything nested inside it, including pages added later — protection becomes structural rather than a habit.
- **Three states, three behaviours**: `loading` → a skeleton (never the login page), `anonymous` → redirect with `from`, `authenticated` → render. The measured guard test passes in 8 ms with an injected session and 163 ms for the redirect path.
- **Return-to is two lines** — `state={{ from }}` in the guard, `navigate(from, { replace: true })` in the login page — and the measured test asserts the user ends up on `Admin area` after signing in from a protected route. Validate `from` before using it (open-redirect protection).
- **Nest guards for roles** (`role="admin"`), and keep one `can()` module for element-level gates, with every rule mirrored by a server check.
- **Redirects have rules**: `replace` for auth navigations, keep the destination through login *and* logout, do not redirect on background 401s, and prefer an honest 403 to a silent bounce.
- **Clear caches on logout** — otherwise the next user can briefly see the previous user's data; that is a security bug, not a tidiness issue.
- **The guard is UX**: the API must enforce the same rules, and the README should say so plainly.

---

**What's next →** [`05-token-management.md`](./05-token-management.md) is the storage-and-lifecycle chapter, built on this lab's measured tests: the token store with expiry and corrupt-data handling (`6 tests, 1.73 s`, including `treats an expired stored session as no session at all`), the storage comparison (cookie vs memory vs `localStorage`) with the XSS/CSRF trade-offs, cross-tab behaviour, logout that actually clears everything, and the security review checklist for token handling.
