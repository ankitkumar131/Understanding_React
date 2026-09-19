# 07 — Suspense and `use()`: Waiting Without a Flag

> **Part 10 · Advanced React · File 7 of 9**

Why this file exists: chapter 05 met `Suspense` as the thing that shows a fallback while a chunk downloads, and left two questions open — what exactly is "not ready yet" from React's point of view, and can *data* be handled the same way? This file answers both. It explains what `Suspense` is (a boundary for pending work), what `use()` is (React 19's way to read a promise or a context during render), why a suspenseful data source needs a **stable, cached promise**, what happens when the promise rejects (an error boundary, not a fallback), and how a transition changes the experience from "the content vanished" to "the old content stayed until the new one was ready" — with all four behaviours measured in the lab.

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-suspense-probe.tsx` (`/tmp/part10-suspense.txt`) and `.../run-lazy2-probe.tsx` (`/tmp/part10-lazy.txt`).

---

## 1. What `Suspense` is, precisely

`Suspense` is a **boundary that React can fall back to when a child cannot render yet.** A child signals "not ready" by *suspending*: it throws a promise (or, with `use()`, React observes the pending promise and suspends for you). React then:

1. does not render that child,
2. renders the nearest `Suspense` fallback in its place,
3. re-renders the real subtree when the promise resolves,
4. and, if the update happened inside a transition, may instead **keep the old UI on screen** until the new one is ready (section 6).

That is all it does. `Suspense` does **not** fetch data, does **not** cache anything, does **not** catch errors, and does **not** decide when a spinner should appear. It is a rendering mechanism for "not ready yet", and everything else is your job (or your data library's).

| Problem | The flag-based solution (Part 7 style) | The Suspense solution |
| --- | --- | --- |
| Data not ready | `const [loading, setLoading] = useState(true)` and an `if (loading) return <Spinner />` | the child suspends; the boundary shows a fallback |
| Several children loading | several flags, or one flag and a coarse spinner | one boundary, fallbacks only where they are needed |
| Keeping old content during a refresh | manual "isRefreshing" state | wrap the update in a transition (section 6) |
| Coordinating a screen's parts | orchestrate in a parent | nest boundaries; the outer one reveals when all children are ready |

---

## 2. Two things that suspend

```text
1. React.lazy  — a component whose code is not downloaded yet   (chapter 05)
2. use(promise) — a component whose data is not ready yet       (this chapter)
```

Both end in the same place: a promise that React waits for. The difference is where the promise comes from. A lazy component's promise is created by the bundler's `import()`; a data promise is created by your code — and that is where the design questions start.

---

## 3. `use()` in React 19

```tsx
import { use } from 'react';

function Panel({ id }: { id: string }) {
  const data = use(getPanelData(id));   // suspends until the promise resolves
  return <p>{data}</p>;
}

function Themed() {
  const theme = use(ThemeContext);      // also reads context, like useContext
  return <p>{theme}</p>;
}
```

What the React 19 `use` API does and does not allow:

- **It reads a promise or a context.** With a promise it integrates into Suspense; with a context it behaves like `useContext`.
- **It may be called conditionally** — `if (isAdmin) { const data = use(adminPromise); }` is legal, because `use` is not a hook with ordering requirements. (Hooks like `useState`/`useEffect` still may not be conditional — Part 4's rules stand.)
- **It must be called from a component or a hook**, not from an event handler or a plain function.
- **It does not create the promise.** You pass one in. That sentence is the whole design constraint of section 4.
- **It does not cache.** The cache lives in your data layer (a `Map` in the lab, TanStack Query in production).
- **It does not catch.** A rejected promise is thrown during render and travels to the nearest error boundary (section 5).

Measured, in the simplest possible form:

```text
=== A. use() with a stable promise: the fallback covers the wait ===
   immediately: "loading data…"
   fallback: true, panel: false
   after the promise resolves: "data for profile"
   fallback: false, panel: true
```

Same shape as the lazy case in chapter 05, because it *is* the same mechanism: React saw a pending promise, rendered the fallback, and swapped in the real content when it settled.

---

## 4. The one rule that makes suspension work: stable promise identity

```text
=== B. The promise identity must be stable, or the component suspends for ever ===
   the same id renders instantly from the cache: "data for profile"
   if the component created its promise during render, every render would create a new
   one, React would suspend on it again, and the UI would never settle
```

The lab's data source is deliberately tiny, and every line of it matters:

```ts
// src/part10/resources.ts
const cache = new Map<string, Promise<string>>();

export function getPanelData(id: string, ms: number): Promise<string> {
  const existing = cache.get(id);
  if (existing !== undefined) return existing;      // 1. one promise per key, for ever
  const promise = new Promise<string>((resolve) => {
    setTimeout(() => resolve(`data for ${id}`), ms);
  });
  cache.set(id, promise);                            // 2. stored before it is returned
  return promise;
}
```

- **One promise per key.** Rendering `Panel id="profile"` twice returns the same promise, so the second render finds it already resolved and renders immediately (measured above).
- **Stored before returned.** If the cache were written in a `.then()` instead, two renders in the same tick would create two promises — a classic bug that shows up as duplicate requests and occasional infinite suspension.
- **Errors are cached too** (chapter 08's lab does this), otherwise a failing request is retried by every render.

Where you would *not* write this by hand:

```tsx
function Panel({ id }: { id: string }) {
  const data = use(fetch(`/api/products/${id}`).then((r) => r.json())); // ❌ a new promise every render
  ...
}
```

⚠️ This is the single most common `use()` mistake. It does not merely refetch: **React suspends again on the new promise, renders the fallback again, and repeats for ever** — a spinner that never stops, often with a request per render in the network panel. The fix is a cached, keyed promise, or a library that provides one.

---

## 5. A rejected promise is an error, not a fallback

```text
=== C. A rejected promise becomes an error (Suspense does not catch it) ===
   boundary UI: "Something went wrong: could not load missing"
   the rejection happened during render, so it reached the error boundary, not Suspense
```

`Suspense` handles *pending*; it has nothing to show for *failed*. The rejection is thrown during render, so it travels to the nearest **error boundary** (chapter 08). Three practical consequences:

1. **Every suspenseful region needs both**: a `Suspense` for the wait and an error boundary for the failure. A bare `<Suspense>` around data fetching means the user sees a spinner for ever when the request fails.
2. **Cache the rejection** so the failure is not retried by every render; a retry should be an explicit user action (or a library policy).
3. **Do not catch a suspension by accident.** A `try/catch` around `use(promise)` looks harmless and is a bug: it swallows the promise React uses to detect pending state. Let React's own machinery handle it, or handle the pending state with a library that exposes it (`useQuery`'s `isPending`, file 06 of Part 9).

---

## 6. Transitions: keeping the old UI instead of flashing a fallback

The two measurements below are the same component and the same 250 ms promise, differing only in whether the state update is wrapped in `startTransition`.

```text
=== E. Without a transition, a new slow panel shows the fallback ===
   before the switch: "switch panelpending=falsedata for plain-a"
   right after the click: "switch panelpending=falsedata for plain-aloading the new panel…"
   fallback visible: true
   old panel visible: false
   after the new data arrives: "switch panelpending=falsedata for plain-b"
   fallback visible: false

=== F. Inside a transition, the old panel stays until the new one is ready ===
   before the switch: "switch panelpending=falsedata for trans-a"
   right after the click: "switch panelpending=truedata for trans-a"
   fallback visible: false
   pending flag: pending=true
   old panel visible: true
   after the new data arrives: "switch panelpending=falsedata for trans-b"
```

Read the two "right after the click" lines together:

- **Without a transition**: the old panel is hidden (`old panel visible: false`), the fallback is shown (`true`). The user sees content disappear and a spinner appear — the flicker everyone complains about.
- **Inside a transition**: the fallback is **not** visible, the old panel is **still visible**, and `isPending` is `true`. The screen keeps its shape and content and swaps to the new panel when it is ready.

That is the "keep the previous screen while the next one loads" behaviour that used to require manual "isRefreshing" state, and it is why React's docs recommend `startTransition` around navigations and filter changes that suspend.

💡 The rule of thumb: **if content is already on screen, the update that replaces it should be a transition** — otherwise the boundary has no choice but to hide it. If nothing is on screen yet (first load), a fallback is exactly what you want.

---

## 7. Fallbacks: skeletons, not spinners (usually)

A fallback is a UI decision, and the measured lesson from chapter 05 applies: the boundary's shape determines whether the page jumps.

```tsx
<Suspense fallback={<TableSkeleton rows={8} />}>
  <ProductTable />
</Suspense>
```

- **Match the final shape** (same height, same column widths) so content replaces the skeleton without a layout shift.
- **Keep it static.** The fallback unmounts and remounts on every suspension; animations restart, effects re-run, and a fallback that fetches will fetch repeatedly.
- **Avoid nested spinners.** One boundary per region; a spinner inside a spinner reads as a broken page.
- **Do not flash it for fast loads.** If the data typically arrives in 30 ms, a skeleton for 30 ms is noise. Two options: delay showing it (CSS `animation-delay`, or a `useState` + `setTimeout` in the fallback component that renders nothing for the first ~150 ms), or — better — prefetch/warm the data so the boundary never shows.
- **Do not hide the whole page for one panel.** Chapter 05's measurement: put the boundary where the waiting happens.

---

## 8. Suspense in practice: use a library, not a hand-rolled cache

The lab's `Map` of promises is a teaching device. Production code wants the features a data library already has: deduplication, caching, retries, invalidation, background refresh, and *both* the flag-based and suspense-based APIs.

**TanStack Query** (Part 9, file 06) is the library the shop admin already uses, and it exposes exactly that:

```tsx
import { useSuspenseQuery } from '@tanstack/react-query';
import { productKeys } from '../part9/selectors';
import { fetchProduct } from '../api/products';

function ProductDetail({ id }: { id: string }) {
  // suspense edition: data is guaranteed present, no isPending branch in this component
  const { data: product } = useSuspenseQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => fetchProduct(id),
  });
  return <h1>{product.name}</h1>;
}

// somewhere above it
<Boundary>
  <Suspense fallback={<ProductSkeleton />}>
    <ProductDetail id={id} />
  </Suspense>
</Boundary>
```

What the library gives you that the lab's cache does not: the promise is keyed and deduplicated across components, `staleTime`/`gcTime` decide when it refetches, `invalidateQueries` refreshes it after a mutation, retries are policy, `useSuspenseQuery` guarantees `data` is defined (so no `isPending` branch), and errors flow to the boundary. Under the hood it is the same contract: **a stable promise per key, cached, with errors cached too.**

Three more places Suspense shows up in a modern React app:

- **Routers.** React Router's route-level `lazy` (and its `HydrateFallback`) uses Suspense for code and loaders; navigating inside a transition is what keeps the previous screen visible (section 6).
- **Frameworks with Server Components** (Next.js App Router and similar) use Suspense to stream server-rendered UI: the shell arrives first, and each boundary's content arrives as it becomes ready.
- **`useDeferredValue`/transitions** for expensive *rendering* (file 09) are the rendering-side twin of Suspense: one defers waiting on data, the other defers work on data you already have.

---

## 9. What Suspense does not do

| Misconception | Reality |
| --- | --- |
| "Suspense fetches my data" | it renders a fallback while *something else* fetches |
| "Suspense caches" | your data layer caches; `use()` needs a stable promise from it |
| "Suspense catches failures" | rejections go to an error boundary |
| "Suspense shows a spinner after a delay" | it shows the fallback immediately; delaying is a UI choice you implement |
| "Every component should suspend" | components that fetch in `useEffect` (Part 7) keep their flags and work fine; mixing is normal |
| "Suspense replaces loading states everywhere" | it replaces *some* of them, in the places where a boundary makes sense |

---

## 10. When to use which

| Situation | Use |
| --- | --- |
| Data for a screen you navigate to, with a shape you can skeleton | `useSuspenseQuery` + `Suspense` (+ boundary), inside a transition on navigation |
| A screen where you need fine-grained pending/refetching states | the flag-based `useQuery` from Part 9 — `isPending`, `isFetching`, `isPlaceholderData` |
| Code the user may never need | `React.lazy` + `Suspense` (chapter 05) |
| A filter that makes rendering expensive (not the data) | `useDeferredValue`/`startTransition` (file 09) |
| A widget that loads its own data independently | its own `Suspense` inside its own error boundary, so it cannot take the page down |
| A one-off fetch in a leaf component, no library | `useEffect` + flags (Part 7). Do not hand-roll a suspense cache for this |

⚠️ **Do not mix patterns inside one data flow.** A screen that fetches with flags in one component, suspends in the next and prefetches with a hand-written `Map` in a third is a screen nobody can reason about. Pick per *screen*, prefer the library, and keep the suspense caches (if any) in one module.

---

## 11. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Creating the promise during render | infinite suspension and a request per render | stable, cached, keyed promises |
| 2 | No `Suspense` above a suspending component | a React error about suspending during a synchronous update | wrap in a boundary (routers provide one) |
| 3 | `Suspense` without an error boundary | a failure leaves the user on a spinner for ever | wrap lazy/data boundaries in an error boundary |
| 4 | `try/catch` around `use(promise)` | swallows the suspension mechanism | let React suspend; catch inside the data layer |
| 5 | Caching the value but not the promise | a new promise per render even though the data is cached | cache the promise itself |
| 6 | Boundary at the root | one panel's wait blanks the page | boundary where the waiting happens |
| 7 | Fallback with a different size than the content | layout shift on every load | skeleton matching the final shape |
| 8 | Fallback that fetches or animates | it restarts on every suspension | keep fallbacks static and dumb |
| 9 | Flash of skeleton for 20 ms loads | visual noise | delay the fallback, or prefetch |
| 10 | Transition omitted when replacing visible content | content disappears and a spinner appears (measured) | `startTransition` for navigation/refresh |
| 11 | Hand-rolled cache in production | no dedupe, retries, invalidation or GC | a data library (`useSuspenseQuery`) |
| 12 | Mixing flag-based and suspense fetching per screen | two mental models, inconsistent UX | one pattern per data flow |

---

## 12. Best practices

1. **Think of `Suspense` as a rendering boundary**: it decides *where* "not ready" shows, never *how* data is fetched.
2. **Give every suspenseful region a stable, cached promise** — or use a library that does it for you.
3. **Pair each `Suspense` with an error boundary**; pending and failed are different states, and only one of them is React's job.
4. **Put boundaries around what actually waits**, not around the app.
5. **Skeletons with the content's shape**, static, no nesting, delayed for fast loads.
6. **Wrap navigations and refreshes in transitions** so existing content stays on screen (file 09 shows the mechanism measured, and the pending flag it exposes).
7. **Let the data library own caching, retries and invalidation** — that is what it is for.
8. **Decide per screen** between flag-based and suspense-based fetching, and keep it consistent within that screen.
9. **Prefetch what the user is about to open** (hover, idle, after login) — the best fallback is the one nobody sees.
10. **Test the waiting states**: a slow network profile, a failing request, and a cached second visit are three different code paths and only one of them is the happy path you develop against.

---

## 13. Practice

### Beginner

1. Explain in your own words the difference between "the component suspended" and "the request failed", and which boundary handles each.
2. Why must the promise passed to `use()` be stable across renders? Describe what the user sees if it is not.
3. For each, say whether you would show a fallback or keep the old UI: (a) opening a screen for the first time; (b) switching tabs inside a screen that is already rendered; (c) refreshing a list after a mutation; (d) the first load of the app.

### Intermediate

1. Take the lab's `Switcher` and add a third variant: the switch inside a transition **and** with a stale-time cache so the second visit to `slow-a` renders instantly. Describe the fallback behaviour on the first and second visits.
2. Convert one screen of the shop admin from flag-based `useQuery` to `useSuspenseQuery` + `Suspense`, keeping the existing skeleton component as the fallback. List what changes in the component (branches removed), what moves (error boundary, prefetch), and what the user experience difference is on a slow connection.
3. Write the fallback-delay rule you would ship: which load times should show a skeleton, which should show nothing, and how you would implement it without causing a layout shift.

### Challenge

1. Build a small `suspendable` helper that takes a loader function and returns a `use`-ready resource with `pending/success/error` states, per-key caching, and an eviction policy (no unbounded `Map`). Then prove with the lab probe that (a) two components sharing a key make one request, (b) a rejected key is not retried on every render, (c) memory does not grow with the number of visited keys.
2. Design the loading experience for a dashboard with four widgets (chart, table, activity feed, summary), each with its own data. Decide the boundary layout, what suspends where, which updates are transitions, what happens when one widget fails, and how the page behaves when the user changes the date range. Justify every choice with the measurements in this file (fallback flashes, old-UI retention, blast radius).
3. Explain and demonstrate the difference between `Suspense` and `useDeferredValue` for a slow list: modify the lab so the *data* is suspenseful but the *filtering* is expensive, and show which tool fixes which half. Measure both and write the paragraph that tells a teammate which to reach for.

---

## 14. Solutions

### Beginner

1. "Suspended" means the data (or code) is still on its way — nothing is wrong; React renders the fallback and retries when the promise resolves. "Failed" means the promise rejected; there is nothing to render, and only an **error boundary** can show the user something sensible and offer a retry.
2. React compares the promise it is waiting on across renders. A new promise every render means the previous wait is abandoned and a new one starts, so the component suspends again on each render: the user sees a fallback that never resolves (and the network panel shows a request per render).
3. (a) First visit: fallback (skeleton). (b) Switching tabs in an already-rendered screen: keep the old UI — a transition. (c) Refreshing after a mutation: keep the old UI (stale-while-revalidate) and show a subtle pending indicator. (d) First app load: a shell-level fallback is fine, but the smaller and more shape-matching, the better; ideally most of it is prefetched or server-rendered.

### Intermediate

1. First visit to `slow-a`: because the promise is not cached, the boundary shows the fallback for ~250 ms (or, inside a transition, keeps whatever was on screen). Second visit: the promise is already resolved in the cache, so `use()` returns immediately, the fallback never appears and `isPending` is never true — and if the data is *stale*, the transition version refreshes in the background while the old values stay on screen (exactly the `isPlaceholderData` behaviour measured in Part 9, file 06).
2. The component loses its `isPending`/`isError` branches (`data` is guaranteed), keeps its skeleton as the `Suspense` fallback, and gains a boundary above. The error UI moves from an in-component branch to the boundary's fallback, and prefetching moves to where the user is likely to navigate (hover, idle). UX difference on a slow connection: instead of the component rendering "loading…" *inside* the page (with the page's layout already there), the boundary's skeleton replaces that region — and with a transition on navigation, the previous screen stays until the new data is ready, which is usually the bigger win.
3. Rule: loads under ~150 ms show nothing (the content simply appears); 150 ms–2 s show a shape-matching skeleton; beyond ~2 s, escalate to a message ("Still loading — check your connection") without abandoning the wait. Implementation: a fallback component that renders `null` for the first 150 ms (`useState` + `setTimeout` in an effect, cleared on unmount) and then the skeleton; the region keeps its height via a min-height container so the delayed appearance does not shift layout.

### Challenge

1. ```ts
   type Status = 'pending' | 'success' | 'error';
   interface Entry<T> { status: Status; value?: T; error?: unknown; promise?: Promise<void>; usedAt: number }
   const store = new Map<string, Entry<unknown>>();
   export function suspendable<T>(key: string, loader: () => Promise<T>): Entry<T> {
     const existing = store.get(key) as Entry<T> | undefined;
     if (existing) { existing.usedAt = Date.now(); return existing; }
     const entry: Entry<T> = { status: 'pending', usedAt: Date.now() };
     entry.promise = loader().then(
       (value) => { entry.status = 'success'; entry.value = value; },
       (error) => { entry.status = 'error'; entry.error = error; },
     );
     store.set(key, entry);
     if (store.size > 200) { /* evict the least recently used settled entry */ }
     return entry;
   }
   ```
   Proofs: (a) two components calling `suspendable('p1', load)` get the same entry, so the loader runs once (count the loader calls; the "in flight" promise is shared, not re-created); (b) a rejected entry has `status: 'error'` and the promise is not recreated, so renders rethrow the cached error instead of re-fetching — a retry must clear the key explicitly; (c) with an LRU cap, `store.size` stays bounded while `usedAt` drives eviction; running the probe across 1,000 keys leaves the map at its cap.
2. Layout: a page-level boundary for the date-range control's data, plus one boundary per widget (chart, table, feed) and a cheap summary that renders from already-loaded data. Only the widgets suspend; the shell, the controls and the previously loaded date range stay interactive because the range change is a **transition** (measured: old UI retained, `pending=true` for the indicator). One widget's failure is contained by its own boundary (blast radius: one card, not the page; the other three keep working), and retry is per-widget. Changing the range is one transition, so the page does not flash four skeletons on every change; the four widgets may reveal at slightly different times, which is the price of per-widget boundaries and the reason the summary card is not suspenseful.
3. Suspense covers **waiting on data**: the boundary shows a fallback (or keeps the old UI inside a transition) while the promise is pending. `useDeferredValue` covers **expensive rendering of data you already have**: the input updates immediately, the list renders with the previous value and then catches up — measured in file 09 (3 keystrokes: eager 4 expensive runs vs deferred 2, with React skipping intermediate values). The tool follows the bottleneck: slow network → Suspense (+ a library); slow CPU in render → deferred value/transition; both → prefetch with Suspense so there is nothing to wait for, and defer the filter so typing stays snappy.

---

## 15. Summary

- **`Suspense` is a rendering boundary for "not ready yet".** A child suspends (a lazy chunk in flight, or a promise read with `use()`); React renders the nearest fallback instead and swaps in the real subtree when the promise resolves.
- **`use()` reads promises and contexts during render**, may be called conditionally, and does not fetch or cache — it needs a promise your data layer already owns.
- **The promise must be stable.** Measured: a cached promise rendered instantly on a second mount; a promise created during render would suspend again on every render, producing a spinner that never resolves.
- **Rejections are errors, not suspensions.** Measured: `use()` on a rejected promise produced `"Something went wrong: could not load missing"` from the error boundary. Every suspenseful region needs both boundaries.
- **A transition keeps the old UI.** Measured: without one, the old panel was hidden and the fallback was visible right after the click; inside one, the fallback stayed invisible, the old panel stayed visible, and `isPending` was `true` — the new panel appeared only when ready.
- **Fallbacks are UI design**: match the content's shape, keep them static, do not nest spinners, and delay them for loads that are usually fast.
- **Use a data library in production** (`useSuspenseQuery` in this app's TanStack Query setup): keyed promises, dedupe, retries, invalidation and an error path are exactly the parts a hand-rolled cache gets wrong.
- **Suspense handles waiting; file 08 handles failing.** Together with a transition, they are how a screen stops flashing during navigation.

---

**What's next →** [`08-error-boundaries.md`](./08-error-boundaries.md) draws the line around failure: a boundary that catches render and effect errors but not event handlers or timers, measured case by case; how to reset it properly (and why `reset()` alone was not enough in the lab); where to place boundaries so one broken widget cannot take the app down; what to report; and how React Router's route-level errors fit in.
