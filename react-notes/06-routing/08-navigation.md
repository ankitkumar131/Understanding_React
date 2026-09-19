# 08 — Navigation: Links, NavLink, useNavigate, Pending UI, and Lazy Routes

> **Part 6 · Routing · File 8 of 8**
> Why this file exists: the last mile. Which link component to use and when (`<Link>`, `<NavLink>`, or a plain `<a>`), what `useNavigate` can do that a link cannot (verified: `push` then `back` then `forward` then `replace`, with the history entry genuinely gone), how to show a spinner while a route's data loads (verified: `navigation.state=loading to /admin/products?slow=1&q=key` → `idle`), how to split route code into separate chunks (verified: the lazy route produced its own 0.24 kB file while the main bundle stayed 330 kB), and the accessibility details — focus, titles, live regions — that make client-side navigation feel like real navigation.

---

## 1. `<Link>` versus `<a>`: the one rule

```tsx
<Link to="/products">Products</Link>      {/* in-app navigation, no document request */}
<a href="/products">Products</a>          {/* asks the server for a document */}
```

`<Link>` renders a real `<a href="/products">` (so middle-click, ⌘/Ctrl-click, "Copy link address", and screen readers all behave normally) and then intercepts the *plain* left-click to navigate with the router instead.

Measured inside a router app (a plain anchor rendered next to router links, then clicked):

```text
10. clicking the plain anchor inside a router: Not implemented: navigation to another Document
```

That message is jsdom telling us it was asked to load a new document — which is exactly what a real browser would do (and everything in memory would be thrown away). Inside a React Router app, the same click on a `<Link>` produces no document request at all.

| Use `<Link>` | Use `<a>` |
| --- | --- |
| any route inside your app (`/products/p-mouse`) | external sites (`https://react.dev`) |
| links in nav bars, cards, tables, breadcrumbs | `mailto:`, `tel:`, file downloads (`download`) |
| "back" links within a section | deliberately forcing a full reload (rare: "reset the app" links) |

💡 `<Link>`'s `to` accepts an object when you need query/state/hash explicitly:

```tsx
<Link to={{ pathname: '/products', search: '?sort=price', hash: '#reviews' }}>Products by price</Link>
<Link to="/orders" replace state={{ from: 'dashboard' }}>Orders</Link>
<Link to="/products" preventScrollReset>Products</Link>
```

---

## 2. `<NavLink>`: the link that knows where you are

```tsx
import { NavLink } from 'react-router';

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link nav-link--active' : 'nav-link');

export function AdminLayout() {
  return (
    <nav aria-label="Admin">
      <NavLink to="/orders" end className={linkClass}>Orders</NavLink>
      <NavLink to="/orders/new" className={linkClass}>New order</NavLink>
      <NavLink to="/products" className={linkClass}>Products</NavLink>
    </nav>
  );
}
```

Verified, at two URLs with the same component:

```text
3. NavLink with end, at the child URL /orders/ORD-1002:
   Orders=inactive · New order=inactive · Products=inactive
4. NavLink with end, at the parent URL /orders:
   Orders=active · New order=inactive · Products=inactive
```

`NavLink` gives you three booleans, either through a `className`/`style` function or through `children` as a function:

| Render prop | Meaning | Available in |
| --- | --- | --- |
| `isActive` | the current URL matches this link's URL | all modes |
| `isPending` | a navigation *to this link* is in flight | data/framework only |
| `isTransitioning` | a view transition to this URL is running | all modes |

```tsx
// pending-aware nav: the link dims while its route's data loads
<NavLink to="/reports" className={({ isActive, isPending }) => (isPending ? 'nav-link nav-link--pending' : isActive ? 'nav-link nav-link--active' : 'nav-link')}>
  {({ isActive }) => <>Reports {isActive && <span aria-hidden="true">•</span>}</>}
</NavLink>
```

⚠️ **`end` is the prop everyone forgets.** `/orders` is a *prefix* of `/orders/ORD-1001`, so without `end` the "Orders" link stays highlighted on every order detail page. Add `end` when the link's URL is a parent of other routes and you only want it active at that exact path. (React Router already adds an implicit `end` when `to="/"`.)

✅ **`NavLink` sets `aria-current="page"` automatically** when active — that is what screen readers announce. Never re-implement active state with `useLocation()` comparisons: you will get the `end` logic wrong, and you will lose the accessibility attribute.

---

## 3. `useNavigate`: navigation from code

A link is a user choice; sometimes the *code* decides — after a form submit, after a sign-in, after deleting the record the user was looking at.

```tsx
import { useNavigate } from 'react-router';

function useOrderActions(orderId: string) {
  const navigate = useNavigate();

  return {
    openOrder: () => void navigate(`/orders/${orderId}`),                 // push
    replaceWith: () => void navigate('/orders', { replace: true }),       // replace
    goBack: () => void navigate(-1),                                      // like the Back button
    goForward: () => void navigate(1),                                    // like Forward
  };
}
```

Verified history behaviour, driven through buttons in the lab:

```text
1. fresh router at /:            / · type=POP · state=null
2. navigate("/orders"):          /orders · type=PUSH
3. navigate("/products"):        /products · type=PUSH          (stack: / → /orders → /products)
4. navigate(-1):                 /orders · type=POP
5. navigate(1):                  /products · type=POP
6. back to /orders, then navigate("/products", { replace: true }):
                                 /products · type=REPLACE
   now back — /orders is gone, so we land on /:
                                 / · type=POP
7. navigate with a search string and state:
                                 /orders?tab=open · type=PUSH · state={"from":"toolbar"}
8. <Link to="/">:                / · type=PUSH
```

Line 6 is the whole point of `replace`: the entry the user was on was **overwritten**, so Back skipped it entirely. Use `replace` when the current page should not remain in history:

| Situation | Call |
| --- | --- |
| after signing in (do not go "back" to the login page) | `navigate(from, { replace: true })` |
| after deleting a record (Back would 404) | `navigate('/orders', { replace: true })` |
| after a successful save (stay on the record, replace the "edit" entry) | `navigate(`/orders/${id}`, { replace: true })` |
| the user clicked a card (they should be able to go back) | `navigate(`/orders/${id}`)` |

`navigate` returns a promise you can await when you need to know the navigation finished (useful with loaders in data mode):

```tsx
await navigate('/orders');      // resolves once the new route's loaders have run
```

⚠️ **Do not navigate during render.** `navigate()` inside the component body runs on every render and will loop; use `<Navigate>` for render-time redirects (file 07) or an event handler/effect for the rest.

---

## 4. Reading navigation state and type

```tsx
const location = useLocation();
// location.pathname  "/orders/ORD-1001"
// location.search    "?tab=open"
// location.hash      "#activity"
// location.state     { from: 'toolbar' }  — data you attached, not part of the URL
// location.key        a unique id for this history entry ("default" for the first)

const type = useNavigationType();   // "PUSH" | "REPLACE" | "POP"
```

`useNavigationType()` is a debugging superpower: log it while clicking around and you will *see* which of your interactions push, replace, or pop. The verified blocks above use exactly this technique.

---

## 5. Pending UI: telling the user something is happening

In data mode, `useNavigation()` reports the state of an in-flight navigation:

```tsx
// File: src/routes/RouteShell.tsx (fragment)
import { NavLink, Outlet, useNavigation } from 'react-router';

export function RouteShell() {
  const navigation = useNavigation();
  const busy = navigation.state === 'loading';

  return (
    <>
      <header>
        <NavLink to="/products">Products</NavLink> <NavLink to="/orders">Orders</NavLink>
      </header>
      {busy && <div className="progress" role="status" aria-live="polite">Loading {navigation.location?.pathname}…</div>}
      <main>
        <Outlet />
      </main>
    </>
  );
}
```

Verified, navigating to a route whose loader deliberately sleeps:

```text
7. pending state while a slow loader runs (?slow=1):
   [loader] productsLoader(/admin/products?slow=1&q=key)
   [navigation] navigation.state=loading to /admin/products?slow=1&q=key
   during the load, useNavigation() reported the state above
   [navigation] navigation.state=idle
   after the load: URL ?slow=1&q=key · h1 = Products
```

`navigation.state` is `'idle' | 'loading' | 'submitting'`; `navigation.location` is where we are going, `navigation.formData` is set during a submission (Part 8). Three uses:

1. **A global progress bar** (as above) — one component, every route.
2. **Per-link pending styling** with `NavLink`'s `isPending` (section 2).
3. **Blocking a double submit**: disable the button while `navigation.state === 'submitting'`.

⚠️ **Do not show a full-screen spinner for 50 ms.** For fast navigations the flash is worse than the wait. Either keep the previous screen visible (the default in data mode — data resolves before the new screen mounts) or delay the indicator by ~150 ms.

---

## 6. Scroll behaviour

Two browser realities make this needed:

- A client-side navigation does **not** reset scroll position (nothing reloaded).
- People expect a new page to start at the top, *except* when they press Back (they expect their old position).

In **data mode**, add one component and both behaviours come back:

```tsx
// File: src/routes/RouteShell.tsx (fragment)
import { ScrollRestoration } from 'react-router';

export function RouteShell() {
  return (
    <>
      <header>…</header>
      <main>
        <Outlet />
      </main>
      <ScrollRestoration />
    </>
  );
}
```

`ScrollRestoration` stores positions per history key (`location.key`) and restores them on POP while scrolling to the top on PUSH. In **declarative mode** it is not available (mode-availability table, file 02) — implement it yourself:

```tsx
// File: src/components/ScrollToTop.tsx — declarative-mode equivalent.
import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';

export function ScrollToTop() {
  const { pathname, key } = useLocation();
  const type = useNavigationType();

  useEffect(() => {
    if (type === 'POP') return;               // Back/Forward: keep the user's position
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, key, type]);

  return null;
}
```

Other scroll controls:

| Need | Tool |
| --- | --- |
| keep scroll position when only the query string changes (a filter) | `<Link preventScrollReset>` or `navigate(to, { preventScrollReset: true })` (data mode) |
| scroll to an element after navigation | `useEffect` on the new route + `element.scrollIntoView()` |
| restore positions in a scrollable *panel*, not the window | `ScrollRestoration getKey={(location) => location.key}` and your own container logic |

---

## 7. Lazy routes: shipping code only when it is needed

A route's component is often a large chunk (a charting page, an editor, an admin report). Two ways to load it on demand.

### Declarative: `React.lazy` + `Suspense`

```tsx
// File: src/routes/AppRoutes.tsx (fragment)
import { Suspense, lazy } from 'react';

const ReportsPage = lazy(() => import('./ReportsPage'));   // default export required

<Route
  path="/reports"
  element={
    <Suspense fallback={<p role="status">Loading the reports screen…</p>}>
      <ReportsPage />
    </Suspense>
  }
/>
```

Verified in the lab:

```text
1. before the chunk arrives, Suspense renders the fallback; after it, the component:
   final DOM text: "Lazy panel loaded from its own chunk."
   did the import finish within the test? true
```

⚠️ `React.lazy` needs a **default export** (`lazy(() => import('./ReportsPage'))`), or a `.then()` to pick a named one:

```tsx
const ReportsPage = lazy(async () => ({ default: (await import('./ReportsPage')).ReportsPage }));
```

### Data mode: `route.lazy`

```ts
// File: src/routes/router.tsx (fragment)
{
  path: 'reports',
  lazy: async () => ({ Component: (await import('../routes/ReportsPage')).ReportsPage }),
},
```

The route's other data properties can come along too — the documented shape loads them in parallel:

```ts
lazy: async () => {
  const [routeModule, loaderModule] = await Promise.all([import('./app'), import('./app-loader')]);
  return { Component: routeModule.App, loader: loaderModule.loader };
}
```

### What you actually get

```text
dist/index.html                        0.46 kB │ gzip:   0.29 kB
dist/assets/index-DGNrK5qb.css         1.78 kB │ gzip:   0.81 kB
dist/assets/ReportsPage-BgwkSHjN.js    0.24 kB │ gzip:   0.20 kB     ← the lazy route
dist/assets/index-DA7dwG5x.js        330.62 kB │ gzip: 103.86 kB     ← the initial bundle
```

One extra file, fetched only when someone visits `/reports`. Rules of thumb:

- **Split at the route**, not at every component: a route is a natural boundary and the user is already waiting.
- **Do not split your home screen.** The initial bundle should contain what the first paint needs.
- **Verify with your build output**, not with faith: if a chunk is still in the main bundle, the dynamic import is being hoisted or the module is imported statically elsewhere.
- **A fallback is a promise to the user** — make it a skeleton that matches the layout, not a bare "Loading…" that shifts everything when it resolves.

---

## 8. The accessibility details that make it feel like navigation

A real page load does things for free that a client-side navigation must do deliberately:

| Browser does it on a page load | Do this in an SPA |
| --- | --- |
| announces the new page title | set `document.title` per screen |
| moves focus to the top of the document | move focus to the `<h1>` or a skip target |
| resets scroll to the top | `ScrollRestoration` / `ScrollToTop` (section 6) |
| announces "page loaded" to screen readers | an `aria-live` region for route changes |

```tsx
// File: src/components/RouteAnnouncer.tsx
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const heading = document.querySelector('h1');
    document.title = heading === null ? 'Shop admin' : `${heading.textContent} · Shop admin`;

    const main = document.getElementById('main');
    main?.focus();                                  // tabindex="-1" on <main> for this to work

    if (ref.current !== null) ref.current.textContent = `${heading?.textContent ?? 'Page'} loaded`;
  }, [pathname]);

  return <div ref={ref} role="status" aria-live="polite" className="visually-hidden" />;
}
```

```html
<!-- index.html: the skip link + a focusable main region -->
<a href="#main" class="skip-link">Skip to content</a>
…
<main id="main" tabindex="-1">…</main>
```

Three more details worth having:

- **`aria-current="page"`** on the active nav item — free with `<NavLink>`.
- **Do not move focus on the *first* render** (the user has not navigated yet); the effect above re-runs on `pathname` changes only, which is what you want.
- **Announce errors in a live region**, not just visually (Part 8 does this for forms).

---

## 9. Navigation recipes

```tsx
// A "Back" button that behaves like the browser's Back (and is hidden if there is no history).
function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => void navigate(-1)}>← Back</button>;
}
```

```tsx
// Cancel a form: leave without polluting history.
function CancelButton({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => void navigate(`/orders/${orderId}`, { replace: true })}>Cancel</button>;
}
```

```tsx
// Redirect after create, with the new record's id.
function useCreateOrder() {
  const navigate = useNavigate();
  return async (draft: OrderDraft) => {
    const created = await createOrder(draft);                 // Part 7
    await navigate(`/orders/${created.id}`, { replace: true }); // no "back to the form"
  };
}
```

```tsx
// A "sign out" that ends nowhere confusing: replace, so Back does not re-enter the app.
function SignOutButton() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        signOut();
        void navigate('/', { replace: true });
      }}
    >
      Sign out
    </button>
  );
}
```

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `<a href="/in-app">` | full reload, lost state, slower navigation | `<Link to="/in-app">` |
| 2 | expecting `<Link>` to handle external URLs | router tries to match them | plain `<a href>` for external links |
| 3 | forgetting `end` on a parent `NavLink` | the parent stays highlighted on every child page | `<NavLink to="/orders" end>` |
| 4 | re-implementing active state with `useLocation()` | subtle mismatches, no `aria-current` | let `<NavLink>` do it |
| 5 | pushing after login/save/delete | Back returns to login or a deleted record | `{ replace: true }` |
| 6 | navigating during render | infinite loop, "Too many re-renders" | `<Navigate>` or an event handler |
| 7 | ignoring `useNavigate`'s promise when you need ordering | code runs before the new route exists | `await navigate(...)` (data mode) |
| 8 | a full-screen spinner for every navigation | flicker on fast routes | delay the indicator, or rely on data-mode's "keep old screen" behaviour |
| 9 | no scroll handling | the next page opens at the previous scroll offset | `ScrollRestoration`, or `ScrollToTop` |
| 10 | `React.lazy` on a component with a named export only | "Element type is invalid" | `.then(module => ({ default: module.Named }))` |
| 11 | splitting everything | dozens of tiny chunks, waterfall requests | split per route, keep first paint in the main bundle |
| 12 | never setting `document.title` or focus | screen-reader users do not know the page changed | `RouteAnnouncer` (section 8) |

---

## 11. Best practices

1. **`<Link>` for in-app, `<a>` for outside** — and let `<NavLink>` own active styling.
2. **Decide push vs replace deliberately** for every navigation; the table in section 3 is the decision aid.
3. **`navigate` in handlers, `<Navigate>` in render** — never in the render body of a component you expect to stay mounted.
4. **One global pending indicator plus per-link `isPending`**, never a blocking modal.
5. **Restore scroll, set titles, move focus, announce changes** — four small components that make an SPA feel like a site.
6. **Split per route** and verify in the build output.
7. **Hide the Back button when there is no history** (`useNavigationType() === 'POP' && location.key === 'default'` is the signal) rather than shipping a button that does nothing.
8. **Keep URLs the contract**: every navigation target must also work as a pasted deep link (file 01).
9. **Prefer `Link` over `navigate` in JSX** — a link is keyboard-accessible, right-clickable, and shows its destination on hover; `navigate` is for decisions the user did not make by clicking a link.
10. **Log `useNavigationType()` while developing** so push/replace is a choice you made, not an accident.

---

## 12. Practice

### Beginner — a nav bar that knows where you are

1. Build a layout with `<NavLink>`s for `/`, `/products`, `/products/new`, `/orders`.
2. Style the active link with `className={({ isActive }) => …}` and confirm at `/products/p-mouse` that "Products" is active but "/products/new" is not, and that `/` is only active at exactly `/`.
3. Inspect the rendered HTML of the active link in DevTools and find `aria-current="page"`. Note which link has it at each URL.
4. Replace the "New product" `NavLink` with a `<button onClick={() => navigate('/products/new')}>` and list two things you lost (hint: middle-click and the href).

### Intermediate — replace, pop, and a pending indicator

1. Build three screens (`/`, `/products`, `/orders`) and a toolbar with buttons: *push /orders*, *push /products*, *replace /products*, *back*, *forward*.
2. Drive it and record, for each click, the URL and `useNavigationType()`.
3. Make a "delete order" flow that navigates to `/orders` with `{ replace: true }`, and compare the Back-button behaviour with a version that pushes.
4. Add an `aria-live` pending indicator and a route announcer; navigate with the keyboard only and confirm the announcements make sense (a screen reader is ideal; a live-region viewer works in a pinch).

### Challenge — lazy routes with a measured payload

1. Create a heavy route (`/reports`) whose component imports a large dependency (a charting library, or a deliberately large local module) and split it with `React.lazy` + `Suspense`.
2. Run `npm run build` and record the chunk sizes before and after splitting.
3. Prove the split works at runtime: load `/` first, then navigate to `/reports` and watch the new file being fetched in the Network tab. Write down the size and the time.
4. Do the same with data-mode `route.lazy` (section 7) and note the difference in how the fallback behaves while the route's loader runs.
5. Then answer: how would you decide *which* routes to split in a real app? Name three signals (route weight, likelihood of visit, whether it is on the first-paint path) and one counter-example where splitting would hurt.

---

## 13. Solutions

### Beginner

```tsx
// File: src/routes/RootLayout.tsx
import { NavLink, Outlet } from 'react-router';

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link nav-link--active' : 'nav-link');

export function RootLayout() {
  return (
    <div className="app">
      <nav aria-label="Main">
        <NavLink to="/" end className={linkClass}>Home</NavLink>{' '}
        <NavLink to="/products" className={linkClass}>Products</NavLink>{' '}
        <NavLink to="/products/new" className={linkClass}>New product</NavLink>{' '}
        <NavLink to="/orders" className={linkClass}>Orders</NavLink>
      </nav>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
```

2. At `/products/p-mouse`: "Products" has the active class (it is a prefix match), "New product" does **not** (that URL is not a prefix of `/products/new`), and "Home" does not (`end` is implicit for `/`). 3. `aria-current="page"` is on exactly the active link. 4. With a `<button>` you lose middle-click/⌘-click behaviour (no href to open in a new tab) and the accessibility affordance of a link; you keep none of it back except that it is a button.

### Intermediate

3. With `{ replace: true }`, Back leaves the orders area entirely (the deleted order's URL is gone from history); with a push, Back tries to reopen the deleted record, which the app must then handle with a "not found" state (file 04). 4. Keyboard-only: the live region announces "Products loaded" after each navigation, and focus moves to `<main>` so the next Tab starts at the top of the new screen rather than continuing from the nav bar.

### Challenge

Signals for splitting: (1) **route weight** — the screens whose chunks are large (a report with charts); (2) **likelihood of visit** — settings and admin reports are visited by few users, so most users should never download them; (3) **not on the first-paint path** — a route reached only after interaction (a detail page reached from a list). A counter-example: splitting a route that *is* the landing page (or that every user hits within a second of loading) turns one download into two and delays the very screen the user came for — for that route, keep it in the main bundle (or preload it with a `<link rel="modulepreload">` / `import()` on hover).

---

## 14. Summary

- **`<Link>` = in-app navigation; `<a>` = a new document** (verified: the plain anchor asked jsdom to load another document, which is exactly what a browser would do).
- **`<NavLink>`** adds `isActive`/`isPending`/`isTransitioning` and `aria-current="page"`; remember **`end`** for parent URLs (verified: `Orders=active` only at `/orders`).
- **`useNavigate`** exposes push, `{ replace: true }`, `navigate(-1)`/`navigate(1)`, and `state`; verified sequence — push, push, back, forward, then `replace` which made the intermediate entry disappear (`back → /`).
- Use **`replace`** after sign-in, after delete, and in redirects; use **push** for user choices.
- **`useNavigation()`** drives pending UI in data mode (verified: `navigation.state=loading to /admin/products?slow=1&q=key` → `idle`); `NavLink`'s `isPending` gives you the per-link version.
- **Scroll**: `ScrollRestoration` (data mode) or a `ScrollToTop` component (declarative); `preventScrollReset` when a filter should not jump to the top.
- **Lazy routes**: `React.lazy` + `Suspense` (needs a default export) or data-mode `route.lazy` (verified separate chunk: `ReportsPage-*.js 0.24 kB` beside a 330 kB main bundle).
- **Accessibility is part of navigation**: titles, focus, an `aria-live` announcer, and a skip link — four small components that make the app feel like a website to everyone.

---

**What's next →** [Part 7 — API Integration](../07-api-integration/01-http-basics.md): the network. How HTTP actually works (methods, status codes, headers, CORS), `fetch` in depth (AbortController, timeouts, JSON, error handling), when to reach for Axios, and then the CRUD series — GET, POST, PUT, PATCH, DELETE — each with a real API, loading/error/empty states, and the React patterns that keep requests out of render.
