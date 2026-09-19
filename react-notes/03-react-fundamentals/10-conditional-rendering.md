# 10 — Conditional Rendering

> **Part 3 · React Fundamentals · File 10 of 12**
> Why this file exists: showing or hiding parts of the UI is where most beginner bugs live — a stray `0` on the page, an empty state that never appears, a form that forgets what the user typed when a branch flips. This file covers all four conditional tools, the truthiness traps, and the one behaviour that surprises everyone: **unmounting a branch throws away its state.**

---

## 1. The four tools, and when each is right

| Tool | Shape | Use when | Example from the lab |
| --- | --- | --- | --- |
| **Early return** | `if (cond) return <X />;` before the main `return` | The whole component output changes | `ProductList` returns `<EmptyState />` when there are no products |
| **Ternary** | `cond ? <A /> : <B />` | Exactly two alternatives | `{soldOut ? 'Notify me' : 'Add to cart'}` |
| **`&&`** | `cond && <A />` | Show something or nothing | `{isDiscounted && (…)}` |
| **Lookup / switch** | `MAP[level]` or a `switch` over a union | Three or more alternatives keyed by a value | `StockBadge`'s switch over `StockLevel` |

Plus the two "nothing" values: **`null`** (explicitly nothing) and **`undefined`** (also nothing in React 19). Nothing in JSX needs an `if` statement *inside* the markup — because JSX is built out of **expressions** (file 05 §2.1), all four tools above are expressions or can be hoisted above the `return`.

---

## 2. The falsy-value truth table (the `&&` trap)

React renders values, and JavaScript has seven falsy values. Only *some* of them render as nothing. Verified with a single element:

```tsx
<div>{0}{false}{null}{undefined}{''}{NaN}{true}</div>
```

**Expected result:**

```html
<div>0NaN</div>
```

| Value | Renders? | Consequence for `&&` |
| --- | --- | --- |
| `null` | nothing | `count && <Badge />` is safe *if* the left side can only be `null` |
| `undefined` | nothing | Same |
| `false` | nothing | `isSoldOut && <Badge />` is safe |
| `''` | nothing (empty string) | Usually safe, but `{'' ? 'a' : 'b'}` is a different question |
| **`0`** | **`0`** | **`items.length && <List />` prints a literal `0`** |
| **`NaN`** | **`NaN`** | Any failed arithmetic prints `NaN` |
| `true` | nothing | `{true && <X />}` renders `<X />` (correct) |

So the rule is:

```tsx
// ✗ renders a stray "0" whenever the array is empty
{product.tags.length && <TagList tags={product.tags} />}

// ✗ same bug, different shape: 0 is a real stock level
{product.stock && <StockBadge product={product} />}

// ✓ make the condition a boolean
{product.tags.length > 0 && <TagList tags={product.tags} />}
{isDiscounted && <s>{formatMoney(compareAtMinor)}</s>}
```

**Our lab gets this right in the real code** (`ProductCard`), and it is worth reading as a pattern:

```tsx
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

The condition is `> 0` — an explicit boolean — and the *element* is also excluded from the markup entirely when there are no tags. Compare with the sold-out product's markup in our verified output: no `<ul class="card__tags">` at all (the Wireless Mouse has `tags: []`).

> 💡 **Why `&&` and not `? … : null`?** They are equivalent for a single element; `&&` is shorter and reads as "and show this". Use the ternary when both branches exist, and *prefer the ternary when the condition is numeric* — `{count > 0 ? <List /> : null}` makes the boolean explicit in a way that is hard to misread.

---

## 3. Early returns: when a whole section changes

When the entire output differs, return early. Our `ProductList`:

```tsx
export function ProductList({ products, onAddToCart, emptyMessage, compareAtFor }: ProductListProps) {
  // Early return for the empty case: the rest of the component can then assume
  // there is at least one product. This is the clearest form of conditional
  // rendering when a whole section changes.
  if (products.length === 0) {
    return <EmptyState title="No products match" message={emptyMessage ?? 'Try clearing the filters.'} />;
  }

  return (
    <section className="grid" aria-label="Products">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} compareAtMinor={compareAtFor?.(product)} />
      ))}
    </section>
  );
}
```

**Verified output for both branches:**

```text
=== ProductList — empty ===
<div class="empty" role="status"><h2>No products match</h2><p>Try clearing the filters.</p></div>
```

and the empty state is what the *user* sees when filters conflict — from the interaction harness:

```text
3. then clicked the "Audio" chip (combined filters, no matches)
   visible : (none)
   footer  : Showing 0 of 8 products.
   empty   : No products match / Nothing matches “ssd” in this category.
```

**Why early returns beat a giant ternary here:** the main path stays flat and unindented, the empty case is one readable line, and TypeScript helps — after the early return, `products` is still `readonly Product[]`, but you know it is non-empty, so the mapping code needs no defensive checks. (If you use the array's first element, `products[0]` is typed `Product | undefined` under `noUncheckedIndexedAccess` — the early return is what justifies a `!` or a restructure.)

**Multiple early returns are fine and encouraged:**

```tsx
export function ProductDetail({ id }: { id: string }) {
  const { data: product, isPending, isError } = useProduct(id);      // Part 7 territory

  if (isPending) return <Skeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!product) return <EmptyState title="Product not found" />;

  return <ProductCard product={product} onAddToCart={addToCart} />;
}
```

Each line is a state of the world, checked in priority order. This is far more readable than nesting three ternaries, and it is the shape every data-fetching component eventually takes (Part 7 formalises it).

---

## 4. Ternaries: exactly two alternatives

```tsx
// text
{soldOut ? 'Notify me' : 'Add to cart'}

// an element either way
{isDiscounted ? <s className="price__was">{formatMoney(compareAtMinor)}</s> : null}

// a class name
<p className={`price price--${size}`}>
<article className={featured ? 'card card--featured' : 'card'}>

// children that depend on a condition
{isFastShipping ? <Badge text="Free delivery tomorrow" tone="good" /> : <Badge text="Delivered in 4–6 days" tone="neutral" />}
```

Rules for ternaries that keep JSX readable:

1. **Never nest a ternary inside a ternary inside JSX.** Extract a component or compute a value first:
   ```tsx
   // ✗ unreadable, and the diff of a bug fix is a nightmare
   {a ? <A /> : b ? <B /> : c ? <C /> : <D />}

   // ✓ a mapping, named
   const VIEWS = { a: <A />, b: <B />, c: <C /> } as const;   // (or a function returning the element)
   return <>{VIEWS[key] ?? <D />}</>;
   ```
2. **Keep the condition a boolean expression**, not a value: `stock > 0 ? …` rather than `stock ? …` (which is a *different* rule when stock is `0` or `-1`).
3. **Do not compute inside the branches.** Both branches should read as values; compute shared pieces before the `return`.
4. **A ternary whose branches are the same component type preserves state; different types do not** (§6).

---

## 5. Switches and lookup maps for three or more cases

`StockBadge` renders four *different* things based on a union — the right tool is a `switch`, not a chain of ternaries:

```tsx
export function StockBadge({ product }: StockBadgeProps) {
  const level = stockLevel(product.stock);

  switch (level) {
    case 'out':
      return <span className="badge badge--out">{STOCK_LABELS.out}</span>;
    case 'low':
      return (
        <span className="badge badge--low">
          {STOCK_LABELS.low} — only {product.stock} left
        </span>
      );
    case 'in':
      return <span className="badge badge--in">{STOCK_LABELS.in}</span>;
    case 'unknown':
      return <span className="badge">{STOCK_LABELS.unknown}</span>;
    default: {
      // Unreachable today — but if someone adds a level to StockLevel, `level`
      // is no longer `never` and this line stops compiling until it is handled.
      const unhandled: never = level;
      throw new Error(`Unhandled stock level: ${String(unhandled)}`);
    }
  }
}
```

**Verified output for all three reachable levels:**

```text
=== StockBadge — all three levels ===
<div><span class="badge badge--in">In stock</span><span class="badge badge--low">Few left — only 3 left</span><span class="badge badge--out">Sold out</span></div>
```

Note the details: the `default` branch is a **compile-time tripwire** (`const unhandled: never = level`) — if someone adds `'backorder'` to `StockLevel`, the switch stops compiling until it is handled (Part 2's exhaustiveness pattern). The labels come from a `Record<StockLevel, string>` in the data layer, so the text exists in exactly one place.

### 5.1 When the branches differ only in text or a tone

For "same shape, different content", a **lookup table** beats both a switch and ternaries:

```tsx
const TONE: Record<StockLevel, string> = { out: 'bad', low: 'warn', in: 'good', unknown: 'neutral' };
const LABEL: Record<StockLevel, string> = { out: 'Sold out', low: 'Few left', in: 'In stock', unknown: 'Checking…' };

export function StockChip({ stock }: { stock: number }) {
  const level = stockLevel(stock);
  return <Badge text={LABEL[level]} tone={TONE[level]} count={level === 'low' ? stock : undefined} />;
}
```

`Record<Union, T>` is Part 2's "make illegal states unrepresentable" applied to display: every level **must** have a label and a tone, or the file does not compile. This is why our `stock.ts` exports `STOCK_LABELS` as a `Record<StockLevel, string>` rather than a series of `if`s.

### 5.2 The "status" pattern (the honest version of loading/error)

A single discriminated union beats three independent booleans, for the same reason as file 08 §12:

```tsx
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T };

function ProductPane({ state }: { state: RequestState<Product[]> }) {
  switch (state.status) {
    case 'idle':
      return <EmptyState title="Start a search" />;
    case 'loading':
      return <p role="status">Loading products…</p>;
    case 'error':
      return <ErrorState message={state.message} />;
    case 'success':
      return <ProductList products={state.data} onAddToCart={addToCart} />;
  }
}
```

Three booleans (`isLoading`, `hasError`, `data`) allow 8 combinations, most of them nonsense (loading *and* errored *and* with data). The union allows exactly four states and the compiler proves that all four are handled.

---

## 6. The behaviour that surprises everyone: conditionals unmount

When a conditional is `false`, React **removes the element from the tree**. The component unmounts, and unmounting **destroys its state and DOM nodes**.

Verified — a counter inside a conditional branch:

```tsx
{show && <Counter />}
```

```text
1. count after two clicks, while visible    : 2
2. count while hidden (branch unmounted)    : (not rendered)
3. count after showing it again             : 0   ← state was DISCARDED on unmount
```

Compare with hiding it via CSS, so the component stays mounted:

```tsx
<span hidden={!show}><Counter /></span>
```

```text
4. count after two clicks (visible)         : 2
5. count after hide + show (still mounted)  : 2   ← state SURVIVED
```

And the rule generalises to *what* React compares when it decides to reuse an instance — verified:

```text
6. ternary between two DIFFERENT component types    → the old one unmounts (state lost)
7. same component TYPE at the same position, different props → count=2, label="mode B"   ← state KEPT
```

**The rule: React reuses a component instance when the position in the tree and the component type are both unchanged.** Change either, and you get a fresh instance.

Practical consequences:

| Situation | What happens | What to do |
| --- | --- | --- |
| A form inside a modal that is conditionally rendered | Typed text is gone each time it is reopened | That is usually *correct* (fresh form). To keep it, keep the modal mounted and hide it |
| A tab panel rendered with `{tab === 'a' && <PanelA />}` | Panel A's state (scroll, inputs) resets when you switch tabs | Render both and hide the inactive one, or **lift the state** to the parent |
| Fetching data inside a conditionally rendered component | The request re-runs on every open | Fetch in the parent, or cache it (Part 7); or accept the refetch |
| Two branches render the same component type | State is preserved (may be surprising!) | If you *want* a reset, see below |
| Different components in the same slot | Unmount/mount, state lost (that is usually what you want) | — |

### 6.1 Forcing a reset with `key` — and the "same component, different entity" bug

Because React reuses an instance when the type and position match, this is a genuine bug: the component keeps the *previous* entity's state.

```tsx
// ✗ clicking a different product keeps the previous product's draft/selected tab
<>
  <ProductTabs product={selectedProduct} />
</>

// ✓ `key` says "this is a different entity — give me a fresh instance"
<ProductTabs key={selectedProduct.id} product={selectedProduct} />
```

`key` is not only for lists. Changing the `key` **forces a remount**, which is the standard, idiomatic way to say *"reset this subtree's state"*. It is also the cleanest alternative to syncing state from props with an effect (Part 4's anti-pattern): when a component's identity genuinely changes, give it a new identity.

---

## 7. Rendering nothing (and why "not rendering" matters)

```tsx
if (!product) return null;                     // nothing at all
return <p>{product.name}</p>;
```

Three ways to render nothing, with different meanings:

| Form | Meaning | When to use |
| --- | --- | --- |
| `null` | "Intentionally nothing" | The default for a component that has nothing to show |
| `undefined` (e.g. a missing return) | "Nothing" in React 19, but it usually means you forgot a `return` | Avoid — return `null` explicitly |
| `<> </>` (empty fragment) | Nothing, but returns an element | Rare; useful when a component must return an element and has nothing to put in it |

Two accessibility points that are *not* the same thing:

- **Not rendering** removes the element from the accessibility tree and from the DOM. Correct for content that genuinely does not apply (no products, no tags).
- **Hiding visually** (`hidden` attribute, `display: none`, or a visually-hidden utility class) keeps it in the DOM. `display:none` also removes it from the accessibility tree; a "visually hidden but screen-reader available" class (`.sr-only`) keeps it available to assistive tech — that is what our `SearchBar`'s label uses:
  ```css
  .search label { position: absolute; left: -9999px; }
  ```
- **Announcements**: when a message *appears* as a result of an action (a validation error, "added to cart"), it must be announced to screen readers. Use a live region (`role="status"` for polite, `role="alert"` for assertive). Our `EmptyState` uses `role="status"` for exactly this reason, and the loading line in §5.2 does too.

---

## 8. Conditionals and hooks: the one rule that is absolute

Conditional **rendering** is fine. Conditional **hooks** are not.

```tsx
// ✗ ILLEGAL: the number of hooks called changes between renders
function Widget({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [value, setValue] = useState(0);      // ← hook inside a condition
  }
  useEffect(() => { /* … */ });                 // ← now sometimes the 1st hook, sometimes the 2nd
  return <p>{enabled ? 'on' : 'off'}</p>;
}
```

React identifies hooks **by call order**. If the first render calls one hook and the second calls two, React cannot know which state belongs to which hook, and you get the classic error:

> Rendered more hooks than during the previous render.

**The legal versions:**

```tsx
// ✓ always call the hook; use the value conditionally
function Widget({ enabled }: { enabled: boolean }) {
  const [value, setValue] = useState(0);
  return <p>{enabled ? value : 'off'}</p>;
}

// ✓ move the conditional INSIDE the effect
useEffect(() => {
  if (!enabled) return;
  // …
}, [enabled]);

// ✓ or move the condition OUT: two components, chosen by the parent
{enabled ? <EnabledWidget /> : <DisabledWidget />}
```

oxlint's `react/rules-of-hooks` (enabled in our template, file 03 §6.9) fails the build on the illegal forms, and the React Compiler relies on the rule too. Part 4 covers the Rules of Hooks properly; the important thing here is that **conditional rendering and conditional hook calls are unrelated** — the first is the topic of this file, the second is forbidden.

Also note: hooks called *inside a conditionally rendered component* are perfectly fine:

```tsx
{show && <Counter />}      // Counter uses useState internally — legal, because the
                           // whole component mounts/unmounts; its hooks mount/unmount with it
```

---

## 9. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `{items.length && <List />}` | A literal `0` on the page | `items.length > 0 && …` |
| `{stock && <Badge />}` | Hidden badge for `stock === 0` *and* a `0` rendered | Explicit comparisons: `stock > 0`, `stock === 0` |
| `{count && …}` with NaN | `NaN` rendered | Guard arithmetic; validate inputs |
| Nesting ternaries in JSX | Unreadable, bug-prone diffs | Early returns, lookup maps, extracted components |
| `if` inside JSX | Syntax error (*"Expression expected"*) | Compute before the `return`, or use `&&`/ternary |
| `&&` with a number, everywhere | Subtle `0`/`NaN` leakage | Make conditions boolean (`> 0`, `!== undefined`, `=== ''`) |
| Conditional branch holding a form/inputs | User's typing disappears when any branch flips | Keep mounted (hide instead), lift state, or accept the reset consciously |
| Same component, different entity in one slot | Shows the previous entity's state | `key={entity.id}` |
| Syncing state from props with an effect to "reset" | Extra render, flash of stale data, loops | Use `key` instead (or derive) |
| `{isLoading ? <Spinner /> : null}` + three other flags | Impossible combinations (loading and error and data) | A `status` union (§5.2) |
| Not rendering an error message (removing it from the DOM) | Screen readers never announce it | `role="alert"`/`role="status"` on a persistent element, or render it inside a live region |
| Rendering `false` as text via `.toString()` | `"false"` visible | Render conditionally, do not stringify booleans |

---

## 10. Best practices

1. **Default to `null` for "nothing"**, and return early when a whole section changes.
2. **Make every condition a boolean** before it reaches JSX (`isDiscounted`, `soldOut`, `hasTags`) — computed above the `return`.
3. **Two alternatives → ternary. Three or more keyed by a value → `switch` or a `Record` lookup.**
4. **Never nest ternaries in JSX.** Extract a component, and give each state a name.
5. **Model multi-state UI as one union** (`status: 'idle' | 'loading' | …`) rather than several booleans.
6. **Remember unmounting destroys state**, and choose deliberately: unmount (fresh) vs hide (preserved) vs lift (shared).
7. **Use `key` to reset a subtree** when the entity changes; never sync props→state with an effect.
8. **Announce dynamic messages** with a live region (`role="status"` / `role="alert"`).
9. **Never call a hook conditionally** — move the condition inside the hook, or move it outside the component.
10. **Let exhaustiveness checks work for you**: the `never` tripwire in a `switch` turns "we forgot a case" into a compile error.

---

## 11. Practice

### Beginner

1. Add a `SoldOutNotice` to `ProductCard` that appears only when `product.stock === 0`, and a `LowStockWarning` that appears only when `0 < product.stock < 5`. Render the card for products with stock `12`, `3` and `0` (the lab has all three).
2. Write both conditions two ways (ternary and `&&`) and pick the one that reads better. Justify it in a comment.

**Solution**

```tsx
// inside ProductCard's return, after <StockBadge product={product} />
{product.stock === 0 && (
  <p className="card__notice card__notice--out" role="status">
    This item is currently unavailable.
  </p>
)}

{product.stock > 0 && product.stock < 5 && (
  <p className="card__notice card__notice--low" role="status">
    Only {product.stock} left — order soon.
  </p>
)}
```

Both conditions are explicit comparisons of a **number**: `stock === 0` (not `!stock`) and `0 < stock < 5` written as the two comparisons JavaScript actually needs (`product.stock > 0 && product.stock < 5` — the mathematical chained form is not valid JS and would be silently wrong: `0 < 3 < 5` evaluates `0 < 3` → `true`, then `true < 5` → `1 < 5` → `true`, which *happens* to work for these numbers and breaks for others). The `&&` form reads better than the ternary here because there is no alternative — nothing is shown otherwise, and a nullable branch would only add noise.

### Intermediate

Refactor this component so the JSX contains no ternaries and no `&&` — the conditions should all be resolved before the `return`. Then say which version you would ship and why.

```tsx
export function OrderLine({ line }: { line: OrderLine }) {
  return (
    <li>
      {line.quantity > 1 ? `${line.quantity} × ` : ''}
      {line.name}
      {line.discountPercent > 0 ? <span className="discount"> ({line.discountPercent}% off)</span> : null}
      {line.isGift ? <span className="gift"> 🎁 gift</span> : null}
      {line.stock === 0 ? <strong className="out"> sold out</strong> : <span className="ok"> in stock</span>}
    </li>
  );
}
```

**Solution**

```tsx
export function OrderLine({ line }: { line: OrderLine }) {
  const quantityPrefix = line.quantity > 1 ? `${line.quantity} × ` : '';
  const hasDiscount = line.discountPercent > 0;
  const soldOut = line.stock === 0;

  return (
    <li>
      {quantityPrefix}
      {line.name}
      {hasDiscount && <span className="discount"> ({line.discountPercent}% off)</span>}
      {line.isGift && <span className="gift"> 🎁 gift</span>}
      {soldOut ? <strong className="out"> sold out</strong> : <span className="ok"> in stock</span>}
    </li>
  );
}
```

What improved: the *conditions* now have names (`hasDiscount`, `soldOut`), so a reader sees the business rules at the top and the markup below; the two `&&` cases became clearly boolean (no numeric truthiness); and the final ternary is justified because it genuinely has two branches. The `quantityPrefix` string is computed once rather than re-derived inline.

Which to ship: **this version** — not because ternaries are bad, but because *naming the conditions* is what makes the JSX readable and reviewable. A reviewer can now check the business rules and the markup separately. (For a two-line component with one condition, the inline `&&` version is perfectly fine; the rule is about legibility, not purity.)

### Challenge

Build a `ProductGrid` with four states — loading, error, empty, and populated — using a discriminated union, and make these requirements explicit: (1) a "Retry" button only in the error state; (2) the populated state must render `ProductList`; (3) the empty state must be reachable without an error; (4) switching from populated back to loading must not destroy the user's filter state. Explain which requirement forces which design decision.

**Solution**

```tsx
// src/components/ProductGrid.tsx
import type { Product } from '../data/products';
import { EmptyState } from './EmptyState';
import { ProductList } from './ProductList';

export type GridState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry: () => void }
  | { status: 'empty'; message: string }
  | { status: 'ready'; products: readonly Product[] };

export interface ProductGridProps {
  state: GridState;
  onAddToCart: (product: Product) => void;
}

export function ProductGrid({ state, onAddToCart }: ProductGridProps) {
  switch (state.status) {
    case 'loading':
      return (
        <div className="grid grid--loading" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading products…</span>
        </div>
      );
    case 'error':
      return (
        <div className="grid grid--error" role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={state.onRetry}>Retry</button>
        </div>
      );
    case 'empty':
      return <EmptyState title="No products match" message={state.message} />;
    case 'ready':
      return <ProductList products={state.products} onAddToCart={onAddToCart} />;
  }
}
```

Requirement → design decision:

1. **Retry only in the error state** → the retry callback is carried *by that variant* (`onRetry` exists only on `'error'`), so it is impossible to render a Retry button in a state that has nothing to retry. A separate `onRetry` prop on the component would allow the button to leak into other states.
2. **Populated state renders `ProductList`** → the `'ready'` variant carries `products`, and the switch delegates rendering rather than reimplementing the grid. One list implementation (file 11) means one place for the key logic.
3. **Empty state reachable without an error** → `'empty'` is its own variant, not "ready with zero products". This matters because an API returning `[]` is not a failure, and it makes the empty message a first-class state.
4. **Filters must survive a return to loading** → the *filter state lives in the parent* (`App`), not in `ProductGrid`. Since `ProductGrid` is stateless — it renders whatever `state` says — remounting it (or switching between its branches) cannot lose the user's filters. This is exactly the "lift state to the lowest common ancestor" rule from file 08 doing structural work: making a component stateless is what makes it safe to unmount.

Also note the accessibility details: `aria-busy` + `aria-live="polite"` on the loading state, `role="alert"` on the error (announced assertively), and the loading text in an `.sr-only` element so sighted users see the skeleton while screen readers hear the message.

---

## 12. Summary

- Four tools: **early return** (whole-section change), **ternary** (two alternatives), **`&&`** (show or nothing), **switch/`Record` lookup** (three or more cases keyed by a value).
- **`0` and `NaN` render.** Make conditions boolean — `length > 0`, `stock === 0`, `!== undefined` — or you will ship a stray `0`.
- **`null`** is the explicit "render nothing"; `undefined` also renders nothing in React 19 but usually signals a missing `return`.
- **Three or more branches → a mapping or a union**, not nested ternaries. A `status` union with a `never` tripwire makes impossible states impossible and forces every case to be handled.
- **Conditionals unmount.** Hidden branches lose their state and DOM (verified: `2 → gone → 0`); keeping a component mounted and hiding it preserves state (verified: `2 → 2`); changing the component **type** remounts, while changing only **props** of the same type preserves state.
- **`key` is the reset button**: `key={entity.id}` forces a fresh instance when the entity changes — the correct alternative to syncing state from props.
- **Never call hooks conditionally**; conditional *rendering* and conditional *hook calls* are unrelated ideas.
- **Announce dynamic messages** with `role="status"`/`role="alert"`, and distinguish "not rendered" from "visually hidden" on purpose.

---

**What's next →** [`11-rendering-lists.md`](./11-rendering-lists.md)
