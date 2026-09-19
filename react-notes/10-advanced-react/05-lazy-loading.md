# 05 — Lazy Loading: Code That Waits Until It Is Needed

> **Part 10 · Advanced React · File 5 of 9**

Why this file exists: file 04 ended with the levers for speed, and one of them was "do it later". This file is about the *code* half of that idea: ships less JavaScript at startup and download the rest when the user actually needs it. It covers `React.lazy` and `Suspense` from the inside — what the fallback really is, why the position of the boundary decides whether your header flickers, what happens when a chunk fails to download (it is an error, not a suspension), and how a prefetch removes the wait entirely. Chapter 06 then moves down a level to the bundler, where the chunks are actually cut and measured.

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-lazy2-probe.tsx` (`/tmp/part10-lazy.txt`) and the earlier `run-lazy-probe.tsx` (`/tmp/part6-lazy.txt`).

---

## 1. What lazy loading is, and the three things it applies to

**Lazy loading means deferring work until it is needed.** Something is optional until the user asks for it — a screen they may never open, an image below the fold, a heavy editor behind a button. Loading it up front costs everyone time for a feature only some people use.

| What is lazy | Mechanism | Measured in |
| --- | --- | --- |
| **Code** (a screen, a widget) | `React.lazy` + `Suspense`, or a route-level `lazy()` | this chapter |
| **Images / iframes / video** | `loading="lazy"`, `preload="none"` | file 04, section 8 |
| **Data** | fetch on demand, cache, prefetch on hover | Part 9, file 06 |

The three are independent, but they share a shape: *defer → show something honest while waiting → arrive*. For code, React gives you both halves: `lazy()` for the deferring, `Suspense` for the waiting state.

---

## 2. `React.lazy` — what it is

```tsx
import { lazy, Suspense } from 'react';

const Reports = lazy(() => import('./pages/Reports'));

export function App() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Reports />
    </Suspense>
  );
}
```

Line by line:

- **`import('./pages/Reports')`** is a *dynamic import*. Static `import … from './x'` is resolved by the bundler at build time and is part of the initial bundle; a dynamic `import()` returns a **promise for the module** and becomes a **separate file** the browser downloads on demand (chapter 06 measures exactly that).
- **`lazy(factory)`** wraps that promise in a component. The factory must be a function returning a promise of a module — `lazy(import('./Reports'))` is a common mistake: it calls the import immediately, defeating the point and usually crashing.
- **`<Reports />`** is now usable like any component. The first time React renders it, the module has not arrived yet, so React *suspends*: it looks for the nearest `<Suspense>` above and shows its `fallback` instead.
- **`<Suspense fallback={…}>`** is the boundary. When the promise resolves, React renders the real component in place of the fallback. Nothing else in the tree is disturbed.

**The default-export requirement.** `lazy` expects the module's `default` export to be the component. For a named export, adapt it:

```tsx
const Named = lazy(() => import('./pages/Reports').then((module) => ({ default: module.NamedReports })));
```

Measured: `named export rendered: true` — the adapter works, and it is the standard fix for a library that only exports names.

**What `lazy` is not:**

- It is **not** for data. It defers *components*; for data use Suspense-compatible fetching (file 07) or the patterns in Part 9.
- It is **not** a first-render optimisation for something already on screen. If the component is above the fold, you have made the first paint slower by adding a round trip.
- It is **not** a way to avoid writing an import. The module still exists; only the timing changes.

---

## 3. What `Suspense` actually does at runtime

```text
=== A. The fallback is shown while the chunk is in flight ===
   immediately after render: "Loading panel…"
   fallback in the DOM: true
   panel in the DOM: false
   after the import resolves: "Reports panel loaded from its own chunk."
   fallback in the DOM: false
   panel in the DOM: true
```

The sequence, precisely:

1. React renders `<Suspense>` and reaches the lazy component. The module promise is pending, so React **does not render it** — there is no component instance, no state, no DOM.
2. React walks up to the nearest `<Suspense>` boundary and renders its `fallback` in that position instead. The rest of the page renders normally.
3. When the promise resolves, React schedules an update for the boundary and renders the real subtree. Measured: the fallback is gone and the panel is in the DOM.
4. **Nothing below the boundary keeps state across this swap**, because it never mounted. If the same subtree suspends again later (a new lazy child), the boundary shows the fallback again — unless the update is inside a transition (file 09), where React can keep showing the old UI instead of a fallback.

⚠️ Two facts that surprise people:

- **Suspense is not a spinner manager.** It shows the fallback *only* when a child suspends. A component that is slow but does not suspend (a 900 ms synchronous loop) shows nothing different — the tab just freezes.
- **It re-renders the fallback from scratch** every time. If your fallback has its own animations or fetches, they restart. Keep fallbacks dumb.

---

## 4. Boundary placement: measured

```text
=== B. Where the boundary goes decides what disappears ===
   boundary outside the header, immediately: "Loading the whole page…"
   header visible while waiting: false
   boundary around the panel only, immediately: "Shop adminLoading the panel…"
   header visible while waiting: true
   after the chunk lands: "Shop adminReports panel loaded from its own chunk."
```

Two versions of the same page, one line different:

```tsx
{/* ❌ one boundary high up: the header, the nav and the footer all vanish while one panel loads */}
<Suspense fallback={<p>Loading the whole page…</p>}>
  <header>Shop admin</header>
  <SlowPanel />
</Suspense>

{/* ✅ the boundary sits around the lazy thing: everything else stays on screen */}
<header>Shop admin</header>
<Suspense fallback={<p>Loading the panel…</p>}>
  <SlowPanel />
</Suspense>
```

Rules that follow from this measurement:

1. **Put the boundary where the waiting happens**, not at the root. A page whose entire layout flashes to "Loading…" because one widget is lazy is a worse experience than no lazy loading at all.
2. **A route is a natural boundary** (the whole screen is new, so a screen-shaped fallback is honest). A panel inside an existing screen is also a natural boundary. The root is almost never the right place.
3. **A boundary can serve several lazy children** (they load in parallel and the fallback stays until all are ready) — use that when a screen's parts must appear together, and one boundary per part when they can appear independently.
4. **Make the fallback the shape of the thing that is coming** (a skeleton with the same height), so the page does not jump when the content lands. A one-line `<p>` in front of a 500 px table guarantees a layout shift.
5. **In React 19, `Suspense` has an additional use** — it can wrap asynchronous work driven by `use()` and actions; file 07 covers that.

---

## 5. When the chunk fails: it is an error, not a suspension

```text
=== D. A failed chunk is an error, not a suspension ===
Error: Failed to fetch dynamically imported module
   boundary UI: "Something went wrong: Failed to fetch dynamically imported moduleTry again"
   Suspense shows a fallback while work is pending; only an error boundary can show
   something for a rejection, which is why every lazy route belongs inside both
```

A rejected promise from `import()` (the user went offline, the server returned HTML for a missing chunk, a deploy replaced the hashes) becomes a **thrown error inside the lazy component**. `Suspense` does not catch errors — it only handles pending work. The error travels to the nearest **error boundary** (chapter 08), which is why every lazy route belongs inside *both*:

```tsx
<Boundary fallback={(error, reset) => <ChunkFailed error={error} onRetry={reset} />}>
  <Suspense fallback={<TableSkeleton />}>
    <Reports />
  </Suspense>
</Boundary>
```

Practical notes for the "stale chunk after a deploy" case, which is common in real apps:

- The failing import can be **retried** — a reload button in the fallback UI fixes most cases.
- A chunk-hash mismatch after a deploy is a real scenario: the old HTML asks for a file that no longer exists. A "new version available, reload" prompt (or a one-time automatic reload) is the standard mitigation, and long-lived caching for the entry HTML (with hashed assets cached forever) is the standard prevention.
- Do not swallow the error to show the fallback for ever: a spinner that never ends is worse than an error message with a retry.

(React logs the caught error and its stack in development, as the transcript shows; in production it is reported through `onError`/`componentDidCatch` — chapter 08.)

---

## 6. Prefetching: load it before the user asks

```text
=== E. Prefetching removes the wait (and the fallback flash) ===
   after a prefetch, the lazy component renders immediately: true
   fallback ever shown: false
```

The same `lazy(loadLazyPanel)` rendered with **no fallback at all**, because the module was already in the browser's module cache — the earlier `loadLazyPanel()` call did the network work. The lesson: **the ideal lazy load is one the user never waits for.** Ways to arrange that, in increasing order of effort:

| Technique | How | Good for |
| --- | --- | --- |
| **Hover / focus prefetch** | `onMouseEnter={() => void loadReports()}` on the link or button | links the user is likely to click |
| **Idle prefetch** | `requestIdleCallback(loadReports)` (with a `setTimeout` fallback) after the first screen is interactive | the next most likely screen |
| **Route-aware prefetch** | after login, warm the dashboard; after opening a list, warm the detail | predictable journeys |
| **`<link rel="prefetch">`** | the browser downloads the file at low priority | assets referenced from HTML |
| **`modulepreload`** | Vite/Rollup inject for chunks your entry imports statically; can be added for a dynamic chunk you *know* you need next | critical dependencies |

```tsx
const loadReports = () => import('./pages/Reports');
const Reports = lazy(loadReports);

<button onMouseEnter={() => void loadReports()} onClick={() => navigate('/reports')}>
  Reports
</button>
```

⚠️ Do not prefetch everything. Every prefetch competes for bandwidth and CPU with the thing the user is actually waiting for, especially on a phone on a slow connection. Prefetch one screen ahead, on intent (hover, idle), never on a timer for the whole app.

---

## 7. Route-level lazy loading

The highest-value boundary in most apps is the route, because that is exactly where the user's intent is known and where a "screen-shaped" fallback is honest:

```tsx
// src/routes.tsx — React Router, with one lazy import per route
const routes = [
  { path: '/', element: <Home /> },                                   // small, eager
  { path: '/products', lazy: () => import('./pages/ProductsPage') },  // its own chunk
  { path: '/orders', lazy: () => import('./pages/OrdersPage') },
  { path: '/reports', lazy: () => import('./pages/ReportsPage') },
];
```

With React Router's **Data mode**, the route object's own `lazy` field is the idiomatic form: the router calls it when the route is first visited, and (crucially) it can also return the route's `loader` alongside the `Component`, so the data and the code arrive together rather than in sequence. With the declarative `<Routes>` API or no router at all, wrap each page in `lazy()` plus a `Suspense` inside the layout:

```tsx
<Suspense fallback={<PageSkeleton />}>
  <Outlet />   {/* the route element below this layout is the lazy page */}
</Suspense>
```

Measured in Part 6 (`/tmp/part6-lazy.txt`): *"before the chunk arrives, Suspense renders the fallback; after it, the component: final DOM text: 'Lazy panel loaded from its own chunk.'"* Same mechanism at route scale.

**What to keep eager:** the shell (layout, navigation, the auth gate), the landing route, anything the user sees in the first second, and small components whose chunk request would cost more than their bytes.

---

## 8. Component-level lazy loading (and how far to go)

```tsx
const RichEditor = lazy(() => import('./editor/RichEditor'));
const Chart = lazy(() => import('./charts/RevenueChart'));

{isEditing && (
  <Suspense fallback={<EditorSkeleton />}>
    <RichEditor value={draft} onChange={setDraft} />
  </Suspense>
)}
```

Good candidates: modal/editor/charting/map/reporting libraries, anything behind a toggle, anything with a dependency heavier than the screen around it. These are exactly the places where a 100–300 kB library sits in the initial bundle for a feature most users never open.

⚠️ **Where it goes wrong:** splitting a component that is always visible (you added a round trip to the critical path), splitting 20 tiny components (20 requests and 20 fallbacks for no bytes saved), and generating a fallback for every boundary (a sea of spinners). The measured rule from chapter 06 applies: split where the chunk is big and *sometimes needed*, and check the total, because splitting does not reduce total bytes — it moves them off the critical path.

---

## 9. Lazy images, iframes and video

```tsx
<img src={thumb} width={320} height={200} loading="lazy" decoding="async" alt={name} />
<iframe src={mapUrl} title="Map" loading="lazy" width={600} height={400} />
<video src={clip} poster={poster} preload="none" controls width={640} height={360} />
```

- `loading="lazy"` on images and iframes defers the *network request* until the element is near the viewport. It is the single cheapest performance win in most apps that list products.
- Keep explicit `width`/`height` (or an aspect-ratio box) or the layout will jump when each image arrives — a lazy image without dimensions is a slower page *and* a worse one.
- Do not lazy-load the image that defines the first paint; give that one `fetchpriority="high"` and a correctly sized source, and lazy-load everything below the fold.
- For long lists, combine with the virtualisation from file 04: with a virtual list, images are only created when their row enters the window, so `loading="lazy"` becomes almost redundant — one of the reasons virtualisation feels so good.

---

## 10. When NOT to lazy load

1. **Above the fold.** Anything the user sees immediately: deferring it adds a request to the critical path and delays the largest paint.
2. **Small modules.** A 2 kB component does not deserve a chunk and a fallback; the request overhead outweighs the bytes.
3. **Every component.** Twenty boundaries and twenty chunks is a slower app with more failure modes; lazy loading has an optimum, and "split everything" is past it.
4. **When the fallback is worse than the wait.** A flash of skeleton, then content, then layout shift is worse than 200 ms of nothing — fix the fallback shape first, or do not split.
5. **When you have not measured.** Chapter 06's split lab shows the real numbers: splitting moved 40.8 kB gzip off the entry, but total bytes grew slightly. Do it where the entry size is the problem.
6. **When the bottleneck is the API, not the bundle.** Splitting code while a 900 ms request blocks the screen optimises the wrong resource.

---

## 11. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `lazy(import('./X'))` | the import runs immediately; nothing is deferred | `lazy(() => import('./X'))` |
| 2 | Forgetting `Suspense` | the app crashes with "A component suspended while responding to synchronous input" | wrap in a boundary (or use a router that provides one) |
| 3 | One boundary at the root | one slow panel blanks the whole page (measured: the header disappeared) | boundary around the lazy thing |
| 4 | `lazy()` for a default-less module | "Element type is invalid" at runtime | `.then((m) => ({ default: m.Named }))` |
| 5 | Expecting `Suspense` to catch a failed chunk | the error escapes to the nearest error boundary | wrap lazy routes in an error boundary too |
| 6 | A fallback with a different height than the content | layout shift on every load | skeleton/placeholder matching the final shape |
| 7 | Lazy-loading the hero or the landing route | slower first paint | keep the critical path eager; split what is optional |
| 8 | Splitting tiny components | many requests, many fallbacks, no saving | split large, sometimes-needed modules (routes, editors, charts) |
| 9 | Prefetching everything | bandwidth and CPU stolen from what the user is waiting for | prefetch one screen ahead, on hover or idle |
| 10 | No timeout/analytics on lazy loads | a chunk silently fails and the user stares at a skeleton | error boundary with retry + report the failure |
| 11 | Lazy images without dimensions | the page jumps as images arrive | width/height or aspect-ratio |
| 12 | Assuming splitting reduces total bytes | total grew slightly in the measured lab (runtime bookkeeping) | split to improve *startup*, not to shrink the total |

---

## 12. Best practices

1. **Start at the route**, because that is where intent and fallback shape are obvious.
2. **Match the fallback to the skeleton** of the real content, and keep it static.
3. **Wrap every lazy route in `Suspense` inside an error boundary** — pending and failed are two different states.
4. **Prefetch what the user is about to click**, on hover or when idle, not everything.
5. **Keep the shell eager**: layout, nav, auth, and the first screen the user lands on.
6. **Measure before and after** (chapter 06's build output and the Network panel); if the entry chunk did not shrink meaningfully, you added complexity for nothing.
7. **Use `loading="lazy"` for below-the-fold media** with explicit dimensions, and never for the largest image on the first screen.
8. **Handle the deploy mismatch** with a retry UI, and cache hashed assets for ever while keeping HTML short-lived.
9. **Do not split for the sake of it**: fewer, larger, well-placed boundaries beat many micro-chunks.
10. **Re-check periodically** — a chunk that mattered at 100 kB of entry may be pointless once the entry drops to 40 kB.

---

## 13. Practice

### Beginner

1. Convert a static import of a heavy page into a lazy one, with a `Suspense` boundary and a fallback, and list everything the user sees while the chunk downloads.
2. For each, say lazy or eager, and why: the site header, the pricing page, a chart library, the login form, an image 1,200 px below the fold, the user's avatar on the first screen.
3. Explain in one sentence why `lazy(import('./X'))` is wrong and what it does instead.

### Intermediate

1. Take the lab's two boundary placements and add a third: two lazy panels with one shared boundary, then two panels with separate boundaries. Describe what the user sees in each case while one chunk is slow and the other is fast.
2. Write a `usePrefetchOnHover` hook that returns the props to spread on a link (`onMouseEnter`, `onFocus`) and calls a loader at most once, and explain what happens on touch devices where hover does not exist.
3. A deploy invalidated a chunk hash and a user with the app open clicks a lazy route. Write the exact user experience you want, and the code (boundary fallback + retry) that produces it.

### Challenge

1. Design the splitting strategy for the shop admin: which routes get their own chunk, which library goes into a vendor chunk, what stays in the entry, and the fallback for each boundary. Then verify the plan with a real `vite build` + `manifest.json` and write the before/after table (chapter 06 shows the format).
2. Build a `LazyBoundary` component that combines an error boundary, a Suspense fallback, a timeout ("this is taking longer than usual"), and a retry, and use it for three routes. Measure what the user sees when (a) the chunk loads in 50 ms, (b) in 3 s, (c) fails, (d) fails once then succeeds.
3. Prove or disprove: "splitting a route always helps first load". Design the experiment with the split lab (numbers of chunks, gzip bytes, request count), consider HTTP/2 multiplexing and the cost of an extra round trip, and state the conditions under which the statement is true.

---

## 14. Solutions

### Beginner

1. ```tsx
   const Reports = lazy(() => import('./pages/Reports'));
   <Suspense fallback={<p>Loading reports…</p>}>
     <Reports />
   </Suspense>
   ```
   While the chunk downloads the user sees the fallback (and the rest of the page, if the boundary is placed around the page rather than the root). Nothing of the reports screen exists yet: no state, no DOM, no effects.
2. Lazy: the pricing page, the chart library, the below-the-fold image. Eager: the header, the login form, the avatar (all above the fold and small; their requests are on the critical path).
3. `lazy(import(…))` calls the dynamic import immediately — the module starts downloading when the file is evaluated, so nothing is deferred and the component may even receive a promise instead of a module, which React rejects.

### Intermediate

1. One shared boundary with two lazy children: the user sees the fallback until **both** chunks have arrived, then both appear together (good when the two halves are one screen; wasteful when one is slow). Separate boundaries: the fast panel appears as soon as its chunk lands while the slow one still shows its fallback (good for independent widgets, at the cost of a busier screen and two skeletons). The decision is a UX decision: *does the screen make sense with only one half?*
2. ```tsx
   function usePrefetchOnHover(load: () => Promise<unknown>) {
     const started = useRef(false);
     const trigger = useCallback(() => {
       if (started.current) return;
       started.current = true;
       void load();
     }, [load]);
     return { onMouseEnter: trigger, onFocus: trigger };
   }
   ```
   On touch devices `onMouseEnter` never fires (some browsers synthesise it on tap, which is too late); use `onTouchStart`, or prefetch on idle after the first screen, or accept the fallback for the first tap.
3. Desired experience: the boundary shows "This page could not be loaded" with a **Reload** button; clicking it either re-imports the module (a fresh `import()` with a cache-busting query is possible but a full reload is simpler and always correct) or reloads the page. The fallback receives `reset` from the boundary, tries the import again, and shows success on the second attempt; if it fails again, it keeps the message and offers the reload. Reporting the failure (with the chunk name) tells you whether it is a deploy-caching issue or a user's flaky connection.

### Challenge

1. Plan: entry = shell, layout, nav, auth, home, `react`/`react-dom`, router; per-route chunks = products, orders, reports, admin; vendor chunk = TanStack Query + Zod (shared by several routes, so one cached download serves all); lazy boundaries: one per route (screen-shaped skeleton) plus one around the reports chart (widget-shaped). Verification: `npx vite build` then compare `dist/.vite/manifest.json` (dynamic entries) and `gzip -c` sizes; the table shows the entry shrinking and per-route chunks appearing, with total bytes flat.
2. The `LazyBoundary` state machine: `pending → (loaded | timedOut | failed)`, where `timedOut` shows a "still loading" message above the spinner but does not abort, and `failed` shows a retry that re-runs the import (via a `lazy` with a versioned loader or a full reload). Measured with the four scenarios: (a) 50 ms — the user may only ever see the content (the fallback renders but is replaced before a paint); (b) 3 s — spinner then content, no layout jump if the skeleton is the right shape; (c) failure — the error UI with retry, and the report fired; (d) fail-then-succeed — a burst of error UI, then content — which is why the retry belongs in the boundary rather than in a page-level `location.reload()`.
3. **Disproved as stated, true under conditions.** Splitting helps when (i) the entry was large enough for the bytes to matter on the network, (ii) the split route is not part of the first paint, and (iii) the extra request does not add a round trip the user would otherwise not pay. It *hurts* when the split module is needed immediately (you added `request → download → parse` before content), when the connection has high latency and the chunk is tiny (HTTP/2 makes parallel requests cheap in *count*, not in latency), and when the extra chunk races the data the screen also needs. The experiment: measure the split lab's entry bytes and the time to an interactive home screen, with and without the split, at 4G and on a fast connection — the win appears on the first, and can vanish or invert on the second.

---

## 15. Summary

- **Lazy loading defers code, media or data until it is needed.** `React.lazy` + `Suspense` is the code half: `lazy(() => import('./X'))` turns a module into a chunk loaded on first render, and `Suspense` renders a fallback in its place while the request is in flight.
- **Measured**: the fallback is in the DOM and the component is not (`"Loading panel…"`, panel absent) until the import resolves, at which point the fallback is removed and the real subtree mounts.
- **The boundary's position decides what the user loses.** Measured: with the boundary above the header, the header **disappeared** (`"Loading the whole page…"`); with the boundary around the panel only, the header stayed (`"Shop adminLoading the panel…"`).
- **A failed chunk is an error, not a suspension.** Measured: the rejection produced `"Something went wrong: Failed to fetch dynamically imported module"` from the error boundary, because `Suspense` handles pending work only. Wrap lazy routes in both.
- **Prefetching removes the wait**: after warming the module cache, the same lazy component rendered with **no fallback ever shown**.
- **Named exports need an adapter** (`.then((m) => ({ default: m.Named }))`); `lazy(import('./X'))` is the classic mistake because the import starts immediately.
- **Use lazy loading where it pays**: route-level screens, heavy widgets behind a toggle, below-the-fold images/iframes/video. Keep the shell, the landing screen and the largest image eager.
- **Chapter 06 measures what splitting actually buys** at the bundler level: entry 109.4 kB → 68.6 kB gzip, per-route chunks 23.5 kB and 18.6 kB, and total bytes slightly *up* — the honest trade of startup time for total size.

---

**What's next →** [`06-code-splitting.md`](./06-code-splitting.md) goes below the React API to the bundler: what a chunk is, how dynamic `import()` creates one, what `vite build` and `manifest.json` tell you, vendor chunks and caching, tree shaking, what usually bloats a bundle, and the measured before/after of a real split.
