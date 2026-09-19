# 01 — Component Communication: The Four Directions

> **Part 5 · React Concepts · File 1 of 9**
> Why this file exists: every React screen is a tree, and the tree has exactly four directions in which information can travel. Knowing which direction you are moving data — and which tool belongs to that direction — removes most "how do I get this value over there?" confusion. This chapter walks all four, with measured render counts, and ends with the escape hatches (refs, context) so you know when a prop chain is the right answer and when it is a symptom.

---

## 1. The four directions, and the tool for each

| Direction | Example | The tool | File |
| --- | --- | --- | --- |
| **Parent → child** | a product arrives in `<ProductCard product={…} />` | **props** | this file |
| **Child → parent** | a card reports "the user clicked Add" | a **callback prop** (`onAddToCart`) | this file |
| **Sibling ↔ sibling** | the °C field and the °F field must agree | state **lifted to the closest common parent** | this file + file 02 |
| **Anywhere → anywhere below** | the cart badge in the header, ten levels from the button that added an item | **context** (or a store) | file 09, Part 4's `useContext` |

Three rules follow from this table, and the rest of Part 5 is elaborations of them:

1. **Data flows down** (props), **events flow up** (callbacks). Never the reverse.
2. **Two components that must agree need one owner** for the shared value — the closest common ancestor.
3. **When the distance between two components is the problem** (not the value itself), that is when you reach for context or a ref instead of another prop.

---

## 2. Parent → child: props

Props are the arguments of a component: one object, read-only, compared by React between renders.

```tsx
// File: src/components/PriceTag.tsx (simplified from the lab)
interface PriceTagProps {
  priceMinor: number;              // ₹ in paise, so arithmetic stays in integers
  compareAtMinor?: number;         // optional: only some products are on sale
  size?: 'sm' | 'lg';              // a closed set of choices — a union, not a string
}

export function PriceTag({ priceMinor, compareAtMinor, size = 'sm' }: PriceTagProps) {
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  return (
    <span className={`price price--${size}`}>
      {money.format(priceMinor / 100)}
      {compareAtMinor !== undefined && compareAtMinor > priceMinor && (
        <s className="price__was">{money.format(compareAtMinor / 100)}</s>
      )}
    </span>
  );
}
```

Five properties of props worth stating explicitly, because they explain most of React's behaviour later:

1. **Props are read-only.** A component must never assign to `props.priceMinor`. React does not freeze them (in development it may, for some code paths), but mutating a prop is a bug that shows up as "the UI says one thing, the state says another".
2. **Props are compared by reference** (`Object.is`) to decide whether a `memo`-wrapped component can skip rendering (Part 4, file 07). This is why "pass a new object every render" has consequences.
3. **Props are the component's public API.** A typed `interface` documents the contract, and TypeScript enforces it at every call site (Part 2).
4. **Defaults belong on the destructuring side** (`size = 'sm'`), never in a mutable default object.
5. **`children` is just another prop** — the most important one, with its own chapter (file 08).

**Verified** — the render counts behind the first three experiments in this chapter's harness (`src/dev/comm-probe.tsx`), a screen with a `memo`-wrapped header and list:

```text
1. props down / callbacks up, after mount: {"parent":1,"header":1,"list":1}
2. after typing "key" (state changed in the parent): {"parent":2,"header":2,"list":2} · list items=1
3. after the child called onClear() (state stayed in the parent): {"parent":3,"header":3,"list":3} · list items=3
4. the DOM agrees with state: query="" · list items=3
```

Reading the numbers: mounting rendered each component once; typing into the search box rendered the parent **and both children** (their props changed — the title text and the filtered array), and the list showed **1** item; clearing restored **3** items and rendered everything once more.

⚠️ Notice that both children are wrapped in `memo` and it made no difference here — because their props genuinely changed. `memo` is not a fix for "the parent re-renders"; it is a way to skip work when the props are *identical*. (That distinction is the subject of Part 10's performance file.)

---

## 3. Child → parent: callback props

A child cannot change its parent's state. It cannot even see it. What it can do is **call a function the parent gave it**:

```tsx
// The parent owns the state…
function SearchScreen() {
  const [query, setQuery] = useState('');
  return (
    <SearchBar
      value={query}                    {/* data flows DOWN */}
      onChange={setQuery}              {/* the child calls this to send a change UP */}
    />
  );
}

// …and the child is a controlled, reusable box that knows nothing about searching.
function SearchBar({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} />;
}
```

### The naming convention

React's own documentation uses a two-part convention that is worth adopting exactly:

- the **prop** is named `onSomething` (it describes the event from the parent's point of view): `onAddToCart`, `onChange`, `onDismiss`;
- the **handler** you write is named `handleSomething` (it describes the response):

```tsx
<SearchBar onSearch={handleSearch} />
<Toast onDismiss={handleDismiss} />
```

This makes a JSX line readable as a sentence: *"when the user searches, run `handleSearch`."* It also prevents the most common naming bug, which is naming both the same thing and then wondering which one runs.

### Pass the intent, not the setter

`onChange={setQuery}` is fine when the child's job *is* to report a raw value. But as soon as the parent's reaction is a decision, pass a **semantic callback** instead:

```tsx
// ❌ the child has to know the shape of the parent's state
<CartPanel onSetState={setCartState} />

// ✅ the child reports an intent; the parent decides what that means
<CartPanel onRemove={removeLine} onClear={clearCart} />
```

The lab's real example is `<ProductList onAddToCart={handleAddToCart} />`. The list does not know that adding to a cart means dispatching an action, merging quantities, clamping to `MAX_PER_LINE`, or showing a toast — it just reports the click with a product. That is what makes `ProductList` reusable for a wishlist later.

💡 **A rule of thumb**: if the child needs to know the *shape* of the parent's data to call your callback, the prop is too low-level. Pass a function that describes a thing that happened.

---

## 4. Siblings: lift the shared state to the closest common parent

Two siblings cannot talk to each other directly. The standard solution is one owner above both:

```tsx
// °C and °F are two views of ONE number, so the number lives in the parent.
function TemperatureConverter() {
  const [celsius, setCelsius] = useState('25');
  const fahrenheit = celsius === '' ? '' : String(Math.round((Number(celsius) * 9) / 5 + 32));

  return (
    <>
      <label>°C <input value={celsius} onChange={(e) => setCelsius(e.target.value)} /></label>
      <label>°F
        <input
          value={fahrenheit}
          onChange={(e) => setCelsius(String(Math.round(((Number(e.target.value) - 32) * 5) / 9)))}
        />
      </label>
    </>
  );
}
```

**Verified** — typing `30` into the °C field:

```text
5. siblings sharing one piece of state (°C → °F): celsius=30 · fahrenheit=77 · sibling renders=2/2
```

Both inputs rendered once for that keystroke (mount = 1, update = 2), and the two fields agree: `30 °C` is `77 °F`. The important detail is what is **not** in that code: there is no "sync" logic, no effect copying one field into the other, no `onBlur` handler. The rules of arithmetic are applied during render, so the two fields cannot drift.

⚠️ **The failure mode this avoids** is two pieces of state pretending to be one. If `celsius` and `fahrenheit` were each `useState`, every keystroke would have to update the other, and the two would drift the moment one update was skipped (a paste, a programmatic change, a validation branch). We will *measure* that drift in file 02 (case: `left=1 · right=0`).

---

## 5. Why one-way flow is the point

React's data flow is deliberately unidirectional, and the consequences are worth naming:

| Because data flows one way… | You get |
| --- | --- |
| a child cannot change a parent's state | the owner of the state is explicit; no hidden writes |
| the parent re-renders with new props | the UI is a **function** of the state, not a copy of it |
| two-way binding is written as `value` + `onChange` (an explicit loop) | the loop is visible and interruptible: validate, normalise, ignore, debounce |
| components can be reused | a child that only reads props and calls callbacks works anywhere |

The "two-way binding" that other frameworks give you for free is, in React, written out as a pair: `value` (down) and `onChange` (up). File 03 is entirely about that pair. The explicit version costs one extra line and buys you the ability to *change your mind in the middle* — which is where validation, formatting, clamping and debouncing live.

---

## 6. Component contracts: typing the conversation

A component's props interface is its contract, and the contract should be precise enough to make wrong usage a compile error. The lab's components follow four patterns:

```tsx
// 1. Required vs optional, with defaults
interface RatingProps { value: number; count?: number }        // count is optional

// 2. Closed sets as unions, not free strings
interface TagProps { tone: 'neutral' | 'good' | 'warn' }
// <Tag tone="good" /> compiles; <Tag tone="green" /> does not.

// 3. Callbacks typed with their arguments
interface CartPanelProps {
  onRemove: (productId: string) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
}

// 4. Children typed as ReactNode (file 08)
interface CardProps { children: ReactNode }
```

**Run it** — the compiler is the first line of defence. In the lab, changing one character of a prop name produces:

```text
src/App.tsx(93,8): error TS2322: Type '{ products: Product[]; onAddToCart: (product: Product) => void; ... }'
  is not assignable to type 'IntrinsicAttributes & ProductListProps'.
  Property 'onAddToCartt' does not exist on type 'IntrinsicAttributes & ProductListProps'.
```

That is a spelling mistake caught before the app ever started — and the same class of mistake in plain JavaScript shows up as a product that silently cannot be added to the cart.

---

## 7. The escape hatches (and when they are the right answer)

Props and callbacks fail in two situations, and each has a dedicated tool:

| Situation | Symptom | Tool |
| --- | --- | --- |
| The value is needed **deeply**, by unrelated branches of the tree | every intermediate component takes a prop it does not use ("prop drilling") | **context** — file 09 (`CartProvider` in the lab) |
| You need to **do something imperative** to a DOM node or a child component | "focus this input", "scroll this list", "play this video" | **a ref** — file 06 (`useKeyDown` focusing the search box) |

Everything else is props. That is not a limitation; it is the reason a React tree is easy to reason about: **you can find where a value comes from by reading upwards.**

⚠️ The two escape hatches are frequently over-applied. Context used for a value two levels deep makes it impossible to see that a component depends on it; a ref used to make a child's data readable from the parent replaces `useState` with manual synchronisation. Both mistakes are covered where the tools are introduced (files 06 and 09), and the diagnostic question is always the same: *"what problem does this solve that props cannot?"*

---

## 8. Real-world example: the lab's catalogue screen

Pulling the whole chapter together with the code you already have in `src/`:

```text
App (owns the cart provider, renders Shop)
└── Shop (owns `category`, `query`; reads the cart from context)
    ├── Header (props: the cart badge content comes from context inside it)
    ├── SearchBar            value={query}         onChange={setQuery}          ← parent → child, child → parent
    ├── CategoryFilter       value={category}      onChange={setCategory}       ← the same pair
    ├── ProductList          products={visible}    onAddToCart={handleAddToCart} onCompareAtFor={…}
    │   └── ProductCard      product={…}  onAdd={…}  compareAtMinor={…}
    │       ├── PriceTag     priceMinor, compareAtMinor, size
    │       ├── Rating       value, count
    │       ├── Tag          tone
    │       └── StockBadge   level
    └── CartPanel (no props: everything comes from context)
```

Read the arrows:

- `visible` (a filtered array) flows **down** to the list.
- `handleAddToCart` flows **down** as a function and is *called* **up** when a card's button is clicked.
- `category` and `query` stay in `Shop` because two different children need them (`CategoryFilter`/`SearchBar` set them; `ProductList` reads the result).
- The cart does **not** flow down as props — the badge (in `Header`) and the panel are unrelated branches, which is exactly the "deeply and widely needed" case that context exists for (Part 4, file 05).

Three of those components (`PriceTag`, `Rating`, `Tag`) are pure presentational: props in, JSX out, no state, no effects. They are the easiest components in the app to test and the safest to reuse, and they get that way by taking part in only one direction of communication.

---

## 9. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Mutating props | "the UI and the state disagree"; weird stale renders | copy what you need; keep updates in the owner |
| 2 | Passing a setter instead of a semantic callback | children know the shape of the parent's state and break whenever it changes | pass `onRemove`, `onClear`, `onAddToCart` |
| 3 | Two siblings each holding "the same" state | they drift (measured: `left=1 · right=0`) | lift it to the closest common parent (file 02) |
| 4 | Naming the prop and the handler the same (`onSearch={onSearch}`) | unreadable JSX, confusion about which runs | prop `onX` + handler `handleX` |
| 5 | Drilling a prop through three components that do not use it | every intermediate component's API is polluted | context (file 09), or restructure with composition (file 07) |
| 6 | Copying a prop into state | the copy goes stale when the prop changes (measured in file 02) | derive it during render; use `key` if you need a reset |
| 7 | Using context for everything | dependency is invisible; components are hard to reuse | props first; context for genuinely deep, widely shared values |
| 8 | An effect that "syncs" two pieces of state | loops, flicker, and a third source of truth | one owner, derive the rest |
| 9 | Reading a child's state from the parent through a ref | manual synchronisation, missing renders | lift the state, or let the child report changes with a callback |
| 10 | Callbacks that take no arguments when the parent needs to know *which* item | the parent cannot tell which card was clicked | pass the identifier: `onRemove(product.id)` |
| 11 | Silently ignoring a callback (a prop that is required but never called) | the feature "does nothing" | read the interface as a contract; add the call or remove the prop |
| 12 | Assuming `memo` will stop the parent's re-render | render counts unchanged | `memo` skips a child whose *props are identical*; changing props always re-render (measured above) |

---

## 10. Best practices

1. **Ask the direction question first**: is this data going down, an event coming up, or a shared fact between siblings? Each has exactly one idiomatic answer.
2. **Keep the state where it is used** — the closest common ancestor of everyone who needs it, and no higher (this is liveness/colocation, file 02).
3. **Name props after intent**: `onAddToCart`, not `onClick2`; `items`, not `data`.
4. **Type the props interface**, and let the compiler check every call site.
5. **Pass primitives and stable values** where you can; it keeps `memo`, effects and dependency lists predictable (Part 4).
6. **Make presentational components pure**: props in, JSX out. They are the reusable ones.
7. **Give every callback the information it needs** (`product`, `id`, `index`) so the parent never has to guess.
8. **Prefer composition to prop-drilling** when the problem is "this component needs to render *that*" (file 07).
9. **Document the contract** when a prop must be stable (as `Toast`'s `onDismiss` does) or optional in a meaningful way.
10. **Reach for context or refs deliberately**, and be able to say what problem they solve that props did not.

---

## 11. Practice

### Beginner — write the contract

Write the props interface and a complete component for each of these descriptions. Each must be a pure presentational component (no state, no effects):

1. `<ProductCard product={…} onAddToCart={…} compareAtMinor={…} />` — a `<li>` showing the name, price, rating, category tag and an "Add to cart" button. `compareAtMinor` is optional and shows a struck-through "was" price only when it is greater than the current price.
2. `<QuantityStepper value={…} onChange={…} min={0} max={10} />` — a `−` button, the number, a `+` button. The buttons are disabled at the bounds. `min` and `max` default to `0` and `10`.
3. `<EmptyState message={…} actionLabel={…} onAction={…} />` — `actionLabel` and `onAction` are optional *together*: either both are given or neither is (hint: model that with a union).

### Intermediate — callbacks that carry information

Handlers usually need to know *which* thing was acted on. Rewrite each of these so the parent can tell:

```tsx
// 1. a list of products; clicking a row should open the product's details page
<Row onClick={onClick} product={product} />

// 2. a cart line; the remove button should remove THAT line
<RemoveButton onClick={onRemove} />

// 3. a filter chip; the parent must know which category was chosen
<Chip onClick={onClick} label="Audio" />

// 4. a form field; the parent must know which field changed and to what value
<Field onChange={onChange} name="email" />
```

Then answer: why is passing the value *through the child* (`onClick={() => onSelect(product.id)}` inside the child) better than having the parent ask "which one was it?" afterwards?

### Challenge — a filter bar for the lab

**File: `src/practice/FilterBar.tsx`**

Build a filter bar for the lab's catalogue that keeps **all** of these in one owner and communicates downwards only:

- a search box (`query`, a string),
- a category select (`category`: `'all' | Category`),
- a "only in stock" checkbox (`onlyInStock`, a boolean),
- a "clear all" button that resets all three.

Requirements:

1. `FilterBar` itself must be **stateless** — it receives the current filter values and calls callbacks. (This is what makes it reusable and testable.)
2. The parent (`Shop`, or your own `CatalogueScreen`) owns the state and computes the filtered list during render.
3. Changing any one filter must not reset the others: prove it by typing a query, then changing the category, then checking that the query is still there.
4. Make the whole filter describable as **one** value (`interface CatalogueFilter { query: string; category: CategoryChoice; onlyInStock: boolean }`) and store it in a single `useState` — then compare the cost of that choice with three separate `useState` calls (fewer re-render sources, easier to reset, harder to update one field by accident).

---

## 12. Solutions

### Beginner

**File: `src/practice/CardContracts.tsx`**

```tsx
import type { Product } from '../data/products';
import { PriceTag } from '../components/PriceTag';
import { Rating } from '../components/Rating';
import { Tag } from '../components/Tag';

// 1 — a pure presentational card: props in, JSX out.
export interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  compareAtMinor?: number;
}

export function ProductCard({ product, onAddToCart, compareAtMinor }: ProductCardProps) {
  return (
    <li className="card">
      <h3 className="card__name">{product.name}</h3>
      <Tag tone="neutral">{product.category}</Tag>
      <Rating value={product.rating} />
      <PriceTag priceMinor={product.priceMinor} compareAtMinor={compareAtMinor} />
      <button type="button" className="card__add" onClick={() => onAddToCart(product)}>
        Add to cart
      </button>
    </li>
  );
}

// 2 — a controlled stepper: the value lives in the parent, the bounds are props.
export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

export function QuantityStepper({ value, onChange, min = 0, max = 10 }: QuantityStepperProps) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Decrease quantity">
        −
      </button>
      <output className="stepper__value">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

// 3 — "both or neither": a discriminated union makes the invalid pair impossible.
type EmptyStateAction =
  | { actionLabel: string; onAction: () => void }
  | { actionLabel?: undefined; onAction?: undefined };

export type EmptyStateProps = { message: string } & EmptyStateAction;

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty">
      <p>{message}</p>
      {actionLabel !== undefined && onAction !== undefined && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

Two things to notice in the solutions. First, `onChange(value - 1)` in the stepper computes the *next* value and hands it up — the child never decides what the value is, it only proposes. Second, the `EmptyStateAction` union means `<EmptyState message="x" actionLabel="Retry" />` (a button with no handler) is a **compile error** rather than a button that does nothing when clicked. Modelling "these two props travel together" is one of the highest-value uses of TypeScript in React code (Part 2, unions; Part 11 for more patterns).

### Intermediate

```tsx
// 1 — the row reports WHICH product was clicked
<Row product={product} onSelect={(id: string) => navigate(`/products/${id}`)} />
//   (or, if the parent prefers to receive the whole object)
<Row product={product} onSelect={(product: Product) => openDetails(product)} />

// 2 — the remove button carries the line's id
<RemoveButton productId={line.productId} onRemove={removeLine} />
//   inside: onClick={() => onRemove(productId)}

// 3 — the chip carries its own category value
<Chip label="Audio" category="audio" onSelect={setCategory} />
//   inside: onClick={() => onSelect(category)}

// 4 — the field carries its name and the new value
<Field name="email" value={email} onChange={handleFieldChange} />
//   inside: onChange={(event) => onChange(name, event.target.value)}
//   in the parent: const handleFieldChange = (name: string, value: string) => …
```

The deeper answer: **the child knows the value; the parent knows what to do with it.** Having the child pass its own identifier means the parent's handler is written once (`removeLine(productId)`) instead of once per item, and it never has to reconstruct "which one" from the event target, an index, or a `data-` attribute. Reconstructing it from the DOM is the classic source of bugs when the list reorders, because the DOM's order and the data's order can differ (Part 3, file 11's list `key` discussion).

### Challenge

**File: `src/practice/FilterBar.tsx`** (stateless) and its owner (state)

```tsx
import { useState } from 'react';
import type { CategoryChoice } from '../components/CategoryFilter';
import { ProductList } from '../components/ProductList';
import { CATEGORIES, type Product } from '../data/products';

export interface CatalogueFilter {
  query: string;
  category: CategoryChoice;
  onlyInStock: boolean;
}

export const emptyFilter: CatalogueFilter = { query: '', category: 'all', onlyInStock: false };

export interface FilterBarProps {
  filter: CatalogueFilter;
  onChange: (next: CatalogueFilter) => void;
}

/** Stateless: it renders the current filter and reports intended changes. */
export function FilterBar({ filter, onChange }: FilterBarProps) {
  // One helper for every field: spread the current filter and replace one key.
  const update = <K extends keyof CatalogueFilter>(key: K, value: CatalogueFilter[K]) => {
    onChange({ ...filter, [key]: value });
  };

  return (
    <form className="filters" onSubmit={(event) => event.preventDefault()} role="search">
      <label>
        <span className="visually-hidden">Search products</span>
        <input
          type="search"
          value={filter.query}
          onChange={(event) => update('query', event.target.value)}
          placeholder="Search…"
        />
      </label>

      <label>
        Category
        <select value={filter.category} onChange={(event) => update('category', event.target.value as CategoryChoice)}>
          <option value="all">All</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label>
        <input type="checkbox" checked={filter.onlyInStock} onChange={(event) => update('onlyInStock', event.target.checked)} />
        Only in stock
      </label>

      <button type="button" onClick={() => onChange(emptyFilter)}>
        Clear all
      </button>
    </form>
  );
}

/** The owner: one piece of state, one derived list. */
interface CatalogueScreenProps {
  products: readonly Product[];
  onAddToCart: (product: Product) => void;
}

export function CatalogueScreen({ products, onAddToCart }: CatalogueScreenProps) {
  const [filter, setFilter] = useState<CatalogueFilter>(emptyFilter);

  // Derived during render — no state, no effect, no sync.
  const visible = products.filter((product) => {
    const needle = filter.query.trim().toLowerCase();
    const matchesQuery = needle === '' || product.name.toLowerCase().includes(needle);
    const matchesCategory = filter.category === 'all' || product.category === filter.category;
    const matchesStock = !filter.onlyInStock || product.stock > 0;
    return matchesQuery && matchesCategory && matchesStock;
  });

  return (
    <>
      <FilterBar filter={filter} onChange={setFilter} />
      <p className="result-count">{visible.length} products</p>
      <ProductList products={visible} onAddToCart={onAddToCart} />
    </>
  );
}
```

Requirement 3 is satisfied by construction: `update` spreads the **current** filter and replaces one key, so changing the category cannot clear the query — the other fields are carried along. (The bug this avoids is the one where `onChange({ category })` replaces the whole object and silently resets everything else.)

The trade-off in requirement 4, stated honestly:

| | Three `useState` calls | One `useState` object |
| --- | --- | --- |
| Update one field | `setQuery(next)` — trivial | `setFilter({ ...filter, query: next })` — spread required |
| Reset everything | three calls (easy to forget one) | `setFilter(emptyFilter)` — one call, impossible to half-reset |
| Pass the filter down | three props | one prop, one type |
| Put it in the URL later (Part 6) | three parameters to read and write | one value to serialise |
| Risk | fields can drift out of sync (measured in file 02) | a forgotten spread loses a field |

For a value that travels as a unit — a filter, a form, a draft — one object is usually the better model, and `useReducer` (Part 4, file 06) is the natural next step when the updates get more interesting than "replace one key".

---

## 13. Summary

- Information travels in **four** directions; each has one idiomatic tool: props **down**, callbacks **up**, shared state **lifted to the closest common parent**, deep/wide values through **context** (and imperative actions through **refs**).
- **Props are read-only, compared by reference, and are the component's public API** — typing the interface makes wrong usage a compile error.
- **Name props for intent** (`onAddToCart`) and handlers for response (`handleAddToCart`); pass semantic callbacks rather than raw setters so children stay reusable.
- **Siblings agree because one parent owns the value** and the rest is derived during render — measured: °C `30` → °F `77` with no synchronisation code, and one render per sibling.
- Because data flows one way, a child cannot secretly change a parent; two-way binding is written as an explicit `value` + `onChange` pair, which is where validation and formatting hooks in (file 03).
- `memo` does **not** stop the parent's re-render; it skips a child whose props are *identical* (measured: both children re-rendered because their props genuinely changed).
- Reach for context or refs only when the problem is distance or imperativeness — not because a prop chain has three links (file 09 and file 06 show when it is worth it).

---

**What's next →** [`02-lifting-state.md`](./02-lifting-state.md): the single-source-of-truth rule, measured from both sides. We will watch two copies of "the same" state drift apart (`left=1 · right=0`), watch a parent's state update re-render an unrelated sibling, move the state down and make that render disappear, and catch a value copied from props into state becoming permanently stale.
