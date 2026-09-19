# 08 — Props: Passing Data Into Components

> **Part 3 · React Fundamentals · File 8 of 12**
> Why this file exists: props are how components talk to each other, and the whole architecture of a React app is "props down, events up". This file covers the mechanics (what props actually *are* at runtime), the rules (they are read-only snapshots), the patterns (lifting state, slots, callbacks), and the traps — with a demonstration of a mutation bug that React will not warn you about.

---

## 1. What props are, mechanically

When you write

```tsx
<PriceTag priceMinor={499900} compareAtMinor={599900} size="lg" />
```

the compiler emits a call with **one object**:

```js
jsx(PriceTag, { priceMinor: 499900, compareAtMinor: 599900, size: "lg" })
```

and React calls your component with that object:

```tsx
export function PriceTag({ priceMinor, compareAtMinor, size = 'sm' }: PriceTagProps) {
  //                       ^^^^^^^^^^  ^^^^^^^^^^^^^^  ^^^^^^^^
  //                       three local variables, read from props
  const isDiscounted = compareAtMinor !== undefined && compareAtMinor > priceMinor;
  const savings = isDiscount ? compareAtMinor - priceMinor : 0;
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

Five facts follow from that mechanism, and they answer most "why does props do this?" questions:

1. **Props are just an object.** There is no magic: `props` is a plain JavaScript object, and destructuring it in the parameter list is a choice (not a requirement).
2. **Props are provided by the parent, always.** A component cannot reach up and fetch its own props; the parent decides what it receives.
3. **The names are yours.** `priceMinor` is a local name of your choosing. The only names React reserves are `key` (never passed) and `ref` (an ordinary prop since React 19 — file 06 §7).
4. **The object is created fresh on each render** of the parent — it is a **snapshot** for that render (§5).
5. **Props are read-only by contract.** Mutating them compiles (unless you mark the fields `readonly`), and produces bugs React will not warn you about (§4).

**Verified output of the code above** (from the lab's dev harness, `renderToStaticMarkup`):

```text
=== PriceTag — plain, discounted, large ===
<div><p class="price price--sm"><span class="price__now">₹4,999.00</span></p><p class="price price--sm"><span class="price__now">₹4,999.00</span><s class="price__was">₹5,999.00</s><span class="price__save">save ₹1,000.00</span></p><p class="price price--sm"><span class="price__now">₹0.00</span></p><p class="price price--lg"><span class="price__now">₹18,999.00</span></p></div>
```

Read that output as *"what the props were"*: four `PriceTag` renders in one line — default `size` (`price--sm`), a discounted one (`price__was` + `save`), a zero-price one with `compareAtMinor={0}` showing **no** discount (the explicit `compareAtMinor !== undefined && > priceMinor` logic), and an explicit `size="lg"` (`price--lg`). Same component, four prop combinations, four different outputs.

---

## 2. Every way to pass a prop

```tsx
// 1. string literal — no braces
<PriceTag size="lg" />
<Tag tag="hot" />

// 2. expression — braces; any JS expression, including template literals
<PriceTag priceMinor={keyboard.priceMinor} />
<PriceTag priceMinor={keyboard.compareAtMinor ?? keyboard.priceMinor} />
<Rating value={product.rating} />
<PriceTag priceMinor={499900} size={`${'s'}m` as 'sm'} />      {/* silly, but legal */}

// 3. boolean shorthand
<ProductCard product={keyboard} onAddToCart={add} featured />   {/* featured={true} */}
<ProductCard product={keyboard} onAddToCart={add} featured={false} />

// 4. object / array / function values
<ProductList products={visible} onAddToCart={handleAddToCart} />
<EmptyState action={<button type="button">Browse</button>} />
<Rating value={4.6} reviewCount={128} />

// 5. spread — forwards an existing object's fields as props
const cardProps: ProductCardProps = { product, onAddToCart, compareAtMinor: 599900 };
<ProductCard {...cardProps} />

// 6. children — not a prop you name at the call site, but it is one
<Header title="MegaShop"> <span className="cart">🛒 0</span> </Header>

// 7. explicit undefined (renders as "no value", not as the string "undefined")
<PriceTag priceMinor={499900} compareAtMinor={undefined} />
```

Three details that cause real confusion:

- **`"499900"` vs `{499900}`.** The first is the *string*; TypeScript rejects it for a `number` prop (file 05 §5.1). Numbers, booleans and objects always need braces.
- **`compareAtMinor={undefined}` is not `compareAtMinor={null}`.** A prop typed `number | undefined` accepts `undefined`, and `!== undefined` checks behave correctly; `null` is a different value and is not assignable to `number | undefined` under `strictNullChecks` (Part 2). Pick one "absent" value per API and use it consistently — our data layer uses `undefined` (optional) and never `null`.
- **Boolean shorthand is only `true`.** `<Card featured />` equals `featured={true}`; there is no shorthand for false.

---

## 3. Reading props: destructure in the signature

```tsx
// ✓ our convention: the component body sees plain locals
export function ProductCard({ product, compareAtMinor, onAddToCart, featured = false }: ProductCardProps) { … }

// ✓ equally valid: read fields off `props` when you need the whole object (e.g. forwarding)
export function Tag(props: TagProps) {
  const featured = FEATURED.has(props.tag);
  return <span className={featured ? 'tag tag--featured' : 'tag'}>{props.children ?? props.tag}</span>;
}

// ✗ never do this in new code: the legacy class-shaped pattern
export function Tag(props: TagProps) {
  const { tag } = props;                       // fine, but redundant
  …
}
```

Destructuring in the parameter list is the React convention for three reasons: it makes the component's inputs visible at the top of the file, it avoids `props.` noise inside a long JSX tree, and **defaults** come for free (`size = 'sm'`).

**Rest for forwarding.** When a component wraps another and passes most props through, destructure the ones it consumes and collect the rest:

```tsx
type IconButtonProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & { label: string };

function IconButton({ label, ...rest }: IconButtonProps) {
  return <button type="button" aria-label={label} {...rest} />;
}
```

`...rest` is typed as "every button prop except `children`" — no `any`, and any typo at the call site is still caught. (Full treatment of wrapper components in file 06 §3.5 and Part 12.)

---

## 4. Props are read-only — and React will not stop you

The rule: **a component must never modify its props.** Not "should not" — must not. Here is what happens when you do, verified end to end in a headless DOM.

**The setup:** a parent renders `<Label item={sharedItem} />`, where `sharedItem` is a plain object living outside React; the child's button mutates it.

```tsx
function Label({ item }: { item: Item }) {
  const rename = () => {
    item.label = 'RENAMED';        // ✗ mutating a prop
  };
  return (
    <div>
      <span className="label">{item.label}</span>
      <button type="button" onClick={rename}>rename prop</button>
    </div>
  );
}
```

**Verified result:**

```text
4. label before renaming            : "original label"
5. after the child mutated the prop : "original label"      ← no re-render was triggered
6. after an unrelated re-render     : "RENAMED"             ← the mutation appeared later
```

Read step 5 and step 6 together, because that pair is the whole reason this rule exists:

- **Step 5:** the mutation happened, but the screen did not change. React had no idea anything needed re-rendering — mutation is invisible to it.
- **Step 6:** later, some *unrelated* state change re-rendered the tree, and the mutated value appeared. So the bug is not "the change never shows"; it is **"the change shows at a random later time"** — the worst possible failure mode, and the one that produces "it works on my machine, sometimes" bug reports.

And note what React did **not** do: **no warning, no error.** Nothing in React's runtime enforces prop immutability, because a deep freeze on every props object would cost more than it saves.

**What protects you instead:**

| Defence | What it catches |
| --- | --- |
| Discipline + code review | `props.x = …`, `props.items.push(…)`, `props.user.name = …` |
| `readonly` in the type | Direct assignment: `error TS2540: Cannot assign to 'label' because it is a read-only property.` |
| `readonly T[]` for arrays | `push`, `pop`, `sort`, `reverse`, `splice` on a passed array |
| `Object.freeze` (rare, deep only) | Runtime mutation of user-supplied data in dev |
| Copy-on-write discipline | All of the above, by never mutating anything you did not create in this render |

The same rule applies to **state**, which really is the same rule: *the only value a component may modify is the one it created.*

**The correct version of `rename`** is a callback the parent owns:

```tsx
function Label({ item, onRename }: { item: Item; onRename: (label: string) => void }) {
  return (
    <div>
      <span className="label">{item.label}</span>
      <button type="button" onClick={() => onRename('RENAMED')}>rename</button>
    </div>
  );
}

function Parent() {
  const [item, setItem] = useState<Item>({ id: 'i1', label: 'original label' });
  return <Label item={item} onRename={(label) => setItem({ ...item, label })} />;
}
```

Now the parent creates a **new object** and sets state — which is exactly the signal React is waiting for.

---

## 5. Props are a snapshot, not a live wire

For a given render, props are fixed. The component reads one consistent set of values; it cannot observe a prop changing *during* its own render, because the next set of props arrives with the *next* call.

```tsx
function Timer({ label }: { label: string }) {
  const handleClick = () => {
    // This closure captured the `label` from the render in which it was created.
    console.log(label);
  };
  return <button type="button" onClick={handleClick}>{label}</button>;
}
```

Consequences you will meet in Part 4, stated here so the shape is familiar:

- **A function defined during a render closes over that render's props/state.** Passing it down or storing it in a ref means it remembers *old* values — the "stale closure" family of bugs.
- **You never "wait for a prop to change" by reading it repeatedly.** You compute during render, or react to a change with an effect (`useEffect` with that prop in the dependency array) — and even then, effects run *after* the commit.
- **Comparing props is what `React.memo` does** (Part 10), which is why mutation is so dangerous: `{ ...product }` is a different object (detected), while `product.name = 'x'` is not (undetected).

---

## 6. Data down, events up

This is the single most important pattern in React, and it has exactly two halves:

```text
      App  (owns state: category, query, cartCount)
       │
       │  props: products, onAddToCart, emptyMessage, compareAtFor   ↓ data
       ▼
   ProductList
       │
       │  props: product, onAddToCart, compareAtMinor, featured      ↓ data
       ▼
   ProductCard
       │
       │  onClick={() => onAddToCart(product)}                       ↑ event
       ▲
       └─────────── App decides what "add to cart" means ────────────┘
              setCartCount((count) => count + 1)
```

**Rules that make the pattern work:**

| Rule | Why |
| --- | --- |
| A child never receives a *setter* of a parent's state (`setCartCount`) when a **named callback** would do | The child should not know how the parent stores data; `onAddToCart` is a contract, `setCartCount` is an implementation detail |
| A callback's arguments describe **what happened**, not what to do | `onAddedToCart(product)` / `onSearch(query)` — the parent chooses the response |
| The child calls the callback, never `await`s it or inspects its result | Keeps children reusable; async behaviour belongs to the parent (Part 7) |
| Props move **down**, events move **up** | Two-way data flow is what makes large UIs unmaintainable |

**The real lab code that implements both halves** (`ProductCard`, then its use):

```tsx
export interface ProductCardProps {
  product: Product;
  /** Rendered as `₹…` when a compare-at price exists. */
  compareAtMinor?: number | undefined;
  /** Called with the product when the user clicks "Add to cart". */
  onAddToCart: (product: Product) => void;
  /** Cards in the "featured" rail render slightly larger. */
  featured?: boolean;
}

export function ProductCard({ product, compareAtMinor, onAddToCart, featured = false }: ProductCardProps) {
  const soldOut = product.stock <= 0;
  const className = featured ? 'card card--featured' : 'card';
  return (
    <article className={className} aria-labelledby={`${product.id}-name`}>
      <header className="card__header">
        <h3 id={`${product.id}-name`} className="card__name">{product.name}</h3>
        <span className="card__sku">{product.sku}</span>
      </header>
      {/* … */}
      <button type="button" className="card__cta" disabled={soldOut} onClick={() => onAddToCart(product)}>
        {soldOut ? 'Notify me' : 'Add to cart'}
      </button>
    </article>
  );
}
```

```tsx
// App.tsx — the parent decides what the event means
const handleAddToCart = (_product: Product) => {
  setCartCount((count) => count + 1);
};
…
<ProductList products={visible} onAddToCart={handleAddToCart} emptyMessage={…} compareAtFor={…} />
```

**Verified behaviour of that contract** (from the interaction harness):

```text
6. clicked "Add to cart" twice (first card, third card)
   cart    : 🛒 2
7. clicked the sold-out card's "Notify me" (disabled button)
   cart    : 🛒 2          ← unchanged, because a disabled button fires no click
```

Note the shape of `onAddToCart`'s parameter: the button could easily have passed nothing (`onAddToCart: () => void`), and the parent would still work. We pass the product because *a parent might reasonably want to know which product* — but we do **not** pass `product.id` and a quantity "just in case". A callback's signature is an API: every argument is a promise to the caller that it will always be there and always mean the same thing.

---

## 7. Lifting state up

When two components need the same data, the state moves to their **closest common parent** and is passed down as props. That is "lifting state up", and it is the first refactoring every React developer performs.

**Before:** two siblings each keep their own copy — and they disagree.

```tsx
function FilterChips() {
  const [category, setCategory] = useState<CategoryChoice>('all');      // ✗ local
  return <div>{CHOICES.map((c) => <button key={c} onClick={() => setCategory(c)}>{c}</button>)}</div>;
}

function Grid() {
  const [category, setCategory] = useState<CategoryChoice>('all');      // ✗ a second copy
  const visible = products.filter((p) => category === 'all' || p.category === category);
  return <ProductList products={visible} onAddToCart={handleAdd} />;
}
```

Clicking a chip changes the chip row and not the grid — each component owns its own truth.

**After:** one owner (the parent), one source of truth.

```tsx
export default function App() {
  const [category, setCategory] = useState<CategoryChoice>('all');      // ✓ owned once

  const visible = useMemo(() => {
    return products.filter((p) => category === 'all' || p.category === category);
  }, [category]);

  return (
    <>
      <CategoryFilter value={category} onChange={setCategory} counts={counts} />
      <ProductList products={visible} onAddToCart={handleAddToCart} />
    </>
  );
}
```

**The rules of lifting:**

1. **Find the closest common ancestor** of everything that needs the value.
2. **Move the `useState` there**, and pass the *value* down plus a **callback** (or the setter, if the shape matches — `onChange={setCategory}` works because the callback signature `(choice: CategoryChoice) => void` matches `Dispatch<SetStateAction<CategoryChoice>>`).
3. **Pass down the minimum**: a child that only displays the value gets `value`; a child that can change it gets `value` + `onChange`.
4. **Do not lift state you do not need to share.** This is the counter-rule, and it is just as important.

### 7.1 When *not* to lift: keep draft state local

`SearchBar` in our lab keeps its own draft:

```tsx
export function SearchBar({ onSearch, placeholder = 'Search products…', initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);       // ← local: a draft only this input cares about
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query.trim());                                // ← the parent hears about COMMITTED searches
  };
  …
}
```

Why this is the better design:

- **Every keystroke would otherwise re-render the entire page** (the filter + the product grid + the footer) just to update a text box.
- **The parent's state stays semantic.** `App` stores *"the search that was submitted"*, not *"what is currently typed"*. Those are different concepts, and the second one is a UI detail owned by the input.
- **The component is reusable.** A parent that does not care about drafts (a test, a second search box) gets the same behaviour.

The general rule: **lift what is shared; keep local what is private.** State that only one component reads and writes belongs in that component, no matter how "important" it feels.

---

## 8. Children and slots: composition instead of configuration

`children` is a prop like any other, but it changes how component APIs are designed.

```tsx
// Configuration: the parent must predict every variant
<Card title="Keyboard" subtitle="KBD-1" showBadge badgeText="Hot" showFooter footerButtonLabel="Add to cart" />

// Composition: the parent decides the layout, the component decides the frame
<Card>
  <Card.Header><h3>Keyboard</h3><span>KBD-1</span></Card.Header>
  <Card.Body><PriceTag priceMinor={499900} /></Card.Body>
  <Card.Footer><button type="button">Add to cart</button></Card.Footer>
</Card>
```

Two real examples from the lab:

```tsx
// Header: one named slot, documented
export interface HeaderProps {
  title: string;
  subtitle?: string | undefined;
  /** Anything the parent wants rendered in the header's right-hand slot. */
  children?: ReactNode;
}
```

```tsx
<Header title="MegaShop" subtitle="8 products in the catalogue">
  <span className="cart">🛒 {cartCount}</span>
</Header>
```

```tsx
// EmptyState: a slot with a default-free optional message
export interface EmptyStateProps {
  title: string;
  message?: string | undefined;
  /** Optional slot for an action button, so callers control the next step. */
  action?: ReactNode;
}
```

**Verified output** of both:

```text
=== Header — with children slot ===
<header class="header"><div><h1>MegaShop</h1><p class="header__subtitle">8 products in the catalogue</p></div><div class="header__actions"><span class="cart">🛒 0</span></div></header>

=== EmptyState — with an action slot ===
<div class="empty" role="status"><h2>Your cart is empty</h2><p>Add a product to get started.</p><button type="button">Browse products</button></div>
```

The `EmptyState` in the second line received `title`, `message` and `action` — and the button was written by the *caller*, so `EmptyState` needs no knowledge of routing, carts or buttons. That is why the slot pattern survives contact with real requirements.

| Slots | Configuration (flags/props) |
| --- | --- |
| The caller decides what goes in a region | The component must anticipate every combination |
| New use cases need no changes to the component | Every new variant adds a boolean/string prop |
| Types are simple (`ReactNode`) | Types grow (`showX`, `xText`, `xVariant`…) |
| Harder for the component to *control* what children do | Easy to enforce consistent markup |
| Best for layout containers, panels, dialogs, lists | Best for small, strongly-typed widgets (`Badge`, `PriceTag`) |

**Use slots for layout; use props for values.** Our `ProductCard` is props-based because every field has a precise type and meaning; our `Header`/`EmptyState`/`Card` are slot-based because the content varies.

> 💡 **Render props** (passing a *function* as a prop or as children, e.g. `renderItem={(p) => <strong>{p.name}</strong>}`) are the third option. They are genuinely useful when the child must tell the parent something *per item* (`DataList`'s `renderItem` in file 06 §9). They are also easy to overuse; Part 10 covers when they beat plain children.

---

## 9. Prop drilling: recognising it, and the ladder out

**Prop drilling** is passing a value through components that do not use it, purely to reach a descendant.

```tsx
<App user={user}>                    // uses it
  <Layout user={user}>               // ✗ does not use it
    <Sidebar user={user}>            // ✗ does not use it
      <UserMenu user={user} />       // uses it
```

| Situation | Verdict |
| --- | --- |
| 2–3 levels, in a page you can read in one screen | **Fine.** Explicit props are a feature: the data flow is visible |
| A component in the middle that does not use the value | Mild smell — consider composition (§8) instead |
| 4+ levels, several props, many intermediate components | Hurts; reach for the ladder below |
| Cross-cutting concerns: theme, locale, authenticated user, a shopping cart | Context (Part 5) from the start |

**The ladder (use the lowest rung that works):**

1. **Pass it as a prop** — default, always start here.
2. **Compose instead of drilling** — pass the *element* instead of the data:
   ```tsx
   // ✗ drilling: Layout and Sidebar both take `user` just to forward it
   <Layout user={user} />
   // ✓ composition: App renders the element, Layout renders a slot
   <Layout sidebar={<UserMenu user={user} />} />
   ```
   This is my favourite fix because it deletes props rather than adding machinery.
3. **Context** (Part 5) for genuinely cross-cutting values, when many components at many depths need the same thing.
4. **An external store** (Part 10: Zustand/Redux) only when the state is large, updated by many unrelated places, and needs devtools/history. "We have many files" is not a reason.

---

## 10. Defaults, and the reference-identity trap

```tsx
export function PriceTag({ priceMinor, compareAtMinor, size = 'sm' }: PriceTagProps) { … }
export function SearchBar({ onSearch, placeholder = 'Search products…', initialQuery = '' }: SearchBarProps) { … }
```

- **Defaults go in the destructuring.** This is the current, correct approach.
- **`defaultProps` is gone** for function components (it was a class-era API; React 19 removed support for it on functions). Never teach it as current, and delete it when you find it.
- **A default value must be safe to reuse.** For primitives and strings, literals are perfect. For objects/arrays, a literal in the parameter list is a **new value on every render** — which breaks memoisation comparisons (Part 10) and any effect that depends on it:

```tsx
// ✗ a brand-new [] on every render
export function TagList({ tags = [] }: { tags?: readonly string[] }) { … }

// ✓ one shared, frozen empty array — same identity forever
const NO_TAGS: readonly string[] = Object.freeze([]);
export function TagList({ tags = NO_TAGS }: { tags?: readonly string[] }) { … }
```

- **Required is better than "optional with a default" when the value is always meaningful.** Our `PriceTag` requires `priceMinor`: there is no sensible default price, and a required prop makes the call site say what it means.

---

## 11. Spreading props: convenient and risky

```tsx
// The good use: a wrapper that forwards unknown props to a native element
type ButtonProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & { loading?: boolean };

function Button({ loading = false, disabled, ...rest }: ButtonProps) {
  return <button type="button" disabled={disabled ?? loading} {...rest} />;
}
```

```tsx
// The risky uses
<ProductCard {...product} />                       // renames "product" fields into props: fragile
<button {...props} />                              // may forward `product`, `onAddToCart`, …
```

| Fine | Dangerous |
| --- | --- |
| Forwarding to a native element with a type that excludes what you consume | Spreading a domain object into a component whose props are *not* that shape |
| Spreading an explicitly typed props object (`const p: ProductCardProps = {…}`) | Spreading untyped/`any` objects: typos become silently dropped props |
| `key` spread *after* other props when you really mean it | Spreading a `key` accidentally (`{...{key: x}}` works but is confusing) |

The failure mode to know: spreading extra fields onto a DOM element produces React's *"React does not recognize the `myProp` prop on a DOM element"* warning (file 05 §4.2) — harmless-looking, but it means your component's API is leaking into the DOM.

---

## 12. Designing a component's props (the part that ages well)

| Principle | Instead of | Do |
| --- | --- | --- |
| **Narrow** to what you read | `product: Product` when you only need the stock | `product: Pick<Product, 'stock'>` |
| **Model states as a union**, not flags | `isLoading`, `hasError`, `items` (4 impossible combinations) | `status: 'idle' \| 'loading' \| 'success' \| 'error'` |
| **One required core, optional extras** | 10 optional props and no idea what is required | `title` required; `subtitle?`, `action?` optional |
| **Callbacks named after events** | `handleCart`, `doCart` | `onAddToCart` |
| **Controlled or uncontrolled, not both** | `value` *and* `defaultValue` *and* internal syncing | Either `value` + `onChange` (controlled) or `defaultValue` (uncontrolled) |
| **Avoid boolean twins** | `isSmall` + `isLarge` | `size: 'sm' \| 'lg'` |
| **Document non-obvious props** | A JSDoc-free `compareAtFor` function prop | `/** Optional lookup: returns a "was" price for those products that have one. */` |
| **Keep the count small** | 12 props on a leaf component | Under ~7; more means "this is two components or needs slots" |

Our `ProductList` illustrates most of them:

```tsx
export interface ProductListProps {
  products: readonly Product[];
  onAddToCart: (product: Product) => void;
  emptyMessage?: string;
  /** Optional lookup: returns a "was" price for those products that have one. */
  compareAtFor?: (product: Product) => number | undefined;
}
```

- four props, one of which is a callback, one a narrowed array, two optional;
- `readonly` prevents the list from being mutated by a child;
- `compareAtFor` is a *function* prop rather than a `compareAt` map, which lets the parent compute prices however it likes (our `App` uses `Partial<Record<string, number>>` derived from `COMPARE_AT`) — and `undefined` means "no compare-at price", which the child already handles.

The related "make illegal states unrepresentable" idea, in one example:

```tsx
// ✗ four booleans = 16 states, most of them nonsense
type AlertProps = { isError?: boolean; isWarning?: boolean; isSuccess?: boolean; isInfo?: boolean };

// ✓ one union = exactly four states, impossible to misuse
export type AlertTone = 'error' | 'warning' | 'success' | 'info';
export interface AlertProps { tone: AlertTone; message: string }
```

This is Part 2's discriminated-union advice, now applied to component APIs. It is also the difference between a design system that scales and one that needs a "which flag combination is valid?" wiki page.

---

## 13. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Mutating a prop | Screen updates "randomly" later, never when expected (§4) | Callback + new value + setState |
| Mutating a prop array (`props.items.push`) | Item appears later, duplicate keys, list length drift | `[...items, x]` and a setter |
| Passing a setter down instead of a callback | Children know the parent's implementation; hard to reuse | `onSearch: (q: string) => void` |
| Lifting state "just in case" | Every keystroke re-renders the page; `App` becomes a state dump | Keep private state local (§7.1) |
| Two components with their own copy of shared state | Chips and grid disagree | Lift to the closest common parent |
| Forgetting `key` when passing arrays as JSX | `null`/reorder bugs; React dev warning | Key at the array site (file 11) |
| Passing `{...props}` through 4 layers | Unknown attributes reach the DOM; warnings pile up | Composition or context (§9) |
| Boolean prop truthiness (`showCount={count}`) | `0` renders as a value instead of "off" | Pass a boolean: `showCount={count > 0}` |
| `defaultProps` on a function component | Deprecated/removed behaviour | Defaults in the destructuring |
| Default `[]`/`{}` literals in props | New identity each render breaks memo/effects | Module-level constant |
| Ambiguous names (`data`, `info`, `options`) | Call sites are unreadable | Domain names: `product`, `reviewCount`, `compareAtMinor` |
| Props typed `any` | No safety at the boundary that matters most | Type the interface; narrow with `Pick`/`Omit` |

---

## 14. Best practices

1. **One props interface per component, exported, named `<Component>Props`.**
2. **Read-only in spirit and in type**: `readonly` arrays, immutable updates, callbacks instead of mutation.
3. **Data down, events up.** Children call `onX`; parents decide what it means.
4. **Lift only what is shared**; keep drafts and UI-only state local.
5. **Slots (`children`) for layout, props for values.** Prefer composition over boolean flags.
6. **Narrow props** so a component's dependencies are visible and its tests stay small.
7. **Unions over flags** for modes and variants.
8. **Defaults in destructuring**; shared constants for non-primitive defaults.
9. **Document every non-obvious prop**, especially function props (`/** Called with … */`).
10. **Spreading is for forwarding to native elements**, with a derived props type — not for shovelling domain objects into components.
11. **Keep prop counts small**; if a leaf needs eight, it is probably a composite in disguise.

---

## 15. Practice

### Beginner

1. Write `StockLine` with props `{ stock: number; threshold?: number }` (default `5`). It renders "In stock", "Only N left" (when `0 < stock < threshold`) or "Sold out" (when `stock <= 0`). Render it four times with `stock` values `12`, `3`, `0`, `-2`.
2. Deliberately try to break it: pass `stock="12"` (a string) and read the error; then omit `stock` and read the second error.

**Solution**

```tsx
// src/components/StockLine.tsx
export interface StockLineProps {
  stock: number;
  /** Below this number the line switches to "Only N left". */
  threshold?: number;
}

export function StockLine({ stock, threshold = 5 }: StockLineProps) {
  if (stock <= 0) return <span className="stock stock--out">Sold out</span>;
  if (stock < threshold) return <span className="stock stock--low">Only {stock} left</span>;
  return <span className="stock stock--in">In stock</span>;
}
```

```tsx
// usage
<StockLine stock={12} />   // In stock
<StockLine stock={3} />    // Only 3 left
<StockLine stock={0} />    // Sold out
<StockLine stock={-2} />   // Sold out   ← negative stock is still "out", not "only -2 left"
```

Expected errors: `stock="12"` → `TS2322: Type 'string' is not assignable to type 'number'`; omitted → `TS2741: Property 'stock' is missing … but required in type 'StockLineProps'`. Note the ordering of the two conditions — checking `stock <= 0` **before** `stock < threshold` is what makes negative values safe; reversing them would print "Only -2 left".

### Intermediate

Build `QuantityPicker` as a **controlled** component: props `{ value: number; min?: number; max?: number; onChange: (next: number) => void; label: string }`. It renders a label, a − button, the value, a + button, and disables the buttons at the limits. Then write the parent that owns the state, and explain what would change if it were uncontrolled instead.

**Solution**

```tsx
// src/components/QuantityPicker.tsx
export interface QuantityPickerProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}

export function QuantityPicker({ label, value, min = 1, max = 10, onChange }: QuantityPickerProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div className="qty">
      <span className="qty__label" id="qty-label">{label}</span>
      <div className="qty__controls" role="group" aria-labelledby="qty-label">
        <button type="button" onClick={() => onChange(value - 1)} disabled={atMin} aria-label={`Decrease ${label}`}>
          −
        </button>
        <output className="qty__value">{value}</output>
        <button type="button" onClick={() => onChange(value + 1)} disabled={atMax} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}
```

```tsx
// parent — the state owner
export function CartLine() {
  const [quantity, setQuantity] = useState(1);
  return (
    <QuantityPicker
      label="Quantity"
      value={quantity}
      min={1}
      max={10}
      onChange={(next) => setQuantity(Math.min(10, Math.max(1, next)))}
    />
  );
}
```

Why controlled: the component renders *exactly* what the parent's state says, so the displayed number can never drift from the value that will be submitted. The clamp in the parent is belt-and-braces (the disabled buttons already prevent out-of-range clicks) — deliberate defence in depth, and it means a future keyboard shortcut cannot push the value out of range.

What changes if it were uncontrolled: the component would own its own `useState(initial)` and accept `defaultValue`/`initialValue` instead of `value`, plus an optional `onChange` for notifications. That is easier to drop into a form, but the parent can no longer read the quantity without a ref or a submit callback, cannot reset it from outside, and cannot validate-then-reject. **Rule of thumb: controlled when the parent must know or control the value (validation, formatting, submission); uncontrolled when the component is self-contained.** (Forms in Part 8 use both, deliberately.)

### Challenge

Design the props for a `<DataTable>` component that shows a list of rows with these requirements, and write the props interface plus a usage example — no rendering implementation needed:

- the caller decides the columns, each with a header, a key, and optional alignment;
- each cell's content is rendered by the caller (values are domain objects);
- clicking a row calls back with the row's id;
- optional `empty` node, optional `loading` state, optional sort control (ascending/descending on one column);
- the component must not know anything about the domain type.

**Solution**

```tsx
import type { ReactNode } from 'react';

export interface Column<T> {
  /** Stable identifier for React keys and sort state. */
  id: string;
  header: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Renders one cell. Receives the row, so the table stays domain-agnostic. */
  render: (row: T) => ReactNode;
  /** Only these columns can be sorted; the caller supplies the comparison. */
  compare?: (a: T, b: T) => number;
}

export interface SortState {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  /** Stable identity for a row — required, never the index. */
  rowId: (row: T) => string;
  onRowClick?: (id: string) => void;
  /** Controlled sort: the parent owns the state and the sorting itself. */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  loading?: boolean;
  /** Rendered when there are no rows and we are not loading. */
  empty?: ReactNode;
  /** Accessible caption; required because a bare table has no context. */
  caption: string;
}
```

```tsx
const columns: readonly Column<Product>[] = [
  { id: 'name', header: 'Product', render: (p) => p.name, compare: (a, b) => a.name.localeCompare(b.name) },
  { id: 'price', header: 'Price', align: 'end', render: (p) => formatMoney(p.priceMinor),
    compare: (a, b) => a.priceMinor - b.priceMinor },
  { id: 'stock', header: 'Stock', align: 'end', render: (p) => p.stock },
];

<DataTable
  caption="Products"
  rows={visible}
  columns={columns}
  rowId={(p) => p.id}
  sort={sort}
  onSortChange={setSort}
  onRowClick={(id) => navigate(`/products/${id}`)}
  loading={isFetching}
  empty={<EmptyState title="No products match" />}
/>
```

Design decisions worth defending in review:

- **`Column<T>` is generic**, so `render` receives `T` — the caller gets full type safety without the table knowing the domain (this is the pattern from file 06 §9).
- **`sort`/`onSortChange` are controlled**, so sorting stays where the data is: the parent sorts (or asks the server to) and the table just shows arrows. A table that sorts internally would force a copy of the rows and would fight server-side pagination later.
- **`rowId` is required**, which makes index-as-key structurally impossible.
- **`compare` lives on the column**, next to `render`, instead of a separate `sortBy: keyof T` that breaks as soon as a column is computed (a discount percentage, a combined name+SKU sort key).
- **`empty` is a node, not a string**, so the caller can pass a full `EmptyState` (slots over configuration).
- **`caption` is required** because a table without an accessible name is a real accessibility defect, and making it required is cheaper than remembering.

---

## 16. Summary

- **Props are one plain object per render**, created by the parent and passed down. Destructuring in the signature is our convention; defaults come from it.
- **Pass strings with quotes and everything else with braces**; boolean shorthand means `true`; `undefined` means "absent" (pick one absence value and stay consistent).
- **Props are read-only.** Mutating them changes data with no re-render, and the change appears later — verified, and React warns about none of it. Use callbacks + new values + setState; use `readonly` types as a guardrail.
- **Props are snapshots**: functions defined during a render close over that render's values (the source of stale-closure bugs in Part 4).
- **Data down, events up.** Children receive narrow callbacks named `onX`; parents decide what the event means.
- **Lift state to the closest common parent** when two components share it — and keep private state (like a search draft) local.
- **Slots (`children` and named node props) beat boolean flags** for layout; props beat slots for typed values. Composition can even replace prop drilling entirely.
- **Prop drilling** is acceptable for 2–3 levels; then try composition, then context (Part 5), then an external store (Part 10).
- **Design props deliberately**: narrow with `Pick`/`Omit`, unions over boolean flags, controlled *or* uncontrolled, documented, few.

---

**What's next →** [`09-rendering-data.md`](./09-rendering-data.md)
