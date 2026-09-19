# 06 — Server State: TanStack Query Instead of Hand-Written Caching

> **Part 9 · State Management · File 6 of 6**

Why this file exists: every tool in this part — `useState`, context, Redux Toolkit, Zustand — is built for state **you own**. A product list, an order, a user profile and a search result are not that: they are copies of data the server owns, and they come with problems none of those tools solve (staleness, deduplication, invalidation, retry, garbage collection). Part 7, files 09–10 built that machinery by hand — deliberately, so you would recognise it — and this file replaces it with the library that has already solved it. Everything below is measured against the same mock API: **two components sharing one request, a remount that fetches nothing, a mutation that refreshes the list, an optimistic delete that survives a failure, retry with backoff, and the previous page staying on screen while the next one loads.**

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-query-probe.tsx` (TanStack Query 5.103.1, React 19.2.8, against the Part 7 mock API).

---

## 1. Two kinds of state, and why the difference is the whole point

| | Client state | Server state |
| --- | --- | --- |
| Who owns the truth | your app | the server |
| Where it lives | memory (`useState`, context, store) | a copy in your app, plus the record it came from |
| Can it change without you? | no | **yes** — another user, another tab, a job |
| Is it shared? | within your session | across users, devices and tabs |
| Needs loading/error states? | no | yes, always |
| Needs invalidation? | no | yes, after every write |
| Multiple copies are | a bug (file 01, section 1) | normal — and they must be kept in step |

That last row is what makes server data *hard*. With client state, one copy in one place is the goal. With server data you cannot have one copy — the server has one, and your app may hold several (a list row, a detail page, a search result) — so the goal changes from "do not duplicate" to **"know how old each copy is, and when to replace it"**.

Every hand-written attempt at this ends up inventing a cache. The rest of this file is what happens when you stop inventing and use the library that already did.

---

## 2. What you hand-write without a cache

Part 7's chapters built each of these, and each one is a real piece of code with real edge cases:

| The problem | What the hand-written version has to get right | Where Part 7 did it |
| --- | --- | --- |
| Loading UI | distinguish *first load* (nothing to show) from *refetch* (show stale data, no spinner) | file 09 |
| Error UI | typed errors, a retry path, keeping the previous data on failure | file 10 |
| Request deduplication | two components asking for the same thing must produce **one** request | file 09 |
| Cancellation | abort on unmount, ignore the response that arrives late | file 10 |
| Race conditions | the last answer must not overwrite a newer request's answer | file 10 |
| Retry | which errors are retryable, how many times, how long between attempts | file 10 |
| Cache | store the result, decide when it is stale, drop it eventually | file 09 |
| Invalidation | after a write, every cached list containing that row is now wrong | files 06–08 |
| Optimistic updates | change the cache first, roll back if the write fails | file 08 |
| Refetch triggers | on focus, on reconnect, on mount if stale | *not built* |

💡 The honest test: **"could I write tests that prove each row of that table?"** If not, that row is where your hand-written version has a bug you have not met yet. Every one of those behaviours has a default in the library, and every default is overridable.

---

## 3. Install, client, provider

```bash
npm install @tanstack/react-query
```

```ts
// src/part9/queryClient.ts
import { QueryClient } from '@tanstack/react-query';
import type { ProductQuery } from '../api/products';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // data stays "fresh" for 30s: no refetch on remount
        gcTime: 5 * 60_000, // and is thrown away 5 minutes after the last user
        retry: 1, // the library default is 3; the lab keeps it small
        refetchOnWindowFocus: false,
      },
    },
  });
}

export const queryClient = makeQueryClient();

// Query keys are arrays, and a key factory keeps them from drifting apart.
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (query: ProductQuery) => [...productKeys.lists(), query] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
};
```

```tsx
// src/main.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './part9/queryClient';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
```

### Line by line

- `new QueryClient({ defaultOptions: { queries: { … } } })` — one client for the whole app. Its defaults are the library's: `staleTime: 0`, `gcTime: 5 * 60_000`, `retry: 3` on the client (0 on the server), `refetchOnWindowFocus: true`, `refetchOnReconnect: true`. This lab overrides four of them; section 15 explains how to choose.
- `queryClient` is created **once, at module scope**, exactly like the Redux store and the Zustand store — so router loaders, tests and event handlers can use it without React.
- `productKeys` — a **key factory**. Keys are arrays, and the hierarchy (`['products'] → ['products','list'] → ['products','list',{…}]`) is what makes invalidation possible at any level: `invalidateQueries({ queryKey: productKeys.lists() })` matches every list, whatever its filters.
- `QueryClientProvider` — a context whose value never changes (file 02's only safe kind), so it never causes a re-render.
- `makeQueryClient()` as a factory alongside the singleton: the same trick as file 05's `createCartStore()`, and the reason SSR apps can build one client per request.

⚠️ In Next.js/SSR the documented pattern is to create the client inside a component with `useState(() => new QueryClient(…))` so a server render does not share a client across requests. In a plain Vite SPA, a module-level client is correct and simpler — and it is what makes it usable outside React.

---

## 4. `useQuery`, line by line

```ts
// src/part9/useProducts.ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createProduct, deleteProduct, getProduct, listProducts, type ProductPage, type ProductQuery } from '../api/products';
import type { ApiProductDraft } from '../api/types';
import { productKeys } from './queryClient';

export function useProductsQuery(query: ProductQuery) {
  return useQuery({
    queryKey: productKeys.list(query),
    queryFn: ({ signal }) => listProducts(query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useProductQuery(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: ({ signal }) => getProduct(id, signal),
    enabled: id !== '', // don't fetch until we have an id
  });
}
```

```tsx
// src/part9/CatalogPanel.tsx (the interesting part)
export function CatalogPanel({ query }: { query: ProductQuery }) {
  const products = useProductsQuery(query);

  return (
    <section data-testid="catalog">
      <p data-testid="status">
        isPending={String(products.isPending)} isFetching={String(products.isFetching)} isStale={String(products.isStale)}{' '}
        placeholder={String(products.isPlaceholderData)} rows={products.data?.items.length ?? 0}
      </p>

      {products.isPending ? <p data-testid="loading">Loading…</p> : null}
      {products.isError ? (
        <p data-testid="error" role="alert">
          {products.error.message} <button type="button" onClick={() => void products.refetch()}>Try again</button>
        </p>
      ) : null}

      <ul data-testid="rows">
        {(products.data?.items ?? []).map((product) => (
          <li key={product.id}>…</li>
        ))}
      </ul>
    </section>
  );
}
```

### Line by line

- `useQuery({ queryKey, queryFn })` — the object form (v5; the v4 positional form `useQuery(key, fn)` is gone). Two required properties, and the whole mental model is in them: the key identifies *what*, the function produces *it*.
- `queryKey: productKeys.list(query)` — an array built from the parameters. **The key is the cache address and the dependency list at the same time**: change `query` and React Query looks up a different entry, fetching only if that entry is missing or stale.
- `queryFn: ({ signal }) => listProducts(query, signal)` — receives a context object whose `signal` you pass to `fetch`/axios, so an abandoned query is actually cancelled (Part 7, file 10's `AbortController`, handled for you). The function must **throw on failure** (or return a rejected promise) — throwing is how the hook learns about errors, so a `fetch` wrapper that returns `{ error }` needs adapting.
- `placeholderData: keepPreviousData` — while a *new* key loads, show the previous key's data. That is the "pagination without flicker" trick, measured in section 12.
- `enabled: id !== ''` — a **dependent query**. While `enabled` is false the query does not run at all (`status: 'pending'` with `fetchStatus: 'idle'`), which is how you wait for an id, a token or a selected row.
- `products.data?.items ?? []` — `data` is `ProductPage | undefined`; the optional chaining is the type system reminding you that the first render has no data. Never cast it away with `!` — that is how production crashes start.
- `products.isPending` / `isError` / `data` — the three states a server-reading component must render. **`isPending` means "no data yet"**, not "a request is in flight" — the distinction is section 8.

### The component's shape is the lesson

Notice what the component does *not* contain: no `useEffect`, no `useState` for data, no `loading` boolean, no `error` variable, no abort handling, no cleanup, no "am I unmounted?" check. Compare with Part 7, file 09's `ProductsGallery`, which needed all of those — around 60 lines of machinery for what is now 4. That deletion is the point of this file.

---

## 5. What the hook returns

| Property | Type | Meaning |
| --- | --- | --- |
| `data` | `T \| undefined` | the last successful result (kept while refetching or after an error) |
| `error` | `TError \| null` | the failure, if the last attempt failed |
| `status` | `'pending' \| 'error' \| 'success'` | *data* status: do I have data? |
| `isPending` | boolean | `status === 'pending'` — **no data yet** (first load) |
| `isError` / `isSuccess` | boolean | convenience flags for the other two |
| `fetchStatus` | `'fetching' \| 'paused' \| 'idle'` | *network* status: is a request running? |
| `isFetching` | boolean | `fetchStatus === 'fetching'` — any request, including background refetches |
| `isLoading` | boolean | `isPending && isFetching` — the "spinner" case (first load *and* requesting) |
| `isStale` | boolean | the data is older than `staleTime` (or was invalidated) |
| `isPlaceholderData` | boolean | the rows on screen are a placeholder, not this key's data |
| `dataUpdatedAt` | number | timestamp of the last successful fetch (for "updated 2 min ago") |
| `refetch` | function | fetch again now, ignoring `staleTime` |
| `isRefetching` | boolean | `isFetching && !isPending` — a background refresh |

⚠️ Two traps hide in this table. First, `isLoading` is **not** "isFetching": with data on screen, a background refetch sets `isFetching` but leaves `isLoading` false, which is exactly right for rendering (do not replace a table with a spinner). Second, `status` and `fetchStatus` are independent: a query can be `success` (it has old data) *and* `fetching` (refreshing it) at the same time.

The rule for rendering:

```tsx
if (query.isPending) return <Skeleton />;        // nothing to show yet
if (query.isError) return <ErrorBanner error={query.error} onRetry={query.refetch} />;
return (
  <>
    {query.isFetching ? <RefreshingBar /> : null} {/* silent background update */}
    <Table rows={query.data} />
  </>
);
```

---

## 6. Query keys: the cache address and the dependency list

```text
=== A. Two components, one request ===
   rows in both panels: Mechanical, Wireless, Studio | Mechanical, Wireless, Studio
   GET requests: 1 → /products?_page=1&_limit=3
   identical query keys share one cache entry, so the second panel reuses the first request

=== B. Unmount and remount inside staleTime: no new request ===
   rows on the FIRST render after remount: Mechanical, Wireless, Studio (from cache, no spinner)
   status without waiting: isPending=false isFetching=false isStale=false placeholder=false rows=3
   GET requests after 300ms: 0 (staleTime is 30s, so the cache is still fresh)
```

Four facts, each of which is a bug you would otherwise write yourself:

1. **Two components, one request** (A). Both panels mounted in the same tick with the same key: React Query notices a request is already in flight for that key and returns the same promise. Without this, a dashboard with six widgets showing the same data fires six requests — the classic *request waterfall* that makes SPAs feel slow.
2. **A remount inside `staleTime` fetches nothing** (B) — and, crucially, the first render already has rows (`rows=3` *before* any await). The component paints from cache with **no spinner and no flash of empty state**. That is the difference between "the page flickers every time you navigate" and "the page is instant".
3. **`isPending=false, isFetching=false, isStale=false`** — the fresh-cache case, where the component does no network work at all.
4. **`GET requests after 300ms: 0`** — the counter is the honest evidence; a UI screenshot cannot prove an absence of traffic.

### Key rules

- **Keys are arrays, from most general to most specific**: `['products']`, `['products','list']`, `['products','list',{ page: 1, pageSize: 3 }]`, `['products','detail','p-lamp']`. The hierarchy is what `invalidateQueries` matches on.
- **Keys must contain every parameter the request depends on** — filters, sort, page, id, and the *formatted* values (a `Date` in a key is a bug: two equal dates are different objects and would create two cache entries). Put a stable object in the key, or serialise it yourself.
- **Keys must not contain anything the function does not use.** A key that includes the user's locale when the request ignores it means two cache entries for identical data.
- **Use a factory** (`productKeys`) instead of literal arrays at call sites, so a typo or a rename is a compile error and every level of the hierarchy is defined once.
- **The key is the dependency list.** There is no `deps` array: when the key changes, the data changes. This is why `useProductsQuery(query)` with a new `query` object fetches the new page with no effect and no manual comparison.

```ts
// Stable keys matter: this component creates a NEW object every render…
useProductsQuery({ page, pageSize: 3 });

// …but React Query hashes keys structurally, so `{ page: 1, pageSize: 3 }`
// and `{ page: 1, pageSize: 3 }` are the same key. Order DOES matter, though:
// { page: 1, pageSize: 3 } and { pageSize: 3, page: 1 } hash differently.
```

⚠️ Keys are hashed **deterministically but order-sensitively**. Build them in one place (the factory) and the problem never appears.

---

## 7. `staleTime` and `gcTime`

Two timers per cache entry, and mixing them up is the most common source of confusion:

| | `staleTime` (default `0`) | `gcTime` (default 5 minutes) |
| --- | --- | --- |
| Counts from | the last successful fetch | the moment the **last** observer unsubscribed |
| Decides | whether a mount/refocus triggers a refetch | when the entry is deleted from memory |
| `staleTime: 0` means | "always refetch in the background on mount/focus" | — |
| Setting it long means | "trust this data for a while" | — |
| Setting `gcTime: Infinity` means | — | the cache never forgets (good for reference data) |
| Typical values | 30 s for lists, 5 min for reference data, `Infinity` for constants | the default is fine for almost everything |

The mental model, in one sentence: **`staleTime` is how long you are willing to show data without checking; `gcTime` is how long the data stays in memory after nobody is looking at it.**

```text
=== C. invalidateQueries marks the data stale and refetches what is on screen ===
   GET requests: 1 → /products?_page=1&_limit=3
   rows: Mechanical, Wireless, Studio
```

`invalidateQueries` sets `staleTime` aside: it marks the matching entries stale **and** refetches the ones with a mounted observer (that is the "1 request" above). Entries without observers are only marked stale — no wasted request for a screen nobody is looking at.

⚠️ A stale entry is **not** an empty one. B's `rows=3` after remount happened because the entry was still cached *and* still fresh; if it had been stale, the rows would still have been painted immediately, with a background refetch replacing them a moment later. Either way the user never sees a spinner for data you already had — the "stale-while-revalidate" behaviour that file 05's store cannot give you by itself.

---

## 8. `isPending` vs `isFetching` vs `isStale`, measured

```text
=== D. A manual refetch: isFetching without losing the rows ===
   mid-flight: isPending=false isFetching=true isStale=false placeholder=false rows=3
   rows still on screen: Mechanical, Wireless, Studio
   after it settled: isPending=false isFetching=false isStale=false placeholder=false rows=3 · requests 1
```

Read the mid-flight line: a request **is** running (`isFetching=true`), the data is **not** stale in the "please refetch me" sense (the user asked for this refresh), and `isPending=false` because there is data to render. The correct UI reaction is a subtle "refreshing" indicator and *no* removal of the rows — which is exactly what the component does.

| Situation | `isPending` | `isFetching` | What to render |
| --- | --- | --- | --- |
| First load, nothing cached | `true` | `true` | skeleton / spinner |
| Cached and fresh | `false` | `false` | the data |
| Cached, background refetch running | `false` | `true` | the data + a small "updating" hint |
| Failed, no data | `false` | `false` | error UI with a retry (`isError`) |
| Failed, but old data exists | `isError` | `false` | the old data + an error banner (never blank the screen) |
| New key with `placeholderData` | `false` | `true` | the previous data + `isPlaceholderData=true` |

That last row is section 12, and the fourth/fifth rows are the difference between an app that "reloads" on every hiccup and one that degrades gracefully.

---

## 9. Mutations, and why you refetch instead of trusting the response

```ts
export function useCreateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: ApiProductDraft) => createProduct(draft),
    // Any cached list is now out of date. Invalidating marks it stale and
    // refetches only the lists that are currently on screen.
    onSuccess: () => client.invalidateQueries({ queryKey: productKeys.lists() }),
  });
}
```

```text
=== E. A mutation invalidates the lists ===
   clicking "Add product"…
   POSTs: 1, GETs after it: 1
   body posted: {"name":"Query Lamp 3","priceMinor":149900,"category":"accessories","blurb":"Created through a mutation.","inStock":true}
   rows now: Mechanical, Wireless, Studio
   the new row came from the refetch, not from the POST response
```

### Line by line

- `useMutation({ mutationFn })` — mutations are **actions**, not cached data: no key, no staleness, one call at a time. It returns `mutate` (fire and forget) and `mutateAsync` (returns a promise you can `await`/`try`), plus `isPending`, `isError`, `error`, `data`, `reset`.
- `mutationFn: (draft) => createProduct(draft)` — the same "it must throw on failure" contract as `queryFn`. One argument, one variable.
- `onSuccess: () => client.invalidateQueries({ queryKey: productKeys.lists() })` — the write succeeded, so every cached **list** of products is now potentially wrong. Invalidating by the `lists()` prefix matches every list regardless of its filters, and refetches only those with a mounted observer.
- **The POST response is not used to update the list** — and that is deliberate. The response describes *one* product; the list is a *different* question (its order, its total count, its filters). Rebuilding the list from a single row means re-implementing the server's sorting, filtering and pagination in the client, badly. The refetch asks the server the same question again and gets the correct answer.
- The measured numbers prove the shape of the flow: **1 POST, then 1 GET**, and the new row appears as a result of the refetch.

⚠️ Invalidate **narrowly**. `invalidateQueries()` with no key invalidates the entire cache and refetches every mounted query — a heavy hammer that turns a small action into a dozen requests. Match a prefix (`productKeys.lists()`), or a specific detail (`productKeys.detail(id)`).

---

## 10. Optimistic updates, measured

An optimistic update writes the expected result into the cache *before* the request finishes, then reconciles:

```ts
export function useDeleteProduct() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),

    // 1. Run BEFORE the request: update the cache and snapshot it.
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: productKeys.lists() });
      const snapshots = client.getQueriesData<ProductPage>({ queryKey: productKeys.lists() });

      client.setQueriesData<ProductPage>({ queryKey: productKeys.lists() }, (page) =>
        page === undefined ? page : { items: page.items.filter((item) => item.id !== id), total: page.total - 1 },
      );

      return { snapshots };
    },

    // 2. If the request fails, put the snapshot back.
    onError: (_error, _id, context) => {
      for (const [key, page] of context?.snapshots ?? []) client.setQueryData(key, page);
    },

    // 3. Either way, ask the server again so the cache ends up truthful.
    onSettled: () => client.invalidateQueries({ queryKey: productKeys.lists() }),
  });
}
```

```text
=== F. An optimistic delete removes the row before the server answers ===
   a wide page shows every row: Mechanical, Wireless, Studio, Desk, Monitor, Keycap, Query
   the row to delete: 7p6D4Eb Query Lamp 3
   while the DELETE is still in flight: rows Mechanical, Wireless, Studio, Desk, Monitor, Keycap
   "Removing…" visible: true
   GETs so far: 0 (the cache changed, the server has not answered)
   after the DELETE resolved: rows Mechanical, Wireless, Studio, Desk, Monitor, Keycap
   GETs now: 2 → the onSettled invalidation refetched the list
   the server says 404 for 7p6D4Eb (404 = really gone)
```

### Line by line

- `mutationFn: (id) => deleteProduct(id)` — the second variable of `onMutate`/`onError` is the same `id`, so the handlers know which row was affected.
- `await client.cancelQueries({ queryKey: productKeys.lists() })` — **the step people forget.** If a list refetch is already in flight, it will land *after* your optimistic write and put the deleted row back, briefly resurrecting it. Cancelling first removes that race.
- `client.getQueriesData<ProductPage>({ queryKey: productKeys.lists() })` — a snapshot of *every* matching cache entry (there may be several: different pages, different filters). This is the rollback data.
- `setQueriesData(…, updater)` — the optimistic write, applied to every matching entry. The `page === undefined ? page : …` guard keeps the updater honest for empty entries.
- `return { snapshots }` — the return value of `onMutate` becomes the `context` argument of `onError`/`onSettled`. This is how data flows through the mutation's lifecycle without a `useRef`.
- `onError: (_error, _id, context) => … setQueryData(key, page)` — undo, entry by entry. Without this, a failed delete leaves the row missing from the UI while the server still has it — the most confusing bug in the genre.
- `onSettled: () => invalidateQueries(…)` — success *or* failure, ask again. The optimistic write is a guess; the refetch is the truth. Skipping `onSettled` is why apps drift: after a few optimistic writes, the cache and the database disagree and nobody can tell which rows are real.
- The measured proof that the row really left the server: **`the server says 404`** — a UI assertion alone would only prove the DOM changed.

⚠️ Optimistic updates are for actions whose outcome is **almost always** success and whose failure is recoverable (deletes, toggles, reorders). For a payment or an order placement, do not guess: show a pending state and wait.

---

## 11. Errors, retries and backoff — measured

```text
=== G. A failing list: retry, error state, then a successful retry by hand ===
   mid-flight: requests 1, isPending=true isFetching=true isStale=true placeholder=false rows=0
   after the retry: requests 2
   status: isPending=false isFetching=false isStale=true placeholder=false rows=0
   the error UI: Request failed with 500 Try again
   the retry is automatic — the user sees the error only after both attempts fail
   after "Try again": requests 1, error UI gone: true

=== H. A real 404 on a detail query does not retry for ever ===
   requests: 2 → /products/p-does-not-exist , /products/p-does-not-exist
   DOM: error: Request failed with 404Retry
```

What the two transcripts establish:

1. **A failed query retries automatically, with a delay.** The default is `retry: 3` and exponential backoff: the first retry waits about a second, then 2 s, then 4 s (capped at 30 s). The lab configures `retry: 1`, so the sequence above shows one automatic retry before the error surfaces.
2. **The user sees the error only after the attempts are exhausted** (`after the retry: requests 2`, then the error UI). That is the intended UX: a transient blip should not produce a red banner.
3. **A 404 also retries** (H) — retrying a "the record does not exist" error is pointless, but the *default* retry does not know that. This is the single most common reason to configure `retry` yourself.

```ts
// Retry everything except the errors that cannot improve
useQuery({
  queryKey: productKeys.detail(id),
  queryFn: ({ signal }) => getProduct(id, signal),
  retry: (failureCount, error) => {
    if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false; // 4xx: not retryable
    return failureCount < 2; // 5xx and network errors: two more attempts
  },
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
});
```

Other error-related facts worth knowing:

- **`retryOnMount: false` by default in v5** — a query that failed does not silently retry every time the component remounts (measured in H: exactly two requests across mounts, not a loop).
- **`refetchOnWindowFocus: true` by default** — coming back to the tab refetches stale queries. Delightful for dashboards, surprising for a form-heavy page; the lab turns it off globally.
- **Errors do not clear `data`.** A failed background refetch leaves the last good data in place, which is why the component can render "the old table plus an error banner".
- **Throw into an error boundary when appropriate:** `useQuery({ throwOnError: true })` (or a global `throwOnError` default) lets a route-level `ErrorBoundary` (Part 5) own the failure UI, instead of every component having an `isError` branch.
- **One `QueryCache` hook for global reactions** (logging, toasts, session expiry): `new QueryClient({ queryCache: new QueryCache({ onError: (error) => { if (error instanceof HttpError && error.status === 401) signOut(); } }) })`. That is the correct place for cross-cutting error policy — not every `useQuery` call.

---

## 12. Pagination and "the previous page stays"

```text
=== I. A new page: the previous rows stay while the next page loads ===
   page 1 (already in the cache): Mechanical, Wireless, Studio
   right after switching to page 2: isPending=false isFetching=true isStale=true placeholder=true rows=3
   rows still on screen: Mechanical, Wireless, Studio
   after it settled: isPending=false isFetching=false isStale=false placeholder=false rows=3
   rows: Desk, Monitor, Keycap
   requests for the page switch: 1
```

The mid-flight line is the whole feature: `isPending=false` (there is data to render), `isFetching=true` (a request is running), `placeholder=true` (these rows belong to the *previous* key), `rows=3` (the user sees a full table, not a skeleton), and one request for the switch.

```tsx
function ProductsPage() {
  const [params, setParams] = useSearchParams(); // ← page lives in the URL (file 01, section 10)
  const page = Number(params.get('page') ?? '1');

  const products = useProductsQuery({ page, pageSize: 3, category: params.get('category') ?? undefined });

  return (
    <>
      <ProductTable rows={products.data?.items ?? []} dimmed={products.isPlaceholderData} />
      <Pager
        page={page}
        total={products.data?.total ?? 0}
        pageSize={3}
        busy={products.isFetching && !products.isPlaceholderData}
        onPage={(next) => setParams((current) => ({ ...Object.fromEntries(current), page: String(next) }))}
      />
    </>
  );
}
```

Notes that make this robust:

- `placeholderData: keepPreviousData` is set **once**, on the hook (`useProductsQuery`), so every consumer gets the behaviour.
- `isPlaceholderData` is what you dim the table with — "these rows are not the requested page yet". Rendering it as if it were the new page is how users end up clicking a row that no longer exists.
- With `placeholderData`, `isPending` stays `false` during a page change, so a `if (isPending) return <Skeleton />` never flashes between pages. The skeleton appears only on the first load.
- The page lives in the URL, so a shared link opens the same page, and the cache keeps each visited page separately (keyed by `page`), making *back* instant.

### Infinite / "load more" lists

```ts
const feed = useInfiniteQuery({
  queryKey: productKeys.list({ pageSize: 3 }),
  queryFn: ({ pageParam, signal }) => listProducts({ page: pageParam, pageSize: 3 }, signal),
  initialPageParam: 1,
  getNextPageParam: (lastPage, pages) => (pages.length * 3 < lastPage.total ? pages.length + 1 : undefined),
});

// feed.data.pages.flatMap((page) => page.items)
// feed.fetchNextPage() / feed.hasNextPage / feed.isFetchingNextPage
```

`useInfiniteQuery` is the same cache with a **list of pages per key** and a `getNextPageParam` function telling it how to ask for more; `undefined` means "no more pages". Invalidation works exactly as in section 9 — one `invalidateQueries` on the list prefix refreshes the whole feed.

---

## 13. Dependent, parallel and prefetched queries

```ts
// Dependent: nothing runs until there is an id (no `enabled` ⇒ a fetch with `undefined`)
const product = useProductQuery(id);
const reviews = useQuery({
  queryKey: ['products', 'detail', id, 'reviews'],
  queryFn: ({ signal }) => getReviews(id, signal),
  enabled: product.isSuccess, // only once the product loaded
});

// Parallel: two independent queries, written as two hooks — React Query runs them
// concurrently; `useQueries` is for a dynamic list of them
const products = useProductsQuery({ page: 1 });
const orders = useOrdersQuery({ page: 1 });

// Prefetch on intent: hover, focus, or a route transition
function onRowHover(id: string) {
  void queryClient.prefetchQuery({ queryKey: productKeys.detail(id), queryFn: () => getProduct(id), staleTime: 30_000 });
}
```

- **Dependent queries** are the correct answer to "fetch B when A gives me an id". Never put two fetches in one `queryFn` just to sequence them, and never fetch with `undefined` and check afterwards.
- **`useQueries`** takes an array and returns an array of results: for a dynamic set (a dashboard of widgets, a list of order details). Each entry needs its own key.
- **`prefetchQuery`** warms a cache entry with no observer. Set a `staleTime` in the prefetch, or the entry is stale on arrival and refetches anyway — the classic "I prefetched and it still flickers" bug.
- **Route-level prefetching** (Part 6's data router, or a `loader`) can `await queryClient.ensureQueryData({ queryKey, queryFn })`: it resolves from cache when fresh, fetches otherwise, and guarantees the component's first render has data.

---

## 14. Housekeeping: writing, removing, inspecting

```ts
// Read the cache without a hook (a handler, a loader, a test)
const cached = queryClient.getQueryData<ProductPage>(productKeys.list({ page: 1 }));

// Write to it directly — this is what optimistic updates use
queryClient.setQueryData(productKeys.detail('p-lamp'), updatedProduct);

// Update a single entry after a successful PATCH (section 9's alternative)
queryClient.setQueryData(productKeys.detail(updated.id), updated);
void queryClient.invalidateQueries({ queryKey: productKeys.lists() });

// Drop an entry entirely (e.g. after logout, so no user data survives)
queryClient.removeQueries({ queryKey: productKeys.all });
queryClient.clear(); // everything

// Cancel in-flight requests and refetch everything that is mounted
await queryClient.cancelQueries();
await queryClient.invalidateQueries();

// Imperative fetch with the same caching behaviour
const page = await queryClient.fetchQuery({ queryKey: productKeys.list({ page: 1 }), queryFn: () => listProducts({ page: 1 }) });
```

| Situation | Call |
| --- | --- |
| A write changed one cached entity | `setQueryData(detailKey, updated)` |
| A write may have changed several lists | `invalidateQueries({ queryKey: lists() })` |
| Logging out | `removeQueries()` / `clear()` and `cancelQueries()` |
| A stale list must be refreshed on demand | `refetch()` from the hook, or `invalidateQueries` from anywhere |
| Refresh on reconnect/focus | default behaviour; tune with `refetchOnReconnect`/`refetchOnWindowFocus` |

**Persistence** (optional, for offline/instant-start apps): `@tanstack/query-persist-client` plus a storage adapter serialises the cache and restores it at boot. Two cautions — persisted caches must be **versioned/busted** (`buster: 'v2'`) so a shape change does not hydrate garbage, and they must be **filtered** (`dehydrateOptions.shouldDehydrateQuery`) so private data does not sit in `localStorage`. A stale `staleTime` on hydration is normal: the persisted data renders instantly and refetches in the background.

**Devtools** (`@tanstack/react-query-devtools`, rendered in `ReactQueryDevtools`) show every cache entry, its key, freshness, observers, fetch log and state — the single most useful debugging tool for this library, and the reason "why is it not refetching?" becomes a five-second question rather than an afternoon.

---

## 15. Choosing the defaults

Start with the library's defaults and change them deliberately:

| Kind of data | `staleTime` | Reasoning |
| --- | --- | --- |
| A user's profile, permissions | 5 min | changes rarely; refetching on every navigation is waste |
| A product catalogue, categories, currencies | 5–30 min | reference data, changes on deploys |
| A dashboard's metrics | 10–30 s | fresh enough to be useful, cheap to refresh |
| A chat message list | 0 | any staleness is visible and wrong |
| A search result | 0–30 s | correctness matters more than traffic |
| A form's reference data (country list) | `Infinity` | it cannot change during a session |

| Global default | Set it when |
| --- | --- |
| `staleTime: 30_000` | your app is navigation-heavy and most data tolerates 30 s |
| `gcTime: 5 * 60_000` (default) | almost always; raise it for expensive-to-refetch data |
| `retry: 1`–`3`, or a function that skips 4xx | always, via a `retry` function |
| `refetchOnWindowFocus: false` | dashboards and form-heavy pages; keep `true` for live-ish data |
| `throwOnError: true` | apps with route-level error boundaries and a consistent error UI |

💡 **The rule that keeps this sane**: set a sensible global default, and override per hook where the data's nature differs (live vs reference vs user data). Do not hand-tune each call site — that is how a codebase ends up with six different staleness policies and no way to reason about the cache.

---

## 16. When *not* to use a query library

Rare, but real:

- **A single one-shot request** on a page that never re-renders and shows a spinner then the data, with no cache, no refetch and no second consumer. `fetch` in an effect (Part 7, file 09) is 15 lines and no dependency.
- **Data that is pushed, not pulled** — a WebSocket or SSE feed. A query cache is request/response shaped; for streams, put the latest message in a store (file 05) and keep the socket outside React. (You *can* seed TanStack Query from a socket with `setQueryData`, and some teams do.)
- **Data that must be exactly consistent with the DOM**, e.g. a canvas/Gantt editor. That is client state with a server *sync*, and a store plus explicit commands fits better.
- **A static site with no client data fetching at all** — nothing to cache.

The reverse question — "TanStack Query or RTK Query?" — is file 04, section 12: if the app already has a Redux store, RTK Query keeps one state container and one devtools panel; otherwise this library is smaller (measured ≈ 12.5 kB gzip versus ≈ 19.7 kB for RTK + react-redux) and does the same job without a store.

---

## 17. TanStack Query vs the alternatives

| | TanStack Query (v5) | RTK Query | SWR | Hand-written (Part 7) |
| --- | --- | --- | --- | --- |
| Cache location | own `QueryClient` | a Redux slice | own cache | your components/stores |
| Invalidation | keys (prefix matching) | tags | keys (mutate) | manual |
| Deduplication | yes | yes | yes | write it yourself |
| Pagination helpers | `keepPreviousData`, `useInfiniteQuery` | `serializeQueryArgs` + `merge` | `useSWRInfinite` | write it yourself |
| Optimistic updates | `onMutate` + snapshot/rollback | `onQueryStarted` + `updateQueryData` | `mutate` with optimism | write it yourself |
| Retries/backoff | yes, configurable | yes (via `fetchBaseQuery`) | yes | write it yourself |
| Requires Redux | no | yes | no | no |
| Bundle (measured, minified, React external) | ≈ 12.5 kB gzip | inside ≈ 19.7 kB | smaller still | 0, plus your own bugs |
| Best for | most apps' server state | Redux apps, one devtools panel | small apps, simple fetching, Next.js | one-off requests only |

There is no universal winner; the deciding question is usually "do we already have Redux?" and then "how much of the table above do we want to own?"

---

## 18. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Copying fetched data into `useState`/a store | two copies, one of which goes stale; the "why does my list not update" bug | read `data` from the hook; derive from it |
| 2 | `useEffect(() => { fetch…; setState… }, [])` next to a `useQuery` | double fetching and races | one source: the query |
| 3 | Using `isLoading` as "isFetching" | the table is replaced by a spinner on every background refetch | `isPending` for the skeleton, `isFetching` for a subtle hint |
| 4 | A key missing a parameter (filters, id, page) | two different results share one cache entry — wrong data on screen | every parameter in the key, built by the factory |
| 5 | A key containing something unused (or a `Date` object) | duplicate entries that never dedupe | keys of plain, relevant values |
| 6 | No `invalidateQueries` after a write | the list never shows the new row | invalidate the narrowest matching prefix in `onSuccess`/`onSettled` |
| 7 | Trusting the POST response to rebuild a list | wrong order/counts/filters; the client re-implements the server | refetch the list |
| 8 | Optimistic update without `cancelQueries` | an in-flight refetch resurrects the deleted row | cancel first, snapshot, then write |
| 9 | Optimistic update without `onError` rollback | the UI shows a change the server rejected | snapshot in `onMutate`, restore in `onError` |
| 10 | Optimistic update without `onSettled` invalidation | cache and database drift over time | always reconcile at the end |
| 11 | Retrying 4xx errors (the default) | pointless requests; log noise | a `retry` function that skips 4xx |
| 12 | `staleTime: Infinity` everywhere | data never refreshes; users see yesterday's numbers | tune per kind of data (section 15) |
| 13 | Forgetting `throwOnError`/error UI, so a failure renders as an empty list | "there are no products" when the request failed | render `isError` distinctly from "no results" |
| 14 | One `QueryClient` per component | no sharing, no deduplication, a memory leak per mount | one client per app (one per request in SSR) |

---

## 19. Best practices

1. **Wrap every server read in `useQuery`**, every write in `useMutation`. No raw `fetch` in components — keep the API layer (Part 7, file 11) as the transport, and let the hooks own the caching.
2. **Build keys with a factory** and include every parameter the request uses.
3. **Set a `staleTime` per kind of data**, not a global `Infinity`.
4. **Render four states**: `isPending` (skeleton), `isError` (banner + retry), empty (a real result), and data (with `isFetching` as a hint). Empty and error are different screens.
5. **Never blank the screen on a background refetch**; keep the data and show a subtle indicator.
6. **Invalidate narrowly after every write**, and let the server describe the resulting list.
7. **Do the three-step optimistic dance** — `cancelQueries` → snapshot + write → `onError` rollback → `onSettled` invalidate — or do not do it at all.
8. **Configure `retry` to skip 4xx** and stop after two or three attempts.
9. **Keep the cache out of your stores**: server data in the query cache, session data in the store (file 05, section 10).
10. **Use the devtools** when a refetch surprises you; the panel shows exactly which key has observers and whether it is stale.
11. **Prefetch on intent** (hover, route transition, next page) with a matching `staleTime`.
12. **Put cross-cutting error policy in one place** (`QueryCache.onError`, a 401 handler), not in every component.

---

## 20. Practice

### Beginner

1. Write `useOrdersQuery({ page }: { page: number })` against `/api/orders?_page=…&_limit=5`, with a key factory, `staleTime: 10_000`, and a component that renders the four states (pending, error, empty, data).
2. Given this hook, list every bug:

   ```ts
   export function useProduct(id: string) {
     const [product, setProduct] = useState<ApiProduct | null>(null);
     const query = useQuery({ queryKey: ['product'], queryFn: () => getProduct(id) });
     useEffect(() => {
       if (query.data) setProduct(query.data);
     }, [query.data]);
     return product;
   }
   ```
3. Explain in one sentence each: (a) what `queryKey` does, (b) why `queryFn` must throw, (c) the difference between `staleTime` and `gcTime`.

### Intermediate

1. Add `useUpdateProduct()` with a **pessimistic** update (no optimistic cache write): PATCH, then update the detail cache from the response and invalidate the lists. Then add the optimistic version for the `inStock` toggle only, and explain why the toggle is a better candidate than a price change.
2. Implement infinite scroll for the product list with `useInfiniteQuery`: 3 per page, a "Load more" button, `hasNextPage`, and an `isFetchingNextPage` indicator. Then invalidate the whole feed after a delete and confirm (in the devtools) that every page is refetched.
3. Design the query-key layout for a shop admin with: product lists (filters + page), product detail, orders (status filter + page), order detail with line items, and a dashboard summary. Write the factory, and say exactly which `invalidateQueries` call each mutation needs — and why invalidating `['products']` is wrong when only one product's price changed.

### Challenge

1. Build a **polling + focus-aware** dashboard: metrics every 15 s while the tab is visible, paused when hidden, an immediate refetch when it becomes visible again, and no polling when the data is still fresh. Explain which options (`refetchInterval`, `refetchIntervalInBackground`, `refetchOnWindowFocus`, `staleTime`) you used and how you would test the behaviour without waiting 15 seconds.
2. Implement **offline-tolerant writes**: queue mutations made while offline, replay them in order on reconnect, and show each row's state (`queued`/`sending`/`failed`). Decide where the queue lives (a store? the mutation cache?) and what happens when a queued write conflicts with a server change (this is a product decision — argue it).
3. Take the Part 7 CRUD app (hand-written loading/error/caching with `useEffect` + `AbortController`) and migrate one screen to TanStack Query. Then write a table of what you deleted: lines of code, `useState`s, effects, race-condition guards — and one behaviour you *gained* that the hand-written version never had.

---

## 21. Solutions

### Beginner

1. ```ts
   export const orderKeys = {
     all: ['orders'] as const,
     lists: () => [...orderKeys.all, 'list'] as const,
     list: (page: number) => [...orderKeys.lists(), { page }] as const,
     detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
   };

   export function useOrdersQuery(page: number) {
     return useQuery({
       queryKey: orderKeys.list(page),
       queryFn: ({ signal }) => getJson<Order[]>(`orders?_page=${page}&_limit=5`, { signal }),
       staleTime: 10_000,
       placeholderData: keepPreviousData,
     });
   }
   ```
   The component: `isPending` → skeleton; `isError` → banner + `refetch`; `data.length === 0` → "No orders yet" (a real, successful result); otherwise the table, with `isFetching` shown as a small "updating…" hint.
2. Four bugs. (a) `queryKey: ['product']` has no id, so every product shares one cache entry — the first product you open is shown for all of them. (b) Copying `query.data` into `useState` recreates the stale-copy problem and adds a render; use `query.data` directly. (c) The `useEffect` is redundant work that runs on every data change. (d) Nothing handles the error or loading states that the hook already provides. The corrected version is four lines: `useQuery({ queryKey: productKeys.detail(id), queryFn: ({ signal }) => getProduct(id, signal), enabled: id !== '' })`.
3. (a) `queryKey` is the cache address *and* the dependency list: a different key means different data, and the key is what invalidation matches. (b) The library treats a thrown error as failure — a `queryFn` that swallows errors and returns `{ error }` reports success with garbage. (c) `staleTime` is how long data is considered fresh (no refetch on mount/focus); `gcTime` is how long an unobserved entry stays in memory before being deleted.

### Intermediate

1. ```ts
   export function useUpdateProduct() {
     const client = useQueryClient();
     return useMutation({
       mutationFn: ({ id, changes }: { id: string; changes: Partial<ApiProductDraft> }) => updateProduct(id, changes),
       onSuccess: (updated) => {
         client.setQueryData(productKeys.detail(updated.id), updated); // the detail is exact
         void client.invalidateQueries({ queryKey: productKeys.lists() }); // lists may reorder/filter
       },
     });
   }
   ```
   The optimistic toggle adds `onMutate` (cancel lists, snapshot, flip `inStock` in every cached list *and* in the detail entry), `onError` (restore), `onSettled` (invalidate). A toggle is a good candidate because the server's answer is binary and the failure is harmless; a **price change is not** — money is involved, the value is typed by a human, and server-side rules (tax, currency, rounding, permissions) can reject or alter it, so guessing the outcome on screen is a mistake.
2. ```ts
   const feed = useInfiniteQuery({
     queryKey: productKeys.list({ pageSize: 3 }),
     queryFn: ({ pageParam, signal }) => listProducts({ page: pageParam, pageSize: 3 }, signal),
     initialPageParam: 1,
     getNextPageParam: (last, pages) => (pages.length * 3 < last.total ? pages.length + 1 : undefined),
   });
   ```
   The button calls `feed.fetchNextPage()` and is disabled while `feed.isFetchingNextPage`; `feed.hasNextPage` hides it at the end. After a delete, `invalidateQueries({ queryKey: productKeys.lists() })` refetches every page entry (one cache entry per *feed*, with `pages` inside it), so the rows re-flow and the "load more" boundary stays honest. In the devtools you can watch the single entry's `pages` array change length.
3. ```ts
   export const keys = {
     products: {
       all: ['products'] as const,
       lists: () => [...keys.products.all, 'list'] as const,
       list: (filters: ProductQuery) => [...keys.products.lists(), filters] as const,
       detail: (id: string) => [...keys.products.all, 'detail', id] as const,
     },
     orders: {
       all: ['orders'] as const,
       lists: () => [...keys.orders.all, 'list'] as const,
       list: (filters: OrderQuery) => [...keys.orders.lists(), filters] as const,
       detail: (id: string) => [...keys.orders.all, 'detail', id] as const,
     },
     dashboard: () => ['dashboard'] as const,
   };
   ```
   Mutations: `createProduct` → invalidate `keys.products.lists()`; `updateProduct(id)` → `setQueryData(keys.products.detail(id), updated)` **and** invalidate `keys.products.lists()` (the row may move under sorting or no longer match a filter); `deleteProduct(id)` → invalidate lists and `removeQueries({ queryKey: keys.products.detail(id) })`; order mutations → invalidate `keys.orders.lists()` and the specific detail; anything that changes stock affects both `products` and `dashboard`. Invalidating `['products']` when only one price changed refetches **every** product list (each with its own filters and page) *and* every detail — a handful of requests where one cache write plus one list refetch was enough. Invalidate the narrowest prefix that can actually be wrong.

### Challenge

1. ```ts
   const metrics = useQuery({
     queryKey: ['dashboard', 'metrics'],
     queryFn: ({ signal }) => getMetrics(signal),
     staleTime: 15_000,
     refetchInterval: 15_000,
     refetchIntervalInBackground: false, // pause while the tab is hidden (the default)
     refetchOnWindowFocus: true, // refetch on return, but only if stale
   });
   ```
   `refetchInterval` fires only while the query has an observer, `refetchIntervalInBackground: false` pauses it in a hidden tab, and the focus refetch is gated by `staleTime`, so returning after 5 seconds does not double-fetch. To test without waiting: mock timers (`vi.useFakeTimers()` + `advanceTimersByTime`), or point the query at a counter and assert how many requests happened after driving the focus/visibility events by hand — measuring requests, never "does it feel live".
2. Put the queue in a small store (file 05) keyed by a client-generated id, with `{ status: 'queued' | 'sending' | 'failed', payload, attempts }`; register `online`/`offline` listeners (and `navigator.onLine`) to drain it in order, dispatching one mutation at a time so ordering is preserved. The conflict question is a product decision with two honest answers: **last-write-wins** (simple, silently loses someone else's edit) or **detect and ask** (send the version/`If-Match` you started from — Part 7's ETag chapter — and on `412` show the user both versions). A third, common middle ground is to make queued writes *append-only* (add a note, increment a counter) so they cannot conflict meaningfully — merging strategies are much easier than overwrite strategies.
3. Deleted: the `useEffect` that fetched, the three `useState`s (`data`, `loading`, `error`), the `AbortController` ref and its cleanup, the `ignore` flag for stale responses, the manual retry, and the "fetch again after delete" call. Line count typically drops by 40–60 per screen. Gained: deduplication when two components ask at once, a cache that survives navigation, automatic refetch on focus, retry with backoff, and — the one that is genuinely hard to hand-write — *invalidation as a one-liner* followed by a correct refetch of exactly the affected lists.

---

## 22. Summary

- **Server state is a cache, not a store.** It can change without you, it is shared, and it needs staleness, deduplication, retry, invalidation and garbage collection — which is why a client-state tool cannot own it well.
- **Two components, one request; a remount inside `staleTime` fetches nothing** and paints from cache with no spinner (measured: 1 request for two panels, 0 requests for a remount, `rows=3` before any await).
- **`queryKey` is the cache address and the dependency list.** Keys are arrays, built by a factory, with every request parameter — and `invalidateQueries` matches on their prefixes.
- **`staleTime` is how long you will show data without checking; `gcTime` is how long it stays in memory after nobody is watching.** Stale data is still shown instantly while the refetch runs.
- **`isPending` means "no data yet"; `isFetching` means "a request is running".** Measured: a background refresh (`isFetching=true`) left the rows on screen, which is the correct behaviour and the one most hand-written apps get wrong.
- **Mutations invalidate rather than rebuild.** Measured: one POST, one GET, and the list came from the server's answer to the list question.
- **Optimistic updates are a three-step dance**: cancel in-flight queries, snapshot and write, roll back on error, reconcile on settle. Measured: the row was gone from the DOM while the DELETE was in flight (0 GETs), the cache was reconciled afterwards (2 GETs), and the server confirmed `404`.
- **Retries are automatic with exponential backoff, and they retry 4xx too** (measured: 2 requests for one failing read). Configure `retry` to skip 4xx; the user sees the error only after the attempts are exhausted.
- **`placeholderData: keepPreviousData`** keeps the previous page on screen (`placeholder=true`) while the next loads — measured, with one request for the page switch.
- **A `QueryClient` is created once**, used by hooks, loaders and tests, and kept out of your stores; the store owns the session, the cache owns the server.
- The rule to carry forward: **client session state in a store, server data in a cache, shareable state in the URL, and everything else derived.**

---

**What's next →** **Part 10 — Advanced React** ([`../10-advanced-react/`](../10-advanced-react/)) goes below the API surface you have been using: the render and commit phases, what actually causes a re-render (and why a re-render is not a DOM update), `React.memo`/`useMemo`/`useCallback` used correctly instead of reflexively, profiling a slow list, virtualisation, images, `lazy` + `Suspense`, and code splitting — with the same rule as this part: measure before you optimise, and know which of the numbers you just changed.
