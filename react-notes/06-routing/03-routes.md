# 03 — Routes: Index Routes, Layout Routes, Splats, and Ranking

> **Part 6 · Routing · File 3 of 8**
> Why this file exists: `<Route path element>` is the first thing you learn and the last thing you understand. This file answers the questions that produce blank screens: what does `index` mean, what is a route with no `path` for, why did `/orders/new` render the `:orderId` page, why does `/Products` match `/products`, and what exactly does `*` give you? Every matching result below is real output from `matchPath`/`matchRoutes` in React Router 8.4.

---

## 1. The two props that matter

```tsx
<Routes>
  <Route path="/products" element={<ProductsPage />} />
</Routes>
```

- **`path`** — the URL pattern this rule matches. Absolute (`/products`) or relative to the parent route (`:orderId` inside `/orders`).
- **`element`** — the JSX to render when the rule wins. One element; wrap several in a fragment or a layout component.

Two more props you will use constantly:

- **`index`** — "this route renders at the parent's URL" (section 3).
- **`children`** — nested routes; they render into the parent's `<Outlet/>` (file 06).

And one prop you will read about elsewhere: **`Component`** (capital C) — the component *itself* rather than an element — which is the route-object style used by data mode; with `<Route>` you can write `<Route path="/x" Component={Page} />` too, and it is equivalent to `element={<Page />}` (React Router calls it with no props for you).

---

## 2. Path patterns you can write

```tsx
<Route path="/products" element={<ProductsPage />} />          {/* static          */}
<Route path="/products/:productId" element={<ProductDetailPage />} />  {/* dynamic  */}
<Route path="/orders/:orderId/edit" element={<EditOrderPage />} />     {/* mixed    */}
<Route path="/files/*" element={<FileViewer />} />              {/* splat            */}
<Route path="/:lang?/categories" element={<Categories />} />    {/* optional         */}
```

Measured behaviour of one dynamic pattern against several URLs:

```text
"/products/:productId" vs /products                  → NO MATCH
"/products/:productId" vs /products/p-mouse          → {"productId":"p-mouse"}
"/products/:productId" vs /products/p-mouse/reviews  → NO MATCH
"/products/:productId" vs /orders/new                → NO MATCH
```

Three rules fall out of that output, and beginners break all three:

1. **A dynamic segment stands for exactly one segment.** `:productId` matched `p-mouse` and refused `p-mouse/reviews`.
2. **A pattern without a `*` never matches extra segments.** If you want "this URL and everything under it", you must say so (section 5).
3. **Nothing matches unless the whole pattern matches.** React Router does not do prefix matching by accident — the parent/child structure is how you opt into that.

⚠️ **A dynamic segment is a whole segment.** `/products/:productId` matches `/products/p-mouse`. If you write `path="/c/:categoryId/p/:productId"` you are asking for a URL shaped `/c/audio/p/sp-42` — with a literal `p` segment in the middle. A URL like `/c/audio/p-speaker` has *three* segments (`c`, `audio`, `p-speaker`) and will not match. This exact confusion cost me a probe run while writing this file; it is the most common "why is my route not matching?" bug after trailing-slash thinking.

---

## 3. Index routes: the default child

```tsx
<Routes>
  <Route path="/orders" element={<OrdersLayout />}>
    <Route index element={<OrdersListPage />} />       {/* renders at /orders          */}
    <Route path="new" element={<NewOrderPage />} />    {/* renders at /orders/new      */}
    <Route path=":orderId" element={<OrderDetailPage />} />  {/* at /orders/ORD-1001   */}
  </Route>
</Routes>
```

An **index route** renders into its parent's `<Outlet/>` at the parent's URL. Think of it as `path=""` spelled differently: it is the screen you get when the parent path is reached and nothing more specific matches.

Verified chain of matches:

```text
/orders              → /orders → (index of /orders) · params={}
/orders/ORD-1001     → /orders → :orderId · params={"orderId":"ORD-1001"}
```

Rules that surprise people:

- **An index route cannot have children.** If you find yourself wanting that, you want a layout route (section 4).
- **An index route has no `path`.** `<Route index path="x" />` is a type error.
- **Index is not the fallback for "unknown child".** `/orders/banana` still matches `:orderId` — *that* is where your "order not found" UI belongs (file 04), not in the index route.

---

## 4. Layout routes and prefix routes

Two kinds of route that exist only to organise other routes:

```tsx
{/* Layout route: no path, has an element (renders shared UI around children) */}
<Route element={<AdminLayout />}>
  <Route path="/orders" element={<OrdersPage />} />
  <Route path="/products" element={<ProductsPage />} />
</Route>

{/* Prefix route: has a path, no element (groups paths, adds no UI) */}
<Route path="/settings">
  <Route index element={<SettingsHome />} />
  <Route path="profile" element={<ProfileSettings />} />
  <Route path="billing" element={<BillingSettings />} />
</Route>
```

| Kind | `path` | `element` | Effect |
| --- | --- | --- | --- |
| Normal route | yes | yes | matches a URL and renders UI |
| **Layout route** | **no** | yes | renders UI around its children, contributes **no** URL segment |
| **Prefix route** | yes | **no** | contributes a URL segment, renders no UI of its own |
| Index route | no | yes | renders at the parent's URL |

Why "prefix route" is genuinely useful: it lets you collect `/settings`, `/settings/profile`, `/settings/billing` under one parent so the paths stay readable and **relative child paths** (`profile`) work, without forcing a layout component on them (for example, when each screen renders its own layout and only some share one).

---

## 5. Splats: `*` inside a path

```tsx
<Route path="/files/*" element={<FileViewer />} />
```

```text
"/files/*" vs /files/a/b/c.txt → {"*":"a/b/c.txt"}
```

The matched-but-unmapped rest of the URL arrives as `params['*']`:

```tsx
// File: src/routes/FileViewer.tsx
import { useParams } from 'react-router';

export function FileViewer() {
  const { '*': filePath } = useParams();     // you must rename it while destructuring
  return <p>Viewing {filePath}</p>;          // e.g. "a/b/c.txt"
}
```

Splats are how you build file explorers, docs readers (`/docs/getting-started/install`), and **catch-all 404 pages** (`path="*"`). Note the two different jobs:

| Pattern | Matches | Typical use |
| --- | --- | --- |
| `/files/*` | `/files/anything/at/all` | one screen renders the whole subtree itself |
| `*` (top level) | **every URL not matched by anything else** | 404 page |

---

## 6. Ranking: who wins when several routes match

React Router scores every matching route and picks the **best** one. Order in the file is irrelevant, which is why the same route table written two ways behaves identically:

```text
dynamic first  → matched /orders/new · params={}
static first   → matched /orders/new · params={}
/orders/new with "dynamic first" still renders the static route: true
```

From least to most specific, the scoring intuition is:

```text
*,  /*            (splat)                    weakest
:param            (dynamic segment)
literal segment   (static)
index                                                  strongest
```

A richer example with three patterns that all *could* match:

```text
/products/new              → /products/new          (static wins)
/products/p-mouse          → /products/:productId   (:param wins over splat)
/products/p-mouse/reviews  → /products/*            (only the splat can)
```

💡 **So you may order routes however you like** — but humans read top to bottom, so put specific routes before general ones anyway. Consistency beats cleverness when someone debugs the table at 2 a.m.

---

## 7. Case, trailing slashes, and other matching details

Measured:

```text
"/products" vs /products/  → {}      (trailing slash tolerated)
"/:lang?/categories" vs /categories   → {}                (optional segment absent)
"/:lang?/categories" vs /en/categories → {"lang":"en"}     (optional segment present)
"/products" vs /Products   → {}      (case-insensitive by default!)
```

| Detail | Behaviour | How to change it |
| --- | --- | --- |
| **Case** | case-**insensitive** (`/Products` matches `/products`) | `<Route caseSensitive path="/products" … />` |
| **Trailing slash** | tolerated on both sides | nothing to do; do not rely on it as a different route |
| **Optional segments** | `:lang?` matches with or without | — |
| **URL-encoded values** | decoded before you get them in `useParams` (`/products/a%20b` → `"a b"`) | use `encodeURIComponent` when building links |
| **Query string** | ignored by matching | read it with `useSearchParams` (file 05) |
| **Hash** | ignored by matching | never sent to the server (file 01) |

⚠️ **Case-insensitivity is a footgun for data.** `/Products` matching `/products` means users can bookmark either; if your server or analytics treat them as different URLs, you get duplicate reports. Use one casing in every link you write.

---

## 8. The 404 page, done properly

```tsx
// File: src/routes/NotFoundPage.tsx
import { Link, useLocation } from 'react-router';

export function NotFoundPage() {
  const location = useLocation();
  return (
    <section>
      <h1>404 — page not found</h1>
      <p>
        Nothing is routed at <code>{location.pathname}</code>.
      </p>
      <Link to="/">Go home</Link>
    </section>
  );
}
```

```tsx
// File: src/routes/AppRoutes.tsx (fragment)
<Route path="*" element={<NotFoundPage />} />
```

What makes it good:

1. **It echoes the path** (`useLocation().pathname`) — the single most useful piece of information for a user who mistyped, and for you when they report it.
2. **It offers a way out** (a link home, or a search box).
3. **It sits at the level where "not found" makes sense.** A top-level `*` catches everything; a `*` inside `/orders` catches only unknown order URLs and can render *inside* the admin layout:

```tsx
<Route path="/orders" element={<AdminLayout />}>
  <Route index element={<OrdersListPage />} />
  <Route path=":orderId" element={<OrderDetailPage />} />
  <Route path="*" element={<p>No such orders screen.</p>} />
</Route>
```

⚠️ **A 404 page is not the same as "the record was not found".** `/orders/banana` *is* a valid route (`:orderId` matched); the record just does not exist. That is a *screen state* — render "Order banana not found" with a link back, do not redirect to the 404 route. Data mode gives you a third option: throw a `404` response from the loader and let the route error boundary render it (file 08).

---

## 9. Building a route table that scales

```text
src/routes/
├── AppRoutes.tsx            ← composes the pieces below
├── admin/
│   ├── AdminRoutes.tsx      ← /orders, /settings
│   ├── AdminLayout.tsx
│   └── pages/…
└── shop/
    ├── ShopRoutes.tsx       ← /products, /products/:productId
    └── pages/…
```

```tsx
// File: src/routes/AppRoutes.tsx
import { Route, Routes } from 'react-router';
import { HomePage } from './HomePage';
import { LoginPage } from './LoginPage';
import { NotFoundPage } from './NotFoundPage';
import { AdminRoutes } from './admin/AdminRoutes';
import { ShopRoutes } from './shop/ShopRoutes';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Each module owns its own slice of the URL space. */}
      {ShopRoutes()}
      {AdminRoutes()}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

```tsx
// File: src/routes/shop/ShopRoutes.tsx — a fragment of <Route> elements.
import { Route } from 'react-router';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductsPage } from './pages/ProductsPage';

export function ShopRoutes() {
  return (
    <>
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/:productId" element={<ProductDetailPage />} />
    </>
  );
}
```

💡 Route components can be composed like any other React component: a function that returns `<Route>` elements, called inside `<Routes>`. Keep each module's paths together and the top-level file stays readable at fifty routes.

---

## 10. Route objects: the same tree, as data

Everything above has a data form, which is what data mode consumes (file 08):

```ts
// File: src/routes/routeConfig.ts
import type { RouteObject } from 'react-router';
import { HomePage } from './HomePage';
import { ProductDetailPage } from './ProductDetailPage';
import { ProductsPage } from './ProductsPage';

export const routes: RouteObject[] = [
  { index: true, Component: HomePage },
  { path: 'products', Component: ProductsPage },
  { path: 'products/:productId', Component: ProductDetailPage, loader: productLoader },
  { path: '*', Component: NotFoundPage },
];
```

| JSX form | Route-object form |
| --- | --- |
| `<Route path="x" element={<Page />} />` | `{ path: 'x', element: <Page /> }` or `{ path: 'x', Component: Page }` |
| `<Route index element={<Page />} />` | `{ index: true, Component: Page }` |
| `<Route element={<Layout />}>…</Route>` | `{ Component: Layout, children: [...] }` |
| nested `<Route path="child" …/>` | `children: [ … ]` |

The object form can be *generated* (loops, config arrays, feature modules), typed as `RouteObject[]`, and — for data mode — carries `loader`, `action`, `ErrorBoundary`, and `lazy` alongside the UI.

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | thinking `:param` can match several segments | `/products/:id` never matches `/products/a/b` | add `/*` or restructure the paths |
| 2 | a dynamic segment in the middle of a word-paragraph (`/c/:categoryId/p/:productId` for `/c/audio/p-speaker`) | "no route matches" | count the segments: dynamic segments replace **whole** segments |
| 3 | forgetting the index route | `/orders` shows a shell with an empty outlet | add `<Route index element={…} />` |
| 4 | giving an index route a `path` or children | type error, or a route that never renders | use a layout route instead |
| 5 | treating a record-level "not found" as a route-level 404 | the admin layout disappears when one record is missing | render the state inside the screen, or throw a `Response` in data mode |
| 6 | relying on the *order* of routes | fragile tables, "it broke when I sorted them" | rely on ranking; order for readability only |
| 7 | assuming paths are case-sensitive | `/Products` silently renders `/products` with duplicated analytics | fix link casing, or `caseSensitive` |
| 8 | one giant `AppRoutes.tsx` | merge conflicts every sprint | split per feature module (section 9) |
| 9 | nesting `<Routes>` inside a route element | the inner table sees the full URL and matches nothing | use nested `<Route>`s + `<Outlet/>` (file 06) |
| 10 | a `*` route declared *above* the specific ones, expecting it to act as a default | (it still loses the ranking contest — but it confuses humans) | keep `*` last |
| 11 | no `*` route at all | blank screen instead of a helpful message | always add one |
| 12 | building links by string concatenation with unencoded values | broken links for names with spaces/`/` | `encodeURIComponent`, or `generatePath('/products/:id', { id })` |

---

## 12. Best practices

1. **One route table, split per feature**, composed in `AppRoutes.tsx`.
2. **Read a route table like a URL map**: if a URL exists, some line must explain it; if a line exists, some URL deserves it.
3. **Prefer flat absolute paths over deeply nested relative ones** until nesting buys you a shared layout (file 06 explains when it does).
4. **Use `index` for "the list at the parent URL"** and `:param` for "one record" — the pair `OrdersPage` (index) / `OrderDetailPage` (`:orderId`) appears in every CRUD app.
5. **Always add a `*` route** and make it useful (echo the path, link home).
6. **Encode values when building links**; use `generatePath` for parameterised patterns.
7. **Keep route paths lowercase**, dash-separated, and plural for collections (`/orders`).
8. **Reserve the splat for genuinely open-ended depth** (docs, file browsers) — do not use `*` to mean "any child" (`:param` says that better).
9. **Distinguish "route not found" from "record not found"**, and make both look deliberate.
10. **Write down the route table in your README** (`/orders/:orderId → OrderDetailPage → signed-in users`), because it is the contract with your users' bookmarks.

---

## 13. Practice

### Beginner — predict the match

1. For each URL, which route wins, and what is in `useParams()`?
   1. pattern `/products/:productId`, URL `/products/p-mouse`
   2. pattern `/products/:productId`, URL `/products/p-mouse/reviews`
   3. pattern `/files/*`, URL `/files/2026/invoices/march.pdf`
   4. pattern `/:lang?/categories`, URL `/categories`
   5. routes `/orders/new` and `/orders/:orderId`, URL `/orders/new`
2. Build the `/orders` branch: an index route with the list, `:orderId` with a detail screen, and a `*` route that says "no such orders screen". Then open all four URLs: `/orders`, `/orders/ORD-1001`, `/orders/nope` and `/orders/ORD-1001/edit`.
3. Add a top-level `*` route that prints the path the user tried, and check it with `/totally/wrong`.

### Intermediate — a docs reader with a splat

1. Create a route `/docs/*` that renders a `DocsPage` reading `params['*']`.
2. Render the path as breadcrumbs (`getting-started/install` → `getting-started › install`), each crumb a `<Link>` to `/docs/<prefix>`.
3. Add a `NotFound`-style screen when the splat is empty (`/docs` exactly) — should that be an index route instead? Justify your choice in one sentence.
4. Compare two designs: `/docs/*` with one component (yours) versus `/docs/:chapter/:page` with typed params. List one advantage of each.

### Challenge — refactor the flat table into modules

Take the shop-admin route table from file 02's challenge (nine routes) and split it:

```text
src/routes/
├── AppRoutes.tsx
├── RootLayout.tsx              ← header + <Outlet/>, wraps everything
├── shop/
│   ├── ShopRoutes.tsx
│   └── pages/{ProductsPage,ProductDetailPage}.tsx
├── admin/
│   ├── AdminRoutes.tsx
│   ├── AdminLayout.tsx
│   └── pages/{OrdersPage,OrderDetailPage,NewOrderPage}.tsx
└── auth/
    └── pages/LoginPage.tsx
```

Requirements:

1. `/` renders `HomePage` under `RootLayout`; `/products` and `/products/:productId` come from `ShopRoutes`; `/orders*` comes from `AdminRoutes` and renders inside `AdminLayout`; `/login` from the auth module.
2. A `*` route inside `AdminRoutes` catches unknown admin URLs, and the top-level `*` catches everything else. Show that both branches render the right one.
3. Prove with the router's own matching helper that `/orders/new` renders the static route even if you write `:orderId` first:

```ts
import { matchRoutes } from 'react-router';
console.log(matchRoutes(routes, '/orders/new')?.at(-1)?.route.path);   // "/orders/new"
```

4. Write one paragraph explaining why "route table as modules" keeps the app maintainable at fifty routes — and what you would do differently if the table were generated from the backend (permissions-driven menus).

---

## 14. Solutions

### Beginner

1. 1) `/products/:productId` wins, `{ productId: 'p-mouse' }`. 2) **no match** (a dynamic segment matches exactly one segment; add `/products/:productId/*` if you want the subtree). 3) `/files/*`, `{ '*': '2026/invoices/march.pdf' }`. 4) `/:lang?/categories`, `{}` (the optional segment is absent). 5) `/orders/new` — the static route outranks `:orderId` (verified in section 6).
2. `/orders` → list; `/orders/ORD-1001` → detail; `/orders/nope` → **detail page showing "not found"** (the param matched; this is a record problem, not a route problem); `/orders/ORD-1001/edit` → the admin `*` route ("no such orders screen"), because `:orderId` alone cannot match two extra characters' worth of URL.
3. `/totally/wrong` renders the 404 page with `Nothing is routed at /totally/wrong`.

### Intermediate

```tsx
// File: src/routes/DocsPage.tsx
import { Link, useParams } from 'react-router';

export function DocsPage() {
  const { '*': splat } = useParams();
  const parts = (splat ?? '').split('/').filter(Boolean);

  if (parts.length === 0) return <p>Pick a chapter from the sidebar.</p>;

  return (
    <article>
      <nav aria-label="Breadcrumb">
        {parts.map((part, index) => (
          <span key={part}>
            {index > 0 && ' › '}
            <Link to={`/docs/${parts.slice(0, index + 1).join('/')}`}>{part}</Link>
          </span>
        ))}
      </nav>
      <h1>{parts.at(-1)}</h1>
    </article>
  );
}
```

Point 3: an **index route** is the better tool for `/docs` exactly — it expresses "the default page at the parent URL" and keeps the splat route for real content. The `parts.length === 0` branch works too, but it makes one component answer two different questions.
Point 4: `/docs/*` is one component and handles unlimited depth; `/docs/:chapter/:page` gives you named, typed params (`useParams<'chapter' | 'page'>()`) and per-screen validation, at the cost of a fixed depth.

### Challenge

```tsx
// File: src/routes/AppRoutes.tsx
import { Route, Routes } from 'react-router';
import { AdminRoutes } from './admin/AdminRoutes';
import { LoginPage } from './auth/pages/LoginPage';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { RootLayout } from './RootLayout';
import { ShopRoutes } from './shop/ShopRoutes';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<HomePage />} />
        {ShopRoutes()}
        {AdminRoutes()}
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

```tsx
// File: src/routes/admin/AdminRoutes.tsx
import { Route } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';

export function AdminRoutes() {
  return (
    <Route element={<AdminLayout />}>
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/new" element={<NewOrderPage />} />
      <Route path="/orders/:orderId" element={<OrderDetailPage />} />
      <Route path="/orders/*" element={<p>No such orders screen.</p>} />
    </Route>
  );
}
```

Both 404 branches work because the `*` routes live at different levels: `/orders/wrong` matches `/orders/*` (more specific) and `/wrong` falls through to the top-level `*`. Point 4: splitting by domain means a feature's URLs, layout and screens move together — one pull request touches one folder, and two teams stop editing the same file. If the table were generated from backend permissions, you would keep the *route objects* as data (`RouteObject[]`) and build them from the permission payload, then pass the array to `useRoutes` or a data router instead of hand-written JSX.

---

## 15. Summary

- A `<Route>` is a **pattern** (`path`) plus **UI** (`element`). Everything else is composition: index routes, layout routes, prefix routes, nesting.
- **Dynamic segments match exactly one segment**; without `*`, a pattern never matches extra segments. Counting segments explains 90% of "why doesn't my route match".
- **Index routes** render at the parent's URL; they cannot have children and are the right answer for "the list at `/orders`".
- **Layout routes** (no `path`) add UI around children without touching the URL; **prefix routes** (no `element`) add a URL segment without UI.
- **Splats** (`*`) hand you the remaining path as `params['*']`; the top-level `*` is your 404 page.
- **Ranking, not order, picks the winner**: static beats `:param` beats splat (verified with the routes written both ways).
- Matching is **case-insensitive** and **trailing-slash tolerant** by default (verified); set `caseSensitive` when it matters.
- Distinguish **"this URL has no route"** (404 page) from **"this record does not exist"** (a state inside a valid route).
- The same tree can be written as JSX or as `RouteObject[]` data — the latter is what data mode consumes and what generators produce.

---

**What's next →** [`04-route-parameters.md`](./04-route-parameters.md): reading values out of the URL. `useParams` in depth (it returns **strings**, always), typed params with `useParams<'productId'>()`, multiple params, optional and splat params, validation (a `:productId` that arrives as `"abc"`), the "param changed but my state did not reset" bug, and the pattern for fetching one record by id.
