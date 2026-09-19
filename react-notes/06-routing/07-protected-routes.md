# 07 — Protected Routes: Guards, Redirects, and Coming Back After Login

> **Part 6 · Routing · File 7 of 8**
> Why this file exists: the first thing every app needs after routing is *"only signed-in people may see this"*. This file builds that with the auth context from Part 5 — verified behaviour: asking for `/orders` while signed out becomes `/login` with `navigationType=REPLACE` and `state.from="/orders"`, the query string is preserved (`state.from="/orders?status=pending"`), and after signing in the user lands on exactly the page they wanted. It then shows the same guard written as a data-mode `loader` (verified: `requireUserLoader(/admin/orders) → redirect to /login`), explains the "checking" state that prevents flashes and false logouts, and says the thing that must never be skipped: **a client-side guard is usability, not security.**

---

## 1. Authentication and authorisation are different questions

| Question | Name | Where it must be answered |
| --- | --- | --- |
| *Who is this?* | **authentication** | the server (session cookie, token) — the client never decides who you are |
| *May they do this?* | **authorisation** | the server, for **every** request |
| *What should the UI show them?* | **UX routing** | your router — this file |

Route guards belong to the third row. They stop users from staring at screens that will fail, and they send them somewhere useful. They do **not** protect data.

⚠️ **Read this twice:** anything the browser can render, the user can see or modify. Anyone can open DevTools, edit the auth state in memory, or call your API with `curl`. If a screen guarded on the client fetches `/api/orders` and your server answers without checking the session, all of your orders are public — the guard changed nothing. Every endpoint needs its own check (Part 14), and the client guard is a convenience layer on top.

---

## 2. The three pieces of a guarded route

```text
1. an auth value   — who is signed in (Part 5, file 09)
2. a guard         — a component or loader that decides "allow" or "redirect"
3. a destination   — the page to render when the answer is "no", plus a way back
```

```tsx
// 1. The auth value (from Part 5, file 09 — abbreviated).
interface AuthValue {
  user: User | null;
  status: 'checking' | 'signed-in' | 'signed-out';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}
```

```tsx
// 2. The guard, in declarative mode.
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/authContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === null) {
    // Remember where the user was going, so login can send them back.
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <>{children}</>;
}
```

```tsx
// 3. The route table that uses it.
<Route
  element={
    <RequireAuth>
      <AdminLayout />
    </RequireAuth>
  }
>
  <Route path="/orders" element={<OrdersPage />} />
  <Route path="/orders/new" element={<NewOrderPage />} />
  <Route path="/orders/:orderId" element={<OrderDetailPage />} />
</Route>
```

Note the shape: the guard wraps the **layout**, so one guard protects a whole branch — and everything nested inside inherits the protection (file 06's nesting, doing real work).

---

## 3. `<Navigate>`: a redirect as a component

`<Navigate to="/login" replace state={{ from }} />` renders nothing; its only job is to navigate during render.

| Prop | Effect |
| --- | --- |
| `to` | where to go (absolute or relative, like `<Link>`'s `to`) |
| `replace` | **replace** the current history entry instead of pushing (files 01 and 08) |
| `state` | data attached to the new location — readable via `useLocation().state` |
| `relative` | subject to the same route/path rules as links (file 06) |

**Why `replace` matters here.** Without it, the history would read `… → /orders → /login`; pressing Back would return to `/orders`, which would immediately redirect to `/login` again — a Back button that does nothing. With `replace`, `/orders` is gone from the history: Back takes the user wherever they were *before* trying to open the protected page.

**Why `state.from` matters.** It is the "you were heading to X" note. `state` is not in the URL (so it does not clutter it), it survives the redirect, and it disappears on refresh — which is exactly the right lifetime for a transient hint.

Verified, in the lab:

```text
=== A. a signed-out visitor asks for a protected page ===
   [router] url=/orders · navigationType=POP · state.from=(none)
   [router] url=/login · navigationType=REPLACE · state.from=/orders
1. asked for /orders, got: h1=Sign in
   the page says: You were heading to /orders.

2. the query string is remembered too (asked for /orders?status=pending):
   [router] url=/login · navigationType=REPLACE · state.from=/orders?status=pending
   h1=Sign in · says: You were heading to /orders?status=pending.
```

Two things to copy from that output: the redirect is a **REPLACE** (so Back behaves), and `state.from` includes the **search string** (so filters survive the sign-in round trip).

---

## 4. The login page: sending the user back

```tsx
// File: src/routes/LoginPage.tsx
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/authContext';

interface LoginState {
  from?: string;
}

export function LoginPage() {
  const { user, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LoginState | null)?.from ?? '/products';
  const [email, setEmail] = useState('admin@megashop.test');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signIn(email);
    void navigate(from, { replace: true });        // replace: no "back to login"
  }

  if (user !== null) {
    return (
      <section>
        <h1>Signed in</h1>
        <p>You are signed in as {user.email}.</p>
        <button type="button" onClick={signOut}>Sign out</button>
        <p>Attempted destination was {from}.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Sign in</h1>
      <p>You were heading to {from}.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Email <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </section>
  );
}
```

Verified round trip:

```text
=== B. signing in returns the user to where they were going ===
3. on the login page: h1=Sign in
   after clicking Sign in: h1=Order ORD-1003
   (the attempted destination /orders/ORD-1003 was reached: true)

4. now that a session is stored, the same URL is allowed:
   h1=Orders
```

Four decisions that make this login page correct:

1. **`state.from` with a fallback** (`?? '/products'`): arrived from a guard → go back there; arrived by typing `/login` → go somewhere sensible, never `undefined`.
2. **`replace: true` on the post-login navigation**: after signing in, Back should leave the login page, not return to it.
3. **Only *local* paths are allowed in `from`.** A `from` value can be attacker-controlled (anyone can put `state` on a link). Before navigating, reject absolutes and protocol-relative values:

```tsx
function safeRedirect(target: string | undefined, fallback = '/products'): string {
  if (target === undefined) return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;   // no external redirects
  return target;
}
```

That single guard prevents the classic **open-redirect** phishing trick: `https://yourapp.com/login` with state pointing at `https://evil.example` so the user lands on a lookalike page after signing in.

4. **Do not store the password or token in React state longer than the request.** The password goes straight to the server; the session lives in an httpOnly cookie or a short-lived token (Part 14).

---

## 5. The "checking" state (why `user === null` is not enough)

```tsx
// ❌ The bug: "no user" is unknowable before the session check finishes.
const [user, setUser] = useState<User | null>(null);
// first render: user === null → the guard redirects a signed-in user to /login,
// then the session arrives and they are bounced back. A visible flicker, and a
// lost `from` if they were mid-flow.
```

```tsx
// ✅ Model the lifecycle, not just the value (Part 5, file 09).
const [status, setStatus] = useState<'checking' | 'signed-in' | 'signed-out'>('checking');
```

```tsx
// The guard then has three outcomes instead of two.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <p role="status">Checking your session…</p>;
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <>{children}</>;
}
```

⚠️ **Never treat "unknown" as "signed out"** in a guard, and never treat it as "signed in" either — the first bounces real users, the second shows a protected shell that then snaps away.

---

## 6. Role-based guards

The same pattern with a second question:

```tsx
// File: src/routes/RequireRole.tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/authContext';
import type { Role } from '../auth/roles';

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <p role="status">Checking your session…</p>;
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (!user.roles.includes(role)) {
    // Signed in, but not allowed: a 403-style screen beats a redirect loop.
    return (
      <section>
        <h1>Not available</h1>
        <p>Your account ({user.email}) does not have the “{role}” role.</p>
      </section>
    );
  }
  return <>{children}</>;
}
```

```tsx
// Usage: wrap only the branch that needs the role.
<Route element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
  <Route path="/orders" element={<OrdersPage />} />
</Route>
```

**Redirect or explain?** Two legitimate designs:

| Situation | Better UX |
| --- | --- |
| not signed in | redirect to login (they can fix it in seconds, and we remember where they were going) |
| signed in but lacking the role | show "you do not have access" (a redirect to the dashboard feels like a bug and hides the reason) |
| the resource disappeared (deleted order) | a "not found" state on the same URL (file 04) |

⚠️ **Never render the forbidden UI and hide it with CSS.** `display: none` ships the data to the browser anyway. Do not render it, do not fetch it, and do not let the server send it.

---

## 7. Guards in data mode: `redirect()` inside a loader

Declarative guards render a component that redirects — the protected component never renders, but the *decision* happens in React, after JavaScript has loaded. Data mode moves the decision before rendering:

A loader runs **outside React**, so it cannot call `useAuth()`. That means the session needs a second,
non-React door — a tiny module the provider also uses, so there is still only one source of truth
(this is exactly what Part 14, file 05 builds in the lab as `src/auth/tokenStore.ts`):

```ts
// File: src/auth/sessionStore.ts — the non-React door to the session.
import type { User } from './authContext';

const KEY = 'shop:user';

export const sessionStore = {
  /** Read the signed-in user, or null. Safe to call from a loader, a component or a test. */
  read(): User | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw === null ? null : (JSON.parse(raw) as User);
    } catch {
      localStorage.removeItem(KEY);
      return null;                       // corrupt data must not break the app
    }
  },
  clear(): void {
    localStorage.removeItem(KEY);
  },
};
```

```ts
// File: src/routes/loaders.ts
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { sessionStore } from '../auth/sessionStore';

export async function requireUserLoader({ request }: LoaderFunctionArgs): Promise<null> {
  if (sessionStore.read() === null) {
    const from = new URL(request.url).pathname;
    throw redirect(`/login?from=${encodeURIComponent(from)}`);
  }
  return null;
}
```

⚠️ A loader only runs on the **client** here. If the app is server-rendered, this module must not read
`localStorage` (there is none on the server) — the session then arrives as a cookie the server can
read, which is why Part 14's comparison of storage options is not academic.

```ts
// File: src/routes/router.tsx (fragment)
{
  path: 'orders',
  loader: requireUserLoader,          // the guard runs before any component renders
  children: [
    { index: true, Component: OrdersRoute },
    { path: ':orderId', Component: OrderRoute, loader: orderLoader },
  ],
},
```

Verified, from the running lab:

```text
4. a guard written as a loader: /orders while signed out:
   [loader] requireUserLoader(/admin/orders) → redirect to /login
   URL after the redirect: /admin/login?from=%2Fadmin%2Forders
   the page shows: h1=Sign in (data mode)
   The loader sent you here from /admin/orders.

5. signing in sends the user to the page they wanted:
   [loader] requireUserLoader(/admin/orders) → allowed
   URL /admin/orders · h1 = Orders
```

Why loaders are the better place for the check:

| | Component guard (declarative) | Loader guard (data mode) |
| --- | --- | --- |
| When it runs | during render of the guard | **before** any component renders |
| Protected data fetching | a `useEffect` in the screen may start first | the guard runs before the screen's loader |
| `from` handling | React `state` | a real query string (`?from=…`), survives a reload |
| Code needed | a `RequireAuth` component per branch | one function, reused by many routes |
| Works without the component knowing | no (the screen can be rendered elsewhere) | yes (the rule belongs to the route) |

⚠️ In data mode the guard cannot use React context (loaders run outside React). Read the session from wherever it really lives — a cookie, a module-level store (what the lab does), or `localStorage` — through a small module both the loader and the components can import. That module is `src/auth/sessionStore.ts` above; in the lab it is `src/auth/tokenStore.ts` (Part 14, file 05).

---

## 8. Session expiry while the app is open

A guard at the door does not help when the session expires while a user is working. Handle it at the API layer (Part 7) and route the user back:

```tsx
// File: src/api/client.ts (fragment) — one place, not one per screen.
export class UnauthorizedError extends Error {}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (response.status === 401) {
    // Session gone: send them to login with a note about where they were.
    signOutLocally();
    throw new UnauthorizedError('Your session expired. Please sign in again.');
  }
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return (await response.json()) as T;
}
```

```tsx
// An error boundary or a global handler then navigates once.
function SessionExpiredRedirect() {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}`, reason: 'expired' }} />;
}
```

💡 **Two failure modes to design for**: the request that fails *because* the session expired should not spam the user with toasts, and 401 should trigger **one** redirect, not one per in-flight request. A tiny "signing out now" flag in the auth module (or a promise that dedupes redirects) solves it.

---

## 9. Five mistakes to avoid with redirects

```tsx
// 1. Redirect loops: guarding the login route itself.
<Route element={<RequireAuth><Layout /></RequireAuth>}>   {/* ❌ if /login is inside */}
  <Route path="/login" element={<LoginPage />} />
</Route>

// 2. Losing the destination: no `from`, so users start over after signing in.
<Navigate to="/login" />

// 3. Pushing instead of replacing, so Back bounces them again.
<Navigate to="/login" />                                  {/* ❌ missing replace */}

// 4. Redirecting on every render without a condition.
useEffect(() => { void navigate('/login'); });             {/* ❌ runs forever */}

// 5. Building `from` from the raw URL (open redirect).
const from = new URLSearchParams(location.search).get('next');  // ❌ validate before navigating
```

Verified behaviour to aim for, summarised: **ask for `/orders` → you end up on `/login` with `state.from="/orders"`, it is a `REPLACE`, and after signing in you are on `/orders`.**

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | treating the guard as security | data is public if the API is unguarded | enforce on the server for every request (Part 14) |
| 2 | guarding only some routes of a branch | one URL leaks the whole section | wrap the **layout** route once |
| 3 | no `from` state | users lose their place after signing in | `state={{ from: pathname + search }}` |
| 4 | missing `replace` on the redirect | Back returns to the protected URL and bounces again | `replace` |
| 5 | guarding `/login` too | infinite redirect loop | keep public routes outside the guard |
| 6 | treating `status === 'checking'` as signed out | signed-in users are shown the login page on every refresh | three-state auth, with a loading branch |
| 7 | rendering the protected screen and hiding it with CSS | data is in the DOM | do not render it |
| 8 | checking roles only in the UI | the API still answers | check permissions server-side; UI is UX |
| 9 | storing the token in `localStorage` "because it is simpler" | any XSS steals the session | httpOnly cookies where possible (Part 14) |
| 10 | redirecting to the dashboard when the role is missing | user thinks it is a bug | show "not available" with a reason |
| 11 | one redirect per failed request on session expiry | a burst of navigations | dedupe: one handler, one redirect |
| 12 | unvalidated `from`/`next` parameter | open redirect (phishing) | allow only same-origin paths |

---

## 11. Best practices

1. **Wrap branches, not pages**: put the guard on a layout route so every child is protected by construction.
2. **Always carry `from`** (path + search) and always `replace` the redirect.
3. **Model three states**: `checking`, `signed-in`, `signed-out` — and design a UI branch for each.
4. **Put the check where it runs first**: a loader in data mode, a wrapper component in declarative mode.
5. **Validate every redirect target** (`startsWith('/')` and not `'//'`).
6. **Show, don't hide**: no CSS-obscured admin panels, no "hidden" menu items as access control.
7. **Keep one auth module pair** (`authContext.ts` for React + `sessionStore.ts` for everything else) that both loaders and components use, so there is exactly one answer to "who is signed in?".
8. **Handle expiry globally** at the API layer, and dedupe the redirect.
9. **Test the four flows** by hand: deep link while signed out, sign-in return, role denial, expiry mid-session.
10. **Write the rule down in your README**: which routes are public, which need a session, which need a role.

---

## 12. Practice

### Beginner — guard the orders section

1. Build the auth context (Part 5, file 09) with `status`, `user`, `signIn`, `signOut`, and persist the user in `localStorage` so a refresh keeps the session.
2. Add `RequireAuth` and wrap the `/orders` branch. Confirm with the console:
   - `/orders` while signed out → `/login`, `navigationType=REPLACE`, `state.from="/orders"`;
   - after signing in → `/orders`.
3. Add the query string to `from` and test with `/orders?status=pending`.
4. Deliberately remove `replace` and describe the Back-button behaviour you observe.

### Intermediate — a realistic login flow with expiry

1. Add a `signIn(email, password)` that calls a fake API and stores the session after a **300 ms** delay (so you can see the `checking` state).
2. Add a "Simulate expiry" button that clears the session, then visit a protected route. Verify the user lands on `/login` with `state.from` set.
3. Add a `reason: 'expired'` flag to the redirect and show a message ("Your session expired — please sign in again") instead of a bare login form.
4. Add the `safeRedirect` helper and prove with a hand-written test that `state.from = 'https://evil.example'` and `state.from = '//evil.example'` both fall back to `/products`.
5. Then answer: what would happen if a component on a protected page fetched data *before* the guard ran? (Compare with the loader version in section 7.)

### Challenge — guards for three roles, declarative and data mode

1. Define `type Role = 'admin' | 'editor' | 'viewer'` and give users a `roles: Role[]`.
2. Declarative: build `RequireRole` and protect three branches:

```text
/orders        → any signed-in user
/orders/new    → editor or admin
/settings/*    → admin only
```

3. Data mode: write one `requireRole(role: Role)` loader factory and apply it to the same three branches:

```ts
export const requireRole = (role: Role) => ({ request }: LoaderFunctionArgs) => {
  const user = getUser();
  if (user === null) throw redirect(`/login?from=${encodeURIComponent(new URL(request.url).pathname)}`);
  if (!user.roles.includes(role)) throw new Response('Forbidden', { status: 403 });
  return null;
};
```

4. Compare the two: which produces the better UX for a denied role (the `<Navigate>` version or the thrown `403` with an error boundary)? Which is easier to keep correct as routes are added?
5. Finally, write the sentence you would put in a code review when someone says "we protect the admin routes on the client, so we're safe".

---

## 13. Solutions

### Beginner

```tsx
// File: src/routes/AppRoutes.tsx (fragment)
<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/login" element={<LoginPage />} />          {/* public — must NOT be guarded */}
  <Route path="/products" element={<ProductsPage />} />

  <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
    <Route path="/orders" element={<OrdersPage />} />
    <Route path="/orders/:orderId" element={<OrderDetailPage />} />
  </Route>

  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

3. `/orders?status=pending` → `state.from = '/orders?status=pending'` (verified). 4. Without `replace`, the history becomes `/orders → /login`; pressing Back returns to `/orders`, the guard fires again, and the user is redirected to `/login` — a Back button that appears broken.

### Intermediate

```tsx
// File: src/auth/safeRedirect.ts
export function safeRedirect(target: string | undefined | null, fallback = '/products'): string {
  if (typeof target !== 'string' || target === '') return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  if (target.includes('\\')) return fallback;      // some browsers treat \\ as a path separator
  return target;
}
```

```ts
// File: src/auth/safeRedirect.test.ts — run with: npx tsx src/auth/safeRedirect.test.ts
import { safeRedirect } from './safeRedirect';

const cases: Array<[string | undefined, string]> = [
  ['/orders/ORD-1001', '/orders/ORD-1001'],
  ['https://evil.example', '/products'],
  ['//evil.example', '/products'],
  [undefined, '/products'],
  ['', '/products'],
];
for (const [input, expected] of cases) {
  const actual = safeRedirect(input);
  console.log(`${actual === expected ? 'PASS' : 'FAIL'} ${JSON.stringify(input)} → ${actual}`);
}
```

5. A component on a protected page that fetches in an effect runs **after** the first render; the guard's `<Navigate>` also happens during that render, so the effect may never run — or, worse, may have already been scheduled when the user was briefly on the page (a flash of "loading" then a redirect). A loader has no such window: it runs before the component exists, so nothing protected is ever mounted for an unauthorised user.

### Challenge

```ts
// File: src/auth/roles.ts
export type Role = 'admin' | 'editor' | 'viewer';

export function canCreateOrders(roles: readonly Role[]): boolean {
  return roles.includes('admin') || roles.includes('editor');
}

export function canChangeSettings(roles: readonly Role[]): boolean {
  return roles.includes('admin');
}
```

```tsx
// Declarative: three branches, one guard component each.
// (needs: import { Outlet } from 'react-router';)
<Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
  <Route path="/orders" element={<OrdersPage />} />
  <Route element={<RequireRole role="editor"><Outlet /></RequireRole>}>
    <Route path="/orders/new" element={<NewOrderPage />} />
  </Route>
  <Route element={<RequireRole role="admin"><AdminSettingsLayout /></RequireRole>}>
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/settings/billing" element={<BillingPage />} />
  </Route>
</Route>
```

```ts
// Data mode: the same rules as loader factories.
export const requireRole = (role: Role) => ({ request }: LoaderFunctionArgs) => {
  const user = getUser();
  if (user === null) throw redirect(`/login?from=${encodeURIComponent(new URL(request.url).pathname)}`);
  if (!user.roles.includes(role)) throw new Response(`Your account needs the “${role}” role.`, { status: 403, statusText: 'Forbidden' });
  return null;
};
```

4. For a denied role, the thrown `403` plus a route `ErrorBoundary` is usually better UX: the URL stays put, the message explains *why*, and there is no redirect hop. The `<Navigate>` version hides the reason and makes the user wonder what happened. Loader factories are also easier to keep correct as routes multiply, because the rule travels with the route definition instead of depending on someone remembering to wrap the element.
5. The code-review sentence: *"Client-side guards only decide what the UI offers. Any data this screen shows must still be authorised on the server for every request — please add the check to the endpoint before we ship."*

---

## 14. Summary

- **Authentication ≠ authorisation ≠ UX routing.** Guards control the UI; the server decides what data leaves the building.
- A declarative guard is a component: `<RequireAuth>` returning `<Navigate to="/login" replace state={{ from }} />` — verified: `navigationType=REPLACE`, `state.from="/orders"`, search string preserved.
- **Wrap a layout route** so an entire branch is protected by construction.
- **`replace` + `from`** are what make Back behave and what return users to where they were going — verified: after signing in, `/orders/ORD-1003` rendered.
- **Validate `from`** (same-origin paths only) to avoid open redirects.
- Model auth as a **lifecycle** (`checking | signed-in | signed-out`) so guards never mistake "unknown" for "signed out".
- For a missing **role**, showing "not available" beats redirecting; never hide forbidden UI with CSS.
- In **data mode** the guard is a `loader` that `throw redirect(...)` — verified: `requireUserLoader(/admin/orders) → redirect to /login`, and after signing in `/admin/orders` rendered. It runs before any component, so nothing protected is ever mounted.
- Handle **session expiry** once, at the API layer, and dedupe the redirect.
- The sentence to repeat in every review: **a client-side guard is usability, not security.**

---

**What's next →** [`08-navigation.md`](./08-navigation.md): moving around on purpose. `<Link>` versus `<NavLink>` (with `isActive`/`isPending`), `useNavigate` for code-driven navigation, `replace` versus push one more time with the verified history behaviour, back/forward, `preventScrollReset` and `ScrollRestoration`, code-splitting routes with `React.lazy` and data-mode `route.lazy` (verified: the lazy route's chunk is a separate 0.24 kB file), pending UI with `useNavigation()`, and the small accessibility details — focus, `document.title`, and live regions — that make client-side navigation feel like real navigation.
