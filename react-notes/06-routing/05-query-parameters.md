# 05 — Query Parameters: The URL as State

> **Part 6 · Routing · File 5 of 8**
> Why this file exists: `?q=key&sort=price` looks like decoration until you realise it is the cheapest state container you own — shareable, bookmarkable, back-button friendly, and free of synchronisation bugs because there is only one copy. This file teaches `useSearchParams` properly: the four shapes its setter accepts, why typing in a search box should **replace** the history entry while sorting should **push** one (verified: `type=REPLACE` versus `type=PUSH`), how a setter call with an object **wipes every other parameter** (verified: `q=key&sort=price&tag=audio&tag=desk` became `q=mouse`), and how to decide what belongs in the URL at all.

---

## 1. What the query string is for

| Belongs in the query string | Belongs elsewhere |
| --- | --- |
| search terms (`?q=keyboard`) | the identity of a resource → **route params** (`/products/:id`) |
| sorting (`?sort=price`) | transient UI (`open`, `hovered`, dragging) → **React state** |
| filters (`?category=audio&inStock=true`) | secrets, tokens, personal data → **never the URL** |
| pagination (`?page=2&perPage=25`) | large payloads (thousands of ids) → POST body / server state |
| tab selection (`?tab=reviews`) | things that break on refresh → nothing; URLs are shareable |
| `from`/redirect hints (`?from=/orders`) | |

The test from file 04 still applies: **"If I paste this URL to a colleague, should they see what I see?"** Filters and sorting: yes. The fact that a dropdown is mid-animation: no.

Why the URL is a great state container:

- **One copy.** No `useState` to keep in sync, so the "two sources of truth" class of bug (Part 5, file 02) simply cannot happen.
- **Refresh-safe and shareable.** Support tickets get real URLs.
- **Back/Forward work for free.** "Sort by price" then Back restores the previous sort — if you push instead of replace, which is a *design choice* you will make in section 5.

---

## 2. `useSearchParams` in one screen

```tsx
// File: src/routes/ProductsPage.tsx
import { Link, useLocation, useSearchParams } from 'react-router';
import { formatMoney, searchProducts } from '../data/products';

type Sort = 'none' | 'name' | 'price';

function readSort(value: string | null): Sort {
  return value === 'name' || value === 'price' ? value : 'none';
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const query = searchParams.get('q') ?? '';
  const sort = readSort(searchParams.get('sort'));
  const results = searchProducts(query, sort);

  function setQuery(next: string) {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);   // copy: never mutate `previous`
      if (next === '') params.delete('q');            // keep the URL clean
      else params.set('q', next);
      return params;
    }, { replace: true });                            // typing replaces the entry
  }

  function setSort(next: Sort) {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next === 'none') params.delete('sort');
      else params.set('sort', next);
      return params;
    });                                               // sorting pushes a new entry
  }

  return (
    <section>
      <h1>Products</h1>
      <label>
        Search <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="keyboard" />
      </label>
      <p>
        Sort: <button type="button" onClick={() => setSort('name')}>name</button>{' '}
        <button type="button" onClick={() => setSort('price')}>price</button>{' '}
        <button type="button" onClick={() => setSort('none')}>default</button>
      </p>
      <p className="url">
        URL: {location.pathname}
        {location.search}
      </p>
      <p>{results.length} of 6 products</p>
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

Both setters follow the same three-step shape: **copy → change one thing → hand it to the setter.** The only differences between them are the parameter they touch and the second argument (`{ replace: true }` for typing, nothing for sorting — section 5 explains why).

**Verified behaviour** — the same page, driven through four interactions:

```text
1. the URL is the state — opening /products?q=key&sort=price directly:
   the input shows "key"
   results, sorted by price: Keycap Set · Mechanical Keyboard
   the page prints: URL: /products?q=key&sort=price

2. typing replaces the current history entry (replace: true):
   [url] /products?q=keycap&sort=price · type=REPLACE
   results: Keycap Set

3. clicking sort pushes a new entry (no replace):
   [url] /products?q=keycap&sort=name · type=PUSH

4. clearing the search removes the parameter instead of leaving q= empty:
   [url] /products?sort=name · type=REPLACE
   the page prints: URL: /products?sort=name
   results: 6 of 6
```

Read the first block again: opening `/products?q=key&sort=price` **directly** produced a filtered, sorted list and a search box already containing `key`. No `useEffect` copied the URL into state, and there is no way for the screen to disagree with the URL.

---

## 3. Reading values

`useSearchParams` returns `[searchParams, setSearchParams]`, where `searchParams` is a standard [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams):

```tsx
const [searchParams] = useSearchParams();

searchParams.get('q');          // string | null   ("key" or null)
searchParams.get('page') ?? '1';// your default, applied at read time
searchParams.has('q');          // boolean
searchParams.getAll('tag');     // string[]        — for repeated keys
searchParams.toString();        // "q=key&sort=price&tag=audio&tag=desk"
searchParams.size;              // number of entries
[...searchParams.entries()];    // [['q','key'], ['sort','price'], …]
```

Measured, on `/products?q=key&sort=price&tag=audio&tag=desk`:

```text
getAll('tag') = ["audio","desk"] · has('q') = true · toString() = "q=key&sort=price&tag=audio&tag=desk"
```

⚠️ **Everything is a string, and absent values are `null`, not `undefined`.** There is no number, no boolean, no array. Two consequences:

1. Apply defaults **when reading** (`?? ''`, `?? '1'`) so a missing parameter behaves like the default without writing anything to the URL.
2. Validate against an allowlist before using a value, exactly as with route params (file 04):

```tsx
// A parameter is user input. Never trust it, and never let it reach your API unvalidated.
function readSort(value: string | null): Sort {
  return value === 'name' || value === 'price' ? value : 'none';
}

function readPage(value: string | null): number {
  const page = Number(value ?? '1');
  return Number.isInteger(page) && page > 0 && page <= 500 ? page : 1;
}
```

---

## 4. Writing values: the five accepted shapes

`setSearchParams(next)` accepts anything a `URLSearchParams` constructor does, plus a callback:

```tsx
setSearchParams('?tab=specs');                             // a query string
setSearchParams({ tab: 'specs' });                         // a shorthand object
setSearchParams({ tag: ['audio', 'desk'] });               // arrays → repeated keys
setSearchParams([['tab', 'specs'], ['tag', 'audio']]);     // an array of pairs
setSearchParams(new URLSearchParams('?tab=specs'));        // a URLSearchParams
setSearchParams((previous) => {                            // a callback (like setState)
  const params = new URLSearchParams(previous);
  params.set('tab', 'specs');
  return params;
});
```

⚠️ **The object and string forms *replace the entire query string*.** Measured:

```text
5. multi-value params and the "set replaces everything" rule:
   getAll('tag') = ["audio","desk"] · has('q') = true · toString() = "q=key&sort=price&tag=audio&tag=desk"
   getAll('tag') = [] · has('q') = true · toString() = "q=mouse"
```

One click of `setSearchParams({ q: 'mouse' })` on that URL wiped `sort` **and** both `tag`s. This is the single most common `useSearchParams` bug: a "clear filters" button that also clears the search term because it built a fresh object instead of editing a copy.

```tsx
// ✅ Edit a copy — the only safe way to change one parameter.
setSearchParams((previous) => {
  const params = new URLSearchParams(previous);
  params.delete('q');
  return params;
});
```

💡 **The callback form does not queue.** React's `setState` batches multiple updates in one event; `setSearchParams` does not. If you call it three times in one handler, the last call wins and the others are lost. Compute the final `URLSearchParams` once and call it once.

---

## 5. Push or replace: the back-button decision

`setSearchParams(next, options)` takes a second argument — the same navigation options as `useNavigate` — and the one you will use is `replace`:

```tsx
setSearchParams(params, { replace: true });   // no new history entry
setSearchParams(params);                      // new history entry (default)
```

| Interaction | Use | Why |
| --- | --- | --- |
| typing in a search box | **replace** | otherwise every keystroke is a history entry and Back becomes "delete one character" |
| changing sort order | **push** | Back should undo the sort — that is what users expect |
| changing page number | **push** | Back returns to the previous page |
| switching tabs (`?tab=reviews`) | **push** (usually) | Back returns to the previous tab |
| clearing filters ("Reset") | **replace** or push — decide | replace keeps history tidy; push makes Reset undoable |
| syncing a value that is really UI state | **replace** | it should not pollute history at all |

Verified in section 2's output: typing produced `type=REPLACE`, sorting produced `type=PUSH`. The `useNavigationType()` hook reports what happened — a quick way to check your own choice while developing.

⚠️ **Debounce or defer, do not push per keystroke.** With `replace: true` the history stays clean, but every keystroke still updates the URL and re-renders. For a client-side filter that is fine; for a network request it is not (Part 7 covers debouncing, Part 10 covers `useDeferredValue`).

---

## 6. Defaults without polluting the URL

Three rules keep URLs readable:

1. **Absent means default.** `?sort=name` when `name` is the default is noise; delete the parameter instead of writing the default value.
2. **Delete empty values.** After clearing the search box you want `/products`, not `/products?q=`.
3. **Normalise what you accept.** If someone pastes `?sort=Price&page=-3`, map it to the defaults and (optionally) rewrite the URL so the address bar matches what is displayed.

```tsx
// Normalising on read, without writing: the cheapest, least surprising option.
const sort = readSort(searchParams.get('sort'));
const page = readPage(searchParams.get('page'));
```

```tsx
// Normalising by rewriting the URL: do this when the URL is shared onward.
useEffect(() => {
  const raw = searchParams.get('sort');
  if (raw !== null && raw !== sort) {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      params.set('sort', sort);
      return params;
    }, { replace: true });
  }
}, [searchParams, sort, setSearchParams]);
```

Measured, for the "defaults are not written" claim:

```text
6. useSearchParams(defaults) does not change the URL on the first render:
   rendered: default tab=specs while the URL is still /products
```

`useSearchParams({ tab: 'specs' })` gives you `specs` on the first render **without** touching the URL — useful for a screen whose default is not representable as "absent". Prefer the `?? default` style for everything else, because a default in the URL is a lie about what the user chose.

---

## 7. Search params are stable — and mutable

Two properties of the object you get back are worth knowing exactly:

```text
   [searchParams] q=key · sort=price · same object as last render? true
```

- **Stable across renders** for the same URL: you can put `searchParams` in a dependency array without causing an effect to loop.
- **Mutable**: it is a real `URLSearchParams` object. `searchParams.set(...)` *works* — and the URL does **not** change, so the next render shows the old URL again. Mutating it is a bug that looks like it works until something else triggers a render.

```tsx
// ❌ mutation: the UI may flicker and the URL never updates
searchParams.set('q', 'mouse');

// ✅ copy, then hand it to the setter
const next = new URLSearchParams(searchParams);
next.set('q', 'mouse');
setSearchParams(next);
```

---

## 8. Patterns you will actually use

### Search as you type (with a form for accessibility)

```tsx
// A form submit is still the most accessible "search" affordance: Enter works,
// screen readers announce it, and no JavaScript is required to submit.
function SearchForm() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(searchParams.get('q') ?? '');

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        setSearchParams((previous) => {
          const params = new URLSearchParams(previous);
          if (draft === '') params.delete('q');
          else params.set('q', draft);
          params.delete('page');            // a new search resets pagination
          return params;
        });
      }}
    >
      <label>
        Search <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button type="submit">Search</button>
    </form>
  );
}
```

### Pagination that survives a refresh

```tsx
function Pagination({ totalPages }: { totalPages: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');

  const goTo = (next: number) =>
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
      return params;
    });

  return (
    <nav aria-label="Pagination">
      <button type="button" disabled={page <= 1} onClick={() => goTo(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
        Next
      </button>
    </nav>
  );
}
```

### Tabs with deep links

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const tab = searchParams.get('tab') ?? 'overview';

<nav role="tablist">
  {['overview', 'specs', 'reviews'].map((name) => (
    <button
      key={name}
      role="tab"
      aria-selected={tab === name}
      onClick={() =>
        setSearchParams((previous) => {
          const params = new URLSearchParams(previous);
          params.set('tab', name);
          return params;
        }, { replace: name === 'overview' ? true : false })
      }
    >
      {name}
    </button>
  ))}
</nav>
```

### Multi-select filters

```tsx
const selected = searchParams.getAll('tag');            // ["audio","desk"]

function toggleTag(tag: string) {
  setSearchParams((previous) => {
    const params = new URLSearchParams(previous);
    const current = params.getAll('tag');
    params.delete('tag');                               // then re-add the new set
    const next = current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag];
    for (const value of next) params.append('tag', value);
    return params;
  });
}
```

---

## 9. What not to put in the URL

| Danger | Why | Instead |
| --- | --- | --- |
| tokens, passwords, API keys | URLs leak into history, logs, referrers, screenshots, analytics | cookies/headers (Part 14) |
| personal data (emails, ids of people) | same, plus compliance problems | opaque ids, server-side sessions |
| huge payloads | browsers and servers truncate long URLs (~2000 chars is the safe ceiling) | POST body, or store server-side and pass a key |
| "is the drawer open" | nobody wants to bookmark it; it pollutes history | React state |
| anything that must stay a secret from other users | the URL is public by design | authorisation on the server |

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `setSearchParams({ q: 'mouse' })` to change one parameter | every other parameter disappears (verified) | edit a copy of `previous` and return it |
| 2 | mutating `searchParams` directly | the URL never changes; UI flickers back | `new URLSearchParams(searchParams)` then set |
| 3 | pushing a history entry per keystroke | Back deletes one character at a time | `{ replace: true }` while typing |
| 4 | duplicating the URL value in `useState` | the two drift; refresh shows stale UI | read from `searchParams`, keep only a *draft* if you must |
| 5 | `Number(searchParams.get('page'))` with no validation | `NaN`, negative pages, absurd API calls | validate with an allowlist/range |
| 6 | writing defaults into the URL | `?sort=name&page=1` noise in every link | delete the parameter when it equals the default |
| 7 | forgetting to reset `page` when the search changes | "no results" on a page that no longer exists | `params.delete('page')` when the filter changes |
| 8 | calling `setSearchParams` several times in one handler | only the last call takes effect (no queueing) | build one `URLSearchParams` and call once |
| 9 | treating `searchParams.get()` as `undefined` | `?? ''` needed, `?.` misleading | it returns `string | null` |
| 10 | reading `window.location.search` directly | no re-render on change; breaks tests/basename | `useSearchParams()` |
| 11 | using the query string for resource identity | `/products?id=p-mouse` — no canonical URL, worse SEO | route params for identity |
| 12 | assuming the URL is private | secrets leak | never put secrets in a URL |

---

## 11. Best practices

1. **One source of truth**: the URL owns filters, sorting, pagination, and tabs; components derive from it.
2. **Push for meaningful choices, replace for typing** (section 5) — and tell users about it indirectly, by making Back do the expected thing.
3. **Always edit a copy**; never build a fresh object unless you intend to wipe everything.
4. **Validate with an allowlist** and apply defaults at read time.
5. **Keep URLs short and human-readable**: `/products?sort=price` beats `/products?sort=3&order=asc&f=1`.
6. **Delete what equals the default**, and delete empty values.
7. **Reset dependent parameters** (page, when the query changes) in the same update.
8. **Debounce network calls, not URL updates** — the URL can update per keystroke with `replace`; the fetch should lag behind (Part 7).
9. **Test the deep link**, not just the clicking: paste `?sort=price&tag=audio&page=2` into a fresh tab.
10. **Keep the real logic in pure functions** (`readSort`, `readPage`, `searchProducts`) so they can be unit-tested without a router (Part 13).

---

## 12. Practice

### Beginner — a sortable, searchable list

1. Build `/products` with a search box and three sort buttons (name, price, default), driven entirely by the query string.
2. Requirements: opening `/products?q=key&sort=price` in a fresh tab reproduces the screen exactly; clearing the box removes `q`; clicking "default" removes `sort`.
3. Use the browser Back button after (a) typing, and (b) sorting. Explain the difference using `useNavigationType()`.
4. Log `searchParams.toString()` on every render and confirm that nothing in the URL is written for default values.

### Intermediate — filters, pagination, and a reset button

1. Extend the page with `tag` (multi-select: audio, keyboards, accessories) and `page`.
2. Rules: changing the search or a tag resets `page` to 1; changing the page keeps every other filter; "Reset filters" removes `q`, `tag`, and `page` in **one** update.
3. Make every filter change a *push* except the search box (replace). Verify with Back: three steps back should undo tag → tag → sort.
4. Add a "3 filters active" badge derived from the URL (count the present parameters), and confirm it survives a refresh.
5. Break it on purpose: write `setSearchParams({ tag: 'audio' })` in the tag handler and observe that `q` and `page` vanish. Write the fix and the one-sentence rule.

### Challenge — the URL as the only state, with typed parsing

1. Create a `productFilters.ts` module with a typed schema and pure parsers:

```ts
// File: src/routes/productFilters.ts
export interface ProductFilters {
  query: string;
  sort: 'none' | 'name' | 'price';
  tags: string[];
  page: number;
  perPage: 10 | 25 | 50;
}

export const DEFAULT_FILTERS: ProductFilters = { query: '', sort: 'none', tags: [], page: 1, perPage: 25 };

export function parseFilters(searchParams: URLSearchParams): ProductFilters {
  const perPageRaw = Number(searchParams.get('perPage') ?? '25');
  return {
    query: searchParams.get('q') ?? '',
    sort: searchParams.get('sort') === 'name' || searchParams.get('sort') === 'price' ? (searchParams.get('sort') as 'name' | 'price') : 'none',
    tags: searchParams.getAll('tag').filter((tag) => ['audio', 'keyboards', 'accessories'].includes(tag)),
    page: Math.max(1, Number.isInteger(Number(searchParams.get('page'))) ? Number(searchParams.get('page')) : 1),
    perPage: perPageRaw === 10 || perPageRaw === 50 ? perPageRaw : 25,
  };
}

export function toSearchParams(filters: ProductFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query !== '') params.set('q', filters.query);
  if (filters.sort !== 'none') params.set('sort', filters.sort);
  for (const tag of filters.tags) params.append('tag', tag);
  if (filters.page !== 1) params.set('page', String(filters.page));
  if (filters.perPage !== 25) params.set('perPage', String(filters.perPage));
  return params;
}
```

2. Add `applyFilters(current: ProductFilters, patch: Partial<ProductFilters>): ProductFilters` that resets `page` to 1 whenever `query` or `tags` change.
3. Wire the page to `parseFilters`/`toSearchParams` and verify the two properties: **round-trip** (`parseFilters(toSearchParams(f))` equals `f` for defaults) and **idempotence** (pasting a URL twice gives the same screen).
4. Write three unit tests using plain Node (no DOM): defaults for an empty query string, clamping `page=0` and `perPage=999`, and dropping an unknown tag.
5. Then answer: why is this module easier to test than the component? (Hint: no router, no rendering, no fake DOM — Part 13.)

---

## 13. Solutions

### Beginner

```tsx
// File: src/routes/ProductsPage.tsx
import { useLocation, useSearchParams } from 'react-router';
import { formatMoney, searchProducts } from '../data/products';

type Sort = 'none' | 'name' | 'price';
const readSort = (value: string | null): Sort => (value === 'name' || value === 'price' ? value : 'none');

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const query = searchParams.get('q') ?? '';
  const sort = readSort(searchParams.get('sort'));
  const results = searchProducts(query, sort);

  function updateParam(key: 'q' | 'sort', value: string) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (value === '') params.delete(key);
        else params.set(key, value);
        return params;
      },
      { replace: key === 'q' },
    );
  }

  return (
    <section>
      <h1>Products</h1>
      <label>
        Search <input value={query} onChange={(event) => updateParam('q', event.target.value)} />
      </label>
      <p>
        <button type="button" onClick={() => updateParam('sort', 'name')}>name</button>{' '}
        <button type="button" onClick={() => updateParam('sort', 'price')}>price</button>{' '}
        <button type="button" onClick={() => updateParam('sort', '')}>default</button>
      </p>
      <p className="url">
        URL: {location.pathname}
        {location.search}
      </p>
      <ul>
        {results.map((product) => (
          <li key={product.id}>
            {product.name} — {formatMoney(product.priceMinor)}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

3. Typing uses `replace`, so Back leaves the page entirely (one entry for the whole search session, plus whatever came before); sorting uses push, so Back undoes the sort. That is the behaviour most users expect, and it is entirely your choice — but it must be a choice.

### Intermediate

```tsx
// The single-update reset, and the "reset page" rule.
function resetFilters() {
  setSearchParams(new URLSearchParams(), { replace: true });   // one update, everything gone
}

function toggleTag(tag: string) {
  setSearchParams((previous) => {
    const params = new URLSearchParams(previous);
    const current = params.getAll('tag');
    params.delete('tag');
    for (const value of current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]) params.append('tag', value);
    params.delete('page');                                    // a filter change resets pagination
    return params;
  });
}
```

5. `setSearchParams({ tag: 'audio' })` replaced the whole query string with `?tag=audio`, losing `q` and `page` (verified in section 4). The rule: **the object form is for building a query string from scratch; the callback form is for changing one thing.**

### Challenge

```ts
// File: src/routes/productFilters.ts (the function that encodes your product decisions)
export function applyFilters(current: ProductFilters, patch: Partial<ProductFilters>): ProductFilters {
  const next = { ...current, ...patch };
  const filtersChanged = patch.query !== undefined || patch.tags !== undefined;
  return filtersChanged ? { ...next, page: 1 } : next;
}
```

```ts
// File: src/routes/productFilters.test.ts — plain Node, no DOM (run with: npx tsx src/routes/productFilters.test.ts)
import { DEFAULT_FILTERS, parseFilters, toSearchParams, applyFilters } from './productFilters';

const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
};

check('empty query string → defaults', parseFilters(new URLSearchParams('')), DEFAULT_FILTERS);
check('page=0 clamps to 1', parseFilters(new URLSearchParams('page=0')).page, 1);
check('perPage=999 falls back to 25', parseFilters(new URLSearchParams('perPage=999')).perPage, 25);
check('unknown tag is dropped', parseFilters(new URLSearchParams('tag=audio&tag=<script>')).tags, ['audio']);
check('changing the query resets the page', applyFilters({ ...DEFAULT_FILTERS, page: 4 }, { query: 'mouse' }).page, 1);
check('round trip keeps defaults out of the URL', toSearchParams(DEFAULT_FILTERS).toString(), '');
```

5. The module has no router, no rendering, and no DOM — inputs are strings in, plain objects out, so a test is one line per case and runs in milliseconds. That is the general rule for anything you would otherwise have to test by clicking: **push logic out of components into pure functions.**

---

## 14. Summary

- The query string is the right home for **search terms, filters, sorting, pagination, and tabs** — anything that should survive a refresh and be shareable. Identity goes in route params; secrets and transient UI never go in the URL.
- `useSearchParams()` returns a **`URLSearchParams`** plus a setter. Values are `string | null`; defaults are applied **at read time**.
- The setter accepts a string, an object, an array of pairs, a `URLSearchParams`, or a **callback** — and the object/string forms **replace the whole query string** (verified: `q=key&sort=price&tag=audio&tag=desk` → `q=mouse`).
- **Edit a copy** of `previous` inside the callback; never mutate `searchParams`.
- **Typing replaces, choosing pushes** (verified: `type=REPLACE` for typing, `type=PUSH` for sorting) — that single decision is what makes Back behave.
- `useSearchParams(defaults)` gives you a default **without writing the URL** (verified); otherwise delete parameters that equal the default.
- `searchParams` is **stable across renders but mutable** (verified: same object on re-render) — mutate it and the URL silently stops matching your UI.
- `setSearchParams` does **not queue**; build the final `URLSearchParams` once and call it once.
- Keep the parsing logic in **pure functions** (`parseFilters`, `toSearchParams`, `applyFilters`) so it is unit-testable without a router.

---

**What's next →** [`06-nested-routes.md`](./06-nested-routes.md): `<Outlet/>` and layouts. Nesting routes so the sidebar, header, and tab bar stay mounted (verified: `same <nav> DOM node? true` across child navigations), index routes as "the default child", relative links (`to="edit"`, `to=".."`), breadcrumbs from `useMatches`, and when nesting *hurts* more than it helps.
