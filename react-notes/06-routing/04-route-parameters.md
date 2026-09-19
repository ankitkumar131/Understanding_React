# 04 — Route Parameters: `:id` and `useParams`

> **Part 6 · Routing · File 4 of 8**
> Why this file exists: `/products/:productId` is how one screen serves a thousand products, and `useParams()` is how it learns *which* one. This file covers what the hook really returns (strings, possibly `undefined`), how to type it without lying, how to validate a param that arrives from the wild, the trap that the same route **re-renders instead of remounting** when only the param changes (measured: an input's text survived a navigation — and disappeared with `key={productId}`), and how to build links back into these routes safely.

---

## 1. One route, many URLs

```tsx
<Route path="/products/:productId" element={<ProductDetailPage />} />
```

| URL | Matches? | `useParams()` |
| --- | --- | --- |
| `/products/p-mouse` | ✅ | `{ productId: 'p-mouse' }` |
| `/products/p-keyboard` | ✅ | `{ productId: 'p-keyboard' }` |
| `/products` | ❌ (no segment to capture) | — |
| `/products/p-mouse/reviews` | ❌ (extra segment) | — |
| `/orders/new` | ❌ (different path) | — |

The colon marks a **dynamic segment**: it matches exactly one segment and hands you its value. That is the whole mechanism — a router gives one component instance per *match*, and the match carries the values.

⚠️ Remember file 03's measurement: the dynamic segment must be a **whole segment**. `:productId` in the middle of the path (like `/c/:categoryId/p/:productId`) expects `/c/audio/p/sp-42`, not `/c/audio/p-speaker`.

---

## 2. `useParams()` returns strings

```tsx
// File: src/routes/ProductDetailPage.tsx (fragment)
const params = useParams();
console.log(typeof params.productId);   // "string"
```

Measured, with a real route:

```text
1. one route, two ids…
   counters now: renders=6 · typeof param=string
```

Consequences that follow directly from "it is a string":

- `Number(params.productId)` is a conversion **you** must do (and must validate — section 5).
- `params.productId === 7` is always `false`; `'7' === 7` is false.
- A param can never be a number, an array, or an object unless you encode it yourself (`?ids=1,2,3` belongs in the query string — file 05).
- The value is **URL-decoded** for you: `/products/a%20b` yields `"a b"`. (Build links with `encodeURIComponent` so that decoding does not surprise you — section 9.)

---

## 3. Typing params honestly

```tsx
const params = useParams();                    // Params<string> → params.productId: string | undefined
const params = useParams<'productId'>();       // typed key, still string | undefined
const { productId } = useParams<'productId'>();// productId: string | undefined
```

Why `| undefined`? Because TypeScript only knows what your *route table* promises at runtime, and `ProductDetailPage` could in principle be rendered under a different route. Under `strict` (which you should have — Part 2), TypeScript therefore makes you handle the missing case. Two patterns:

```tsx
// Pattern A — handle it in the component (best when "missing" is a real state).
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
      <p>{formatMoney(product.priceMinor)}</p>
    </section>
  );
}
```

```tsx
// Pattern B — a helper that throws when the param is missing (it means the route
// table and the component disagree — a programming error, not a user state).
export function useRequiredParam(name: string): string {
  const params = useParams();
  const value = params[name];
  if (value === undefined) throw new Error(`Route param "${name}" is missing — is this component under the right <Route>?`);
  return value;
}

// Usage: const productId = useRequiredParam('productId');   // string, not string | undefined
```

⚠️ Do **not** reach for `as string`:

```tsx
const productId = params.productId as string;   // ❌ hides the case the route table forgot
```

That assertion is exactly what `strict` was trying to prevent: on the day someone renders the component under a route without `:productId`, `getProduct(undefined as unknown as string)` throws deep inside a lookup instead of rendering a friendly "not found".

---

## 4. Several params, optional params, splat params

```tsx
<Route path="/c/:categoryId/p/:productId" element={<CategoryProduct />} />
```

```text
[params] {"categoryId":"audio","productId":"sp-42"}
```

```tsx
export function CategoryProduct() {
  const { categoryId, productId } = useParams<'categoryId' | 'productId'>();
  // both are string | undefined
}
```

| Pattern | URL | Params |
| --- | --- | --- |
| `/:lang?/categories` | `/categories` | `{}` |
| `/:lang?/categories` | `/en/categories` | `{ lang: 'en' }` |
| `/files/*` | `/files/a/b/c.txt` | `{ '*': 'a/b/c.txt' }` |

⚠️ **Keep dynamic segment names unique inside one path.** If the same name appears twice, the later value wins — you get one key and silent data loss.

---

## 5. Validating a param that came from a human

A URL is user input. `productId` can be anything: `p-mouse`, `'; DROP TABLE`, `../../../etc/passwd`, `0`, `%00`, or `undefined`. The rule: **a param is either an id you recognise or an error — never a value you trust.**

```tsx
// File: src/routes/ProductDetailPage.tsx — validation first, lookup second.
import { Link, useParams } from 'react-router';
import { formatMoney, getProduct } from '../data/products';

const ID_PATTERN = /^[a-z0-9-]{1,40}$/;      // the shape your ids actually have

export function ProductDetailPage() {
  const { productId } = useParams<'productId'>();

  if (productId === undefined || !ID_PATTERN.test(productId)) {
    return <InvalidProductId value={productId} />;
  }

  const product = getProduct(productId);
  if (product === undefined) return <UnknownProduct id={productId} />;

  return <ProductView product={product} />;
}
```

```tsx
// Numeric ids: parse, then check the parse succeeded.
const parsed = Number(params.orderId);
if (!Number.isInteger(parsed) || parsed <= 0) return <p>That is not an order number.</p>;
```

```tsx
// Fetching by id: the id goes through the safe API layer (Part 7).
const response = await fetch(`/api/products/${encodeURIComponent(productId)}`);
```

Three validation rules worth memorising:

1. **Never concatenate a raw param into a URL, SQL string, HTML, or a file path.** Encode for the destination: `encodeURIComponent` for URLs, prepared statements for SQL, escaping for HTML (React does that for you in JSX).
2. **Validate the shape before the lookup**, and treat failure as a normal UI state, not a crash.
3. **Server-side validation is the real one** (Part 14). Client checks are UX, never security.

---

## 6. Parent and child params

```tsx
<Route path="/orders" element={<OrdersLayout />}>
  <Route path=":orderId" element={<OrderScreen />} />
</Route>
```

Measured:

```text
parent (OrdersLayout) sees {"orderId":"ORD-1001"} · child (OrderScreen) sees {"orderId":"ORD-1001"}
```

In React Router v8, `useParams()` returns the params of the **matched branch**, so a layout can read a child's param too. That is convenient (a layout can title itself "Order ORD-1001") and it is also a hint: the layout is not a boundary you can assume. If you want a layout to be independent of whatever is below it, take the value as an `Outlet` context instead:

```tsx
// Passing data down to the outlet, instead of reaching for params.
<Outlet context={{ from: 'layout' }} />
const { from } = useOutletContext<{ from: string }>();
```

---

## 7. The trap: a changing param re-renders, it does not remount

When you navigate from `/products/p-mouse` to `/products/p-keycap-set`, **the same route matches and the same component instance stays mounted**. React re-renders it with new params. Your `useState` values, refs, and DOM nodes survive:

```text
1. one route, two ids: the screen re-renders and KEEPS its state:
   typed a note: "remember me"
   counters now: renders=6 · typeof param=string
   the same input still holds "remember me" — the component was re-rendered, not recreated
```

(StrictMode double-renders and the effect re-ran for the new id — `[effect cleanup] for p-mouse` then `[effect] ran for p-keycap-set` — but the input's text and the component's state did **not** reset.)

Sometimes that is what you want (a filter that persists across similar products). Often it is a bug: a half-filled "edit" form for product A suddenly showing underneath "Product B", or a scroll position from the previous record.

Three ways to reset state on a param change, from best to worst:

```tsx
// 1. Give each value its own component instance — the declarative fix.
function KeyedProduct() {
  const { productId } = useParams();
  return <ProductEditor key={productId} />;      // new id → new instance → fresh state
}
```

```text
2. key={productId} gives each id its own component instance:
   typed a note: "remember me"
   counters now: renders=2 · typeof param=string
   the note is gone ("") — a fresh instance was mounted
```

```tsx
// 2. Reset explicitly when the param changes (fine when only part of the state should reset).
useEffect(() => {
  setDraft(emptyDraft);
}, [productId]);
```

```tsx
// 3. Do not put the value in state at all — derive it from the URL on every render
//    (the Part 5 rule: "don't copy props into state").
const product = getProduct(productId);
```

⚠️ The effect in option 2 runs *after* the render that already showed stale state for one frame. `key` avoids the flash entirely — that is why it is the recommended fix for forms and editors.

---

## 8. Loading one record by id (the shape of the screen)

```tsx
// File: src/routes/ProductDetailPage.tsx — the four states every detail screen has.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatMoney, type Product } from '../data/products';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | { status: 'ready'; product: Product };

export function ProductDetailPage() {
  const { productId } = useParams<'productId'>();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (productId === undefined) {
      setState({ status: 'missing' });
      return;
    }
    const controller = new AbortController();       // Part 7: cancel on unmount/navigate
    setState({ status: 'loading' });

    void (async () => {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, { signal: controller.signal });
        if (response.status === 404) {
          setState({ status: 'missing' });
          return;
        }
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        setState({ status: 'ready', product: (await response.json()) as Product });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }
    })();

    return () => controller.abort();
  }, [productId]);

  if (state.status === 'loading') return <p role="status">Loading product…</p>;
  if (state.status === 'error') return <p role="alert">Could not load this product: {state.message}</p>;
  if (state.status === 'missing')
    return (
      <section>
        <h1>Product not found</h1>
        <p>No product has the id “{productId}”.</p>
        <Link to="/products">Back to products</Link>
      </section>
    );

  return (
    <section>
      <h1>{state.product.name}</h1>
      <p>{formatMoney(state.product.priceMinor)}</p>
    </section>
  );
}
```

This effect is exactly what a **`loader`** does better in data mode (no flash of "loading", no waterfall, cancellation handled by the router) — file 08 shows the same screen with a loader, and Part 7 covers the fetching details.

---

## 9. Building links into parameterised routes

```tsx
// Template literal — simple, and you must encode dynamic values.
<Link to={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link>

// generatePath — the reverse of matching, with encoding handled.
import { generatePath } from 'react-router';
const href = generatePath('/products/:productId', { productId: 'mechanical keyboard' });
// "/products/mechanical%20keyboard"   (verified)
```

```text
generatePath('/products/:productId', { productId: 'p-mouse' }) → /products/p-mouse
with a space in the value → /products/mechanical%20keyboard
the same encoding by hand → /products/mechanical%20keyboard
```

Where each belongs:

| Situation | Use |
| --- | --- |
| a link you write by hand with a known id | template literal + `encodeURIComponent` |
| a link built in a loop over typed data | `generatePath` (fails loudly if a param is missing) |
| a *relative* link inside a nested route (`to="edit"`, `to=".."`) | React Router resolves it (file 06) |
| an external URL | plain `<a href>`, no router |

---

## 10. Params versus state versus search

| Kind of information | Lives in | Example |
| --- | --- | --- |
| **The identity of the resource** | route **params** | `/products/p-mouse` |
| **Filters, sorting, pagination, tabs** | **search** string | `/products?sort=price&page=2` (file 05) |
| **Ephemeral UI state** (a dropdown being open, a drag in progress) | React state | `const [open, setOpen] = useState(false)` |

A useful test: *"If I paste this URL to a colleague, should they see exactly what I see?"* Identity and filters: **yes** → URL. A hover state: **no** → React state.

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | treating params as numbers/objects | `params.id === 7` is never true | params are **strings**; parse and validate |
| 2 | `as string` to silence `| undefined` | crashes deep in a lookup when the route changes | `=== undefined` check or a `useRequiredParam` helper |
| 3 | expecting the component to remount when the id changes | stale form data, wrong scroll position | `key={param}` on the child, or reset explicitly (section 7) |
| 4 | fetching without validating the id | 500s, weird API errors, log noise from bots | validate shape (`/^[a-z0-9-]+$/`) before the request |
| 5 | building links with raw values | `/products/mechanical keyboard` → broken URL | `encodeURIComponent` / `generatePath` |
| 6 | putting filters in params (`/products/price-desc`) | an explosion of routes and no shareable query semantics | search params (file 05) |
| 7 | using one param name twice in a path (`/:id/:id`) | one value silently overwrites the other | unique names |
| 8 | forgetting that `/products/:id` also matches garbage (`/products/%00`) | odd API calls | validate + handle "not found" as a state |
| 9 | handling "not found" by redirecting to `/products` | the user loses the URL they wanted and cannot share it | render the not-found state at the same URL |
| 10 | reading params with `window.location` | no re-render, ignores `basename` and tests | `useParams()` |
| 11 | assuming a layout cannot see child params (or vice versa) | duplicated fetches or missing data | measured: both see the matched branch's params — use `useOutletContext` to pass data deliberately |
| 12 | treating a param as authorisation ("if the id is in the URL, they may see it") | data leaks | authorise on the server (Part 14) |

---

## 12. Best practices

1. **Params carry identity, nothing else.** Everything optional or user-adjustable belongs in the query string.
2. **Validate the shape, then look up, then render one of the four states** (loading / error / missing / ready).
3. **Type params with the generic** (`useParams<'productId'>()`) and handle `undefined` — that is the type system doing its job, not being annoying.
4. **`key={param}` for editors and forms**; leave state alone when the URL should not reset it.
5. **Encode when building, decode for free when reading.**
6. **Keep ids opaque.** If your ids are sequential integers, you leak volume (`/orders/1` → "you have 1 order"); use UUIDs/slugs where that matters (Part 15).
7. **Prefix with `encodeURIComponent` even when you think ids are safe** — "safe today" is how injection stories start.
8. **One screen, one fetch, keyed by the param.** If two components both need the record, fetch in the parent or use a loader.
9. **Show the id in the not-found message.** It makes support tickets solvable.
10. **Deep-link test every parameterised screen** by pasting the URL in a fresh tab (that is how your users arrive from emails and chat).

---

## 13. Practice

### Beginner — a product list and detail

1. Given this data, build `/products` (a list of links) and `/products/:productId` (the detail):

```ts
// File: src/data/products.ts
export interface Product {
  id: string;
  name: string;
  priceMinor: number;
  blurb: string;
}

export const products: Product[] = [
  { id: 'p-keyboard', name: 'Mechanical Keyboard', priceMinor: 499900, blurb: 'Quiet switches, PBT caps.' },
  { id: 'p-mouse', name: 'Wireless Mouse', priceMinor: 249900, blurb: 'Silent clicks, 70-day battery.' },
  { id: 'p-headphones', name: 'Studio Headphones', priceMinor: 899900, blurb: 'Closed-back, 32 Ω.' },
];

export function getProduct(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}
```

2. Visiting `/products/nope` must show "Product not found" **with the id shown**, and a link back.
3. Visit `/products` — what renders, and why? (Look at your route table.)
4. Add a second product id to the data with a space in it (`'p mouse 2'`) and check that your link still works. Which function made that work?

### Intermediate — an edit form that resets correctly

1. Build `/products/:productId/edit` with a controlled form seeded from the product (`name`, `blurb`).
2. Type into the form, then navigate to another product's edit page using a link in the page. Describe what happens to your typed text and why.
3. Fix it with `key={productId}`, and confirm the form resets.
4. Now make the opposite choice for a "search note" field that *should* survive product changes, and explain how you decided which state resets.
5. Bonus: move the reset to a `<ProductEditor key=…>` child and explain why the key belongs on the child rather than on the route element you cannot access.

### Challenge — validated, typed access to one record

Build the "one record" pipeline the way a production screen does it:

1. A `useRequiredParam(name)` hook that throws a helpful error when the param is missing.
2. An `isProductId(value: string): value is string` style guard… but make it a *branded* id so you cannot pass a random string into the API layer:

```ts
// File: src/data/ids.ts
declare const brand: unique symbol;
export type ProductId = string & { readonly [brand]: 'ProductId' };

export function toProductId(value: string): ProductId | undefined {
  return /^[a-z0-9-]{1,40}$/.test(value) ? (value as ProductId) : undefined;
}
```

3. `getProduct(id: ProductId)` — so the compiler refuses a raw `string`:

```ts
// This must be a type error. Confirm with `npx tsc -b` and quote the message.
getProduct('p-mouse');
```

4. A screen that renders loading / error / missing / ready states, where the fetch URL is built with `encodeURIComponent(id)`.
5. Then answer: which of these checks protects your *database*, and which only improves the user's experience? (If you are unsure, read Part 14 before trusting any of them server-side.)

---

## 14. Solutions

### Beginner

```tsx
// File: src/routes/AppRoutes.tsx (fragment)
<Route path="/products" element={<ProductsListPage />} />
<Route path="/products/:productId" element={<ProductDetailPage />} />
```

```tsx
// File: src/routes/ProductsListPage.tsx
import { Link } from 'react-router';
import { formatMoney, products } from '../data/products';

export function ProductsListPage() {
  return (
    <section>
      <h1>Products</h1>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <Link to={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link> — {formatMoney(product.priceMinor)}
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
  const { productId } = useParams<'productId'>();
  const product = productId === undefined ? undefined : getProduct(productId);

  if (product === undefined) {
    return (
      <section>
        <h1>Product not found</h1>
        <p>No product has the id “{productId}”.</p>
        <Link to="/products">Back to products</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>{product.name}</h1>
      <p>{product.blurb}</p>
      <p>{formatMoney(product.priceMinor)}</p>
      <Link to="/products">← Back to products</Link>
    </section>
  );
}
```

3. `/products` renders **nothing** from the detail route — it needs its own route (`/products` → list) or an index route under a `/products` parent. If you only wrote `/products/:productId`, `/products` falls through to your `*` route.
4. `encodeURIComponent` (or `generatePath`) — it turns `'p mouse 2'` into `p%20mouse%202`, and React Router decodes it back to `'p mouse 2'` in `useParams`.

### Intermediate

```tsx
// File: src/routes/ProductEditPage.tsx
import { Link, useParams } from 'react-router';
import { getProduct } from '../data/products';
import { ProductEditor } from '../components/ProductEditor';

export function ProductEditPage() {
  const { productId } = useParams<'productId'>();
  const product = productId === undefined ? undefined : getProduct(productId);

  if (product === undefined) return <p>Product not found.</p>;

  return (
    <section>
      <h1>Edit {product.name}</h1>
      {/* key → new instance per id → the form starts empty each time */}
      <ProductEditor key={product.id} product={product} />
      <p>
        {product.id === 'p-mouse' ? (
          <Link to="/products/p-keyboard/edit">Edit the keyboard instead</Link>
        ) : (
          <Link to="/products/p-mouse/edit">Edit the mouse instead</Link>
        )}
      </p>
    </section>
  );
}
```

```tsx
// File: src/components/ProductEditor.tsx
import { useState } from 'react';
import type { Product } from '../data/products';

export function ProductEditor({ product }: { product: Product }) {
  const [name, setName] = useState(product.name);
  const [blurb, setBlurb] = useState(product.blurb);

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <label>
        Name <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Blurb <textarea value={blurb} onChange={(event) => setBlurb(event.target.value)} />
      </label>
      <button type="submit">Save</button>
    </form>
  );
}
```

2. Without the `key`, the typed text survives the navigation (measured above: the note stayed `"remember me"`), so the editor would show product A's edits while the URL says product B — a classic "saved the wrong record" bug. 3. With `key={product.id}` the component is replaced, so state is initialised from the new product. 4. The decision rule: **does this state describe the record (reset) or the user's session (keep)?** A draft name describes the record → reset. A scratch note the user is writing for themselves → keep (leave it out of the keyed child, or lift it above).

### Challenge

```ts
// File: src/data/ids.ts
declare const brand: unique symbol;
export type ProductId = string & { readonly [brand]: 'ProductId' };

export function toProductId(value: string): ProductId | undefined {
  return /^[a-z0-9-]{1,40}$/.test(value) ? (value as ProductId) : undefined;
}
```

```ts
// File: src/data/products.ts (the API layer)
import { toProductId, type ProductId } from './ids';

export async function fetchProduct(id: ProductId, signal?: AbortSignal): Promise<Product | undefined> {
  const response = await fetch(`/api/products/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return (await response.json()) as Product;
}
```

`getProduct('p-mouse')` fails to compile with the branded type — the message is of the form *"Argument of type 'string' is not assignable to parameter of type 'ProductId'. Type 'string' is not assignable to type '{ readonly [brand]: "ProductId" }'."* The only way in is `toProductId(...)`, which is where validation lives, so **every** caller is forced through it. Answer to point 5: none of this protects your database. The regex saves the user from a broken screen and your logs from junk; the **server** must still validate the id and check permissions on every request (Part 14), because anyone can edit the URL and call your API directly.

---

## 15. Summary

- `:name` in a `path` captures **one segment** and exposes it as `useParams().name`.
- Params are **strings** (possibly `undefined`); TypeScript's `useParams<'productId'>()` tells you the truth — handle it instead of asserting it away.
- **Validate before you use**: shape check → lookup → one of four states (loading / error / missing / ready); never concatenate a raw param into a URL or by hand into HTML/SQL.
- `generatePath`/`encodeURIComponent` when **building** links; decoding is automatic when **reading** params.
- The same route **re-renders rather than remounts** when only the param changes — state survives (measured: the input kept `"remember me"`). Use **`key={param}`** (measured: fresh instance, empty input) for editors, or reset explicitly when only some state should clear.
- A layout and its children both see the matched branch's params in v8 (measured); prefer `Outlet` context when you want to pass data deliberately.
- **Params are identity; search params are filters** (next file); React state is for transient UI.
- Detail screens built on params are exactly what data-mode **loaders** automate (file 08) — same four states, less code.

---

**What's next →** [`05-query-parameters.md`](./05-query-parameters.md): the URL as state. `useSearchParams` (a stable, mutable `URLSearchParams` plus a setter), why typing in a search box uses `{ replace: true }` while changing sort order pushes a new entry (verified: `type=REPLACE` versus `type=PUSH`), keeping filters bookmarkable, reading defaults without polluting the URL, and the rule for deciding what belongs in the query string at all.
