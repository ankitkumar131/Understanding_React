# 07 — Components: The Unit of Everything

> **Part 3 · React Fundamentals · File 7 of 12**
> Why this file exists: "component" is the word React beginners use most and understand least precisely. This file pins down what a component *is*, what it may return, how composition works in a real page, the two rules that break most often (purity and where to define components), and what to do when you meet the class components of the React of 2018.

---

## 1. A component is a function with a contract

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

The contract has exactly four clauses:

| Clause | In the example | Consequence if you break it |
| --- | --- | --- |
| It is a **function** | `function PriceTag(props)` | Anything that is not a function cannot be a component (a string, an object, a class instance) |
| Its **name starts with a capital letter** | `PriceTag` | `<priceTag />` is treated as an HTML tag and React warns *"The tag \<priceTag\> is unrecognized in this browser"* |
| It takes **one argument**, an object of props | destructured `{ priceMinor, compareAtMinor, size }` | Passing two arguments has no meaning; React always calls it with one object |
| It returns **renderable output** | a `<p>` element | Returning a function or an object throws; returning `null`/`undefined` renders nothing (§4) |

Anything extra — `useState`, `useMemo`, `useEffect`, context — is *optional machinery* inside the body. The contract above is the whole definition. (Part 4 adds "hooks must be called at the top level"; that is a rule about *how* the body may be written, not about what a component is.)

### 1.1 Component vs element vs instance — stop conflating them

These three words are used interchangeably in most tutorials, and that is why beginners cannot debug "why did my state reset?" questions.

| Term | What it is | Where it exists | Example |
| --- | --- | --- | --- |
| **Component** | The function *definition* | In your source code (a module) | `function PriceTag(props) { … }` |
| **Element** | A plain object describing *what to render* — the result of calling your component, or of JSX | Created on every render; a value | `{ type: PriceTag, props: { priceMinor: 499900 }, … }` |
| **Instance** ("fiber") | React's internal record of a mounted component: its state, its place in the tree, its effects | Inside React, in memory | The thing that remembers `useState`'s value between renders |

The practical consequences:

- **Elements are cheap and disposable.** A component returns a fresh tree of elements every render. That is normal, not wasteful.
- **State lives on the instance, not the component or the element.** Which is why two `<PriceTag />` elements rendered on the same page have no shared state, and why *replacing a component type* (a different function) unmounts the old instance and loses its state (§7).
- **`key` is about instances.** It tells React "these elements are the same item across renders" (file 11).

### 1.2 Proof that it really is this simple

Our dev harness renders components directly to HTML strings. Running it produced (real output, first four sections):

```text
=== PriceTag — plain, discounted, large ===
<div><p class="price price--sm"><span class="price__now">₹4,999.00</span></p><p class="price price--sm"><span class="price__now">₹4,999.00</span><s class="price__was">₹5,999.00</s><span class="price__save">save ₹1,000.00</span></p><p class="price price--sm"><span class="price__now">₹0.00</span></p><p class="price price--lg"><span class="price__now">₹18,999.00</span></p></div>

=== StockBadge — all three levels ===
<div><span class="badge badge--in">In stock</span><span class="badge badge--low">Few left — only 3 left</span><span class="badge badge--out">Sold out</span></div>

=== Rating — with and without review count ===
<div><p class="rating"><span class="rating__track" role="img" aria-label="Rated 4.6 out of 5"><span class="rating__fill" style="width:92%"></span></span><span class="rating__value">4.6</span><span class="rating__count">(128 reviews)</span></p> … <p class="rating">…<span class="rating__value">5.0</span></p></div>

=== Tag — plain and featured ===
<div><span class="tag">sale</span><span class="tag tag--featured">hot<span aria-hidden="true"> ★</span></span><span class="tag tag--featured">Just landed<span aria-hidden="true"> ★</span></span><span class="tag">storage</span></div>
```

Note the third row of `PriceTag`: `priceMinor={0}` renders **₹0.00** and shows no cross-out, because `compareAtMinor !== undefined && compareAtMinor > priceMinor` is `false` — the explicit comparison from Part 2 doing exactly what it promised. And in the `Rating` row, `reviewCount={0}` renders **"(0 reviews)"** rather than hiding the line: zero is information.

---

## 2. Three ways to declare a component

```tsx
// 1. function declaration — our convention, and the best default
export function Tag({ tag }: TagProps) {
  return <span className="tag">{tag}</span>;
}

// 2. arrow function assigned to a const — fine, common in smaller files
export const Tag = ({ tag }: TagProps) => <span className="tag">{tag}</span>;

// 3. class component — legacy (see §9)
export class Tag extends Component<TagProps> { render() { return <span className="tag">{this.props.tag}</span>; } }
```

| | Function declaration | Arrow const | Class |
| --- | --- | --- | --- |
| Hooks | ✓ | ✓ | ✗ |
| Generic components (`<T>`) | ✓ natural syntax | needs `<T,>` | not practical |
| Hoisting (usable before its definition in the file) | ✓ | ✗ | ✗ |
| Stack traces / DevTools name | function name always present | name inferred from the variable | present |
| Recommended today | **yes** | yes | for reading old code only |

We use **function declarations** for exports (hoisting, generics, clearer traces) and arrows for tiny local helpers. This mirrors the Part 2 preference for function declarations where identity/naming matters.

---

## 3. Rendering a component is not calling a function

This is the most important mechanical difference in React, and the one that produces the strangest error messages when you get it wrong.

```tsx
// ✓ RENDER it: React calls the function at the right time, in the right place,
//   with the hook dispatcher installed, and owns the result.
<PriceTag priceMinor={499900} />

// ✗ CALL it: you are invoking the function during your own render, outside React's
//   bookkeeping. Any hook inside it explodes.
PriceTag({ priceMinor: 499900 })
```

**Verified** — calling a component that uses a hook directly produces exactly this RuntimeError:

```text
Invalid hook call. Hooks can only be called inside of the body of a function component.
This could happen for one of the following reasons:
  1. You might have mismatching versions of React and the renderer …
  2. You might be breaking the Rules of Hooks
  3. You might have more than one copy of React in the same app
```

And returning the function *itself* (forgetting the JSX brackets) produces a different, very explicit dev error:

```tsx
function Wrapper() {
  return WithHook;        // ✗ forgot <WithHook />
}
```

```text
Functions are not valid as a React child. This may happen if you return WithHook
instead of <WithHook /> from render. Or maybe you meant to call this function rather
than return it.
  <Wrapper>{WithHook}</Wrapper>
```

Why React cares so much:

1. **Hooks need a dispatcher.** `useState` must know *which* component instance and *which* call order it belongs to. That context exists only while React is calling your component.
2. **React schedules.** A component may be called many times, or the result thrown away (StrictMode, interrupted renders). If you call it yourself, React has no idea it happened.
3. **Slow renders must be skippable.** React can re-render a parent and *skip* children whose props are unchanged (Part 10). That optimisation only exists if React controls the calls.
4. **Debugging.** DevTools, the component stack in error messages and the `jsxDEV` file/line info (file 05 §8) all depend on React knowing the component boundary.

**The only legitimate reason to call a component as a function** is inside a utility that will render the *result* under React's control — rare, and never in application code.

---

## 4. What a component may return

Verified in React 19, in both the client and server renderers:

| Return value | Result | Notes |
| --- | --- | --- |
| An element (`<p>…</p>`) | Renders | The normal case |
| A fragment (`<>…</>`) | Renders, no wrapper element | For sibling groups |
| A **string** | Renders as text | `<ReturnsString />` produced `plain text` |
| A **number** | Renders the number | Careful: `0` and `NaN` are visible (file 05 §6) |
| An **array** of elements | Renders each item | Keys required when it comes from data (file 11) |
| `null` | Renders nothing | The explicit, idiomatic "nothing" |
| `undefined` | Renders nothing (no error in React 19) | Prefer `null` — it *says* "intentionally nothing" |
| An **object** | Throws: *"Objects are not valid as a React child (found: object with keys {…})"* | Fix by rendering a value |
| A **function** | Logs *"Functions are not valid as a React child…"* | Usually a forgotten `< />` |
| A promise | Only inside `use()` (React 19) or Server Components | Part 18 territory; not for the client app |

The `undefined` row is worth flagging because many tutorials (written for React 16–17) claim it throws *"Nothing was returned from render"*. In React 19 it renders nothing, so a missing `return` in a component can silently render an empty screen. TypeScript is your defence:

```tsx
// TypeScript catches the missing return: the function's inferred return type is
// undefined, and the component is expected to return something renderable.
function Oops({ label }: { label: string }) {
  if (label === '') { return null; }
  // forgot the return here → the compiler infers `undefined` and your own
  // call site usage surfaces it; a declared return type nails it immediately:
}
```

```tsx
// If you want the compiler to *enforce* it, annotate the return type:
function NeverForgotten({ label }: { label: string }): ReactNode {
  if (label === '') return null;
  return <p>{label}</p>;          // required, because undefined is not in the type
}
```

Our lab's convention: components return JSX, or `null` for "nothing", and return types are left to inference (file 06 §8) except when a component is *supposed* to be able to render nothing and you want that in the type.

---

## 5. Composition: how ten components make one page

Here is the MegaShop component tree as it actually renders:

```text
App
├── Header                        (title, subtitle, children = cart badge)
│   └── <span className="cart">🛒 {cartCount}</span>
├── div.toolbar
│   ├── SearchBar                 (own state: the draft query; calls onSearch on submit)
│   └── CategoryFilter            (chips with counts; calls onChange(choice))
├── ProductList                   (products: readonly Product[])
│   ├── EmptyState                (only when products.length === 0)
│   └── ProductCard               (one per visible product, keyed by product.id)
│       ├── Tag                   (one per product tag)
│       ├── Rating                (value + optional reviewCount)
│       ├── PriceTag              (price + optional compare-at price)
│       └── StockBadge            (Pick<Product, 'stock'>)
└── footer.footer                 ("Showing {visible.length} of {products.length} products.")
```

Four composition mechanisms are visible in that tree, and each one has a rule:

**1. Nesting by name.** `ProductCard` uses `Rating` by importing it and writing `<Rating … />`. Nothing is registered globally; imports are the whole story.

**2. Passing data down (props).** `ProductList` receives `products` and passes one `product` to each `ProductCard`. Data flows **down** — and our props types are narrowed progressively: `ProductList` takes `readonly Product[]`, `ProductCard` takes `Product`, `StockBadge` takes just `Pick<Product, 'stock'>`.

**3. Passing behaviour up (callbacks).** `ProductCard` receives `onAddToCart` and calls it; `App` decides that it means `setCartCount((c) => c + 1)`. Children never know what the parent does with an event, which is exactly what makes them reusable. This is the standard "callbacks up" pattern, and it is the subject of file 08.

**4. Slots (`children`).** `Header` accepts `children` and renders them in a labelled area. `EmptyState` accepts an `action` node. Slots let a parent inject UI into a child's layout without the child knowing anything about it:

```tsx
<Header title="MegaShop" subtitle={`${products.length} products in the catalogue`}>
  <span className="cart">🛒 {cartCount}</span>
</Header>
```

**A page component composes; it does not compute.** Look at what `App.tsx` contains: three `useState` calls, two derived values, and JSX that places four components. 66 lines. That is the target shape for every page you write.

### 5.1 Component granularity: leaf, composite, page

| Kind | Characteristics | Examples in the lab | Rule of thumb |
| --- | --- | --- | --- |
| **Leaf** | Renders one small thing; takes primitives or one narrowed object; no children | `PriceTag`, `Rating`, `Tag`, `StockBadge`, `EmptyState` | If it has more than ~4 props, it is probably two components |
| **Composite** | Composes leaves; takes a domain object; may take a callback | `ProductCard`, `ProductList`, `Header`, `SearchBar`, `CategoryFilter` | One reason to change; under ~100 lines |
| **Page** | Owns the state, composes composites, no styling of its own | `App` (later: `src/pages/CatalogPage.tsx`) | If it is over ~200 lines, extract a composite |

The whole point of this hierarchy is **where state lives**: state belongs at the lowest common ancestor of everything that needs it — `App` here, because the filter chips and the product list both need the category. Everything below is data-in, events-out.

---

## 6. Components must be pure

A component must produce the same output for the same props and state, and must not change anything outside itself while rendering.

```tsx
// ✗ IMPURE: mutating module-level state during render
let calls = 0;
function Impure() {
  calls += 1;
  return <p>calls: {calls}</p>;
}
```

**Verified** — the same component, same props, two renders:

```text
first render of the same component:  <p>calls: 1</p>
second render of the same component: <p>calls: 2</p>
```

Different output for identical input: not a function, in the mathematical sense. In a real app that renders on every keystroke and every state change, this produces numbers that jump around unpredictably, duplicated side effects, and bugs that only appear in StrictMode (because StrictMode renders twice on purpose).

**StrictMode proves the doubling.** Verified with the client renderer:

```text
renders inside <StrictMode>? no  -> 1
renders inside <StrictMode>? yes -> 2
```

So in development your component bodies run **twice** on mount. That is not a bug to work around; it is React telling you "if running twice breaks this, it was already broken".

### 6.1 What render may and may not do

| Allowed during render | Forbidden during render |
| --- | --- |
| Read props and state | Mutate props or state |
| Compute derived values (`const total = qty * price`) | Mutate anything that existed before the render (module variables, `localStorage`, DOM outside your tree) |
| Call pure functions (`formatMoney`, `stockLevel`) | Call `Math.random()`, `Date.now()`, `crypto.randomUUID()` to produce output |
| Create elements, arrays, objects, functions | Set up subscriptions, timers, or `fetch` |
| `console.log` for debugging (with the caveat below) | Write to the database, send analytics, log into your own metrics |
| Render other components | Read or write `document` / `window` |

Three of those deserve a sentence:

- **`Math.random()`/`Date.now()` in render** produce different output on every render, which breaks reconciliation *and* produces a hydration mismatch later (Part 18). If you need a random id, generate it in an event handler or lazily in state initialisation — our `Rating` uses `aria-label` text, not random ids; later, `useId` (Part 4) is the correct tool for ids.
- **`console.log` in render** appears twice per mount in StrictMode, which is why beginners think React "renders things twice for no reason". It does — and it is doing you a favour.
- **Data fetching in render** is not allowed. It belongs in an event handler (user action) or an effect (synchronising with an external system) — Part 4, file on effects; and better still, in a data-fetching library (Part 7).

> 💡 **The purity rule is not academic.** React's ability to skip re-rendering unchanged subtrees (Part 10) and the React Compiler's automatic memoisation both *assume* purity. An impure component makes those optimisations unsafe, so React must fall back to more work — your bug becomes everyone's performance problem.

---

## 7. Define components at module scope (the state-loss bug)

The most damaging structural mistake in React is defining a component **inside** another component:

```tsx
// ✗ every render of Outer creates a brand-new Inner function
function OuterWithNested() {
  const [clicks, setClicks] = useState(0);

  function Inner() {                   // ← new function identity on every render
    const [note, setNote] = useState('');
    return <input value={note} onChange={(e) => setNote(e.currentTarget.value)} />;
  }

  return (
    <div>
      <button type="button" onClick={() => setClicks((c) => c + 1)}>outer clicks {clicks}</button>
      <Inner />
    </div>
  );
}
```

**Verified** — typing into the inner input, then clicking the parent's button:

```text
1. after typing into the nested component's input:      value="hello"
2. after clicking the parent button (parent re-renders): value=""      ← state LOST
3. with the component defined outside:                   value="hello"
4. after clicking the parent button:                     value="hello"  ← state kept
```

**Why:** React identifies component instances by *(position in the tree, component type)*. `Inner` is a **new function object** on every render of `Outer`, so the "type" at that position changes, React concludes "this is a different component now", unmounts the old one and mounts a fresh instance — discarding its state, its DOM nodes and its effects. The same thing happens if you define a component inside `render()` of a class, or inline inside a `.map` callback, or (equivalently) create it inside a `useMemo` without a stable dependency.

Symptoms to recognise in the wild:

- "My input clears when the parent updates."
- "My accordion closes itself when anything else on the page changes."
- "The focus jumps out of the field I am typing in."
- Effects re-running constantly (each remount re-runs them).

**The fix, always:**

```tsx
// ✓ module scope — one function object, one component type, stable across renders
function Inner() {
  const [note, setNote] = useState('');
  return <input value={note} onChange={(e) => setNote(e.currentTarget.value)} />;
}

export function Outer() {
  const [clicks, setClicks] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setClicks((c) => c + 1)}>outer clicks {clicks}</button>
      <Inner />
    </div>
  );
}
```

If the inner component needs values from the outer one, **pass them as props** — that is what props are for:

```tsx
function Row({ product, onAddToCart }: RowProps) { /* … */ }

export function ProductList({ products, onAddToCart }: ProductListProps) {
  return <section>{products.map((p) => <Row key={p.id} product={p} onAddToCart={onAddToCart} />)}</section>;
}
```

---

## 8. Purity, naming and file rules — the checklist

| Rule | Why |
| --- | --- |
| Name starts with a capital letter | Distinguishes your component from a DOM tag in JSX |
| One component per file, file named after it | Predictable navigation, reviewable diffs, Fast Refresh |
| Export components, and only components, from a component file | `react/only-export-components` → Fast Refresh keeps state (file 04 §8) |
| Define components at module scope | Otherwise every parent render creates a new component type (§7) |
| Props in, events out | Children reuse across contexts; state stays where the data lives |
| Pure render: no external mutation, no randomness, no `fetch` | StrictMode double-render, skippable renders, the Compiler |
| Return JSX or `null`; never a function or object | Only renderable values are allowed (§4) |
| Hooks at the top level of the body, never inside conditions/loops | The Rules of Hooks; `react/rules-of-hooks` fails the lint otherwise (Part 4) |
| Don't call a component as a function | Hooks need React's dispatcher (§3) |

---

## 9. Class components: recognised, not written

Every React codebase older than ~2019 is full of class components, and React's own docs still document them (in the *Legacy* section, marked "not recommended for newly written code"). You need to be able to read them, not write them.

```tsx
import { Component } from 'react';

interface LegacyCounterProps { label: string }
interface LegacyCounterState { count: number }

class LegacyCounter extends Component<LegacyCounterProps, LegacyCounterState> {
  state: LegacyCounterState = { count: 0 };

  componentDidMount() {
    console.log('componentDidMount ran');       // runs once, in the browser, after mount
  }

  componentDidUpdate(prevProps: LegacyCounterProps) {
    if (prevProps.label !== this.props.label) console.log('label changed');
  }

  componentWillUnmount() {
    console.log('cleanup');                     // unsubscribe / clear timers here
  }

  render() {
    return <p>{this.props.label}: {this.state.count}</p>;   // `this.props`, `this.state`
  }
}
```

**Verified:** rendering that class component to HTML produced `<p>Legacy class component: 0</p>` — and `componentDidMount` **did not run**, because it is a browser lifecycle that only exists after the component mounts in a live DOM. (Server rendering deliberately skips it.)

### 9.1 Reading old code: the lifecycle → hooks map

| Class | Hooks equivalent | Notes |
| --- | --- | --- |
| `constructor` / field initialisers | `useState` initial value, `useRef` | State is declared in the body now |
| `componentDidMount` | `useEffect(() => { … }, [])` | "After the first render" |
| `componentDidUpdate` | `useEffect(…, [deps])` | Effects with dependencies |
| `componentWillUnmount` | The cleanup function returned from `useEffect` | `return () => { … }` |
| `shouldComponentUpdate` | `React.memo`, `useMemo`, `useCallback` | Or nothing, if you use the React Compiler (Part 10) |
| `getDerivedStateFromProps` | Compute during render | Almost always a class-design smell; you normally do not need it |
| `this.state`, `this.setState` | `useState` / `useReducer` | `setState` merged objects; `useState` replaces values |
| `this.props` | The `props` parameter | Props are read-only in both |
| `render()` | The function body | One component per function now |
| `defaultProps` | Default values in the destructuring | `defaultProps` was removed for function components in React 19 |
| `this.refs`, string refs | `useRef` | String refs (`ref="name"`) are legacy and removed |

### 9.2 Why functions + hooks won

- **No `this`.** Half the class-component bugs in existence are `this` binding problems. Hooks remove the concept entirely.
- **Logic is reusable.** A class shares logic via inheritance or HOCs/render props (both awkward); hooks share logic by being *called*: `const { filters } = useCatalogFilters()`. That is the biggest single win.
- **Composition over hierarchy.** `useState` inside a custom hook, called from a component, has no equivalent in classes.
- **Smaller output, better minification.** Class components compile to more code and minify worse (method names).
- **Tooling assumes functions.** The React Compiler, Fast Refresh and the modern lint rules are all function-first.

**What to do with an old codebase:** leave working class components alone; write new components as functions; convert a class when you are already changing its behaviour — not as a standalone "cleanup" task. React has never removed class support, and it has said explicitly that it does not plan to.

---

## 10. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Forgetting `< />`: `return PriceTag` | *"Functions are not valid as a React child… instead of \<PriceTag /\>"* | `return <PriceTag … />` |
| Calling a component: `PriceTag({…})` | *"Invalid hook call"* (if it uses hooks) | Render it: `<PriceTag … />` |
| Missing `return` in a branch | Blank area; no error in React 19 | Return `null` explicitly; annotate the return type if you want the compiler's help |
| Lowercase component name | React warns about an unrecognised tag; nothing renders | Capitalise the component (and the file) |
| Component defined inside another component | State resets, focus jumps, effects re-run (§7) | Move it to module scope; pass props |
| Returning an object (`{user}`) | *"Objects are not valid as a React child"* | `{user.name}` |
| Side effect during render (`analytics.track()` in the body) | Double events in dev, unstable output | Move it to an event handler or `useEffect` |
| Random/date value in render | UI "flickers" between values; hydration errors later | Compute once (`useState(() => …)`) or in an event handler |
| Two exported things from a component file | Lint warning; full page reloads on save | One component per file; helpers to `data/`/`lib/` (file 04) |
| One giant component | 400-line JSX; impossible review | Extract leaves first (they are the easiest to name) |
| Extracting a component for every `<div>` | 12 files for a card; props soup | Extract when there is a *reason*: reuse, a name, or a data boundary (file 04 §6.1) |
| Using `this` in a function component | `this` is `undefined` | `this` does not exist in function components — that is the point |

---

## 11. Best practices

1. **Name components after what they render**, in domain language: `PriceTag`, not `SmallText`.
2. **Function declarations for exports**, arrows for tiny local helpers.
3. **One component per file**, module scope, named export (our lab makes exactly one exception: `App` uses a default export because that is the Vite template convention and routers/frameworks expect it).
4. **Pure render**: compute from props/state, return elements, touch nothing outside.
5. **Keep leaf components dumb and narrow**; keep page components thin and compositional.
6. **Prefer children/slots over boolean-flag-driven variants**:
   ```tsx
   // ✗ flags multiply
   <Card title="x" showFooter footerText="…" />
   // ✓ slots compose
   <Card><Card.Body>…</Card.Body></Card>
   ```
7. **Return `null`, not `undefined`**, when a component intentionally renders nothing — it documents intent and keeps return types honest.
8. **Extract a component when you can name it in three words.** If you cannot, you probably have a fragment or a helper function instead.
9. **Do not optimise before you profile.** No `React.memo`/`useMemo`/`useCallback` as a reflex — Part 10 explains when they matter and how the React Compiler changes that advice.
10. **Write the class-component mapping once**, so you can read legacy code without being able to write it.

---

## 12. Practice

### Beginner

1. Create `src/components/Tag.tsx` and `src/components/Rating.tsx` (copy from the lab's listing in file 04 or write your own), then render three `Tag`s and two `Rating`s from `App.tsx`. Confirm the output with the dev harness (`npx tsx --tsconfig tsconfig.app.json src/dev/render-static.tsx`) or by looking at the browser.
2. Rename `Tag` to `tag` (lowercase) everywhere and observe what happens when it renders. Then rename it back.

**Solution / what to notice:** with a lowercase name you get a React dev warning about an unrecognised tag (`<tag>`), and the element renders as an unknown HTML element with no styling. This is the JSX capitalisation rule from file 05 being enforced at runtime; TypeScript will also complain, because `tag` is not a known intrinsic element and is not a value in scope in the expected form.

### Intermediate

Refactor this single component into a well-organised set of components (say where each file goes):

```tsx
export function ProductSummary({ product, onAddToCart }: { product: Product; onAddToCart: (p: Product) => void }) {
  return (
    <article className="summary">
      <h3>{product.name}</h3>
      <p>{CATEGORY_LABELS[product.category]}</p>
      <p>{product.rating.toFixed(1)} / 5 ({product.reviewCount} reviews)</p>
      <p>
        {product.compareAtMinor ? <s>{formatMoney(product.compareAtMinor)}</s> : null} {formatMoney(product.priceMinor)}
      </p>
      <span>{product.stock > 0 ? `${product.stock} in stock` : 'Sold out'}</span>
      <button type="button" onClick={() => onAddToCart(product)} disabled={product.stock <= 0}>
        {product.stock <= 0 ? 'Notify me' : 'Add to cart'}
      </button>
    </article>
  );
}
```

**Solution**

```text
src/components/ProductSummary.tsx   — the composite: layout + the add-to-cart button
src/components/RatingCompact.tsx     — "4.6 / 5 (128 reviews)"   (or reuse Rating.tsx)
src/components/PriceSummary.tsx      — compare-at + current price (reuse PriceTag.tsx)
src/components/StockLine.tsx         — "3 in stock" / "Sold out"  (reuse StockBadge.tsx)
src/data/products.ts                 — already holds formatMoney + CATEGORY_LABELS
```

```tsx
// src/components/ProductSummary.tsx
import type { Product } from '../data/products';
import { CATEGORY_LABELS } from '../data/products';
import { PriceTag } from './PriceTag';
import { Rating } from './Rating';
import { StockBadge } from './StockBadge';

export interface ProductSummaryProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export function ProductSummary({ product, onAddToCart }: ProductSummaryProps) {
  const soldOut = product.stock <= 0;

  return (
    <article className="summary">
      <h3>{product.name}</h3>
      <p>{CATEGORY_LABELS[product.category]}</p>
      <Rating value={product.rating} reviewCount={product.reviewCount} />
      <PriceTag priceMinor={product.priceMinor} compareAtMinor={product.compareAtMinor} />
      <StockBadge product={product} />
      <button type="button" onClick={() => onAddToCart(product)} disabled={soldOut}>
        {soldOut ? 'Notify me' : 'Add to cart'}
      </button>
    </article>
  );
}
```

Notes: `soldOut` is computed once (derive, do not repeat `stock <= 0` three times); the three display concerns become leaves that are individually reusable; the composite keeps only layout and the callback. (If `compareAtMinor` is not on `Product`, take it as a separate optional prop — that is exactly what our lab's `ProductCard` does.)

### Challenge

Build a `<Card>` compound component with named slots — `Card.Header`, `Card.Body`, `Card.Footer` — implemented with `children` and prop composition, not with context. Then answer: when would you reach for context instead (Part 5), and what does the compound API buy over `title`/`footer`/`children` props?

**Solution**

```tsx
// src/components/Card.tsx
import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string | undefined;
}

export function Card({ children, className = '' }: CardProps) {
  return <article className={`card ${className}`.trim()}>{children}</article>;
}

function CardHeader({ children }: { children: ReactNode }) {
  return <header className="card__header">{children}</header>;
}

function CardBody({ children }: { children: ReactNode }) {
  return <div className="card__body">{children}</div>;
}

function CardFooter({ children }: { children: ReactNode }) {
  return <footer className="card__footer">{children}</footer>;
}

// Attach the slots as properties of Card. This is plain JavaScript object
// assignment — the "compound component" pattern, with no context involved.
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;
```

```tsx
// usage — layout is decided by the caller, not by boolean flags
<Card>
  <Card.Header>
    <h3>Mechanical Keyboard</h3>
    <span>KBD-1</span>
  </Card.Header>
  <Card.Body>
    <PriceTag priceMinor={499900} compareAtMinor={599900} />
  </Card.Body>
  <Card.Footer>
    <button type="button">Add to cart</button>
  </Card.Footer>
</Card>
```

Two honest caveats, both of which matter in review:

- **TypeScript needs a little help for the attached properties.** Because `Card` is a function and we assign extra properties to it, the assignment `Card.Header = CardHeader` errors unless the function's type is widened:
  ```tsx
  type CardComponent = ((props: CardProps) => React.JSX.Element) & {
    Header: typeof CardHeader;
    Body: typeof CardBody;
    Footer: typeof CardFooter;
  };
  export const Card = Object.assign(CardBase, { Header: CardHeader, Body: CardBody, Footer: CardFooter }) as CardComponent;
  ```
  `Object.assign` is the clean way to express this (and is common in libraries). You will see this pattern in `Tabs`, `Select`, `Menu`, `Dialog` implementations.
- **The lint rule from file 04 applies here**: this file exports four components plus a composed object. oxlint's `only-export-components` allows *constant* exports, and the `Card.Header` attachment is exactly that — which is why libraries like this often add an eslint/oxlint disable comment with an explanatory note.

When to use **context** instead of slot props: when the children are *not* written by the caller (dynamic, generated by `.map`, or from another library) and they still need shared state — e.g. a `<Select>` where each `<Select.Option>` must read the selected value. That is Part 5's material, and the trade-off is the same one as everywhere else: explicit props first, implicit context when the wiring would otherwise be unmanageable.

---

## 13. Summary

- A component is **a capitalised function taking one props object and returning renderable output**. Everything else (hooks, context) is optional machinery.
- **Component (definition) / element (description, created every render) / instance (React's record, owns state)** are three different things; conflating them is why state-loss bugs confuse people.
- **Render it, do not call it.** `<PriceTag />` gives React control (hooks dispatcher, scheduling, skipping, DevTools); `PriceTag({...})` breaks hooks and React's bookkeeping.
- A component may return an element, fragment, string, number, array, `null` or (React 19) `undefined` — but not an object or a function.
- **Composition is four mechanisms**: nesting, props down, callbacks up, slots via `children`. Pages compose; leaves render.
- **Components must be pure.** StrictMode renders twice on purpose and proves impurity; impurity also blocks React's optimisations.
- **Define components at module scope.** Nested definitions create a new component type per render, which unmounts the subtree and silently discards state (verified: typed text was lost).
- **Class components are legacy** — read them with the lifecycle → hooks table, do not start new code with them.
- The checklist: capital name, one per file, module scope, props in/events out, pure render, hooks at the top level.

---

**What's next →** [`08-props.md`](./08-props.md)
