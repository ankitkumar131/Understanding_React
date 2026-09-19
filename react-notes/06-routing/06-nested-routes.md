# 06 — Nested Routes: `<Outlet/>`, Layouts, and Relative Links

> **Part 6 · Routing · File 6 of 8**
> Why this file exists: a real app has a sidebar, a header, and a tab bar that must survive navigation — and child screens that must live *inside* them. That is what nested routes are for. This file shows `<Outlet/>` in action (measured: navigating between children kept `same <nav> DOM node? true`), how relative child paths and relative links work, the difference between `to=".."` and `to=".." relative="path"` (measured: from `/orders/ORD-1001/edit` the first goes to `/orders`, the second to `/orders/ORD-1001`), how to pass data from a layout to its children with outlet context, and when nesting starts costing more than it gives.

---

## 1. The problem nesting solves

```text
/orders                → sidebar + orders list
/orders/ORD-1001       → sidebar + order detail
/orders/ORD-1001/edit  → sidebar + edit form
```

Three URLs, one sidebar. Without nesting you would render the sidebar in each screen and it would **remount** on every navigation: its scroll position, its open/closed state, its fetched data and its CSS transitions all reset. With nesting, the layout matches once and stays mounted while only the child swaps.

Measured, with a layout that logs every render:

```text
1. a nested route renders the layout once, then the child into its <Outlet/>:
   [layout] rendering for /orders
   rendered: Orders section · Orders list
   [layout] rendering for /orders/ORD-1001
   after clicking the relative link "ORD-1001": Order detail
   same layout DOM node? true
```

The layout **re-renders** (it is part of the same React tree) but its DOM node is the same object — React updates it in place, so component state and DOM state survive. That is the difference between "the sidebar is still there" and "the sidebar blinked".

---

## 2. `<Outlet/>`: where the child goes

```tsx
// File: src/routes/OrdersLayout.tsx
import { Outlet } from 'react-router';

export function OrdersLayout() {
  return (
    <div className="orders">
      <h2>Orders section</h2>
      <Outlet />        {/* ← the matched child route renders here */}
    </div>
  );
}
```

```tsx
// File: src/routes/AppRoutes.tsx (fragment)
<Route path="/orders" element={<OrdersLayout />}>
  <Route index element={<OrdersList />} />
  <Route path=":orderId" element={<OrderDetail />} />
  <Route path=":orderId/edit" element={<EditOrder />} />
</Route>
```

Rules to internalise:

- **A parent route renders if *any* of its children match.** `/orders/ORD-1001/edit` renders `OrdersLayout` **and** `EditOrder`. Verified: the layout logged `rendering for /orders/ORD-1001/edit` when that URL was opened or linked to.
- **No `<Outlet/>`, no child UI.** If you forget it, the parent renders and the child silently disappears — the most common "my nested route shows nothing" bug.
- **`<Outlet/>` renders the *closest matched child*.** Siblings never render at the same time.
- **You can place `<Outlet/>` anywhere** — inside a grid cell, below a title, in a card. It is a placeholder, not a wrapper.

---

## 3. Child paths are relative

```tsx
<Route path="/orders" element={<OrdersLayout />}>
  <Route path=":orderId" element={<OrderDetail />} />        {/* /orders/:orderId        */}
  <Route path=":orderId/edit" element={<EditOrder />} />      {/* /orders/:orderId/edit   */}
</Route>
```

A child `path` **without a leading slash** is appended to the parent's path. With a leading slash it is absolute and starts from the root — which still works, but it breaks the "this module owns everything under `/orders`" idea and makes the route table harder to move:

```tsx
<Route path="/orders" element={<OrdersLayout />}>
  <Route path=":orderId" element={<OrderDetail />} />          {/* ✅ relative */}
  <Route path="/orders/:orderId/edit" element={<EditOrder />} /> {/* ⚠️ absolute: works, but couples */}
</Route>
```

💡 **Rule of thumb:** the top-level table uses absolute paths (so you can read the app's URL map in one place); everything nested inside a parent uses relative paths.

---

## 4. Index routes: the default child

```tsx
<Route path="/orders" element={<OrdersLayout />}>
  <Route index element={<OrdersList />} />          {/* renders at exactly /orders */}
  <Route path=":orderId" element={<OrderDetail />} />
</Route>
```

Verified matching chain (from file 03):

```text
/orders              → /orders → (index of /orders) · params={}
/orders/ORD-1001     → /orders → :orderId · params={"orderId":"ORD-1001"}
```

Without an index route, `/orders` matches the layout alone and the `<Outlet/>` is empty — a sidebar next to nothing. That is not an error message, so beginners often stare at a blank panel wondering what broke. **If a parent route has children, give it an index route** (or a `*` route) so its own URL is never half-rendered.

---

## 5. Relative links

Links inside a nested route resolve **relative to the route's path**, not to the site root:

```tsx
// Inside the index route of /orders:
<Link to="ORD-1001">Open ORD-1001</Link>       {/* → /orders/ORD-1001   (verified) */}

// Inside the :orderId route (/orders/ORD-1001):
<Link to="edit">Edit (relative)</Link>          {/* → /orders/ORD-1001/edit (verified) */}
```

The alternative — building absolute paths everywhere — is not wrong, just brittle:

```tsx
<Link to={`/orders/${orderId}`}>…</Link>            {/* absolute: repeats the route prefix */}
<Link to={orderId}>…</Link>                          {/* relative: survives a URL redesign */}
```

If the section ever moves from `/orders` to `/admin/orders`, relative links keep working and only the route table changes. That is the practical payoff.

---

## 6. `..` — and the difference that confuses everyone

From `/orders/ORD-1001/edit`, which is the route pattern `path=":orderId/edit"` nested under `path="/orders"`:

```text
to=".."                       → /orders            (Orders list)
to=".." relative="path"       → /orders/ORD-1001   (Order detail)
```

Both are correct; they answer different questions:

| Prop | Meaning | Effect of `..` |
| --- | --- | --- |
| `relative="route"` (**default**) | go up one step in the **route tree** | removes **all** URL segments belonging to the current route pattern (`:orderId/edit`), landing on the parent route |
| `relative="path"` | go up one step in the **URL path** | removes **exactly one** segment |

So a "Back to orders" link inside a deeply nested screen usually wants the route-relative default (`to=".."` from `:orderId/edit` lands on `/orders`), while a "Back to the order" link from the edit screen wants `relative="path"` (one segment up). Verified in the lab:

```tsx
<Link to="..">Up one (route-relative default)</Link>          {/* /orders            */}
<Link to=".." relative="path">Up one (path-relative)</Link>   {/* /orders/ORD-1001   */}
```

⚠️ When you use `relative="path"`, `..` is also relative to the **current URL**, not the route pattern — so `/orders/ORD-1001/edit/` (extra slash) or a URL with a splat can behave differently. Prefer the default unless you specifically want "one segment up".

---

## 7. Passing data from a layout to its children

A layout often knows something its children need: the section name, a fetched record, a calculation. `<Outlet context>` is the built-in channel — available in all three modes:

```tsx
// File: src/routes/OrdersLayout.tsx — the layout provides.
import { Outlet, useLocation } from 'react-router';

export function OrdersLayout() {
  const location = useLocation();
  const currentId = location.pathname.split('/')[2];       // "ORD-1001" or undefined

  return (
    <div className="orders">
      <h2>Orders section</h2>
      <Outlet context={{ section: 'orders', helpUrl: '/help/orders', currentId }} />
    </div>
  );
}
```

```tsx
// File: src/routes/OrderDetail.tsx — a child consumes.
import { useOutletContext } from 'react-router';

interface OrdersOutletContext {
  section: string;
  helpUrl: string;
  currentId: string | undefined;
}

export function OrderDetail() {
  const { helpUrl } = useOutletContext<OrdersOutletContext>();
  return (
    <section>
      <h1>Order detail</h1>
      <a href={helpUrl}>Help for orders</a>
    </section>
  );
}
```

Verified — the context arrives at both children, and the type is declared once and reused:

```text
rendered: Orders section · Orders list
context from the layout: orders
```

Three things to know:

1. **`useOutletContext` returns `unknown` unless you pass a type argument.** Always declare the interface next to the layout and export it, so children cannot drift.
2. **Only the *closest* outlet's context is available.** Nested layouts each provide their own; a grandchild reads its nearest parent's.
3. **A context value created inline (`{ section, currentId }`) is a new object on every render**, so children re-render whenever the layout does — fine for this shape, but if the value is expensive to compute, memoise it (Part 4, file 07).

Compare with React context (Part 5, file 09): outlet context is scoped to *this route branch* and does not need a provider/consumer pair, while React context is app-wide. If the value is only meaningful inside one section, outlet context is the better fit.

---

## 8. Deep links into nested routes

Opening `/orders/ORD-1001/edit` in a fresh tab renders `OrdersLayout` **and** `EditOrder` — the router matches the whole chain before rendering anything. Verified above: the layout logs a render for the full child URL. This is why nested routes need no special handling for deep links, and why the server rewrite (file 01) matters so much: it is the only thing standing between your users and a 404.

---

## 9. Breadcrumbs

Breadcrumbs need two things: the current URL chain, and a human label per step. React Router's `useMatches()` gives you the first — but only in **data/framework mode** (the mode-availability table in file 02 lists `useMatches` as data-only). In declarative mode, build the crumbs from the pathname or from a small map:

```tsx
// File: src/components/Breadcrumbs.tsx — works in any mode.
import { Link, useLocation } from 'react-router';

const LABELS: Record<string, string> = {
  orders: 'Orders',
  products: 'Products',
  edit: 'Edit',
  new: 'New',
};

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Breadcrumb">
      <Link to="/">Home</Link>
      {segments.map((segment, index) => {
        const to = `/${segments.slice(0, index + 1).join('/')}`;
        const label = LABELS[segment] ?? segment;
        return (
          <span key={to}>
            {' › '}
            {index === segments.length - 1 ? <span aria-current="page">{label}</span> : <Link to={to}>{label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}
```

In data mode the same UI is driven by data instead of strings, which is nicer when a crumb needs the record's name (`Order ORD-1001`, not `ORD-1001`):

```tsx
// File: src/dr/Breadcrumbs.tsx — data mode only.
import { Link, useMatches } from 'react-router';

interface CrumbHandle {
  crumb: (data: unknown) => string;
}

export function Breadcrumbs() {
  const matches = useMatches();                 // every matched route, with its handle + loader data
  const crumbs = matches.filter((match) => (match.handle as CrumbHandle | undefined)?.crumb !== undefined);

  return (
    <nav aria-label="Breadcrumb">
      {crumbs.map((match, index) => (
        <span key={match.pathname}>
          {index > 0 && ' › '}
          <Link to={match.pathname}>{(match.handle as CrumbHandle).crumb(match.loaderData)}</Link>
        </span>
      ))}
    </nav>
  );
}
```

```ts
// Where the label comes from: a `handle` on the route object.
{ path: 'orders/:orderId', loader: orderLoader, handle: { crumb: (data: { orderId: string }) => `Order ${data.orderId}` } }
```

---

## 10. When nesting hurts

Nesting is a tool, not a virtue. Three situations where a flat table is better:

| Symptom | Why it happens | What to do instead |
| --- | --- | --- |
| the layout fetches what the child already fetches | two components need the same record | fetch once in the layout and pass it via outlet context, or use a loader + `useRouteLoaderData` (file 08) |
| five levels of routes, none of which render UI | you are using nesting as folder structure | use prefix routes or flat paths; nest only where a layout renders |
| the parent's URL becomes meaningless (`/a/b/c/d`) | nesting for the sake of purity | flatten the top-level paths; keep nesting for shared UI only |

The guideline: **nest when a shared layout renders. Prefix when you only need paths grouped.** (File 03, section 4 defines both.)

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | forgetting `<Outlet/>` in the layout | the child never appears; the sidebar shows alone | add the placeholder where the child should render |
| 2 | adding `<Outlet/>` to a route with no children | nothing extra renders — harmless but confusing | remove it, or make the route a parent |
| 3 | absolute child paths everywhere | moving a section means editing every route | relative child paths inside a parent |
| 4 | using a leading slash in a child `path` by accident | the child escapes the parent and loses its layout | drop the slash |
| 5 | `to=".."` expecting "one segment up" | lands on the parent route (`/orders`, not `/orders/ORD-1001`) — measured | `relative="path"` when you mean one segment |
| 6 | no index route under a layout | `/orders` renders an empty shell | add `<Route index …/>` |
| 7 | nesting `<Routes>` inside a route element | "no routes matched" — the inner table sees the full URL | nest `<Route>`s in the table, or use `useRoutes` |
| 8 | two layouts both rendering a `<header>` | duplicated chrome | one root layout + per-section layouts for genuinely different chrome |
| 9 | typing outlet context twice with different shapes | runtime `undefined` in a child | export one interface next to the layout |
| 10 | building breadcrumbs by string-splitting ids | crumbs read `ORD-1001 › edit` with no labels | a label map, or `useMatches` + `handle` in data mode |
| 11 | fetching the same record in layout and child | duplicate requests, flicker | fetch once, share via outlet context or a loader |
| 12 | nesting to mirror the folder tree | deep URLs with no UI benefit | nest only where a layout renders |

---

## 12. Best practices

1. **One root layout** (`RootLayout`) with the app header/footer, then per-section layouts for genuinely different chrome (admin sidebar, checkout steps).
2. **Always pair a layout with an index route**, so the parent URL renders something complete.
3. **Relative paths for children, absolute paths at the top level** — the app's URL map stays readable in one file.
4. **Relative links inside a section** (`to="edit"`), absolute links for cross-section navigation.
5. **Know your `..`**: default is route-relative; `relative="path"` is one segment up.
6. **Type outlet context once**, export the interface, and keep the value small (ids and primitives, not whole stores).
7. **Give every nested screen its own `<h1>` and `document.title`** — nested layouts mean multiple headings on screen; the smallest one is the screen.
8. **Deep-link test the deepest URL** in the section, not just the section root.
9. **Prefer prefix routes when you only need grouping** — nesting for structure alone makes the URL harder to explain.
10. **Keep the nesting three levels deep at most** for UI; beyond that, use tabs or sections within one screen.

---

## 13. Practice

### Beginner — a sidebar with two sections

1. Build this tree with a shared sidebar:

```text
/                 → HomePage
/orders           → OrdersList   (inside OrdersLayout)
/orders/:orderId  → OrderDetail  (inside OrdersLayout)
/products         → ProductsPage
```

2. Give `OrdersLayout` an `<h2>Orders</h2>` and a link back to `/products`, and confirm the sidebar does **not** remount when moving from the list to a detail page (hint: put a counter in its `useState` and watch it survive).
3. Break it on purpose: delete `<Outlet/>` and describe what you see. Then add it back.

### Intermediate — relative links and `..`

1. Inside `OrderDetail`, add three links: `to="edit"`, `to=".."`, and `to=".." relative="path"`. Add an `:orderId/edit` route.
2. From `/orders/ORD-1001`, click each link and record the URL you land on.
3. Then repeat from `/orders/ORD-1001/edit` and explain why two of the links behave differently from the same starting URL.
4. Move the whole section under `/admin/orders` (one line in the route table) and confirm that the links inside still work without edits. That is the payoff of relative paths.
5. Add a `Breadcrumbs` component to the section and make the id crumb show `Order ORD-1001` rather than the raw id.

### Challenge — a settings section with outlet context and tabs

Build `/settings` as a nested section with a layout that:

1. renders a tab bar (`Profile`, `Billing`, `Team`) using `<NavLink>`;
2. owns a "settings draft" it updates (`const [draftVersion, setDraftVersion] = useState(0)` plus a "mark all reviewed" button) and passes to children via `<Outlet context={{ draftVersion, markReviewed }} />`;
3. has an index route that redirects to the default tab, and a `*` route inside the section;
4. keeps one child that reads the context and displays the draft version, proving the layout state survives tab switches.

Then answer:

- Which parts of this could *not* have been done with a flat route table? Be specific about the mounted-state requirement.
- Where would you use React context instead of outlet context, and why?
- If the tab bar were 40 items and each tab fetched data, what would you change? (Think loaders — file 08 — and file 05's query params for the tab itself.)

---

## 14. Solutions

### Beginner

```tsx
// File: src/routes/AppRoutes.tsx
import { Route, Routes } from 'react-router';
import { HomePage } from './HomePage';
import { OrderDetail } from './OrderDetail';
import { OrdersLayout } from './OrdersLayout';
import { OrdersList } from './OrdersList';
import { ProductsPage } from './ProductsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductsPage />} />

      <Route path="/orders" element={<OrdersLayout />}>
        <Route index element={<OrdersList />} />
        <Route path=":orderId" element={<OrderDetail />} />
      </Route>
    </Routes>
  );
}
```

```tsx
// File: src/routes/OrdersLayout.tsx
import { Link, Outlet } from 'react-router';

export function OrdersLayout() {
  return (
    <div className="orders">
      <h2>Orders</h2>
      <Link to="/products">Browse products</Link>
      <Outlet />
    </div>
  );
}
```

2. A counter in the layout's state survives navigation — proof that React updates the same instance rather than remounting it (the measured `same <nav> DOM node? true`).
3. Without `<Outlet/>` the URL still changes and the layout re-renders, but the child's UI has nowhere to go: you see the sidebar and nothing else. That is the "nested route shows nothing" bug in its purest form.

### Intermediate

From `/orders/ORD-1001` (route pattern `:orderId`):

| Link | Lands on |
| --- | --- |
| `to="edit"` | `/orders/ORD-1001/edit` |
| `to=".."` | `/orders` (removes the whole `:orderId` pattern) |
| `to=".." relative="path"` | `/orders` (one segment up from `/orders/ORD-1001`) |

From `/orders/ORD-1001/edit` (pattern `:orderId/edit`):

| Link | Lands on |
| --- | --- |
| `to="edit"` | `/orders/ORD-1001/edit/edit` (relative links append!) |
| `to=".."` | `/orders` — verified |
| `to=".." relative="path"` | `/orders/ORD-1001` — verified |

3. The two behave differently because `..` means "one level up in the route tree" by default: from the edit route that removes *both* of the pattern's segments (`:orderId/edit`), while `relative="path"` removes exactly one URL segment.
4. Moving the section is a one-line change in `AppRoutes.tsx`; the relative links resolve against whatever the parent path now is.
5. Breadcrumbs: label map plus a special case for id-looking segments:

```tsx
const label = LABELS[segment] ?? (segment.startsWith('ORD-') ? `Order ${segment}` : segment);
```

### Challenge

```tsx
// File: src/routes/settings/SettingsLayout.tsx
import { NavLink, Outlet } from 'react-router';
import { useCallback, useMemo, useState } from 'react';

export interface SettingsContext {
  draftVersion: number;
  markReviewed: () => void;
}

export function SettingsLayout() {
  const [draftVersion, setDraftVersion] = useState(0);
  const markReviewed = useCallback(() => setDraftVersion((version) => version + 1), []);
  const context = useMemo<SettingsContext>(() => ({ draftVersion, markReviewed }), [draftVersion, markReviewed]);

  return (
    <div className="settings">
      <h1>Settings</h1>
      <nav aria-label="Settings">
        <NavLink to="profile">Profile</NavLink> <NavLink to="billing">Billing</NavLink> <NavLink to="team">Team</NavLink>
      </nav>
      <Outlet context={context} />
    </div>
  );
}
```

```tsx
// File: src/routes/settings/SettingsRoutes.tsx
import { Navigate, Route } from 'react-router';
import { BillingSettings } from './pages/BillingSettings';
import { ProfileSettings } from './pages/ProfileSettings';
import { TeamSettings } from './pages/TeamSettings';
import { SettingsLayout } from './SettingsLayout';

export function SettingsRoutes() {
  return (
    <Route path="/settings" element={<SettingsLayout />}>
      <Route index element={<Navigate to="profile" replace />} />
      <Route path="profile" element={<ProfileSettings />} />
      <Route path="billing" element={<BillingSettings />} />
      <Route path="team" element={<TeamSettings />} />
      <Route path="*" element={<p>No such settings screen.</p>} />
    </Route>
  );
}
```

- **What a flat table could not do:** keep one `draftVersion` alive across tab switches while each tab is a separate URL. With flat routes each screen would own its own state, and any "reviewed" progress would vanish on navigation.
- **React context instead of outlet context** when the value is needed *outside* the route branch (a header badge, a toast service, the signed-in user). Outlet context is scoped to the section — which is exactly right for a settings draft.
- **40 tabs with data:** move the tab to the query string (`?tab=billing`) only if the tabs share one screen; otherwise keep routes and add a `loader` per tab so the router fetches in parallel and handles pending states (file 08), plus lazy loading so 40 tab bundles are not downloaded up front.

---

## 15. Summary

- **Nested routes share a layout**: the parent matches once and stays mounted while children swap in. Measured: `same <nav> DOM node? true` across child navigations.
- **`<Outlet/>` is the placeholder** for the matched child; forget it and the child silently disappears.
- **Child paths are relative** (`path=":orderId"`, not `/orders/:orderId`); reserve absolute paths for the top-level table.
- **Index routes** give a parent URL its own screen — always add one under a layout.
- **Relative links** resolve against the route (`to="edit"` → `…/edit`); `to=".."` is route-relative by default and `relative="path"` removes exactly one segment — verified from `/orders/ORD-1001/edit`: `/orders` versus `/orders/ORD-1001`.
- **Outlet context** passes layout data to children with a typed shape and no provider: `useOutletContext<SettingsContext>()`.
- **Breadcrumbs** come from the pathname in declarative mode, or `useMatches` + a route `handle` in data mode (where the crumb can use loader data).
- **Nest where a layout renders; prefix where you only need grouping.** More nesting is not more structure — it is more coupling.

---

**What's next →** [`07-protected-routes.md`](./07-protected-routes.md): pages only some users may see. A `RequireAuth` wrapper built on the auth context from Part 5 (verified: `/orders` while signed out becomes `/login` with `navigationType=REPLACE` and `state.from="/orders"`), returning the user to where they were going after sign-in (verified), role-based checks, avoiding the flash of protected content, why loaders are the better place for the check (verified: `requireUserLoader(/admin/orders) → redirect to /login`), and the sentence every tutorial should print in bold: **a client-side guard is not security.**
