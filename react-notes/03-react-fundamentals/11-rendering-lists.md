# 11 — Rendering Lists (and Why `key` Matters)

> **Part 3 · React Fundamentals · File 11 of 12**
> Why this file exists: rendering a list is the first thing every React developer does and the first thing they get subtly wrong. `key` is not a formality React nags about — it is how React decides *which row is which row*, and getting it wrong produces bugs that look like data corruption. This file shows the bugs, with real output.

---

## 1. The tool is `Array.prototype.map`

You do not write loops in JSX; you write `map`, because JSX children are *values* and `map` returns an array of values (file 05 §2.1).

```tsx
// ✗ a `for` loop cannot be used inside JSX (statements are not expressions)
<ul>
  {for (const product of products) { <li>{product.name}</li> }}
</ul>

// ✗ `forEach` returns undefined — nothing renders, and TypeScript shows no error
<ul>
  {products.forEach((product) => <li>{product.name}</li>)}
</ul>

// ✓ `map` returns a new array of elements, which React renders in order
<ul>
  {products.map((product) => (
    <li key={product.id}>{product.name}</li>
  ))}
</ul>
```

| Method | Returns | Renders a list? |
| --- | --- | --- |
| `map` | a new array of the same length | ✓ Yes |
| `filter` | a shorter array | ✓ If you map afterwards |
| `forEach` | `undefined` | ✗ Never |
| `reduce` | anything you want | Only if you build an array |
| `sort` | the same array, reordered (mutates!) | ✓ Use `[...items].sort(...)` (file 09 §7) |

`map` also requires the callback's return value, which is why the arrow body must be an expression (`(p) => <li/>`) or a `return`:

```tsx
// ✓ implicit return (parentheses are cosmetic, but they align the JSX nicely)
{products.map((product) => (
  <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} />
))}

// ✗ curly braces without `return` → every item is undefined and renders nothing
{products.map((product) => {
  <ProductCard product={product} />
})}
```

That second form is a very common mistake because it *looks* right: the callback returns `undefined`, React renders nothing, and there is no error — until you notice the empty list. TypeScript does not catch it either (an arrow returning `undefined` is a legal callback for `map`). Some teams enable the `array-callback-return` lint rule for exactly this.

---

## 2. `key`: what React actually uses it for

React needs to match **this render's** elements to **last render's** instances (file 07 §1.1). For a fixed list, position is enough. For a list that can change order, grow or shrink, position is *not* enough — React needs a name for each item.

```text
Render 1:  [ <li key="p1">Keyboard</li>, <li key="p2">Mouse</li> ]
Render 2:  [ <li key="p2">Mouse</li>,    <li key="p1">Keyboard</li> ]
                 ▲ same keys, different order
React: "the instance that was 'p2' is now first — move its DOM node and keep its state."
```

Without keys, React can only compare by position, and it will **reuse the first DOM node for whatever is first now**. The node keeps its state (typed text, focus, scroll, internal component state) while its *content* changes to the new item's data.

### 2.1 The bug, demonstrated

Our probe renders two rows, each containing an uncontrolled `<input>`, types into the first row, then **reverses** the array. The data is identical; only the order changed.

```tsx
// index as key
{items.map((item, index) => <li key={index}>{item.name} <input /></li>)}
```

**Expected result — the typed text stayed put while the data moved:**

```text
index keys : ["Laptop  [input=\"typed in row 1\"]", "Phone  [input=\"\"]"]
```

Row 1 now says **Laptop** but contains the text that was typed into the **Phone** row. In a real app this is: a form field that jumps to the wrong customer, a toggled row that toggles the wrong item, an expanded accordion that expands the wrong entry. Nobody catches this in code review; it shows up as "the app sometimes mixes up rows".

```tsx
// id as key
{items.map((item) => <li key={item.id}>{item.name} <input /></li>)}
```

**Expected result — the row (and its text) moved together:**

```text
id keys    : ["Laptop  [input=\"\"]", "Phone  [input=\"typed in row 1\"]"]
```

### 2.2 The other failure modes, all verified

**Missing keys** — React warns in development (client renderer) and falls back to position:

```text
Each child in a list should have a unique "key" prop. Check the top-level render call using <ul>.
See https://react.dev/link/warning-keys for more information.
```

**Duplicate keys** — React warns and the behaviour is officially "unsupported":

```text
Encountered two children with the same key, `same`. Keys should be unique so that components maintain
their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted —
the behavior is unsupported and could change in a future version.
```

An empty array of duplicate keys is a real production case: `keys={product.tags}` where two products share a tag, or `key={item.category}` where several items share a category.

**Random keys** (`key={Math.random()}`) — every render creates new identities, so React throws away every row and builds new ones. Verified: after one parent re-render, the typed text in the row was gone (`input value is ""`). In a real app: focus jumps out of the field you are typing in, animations restart, and any component state in the row is destroyed — on *every* render.

**Keys must be unique among siblings only.** Verified: a `<ul>` and an `<ol>` that both use `key="keyboard"`, `key="mouse"`, `key="monitor"` produce **no warning**, because they are different parents. Keys are not global.

---

## 3. Choosing a key

| Candidate | Verdict | Why |
| --- | --- | --- |
| **A stable id from the data** (`product.id`, `user.id`, `sku`) | ✅ Always the right answer | It *is* the identity of the item, independent of order and content |
| A stable unique string (slug, ISO timestamp + id) | ✅ Fine | Same reasoning; just make sure it is actually unique |
| A natural key (`countryCode`, `currencyCode`) | ✅ If truly unique | Uniqueness is the whole requirement |
| **Array index** | ⚠️ Only for static lists | The index is a *position*, not an identity. Breaks on reorder, insert, delete, filter, sort |
| A value that can repeat (`category`, `tag`, `price`) | ❌ | Duplicate-key warning; identity confusion |
| `Math.random()` / `Date.now()` / an incrementing counter in render | ❌ | A new identity every render → the entire list is rebuilt |
| `JSON.stringify(item)` | ⚠️ | Works, but ties identity to content: editing a field makes it "a different row" and resets its state. Also slow for big objects |

**When is the index acceptable?** Only when all three are true:

1. the list never reorders, filters, sorts or paginates;
2. items are never inserted or removed anywhere except the end;
3. the items are *identical in kind* (a static row of labels, a fixed 12-month table, a skeleton of placeholders).

A static footer of navigation links is fine with index keys. A product grid that the user can sort is not. When in doubt, spend the 20 seconds to find (or create) an id.

**The rule for positioning the key:** put it on the **outermost element returned by the callback**.

```tsx
// ✓ key on the top-level element of each mapped item
{products.map((product) => <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} />)}

// ✗ key on a child inside the item: React sees the mapped array as un-keyed
{products.map((product) => <li><span key={product.id}>{product.name}</span></li>)}
```

Keys are **not props** — the component cannot read them (verified in file 06 §7). If a component needs the id, pass it as a real prop (which you usually already do: `product.id` lives inside `product`).

---

## 4. The list patterns you will actually write

### 4.1 A list of components (the default)

```tsx
// src/components/ProductList.tsx — real lab code
export function ProductList({ products, onAddToCart, emptyMessage, compareAtFor }: ProductListProps) {
  if (products.length === 0) {
    return <EmptyState title="No products match" message={emptyMessage ?? 'Try clearing the filters.'} />;
  }

  return (
    <section className="grid" aria-label="Products">
      {products.map((product) => (
        // `key` goes on the OUTERMOST element returned by the callback, and it
        // must be stable and unique — product.id, never the map index.
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={onAddToCart}
          compareAtMinor={compareAtFor?.(product)}
        />
      ))}
    </section>
  );
}
```

**Verified output** (two products, real markup):

```html
<section class="grid" aria-label="Products"><article class="card" aria-labelledby="p5-name">…Studio Headphones…</article><article class="card" aria-labelledby="p3-name">…27&quot; Monitor…</article></section>
```

Note: the empty case is an **early return**, so the mapping code never runs on an empty array — and, crucially, `<ul>`/`<section>` is not rendered at all when there is nothing to show. An empty `<section aria-label="Products">` is noise for assistive tech.

### 4.2 A list of primitives

```tsx
// src/components/ProductCard.tsx — tags are strings
{product.tags.length > 0 && (
  <ul className="card__tags">
    {product.tags.map((tag) => (
      <li key={tag}>
        <Tag tag={tag} />
      </li>
    ))}
  </ul>
)}
```

Here the string *is* the identity — tags are unique within a product, so `key={tag}` is correct. If duplicates were possible (a product with the same tag twice), the key would need to be a composite: `key={`${product.id}-${tag}`}`.

### 4.3 A list of a fixed set of choices

```tsx
// src/components/CategoryFilter.tsx — real lab code
const CHOICES: readonly CategoryChoice[] = ['all', ...CATEGORIES];

{CHOICES.map((choice) => {
  const label = choice === 'all' ? 'All' : CATEGORY_LABELS[choice];
  const active = choice === value;
  return (
    <button
      key={choice}
      type="button"
      className={active ? 'chip chip--active' : 'chip'}
      aria-pressed={active}
      onClick={() => onChange(choice)}
    >
      {label}
      <span className="chip__count">{counts[choice]}</span>
    </button>
  );
})}
```

The list is generated from a **module constant**, so the order is designed and stable, and the key is the choice itself (unique by construction — it comes from a union). **Verified output:**

```html
<div class="filters" role="group" aria-label="Filter by category"><button type="button" class="chip chip--active" aria-pressed="true">All<span class="chip__count">8</span></button><button type="button" class="chip" aria-pressed="false">Input devices<span class="chip__count">2</span></button>…</div>
```

Note the callback body uses **braces with an explicit `return`** — because it computes three locals before returning JSX. That is the legitimate version of the "curly brace" form from §1; the bug there was *forgetting* the `return`.

### 4.4 A list of rows extracted into a component

When a row's markup grows, extract it. This is where the keys earn their keep *structurally*, because the row component now has its own state:

```tsx
// src/components/ProductRow.tsx
export interface ProductRowProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export function ProductRow({ product, onAddToCart }: ProductRowProps) {
  const [expanded, setExpanded] = useState(false);      // ← state per row, identified by key
  return (
    <li className="row">
      <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
        {product.name}
      </button>
      {expanded && <p className="row__details">{product.sku}</p>}
      <button type="button" onClick={() => onAddToCart(product)}>Add</button>
    </li>
  );
}
```

```tsx
<ul className="rows">
  {products.map((product) => (
    <ProductRow key={product.id} product={product} onAddToCart={onAddToCart} />
  ))}
</ul>
```

With `key={product.id}`, each row's `expanded` state stays with its product when the list is sorted or filtered. With `key={index}`, expanding "Phone" and then sorting by price would leave a *different* product expanded — the same class of bug as §2.1, now with React state instead of DOM state.

### 4.5 Fragments as list items (multiple elements per row, no wrapper)

Sometimes an item must render two sibling elements (a `<dt>`/`<dd>` pair, or a `<tr>` plus a sibling). A `<div>` wrapper would be invalid or break layout, so use a **keyed fragment**:

```tsx
import { Fragment } from 'react';

<dl className="specs">
  {specs.map((spec) => (
    <Fragment key={spec.term}>
      <dt>{spec.term}</dt>
      <dd>{spec.value}</dd>
    </Fragment>
  ))}
</dl>
```

**Verified output** — no wrapper element, both children present:

```html
<dl><dt>Weight</dt><dd>1.2 kg</dd><dt>Warranty</dt><dd>2 years</dd></dl>
```

(`<Fragment key={…}>` is the only way to pass a key to a fragment; the shorthand `<></>` cannot take props.)

### 4.6 Lists from `Map`, `Set` and records

`Array.from` converts an iterable to an array you can `map`:

```tsx
const grouped = new Map<Category, Product[]>();
…
{[...grouped].map(([category, items]) => (
  <section key={category}>
    <h2>{CATEGORY_LABELS[category]}</h2>
    <ProductList products={items} onAddToCart={onAddToCart} />
  </section>
))}
```

For records (plain objects), `Object.entries` gives you key/value pairs — and remember Part 2's rule that `Record<K, V>` (unlike an interface) has the index signature that makes this well-typed:

```tsx
{Object.entries(counts).map(([choice, count]) => (
  <li key={choice}>{choice}: {count}</li>
))}
```

> 💡 **Prefer iterating a declared order.** `Object.entries(counts)` iterates in insertion order, which is an implementation detail of how the object was built. For UI where order matters, iterate the *declared* array (`CATEGORIES.map(...)`) and look values up by key — that is what `CategoryFilter` does, and why the chips always appear in the designed order.

### 4.7 Nested lists

Keys must be unique **among siblings**, so nested lists each have their own namespace:

```tsx
{CATEGORIES.map((category) => (
  <section key={category}>                          {/* outer key: category */}
    <h2>{CATEGORY_LABELS[category]}</h2>
    <ul>
      {byCategory[category].map((product) => (
        <li key={product.id}>{product.name}</li>     {/* inner key: product id */}
      ))}
    </ul>
  </section>
))}
```

Using `product.id` inside and `category` outside is fine even if ids and categories could collide — they are siblings-scoped, and they do not collide here anyway.

---

## 5. Lists, filters and sorts together

The pipeline from file 09 is what feeds the list, and **the key must not change when the order does**:

```tsx
const visible = products.filter(matches);                  // same objects, possibly fewer
const sorted = [...visible].sort(byPriceAsc);              // same objects, new order
return <ProductList products={sorted} onAddToCart={onAddToCart} />;
```

`product.id` is stable across both operations, so React *moves* DOM nodes instead of recreating them: focus, scroll position and component state follow the item. This is the practical payoff of the whole file — **a correct key makes filtering and sorting cheap and bug-free; a wrong key makes them subtly destructive.**

If you ever need to *reset* per-row state when a filter changes (for example, collapse all expanded rows when the category changes), do it deliberately:

```tsx
<ProductList key={category} products={visible} onAddToCart={onAddToCart} />
```

Changing the list's own `key` unmounts and remounts the whole subtree — a legitimate technique, and the same `key`-as-reset trick from file 10 §6.1.

---

## 6. Performance: what actually matters

| Concern | Reality |
| --- | --- |
| Rendering 50–500 rows | A non-issue. React handles it; do not optimise |
| Rendering 10,000 rows | The DOM itself is the bottleneck (10k nodes is a lot of layout work), not React's diffing |
| The fix for huge lists | **Windowed rendering** (virtualisation): render only the visible ~20 rows and recycle them. Libraries: `react-window`, `@tanstack/react-virtual` (Part 10) |
| Cheaper alternative for big data | Paginate or "load more" — usually better UX and simpler than virtualisation |
| Keys | Correct keys make updates cheap. Index keys on a reordering list make updates *wrong*, which is worse than slow |
| Inline work in `map` | `products.map((p) => <Row stats={analyse(p)} />)` recomputes `analyse` for every row on every render. Hoist it: precompute a `Map<id, Stats>` once (Part 10) |
| Row components | Extracting a `Row` component lets it be memoised individually later (Part 10). It also makes the code readable — start there and stop unless you measure a problem |

```tsx
// ✗ O(n) expensive work per render, plus a new object per row per render
{products.map((p) => <ProductRow key={p.id} product={p} stats={analyse(p)} />)}

// ✓ compute once per data change, look up per row
const statsById = useMemo(() => new Map(products.map((p) => [p.id, analyse(p)])), [products]);
{products.map((p) => <ProductRow key={p.id} product={p} stats={statsById.get(p.id)!} />)}
```

---

## 7. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| No key | Dev warning; reorder bugs | `key={item.id}` |
| `key={index}` with a mutable list | Rows keep the wrong state/DOM; inputs swap content (verified) | Use a stable id |
| Duplicate keys (`key={item.category}`) | Warning; duplicated/omitted children | Find a unique field, or compose one: `` `${item.a}-${item.b}` `` |
| `key={Math.random()}` | Every render rebuilds the list; typed text and focus lost (verified) | Stable id |
| Key on an inner element | React still sees un-keyed children | Key the outermost element the callback returns |
| `forEach` instead of `map` | Nothing renders, no error | `map` |
| `map` with braces but no `return` | Nothing renders, no error | Add `return`, or use the implicit-return form |
| `items.sort()` in the render path | The prop array is mutated; other lists reorder | `[...items].sort(...)` (file 09) |
| Rendering the whole array as text (`{items}`) | `"a,b,c"` or objects joined weirdly | `map` + a key |
| Keying by content (`key={JSON.stringify(item)}`) | Editing a field resets the row's state | Key by identity |
| No empty-state handling | An empty grid with no explanation | Early return with `EmptyState` (verified output in §4.1) |
| Rendering `<ul>` with non-`<li>` children | Invalid HTML, layout surprises | `<li>` per item (with a key), or use `role="list"` on a `div` in CSS-only list patterns |
| Duplicate accessibility labels in lists | Screen readers announce "Add to cart" ten times with no context | Include the item in the label: `aria-label={`Add ${product.name} to cart`}` |

---

## 8. Best practices

1. **`map` + a stable key**, every time. Put the key on the outermost element the callback returns.
2. **Prefer ids from the data**; use the index only for genuinely static lists.
3. **Handle the empty case explicitly** (early return, `EmptyState`) — an empty list is a *state*, not an accident.
4. **Extract a row component** when a row has behaviour or local state; the key then identifies that state.
5. **Convert iterables with `Array.from`/`[...map]`** and iterate declared orders for anything order-sensitive.
6. **Filter → sort → map**, with the key stable across all three.
7. **Extract expensive per-row work** out of the `map` callback, and memoise it against the data.
8. **Do not virtualise prematurely** — paginate or "load more" first; virtualise at 1000+ rendered rows.
9. **Keep accessibility per item**: unique `aria-label`s that include the item's name, and `aria-expanded`/`aria-pressed` on toggle controls.
10. **Never mutate the array you render** — always produce a new one.

---

## 9. Practice

### Beginner

1. Render the lab's `products` as a `<ul>` of names, then add the price and a stock note per row.
2. Deliberately break it three ways and read each result: remove the key (warning), use `key={0}` for all rows (duplicate warning), use `forEach` (nothing renders).

**Solution**

```tsx
import { formatMoney, products } from '../data/products';

export function SimpleProductList() {
  return (
    <ul className="simple-list">
      {products.map((product) => (
        <li key={product.id}>
          {product.name} — {formatMoney(product.priceMinor)}
          {product.stock === 0 && <em> (sold out)</em>}
        </li>
      ))}
    </ul>
  );
}
```

**Verified data** you can check your output against: 8 products; prices from ₹1,299.00 (Wireless Mouse) to ₹24,999.00 (32" Curved Monitor); exactly 4 with `stock === 0` (Wireless Mouse, 32" Curved Monitor, USB Microphone, 2TB Portable SSD) — so four rows should show "(sold out)". The `stock === 0` comparison (not `!product.stock`) is the file 10 rule: `!0` is true, but so is `!NaN`, and `=== 0` says what you mean.

### Intermediate

Build `OrderSummary` that renders an order's lines with a subtotal, and a "remove line" button per row. The lines come from state, and removing must not disturb the other rows' state (each row has a quantity input).

**Solution**

```tsx
// src/components/OrderSummary.tsx
import { useState } from 'react';
import { formatMoney } from '../data/products';

export interface OrderLine {
  id: string;
  name: string;
  unitMinor: number;
  quantity: number;
}

export function OrderSummary() {
  const [lines, setLines] = useState<OrderLine[]>([
    { id: 'l1', name: 'Mechanical Keyboard', unitMinor: 499900, quantity: 1 },
    { id: 'l2', name: 'Wireless Mouse', unitMinor: 129900, quantity: 2 },
    { id: 'l3', name: 'USB Microphone', unitMinor: 349900, quantity: 1 },
  ]);

  const subtotalMinor = lines.reduce((sum, line) => sum + line.unitMinor * line.quantity, 0);

  const removeLine = (id: string) => {
    setLines((current) => current.filter((line) => line.id !== id));   // a NEW array
  };

  const setQuantity = (id: string, quantity: number) => {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, quantity: Math.max(1, quantity) } : line)),
    );
  };

  if (lines.length === 0) {
    return <p className="order order--empty">Your order is empty.</p>;
  }

  return (
    <div className="order">
      <ul className="order__lines">
        {lines.map((line) => (
          // key = the line's identity. Removing "l1" cannot shift another line's state.
          <li className="order__line" key={line.id}>
            <span className="order__name">{line.name}</span>
            <label>
              Quantity
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(event) => setQuantity(line.id, Number(event.currentTarget.value))}
              />
            </label>
            <span className="order__amount">{formatMoney(line.unitMinor * line.quantity)}</span>
            <button type="button" onClick={() => removeLine(line.id)} aria-label={`Remove ${line.name}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <p className="order__subtotal">Subtotal: <strong>{formatMoney(subtotalMinor)}</strong></p>
    </div>
  );
}
```

**Verified arithmetic** for the initial data (computed with the real `formatMoney`):

```text
1 × ₹4,999.00 = ₹4,999.00
2 × ₹1,299.00 = ₹2,598.00
1 × ₹3,499.00 = ₹3,499.00
subtotal (minor units) = 1_109_600  →  ₹11,096.00
```

Why this is correct, in the language of this file: `line.id` is a stable identity, so removing line 2 leaves line 3's input untouched (with `key={index}`, removing line 2 would shift line 3 into line 2's instance and its typed quantity would appear under the wrong name). `setLines` always produces a **new array** (and a new object for the changed line) — the file 08 lesson, applied to state. The `Math.max(1, quantity)` clamp runs in the parent, where the data lives, so a future caller cannot push a quantity below 1.

### Challenge

Build a sortable, filterable `ProductTable`: columns Name / Price / Stock with click-to-sort headers (ascending/descending, indicated by `aria-sort`), a "Show sold out only" checkbox, and an empty state. Then answer two questions: (a) why must the row key not be the row index *especially* in a sortable table? (b) what happens to focus and scroll if you get the key wrong?

**Solution**

```tsx
// src/components/ProductTable.tsx
import { useMemo, useState } from 'react';
import { formatMoney, products, type Product } from '../data/products';

type SortKey = 'name' | 'price' | 'stock';
type SortDirection = 'asc' | 'desc';

const collator = new Intl.Collator('en-IN', { sensitivity: 'base' });

const COMPARATORS: Record<SortKey, (a: Product, b: Product) => number> = {
  name: (a, b) => collator.compare(a.name, b.name),
  price: (a, b) => a.priceMinor - b.priceMinor,
  stock: (a, b) => a.stock - b.stock,
};

export function ProductTable() {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [soldOutOnly, setSoldOutOnly] = useState(false);

  const rows = useMemo(() => {
    const filtered = soldOutOnly ? products.filter((p) => p.stock === 0) : [...products];
    const compare = COMPARATORS[sortKey];
    const sign = direction === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => compare(a, b) * sign || collator.compare(a.name, b.name));
  }, [sortKey, direction, soldOutOnly]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('asc');
    }
  };

  const ariaSortFor = (key: SortKey) =>
    key === sortKey ? ((direction === 'asc' ? 'ascending' : 'descending') as const) : ('none' as const);

  return (
    <div className="table-wrap">
      <label className="table-filter">
        <input type="checkbox" checked={soldOutOnly} onChange={(e) => setSoldOutOnly(e.currentTarget.checked)} />
        Show sold out only
      </label>

      {rows.length === 0 ? (
        <p className="table-empty">No products match this filter.</p>
      ) : (
        <table className="table">
          <caption>Products ({rows.length} rows)</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSortFor('name')}>
                <button type="button" onClick={() => toggleSort('name')}>Name</button>
              </th>
              <th scope="col" aria-sort={ariaSortFor('price')}>
                <button type="button" onClick={() => toggleSort('price')}>Price</button>
              </th>
              <th scope="col" aria-sort={ariaSortFor('stock')}>
                <button type="button" onClick={() => toggleSort('stock')}>Stock</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td className="num">{formatMoney(product.priceMinor)}</td>
                <td className="num">{product.stock === 0 ? 'Sold out' : product.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

**Verified data** for checking your table: sorting by name ascending gives `1TB NVMe SSD, 27" Monitor, 2TB Portable SSD, 32" Curved Monitor, Mechanical Keyboard, Studio Headphones, USB Microphone, Wireless Mouse`; sorting by price descending starts with `32" Curved Monitor ₹24,999.00` then `27" Monitor ₹18,999.00`; "Show sold out only" leaves exactly 4 rows.

Answers to the two questions:

- **(a) Why not the index, especially when sortable?** Sorting is precisely the operation that changes positions while keeping items. If the key is the index, React treats "row 1" as an identity: after sorting by price, the DOM node, focus ring and any component state still belong to row 1 — which is now a *different product*. Sorting by price with index keys is the fastest way to produce a table whose hover/selection/checkbox state points at the wrong row. With `key={product.id}`, React moves nodes and everything travels with its product.
- **(b) Focus and scroll:** with correct keys, React moves the existing DOM node, so the browser keeps focus on the element the user was interacting with and the scroll position is preserved (the nodes are the same nodes, just reordered). With index keys (or random keys), nodes are reused for different data or replaced entirely: focus can stay on a node that now represents a different row, and a replaced list resets scroll/animation state. Tab order also follows the DOM, so a "sorted" table with wrong keys can send the user's keyboard focus to the wrong row's controls.

---

## 10. Summary

- **`map` renders lists.** `forEach` returns `undefined`; a `map` callback with braces and no `return` silently renders nothing.
- **`key` is the item's identity**, used by React to match elements across renders. Missing keys fall back to position and warn; duplicate keys are unsupported; random keys rebuild the list every render (all verified).
- **Use a stable id.** Index keys are only safe for lists that never reorder/insert/delete/filter — verified failure: reversed rows swapped their typed text while the data moved correctly.
- **Keys are scoped to siblings**, live on the outermost element of the mapped item, and are **not visible as props**.
- **Patterns**: component lists (`<ProductCard key={product.id} … />`), primitive lists, fixed choice lists from a declared constant, extracted row components (state per row), keyed fragments for multi-element rows, `Array.from`/`Object.entries` for maps and records.
- **Filter → sort → map**, keeping the key stable so React *moves* nodes rather than recreating them.
- **Empty lists are a state**: early return with an `EmptyState`; do not render an empty container.
- **Performance**: correctness first (keys), then hoist expensive per-row work out of `map`, then paginate/virtualise at 1000+ rows.

---

**What's next →** [`12-events.md`](./12-events.md)
