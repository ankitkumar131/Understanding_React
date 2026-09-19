# 07 — `use()`: Reading Promises and Contexts Anywhere

> **Part 11 · Modern React · File 7 of 8**

Why this file exists: `use()` looks like a hook and is deliberately not one. It reads a **promise** or a **context**, it may be called inside conditions and loops (which hooks may not), and it suspends the component until the promise resolves — which is what connects it to Suspense and to every modern data library. It is also the easiest React 19 API to get wrong, because a promise created during render is a *new* promise on every render, and React will suspend forever in a loop that looks completely reasonable. This file measures the happy path (fallback, then value), states the two rules that make it safe, shows `use(context)` replacing `useContext` in a conditional, and explains why you should usually let a library own the caching.

Transcript from `npx tsx --tsconfig tsconfig.app.json src/dev/run-actions-probe.tsx`, section D.

---

## 1. What `use()` is, precisely

```tsx
import { use } from 'react';

const value = use(somePromise);     // suspends until it resolves, then returns the value
const theme = use(ThemeContext);    // exactly like useContext, but conditional-friendly
```

Three facts define it:

1. **It is not a hook.** React's rule of hooks ("call them at the top level, never inside conditions or loops") exists because hooks are identified *by call order*. `use()` is identified by its argument, so it can be called conditionally — the first and only React API with that property.
2. **It suspends.** Reading a pending promise throws the promise to the nearest Suspense boundary (Part 10, file 07), which shows its fallback until the promise resolves.
3. **It does not cache.** `use()` does not remember promises or results. If the component re-renders with a *different* promise, it suspends again; if it re-renders with the *same* promise (same object identity), React can read the resolved value without suspending again.

⚠️ **The rule that governs everything else: the promise must be stable across renders.** Suspense only works when "the thing you are waiting for" is the same object on every render. A promise created *inside* the component is a new object each time — so React suspends, the component renders again, creates another promise, suspends again… forever.

```tsx
// ❌ a new promise on every render: an infinite suspension loop
function Profile() {
  const user = use(fetch('/api/me').then((response) => response.json()));
  return <p>{user.name}</p>;
}

// ✅ the promise is created once, outside the render (a module cache, a library, or a parent)
const userPromise = fetch('/api/me').then((response) => response.json());
function Profile() {
  const user = use(userPromise);
  return <p>{user.name}</p>;
}
```

---

## 2. Measured: a stable promise, a fallback, then the value

```text
=== D. use() with a promise: Suspense while pending, the value after resolution ===
   first frame: loading label
   after resolution: label for products
   loadLabel returns the same promise for the same key: true
   renders: Label:render #1=1
```

```tsx
// src/part11/ActionsLab.tsx
const cache = new Map<string, Promise<string>>();

export function loadLabel(key: string): Promise<string> {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;              // ← the identity guarantee
  const promise = new Promise<string>((resolve) => {
    setTimeout(() => resolve(`label for ${key}`), 30);
  });
  cache.set(key, promise);
  return promise;
}

function Label({ promise, index }: { promise: Promise<string>; index: number }) {
  const text = use(promise);                                 // suspends while pending
  trace(`Label:render #${index}`);
  return <span data-testid={`label-${index}`}>{text}</span>;
}

export function UsePromiseCase({ index }: { index: number }) {
  return (
    <Suspense fallback={<span data-testid="label-fallback">loading label</span>}>
      <Label promise={loadLabel('products')} index={index} />
    </Suspense>
  );
}
```

**Line by line.**

- `const cache = new Map<string, Promise<string>>()` — a module-level cache. It exists for one reason: to make `loadLabel('products')` return **the same promise object** every time. This is the whole trick, and it is why every real implementation lives inside a library.
- `loadLabel('products')` — called during the parent's render. It is safe *because* the cache guarantees identity; without it, this line is the infinite-suspension bug.
- `use(promise)` — on the first render the promise is pending, so React throws it to the `<Suspense>` boundary; when it resolves, React re-renders `Label` and `use` returns the value.
- `<Suspense fallback={…}>` — the UI for the waiting state (measured: `first frame: loading label`).
- `Label:render #1=1` — the component rendered **once**: the suspense "render" (which never completed) does not count as a committed render of `Label`, and the resolved render is the one that shows up. Compare that with the naive "render a spinner and re-render when data arrives" pattern, which costs at least two committed renders.

💡 The transcript's `loadLabel returns the same promise for the same key: true` is the assertion worth copying into a test: **a promise cache must be idempotent**, or Suspense will loop.

---

## 3. `use(context)`: the same API, for context

`use(ThemeContext)` behaves like `useContext(ThemeContext)` — with one crucial difference: it can be called **conditionally**, because it is not order-based.

```tsx
function Price({ showBadge }: { showBadge: boolean }) {
  const price = use(PriceContext);              // ✅ allowed inside a condition/branch
  return (
    <p>
      {price.amountMinor / 100}
      {showBadge ? <Badge label={use(DiscountContext).label} /> : null}   {/* ✅ legal, if unusual */}
    </p>
  );
}
```

⚠️ **Purity still applies.** `use()` reads values during render, so it must be called inside a component or another `use()` — not in event handlers, not in `useEffect`, and certainly not inside `try`/`catch` (a throwing promise inside a `try` would be swallowed as an error instead of suspending). It is a *render-time read*, exactly like `useContext`.

💡 **When it is worth using `use(Context)` instead of `useContext(Context)`:** when you must read a context inside a branch you cannot hoist — for example inside a `map` callback that only needs the value for some rows, or after an early `return`. Both APIs are supported in React 19; `useContext` remains the idiomatic choice at the top of a component, and `use` is the escape hatch.

---

## 4. The rules, collected

| Rule | Why | Broken symptom |
| --- | --- | --- |
| The **promise identity must be stable** across renders | Suspense re-checks the same promise; a new one restarts the wait | infinite suspension / flicker |
| Create promises **outside render** (module cache, library, parent) | render functions may run many times (StrictMode twice) | duplicated requests, loops |
| **A rejected promise is an error**, not a fallback | React throws it during render | the fallback shows forever unless a boundary catches it |
| Do not wrap `use()` in `try`/`catch` | a throwing read is control flow for Suspense | Suspense never engages |
| Fine to call **conditionally or in loops** | not order-based | (no symptom — this is the feature) |
| Give it a **Suspense boundary** somewhere above | something must render the waiting state | the error "A component suspended while responding to synchronous input" or a blank screen |
| Pair with **transitions** for updates that would otherwise flash | keep the old UI while new data loads | fallback flicker on every keystroke |

---

## 5. A rejected promise is an error

```tsx
const productPromise = getProduct(id);   // may reject
function Product() {
  const product = use(productPromise);   // rejects → React throws it during render
  return <h1>{product.name}</h1>;
}

// Correct framing: a Suspense boundary for the waiting state and an error boundary for the failure
<ErrorBoundary fallback={<ErrorPanel />}>
  <Suspense fallback={<Skeleton />}>
    <Product />
  </Suspense>
</ErrorBoundary>
```

Measured in file 02 for actions and in Part 10, file 08 for render errors: **rejections surface to the nearest error boundary**. For a promise read with `use()`, this means the "failed to load" state is the boundary's job, while "still loading" is Suspense's — which is a cleaner separation than the `if (loading) … if (error) …` ladder from Part 7, and the reason frameworks and data libraries adopt it.

⚠️ The two boundaries must be nested in the right order: the **error boundary outside**, the **Suspense inside**, so a rejection replaces the *content* rather than the whole page. (An error boundary placed inside Suspense will still catch it; the outside placement is what keeps the fallback/skeleton strategy coherent when the parent re-suspends.)

---

## 6. Why you should rarely call `use()` yourself

The `Map` cache in section 2 is a toy. Real requirements for a promise cache — and every one of them is a bug you would have to fix:

| Requirement | Why a `Map` cache fails |
| --- | --- |
| Keyed by every input (params, query, auth) | the key must include the user, the token, the filters |
| Deduplicate in-flight requests | the same request fired twice must share one promise |
| Errors must not be cached forever | a failed request must be retryable |
| Invalidation after mutations | a create must refresh the list |
| Garbage collection | entries must expire or memory grows unbounded (Part 9's `gcTime`) |
| Time-based staleness | cache hits must respect `staleTime` |
| SSR safety | a module-level cache leaks between requests on the server |

That list is TanStack Query (Part 9, file 06), SWR, or a framework's loader — and those libraries hand you a promise (or a resource) you can pass to `use()` while they own the hard parts.

```tsx
// The idiomatic React 19 shape: the library owns caching, you only read
const productQuery = useQuery({ queryKey: productKeys.detail(id), queryFn: () => fetchProduct(id) });

function Price() {
  const product = use(productQuery.promise);   // ← Suspense-friendly read
  return <p>{formatMinor(product.priceMinor)}</p>;
}
```

💡 **The rule of thumb:** if you are writing a `Map` or a `WeakMap` next to a `use()` call, you are re-implementing a library. Use `use()` for reading promises *someone else* created (a loader, a query client, a framework), and read the docs of that provider for how it integrates with Suspense.

---

## 7. When to use `use()`, and when not to

| Use it | Avoid it |
| --- | --- |
| Reading a promise supplied by a router/library/framework | Creating promises during render |
| Reading a context inside a condition where `useContext` cannot go | As a general replacement for `useContext` (it is not clearer) |
| Components under a Suspense boundary you already have | Small components that could just take props |
| Server-rendered/streamed data (Suspense + streaming) | Anywhere without an error boundary for rejections |
| With `<Activity>` to pre-render hidden content that reads the same promises | As a fetch trigger — `use()` never starts a request by itself |

⚠️ The last row is subtle but important: **`use()` does not fetch.** It reads a promise that already exists. Starting the request is someone else's job (an event handler, a loader, a query client). If you feel like `use()` is "the new way to fetch", you are looking at a library's `use()`-compatible API, not React's primitive.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `use(fetch(...).then(...))` inside a component | a new promise every render → infinite suspension | create it outside render, or use a library |
| 2 | Calling `use()` outside a component or in an effect | "Invalid hook call"-style errors / no effect | render-time reads only |
| 3 | Wrapping it in `try`/`catch` | Suspense never engages; the error is consumed | let it throw; boundaries handle errors |
| 4 | No Suspense boundary above | blank screen or a confusing error | wrap the reading subtree |
| 5 | No error boundary for rejections | a rejected promise replaces nothing; the app is stuck | `ErrorBoundary > Suspense > content` |
| 6 | Caching by an incomplete key | two users share a cached promise | key by everything that changes the result (Part 9) |
| 7 | Caching rejections | one failure poisons the entry for ever | mark failed entries and retry |
| 8 | Module-level cache with SSR | leaks data between users | request-scoped cache (`cache()` in RSC, or a client library) |
| 9 | Expecting `use()` to fetch | nothing happens; you read a promise nobody created | start the request elsewhere |
| 10 | Using it for a value you already have in props | needless indirection | pass the value |
| 11 | Suspending on every keystroke without a transition | fallback flicker | `useTransition` around the update (file 05) |
| 12 | Assuming `use()` deduplicates with `useContext` | they are different reads; identity rules differ | use each for its purpose |

---

## 9. Best practices

1. **Treat promise identity as the contract**: one promise per key, for the lifetime of the data's usefulness.
2. **Let a library own the cache**, and treat `use()` as the read side of that contract.
3. **Wrap every `use()`-reading subtree in Suspense for the wait and an error boundary for failure.**
4. **Use `useTransition`/`useDeferredValue`** when the same component will suspend again during typing, so the old UI stays.
5. **Design the fallback** (Part 10, file 07): a skeleton that matches the final layout beats a spinner.
6. **Never call `use()` in an event handler or effect** — it is a render-time read.
7. **Prefer `useContext` at the top of a component**, and `use()` only when a condition forces it.
8. **Do not build your own promise cache** — write the list in section 6 on a sticky note and compare it with what you are about to write.
9. **Test the rejection path**, because a rejected promise read by `use()` is an error boundary, not a fallback.
10. **Keep SSR in mind**: a module-level `Map` is a cross-request leak on the server; the library you chose exists partly for this.

---

## 10. Practice

### Beginner

1. In one sentence each: what `use(promise)` does, why the promise must be stable, and what happens when a promise read by `use()` rejects.
2. Which of these are legal, and why? (a) `use()` inside an `if`; (b) `use()` inside a `for` loop; (c) `use()` inside `useEffect`; (d) `use()` inside `try { } catch { }`; (e) `use()` inside a click handler.
3. Fix the bug: `function Bad() { const data = use(fetch('/api/x').then(r => r.json())); return <p>{data.id}</p>; }`

### Intermediate

1. Build a `createResource(key, loader)` helper that returns the same promise for the same key, exposes an error state, and supports an explicit `invalidate(key)`. Then write down the three requirements from section 6 it still fails to satisfy.
2. Take a component that reads a context inside a `.map()` (impossible with `useContext` without restructuring) and rewrite it with `use(Context)`. Compare readability honestly.
3. Make a search UI where each query key reads a promise: what happens without a transition when the user types four characters quickly? What changes with `startTransition` around the query state (file 05)?

### Challenge

1. Compare three data strategies for the same screen — `useEffect` + `useState` (Part 7), TanStack Query (Part 9), and Suspense + `use()` — across: loading state, error state, caching, retries, cancellation, waterfall behaviour, SSR readiness and testing. Write the recommendation table.
2. Implement a tiny Suspense-compatible cache (a `Map` of promises + a status per entry) that handles success, failure, invalidation and garbage collection, then diff your API against TanStack Query's and list the features you did not build.
3. Design the Suspense/error strategy for a product detail page: which boundaries exist, what each fallback is, where the error boundary sits, how a slow related-products request must not block the main content, and how a retry works after a rejection.

---

## 11. Solutions

### Beginner

1. `use(promise)` reads a promise's value during render, suspending the component (via the nearest Suspense boundary) until it resolves; the promise must be stable because React re-reads the same promise on every render — a new promise restarts the wait and a same-key-different-object promise loops; a rejection is thrown during render, so it goes to the nearest **error boundary** (not the fallback).
2. Legal: (a) and (b) — `use()` is not order-based. Illegal/fragile: (c) effects are not render; (d) `try`/`catch` swallows the suspension signal and turns it into an error; (e) event handlers are not render.
3. Move the request out of render and cache it: `const userPromise = fetch('/api/x').then(r => r.json());` at module scope (or, better, fetch it through a library and read `query.promise`), then `const data = use(userPromise)` inside the component.

### Intermediate

1. ```tsx
   const cache = new Map<string, { promise: Promise<unknown>; error?: unknown }>();
   export function createResource<T>(key: string, loader: () => Promise<T>): Promise<T> {
     const entry = cache.get(key);
     if (entry !== undefined) return entry.promise as Promise<T>;
     const promise = loader().catch((error: unknown) => {
       cache.delete(key);          // do not poison the entry
       throw error;
     });
     cache.set(key, { promise });
     return promise as Promise<T>;
   }
   export function invalidate(key: string): void { cache.delete(key); }
   ```
   It still fails: key completeness (callers must build the key), dedup across components is only per-key (correct here, by construction), no staleness/TTL or GC (the map grows), no retry policy, and no SSR isolation.
2. ```tsx
   function Row({ row }: { row: Row }) {
     const currency = use(CurrencyContext);        // was impossible with useContext here
     return <td>{formatMoney(row.priceMinor, currency)}</td>;
   }
   ```
   Readability verdict: the win is real when the context read depends on the *data* (only some rows need a currency), but the loss is that `Row` no longer declares its dependency at the top — reviewers must read the body to know. Prefer hoisting the context to the list and passing the value down; use `use()` when that would mean threading one value through ten components.
3. Without a transition: each keystroke changes the key, the component suspends, the fallback replaces the results, and the user sees flicker for every character. With `startTransition(() => setQuery(next))`: React keeps the *previous* results on screen while the new promise resolves (because the update is interruptible and non-urgent), so four fast keystrokes produce one visible change at the end — measurably calmer, and the reason Suspense and transitions are described as friends.

### Challenge

1. A fair table: `useEffect` + `useState` — full control, no caching, waterfalls, manual cancellation, easy to test but repeated in every component; Query — caching, dedupe, staleTime/gcTime, retries, keepPreviousData, devtools, good tests with a `QueryClientProvider` wrapper; Suspense + `use()` — the cleanest component code and no loading ladders, but it needs a promise source with a correct cache and boundaries, and testing requires a Suspense-aware test setup. Recommendation: Query (or the framework loader) as the caching layer, Suspense + `use()` as the *view* layer for data-dense screens, `useEffect` only for genuinely local side-effect-driven state.
2. A minimal but honest implementation: entries hold `{ promise, status: 'pending' | 'success' | 'error', value?, error? }`, `read(key)` throws the promise while pending, throws the error when failed, returns the value on success; `invalidate(key)` deletes; a `setTimeout` sweeps entries older than N seconds. Missing versus Query: background refetch, staleness windows, retry/backoff, structural sharing, `keepPreviousData`, devtools, `useInfiniteQuery`, prefetching, persistence.
3. Boundaries: a route-level error boundary (something failed catastrophically); a content-level Suspense for the product (skeleton matching the layout); an *independent* Suspense boundary around related products so its slower request does not block the main content; an error boundary around related products with an inline retry. Retry strategy: the error boundary's fallback has a button that calls `invalidate(key)` and re-renders (which restarts the read), rather than reloading the page.

---

## 12. Summary

- **`use(promise | context)` is a render-time read that suspends** when a promise is pending. It is not a hook: it may be called **conditionally and in loops**.
- **A rejected promise is an error, not a fallback** — the nearest error boundary handles it, which is the clean split: Suspense for waiting, boundaries for failure.
- **Measured happy path**: `first frame: loading label` from the Suspense fallback, then `after resolution: label for products`, with `Label:render #1=1` — one committed render, not a spinner-then-content double render.
- **The identity rule is the whole API**: the promise must be the same object across renders (measured assertion: `loadLabel returns the same promise for the same key: true`). A promise created during render is an infinite suspension loop.
- **`use()` never fetches.** It reads a promise someone else created; start requests in handlers, loaders or a query client.
- **Do not hand-roll the cache.** The list of requirements for a real promise cache (keys, dedupe, retries, invalidation, GC, staleness, SSR) is exactly what Part 9's data library exists to provide.
- **`use(Context)` is a conditional-friendly `useContext`**, useful when a branch or a `.map` forces the read — but `useContext` at the top of a component remains the idiomatic default.

---

**What's next →** [`08-react-compiler.md`](./08-react-compiler.md) closes the part with the tool that removes most of the manual memoisation of Part 10: the React Compiler. What it does (measured: a component compiled into memo-cache slots, with its `filter` and its inline callback hoisted), what it requires (purity, the rules of React), what it cannot fix (expensive commits, slow networks, bad algorithms), and how to turn it on in a Vite project and tell whether it helped.
