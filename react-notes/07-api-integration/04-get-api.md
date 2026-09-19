# 04 — GET APIs: Lists, Details, Filters, Pagination, and the Four States

> **Part 7 · API Integration · File 4 of 11**
> Why this file exists: this is the first file where a React screen actually loads data from a server, and it is where the whole of Part 7 becomes concrete. You will build a product gallery whose query, category, sort and page live in the **URL** (Part 6), whose data comes from a typed API module (files 02–03), and whose rendering is driven by a four-state machine where "loading with no data" and "ready with an error" are *impossible*. Every DOM line quoted below was captured from the running code in jsdom against the real API on `:3001`.

---

## 1. What a "GET API" screen is

Two shapes cover almost everything:

| Shape | URL | Returns | UI |
| --- | --- | --- | --- |
| **Collection** | `GET /api/products?q=mouse&_page=1&_limit=3` | an **array** of records + a total count | a list, with filters, sorting, pagination, empty state |
| **Item** | `GET /api/products/p-mouse` | **one** record | a detail screen, with a not-found state |

The two differ in exactly one branch: an empty array is a *valid* answer ("no matches"), while a missing item is a `404` that needs its own screen. Everything else — loading, errors, cancellation, retrying — is the same.

Verified, from file 01's transcript:

```text
GET /products?_limit=2&_sort=priceMinor&_order=asc → 200
   ids: p-keycap-set, p-mouse
GET /products/p-headphones → 200 · inStock=false
GET /products/nope → 404 · body={}
```

---

## 2. The four states, as a type instead of a hope

A data screen has four states, and beginners write components that render a mixture of them (a spinner *and* stale rows, or a crash because `products` was still `undefined`). The fix is to make the state a **discriminated union** (Part 2, file 06) so that the impossible combinations cannot be written down:

```ts
type State =
  | { status: 'loading' }
  | { status: 'ready'; items: ApiProduct[]; total: number }
  | { status: 'error'; message: string; httpStatus?: number };
```

```tsx
if (state.status === 'loading') return <p>Loading products…</p>;
if (state.status === 'error') return <p role="alert">{state.message}</p>;
if (state.items.length === 0) return <p>No products match “{q}”.</p>;
return <ul>{state.items.map(…)}</ul>;
```

| State | When | What the user needs |
| --- | --- | --- |
| `loading` | no data yet for this query | a spinner or skeleton (file 09), and no stale content pretending to be current |
| `ready` with rows | success | the rows |
| `ready` with `[]` | success, nothing matched | "no results" **and a way out** (clear the filters) |
| `error` | `!response.ok` or transport failure | what happened, a retry, and no dead end |

Note what is *not* in the union: `loading` cannot carry data, so you can never render the old list while claiming to load. If you want "keep showing the old rows while the new ones load" (a nice pattern, used by file 09's `isRefreshing`), model it explicitly as a fourth case: `{ status: 'refreshing'; items: ApiProduct[] }`.

---

## 3. The API layer: `src/api/http.ts` and `src/api/products.ts`

Files 02 and 03 built the transport seam. Here is the complete module the rest of Part 7 uses — two files, no React inside either one.

```text
shop-admin/src/api/
├── http.ts       ← transport: fetch, status checks, one error type
├── types.ts      ← the wire shapes (ApiProduct, ApiUser)
└── products.ts   ← endpoint functions: listProducts, createProduct, updateProduct…
```

```ts
// File: src/api/http.ts
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const BASE = '/api';

function url(path: string) {
  return `${BASE}/${path.replace(/^\//, '')}`;
}

async function readJson(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return { parsed: null as unknown, raw: text.slice(0, 200) };
  }
  return { parsed: (await response.json()) as unknown, raw: '' };
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url(path), { ...init, headers: { Accept: 'application/json', ...init?.headers } });

  if (!response.ok) {
    const { parsed, raw } = await readJson(response).catch(() => ({ parsed: null, raw: '' }));
    throw new HttpError(response.status, `Request failed with ${response.status}`, parsed ?? raw);
  }

  return (await response.json()) as T;
}

export async function sendJson<T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', payload?: unknown): Promise<T> {
  const response = await fetch(url(path), {
    method,
    headers: payload === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  if (!response.ok) {
    const { parsed, raw } = await readJson(response).catch(() => ({ parsed: null, raw: '' }));
    throw new HttpError(response.status, `Request failed with ${response.status}`, parsed ?? raw);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
```

Line by line:

| Line | Why it exists |
| --- | --- |
| `class HttpError extends Error` with `status` and `body` | one error type for "the server said no", carrying everything the UI needs to decide what to show |
| `const BASE = '/api'` | relative URLs + the Vite proxy (file 01, section 7) — no environment leaks into components |
| `url(path)` normalising slashes | `getJson('products')` and `getJson('/products')` must both work |
| `readJson` checking `Content-Type` | file 01, section 9: an error body may be HTML; parsing it as JSON would hide the status |
| `if (!response.ok) throw new HttpError(...)` | file 02, section 4: the check `fetch` does not do for you |
| `status === 204 ? undefined : parse` | `204 No Content` has no body to parse |
| `async function` + `await` (no `.then`) | one linear flow through the function, which is why the error handling reads top to bottom |

```ts
// File: src/api/types.ts — the wire shapes, matching server/db.json
export interface ApiProduct {
  id: string;
  name: string;
  priceMinor: number;
  category: 'audio' | 'keyboards' | 'accessories';
  blurb: string | null;
  inStock: boolean;
}

export type ApiProductDraft = Pick<ApiProduct, 'name' | 'priceMinor' | 'category' | 'blurb' | 'inStock'>;
```

```ts
// File: src/api/products.ts — the endpoint functions
import { HttpError, getJson, sendJson } from './http';
import type { ApiProduct, ApiProductDraft } from './types';

export type { ApiProduct };
export type SortKey = 'name' | 'priceMinor';

export interface ProductQuery {
  q?: string;
  category?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: ApiProduct[];
  total: number;
}

/** Reads a page of products plus the total row count from the X-Total-Count header. */
export async function listProducts(query: ProductQuery, signal?: AbortSignal): Promise<ProductPage> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.sort) {
    params.set('_sort', query.sort);
    params.set('_order', query.sort === 'priceMinor' ? 'desc' : 'asc');
  }
  if (query.page) {
    params.set('_page', String(query.page));
    params.set('_limit', String(query.pageSize ?? 3));
  }

  const response = await fetch(`/api/products?${params.toString()}`, { signal, headers: { Accept: 'application/json' } });

  if (!response.ok) {
    throw new HttpError(response.status, `Request failed with ${response.status}`, null);
  }

  const items = (await response.json()) as ApiProduct[];
  const total = Number(response.headers.get('x-total-count') ?? items.length);
  return { items, total };
}

export function getProduct(id: string, signal?: AbortSignal): Promise<ApiProduct> {
  return getJson<ApiProduct>(`products/${id}`, { signal });
}

export function createProduct(draft: ApiProductDraft): Promise<ApiProduct> {
  return sendJson<ApiProduct>('products', 'POST', draft);
}

export function replaceProduct(id: string, product: ApiProductDraft): Promise<ApiProduct> {
  return sendJson<ApiProduct>(`products/${id}`, 'PUT', product);
}

export function updateProduct(id: string, changes: Partial<ApiProductDraft>): Promise<ApiProduct> {
  return sendJson<ApiProduct>(`products/${id}`, 'PATCH', changes);
}

export function deleteProduct(id: string, delayMs = 0): Promise<void> {
  return sendJson<void>(`products/${id}${delayMs ? `?delay=${delayMs}` : ''}`, 'DELETE');
}
```

Four decisions worth noticing, because they are what makes the rest of the part short:

1. **`listProducts` returns a page object, not an array.** The total comes from the `X-Total-Count` header (file 01, section 6), and a function that returns `{ items, total }` cannot be misused by a caller who forgot the header existed.
2. **Query building lives here**, not in components. Components pass `{ q, category, sort, page }`; the module knows the server's `_sort`/`_order`/`_limit` dialect. When the backend renames a parameter, one file changes.
3. **`signal` is an optional parameter on the read functions** — a signal is part of *reading* (the caller may walk away), not of the data model.
4. **`getJson`/`sendJson` are generic over the body type**, so each function documents the exact shape it returns.

⚠️ **`as ApiProduct[]` is a promise, not a proof.** TypeScript believes you; the server never signed anything. That assertion is exactly what file 11 replaces with runtime validation. Until then, keep the wire types in `types.ts` close to `db.json` and treat a shape mismatch as a bug you will catch in review.

---

## 4. The gallery component, line by line

```tsx
// File: src/part7/ProductsGallery.tsx (excerpt)
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { HttpError } from '../api/http';
import { listProducts } from '../api/products';
import type { ApiProduct, SortKey } from '../api/products';
import { formatMoney } from '../data/products';

const PAGE_SIZE = 3;

export function ProductsGallery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const sort = (searchParams.get('sort') ?? 'name') as SortKey;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));

  const [draft, setDraft] = useState(q);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => setDraft(q), [q]);                       // keep the input in sync with the URL

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    void (async () => {
      try {
        const { items, total } = await listProducts({ q, category, sort, page, pageSize: PAGE_SIZE }, controller.signal);
        setState({ status: 'ready', items, total });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          httpStatus: error instanceof HttpError ? error.status : undefined,
        });
      }
    })();

    return () => controller.abort();
  }, [q, category, sort, page, reloadToken]);
  // …rendering below
}
```

| Line | What it does, and why it is there |
| --- | --- |
| `useSearchParams()` | the **URL is the state** for query, category, sort and page (Part 6, file 05). Refresh, share, and the Back button all work for free |
| `?? ''` and `?? 'name'` | every param is optional in a URL; defaults live here |
| `Math.max(1, Number(…))` | `?page=0` or `?page=abc` must not break the request |
| `const [draft, setDraft] = useState(q)` | the input is **controlled locally** so typing feels instant, while the URL updates on the same event |
| `useEffect(() => setDraft(q), [q])` | if the URL changes from elsewhere (Back button), the input follows |
| `setState({ status: 'loading' })` *before* the request | the first thing the user sees is honest |
| `void (async () => { … })()` | `useEffect` may not be `async`; this launches the async work and discards the promise explicitly |
| `if (controller.signal.aborted) return;` | the effect for `q=k` is cancelled when `q=ke` starts; its failure must not become an error message |
| `error instanceof HttpError ? error.status` | keeps the HTTP status available for the 404 branch without leaking `HttpError` into the UI code |
| `[q, category, sort, page, reloadToken]` | the request is a function of exactly these values; `reloadToken` is the "try again" lever |
| `return () => controller.abort()` | cancellation on unmount and before every re-run — the race condition from file 02 is structurally impossible |

### The rendering section

```tsx
  function updateParam(changes: Record<string, string | null>, options?: { keepPage?: boolean }) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!options?.keepPage) next.delete('page');            // a new filter means page 1
    void setSearchParams(next, { replace: true });          // typing should not fill the history stack
  }
```

```tsx
  const pageCount = state.status === 'ready' ? Math.max(1, Math.ceil(state.total / PAGE_SIZE)) : 1;

  return (
    <section>
      <h1>Products</h1>

      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label>
          Search
          <input
            type="search"
            value={draft}
            placeholder="name contains…"
            onChange={(event) => {
              setDraft(event.target.value);
              updateParam({ q: event.target.value });
            }}
          />
        </label>
        {/* category + sort selects call updateParam({ category: … }) / updateParam({ sort: … }) */}
      </form>

      {state.status === 'loading' && <p className="status">Loading products…</p>}
      {state.status === 'error' && (
        <p className="status" role="alert">
          {state.httpStatus === 404 ? `We could not find that page (${state.message}).` : `Could not load products: ${state.message}`}{' '}
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>Try again</button>
        </p>
      )}
      {state.status === 'ready' && state.items.length === 0 && <p className="status">No products match “{q}”.</p>}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="list">
          {state.items.map((product) => (
            <li key={product.id}>
              <strong>{product.name}</strong> · {formatMoney(product.priceMinor)} · {product.category}
              {!product.inStock && ' · out of stock'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
```

Details that matter in that JSX:

- **`onSubmit={…preventDefault()}`** on the form, because a search input inside a `<form>` will otherwise navigate and reload the whole SPA (file 01's HTML basics meet the SPA from Part 6).
- **`role="alert"`** on the error, so screen readers announce it (Part 6, file 08's accessibility thread).
- **`key={product.id}`**, never the array index (Part 5, file 05).
- **`{!product.inStock && ' · out of stock'}`** — verified in the transcript below, where Studio Headphones renders with that suffix.
- **One button, two behaviours**: every filter passes through `updateParam`, so "reset the page number" is written once instead of remembered 3 times.

---

## 5. Why the URL is the source of truth

The gallery's inputs are `q`, `category`, `sort`, `page` — all four are in the URL, so:

| Feature | Comes for free because the URL is the state | What you would have to write if the state were in `useState` |
| --- | --- | --- |
| Share the current view | copy the address bar | a "share" feature |
| Refresh | renders the same view | state resets to defaults |
| Back / Forward | works | you would need your own history |
| Bookmarks | work | — |
| The fetch effect's dependencies | the params themselves | you would sync two stores |

That is why `updateParam` takes the whole `URLSearchParams` (Part 6, file 05: `setSearchParams` **replaces** the entire query string, so you must copy first and change one thing), and why the page number is deleted whenever a *filter* changes — `q=key&page=2` on a one-page result set is a guaranteed empty screen.

⚠️ `{ replace: true }` while typing is deliberate: without it, every keystroke pushes a history entry and the browser's Back button walks backwards through your search term, one letter at a time.

---

## 6. Proof: the gallery running against the real API

The following is the DOM from `ProductsGallery` rendered in jsdom with the API on `:3001` (the app's relative `/api/...` calls were rewritten to the mock server; in the browser the Vite proxy does that job). Full transcript: `/tmp/part7-gallery.txt`.

```text
=== first paint (before any response) ===
   dom: ProductsSearchCategoryAllAudioKeyboardsAccessoriesSortNamePrice (high → low)Loading produc

=== after the request resolves ===
   url   : /products
   rows  : Desk Speaker · ₹12,990 · audio | Keycap Set · ₹1,799 · keyboards | Mechanical Keyboard · ₹4,999 · keyboards
   pager : PreviousPage 1 of 2 · 6 totalNext

=== clicking "Next" (page 2 of 2) ===
   url   : /products?page=2
   rows  : Monitor Arm · ₹3,499 · accessories | Studio Headphones · ₹8,999 · audio · out of stock | Wireless Mouse · ₹2,499 · accessories
   pager : PreviousPage 2 of 2 · 6 totalNext
```

Read that second line carefully: **six records exist, three are shown, and the pager knows the total** — the `X-Total-Count: 6` header from file 01 is what makes "Page 1 of 2 · 6 total" possible. And `Studio Headphones` renders with `· out of stock` because the API said `inStock: false`, not because the component guessed.

```text
=== typing "key" in the search box (one URL update per keystroke) ===
   url   : /products?q=key
   rows  : Keycap Set · ₹1,799 · keyboards | Mechanical Keyboard · ₹4,999 · keyboards
   pager : PreviousPage 1 of 1 · 2 totalNext

=== choosing the "audio" category ===
   url   : /products?q=key&category=audio
   rows  : (none)
   status: No products match “key”.
   pager : PreviousPage 1 of 1 · 0 totalNext
```

The search is server-side (`q=key` matched `Keycap Set` and `Mechanical Keyboard` and nothing else), the category was **added** to the existing query rather than replacing it, and the total fell to 0 — a `ready` state with an empty array, which is why the empty branch exists separately from the error branch.

**Polish worth noticing:** the empty message says *“No products match “key””* while the category filter is also active. A better message names the filters or offers to clear them: *"No products match your filters. Clear search and category."* Empty states are a UX surface, not a fallback.

```text
=== a 500 from the server, then "Try again" ===
   the failing request
     status: Could not load products: Request failed with 500 Try again
     pager : (not rendered)
   after "Try again"
     status: No products match “key”.
```

The `?fail=500` middleware produced a JSON error body, `sendJson`/`getJson` turned the non-`ok` response into an `HttpError`, the component rendered an alert with a retry control, and clicking **Try again** bumped `reloadToken`, which re-ran the effect with the *same* URL. That is the entire retry story for a read: a counter in the dependency array.

### Running it yourself

```text
# terminal 1 — the API
cd shop-admin && npm run api

# terminal 2 — the app
cd shop-admin && npm run dev
```

```text
  VITE v8.3.0  ready in 231 ms

  ➜  Local:   http://localhost:5174/
  ➜  Network: http://10.0.0.5:5174/
```

Open `http://localhost:5174/products`, then: type `key` (two rows, URL becomes `?q=key`), press **Next** (page 2), hit the browser's **Back** button (the previous query returns — the URL was the state), and reload the tab (the same view comes back).

---

## 7. The item screen: one record and a real 404

```tsx
// File: src/part7/ProductDetailPage.tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { HttpError } from '../api/http';
import { getProduct } from '../api/products';
import type { ApiProduct } from '../api/products';
import { formatMoney } from '../data/products';

type State =
  | { status: 'loading' }
  | { status: 'ready'; product: ApiProduct }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

export function ProductDetailPage() {
  const { productId = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    void (async () => {
      try {
        setState({ status: 'ready', product: await getProduct(productId, controller.signal) });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof HttpError && error.status === 404) {
          setState({ status: 'notFound' });
          return;
        }
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }
    })();

    return () => controller.abort();
  }, [productId]);

  if (state.status === 'loading') return <p>Loading product…</p>;
  if (state.status === 'notFound') {
    return (
      <section>
        <h1>Product not found</h1>
        <p>No product has the id “{productId}”. It may have been deleted.</p>
        <Link to="/products">Back to all products</Link>
      </section>
    );
  }
  if (state.status === 'error') return <p role="alert">Could not load the product: {state.message}</p>;

  const { product } = state;
  return (
    <article>
      <h1>{product.name}</h1>
      <p>{formatMoney(product.priceMinor)}</p>
      <p>{product.blurb ?? 'No description yet.'}</p>
      <p>{product.inStock ? 'In stock' : 'Out of stock'}</p>
      <Link to="/products">Back to all products</Link>
    </article>
  );
}
```

Three things this screen adds to the list screen:

1. **`notFound` is its own state**, decided by the *status code*, not by catching a parse error. `404` is a normal, expected answer for an item URL — someone will always paste an id that no longer exists.
2. **`blurb ?? 'No description yet.'`** — the wire type says `string | null`, so the UI must handle `null`. This is the smallest possible example of file 11's "the API's shape is not your UI's shape" (a nicer design converts `null` into a domain object once, in a mapper).
3. **`[productId]` in the dependency array** — navigating from `/products/p-mouse` to `/products/p-keyboard` re-runs the effect (Part 6, file 04: the component re-renders rather than remounting).

---

## 8. Refetching, staleness, and what to do about caching

A `useEffect` fetch is a *cache of one request for as long as the component is mounted*. That is enough for most screens, and you should know its limits before reaching for a data library:

| Situation | What happens with this code | The usual fix |
| --- | --- | --- |
| Navigate away and back | a fresh request; a flicker of `loading` | keep the data in a parent/route loader (Part 8) |
| Two components fetch the same URL | two requests | hoist the fetch, or use a data library |
| The item changes on the server | stale until you revisit | refetch after mutations (file 08), or a polling interval |
| Slow network | loading state, then success | skeleton from file 09 |
| The user presses Back | the component remounts and refetches | acceptable for now; loaders fix it in Part 8 |

Two practical habits:

- **`cache: 'no-store'`** on a request when you must see fresh data (a stock level, an order status), and accept the extra traffic.
- **A `reloadToken` "Try again" button** on every error state. It costs four lines and removes the "reload the whole page" instinct from your users.

```ts
// Explicit freshness when it matters
await getJson<ApiProduct>(`products/${id}`, { cache: 'no-store', signal });
```

💡 Do **not** store fetched data in `useState` and then try to keep it in sync with a second source of truth. The state you own is "what the user is looking at"; the server owns the data. Files 05–08 will show the one-way flow that keeps that sane: **mutate → refetch (or patch) → render**.

---

## 9. The same list in axios

Everything above is transport-agnostic. With the axios instance from file 03, `listProducts` becomes:

```ts
// File: src/api/products.axios.ts (alternative implementation, same public API)
import { api } from './axios-client';

export async function listProducts(query: ProductQuery, signal?: AbortSignal): Promise<ProductPage> {
  const params: Record<string, string | number> = {};
  if (query.q) params.q = query.q;
  if (query.category) params.category = query.category;
  if (query.sort) {
    params._sort = query.sort;
    params._order = query.sort === 'priceMinor' ? 'desc' : 'asc';
  }
  if (query.page) {
    params._page = query.page;
    params._limit = query.pageSize ?? 3;
  }

  const response = await api.get<ApiProduct[]>('products', { params, signal });
  const total = Number(response.headers['x-total-count'] ?? response.data.length);
  return { items: response.data, total };
}
```

The differences you should be able to point at: `params` is an object (no `URLSearchParams`), `response.data` is the array (no `response.json()`), `response.headers['x-total-count']` is a plain lookup (no `.get()`), failures arrive as `AxiosError` (so file 04's `error instanceof HttpError && error.status === 404` becomes `error.response?.status === 404`), and **the component does not change at all**. That is the whole point of the seam: swapping HTTP clients is a change in `src/api/`, not in `src/part7/`.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `const [products, setProducts] = useState([])` with no `loading` flag | an empty list flashes before the data arrives | the four-state union |
| 2 | forgetting `response.ok` | a 404 body `{}` renders as `undefined.name` | let `getJson` throw `HttpError` |
| 3 | `useEffect(async () => {…})` | React error: effects must return a cleanup function or `undefined` | inner `async` function + `void` call |
| 4 | no dependency array (or a wrong one) | an infinite request loop | list exactly the query values in the deps |
| 5 | `setState` after abort | stale results or a warning | `if (controller.signal.aborted) return;` |
| 6 | filter changes that keep the old page number | an empty page after searching | reset `page` when filters change |
| 7 | `setSearchParams({ q })` with an object literal | the other filters vanish (Part 6, file 05) | copy the params, set one, pass the copy |
| 8 | push history on every keystroke | Back walks through letters | `{ replace: true }` while typing |
| 9 | pagination by slicing a full array in the browser | downloads everything to show three rows | `_page`/`_limit` + `X-Total-Count` |
| 10 | no retry control | users reload the page (losing their filters) | a "Try again" button that bumps a token |
| 11 | treating `[]` as an error | "something went wrong" when nothing matched | a dedicated empty state, with a way to clear filters |
| 12 | 404 treated as a crash | a red alert for a deleted product | a `notFound` state with a link back |

---

## 11. Best practices

1. **Model the screen as a union of states** (`loading | ready | error`, plus `notFound`/`empty` where they apply) and switch on it; never render "maybe data".
2. **Put every input that describes *what* you are viewing in the URL**; put ephemeral UI state (a draft input value) in `useState`.
3. **Keep fetching out of components**: `src/api/` knows HTTP, components know state and rendering.
4. **Always pass a signal**, always abort in the cleanup, always ignore `AbortError`.
5. **Use the total count** the server already sends (`X-Total-Count`) instead of downloading rows to count them.
6. **Give every failure a way forward**: a retry button, a link back, or a clear action — never a dead end.
7. **Write the empty state as carefully as the happy path**; it is what users see when they type too much.
8. **Do not keep a second copy of server data in state** just to avoid a refetch; refetch deliberately (file 08) or use a data library, but pick one and be consistent.
9. **Verify in the Network tab** that your request carries exactly the params the URL claims (`q`, `category`, `_page`), because a silent typo produces a correct-looking page with wrong data.
10. **Make the sad paths reproducible** (`?fail=500`, `?delay=800`) and check them before shipping — the transcripts in this file exist for exactly that reason.

---

## 12. Practice

### Beginner — the four states, observed

1. Run the app (`npm run api`, `npm run dev`), open `/products`, and record what the DOM shows *before* the response arrives and after. (Tip: throttle to "Slow 3G" in the Network tab to make the first state last long enough to read.)
2. In the Network tab, find the list request and write down: full URL, method, status, `content-type`, `x-total-count`, and the size of the response body. Then copy it as cURL and run it in a terminal.
3. Type `zzz` in the search box. Which state renders? Which branch of the component produced it?
4. Stop the API (`Ctrl+C` in terminal 1), then click **Try again**. What does the user see, and what is `error.status` in that case? (This is the "no response at all" path from file 03, section 4.)

### Intermediate — extend the gallery

1. Add a **"In stock only"** checkbox whose state lives in the URL as `instock=1`, and filter **client-side** on the current page (a deliberate simplification — note in a comment why it is not the same as server-side filtering).
2. Add a **"Clear filters"** button that removes `q`, `category`, `sort` and `page` in one `updateParam` call, and confirm with the Network tab that exactly one request is sent afterwards. (Careful: does your `updateParam` delete several keys at once? Part 6's transcript shows why a naive `setSearchParams({…})` would not.)
3. Make the empty state name the active filters, and give it a "Clear filters" link.
4. Add `?delay=800` support through the component (a debug prop is fine) and confirm the loading state is visible for the whole duration — then confirm that typing a new query *while it is loading* aborts the first request (watch the Network tab: the first entry shows as cancelled).

### Challenge — a second collection, properly

1. Add an **Orders** list (`GET /api/orders`, 3 records) with: a status filter (`packed`, `shipped`, `delivered`), sorting by `totalMinor`, server-side pagination, the four-state rendering, and a retry button.
2. Create `src/api/orders.ts` mirroring `products.ts`, including a typed `ApiOrder` in `types.ts` that matches `server/db.json` exactly.
3. Add a detail route `/orders/:orderId` with a `notFound` state that links back to the list.
4. Update the `X-Total-Count` handling so that a **missing** header falls back to `items.length` (the API might not always send it) and document that decision in a comment.
5. Prove the sad paths: run your own jsdom probe (copy `src/dev/gallery-probe.tsx`) and save the transcript as `order-list.txt`, showing initial load, a filter change, a page change, an empty result set, a `500` with a successful retry, and a `404` detail page.

---

## 13. Solutions

### Beginner

1. Before: the search form, the selects, and `Loading products…`. After: three rows and the pager (`Page 1 of 2 · 6 total`). That is exactly the transcript at the top of section 6 — the first two lines show both states.
2. From the lab: `GET http://localhost:5174/api/products?_sort=name&_order=asc&_page=1&_limit=3`, `200`, `application/json; charset=utf-8`, `x-total-count: 6`, body ≈ 400 bytes. Copied as cURL and run against `:3001` it returns the same three products — which proves the app is sending what you think it is sending.
3. The **empty** state: `ready` with `items.length === 0`, rendered by the `state.items.length === 0` branch. It is *not* an error, because the request succeeded; there simply are no matches.
4. The user sees `Could not load products: …` with the **Try again** button, and `error.status` is `undefined` because there is no response at all (transport failure: `TypeError: fetch failed` in Node, `Failed to fetch` in the browser). That is why the component's message uses `error.message` and only *optionally* the status.

### Intermediate

1. ```tsx
   // In the URL: ?instock=1
   const inStockOnly = searchParams.get('instock') === '1';
   // On the page (client-side, current page only — NOT the same as a server filter):
   const visible = inStockOnly ? state.items.filter((p) => p.inStock) : state.items;
   ```
   The comment matters: client-side filtering hides rows that the server counted, so the pager total no longer matches what is on screen. Server-side (`&inStock=true`, if the API supports it) keeps the count honest; if it does not, document the compromise or filter on the whole collection in a loader.
2. ```tsx
   function clearFilters() {
     const next = new URLSearchParams(searchParams);
     for (const key of ['q', 'category', 'sort', 'page']) next.delete(key);
     setDraft('');
     void setSearchParams(next, { replace: true });
   }
   ```
   One `setSearchParams` call, so one URL update (the setter is not queued across calls in the same tick — Part 6, file 05) and therefore one request: `GET /api/products?_sort=name&_order=asc&_page=1&_limit=3` once the effect re-runs.
3. ```tsx
   const activeFilters = [q && `“${q}”`, category && `${category}`, inStockOnly && 'in stock only'].filter(Boolean);
   …
   <p className="status">
     No products match {activeFilters.length ? activeFilters.join(' + ') : 'your search'}.{' '}
     <button type="button" onClick={clearFilters}>Clear filters</button>
   </p>
   ```
4. With `?delay=800` the loading paragraph is visible for ~800 ms (file 01 measured `0.805669s` for that delay). Typing while it loads makes the Network tab show the first request as **cancelled** — the cleanup's `controller.abort()` — and no stale rows appear, because the aborted effect returns early.

### Challenge

```ts
// File: src/api/types.ts — the orders addition
export interface ApiOrder {
  id: string;
  customer: string;
  status: 'packed' | 'shipped' | 'delivered';
  totalMinor: number;
}
```

```ts
// File: src/api/orders.ts
import { HttpError } from './http';
import type { ApiOrder } from './types';

export interface OrderQuery {
  status?: string;
  sort?: 'totalMinor';
  page?: number;
  pageSize?: number;
}

export async function listOrders(query: OrderQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.sort) {
    params.set('_sort', query.sort);
    params.set('_order', 'desc');
  }
  if (query.page) {
    params.set('_page', String(query.page));
    params.set('_limit', String(query.pageSize ?? 3));
  }

  const response = await fetch(`/api/orders?${params.toString()}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new HttpError(response.status, `Request failed with ${response.status}`, null);

  const items = (await response.json()) as ApiOrder[];
  // The API sends the total, but a missing header must not break the screen.
  const header = response.headers.get('x-total-count');
  const total = header === null ? items.length : Number(header);
  return { items, total };
}

export function getOrder(id: string, signal?: AbortSignal) {
  return fetch(`/api/orders/${id}`, { signal, headers: { Accept: 'application/json' } }).then(async (response) => {
    if (response.status === 404) throw new HttpError(404, 'Order not found', null);
    if (!response.ok) throw new HttpError(response.status, `Request failed with ${response.status}`, null);
    return (await response.json()) as ApiOrder;
  });
}
```

The list page is a copy of `ProductsGallery` with `status` instead of `category`, and the detail page is a copy of `ProductDetailPage` with `notFound` for the `404`. Your probe transcript should contain all six situations, in the same shape as `/tmp/part7-gallery.txt` — including the `ready`-with-zero-rows case for `status=delivered` plus a search that matches nothing, and the `notFound` case for `/orders/ORD-9999`.

---

## 14. Summary

- A GET screen is either a **collection** (array + total) or an **item** (one record + `404`), and both are driven by a **state union**, not by a bare `useState([])`.
- The four states are **loading, ready, empty, error** (plus `notFound` for items); each needs its own rendering and, except for `ready`, a way forward.
- **The URL is the source of truth** for query/filter/sort/page — shareable, refreshable, back-button friendly — and `setSearchParams` requires you to **copy** the params before changing one (Part 6, file 05).
- **`X-Total-Count`** is how a pager knows the size of the collection without downloading it (`Page 1 of 2 · 6 total`, verified).
- The API layer (`http.ts` + `products.ts`) keeps HTTP, query dialect, and error shapes out of components, making a fetch↔axios swap a change in one directory.
- **Cancellation is not optional**: `AbortController` + cleanup + an aborted check makes file 02's race condition structurally impossible, and every filter change resets the page number.

---

**What's next →** [`05-post-api.md`](./05-post-api.md): creating records. A controlled form with typed state, client-side validation *before* the request, a submit handler that cannot double-submit, `201 Created` and what to do with the returned record, `400`/`422` validation errors from the server mapped back onto the right fields, and the "optimistic versus pessimistic" decision for what the user sees while the request is in flight.
