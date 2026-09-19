# 06 — TSX: JSX + TypeScript

> **Part 3 · React Fundamentals · File 6 of 12**
> Why this file exists: `.tsx` is where all of Part 2's TypeScript meets all of file 05's JSX, and the two have a few genuine friction points (inline types vs interfaces, `React.FC`, the `<T>` ambiguity, event types). This file makes every props type, event type and children type explicit — with the exact compiler errors each mistake produces.

---

## 1. `.ts` vs `.tsx` — the rules

| File | Contains JSX? | Example |
| --- | --- | --- |
| `.ts` | **No** | `src/data/products.ts`, `src/data/stock.ts`, `src/dev/render-static.ts` if it had no JSX |
| `.tsx` | **Yes** | `src/App.tsx`, `src/components/PriceTag.tsx` |

Consequences worth stating plainly, because people trip over all of them:

1. **A file with JSX in a `.ts` file is a syntax error.** The compiler treats `<div>` as a type assertion / comparison, and you get confusing errors (`'div' refers to a value`). Rename to `.tsx`.
2. **A `.tsx` file with no JSX is fine**, just unnecessary. Prefer `.ts` for pure logic — it signals "no rendering here" (file 04's naming rules).
3. **Imports must match the real filename.** The Vite template enables `allowImportingTsExtensions`, so `import App from './App.tsx'` works and is what the template itself does. `import App from './App.ts'` when the file is `.tsx` fails.
4. **`.tsx` changes parsing of angle brackets.** `<T>value` (a type assertion) is not available in `.tsx`, and `<T>(…)` in a generic arrow function is ambiguous with JSX (§9). Both have clean workarounds.

Our lab has three types of file, and the split is deliberate:

```text
src/data/*.ts          pure logic + data    — testable without React, no JSX allowed
src/components/*.tsx   UI                   — JSX, props types, event handlers
src/dev/*.tsx          dev harnesses        — JSX for building demo trees
```

---

## 2. What TypeScript buys you in JSX (four wins)

| Win | What it prevents | Error you get instead |
| --- | --- | --- |
| **Required props are enforced** | Rendering `<Card />` without `rating` | `TS2741: Property 'rating' is missing in type '{ title: string; }' but required in type 'CardProps'.` |
| **Extra props are rejected** | `<Card stocked />` — a typo or leftover | `TS2322: … Property 'stocked' does not exist on type 'IntrinsicAttributes & CardProps'.` |
| **Typos are suggested against** | `<Card raiting={4} />` | `TS2322: … Property 'raiting' does not exist … Did you mean 'rating'?` |
| **Unknown components are caught** | Using a component you forgot to import | `TS2304: Cannot find name 'UnknownComponent'.` |
| **DOM attributes are validated** | `class`, `for`, `style="…"`, invented attributes | `TS2322` with *"Did you mean 'className'?"*, or `TS2559` for the style string |
| **Refactors are compiler-guided** | Renaming `Product.name` and missing three usages | The rename produces errors at every stale usage |

None of these exist in plain JavaScript, and all of them are *free at runtime* (types are erased — file 03 §5). This is the strongest practical argument for `--template react-ts`.

> 💡 **The error codes are worth learning.** `TS2322` (assignment/type mismatch — the workhorse), `TS2741` (missing property), `TS2339` (property does not exist on a value), `TS2304` (cannot find name), `TS2559` (weak type, no common properties), `TS2657` (JSX needs one parent). Recognising them turns a wall of red into a diagnosis.

---

## 3. Typing props

### 3.1 The two forms, and when to use each

```tsx
// 1. inline object type — for a component used once, in one file
function Tag({ tag }: { tag: string }) {
  return <span className="tag">{tag}</span>;
}

// 2. named interface — the default for anything reused or exported
export interface PriceTagProps {
  priceMinor: number;
  compareAtMinor?: number | undefined;
  size?: 'sm' | 'lg';
}

export function PriceTag({ priceMinor, compareAtMinor, size = 'sm' }: PriceTagProps) {
  // …
}
```

| Use | When | Why |
| --- | --- | --- |
| Inline type | The component is private to one file and trivial | Less ceremony, the type sits next to the component |
| Named `XxxProps` interface | Anything exported, reused, documented, or referenced by a test/harness | Other files can import the props type (`ProductCardProps`), error messages name a real type instead of a structural blob, and the JSDoc you write on fields appears in IntelliSense |

**Convention used throughout these notes** (locked in Part 2 and applied here):

- **`interface` for props and object shapes** — they are open to declaration merging and read better in error messages.
- **`type` for unions, tuples, mapped/derived types** — e.g. `type CategoryChoice = Category | 'all'`.
- **The interface name is `<ComponentName>Props`.** It is the single most searchable convention in a React codebase.

### 3.2 Required, optional and defaulted

```tsx
export interface RatingProps {
  value: number;                         // required
  reviewCount?: number | undefined;      // optional
}

export function Rating({ value, reviewCount }: RatingProps) {
  return (
    <p className="rating">
      {/* `reviewCount !== undefined` — a count of 0 is real information */}
      {reviewCount !== undefined && <span>({reviewCount} reviews)</span>}
    </p>
  );
}
```

```tsx
export interface PriceTagProps {
  priceMinor: number;
  compareAtMinor?: number | undefined;
  size?: 'sm' | 'lg';                    // optional with a DEFAULT below
}

export function PriceTag({ priceMinor, compareAtMinor, size = 'sm' }: PriceTagProps) {
  // `size` is `'sm' | 'lg'` inside the body, never undefined
}
```

Four rules that come out of that code:

1. **`?` means "may be omitted"**, and inside the component the value's type is `T | undefined`. You must handle `undefined` — the compiler enforces it.
2. **A default in the destructuring removes `undefined` from the type** in the body. `size = 'sm'` means "callers may omit it; here it is always `'sm' | 'lg'`". Defaults belong in the parameter list, **not** in `defaultProps` (a legacy class-component API that was removed from function components in React 19 — never teach it as current).
3. **`compareAtMinor?: number | undefined` vs `compareAtMinor?: number`.** With the template's current config they behave identically. We write `| undefined` explicitly for two reasons: it keeps the code correct under `exactOptionalPropertyTypes` (the stricter option Part 2's lab enables), and it makes the *intent* visible — this prop is genuinely allowed to be `undefined`, not merely omitted.
4. **A prop that can be `0` or `''` must not be tested with truthiness.** `reviewCount !== undefined` (not `if (reviewCount)`), `priceMinor !== undefined` (not `if (priceMinor)`), `soldOut = stock === 0`. This is Part 2's falsiness lesson, now with a UI consequence: `{reviewCount && …}` would hide the "(0 reviews)" line for a brand-new product.

### 3.3 Should props be `readonly`?

React does not enforce immutability — if a child does `props.product.name = 'x'`, nothing stops it. Marking the *data* type `readonly` does not stop it either (a `readonly Product` still has mutable nested fields, unless every field is marked), but two cheap habits help:

```tsx
// 1. `readonly` on arrays you pass down — catches push/sort mistakes
export interface ProductListProps {
  products: readonly Product[];
  onAddToCart: (product: Product) => void;
}

// 2. `Readonly<Props>` in the signature of a component you expect others to be careful with
export function ProductCard(props: Readonly<ProductCardProps>) { /* … */ }
```

`readonly Product[]` is the high-value one: it makes `products.push(...)`, `products.sort()` and `products.reverse()` compile errors. Since Part 2: *mutating arrays in place is the #1 source of "React did not update my UI"*, and this type is a cheap guardrail. Our `ProductList` takes `readonly Product[]` and receives either a filtered array or the module-level `products` constant.

### 3.4 Deriving prop types instead of duplicating them

A component rarely needs the whole domain object. **Narrow props are better prop types**: they document what the component actually uses, and they make the component testable with tiny fixtures.

```tsx
// src/components/StockBadge.tsx (real lab code)
import type { Product } from '../data/products';

export interface StockBadgeProps {
  product: Pick<Product, 'stock'>;     // ← only the field it reads
}

export function StockBadge({ product }: StockBadgeProps) {
  const level = stockLevel(product.stock);
  // …
}
```

Compare the two options:

| Props | Pros | Cons |
| --- | --- | --- |
| `product: Product` | Simple; no type gymnastics; refactor-proof if the field set changes later | Component claims a dependency on `id`, `sku`, `name`, `priceMinor`, `category`, `rating`, `reviewCount`, `tags`… and can silently start using any of them |
| `product: Pick<Product, 'stock'>` | The dependency is explicit; a test needs `{ product: { stock: 3 } }`; changes to unrelated `Product` fields cannot break it | Slightly more thinking when the component needs more fields later |

Derivation tools you will use constantly (all from Part 2):

```tsx
Pick<Product, 'stock'>                        // just these fields
Omit<Product, 'tags' | 'rating'>              // everything else
Partial<Product>                              // a draft / patch object
Product['category']                           // one field's type: Category
Product['category'] | 'all'                   // widen with a literal
(readonly Product[])['number']                // the element type: the idiomatic way to say "array of Product"
```

### 3.5 Typing components built from native elements

When a component wraps a `<button>` and should forward the usual button props (including `onClick`, `disabled`, `aria-*`), derive from the element's props rather than listing them:

```tsx
type IconButtonProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & {
  label: string;                     // required, used for aria-label
};

function IconButton({ label, ...rest }: IconButtonProps) {
  return <button type="button" aria-label={label} {...rest} />;
}

// Both type-check; anything not a button prop is rejected:
export const icon = <IconButton label="Close" onClick={() => {}} />;
```

- `ComponentPropsWithoutRef<'button'>` gives every valid `<button>` prop except the ref (use `ComponentPropsWithRef<'button'>` when you need to forward a ref; React 19 makes that a plain prop — see §8).
- `Omit<…, 'children'>` prevents callers from passing children that the component would silently discard.
- This "wrapper that behaves exactly like the native element" pattern is the professional way to build design-system components (Part 12 builds on it).

---

## 4. Typing `children`

```tsx
import type { ReactNode } from 'react';

export interface HeaderProps {
  title: string;
  subtitle?: string | undefined;
  /** Anything the parent wants rendered in the header's right-hand slot. */
  children?: ReactNode;                       // optional slot
}

export function Header({ title, subtitle, children }: HeaderProps) {
  return (
    <header className="header">
      <div>
        <h1>{title}</h1>
        {subtitle !== undefined && <p className="header__subtitle">{subtitle}</p>}
      </div>
      {children !== undefined && <div className="header__actions">{children}</div>}
    </header>
  );
}
```

| Type | What it accepts | Use it for |
| --- | --- | --- |
| **`ReactNode`** | everything renderable: elements, strings, numbers, fragments, arrays, `null`, `undefined`, booleans | The general-purpose children type. **Default choice.** |
| `ReactElement` | exactly one element (`<Tag />`), not text or arrays | When you must pass a single element and will inspect/clone it |
| `string` / `string \| number` | text only | Text-only APIs, e.g. `<TruncatedText text="…" />` |
| `ReactNode[]` | an array of nodes | Explicit "render these in order" APIs (rarely needed — `ReactNode` already accepts arrays) |
| `(props) => ReactNode` | a render function | Render props (Part 10) — avoid until you need it |

Verified behaviours that decide real designs:

- `<Slot>{null}</Slot>` with `children: ReactNode` **compiles** — `null` is a valid node. So "optional children" needs the `?`, not a stricter type.
- Passing a **function** as children fails: `TS2322: Type '() => null' is not assignable to type 'ReactNode'.` That is TypeScript protecting you from the render-prop footgun.
- A component with **no** `children` in its props rejects children outright: `TS2322: … Property 'children' does not exist on type 'IntrinsicAttributes & CardProps'.` (This is why `<img>child</img>` was silently accepted by the DOM types but `<Card>child</Card>` is not — the DOM types are permissive by design.)

`PropsWithChildren<Props>` is available as a shorthand for `Props & { children?: ReactNode }`; naming the field explicitly (as `Header` does) is usually better because you can document *what the slot is for*.

---

## 5. Function props (callbacks)

A callback prop is a function *value* with an explicit signature:

```tsx
export interface SearchBarProps {
  /** Called with the trimmed query when the form is submitted or cleared. */
  onSearch: (query: string) => void;
  placeholder?: string;
  initialQuery?: string;
}
```

```tsx
export function SearchBar({ onSearch, placeholder = 'Search products…', initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query.trim());              // ← the parent decides what searching means
  };

  return (
    <form className="search" onSubmit={handleSubmit} role="search">
      {/* … */}
      <button type="submit">Search</button>
    </form>
  );
}
```

Conventions and typing rules that pay off:

- **Name: `onXxx`.** The prop describes an *event that happened*; the parent's implementation is usually `handleXxx` (file 04 §5).
- **Return type is `void`.** Meaning "the return value is ignored" — the caller may still pass a function that returns something (`onSearch={setQuery}` where `setQuery` returns `void` anyway). Never type callbacks as returning a value you intend to use; if you need a value back, model it as data.
- **Annotate the parameter types in the props interface, not in every implementation.** The parent's function is checked against the interface.
- **`(product: Product) => void` vs `(product: Product) => Promise<void>`** matters when the parent is `async`: an `async` function returns a Promise, which is assignable to a `void`-returning signature in TypeScript — so nothing complains, and unhandled rejections become your problem. If a callback can fail asynchronously, type it as returning a promise and let the parent handle it (Part 7).

Two ways to pass arguments, both common:

```tsx
// The handler already takes the product
<ProductCard product={keyboard} onAddToCart={handleAddToCart} />

// The handler needs an extra argument from the child's call site
{products.map((product) => (
  <ProductCard key={product.id} product={product} onAddToCart={() => handleAddToCart(product, 1)} />
))}
```

The second creates a new function on every render; that is **fine by default** (do not pre-optimise — Part 10) and it is what our lab does for the chips: `onClick={() => onChange(choice)}` in `CategoryFilter`.

---

## 6. Typing event handlers

React provides event types shaped like `Event<TElement>`. You rarely write the type by hand, because **inline handlers are inferred**:

```tsx
<input onChange={(event) => setQuery(event.currentTarget.value)} />
//                ^? ChangeEvent<HTMLInputElement> — inferred from the element
```

A handler defined **outside** JSX cannot be inferred and must be annotated:

```tsx
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react';

const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
  setQuery(event.currentTarget.value);
};

const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  onSearch(query.trim());
};
```

### 6.1 `currentTarget` vs `target` — the typing tells the truth

This is the most useful thing to know about event types. Verified against React 19's types:

```tsx
// Inside onChange — both properties are typed as HTMLInputElement
<input
  onChange={(event) => {
    const a: string = event.target.value;         // ✓ compiles
    const b: string = event.currentTarget.value;  // ✓ compiles
  }}
/>

// Inside onClick on a <button> — only currentTarget is typed
<button
  type="button"
  onClick={(event) => {
    const name: string = event.currentTarget.name;  // ✓ HTMLButtonElement
    const bad: string = event.target.value;         // ✗ TS2339: Property 'value' does not exist on type 'EventTarget'.
  }}
>
  Go
</button>
```

**Why:** `currentTarget` is the element whose handler is running — React knows exactly which element that is, so it types it precisely (`EventTarget & HTMLButtonElement`). `target` is *whatever was clicked*, which may be a child element, so for mouse events the type is the untyped `EventTarget`. `ChangeEvent` is the special case: React types its `target` as the element too, because a change event is always about the element itself.

**The practical rule:** use `event.currentTarget` when you are reading the element's own value or attributes (`e.currentTarget.value`, `e.currentTarget.name`, `e.currentTarget.checked`). Use `event.target` when you deliberately want the actual clicked node (e.g. event delegation). Our own runtime probe shows the difference plainly:

```text
3a. handler order with stopPropagation: capture on div -> button: type=click target=SPAN currentTarget=BUTTON
```

Clicking the `<span>` inside the button gives `target = SPAN` (what the user hit) and `currentTarget = BUTTON` (the element with the handler) — which is exactly why `currentTarget` is the safe one to read.

### 6.2 The event types you will use

| Type | Appears on | Notes |
| --- | --- | --- |
| `ChangeEvent<HTMLInputElement>` | `<input>`, `<textarea>`, `<select>` | `.currentTarget.value` / `.checked` |
| `FormEvent<HTMLFormElement>` | `<form onSubmit>` | Call `.preventDefault()` (file 12) |
| `MouseEvent<HTMLButtonElement>` | `onClick` and friends | Conflicts with the DOM's global `MouseEvent` — import as `MouseEvent as ReactMouseEvent`, or just rely on inference |
| `KeyboardEvent<HTMLInputElement>` | `onKeyDown`, `onKeyUp` | `event.key === 'Enter'`, `event.key === 'Escape'` |
| `FocusEvent<HTMLInputElement>` | `onFocus`, `onBlur` | `currentTarget.value`, `relatedTarget` for "where did focus go" |
| `DragEvent<T>` | drag/drop handlers | `dataTransfer` |
| `SubmitEvent` (native) | `form.onsubmit` in plain DOM | In React, use `FormEvent` |

> ⚠️ **Never use the DOM's global `MouseEvent`/`KeyboardEvent` in React handlers.** They are different types (React's are synthetic wrappers). TypeScript will reject your handler with a message about incompatible properties — the fix is to import from `react` (aliased) or to delete the annotation and let inference work.

---

## 7. `key` and `ref` are not ordinary props

**`key`** is consumed by React and never reaches your component. Verified at runtime — a component received `{"label":"x"}` and no `key`:

```tsx
function Probe(props: Record<string, unknown>) {
  console.log('props seen by the component:', JSON.stringify(props));   // {"label":"x"}
  return <span>ok</span>;
}
renderToStaticMarkup(<ul><Probe key="alpha" label="x" /></ul>);
```

Consequences: you cannot read `props.key` (in React 19, accessing it warns), and `key` is not part of your `Props` interface. If a component genuinely needs the id, pass it as a normal prop (`<ProductCard key={product.id} product={product} />` — the id is inside `product` anyway).

**`ref`** is different in React 19: it is **an ordinary prop**. You can declare it in your props type and use it directly:

```tsx
type FieldProps = { ref: React.Ref<HTMLInputElement> };

function Field({ ref }: FieldProps) {
  return <input ref={ref} type="text" />;
}

export const field = <Field ref={null} />;      // type-checks
```

Before React 19 this required `forwardRef`. `forwardRef` still exists and still works (it is not removed), but new code passes `ref` like any other prop — Part 2 file 11 introduced this; Part 4 uses refs in practice.

---

## 8. `React.FC` — what it is and why we avoid it

You will meet this everywhere in older code:

```tsx
const Card: React.FC<CardProps> = ({ title }) => <h3>{title}</h3>;
```

- **Historically** it was popular because it gave you `children` automatically (via `PropsWithChildren`) and a `displayName`.
- **In React 19's types it does not add `children`.** Verified:

  ```text
  error TS2339: Property 'children' does not exist on type 'CardFCProps'.        ← inside the component
  error TS2322: Type '{ children: string; title: string; }' is not assignable to type 'IntrinsicAttributes & CardFCProps'.
    Property 'children' does not exist on type 'IntrinsicAttributes & CardFCProps'.   ← at the call site
  ```

  So the old "FC gives you children" advice is doubly wrong today.
- **Still discouraged, for reasons that outlive the types:**
  - **No generics.** `React.FC` cannot express a generic component (`<T>`), which matters the moment you write a `List<T>` or a typed table (Part 11).
  - **It weakens inference** for default props and makes IDE hovers noisier.
  - **It adds nothing you need.** Function components are plain functions; typing the parameters directly is simpler and stronger.

```tsx
// Preferred
export function Card({ title }: CardProps) { return <h3>{title}</h3>; }

// Acceptable, if you like arrow components
export const Card = ({ title }: CardProps) => <h3>{title}</h3>;

// Legacy style — recognise it, do not start new code with it
const Card: React.FC<CardProps> = ({ title }) => <h3>{title}</h3>;
```

**Return types:** do not annotate them. `function Card(props: CardProps): React.JSX.Element` is noise; TypeScript infers the right type and stays accurate when you change the JSX. Annotate only when you *must* be explicit — for example a component whose return type must be `ReactNode` for composition, or a public API where you want to lock the surface.

One React 19 detail that breaks old snippets: **the global `JSX` namespace is gone.** Verified:

```text
error TS2503: Cannot find namespace 'JSX'.
```

So `const x: JSX.Element = <div />;` no longer compiles. Use either of these instead:

```tsx
const a: React.JSX.Element = <div />;   // scoped under React
const b: ReactElement = <div />;        // or import { type ReactElement } from 'react'
```

---

## 9. Generics in `.tsx` and the `<T>` ambiguity

The compiler cannot tell a generic parameter list from a JSX element in a `.tsx` file, so this fails:

```tsx
// ✗ three errors, and — because a syntax error hides the rest — nothing else in
//   the file gets type-checked either
const firstBad = <T>(items: readonly T[]): T | undefined => items[0];
```

**Expected result:**

```text
error TS17008: JSX element 'T' has no corresponding closing tag.
error TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?
error TS1005: '</' expected.
```

Both fixes are one keystroke:

```tsx
// ✓ a function declaration — no ambiguity at all
function firstOf<T>(items: readonly T[]): T | undefined {
  return items[0];
}

// ✓ or an arrow with a trailing comma, which tells the parser "generics, not JSX"
const firstOfArrow = <T,>(items: readonly T[]): T | undefined => items[0];
```

A taste of a generic component (the full treatment is Part 11):

```tsx
export interface ListProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  empty?: ReactNode;
}

export function List<T>({ items, keyOf, renderItem, empty = null }: ListProps<T>) {
  if (items.length === 0) return <>{empty}</>;
  return <ul>{items.map((item) => <li key={keyOf(item)}>{renderItem(item)}</li>)}</ul>;
}

// `T` is inferred from `items` — and `renderItem` receives a fully typed item
<List items={products} keyOf={(p) => p.id} renderItem={(p) => p.name} />
```

Notice how `renderItem: (item: T) => ReactNode` is what makes the callback parameter typed at the call site: that is the payoff of generic components, and the reason `React.FC` cannot do this job.

---

## 10. Types you will use constantly

| Type | Import from | Meaning | Typical use |
| --- | --- | --- | --- |
| `ReactNode` | `react` | Anything renderable | `children`, slots, `renderItem` returns |
| `ReactElement` | `react` | Exactly one element | Passing a single element you may inspect |
| `React.JSX.Element` | `react` | The return type of a component | Only when you must annotate a return type |
| `CSSProperties` | `react` | The `style` object's type | Extracting style objects to variables |
| `ChangeEvent<T>`, `FormEvent<T>`, `MouseEvent<T>`, `KeyboardEvent<T>`, `FocusEvent<T>` | `react` | Synthetic event wrappers | Handler parameters |
| `Ref<T>`, `RefObject<T>` | `react` | A ref to a DOM node or value | `useRef` typing (Part 4) |
| `Dispatch<SetStateAction<T>>` | `react` | The setter from `useState` | Passing `setX` down as a prop |
| `ComponentPropsWithoutRef<'button'>` | `react` | All native props of an element | Wrapper components |
| `PropsWithChildren<P>` | `react` | `P & { children?: ReactNode }` | Shorthand when you do not want a named `children` field |
| `ComponentType<P>` | `react` | A component whose props are `P` | Props that receive *components* (Part 10 patterns) |
| `Product`, `Category`, `StockLevel` | your `data/` modules | Domain types | Props and state |

```tsx
// Passing a setter down, correctly typed
export interface CategoryFilterProps {
  value: CategoryChoice;
  onChange: (choice: CategoryChoice) => void;      // ← prefer a narrow callback
  counts: Record<CategoryChoice, number>;
}

// Two call sites that both type-check:
<CategoryFilter value={category} onChange={setCategory} counts={counts} />
<CategoryFilter value={category} onChange={(choice) => setCategory(choice)} counts={counts} />
```

Prefer the **narrow callback** (`(choice: CategoryChoice) => void`) over `Dispatch<SetStateAction<CategoryChoice>>`: it keeps `useState` an implementation detail of `App`, prevents children from using the functional-updater form in ways the parent did not intend, and makes the component usable by a parent that is not using state at all.

---

## 11. Strictness settings, and what they catch in practice

The template's `tsconfig.app.json` (file 03 §6.8) has four settings that change how you write TSX every day. Here is what each one catches in *this* project:

| Setting | Real example from the lab |
| --- | --- |
| `strict` (on by default in TS 6) | Untyped handler parameters, `possibly undefined` values from `COMPARE_AT[product.id]` (typed `number \| undefined`), implicit `any` in `.map` callbacks |
| `noUnusedLocals` | Leftover `import heroImg from './assets/hero.png'` after deleting the hero image → `TS6133` |
| `noUnusedParameters` | Event handlers that ignore their argument: name it `_event` (or drop it) or the build fails |
| `erasableSyntaxOnly` | `enum Category { Input }` → `TS1294`; use a string-literal union (Part 2) |
| `verbatimModuleSyntax` | `import { ReactNode } from 'react'` when `ReactNode` is only a type → you must write `import type { ReactNode } from 'react'` |
| `noFallthroughCasesInSwitch` | A `switch` branch that forgets `return`/`break` |

`verbatimModuleSyntax` deserves a sentence more, because it changes how every file looks:

```tsx
// verbatimModuleSyntax: true — the import is emitted exactly as written, so a
// type-only import must SAY it is type-only, otherwise the bundler emits a real
// (and useless) runtime import.
import type { Product } from '../data/products';        // ✓ type-only
import { CATEGORY_LABELS, type Category } from '../data/products';   // ✓ mixed
import { Product } from '../data/products';             // ✗ error: 'Product' is a type
```

That is why you see `import type` sprinkled through every file in this part — it is not decoration, it is a requirement of the template's configuration, and it produces strictly better bundles (no dead runtime imports).

---

## 12. Common mistakes

| Mistake | Error | Fix |
| --- | --- | --- |
| JSX in a `.ts` file | *"'div' refers to a value, but is being used as a type"* and friends | Rename to `.tsx` |
| Props type not exported | Tests/harnesses cannot import `ProductCardProps` | `export interface ProductCardProps` |
| Naming the props type `Props` | Two files in one editor tab; useless error messages | `XxxProps` |
| `children` in props but not in the type | `TS2322 … Property 'children' does not exist` | Add `children?: ReactNode` |
| `React.FC` for a generic component | Cannot express `<T>` | Plain function with `<T>` |
| `const x: JSX.Element = …` | `TS2503: Cannot find namespace 'JSX'` | `React.JSX.Element` or `ReactElement` |
| `const f = <T>(…) => …` in `.tsx` | `TS17008` + friends (and it hides other errors) | `function f<T>(…)` or `<T,>` |
| Using the DOM's `MouseEvent` type | Incompatible-handler error | Import from `react` (alias it) or drop the annotation and let inference work |
| `e.target.value` in a click handler | `TS2339: Property 'value' does not exist on type 'EventTarget'` | `e.currentTarget.value` |
| Annotating every inline handler | Verbose and often wrong generics | Let inference do it; annotate only named handlers |
| `import { ReactNode } from 'react'` | `verbatimModuleSyntax` error (or a useless runtime import) | `import type { ReactNode } from 'react'` |
| `Dispatch<SetStateAction<T>>` everywhere | Children know too much about the parent's state | Narrow callback props (`(x: T) => void`) |
| Props typed as `any` to "move on" | Errors disappear, and so does every benefit of `.tsx` | Type the props; you only have to do it once per component |
| Duplicating a domain type in props | Drift: the type and the data disagree | Derive: `Pick<Product, 'stock'>`, `Product['category']` |

---

## 13. Best practices

1. **One exported props interface per component, named `<Component>Props`, exported.**
2. **Narrow the props to what the component reads** (`Pick`, `Omit`, primitive fields). It documents dependencies and simplifies tests.
3. **`children?: ReactNode` for slots; document what the slot is for** with a JSDoc line.
4. **Callbacks: `onXxx` props, `(args) => void`, annotated in the interface, not at every call site.**
5. **Read `currentTarget`, not `target`**, unless you specifically want the clicked node.
6. **Let inline handlers be inferred**; annotate named handlers with `ChangeEvent`/`FormEvent`/etc.
7. **Do not annotate component return types.** If you must, use `React.JSX.Element`, never the removed global `JSX.Element`.
8. **Use `import type` for types** (required here, and better everywhere).
9. **No `React.FC` in new code**, and never `defaultProps`.
10. **No `any`.** If a third-party type is wrong, use `unknown` + a narrowing function, or a documented `as` with a comment. `any` in props is how a typed codebase quietly becomes untyped.

---

## 14. Practice

### Beginner

1. Write `Badge` with props `{ text: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }`. Then render it with a wrong `tone` value (`tone="green"`) and read the error. Render it while omitting `tone` and read the second error.
2. Add an optional `count?: number` prop that renders only when it is **not `undefined`**, and pass `count={0}` from somewhere to prove the zero is displayed.

**Solution**

```tsx
// src/components/Badge.tsx
export interface BadgeProps {
  text: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
  count?: number | undefined;
}

export function Badge({ text, tone, count }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {text}
      {count !== undefined && <span className="badge__count">{count}</span>}
    </span>
  );
}
```

```tsx
// usage
<Badge text="Low stock" tone="warn" count={0} />     // renders "Low stock0"
<Badge text="In stock" tone="good" />                // no count element
```

Errors you should have seen: `tone="green"` → `TS2322: Type '"green"' is not assignable to type '"neutral" | "good" | "warn" | "bad"'` (a union of literals, exactly the Part 2 habit); omitting `tone` → `TS2741: Property 'tone' is missing …`.

### Intermediate

The `CategoryFilter` below is real lab code. Type it completely — props interface, callback signature, derived values — and explain every type you had to choose.

```tsx
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../data/products';

export type CategoryChoice = Category | 'all';

const CHOICES: readonly CategoryChoice[] = ['all', ...CATEGORIES];

export function CategoryFilter({ value, onChange, counts }: CategoryFilterProps) {
  return (
    <div className="filters" role="group" aria-label="Filter by category">
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
    </div>
  );
}
```

**Solution**

```tsx
export interface CategoryFilterProps {
  value: CategoryChoice;
  onChange: (choice: CategoryChoice) => void;
  /** How many products are in each category — used for the labels. */
  counts: Record<CategoryChoice, number>;
}
```

Type-by-type justification:

- **`CategoryChoice = Category | 'all'`** — the UI needs one value that is not a data category. Making it a union (`type`, not an interface) is the Part 2 rule; the union is what lets `CHOICES` be exhaustive and lets the compiler check every `switch`/ternary later.
- **`counts: Record<CategoryChoice, number>`** — this is the interesting one. `Record` forces **every** key to be present: `{ all: 8, input: 2, display: 2, audio: 2, storage: 2 }`. If someone adds a category to `Category` and forgets to count it, `counts[choice]` fails to compile *because the Record is incomplete* — a compiler-enforced invariant. A `Partial<Record<…>>` would allow holes and give you `number | undefined` at the use site (which is why `App.tsx` builds it with `Object.fromEntries` + a documented cast — the one place where the cast is justified, because the keys come from `CATEGORIES` itself).
- **`onChange: (choice: CategoryChoice) => void`** — a narrow callback, not `Dispatch<SetStateAction<…>>`. It allows `onChange={setCategory}` and keeps the parent's state mechanism private.
- **`readonly CategoryChoice[]`** for `CHOICES` — it is a module constant that must never be sorted/pushed.
- **`aria-pressed={active}`** — a boolean attribute; React renders `aria-pressed="false"`/`"true"` (ARIA attributes are strings, and React stringifies them), which is what screen readers need for a toggle button.
- **`onClick={() => onChange(choice)}`** — we must pass an argument, so we create a closure per render. Correct and cheap (Part 10 covers when closures matter).

### Challenge

Build a reusable, fully typed `DataList` component with this API, then use it twice with different data shapes — and prove the `renderItem` callback receives the correct type in both cases.

```tsx
<DataList
  items={products}
  keyOf={(p) => p.id}
  renderItem={(p) => <strong>{p.name}</strong>}
  empty={<EmptyState title="No products" />}
/>
```

**Solution**

```tsx
// src/components/DataList.tsx
import type { ReactNode } from 'react';

export interface DataListProps<T> {
  items: readonly T[];
  /** Stable identity for the key — a function of the item, so it cannot drift. */
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** What to render when there is nothing (any node, including null). */
  empty?: ReactNode;
}

export function DataList<T>({ items, keyOf, renderItem, empty = null }: DataListProps<T>) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="data-list">
      {items.map((item) => (
        <li key={keyOf(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}
```

```tsx
// usage 1 — products: `p` is inferred as Product, so `p.name` autocompletes
<DataList items={products} keyOf={(p) => p.id} renderItem={(p) => <strong>{p.name}</strong>} />

// usage 2 — plain strings: `name` is inferred as string
<DataList items={['keyboard', 'mouse']} keyOf={(name) => name} renderItem={(name) => name.toUpperCase()} />
```

Why this is fully type-safe: `T` is inferred from `items`, and `keyOf`/`renderItem` are *checked against that same* `T`. Passing a mismatched callback fails — e.g. `renderItem={(p) => p.title}` gives `TS2339: Property 'title' does not exist on type 'Product'`. Two extra design points worth noticing: `keyOf` (instead of asking callers for a `React.Key` array) makes it impossible to pass keys in the wrong order, and `empty` defaults to `null` so the empty case is always handled.

---

## 15. Summary

- **`.tsx` = JSX allowed**; put pure logic in `.ts`. Filenames and imports must match exactly, and `allowImportingTsExtensions` lets you write `'./App.tsx'`.
- TypeScript's wins in JSX are concrete and verified: missing props (`TS2741`), extra props (`TS2322` + *Did you mean*), unknown components (`TS2304`), invalid DOM attributes, and compiler-guided refactors.
- **Props**: named `XxxProps` interface, required vs optional (`?`), defaults in destructuring (never `defaultProps`), explicit `| undefined` when optionality is real, `readonly` arrays to prevent mutation.
- **Narrow your props** with `Pick`/`Omit`/indexed access; derive from the domain type instead of retyping it.
- **`children?: ReactNode`** for slots; `ReactElement` when exactly one element is required; functions-as-children are rejected by the types.
- **Callbacks**: `onXxx: (args) => void`, narrow signatures, implemented by the parent.
- **Events**: inline handlers infer their types; named handlers need `ChangeEvent`/`FormEvent`/etc. Read `currentTarget` (typed) rather than `target` (untyped except for change events).
- **`key` is not a prop**; in React 19 **`ref` is** an ordinary prop (no `forwardRef` in new code).
- **Avoid `React.FC`** — it no longer implies `children`, cannot express generics, and adds nothing.
- **Generics in `.tsx`**: use function declarations, or `<T,>` for arrows. The global `JSX` namespace is **gone** in React 19's types — use `React.JSX.Element` or `ReactElement`.
- The template's strictness (`strict`, `noUnusedLocals/Parameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`) is a feature: it forces `import type`, bans enums, and fails the build on dead code.

---

**What's next →** [`07-components.md`](./07-components.md)
