# 09 — Rendering Data

> **Part 3 · React Fundamentals · File 9 of 12**
> Why this file exists: "rendering data" sounds trivial — put the value in `{}` — until a price shows 19 decimals, a rating shows `4.499999999999999`, a date shows `Sat Sep 19 2026 05:00:00 GMT+0530 (India Standard Time)`, or a number you expected to see is hidden because it was `0`. This file is about turning data into *display* honestly and about the derived-value rule that keeps components simple.

---

## 1. Render values, not data structures

The most common runtime error in beginner React is putting an object in `{}`:

```tsx
const product = { id: 'p1', name: 'Mechanical Keyboard', priceMinor: 499900 };

return <p>{product}</p>;
```

```text
Error: Objects are not valid as a React child (found: object with keys {a}).
       If you meant to render a collection of children, use an array instead.
```

React renders **values**, and an object is not a value it knows how to show. The fix is always to choose *which* field you meant:

```tsx
<p>{product.name}</p>                        // a string
<p>{formatMoney(product.priceMinor)}</p>     // a formatted string
<p>{product.tags.join(', ')}</p>             // an array → string
<pre>{JSON.stringify(product, null, 2)}</pre> // debugging only
```

That last line is worth knowing: **`JSON.stringify` is a debugging tool, not a display strategy.** It is the fastest way to see what an API really returned while you are building, and it should never reach a user's screen.

A **`Date`** is an object too, so it hits the same rule. `{new Date()}` is a mistake; `{new Intl.DateTimeFormat(...).format(date)}` is the answer (§6).

---

## 2. What renders as what

| Value | Rendered | Notes |
| --- | --- | --- |
| `'₹4,999.00'` | `₹4,999.00` | Text is escaped |
| `4.5` | `4.5` | Numbers become text with the JS number-to-string rules |
| `0` | `0` | **Visible.** This is why `{count && …}` is a bug (file 10) |
| `NaN` | `NaN` | Visible — guard your arithmetic |
| `Infinity` | `Infinity` | Same |
| `''`, `null`, `undefined`, `false`, `true` | nothing | Booleans are never printed |
| `['a', 'b']` | `ab` | Arrays are joined without separators — usually *not* what you want; use `.join(', ')` |
| `{ a: 1 }`, `new Date()` | **error** | Objects are not valid children |
| a function | error/warning | Almost always a missing `< />` or missing `()` |

Two of those rows cause real production bugs:

```tsx
// ✗ array of strings renders as "keyboardmouse"
<p>{product.tags}</p>

// ✓
<p>{product.tags.join(', ')}</p>
```

```tsx
// ✗ NaN in the middle of a price
<span>{formatMoney(product.priceMinor / product.quantity)}</span>   // quantity 0 → NaN → "₹NaN"

// ✓ guard the division and show a placeholder
{product.quantity > 0 ? formatMoney(product.priceMinor / product.quantity) : '—'}
```

---

## 3. The derived-value rule

> **Compute derived values during render, before the JSX. Never store them in state.**

Our `PriceTag` is the smallest complete example:

```tsx
export function PriceTag({ priceMinor, compareAtMinor, size = 'sm' }: PriceTagProps) {
  const isDiscounted = compareAtMinor !== undefined && compareAtMinor > priceMinor;
  const savings = isDiscounted ? compareAtMinor - priceMinor : 0;

  return (
    <p className={`price price--${size}`}>
      <span className="price__now">{formatMoney(priceMinor)}</span>
      {isDiscounted && (
        <>
          <s className="price__was">{formatMoney(compareAtMinor)}</s>
          <span className="price__save">save {formatMoney(savings)}</span>
        </>
      )}
    </p>
  );
}
```

`isDiscounted` and `savings` are **local variables computed from props**. They cost one comparison and one subtraction per render — nothing — and they cannot be wrong, because there is no copy to keep in sync.

**The anti-pattern:**

```tsx
// ✗ two sources of truth, one of which is always stale
const [priceMinor, setPriceMinor] = useState(props.priceMinor);
const [isDiscounted, setIsDiscounted] = useState(false);        // must be updated everywhere
const [savings, setSavings] = useState(0);                      // …and everywhere again
```

Every setter call site must remember to recompute the two derived pieces. Miss one and the UI lies — the same failure mode as file 01's vanilla cart, reintroduced *inside* a React component. Rules that prevent it:

| Rule | Reason |
| --- | --- |
| Props and state are the only inputs; everything else is computed | One source of truth |
| Derived values are `const` inside the render | They are recreated every render anyway — that is free |
| If two values must agree, derive one from the other | They cannot drift |
| Only put a derived value in state if **recomputing it is expensive** — and then use `useMemo`, not state | Memoisation is a cache, not a second truth (Part 10) |
| Never sync state *to* props with an effect | That is derived data wearing a costume (Part 4, effects) |

### 3.1 A worked example from a real app

`App.tsx` computes everything it displays from three state values (`category`, `query`, `cartCount`) plus the module's data:

```tsx
const visible = useMemo(() => {
  const needle = query.trim().toLowerCase();
  return products.filter((product) => {
    const matchesCategory = category === 'all' || product.category === category;
    const matchesQuery =
      needle === '' ||
      product.name.toLowerCase().includes(needle) ||
      product.sku.toLowerCase().includes(needle);
    return matchesCategory && matchesQuery;
  });
}, [category, query]);

const counts = useMemo(() => {
  const base = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const product of products) base[product.category] += 1;
  return { all: products.length, ...base } as Record<CategoryChoice, number>;
}, []);
```

**Verified behaviour** of exactly that code, from the interaction harness:

```text
1. first paint (no filters)
   visible : Mechanical Keyboard, Wireless Mouse, 27" Monitor, 32" Curved Monitor,
             Studio Headphones, USB Microphone, 1TB NVMe SSD, 2TB Portable SSD
   footer  : Showing 8 of 8 products.

2. typed "ssd" and pressed Search
   visible : 1TB NVMe SSD, 2TB Portable SSD
   footer  : Showing 2 of 8 products.

3. then clicked the "Audio" chip (combined filters, no matches)
   visible : (none)
   footer  : Showing 0 of 8 products.
   empty   : No products match / Nothing matches “ssd” in this category.
```

Notice that the footer is **also** derived (`Showing {visible.length} of {products.length} products.`) — it was never updated by hand, and it agrees with the grid in every single line of that trace. In an imperative app, "the count and the list disagree" is the bug you fix every sprint.

### 3.2 Does every derived value need `useMemo`?

No. `useMemo` is for values whose **computation is expensive** (sorting/filtering thousands of rows, parsing, building an index), and it has its own cost: a dependency array to maintain and extra bookkeeping. Our `visible` filter is memoised because it processes the full catalogue on every keystroke — a genuine reason. Our `counts` is memoised because it is computed from the immutable module-level `products` and depends on nothing (`[]`), so computing it once is correct *and* self-documenting.

For anything cheaper than "a few thousand operations", compute it directly:

```tsx
const soldOut = product.stock <= 0;                              // just compute it
const label = value.toFixed(1);                                  // just compute it
const totalMinor = itemCount * PRICE_MINOR;                      // just compute it
```

Part 10 covers this properly — including how the React Compiler changes the calculus. The rule for now: **compute, and add `useMemo` only when you can say what is expensive about it.**

---

## 4. Where formatting lives: the data layer

`formatMoney` and `ratingPercent` live in `src/data/products.ts`, not inside a component:

```ts
/** ₹1,29,900.00 from 12990000 minor units. Never do money arithmetic in floats. */
export const formatMoney = (minor: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(minor / 100);

/** A value in 0..1 that CSS can use directly for a star rating bar. */
export const ratingPercent = (rating: number): number => Math.round((rating / 5) * 100);
```

**Verified outputs:**

```text
money 499900      : ₹4,999.00
money 0           : ₹0.00
money 12990000    : ₹1,29,900.00          ← Indian digit grouping (lakh)
```

Why the data layer and not a component:

| Reason | Detail |
| --- | --- |
| **Reuse** | Prices appear in cards, carts, invoices, emails, PDFs. Formatting must not depend on React |
| **Testability** | `expect(formatMoney(0)).toBe('₹0.00')` needs no DOM, no renderer (Part 13) |
| **Consistency** | One place decides currency, locale and rounding — otherwise three components format three ways |
| **Performance** | `new Intl.NumberFormat(...)` is not free; constructing it *once* per module (or caching formatters) beats constructing one per `PriceTag` per render |

> 💡 **Optimisation worth knowing:** in a list with 500 prices, `formatMoney` as written constructs 500 `Intl.NumberFormat` instances per render. The fix is to hoist the formatter:
> ```ts
> const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
> export const formatMoney = (minor: number): string => INR.format(minor / 100);
> ```
> `Intl.NumberFormat` instances are designed to be created once and reused. (Our lab version keeps the construction inside the function for readability — measured cost is negligible at 8 products, and this note is here so you know when it stops being negligible.)

---

## 5. Numbers in the UI: money, ratings, counts

### 5.1 Money: integers, always

Part 2's rule, now visible in real markup: **store money in minor units** (paise) and format for display.

```ts
priceMinor: 499900         // 499900 paise = ₹4,999.00
```

```text
0.1 + 0.2 === 0.30000000000000004        ← floating point
```

The consequence for UI: if you store `price: 4999.00` as a float and multiply by 3, the total may be `14996.999999999998`. Formatted to two decimals it *looks* fine; accumulated across a cart, an invoice and a tax calculation, it is wrong by paise — and finance teams care about paise. Integers avoid the entire class of problem.

- **Arithmetic** in minor units (`priceMinor * quantity`).
- **Division by 100** exactly once, at the display boundary.
- **`Intl.NumberFormat`** for grouping, currency symbol and locale rules — never hand-built string concatenation (`'₹' + (x/100).toFixed(2)` gets Indian grouping wrong: ₹1,29,900.00 is not ₹129,900.00).

### 5.2 Ratings and percentages: floats are fine to *display*

Our catalogue average is a float, and this is what it actually is:

```text
avgRating    : 4.499999999999999 -> 4.5
```

`4.499999999999999` on screen is unacceptable, so we round **for display only**, and the underlying value stays exact enough for sorting and averaging.

```tsx
const label = value.toFixed(1);         // "4.5"        (Rating.tsx)
const percent = ratingPercent(4.6);     // 92           (data/products.ts)
```

`toFixed` has a famous wrinkle — verified on this machine:

```text
toFixed(1) of 4.05: 4.0  |  4.25: 4.3  |  4.6: 4.6
```

`4.05` prints as `4.0` because the *stored* double is slightly below 4.05. This is the same floating-point reality as `0.1 + 0.2`, and the practical guidance is:

- **For display of an approximate value (a rating, a percentage): `toFixed` is fine.** Nobody is owed the third decimal of a star rating.
- **For anything that must be exact (money, quantities, serial numbers, totals): integers or a decimal library.** Never `toFixed` a price to "fix" rounding — that hides the bug and produces invoices that do not add up.

### 5.3 Counts and plurals

```tsx
// ✓ explicit: no pluralisation logic, no ambiguity
<span>({reviewCount} reviews)</span>          // "(1 reviews)" is ugly
```

Three ways to handle the singular/plural problem, in order of quality:

```tsx
// 1. Plural rules from Intl (correct for languages with more than 2 forms)
const rules = new Intl.PluralRules('en-IN');
const form = rules.select(count);             // 'one' | 'other' (verified: 1 → one, 2 → other)
const word = form === 'one' ? 'review' : 'reviews';
<span>({count} {word})</span>

// 2. A tiny helper — fine for English-only UIs and dead simple to read
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
<span>({plural(reviewCount, 'review', 'reviews')})</span>

// 3. A real i18n library — when you ship more than one language (Part 15/18)
```

Also useful for big numbers — compact notation (verified):

```text
compact 12800 : 12.8K
```

```tsx
new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(12_800)   // "12.8K"
```

Our lab deliberately does **not** use compact notation: "(128 reviews)" is more informative than "(128)" and a shop's review count is a trust signal. Compact formatting is for dashboards and large social counts.

---

## 6. Dates and times

A date is never "just a value" — it is a timezone, a locale and a format question.

```tsx
// ✗ rendering a Date object
<span>{new Date()}</span>                        // error: objects are not valid children

// ✗ rendering a raw ISO string to a human
<span>{order.createdAt}</span>                   // "2026-09-19T05:00:00.000Z"

// ✓ the ISO string is for DATA; the formatter is for DISPLAY
<span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(order.createdAt))}</span>
```

**Verified formats** for `2026-09-19T10:30:00+05:30`:

```text
date en-IN short : 19 Sept 2026, 10:30 am
date en-IN long  : Saturday, 19 September 2026
relative 3 days  : 3 days ago
relative 2 hours : 2 hours ago
```

Guidance that prevents most date bugs:

| Rule | Why |
| --- | --- |
| Store and transport dates as **ISO 8601 strings** or timestamps (UTC) | Unambiguous; sortable; serialisable in JSON |
| Convert to a `Date` and format **at the display boundary** | The client's timezone is the user's, not the server's |
| **Always** pass `timeZone` explicitly | Otherwise the output depends on the user's machine — great for local times, disastrous for "business dates" (a sale ends at 23:59 IST) |
| Format **durations** relatively (`Intl.RelativeTimeFormat`) | "3 days ago" beats "2026-09-16T04:34:00Z" for a last-updated stamp |
| Do not format dates in a `map` without hoisting the formatter | Same instance-reuse point as `Intl.NumberFormat` |
| Never parse date strings with `new Date('19-09-2026')` | Implementation-defined. Prefer `Temporal`/a library, or an explicit `Date.UTC` |

> 💡 A "last updated" line is a genuinely good use of `Intl.RelativeTimeFormat`, and it needs one helper — computing the difference in the right unit — which is a nice exercise at the end of this file.

---

## 7. Sorting, filtering, grouping

All three are **data operations**, so they belong before the JSX (or in the data layer) and never inside JSX markup.

```tsx
// ✓ compute, then render
const visible = products.filter((p) => category === 'all' || p.category === category);

// ✓ sorting a copy — never `products.sort(...)` on a shared array
const byPriceDesc = [...visible].sort((a, b) => b.priceMinor - a.priceMinor);
```

Verified results from our data:

```text
sorted by name       : 1TB NVMe SSD | 27" Monitor | 2TB Portable SSD
sorted by price desc : 32" Curved Monitor ₹24,999.00 | 27" Monitor ₹18,999.00
cheapest             : ₹1,299.00
dearest              : ₹24,999.00
byCategory           : input=2, display=2, audio=2, storage=2
inStock              : 4 | outOfStock: 4
```

Four rules that keep list logic honest:

1. **Never sort the array you were given.** `[...items].sort(...)` or `items.toSorted(...)` (a new array — supported in modern JS engines). `items.sort()` mutates the caller's data, which is exactly the prop-mutation bug from file 08, wearing a different hat.
2. **Comparators must be total and stable-ish.** `(a, b) => a.priceMinor - b.priceMinor` is fine for numbers. For strings use a collator (verified, and locale-aware):

   ```text
   sort de vs en-IN : Ähre, Apfel, Bär, zebra
   ```
   ```tsx
   const collator = new Intl.Collator('en-IN', { sensitivity: 'base' });
   const byName = [...visible].sort((a, b) => collator.compare(a.name, b.name));
   ```
3. **Never `return a.name > b.name`** — a boolean is not a comparator result. It "works" for two elements and produces nonsense for lists (the classic `Array.prototype.sort` footgun).
4. **Filter, then sort, then map.** Doing it in that order means the sort touches fewer items, and the pipeline reads as a sentence.

Grouping, using `reduce` into a `Map` (Part 1's tools appearing again):

```tsx
const byCategory = products.reduce<Record<Category, Product[]>>((groups, product) => {
  (groups[product.category] ??= []).push(product);
  return groups;
}, { input: [], display: [], audio: [], storage: [] });

// render
{CATEGORIES.map((category) => (
  <section key={category}>
    <h2>{CATEGORY_LABELS[category]}</h2>
    <ProductList products={byCategory[category]} onAddToCart={handleAddToCart} />
  </section>
))}
```

Note `CATEGORIES.map(...)` rather than `Object.entries(byCategory)`: iterating a **declared order** means the sections appear in a designed sequence, not in whatever order the object happens to have. Ordering is UI; make it explicit.

---

## 8. The data → screen pipeline in the lab

```text
src/data/products.ts          Product[]  (module constant, readonly)  + formatMoney + ratingPercent
        │
        │  App.tsx:  state (category, query, cartCount)
        │            derived: visible = filter(products)      [useMemo]
        │                     counts  = count per category    [useMemo]
        ▼
ProductList  props: products (readonly Product[]), onAddToCart, emptyMessage, compareAtFor
        │
        ▼
ProductCard  props: product, compareAtMinor, onAddToCart, featured
        ├── Rating      value={product.rating}  reviewCount={product.reviewCount}
        ├── PriceTag    priceMinor={product.priceMinor} compareAtMinor={compareAtMinor}
        ├── StockBadge  product={product}
        └── Tag         tag={tag}
```

Every arrow is data going **down** and events coming **up** (file 08), and every formatting decision happens at the leaves. The **verified** markup proves the pipeline end to end — a full `ProductCard` in stock and on sale:

```html
<article class="card" aria-labelledby="p1-name"><header class="card__header"><h3 id="p1-name" class="card__name">Mechanical Keyboard</h3><span class="card__sku">KBD-1</span></header><p class="card__category">Input devices</p><ul class="card__tags"><li><span class="tag tag--featured">hot<span aria-hidden="true"> ★</span></span></li><li><span class="tag">sale</span></li></ul><p class="rating"><span class="rating__track" role="img" aria-label="Rated 4.6 out of 5"><span class="rating__fill" style="width:92%"></span></span><span class="rating__value">4.6</span><span class="rating__count">(128 reviews)</span></p><p class="price price--sm"><span class="price__now">₹4,999.00</span><s class="price__was">₹5,999.00</s><span class="price__save">save ₹1,000.00</span></p><span class="badge badge--in">In stock</span><button type="button" class="card__cta">Add to cart</button></article>
```

and the same component for a sold-out item:

```html
<article class="card" aria-labelledby="p2-name">… <p class="rating">…<span class="rating__count">(0 reviews)</span></p><p class="price price--sm"><span class="price__now">₹1,299.00</span></p><span class="badge badge--out">Sold out</span><button type="button" class="card__cta" disabled="">Notify me</button></article>
```

Read the differences: no `<s>`/`save` line (no compare-at price), `(0 reviews)` is shown (zero is information), the badge text changes, and the button becomes `disabled` with a different label. **All four differences come from data**, with no `if` statements in the parent and no DOM manipulation anywhere.

---

## 9. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Storing a derived value in state | It goes stale; two sources of truth disagree | Compute during render (§3) |
| Syncing state from props with an effect | First render is wrong; extra renders; loops | Derive instead; lift state; or use a `key` to remount (§3, Part 4) |
| `{object}` in JSX | *"Objects are not valid as a React child"* | Pick fields; `JSON.stringify` only for debugging |
| Rendering a `Date` object | Same object error | `Intl.DateTimeFormat` at the display boundary |
| `{price / 100}` with a float price in the data | Off-by-a-paise totals; ₹0.30 style bugs | Minor units + integer arithmetic |
| Locale-less formatting (`toLocaleString()` with no args) | The date/number depends on the tester's machine; tests pass locally, fail in CI | Pass an explicit locale and `timeZone` |
| `toFixed` on money | Hides a real rounding bug | Integers; format only at the edge |
| `items.sort()` | The parent's array is reordered; other lists change too | `[...items].sort(...)` / `toSorted` |
| `sort((a, b) => a.price > b.price)` | Random-looking order for >2 items | Return a number (`a.price - b.price` or `collator.compare`) |
| Formatting inside a `map` with a new formatter each time | Slow lists; GC churn | Hoist the formatter |
| Array of strings rendered directly | `"keyboardmouse"` | `.join(', ')` or an explicit list (file 11) |
| `{count && …}` for a numeric count | A stray `0` | Compare explicitly: `count > 0` (file 10) |
| Building numbers into strings by hand (`'₹' + x`) | Wrong grouping, wrong decimals, no locale | `Intl.NumberFormat` |

---

## 10. Best practices

1. **One source of truth.** Inputs are props + state; everything else is computed.
2. **Compute before JSX**, in `const` bindings with names that read like facts (`isDiscounted`, `soldOut`, `savings`).
3. **`useMemo` only for genuinely expensive work**; say out loud what is expensive about it.
4. **Formatting lives in the data layer** (`formatMoney`, `formatDate`, `plural`), is pure, and is reused everywhere.
5. **Money in minor units**; divide by 100 exactly once, at display time.
6. **Dates: ISO in the data, `Intl` at the boundary**, with an explicit `timeZone`.
7. **Explicit locale in every formatter** — never rely on the machine's default.
8. **Treat `0`, `''`, `null` and `undefined` as distinct** and decide what each should show (a value, a dash, or nothing).
9. **Sort copies, compare with numbers or collators, filter → sort → map.**
10. **Let the data decide the markup** (badge text, disabled state, discount line) instead of scattering `if`s through parents.
11. **Numbers that matter are never floats**: money, quantities, totals, ids.

---

## 11. Practice

### Beginner

1. Build a `CatalogueStats` strip that shows: the number of products, the average rating (1 decimal), the total catalogue value in ₹, and how many are in stock. Use the lab's `products`, `formatMoney` and your own derived values.
2. Add a "cheapest / dearest" pair using `Math.min`/`Math.max` over `priceMinor`.

**Solution**

```tsx
// src/components/CatalogueStats.tsx
import { formatMoney, products } from '../data/products';

export function CatalogueStats() {
  const count = products.length;
  const averageRating = products.reduce((sum, p) => sum + p.rating, 0) / count;
  const totalMinor = products.reduce((sum, p) => sum + p.priceMinor, 0);
  const inStock = products.filter((p) => p.stock > 0).length;
  const cheapestMinor = Math.min(...products.map((p) => p.priceMinor));
  const dearestMinor = Math.max(...products.map((p) => p.priceMinor));

  return (
    <dl className="stats">
      <div><dt>Products</dt><dd>{count}</dd></div>
      <div><dt>Average rating</dt><dd>{averageRating.toFixed(1)}</dd></div>
      <div><dt>Catalogue value</dt><dd>{formatMoney(totalMinor)}</dd></div>
      <div><dt>In stock</dt><dd>{inStock} of {count}</dd></div>
      <div><dt>Cheapest</dt><dd>{formatMoney(cheapestMinor)}</dd></div>
      <div><dt>Dearest</dt><dd>{formatMoney(dearestMinor)}</dd></div>
    </dl>
  );
}
```

**Verified values** for the lab data (produced by running exactly these computations):

```text
count        : 8
avgRating    : 4.499999999999999 -> 4.5
totalMinor   : 8679200 -> ₹86,792.00
inStock      : 4 | outOfStock: 4
cheapest     : ₹1,299.00
dearest      : ₹24,999.00
```

Two things to notice: the raw average is `4.499999999999999` and `.toFixed(1)` turns it into the `4.5` a human expects (the float rules of §5.2); and `totalMinor` is summed as **integers** and divided by 100 only inside `formatMoney`, which is why the ₹ amount is exact rather than `86791.99999999999`.

### Intermediate

Build a `<RelativeTime date={isoString} />` component that renders "3 days ago"-style text using `Intl.RelativeTimeFormat`, choosing the largest sensible unit (years → months → weeks → days → hours → minutes → seconds). Render it twice: once with a date 3 days ago and once with a date 2 hours ago.

**Solution**

```tsx
// src/components/RelativeTime.tsx
export interface RelativeTimeProps {
  /** An ISO 8601 timestamp, e.g. "2026-09-16T04:34:00.000Z". */
  iso: string;
  /** Injected for tests; defaults to now. */
  now?: Date;
}

const UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

export function RelativeTime({ iso, now = new Date() }: RelativeTimeProps) {
  const then = new Date(iso);
  const diffMs = then.getTime() - now.getTime();                      // negative = in the past

  const chosen = UNITS.find(({ ms }) => Math.abs(diffMs) >= ms) ?? UNITS[UNITS.length - 1]!;
  const value = Math.round(diffMs / chosen.ms);

  const formatted = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' }).format(value, chosen.unit);

  return <time dateTime={iso} title={then.toISOString()}>{formatted}</time>;
}
```

**Verified outputs** for the two requested cases:

```text
relative 3 days  : 3 days ago
relative 2 hours : 2 hours ago
```

Design notes worth defending: the `now` prop makes the component **testable** (inject a fixed "now" and the output is deterministic — Part 13), the `<time dateTime={iso}>` element carries the machine-readable value for accessibility and parsing, and `title` gives the exact timestamp on hover. Note also the use of `Intl.RelativeTimeFormatUnit` — a *type* exported from lib.dom that keeps the unit strings honest, so `format(value, 'days')` (plural) is a compile error.

### Challenge

Implement a `sortProducts(products, sortKey, direction)` helper with keys `'name' | 'price' | 'rating' | 'stock'`, using a collator for names, and then render the list sorted by rating descending. Then explain why the helper takes `readonly Product[]` and returns a new array.

**Solution**

```ts
// src/data/sorting.ts
import type { Product } from './products';

export type SortKey = 'name' | 'price' | 'rating' | 'stock';
export type SortDirection = 'asc' | 'desc';

const collator = new Intl.Collator('en-IN', { sensitivity: 'base', numeric: true });

const COMPARATORS: Record<SortKey, (a: Product, b: Product) => number> = {
  name: (a, b) => collator.compare(a.name, b.name),
  price: (a, b) => a.priceMinor - b.priceMinor,
  rating: (a, b) => a.rating - b.rating,
  stock: (a, b) => a.stock - b.stock,
};

/**
 * Returns a NEW sorted array; the input is never mutated (it is `readonly`).
 * Ties fall back to name so the order is stable and predictable.
 */
export function sortProducts(
  products: readonly Product[],
  key: SortKey,
  direction: SortDirection = 'asc',
): Product[] {
  const compare = COMPARATORS[key];
  const sign = direction === 'asc' ? 1 : -1;

  return [...products].sort((a, b) => {
    const primary = compare(a, b) * sign;
    return primary !== 0 ? primary : collator.compare(a.name, b.name);
  });
}
```

```tsx
// usage
const visible = useMemo(() => sortProducts(products, 'rating', 'desc'), []);
…
<ProductList products={visible} onAddToCart={handleAddToCart} />
```

**Verified data facts** the sort operates on: 8 products, ratings from 4.1 to 4.9, prices from ₹1,299.00 to ₹24,999.00, and 4 in stock of 8. With `sortProducts(products, 'rating', 'desc')` the first two rows are the 1TB NVMe SSD (4.9) and the 27" Monitor (4.8).

Why the signature is `readonly Product[] → Product[]`:

- `readonly` in the parameter means the helper **cannot** call `.sort()` in place on the caller's array — the compiler enforces it (`TS2339`/`TS2540` on `sort`). Sorting a shared module-level array would silently reorder every other list in the app (and, in a real app, any other component that had already captured a reference).
- Returning `Product[]` (mutable, a fresh array) is useful and honest: it is a value the caller now owns and may further filter or reverse.
- `Record<SortKey, (a, b) => number>` is the "make illegal states unrepresentable" pattern again: adding `'discount'` to `SortKey` without adding a comparator is a **compile error**, not a runtime crash on click.

---

## 12. Summary

- React renders **values**: strings, numbers, elements, arrays, `null`/`undefined`/booleans (nothing), and **not objects** (`Date` included). Pick fields; `JSON.stringify` is a debugging tool.
- **Derived values are computed during render**, never stored in state. This is the single rule that prevents the "the screen disagrees with the data" class of bug, and it is the React version of file 01's lesson.
- `useMemo` is for **expensive** computation only; plain `const` arithmetic is not expensive.
- **Formatting belongs in the data layer**: pure functions, unit-testable without a DOM, one place per concern. `formatMoney`, `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, `Intl.Collator`, `Intl.PluralRules`.
- **Money is integers (minor units)**; floats are for display-only approximations like ratings — and `toFixed` shows the fingerprint of floating point (`4.05 → "4.0"`).
- **Dates**: ISO strings in the data, `Intl` with an explicit `timeZone` at the boundary, relative formatting for "last updated".
- **Sorting/filtering/grouping**: filter → sort → map, sort copies, compare with numbers or collators, iterate declared orders.
- `0`, `''`, `null`, `undefined` are four different things; decide what each displays.

---

**What's next →** [`10-conditional-rendering.md`](./10-conditional-rendering.md)
