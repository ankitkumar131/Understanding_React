# 01 — Routing Basics: URLs, the History API, and Why Single-Page Apps Need a Router

> **Part 6 · Routing · File 1 of 8**
> Why this file exists: before you install a router you should know what it is managing. This file takes apart a URL, shows what happens when you click a link in a *multi-page* app versus a *single-page* app, drives the browser's History API by hand (with the exact output from a real run), and demonstrates the deployment trap that bites almost every React developer once: a deep link that works locally and returns **404** in production.

---

## 1. What a URL actually contains

```text
https://shop.example.com:443/products/p-keyboard?colour=black&size=tkl#reviews
└─┬─┘   └──────┬───────┘└┬─┘└──────────┬────────┘└──────────┬──────────┘└──┬──┘
scheme       host      port          path              search          hash
```

| Piece | Example | Who cares about it |
| --- | --- | --- |
| **scheme** | `https` | the browser (which protocol to speak) |
| **host** | `shop.example.com` | DNS, the server's virtual hosts |
| **port** | `:443` (hidden when default) | the server |
| **path** | `/products/p-keyboard` | **the server** *and* your router |
| **search** (query string) | `?colour=black&size=tkl` | **your router / components** — the server usually ignores it |
| **hash** (fragment) | `#reviews` | **the browser only** — never sent to the server |

Three consequences that decide how routing works:

1. **Everything before the `#` is sent to the server.** So `/products/p-keyboard` is a request for a *resource on the server* — unless the server is configured to always answer with the same HTML file (section 7).
2. **The hash never reaches the server.** `/#/products/p-keyboard` is a request for `/` with a note to the browser. That is why hash-based routing "just works" on dumb static hosts.
3. **The search string is data for your app, but it is still part of the URL.** Changing it creates a new history entry (usually), it can be bookmarked, and it appears in analytics — which is why filters and tabs are usually stored there (file 05).

💡 A URL is a **contract**: anything a user can see should be reachable by typing a URL, and that URL should survive a refresh, a bookmark, and a paste into a chat window. Keep that sentence in mind for the rest of this part — most routing bugs are violations of it.

---

## 2. The multi-page world: every click loads a document

Before single-page apps, a "site" was a folder of HTML files and a server that mapped paths to them:

```text
GET /products/p-keyboard  →  the server reads products/p-keyboard.html  →  full HTML back
GET /about                →  about.html
GET /nope                 →  404 page
```

Clicking a link in that world:

1. the browser tears down the page (JavaScript state, scroll position, everything),
2. shows the white flash / spinner,
3. downloads HTML, then CSS, then fonts, then JS,
4. reparses and repaints everything.

This is not a bad design — it is simple, cacheable, and works without JavaScript. But an *application* (a dashboard, an inbox, a shop admin) pays a heavy price: every navigation loses in-memory state and re-downloads the shell, and the transition is a document load, not a UI change.

---

## 3. The single-page app: one document, many screens

A **single-page application (SPA)** loads one HTML document. After that, "navigation" is done in JavaScript: the app swaps the components that are on screen and *edits the URL* to match. No document load, no white flash, state preserved.

| | Multi-page app (MPA) | Single-page app (SPA) |
| --- | --- | --- |
| What a click does | request a new document | re-render part of the existing one |
| Navigation speed | limited by the network | immediate (after first load) |
| In-memory state across pages | lost | kept (if you want it) |
| First load | fast (only that page's assets) | slower (the whole app's initial JS) |
| SEO / link previews | works out of the box | needs care (SSR/prerender — Part 15) |
| Works without JS | yes | no |
| **The URL still matters** | yes | **yes — and this is the part beginners break** |

The last row is why this file exists. In an SPA you *do* edit the URL (so it can be shared and bookmarked) but you do **not** ask the server for a new document. Two jobs that used to happen together are now separate — and the browser gives you exactly the tool for it: the History API.

---

## 4. What "routing" means

Routing is two responsibilities, and a router library is the thing that keeps them in sync:

1. **Matching** — given the current URL, which components should be on screen?
   `/products/p-keyboard` → `ProductsLayout` + `ProductDetail(id="p-keyboard")`
2. **Navigation** — when the user clicks a link or calls `navigate('/orders')`, change the URL *without* a document load, then let matching run again.

Everything else a router offers (params, nested layouts, active link styling, data loading, scroll restoration, guards) is built on top of those two.

---

## 5. The History API, driven by hand

You do not need React or React Router to change the URL without reloading. Create a scratch project and drop this file in:

```text
shop-admin/
└── src/
    └── dev/
        └── history-probe.ts
```

```ts
// File: src/dev/history-probe.ts
import { installJsdom } from './jsdom-env';

const env = installJsdom('https://shop-admin.test/products');
const { window } = env.dom;
const { history, location } = window;
const say = (line: string) => console.log(line);

// A module-level value that would be LOST on a real page load.
let pageLoads = 1;
say(`0. loaded from ${location.pathname} · history.length=${history.length} · module evaluated ${pageLoads}x`);

const popStates: string[] = [];
window.addEventListener('popstate', (event) => {
  popStates.push(`${location.pathname}${location.search} (state=${JSON.stringify(event.state)})`);
});

say('');
say('1. pushState adds a history entry without loading anything:');
history.pushState({ from: 'search' }, '', '/products?q=key&sort=price');
say(`   pathname=${location.pathname} · search="${location.search}" · still ${pageLoads} page load(s)`);

history.pushState({ from: 'detail' }, '', '/products/p-keyboard');
say(`   pathname=${location.pathname} · history.length=${history.length}`);

say('');
say('2. replaceState replaces the current entry instead of adding one:');
const before = history.length;
history.replaceState({ from: 'replaced' }, '', '/products/p-keyboard?tab=specs');
say(`   search="${location.search}" · history.length ${before} → ${history.length} (unchanged)`);

say('');
say('3. the back button fires popstate — this is how a router learns about it:');
history.back();
```

**Run it** (`jsdom` gives us a browser-like environment in Node):

```text
npx tsx --tsconfig tsconfig.app.json src/dev/run-history-probe.ts
```

**Expected result** — the real output of that run:

```text
0. the page was loaded from a URL: pathname=/products · search="" · history.length=1 · the document has now been evaluated 1x

1. pushState adds a history entry without loading anything:
   after pushState → pathname=/products · search="?q=key&sort=price" · JS module state still 1 page load(s)
   again → pathname=/products/p-keyboard · history.length=3 · still 1 page load(s)

2. replaceState replaces the current entry instead of adding one:
   pathname=/products/p-keyboard · search="?tab=specs" · history.length 3 → 3 (unchanged)

3. the back button fires a popstate event — this is how a router learns about it:
   events so far: /products?q=key&sort=price (state={"from":"search"})
   current URL is now /products?q=key&sort=price
   events so far: /products?q=key&sort=price (state={"from":"search"}) | /products (state=null)
   current URL is now /products
```

Four facts to take from that output:

- **`pushState` changed the URL and nothing else.** The module was still evaluated once — no reload, no re-download, no lost state.
- **`history.length` went 1 → 3** with two `pushState` calls, and stayed 3 through `replaceState`. That is the difference between "add an entry" and "overwrite this entry".
- **The `state` object rides along** with each entry (`{"from":"search"}` came back in the event) — that is the mechanism behind `navigate('/login', { state: { from } })`, which file 07 uses to send users back after login.
- **`popstate` is the only notification you get** when the user presses Back or Forward. Without a listener, your UI would keep showing the old screen while the URL changed — a classic hand-rolled-router bug.

Two more URL changes worth knowing:

```ts
// 4. a plain <a href> is NOT the same thing: the browser asks the server for a document.
//    In our test DOM jsdom refuses and logs:
//      Not implemented: navigation to another Document
//    In a real browser the request goes out and the whole app is torn down.

// 5. hash navigation never reaches the server at all:
location.hash = '#reviews';        // pathname=/products · hash=#reviews
```

---

## 6. The three ways a URL can change

| Way | Who triggers it | What the router must do |
| --- | --- | --- |
| A **link click** | the user | intercept the click, `preventDefault()`, push the entry itself |
| **Code** (`navigate('/orders')`) | your app | push or replace, then re-match |
| **Back / Forward / editing the address bar** | the user, outside your app | listen for `popstate`, re-match, *never* push |

The third row is the one that catches people out: a router that only handles clicks appears to work until the user presses Back, and then the screen freezes on the old route. React Router subscribes to `popstate` for you.

---

## 7. Deep links and the server: the 404 that everyone hits once

Locally everything works: your dev server (Vite) answers *every* path with `index.html`, so `/products/p-keyboard` boots the app, the router reads the URL and renders the right screen. Then you deploy the built files to a plain static host, paste `/products/p-keyboard` into a fresh tab, and get **404**.

The server looked for a file called `products/p-keyboard.html` and did not find one. It never ran your app, so your router could not help. Measured on the same build output:

```text
python http.server  /                      → 200
python http.server  /products              → 404
python http.server  /products/p-keyboard   → 404
python http.server  /admin/products        → 404

vite preview      /                      → 200
vite preview      /products              → 200
vite preview      /products/p-keyboard   → 200
vite preview      /admin/products        → 200
```

`vite preview` (and `vite dev`) implement the **SPA fallback**: any path that is not a real file returns `index.html`. A bare `python3 -m http.server` does not, and answers with its own HTML error page:

```html
<!DOCTYPE HTML>
<html lang="en">
    <head><title>Error response</title></head>
    <body><h1>Error response</h1> …
```

The fix is one line of server configuration — **"if the file does not exist, serve `index.html` instead"**:

```nginx
# nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

```text
# Netlify — a file called public/_redirects (or dist/_redirects)
/*    /index.html   200
```

```json
// Vercel — vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```apache
# Apache — .htaccess in the built folder
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

⚠️ **GitHub Pages has no rewrite rules.** It serves real files only, so client routes other than `/` 404 unless you either (a) copy `index.html` to `404.html` as part of the build (a common trick), or (b) use a **hash router** (`example.com/#/products/p-keyboard`) where everything after `#` never reaches the server — see file 02's router types.

⚠️ **Do not "fix" this by routing everything to `/` in the router.** The server is the problem; a `*` route only helps *after* `index.html` has loaded.

---

## 8. What a router gives you (and what you would build yourself)

| Feature | Without a router | With React Router |
| --- | --- | --- |
| URL → component matching | your own `if (pathname === …)` chain, or a regex table | `<Route path>` / route objects, with ranking |
| Dynamic segments | parse `pathname.split('/')` yourself | `:productId` + `useParams()` |
| Search parameters | `new URLSearchParams(location.search)` | `useSearchParams()`, with helpers |
| Nested screens sharing a layout | component composition by hand | nested routes + `<Outlet/>` |
| Back/Forward | `popstate` listener + re-match | handled |
| Active nav styling | compare `location.pathname` by hand, badly | `<NavLink>` |
| Programmatic navigation | `history.pushState` + notify your own listeners | `useNavigate()` |
| 404s, redirects, guards | scattered `if`s | `<Route path="*">`, `<Navigate>`, loaders |
| Data before render, error boundaries, pending UI | your own fetch-in-effect dance | `loader`, route `ErrorBoundary`, `useNavigation` (file 08) |
| Lazy route code | `React.lazy` + `Suspense` by hand | `React.lazy` *or* route-level `lazy` |

The point is not that you *could not* build these (a toy router is ~40 lines) — it is that the details (ranking rules, relative links, scroll restoration, `replace` semantics, redirect loops) are exactly where hand-rolled routers fail. Use a library; understand what it manages.

---

## 9. Router flavours you will meet

| Component | URL lives in | Use it when |
| --- | --- | --- |
| **`BrowserRouter`** | the real URL (`/products/7`) | normal web apps — requires a server rewrite in production (section 7) |
| **`HashRouter`** | after the `#` (`#/products/7`) | static hosts with no rewrite rules, embedded widgets, some Electron/`file://` cases |
| **`MemoryRouter`** | JavaScript memory only | **tests** and non-browser targets — the URL never appears in the address bar |
| **`createBrowserRouter` etc.** | same, but configured outside React | data mode: loaders, actions, pending states (file 08) |

```tsx
// The same app, three ways — the routes themselves do not change.
<BrowserRouter>   <AppRoutes /> </BrowserRouter>     // the real thing
<HashRouter>      <AppRoutes /> </HashRouter>        // urls look like /#/products
<MemoryRouter initialEntries={['/products']}> <AppRoutes /> </MemoryRouter>   // tests
```

---

## 10. Choosing a router in 2026

| Option | Shape | Reach for it when |
| --- | --- | --- |
| **React Router v8** (`react-router`) | library; three modes (declarative / data / framework) | you have a React SPA (this part), or you want a framework (framework mode) |
| **TanStack Router** | library, fully type-safe routes and search params | you want generated route types and typed search-param schemas |
| **Next.js / Remix-style frameworks** | a framework *is* the router | you want SSR/SSG and file-based routing as the default |
| **No router** | `useState` for "which screen" | single-screen tools, modals, wizards — genuinely fine |

There is no universal winner. The honest trade-off: React Router is the most widely deployed and documented (and the one this part teaches); TanStack Router gives stronger types with more setup; frameworks give you rendering strategies and file conventions at the cost of a bigger commitment. Whichever you pick, the concepts in this part — URL as state, params, nested layouts, guards — transfer directly.

---

## 11. Common mistakes

| # | Mistake | What happens | Do this instead |
| --- | --- | --- | --- |
| 1 | using `<a href="/products">` inside an SPA | full document reload; state lost; the SPA's advantage gone | `<Link to="/products">` |
| 2 | changing the URL with only `pushState` and no `popstate` listener | Back/Forward move the URL but the screen never changes | use a router (it subscribes for you) |
| 3 | building an SPA and forgetting the server rewrite | deep links 404 in production while working locally | `try_files` / `_redirects` / `vercel.json` (section 7) |
| 4 | storing UI state (`open`, `activeTab`) in the URL *and* in `useState` | the two drift apart; refresh shows the wrong thing | one source of truth: the URL (file 05) |
| 5 | treating the hash as if the server could see it | server-side logic never receives `#reviews` | put real data in path/search |
| 6 | deciding "which page" with a `useState` enum *and* a router | two competing sources of truth | pick the router, keep the state out |
| 7 | `window.location.href = '/x'` for in-app navigation | full reload | `useNavigate()` |
| 8 | absolute URLs in links (`https://shop.example.com/...`) | breaks previews, staging, and sub-path deploys | relative paths (`/products`) and `<Link>` |
| 9 | assuming `history.length` counts "pages" | it counts entries including replaced ones and frames | treat it as a hint, never as navigation state |
| 10 | `window.history.pushState` with a URL from a *different origin* | `SecurityError` | only same-origin paths |
| 11 | reading `location.pathname` directly in components | ignores `basename`, breaks in tests, no re-render on change | `useLocation()` / route hooks |
| 12 | deploying a `BrowserRouter` app to a sub-path without configuring `basename` | every link 404s under `/app/…` | `basename="/app"` (file 02) |

---

## 12. Best practices

1. **A URL must be a complete description of the screen.** Refresh, bookmark, share, paste — all three must land on the same view.
2. **Links that stay inside the app are `<Link>`**, never `<a>`; external links stay `<a>`.
3. **Decide the type of change**: new history entry (push) or replace the current one (replace). Filter typing = replace; "open a detail page" = push.
4. **Configure the server rewrite before you deploy**, and test a deep link against the built files (`vite preview`), not just the dev server.
5. **Keep screen state in the URL, transient state in React** (file 05 draws the line).
6. **Use a router library**, and read its matching rules once so "why did this route win?" is never a mystery.
7. **Prefer the plain path over the hash** unless your host cannot rewrite.
8. **Never store secrets or sensitive data in the URL** — it lands in history, logs, and analytics.
9. **Test with a deep link** (open a child URL directly) as part of your manual pass, not just by clicking around.
10. **Accessibility**: the URL change should still move focus and announce the new screen — see file 08's note on `useEffect` + `document.title`/focus.

---

## 13. Practice

### Beginner — explain the URL and the request

1. For each URL, say (a) which parts the server receives and (b) which parts only the browser sees:
   - `https://shop.example.com/products?colour=black#reviews`
   - `https://shop.example.com/#/products/7`
   - `https://shop.example.com:8080/admin/orders/ORD-1001?tab=open`
2. Build a two-file static site (`index.html`, `about.html`) and serve it with `python3 -m http.server`. Click between them and watch the Network tab: what is requested on each click, and what happens to any text you typed into a form before clicking?
3. Now add a button that calls `history.pushState({}, '', '/about')`. Does the page change? Why not? What is the smallest change that makes the *content* change too?

### Intermediate — the 404 reproduction and fix

1. Build the `shop-admin` app from file 02 (`npm run build`), serve `dist/` with `python3 -m http.server 8099`, and confirm with `curl`:
   `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8099/products`
2. Write the rewrite rule for your own host (nginx, Apache, Netlify, or Vercel) and explain in one paragraph *why* the rule must live on the server, not in the router.
3. Switch the app to `HashRouter`, rebuild, and confirm the deep link now works on the plain static server. Write down the two URLs side by side and one advantage and one disadvantage of each.

### Challenge — a 40-line router

Write your own router with no library, then list everything it cannot do yet. Start here:

```tsx
// File: src/dev/tiny-router.tsx — a teaching router. Not for production.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface TinyRouterValue {
  pathname: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const TinyRouterContext = createContext<TinyRouterValue | null>(null);

export function TinyRouter({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate: TinyRouterValue['navigate'] = (to, options) => {
    if (options?.replace === true) window.history.replaceState({}, '', to);
    else window.history.pushState({}, '', to);
    setPathname(window.location.pathname);
  };

  return <TinyRouterContext value={{ pathname, navigate }}>{children}</TinyRouterContext>;
}

export function useTinyRouter(): TinyRouterValue {
  const value = useContext(TinyRouterContext);
  if (value === null) throw new Error('useTinyRouter must be used inside <TinyRouter>');
  return value;
}

export function TinyLink({ to, children }: { to: string; children: ReactNode }) {
  const { navigate } = useTinyRouter();
  return (
    <a
      href={to}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
```

Then answer, in writing:

1. Which of the twelve mistakes in section 11 does it already avoid, and which does it still make? (Look at `event.metaKey`, `target="_blank"`, external URLs, and search parameters.)
2. Add `useTinyParams(pattern)` — a function that returns `{ productId }` for `/products/:productId`.
3. Add a `TinyRoutes` component and a 404 fallback. Compare the amount of code you wrote with section 8's table and write one sentence about when a hand-rolled router is acceptable.

---

## 14. Solutions

### Beginner

1. `https://shop.example.com/products?colour=black#reviews` — **server receives** `https://shop.example.com:443` and the path `/products`; the **browser only** keeps `?colour=black` (well, the server *may* see it if the request came from a typed URL, but your app never sends it as a request *from a link click* — treat it as app data) and `#reviews`. Precisely: the server sees path + search on a document request, never the hash.
   `https://shop.example.com/#/products/7` — the server receives `/` **only**; everything interesting (`/products/7`) is in the hash.
   `https://shop.example.com:8080/admin/orders/ORD-1001?tab=open` — the server receives host + port 8080 and the path `/admin/orders/ORD-1001` (the search too, on a hard request); again the hash — absent here — would not.
2. Each click requests a full document (`about.html` etc.) plus its assets; the browser throws away the current page, so anything typed into a form is lost unless it was stored (in `sessionStorage`, a server session, …). That is *the* reason applications became SPAs.
3. The page does not change because `pushState` only edits history; nothing re-renders. The smallest fix is to render from `location.pathname` and update a piece of state after `pushState` — and to also listen to `popstate`, or Back will desync the UI. That is a router's job in miniature.

### Intermediate

1. Expected: `404` from `python3 -m http.server`, `200` from `vite preview`.
2. Example nginx: `try_files $uri $uri/ /index.html;`. It must live on the server because the browser sends one HTTP request for the deep link and renders whatever comes back; before any JavaScript runs, the *server* decides between "here is index.html" and "404". Your router has no chance to run if the answer is a 404 document.
3. With `HashRouter` the link becomes `https://host/#/products/p-keyboard`; the browser requests `/`, gets `index.html`, the app boots and reads the hash. Advantage: works on any static host with zero configuration (and on `file://`). Disadvantage: uglier URLs, no server-side rendering/SEO of the real path, and the hash is invisible to analytics unless handled.

### Challenge

```tsx
// A minimal param matcher: split both sides and compare segment by segment.
export function useTinyParams(pattern: string): Record<string, string> {
  const { pathname } = useTinyRouter();
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  if (patternParts.length !== pathParts.length) return params;
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];
    if (patternPart.startsWith(':')) params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    else if (patternPart !== pathPart) return {};
  }
  return params;
}
```

What the tiny router still gets wrong: it ignores `basename`, has no ranking (two patterns can match the same URL), no nested `Outlet`, no relative links, no scroll restoration, no lazy loading, and it does not check `target`/external hrefs in `TinyLink` (a modifier-click or a cross-origin link should not be intercepted — the `event.metaKey`/`ctrlKey` guard covers only part of it, and you must also skip `event.shiftKey`, `event.altKey`, and any anchor with a `target` or a different origin). That list is the answer to "when is a hand-rolled router acceptable?": only for exercises and tiny embedded widgets — the moment you need ranking, nested layouts, or data loading, you are re-implementing a library badly.

---

## 15. Summary

- A URL is scheme + host + port + **path** + **search** + **hash**; everything before the hash goes to the server, the hash never does.
- An **MPA** reloads the document on every click; an **SPA** loads one document and then changes the URL and the UI in JavaScript.
- **Routing = matching (URL → components) + navigation (change the URL without a reload)**, kept in sync.
- The **History API** is the primitive: `pushState` adds an entry, `replaceState` overwrites one, `popstate` tells you the user moved (Back/Forward). Verified: URLs changed with `history.length` 1 → 3 and the module was evaluated **once** — no reload.
- A router must handle **three** kinds of URL change: clicks, code, and the browser's own Back/Forward (section 6).
- **Deep links need a server rewrite.** Measured on one build: `python http.server` → **404** for `/products`, `vite preview` → **200**. The rule (`try_files $uri /index.html`) belongs on the server; the router cannot help before it has loaded.
- Router flavours: `BrowserRouter` (real URLs, needs the rewrite), `HashRouter` (static-host friendly), `MemoryRouter` (tests).
- Learn the library's **ranking and `replace` rules** early — section 11's twelve mistakes are almost all about those two things.

---

**What's next →** [`02-react-router.md`](./02-react-router.md): installing React Router v8, the three modes it ships with, the entry file (`BrowserRouter` in `main.tsx`/`App.tsx`), the project tree, and the first working routes — with the exact commands, the dev-server output, and the two import paths (`react-router` and `react-router/dom`) that changed in v8.
