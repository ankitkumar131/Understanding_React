# 02 — React Router: Install, Modes, and Your First Real Routes

> **Part 6 · Routing · File 2 of 8**
> Why this file exists: file 01 explained *what* a router manages. This file installs React Router v8, shows the three modes it now ships with (declarative, data, framework) and which one to pick, builds the smallest app that actually navigates, and explains the two import paths — `react-router` and `react-router/dom` — that replaced `react-router-dom` in v8. Everything here is verified against a real project (`react-router@8.4.0`, Vite 8.3, React 19.3).

---

## 1. Install

```text
cd /tmp
npm create vite@latest shop-admin -- --template react-ts
cd shop-admin
npm install
npm install react-router
```

```text
added 1 package, and audited 189 packages in 3s
found 0 vulnerabilities
```

Check what you got:

```json
// package.json (excerpt)
"dependencies": {
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "react-router": "^8.4.0"
}
```

⚠️ **React Router v8 requires `node@22.22+` and `react@19.2.7+` / `react-dom@19.2.7+`.** If you are on an older React, install React Router v7 instead (`npm install react-router@7`) — the APIs taught in this part are the same in both, and section 10 lists the differences.

### `react-router` versus `react-router-dom`

If you have read any tutorial written before 2025, it says `npm install react-router-dom` and imports from `'react-router-dom'`. **That package is gone in v8** — it was a re-export for compatibility in v7 and has been removed:

```text
import { Link, useLocation } from "react-router-dom";   // ❌ no longer exists in v8
import { Link, useLocation } from "react-router";       // ✅ almost everything lives here

import { RouterProvider } from "react-router-dom";      // ❌
import { RouterProvider } from "react-router/dom";      // ✅ DOM-specific APIs live here
```

The rule of thumb: **`react-router/dom` exports the pieces that touch the browser** (`RouterProvider` from `createBrowserRouter`, hydration helpers); everything else — `Routes`, `Route`, `Link`, `NavLink`, `Outlet`, `useParams`, `useNavigate`, `useSearchParams`, `createBrowserRouter`, `redirect` — comes from `react-router`.

---

## 2. The three modes

React Router is deliberately one library with three levels of help. The features are **additive**, so you can start declarative and move up later without rewriting your URLs.

| | **Declarative** | **Data** | **Framework** |
| --- | --- | --- | --- |
| What you write | `<BrowserRouter>` + `<Routes>` + `<Route>` in JSX | `createBrowserRouter([...])` route objects outside React | a file-based route folder + a Vite plugin |
| Matching, links, params, nested UI | ✅ | ✅ | ✅ |
| Loaders / actions / pending states | ❌ | ✅ | ✅ |
| Route-level `ErrorBoundary`, `lazy` | ❌ (use `React.lazy`) | ✅ | ✅ |
| Type-safe `href`, SSR/SSG choices, code splitting by convention | ❌ | ❌ | ✅ |
| Control you keep | everything | most things | routing conventions are the framework's |

The official advice, condensed:

- **Declarative** — "use React Router as simply as possible", or your data layer handles its own pending states. This is where beginners should start, and where files 02–07 of this part live.
- **Data** — you want loaders, actions, pending states and route-level errors, but you still want to control bundling and data yourself. File 08 covers this mode.
- **Framework** — you are happy for the router to be the framework (file-based routes, SSR/SPA/static strategies, type-safe params). This is what you would use instead of choosing Next.js.

⚠️ The mode is decided by **one** thing: which "top-level" router API you use. `<BrowserRouter>` = declarative. `createBrowserRouter` = data. The `@react-router/dev` Vite plugin = framework. Do not mix two of them in one app.

---

## 3. The smallest app that navigates

```text
shop-admin/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
└── src/
    ├── main.tsx              ← mounts React
    ├── App.tsx               ← puts the router around everything
    ├── index.css
    └── routes/
        ├── AppRoutes.tsx     ← the route table
        ├── HomePage.tsx
        └── NotFoundPage.tsx
```

```tsx
// File: src/routes/HomePage.tsx
import { Link } from 'react-router';

export function HomePage() {
  return (
    <section>
      <h1>Shop admin</h1>
      <p>Manage the catalogue and orders for the megashop.</p>
      <p>
        <Link to="/products">Browse products</Link> · <Link to="/orders">Open orders</Link>
      </p>
    </section>
  );
}
```

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
// File: src/routes/AppRoutes.tsx — the whole route table, in one place.
import { Route, Routes } from 'react-router';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

```tsx
// File: src/App.tsx
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

```tsx
// File: src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

---

## 4. Run it

```text
npm run dev
```

```text
  VITE v8.3.0  ready in 213 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://169.254.0.21:5173/
  ➜  press h + enter to show help
```

(Vite prints `5174` if something already owns `5173` — it never fails to start just because a port is busy.)

**Expected result**

| You do | You see |
| --- | --- |
| open `http://localhost:5173/` | heading **Shop admin** and two links |
| click **Browse products** | nothing happens yet — there is no `/products` route in this minimal table, so the `*` route renders **404 — page not found**, and the URL is `/products` |
| press **Back** | back to `/` — the router handled `popstate` for you |
| type `http://localhost:5173/whatever` | the 404 page, with `Nothing is routed at /whatever` |

That second row is worth pausing on: the URL changed, the screen changed, there was no request for a document in the Network tab. That is the whole point of an SPA router.

---

## 5. What React Router does at runtime

```text
click <Link to="/products">
  ↓ React Router's onClick handler calls event.preventDefault()      (no document request)
  ↓ history.pushState({}, '', '/products')                           (file 01's primitive)
  ↓ the router's internal state updates → subscribers re-render
  ↓ <Routes> matches the new location against the <Route> tree
  ↓ the winning route's `element` is rendered, the rest are unmounted
```

```text
user presses Back
  ↓ the browser changes the URL and fires `popstate`
  ↓ the router (a popstate listener) updates its internal state
  ↓ <Routes> re-matches and renders the previous screen
```

Everything else is a variation: `<NavLink>` adds "is this URL mine?" logic to the same click handling; `useNavigate()` calls the same `pushState` + notify path; nested routes render into an `<Outlet>` instead of the whole screen.

---

## 6. Line by line

| Line | What it does | Notes |
| --- | --- | --- |
| `import { BrowserRouter } from 'react-router'` | brings in the component that owns URL state | v8 import path — not `react-router-dom` |
| `<BrowserRouter>` | subscribes to `popstate`, provides router context | **one per app**, near the root |
| `<Routes>` | looks at the current location and picks the best match from its children | re-renders whenever the location changes |
| `<Route path="/" element={<HomePage />} />` | one rule: URL ↔ UI | `element` takes JSX, not a component reference |
| `<Route path="*" element={<NotFoundPage />} />` | catch-all | keep it **last in your mind**, but ranking (not order) decides |
| `<Link to="/products">` | renders an `<a href="/products">` and intercepts the click | keeps middle-click, ⌘/Ctrl-click, "open in new tab" working |
| `useLocation()` | the current URL as an object | re-renders the component when it changes |

⚠️ `element={<HomePage />}` is **JSX** (an element); `Component={HomePage}` (a capital-C route-object property) takes the **component itself** and is used in data-mode route objects. Mixing them up gives you a component that never renders, or a React warning about rendering an element type.

---

## 7. Where `<BrowserRouter>` goes

```tsx
// ✅ One router, around everything that needs it.
<AuthProvider>
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
</AuthProvider>
```

Three placement rules:

1. **Exactly one router per app.** Two `<BrowserRouter>`s mean two independent URL states; links inside one are invisible to the other. (For tests and Storybook you may legitimately mount a `MemoryRouter` per story — that is a separate app instance.)
2. **Anything that calls a router hook must be *inside* it.** `useNavigate()`, `useParams()`, `useLocation()` throw outside a router: *"useNavigate() may be used only in the context of a `<Router>` component."*
3. **Providers that do not need the router should stay outside** (theme, auth, query client). Providers that *do* need it — for example one that navigates on sign-out — must be inside. Order: `BrowserRouter` inside plain providers, above router-dependent ones.

```tsx
// A provider that needs the router (it redirects on sign-out) must sit inside it.
<BrowserRouter>
  <AuthProvider>      {/* uses useNavigate() internally → must be inside */}
    <AppRoutes />
  </AuthProvider>
</BrowserRouter>
```

### Serving the app from a sub-path

If the built app lives at `https://example.com/admin/` rather than the domain root, tell the router:

```tsx
// Declarative mode
<BrowserRouter basename="/admin">
  <AppRoutes />
</BrowserRouter>
```

```tsx
// Data mode (verified in this part's lab: the app boots at /admin/products)
export const router = createBrowserRouter(routes, { basename: '/admin' });
```

With a `basename`, `<Link to="/products">` produces `/admin/products`, and `useLocation().pathname` stays `/products`-relative. Also set Vite's `base` for the assets:

```ts
// vite.config.ts
export default defineConfig({ base: '/admin/', plugins: [react()] });
```

---

## 8. The dev server's SPA fallback (and why the URL bar works)

While you develop, `npm run dev` answers *every* path with `index.html`:

```text
vite preview      /                      → 200
vite preview      /products              → 200
vite preview      /products/p-keyboard   → 200
vite preview      /admin/products        → 200
```

That is why typing `http://localhost:5173/products/p-keyboard` in a fresh tab works before the route even exists. In production this fallback must be configured on the host — file 01 section 7 has the exact rules for nginx, Netlify, Vercel, Apache, and the GitHub Pages caveat.

💡 Test deep links against the **built** output too: `npm run build && npm run preview`, then paste a child URL. That is the closest thing to production without deploying.

---

## 9. The route tree grows

Add two more screens and a shared layout shell:

```tsx
// File: src/routes/AppRoutes.tsx (still declarative mode)
import { Route, Routes } from 'react-router';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { ProductsPage } from './ProductsPage';
import { ProductDetailPage } from './ProductDetailPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/:productId" element={<ProductDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

```tsx
// File: src/routes/ProductsPage.tsx
import { Link } from 'react-router';
import { formatMoney, searchProducts } from '../data/products';

export function ProductsPage() {
  const results = searchProducts('', 'none');
  return (
    <section>
      <h1>Products</h1>
      <ul>
        {results.map((product) => (
          <li key={product.id}>
            <Link to={`/products/${product.id}`}>{product.name}</Link> — {formatMoney(product.priceMinor)}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
// File: src/routes/ProductDetailPage.tsx
import { Link, useParams } from 'react-router';
import { formatMoney, getProduct } from '../data/products';

export function ProductDetailPage() {
  const params = useParams<'productId'>();
  const product = params.productId === undefined ? undefined : getProduct(params.productId);

  if (product === undefined) {
    return (
      <section>
        <h1>Product not found</h1>
        <p>There is no product with the id “{params.productId}”.</p>
        <Link to="/products">Back to products</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>{product.name}</h1>
      <p>{product.blurb}</p>
      <p className="price">{formatMoney(product.priceMinor)}</p>
      <Link to="/products">← Back to products</Link>
    </section>
  );
}
```

**Verified behaviour** from this part's lab: with the routes above, opening `/products/p-mouse` renders the heading **Wireless Mouse**, and clicking a product link changes the URL and the screen with no document request. Files 03 and 04 explain matching, ranking, and parameters properly.

---

## 10. React Router v8 in one page (what changed, what to expect)

| Topic | v6 (old tutorials) | v7 | **v8 (current)** |
| --- | --- | --- | --- |
| Package | `react-router-dom` | `react-router` (+ `react-router-dom` shim) | `react-router` only; `react-router-dom` **removed** |
| Data router | `createBrowserRouter` (v6.4+) | same | same, plus middleware and RSC support |
| `RouterProvider` import | `react-router-dom` | `react-router/dom` | `react-router/dom` |
| Nesting UI | `<Outlet/>` | `<Outlet/>` | `<Outlet/>` |
| React requirement | 16.8+ | 18+ | **19.2.7+** |
| Node requirement | 14+ | 20+ | **22.22+** |
| `Component`/`lazy` route objects | ❌ | ✅ | ✅ |

Migrating an existing v7 app is documented as "generally non-breaking": you adopt future flags on v7, then bump the package. The single change you will *definitely* make is the import path.

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `npm install react-router-dom` / importing from it | "Cannot find module 'react-router-dom'" on v8 | `react-router` for APIs, `react-router/dom` for `RouterProvider` |
| 2 | `<RouterProvider>` imported from `react-router` in a data-mode SPA | works, but you lose the DOM integration the docs expect | import from `react-router/dom` |
| 3 | two `<BrowserRouter>`s (or one inside a layout) | links update one tree while the other stays put | one router at the root |
| 4 | `useNavigate()`/`useLocation()` called in a component outside the router | "may be used only in the context of a `<Router>` component" | move the component inside, or move the router up |
| 5 | `<Route path="/products" component={ProductsPage} />` | the route renders nothing | v6+ uses `element={<ProductsPage />}` (or `Component={ProductsPage}` in route objects) |
| 6 | forgetting the `*` route | blank screen for unknown URLs | add `<Route path="*" element={<NotFoundPage />} />` |
| 7 | expecting `/Products` and `/products` to be different screens | both match the same route — React Router is **case-insensitive by default** (verified) | use one casing in links, or set `caseSensitive: true` on that route |
| 8 | wrapping every screen in `<BrowserRouter>` "to be safe" | nested routers, duplicated history state | router once; routes many |
| 9 | putting `<Routes>` *outside* `<BrowserRouter>` | "useRoutes() may be used only in the context of a `<Router>`" | `<BrowserRouter>` outermost of the two |
| 10 | deploying to a sub-path without `basename`/`base` | every link and asset 404s | `basename` + Vite `base` |
| 11 | using `HashRouter` "because deployment is easier" without thinking | URLs like `/#/products`, no SSR value, analytics see only `/` | fix the server rewrite instead (file 01) |
| 12 | testing only by clicking | the deep link that customers paste is broken | open child URLs directly in a fresh tab, and test the built app |

---

## 12. Best practices

1. **Keep one route table file** (`AppRoutes.tsx`) while declarative; when the app grows, split it per feature folder and compose.
2. **Screens live in `src/routes/` or `src/pages/`**, components in `src/components/` — a naming convention that saves a lot of searching.
3. **Every route a user can reach by URL gets a route entry**; anything else is a modal or a step inside a screen.
4. **Set `document.title` per screen** (a tiny `useDocumentTitle` hook or a route `handle`) — the browser tab is part of the UX.
5. **Prefer real paths**; use hashes only when the host cannot rewrite.
6. **Configure `basename` + Vite `base` together** if you are not at the domain root; mismatched pairs produce links that look right and 404 anyway.
7. **Test the production build** with `npm run preview` before you ship — it exercises the built assets and the SPA fallback.
8. **Never let two sources of truth exist** for "which screen": once you have a router, delete `useState<'home' | 'products'>` screens.
9. **Keep route paths lowercase and dash-separated** (`/order-history`), matching URL conventions.
10. **Document your route table** in the README (path → screen → who can see it) — it is the map of the app.

---

## 13. Practice

### Beginner — a three-screen site

1. Create a fresh project: `npm create vite@latest practice-router -- --template react-ts`, install `react-router`, and build three screens: `/` (home), `/about`, `/contact`.
2. Add a small `<nav>` with three `<Link>`s, and a `*` route that lists the wrong path.
3. Verify each of these by hand: click through all three; press Back three times; type `/about` in a fresh tab; type `/nope`.
4. Now move the router *into* `App.tsx` (it already is) and then deliberately put a second `<BrowserRouter>` around `<HomePage />` inside the route table. Describe in one sentence what breaks.

### Intermediate — a layout shell and a sub-path deploy

1. Add a `Layout` component containing the `<nav>` and an `<Outlet/>`, and nest all routes inside it so the header never unmounts.
2. Set `basename="/admin"` on the router and `base: '/admin/'` in `vite.config.ts`. Build, serve with `npm run preview`, and open `http://localhost:4173/admin/products`.
3. Explain why `http://localhost:4173/products` now shows a blank page (hint: the asset URLs in `index.html`).
4. Revert both settings and confirm the plain root deployment works again.

### Challenge — the router shell for the shop admin

Build the shell this part's lab uses, from scratch:

```text
src/
├── App.tsx                       ← providers + BrowserRouter
├── routes/
│   ├── AppRoutes.tsx             ← the route table
│   ├── AdminLayout.tsx           ← sidebar + <Outlet/>
│   ├── HomePage.tsx
│   ├── ProductsPage.tsx
│   ├── ProductDetailPage.tsx
│   ├── OrdersPage.tsx
│   ├── OrderDetailPage.tsx
│   ├── LoginPage.tsx
│   ├── NewOrderPage.tsx
│   └── NotFoundPage.tsx
└── data/
    ├── products.ts
    └── orders.ts
```

Requirements:

1. `/`, `/products`, `/products/:productId`, `/login` at the top level; `/orders`, `/orders/new`, `/orders/:orderId` nested under a layout route that renders the sidebar.
2. The sidebar uses `<NavLink>` with an `active` class (`className={({ isActive }) => …}`).
3. A `*` route shows the attempted path.
4. Every screen has a real `<h1>`; `document.title` updates per screen.
5. Then verify with a fresh-tab deep link: `/orders/ORD-1002` renders the order **and** the sidebar, with no flash of the home page.

Write down the one thing you could *not* express with declarative routes in this challenge (there is at least one: guarding the `/orders` branch before it renders → file 07).

---

## 14. Solutions

### Beginner

```tsx
// File: src/App.tsx
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

```tsx
// File: src/routes/AppRoutes.tsx
import { Link, Route, Routes } from 'react-router';

function Nav() {
  return (
    <nav>
      <Link to="/">Home</Link> · <Link to="/about">About</Link> · <Link to="/contact">Contact</Link>
    </nav>
  );
}

export function AppRoutes() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<h1>Home</h1>} />
        <Route path="/about" element={<h1>About</h1>} />
        <Route path="/contact" element={<h1>Contact</h1>} />
        <Route path="*" element={<h1>404</h1>} />
      </Routes>
    </>
  );
}
```

Point 4: a second `<BrowserRouter>` inside the route table creates a nested router with its own private URL state; links rendered inside the inner router navigate the inner one, so the outer `<Routes>` never sees the change and the screen appears frozen.

### Intermediate

```tsx
// File: src/routes/Nav.tsx — the shell's navigation (NavLink adds the active styling)
import { NavLink } from 'react-router';

export function Nav() {
  return (
    <nav aria-label="Main">
      <NavLink to="/" end>Home</NavLink>{' '}
      <NavLink to="/products">Products</NavLink>{' '}
      <NavLink to="/admin">Admin</NavLink>
    </nav>
  );
}
```

```tsx
// File: src/routes/AppRoutes.tsx
import { Outlet, Route, Routes } from 'react-router';
import { Nav } from './Nav';

function Layout() {
  return (
    <div className="app">
      <header>
        <Nav />
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<h1>Home</h1>} />
        <Route path="products" element={<h1>Products</h1>} />
      </Route>
    </Routes>
  );
}
```

```tsx
// File: src/App.tsx (fragment)
<BrowserRouter basename="/admin">
  <AppRoutes />
</BrowserRouter>
```

With `base: '/admin/'`, `index.html` requests `/admin/assets/index-*.js`; the router only matches paths under `/admin`. Opening `/products` (without the prefix) loads `index.html`, but Vite serves it with asset URLs under `/admin/`, and the router sees a path it does not recognise — the result is a blank shell or a 404 route, not the products screen. The two settings must agree.

### Challenge

The tree and the route table are the ones shown in section 9 plus a layout route:

```tsx
// File: src/routes/AppRoutes.tsx (the important part)
<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/products" element={<ProductsPage />} />
  <Route path="/products/:productId" element={<ProductDetailPage />} />
  <Route path="/login" element={<LoginPage />} />

  {/* A layout route: no path, just a component with an <Outlet/>. */}
  <Route element={<AdminLayout />}>
    <Route path="/orders" element={<OrdersPage />} />
    <Route path="/orders/new" element={<NewOrderPage />} />
    <Route path="/orders/:orderId" element={<OrderDetailPage />} />
  </Route>

  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

```tsx
// File: src/routes/AdminLayout.tsx
import { NavLink, Outlet } from 'react-router';

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link nav-link--active' : 'nav-link');

export function AdminLayout() {
  return (
    <div className="admin">
      <nav aria-label="Admin">
        <NavLink to="/orders" end className={linkClass}>
          Orders
        </NavLink>
        <NavLink to="/orders/new" className={linkClass}>
          New order
        </NavLink>
        <NavLink to="/products" className={linkClass}>
          Products
        </NavLink>
      </nav>
      <div className="admin__content">
        <Outlet />
      </div>
    </div>
  );
}
```

Verified in this part's lab: opening `/orders/ORD-1002` directly renders **Order ORD-1002** *inside* the sidebar layout, and navigating between children keeps the same sidebar DOM node (`same <nav> DOM node? true`).

What declarative routes could **not** express: **guarding before render**. `<RequireAuth>` has to render *something* first (a redirect element), and the protected screen is only avoided because the redirect wins — there is no way to say "run this check before choosing the component" until you use a `loader` (file 08) or a wrapper component (file 07).

---

## 15. Summary

- Install with **`npm install react-router`**; in v8 `react-router-dom` no longer exists. Import APIs from **`react-router`** and DOM-specific pieces (`RouterProvider`) from **`react-router/dom`**.
- React Router v8 needs **React 19.2.7+ and Node 22.22+**; from v7 the upgrade is otherwise mostly non-breaking.
- Three modes: **declarative** (`<BrowserRouter>` + `<Routes>`, files 02–07), **data** (`createBrowserRouter` + loaders, file 08), **framework** (file-based routes + Vite plugin). Pick by how much you want the router to do.
- The smallest app is `main.tsx` → `App.tsx` (one `<BrowserRouter>`) → `AppRoutes.tsx` (`<Routes>` with `<Route element={…}>`), and it gives you click-navigation, Back/Forward, and deep links immediately.
- Router hooks must be **inside** the router; providers that need navigation go inside it too, everyone else stays outside.
- Set **`basename` + Vite `base`** together for sub-path deployments.
- `vite dev` and `vite preview` implement the **SPA fallback** (verified: all deep paths return 200); your production host must be configured to match (file 01).

---

**What's next →** [`03-routes.md`](./03-routes.md): the route table in detail — index routes, layout routes, pathless routes, prefix routes, ranking rules (verified: a static segment beats `:param` no matter the order in the file), splats, and the 404 page that shows what the user typed.
