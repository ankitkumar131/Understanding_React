# 08 — `useCallback`: Stable Functions, and Why They Sometimes Matter

> **Part 4 · State and Hooks · File 8 of 10**
> Why this file exists: every render creates brand-new functions for the closures in your JSX, and most of the time that is completely fine. But three things break when a function's identity changes unnecessarily: a `memo`-wrapped child re-renders anyway, an effect that depends on the function re-runs (restarting timers and re-subscribing sockets), and a context value churns every consumer. This chapter measures all three: a `memo` child rendering **once** with stable props and **five** times with fresh ones, a toast timer that was cancelled early because its callback changed identity, and a `useCallback` with a missing dependency that returns `0` forever while the screen says `3`.

---

## 1. Functions are values

```tsx
function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <button onClick={() => onSearch('monitor')}>
      Search for monitors
    </button>
  );
}
```

That arrow function is **created during the render** — a brand-new function object every time `SearchBox` runs. React does not care about the *body*; when it compares props or dependencies it uses `Object.is` on the reference, exactly as it does for objects and arrays (file 07, section 2).

So this is a "no" answer:

```ts
() => onSearch('monitor') === (previous render's version)   // false
```

In JSX for a plain DOM element (`<button onClick={…}>`) that does not matter at all: React attaches the handler and there is no props comparison. It matters when the function is passed to:

| Receiver | What it does with the reference | Consequence of a new reference every render |
| --- | --- | --- |
| A `memo`-wrapped component | compares props with `Object.is` | the child re-renders even though nothing changed |
| Another hook's dependency list (`useEffect`, `useMemo`, `useCallback`) | compares with `Object.is` | the effect re-runs: timers restart, subscriptions churn, fetches re-fire |
| A context value | compared with `Object.is` | every consumer re-renders (file 05) |
| A custom hook's returned API | consumers may put it in their own dependency lists | instability propagates down the tree |

`useCallback` freezes the identity of a function until its dependencies change:

```ts
const stableFn = useCallback((arg: T) => { /* … */ }, [deps]);
// literally: useMemo(() => (arg: T) => { … }, [deps])
```

---

## 2. Measured: the `memo` child and the prop that never changes

**File: `src/dev/ref-memo-probe.tsx`** (temporary harness) — a parent that re-renders itself four times, with a `memo`-wrapped child receiving either stable or freshly created props:

```tsx
const MemoChild = memo(function MemoChild({ label, meta, onPing }: ChildProps) {
  if (onPing.name === 'stablePing') stableChildRenders += 1;
  else unstableChildRenders += 1;
  return <span className="memo-child">{label}/{meta.tone}/{String(onPing !== undefined)}</span>;
});

function MemoParent({ stableProps }: { stableProps: boolean }) {
  const [tick, setTick] = useState(0);
  const stableOnPing = useCallback(() => {}, []);
  const stableMeta = useMemo(() => ({ tone: 'slate' }), []);
  return (
    <div>
      <MemoChild
        label="chip"
        meta={stableProps ? stableMeta : { tone: 'slate' }}
        onPing={stableProps ? stableOnPing : () => {}}
      />
      <button className="parent-tick" onClick={() => setTick(tick + 1)}>
        parent tick {tick}
      </button>
    </div>
  );
}
```

**Verified output:**

```text
6. memo() child inside a parent that re-rendered 4 times with stable (useCallback + useMemo) props
   child renders: 1   (the parent itself rendered 5 times)
6. memo() child inside a parent that re-rendered 4 times with freshly created props
   child renders: 5   (the parent itself rendered 5 times)
```

The parent rendered five times in both cases. With stable props, `memo` did its job: **one** child render for the whole session. With `{ tone: 'slate' }` and `() => {}` created inline, `memo` was defeated: **five** child renders, and everything that child does (formatting, layout, its own children) re-ran five times.

⚠️ **The lesson is not "wrap every function".** It is: *if* a child is wrapped in `memo` and its props include a function or an object, then **every** such prop must be stable — one unstable prop cancels all the others.

```tsx
// ❌ memo is useless here: `onPing` is new every render
<MemoChild label="chip" meta={stableMeta} onPing={() => {}} />

// ✅ all props stable
<MemoChild label="chip" meta={stableMeta} onPing={stableOnPing} />
```

---

## 3. Measured: the timer that restarted

This is the most convincing real-world case, and it comes from file 03's `<Toast>`.

A toast starts a 2.5-second timer in an effect whose dependency list includes `onDismiss`. If `onDismiss` gets a new identity on every parent render, the effect re-runs, the cleanup cancels the timer, and a new timer starts — so the toast stays on screen as long as the parent keeps rendering. The harness made the timing measurable by using `durationMs = 100` and a parent that re-rendered once at ~65 ms:

**Verified output** (`/tmp/part4-effect.txt`):

```text
5. durationMs=100, parent re-rendered once at t=65ms, onDismiss is STABLE (useCallback)
   at t=130ms (past the original deadline)  : toast on screen? false
   at t=260ms (past a restarted deadline)   : toast on screen? false
5. durationMs=100, parent re-rendered once at t=65ms, onDismiss is a NEW arrow every render
   at t=130ms (past the original deadline)  : toast on screen? true
   at t=260ms (past a restarted deadline)   : toast on screen? false
```

With a stable callback, the toast disappeared at its deadline (gone by 130 ms). With a fresh arrow, the toast was **still there** at 130 ms — the original timer had been cancelled and replaced at 65 ms, so it now expired around 165 ms.

That is the concrete case where `useCallback` is not an optimisation but a **behavioural** fix: the UI feature works correctly because the function identity is stable.

The lab's `Toast` documents the requirement right in its props:

```tsx
export interface ToastProps {
  message: string;
  /** Must be stable (memoised) — otherwise the timer restarts on every render. */
  onDismiss: () => void;
  durationMs?: number;
}
```

And `useCart` satisfies it by construction: `dismissToast` is wrapped in `useCallback(…, [])`, and its only dependency — `dispatch` from `useReducer` — never changes (measured in file 06: `dispatch from useReducer: same function on both renders? true`).

---

## 4. Measured: the dependency that must not be forgotten

A `useCallback` with `[]` freezes the *function* **and everything it closes over**. If the function reads state, it will read the first render's value forever.

**Verified:**

```text
11. useCallback(() => count, []) vs useCallback(() => count, [count])
   button: count=3   [] returns: 0   [count] returns: 3
```

After three clicks the button says `3`. The `[]` version still returns `0` — the closure captured render 0's `count` and the empty dependency list never let it be rebuilt. The `[count]` version returns `3`.

The same thing happens with props, and the fix is always one of:

```tsx
// 1. Add the dependency (the function is rebuilt when the value changes)
const logCount = useCallback(() => console.log(count), [count]);

// 2. Use the updater form when you only need to compute a new value
const increment = useCallback(() => setCount((c) => c + 1), []);

// 3. Read the newest value through a ref when identity must not change
const latest = useRef(count);
useEffect(() => { latest.current = count; }, [count]);
const logLatest = useCallback(() => console.log(latest.current), []);
```

⚠️ **Do not silence the linter.** The `react-hooks(exhaustive-deps)` rule checks `useCallback` too. If it reports a missing dependency, you have a stale-value bug waiting for a specific sequence of clicks.

```text
react-hooks(exhaustive-deps): React Hook useCallback has a missing dependency: 'count'. Either include it or remove the dependency array.
```

💡 **Sometimes the right fix is to delete the `useCallback`.** If a function is used *only* inside one effect, move it inside that effect: then it is re-created per effect run, it closes over the right values, and the dependency list shrinks to the values it actually reads.

```tsx
// ❌ the callback exists only to be a dependency; now two lists must be kept in sync
const load = useCallback(() => fetchProducts(id), [id]);
useEffect(() => { void load(); }, [load]);

// ✅ the function lives where it is used; one dependency list, no stale values
useEffect(() => {
  void fetchProducts(id);
}, [id]);
```

---

## 5. When `useCallback` pays

| Situation | Why stability matters | Lab example |
| --- | --- | --- |
| A prop of a `memo`-wrapped child | without it, `memo` is defeated (measured: 5 renders vs 1) | `<ProductCard onAddToCart={handleAddToCart} />` |
| A dependency of an effect that starts something | the effect re-runs, restarting timers / re-subscribing | `Toast`'s `onDismiss` (measured above) |
| The API returned by a custom hook | consumers put it in their own dependency lists and effects | `useCart`'s `add`/`remove`/`setQuantity`/`clear`/`dismissToast` |
| A value in a context object | a new function re-creates the object → every consumer re-renders (file 05) | `CartProvider`'s value |
| A prop to a third-party component that compares props by reference | behaves like `memo` | chart/table/map components |
| A callback stored in a ref by another hook | a new identity would look like "the callback changed" | `useKeyDown`'s `focusSearch` |

The lab's two real usages, both justified:

```tsx
// App.tsx — passed to ProductList (and, in a real catalogue, to memoised cards)
const handleAddToCart = useCallback(
  (product: Product) => {
    add({ id: product.id, name: product.name, priceMinor: product.priceMinor });
  },
  [add], // `add` is stable (it only calls dispatch), so this callback is created once
);
```

```ts
// hooks/useCart.ts — stable action creators, so consumers can depend on them safely
const add = useCallback((product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => {
  dispatch({ type: 'add', product });
}, []);
const remove = useCallback((productId: string) => dispatch({ type: 'remove', productId }), []);
const setQuantity = useCallback(
  (productId: string, quantity: number) => dispatch({ type: 'setQuantity', productId, quantity }),
  [],
);
const clear = useCallback(() => dispatch({ type: 'clear' }), []);
const dismissToast = useCallback(() => dispatch({ type: 'dismissToast' }), []);
```

Note that the empty dependency lists are *correct* here, not lazy: the functions only close over `dispatch`, which React guarantees is stable. (If you ever refactor one of them to read state directly, the linter will demand the dependency — that is the safety net working.)

---

## 6. When `useCallback` does **not** pay

| Situation | Why it is unnecessary | What to do instead |
| --- | --- | --- |
| `onClick={() => setOpen(true)}` on a `<button>` | DOM elements do not compare props; React just attaches the handler | leave it inline |
| A handler used once in the same component's JSX | nothing else compares it | leave it inline |
| A child that is **not** wrapped in `memo` | the child re-renders with its parent regardless of prop identity | `memo` the child, or accept the render |
| Wrapping every function "in case" | more code and dependency lists; readers lose the signal that something is hot | measure, then wrap |
| To fix a re-render storm caused by a bad state layout | the real fix is moving state down / splitting components | restructure (Part 10) |
| Only to satisfy an effect's dependency list | the function probably belongs *inside* the effect | move it in |
| Because a linter said "missing dependency" | the linter is describing a stale value, not asking for `useCallback` | add the dependency or restructure |

The cost of `useCallback` is not runtime performance (it is one comparison), it is **code and reasoning**: every hook adds a dependency list that must stay correct forever, and a file full of `useCallback` makes readers look for a performance problem that may not exist.

A useful test before adding one: **"if this function's identity changed on every render, what would break?"** If the answer is "nothing observable", do not wrap it. If the answer is "a memo child re-renders", "a timer restarts", or "an effect re-fires", wrap it — and write the reason in a comment, because the next person will otherwise delete it as noise.

---

## 7. The stability chain

Stability is rarely needed in one place; it usually has to hold along a chain. The lab's cart shows a complete chain, and file 05 measured its effect (4 consumer renders → 1):

```text
useReducer's dispatch        ← stable forever (React guarantees it)          file 06
        ↓
useCallback(...)             ← stable action creators (add, remove, …)      this file
        ↓
useMemo(() => ({ … }))       ← stable API object for the context value      file 07
        ↓
<CartContext value={api}>    ← value identity changes only with the cart     file 05
        ↓
memo(Consumer)               ← re-renders when the cart changes, not before
```

Two properties make the chain work, and both were verified:

- **`dispatch` is stable** (file 06) — so the action creators can be wrapped with `[]`.
- **`useMemo` keeps the object identity** (file 07) — so the context value does not churn.

Break any link and the symptom is always the same: consumers re-render more than they should. That is why "why is my app re-rendering?" is usually answered by reading three hooks in this order: the *value* memo, the *callbacks*, and the *child's* `memo`.

---

## 8. React Compiler and the future of `useCallback`

The same note as file 07 applies, with one addition: `useCallback` is the hook React Compiler makes most redundant, because automatic memoisation inserts exactly this stability where it can prove it is safe. Practical guidance:

- Keep wrapping where **behaviour** depends on identity (the toast timer, an effect that must not re-run, a custom hook's public API).
- Keep wrapping where a **measured** render count shows the benefit.
- Do not wrap "for the compiler": it works from the rules of React (purity, no mutation, stable hook order — file 10), not from your manual memos.
- Expect the compiler's `preserve-manual-memoization` diagnostic to keep your existing memos honest during migration — another reason not to write memos you do not need.

---

## 9. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Missing dependency in `useCallback` | the callback reads stale state (measured: `0` while the screen says `3`) | add the dependency, use the updater form, or use a ref |
| 2 | `memo` child with one unstable prop among stable ones | the child re-renders anyway | stabilise **all** function/object props |
| 3 | Wrapping every handler in `useCallback` | noise, dependency lists everywhere, no gain | wrap only where identity is observed |
| 4 | `useCallback` on a non-`memo` child | no effect on renders | `memo` the child first |
| 5 | A callback that is only used inside one effect | two dependency lists to keep in sync | move it inside the effect |
| 6 | `useCallback` to stop a re-render storm caused by state placement | the memo blocks nothing because the component itself re-renders | move state down, split components (Part 10) |
| 7 | Passing an inline arrow to a component whose prop is then used in an effect | the effect re-runs each render (the restarted-timer bug) | stabilise the callback, or read it through a ref |
| 8 | Using `useCallback` and then reading the value inside a `setTimeout` created elsewhere | that closure is still stale | read through a ref, or pass the value at call time |
| 9 | Forgetting that `useCallback` also has dependencies on props | stale props in the callback | list every prop the callback reads |
| 10 | Assuming `useCallback` makes the function *faster* | no runtime gain for calls | it is about identity, not speed |
| 11 | Disabling `exhaustive-deps` to keep an empty list | stale values forever | fix the dependency or restructure |
| 12 | A custom hook returning new functions every render, "because it works" | every consumer's effects churn | stabilise the hook's API (this is a hook contract, not an optimisation) |

---

## 10. Best practices

1. **Write the reason in a comment** when you wrap a function: "stable: `Toast`'s timer restarts if this changes". Future readers will thank you.
2. **Use the updater form** (`setCount((c) => c + 1)`) instead of depending on a value you only need to advance.
3. **Use a ref for "latest value"** when the identity must not change (file 04).
4. **Move single-use functions inside their effect** and delete the hook.
5. **Stabilise whole prop sets**, not just the callback: an unstable `style` or `meta` object defeats `memo` just as thoroughly.
6. **Treat custom-hook APIs as public contracts**: return stable callbacks so consumers can depend on them.
7. **Verify with a render count** (a temporary `console.count` in the child, or React DevTools' "highlight updates") before and after.
8. **Do not fight the compiler later**: memos you cannot justify today will look like noise when it arrives.
9. **Remember the dependency rule**: `useCallback` freezes the closure, not just the function.
10. **Prefer a design change over a memo** when a re-render storm is caused by state living too high (Part 10).

---

## 11. Real-world example: every `useCallback` in the lab, and its justification

| Callback | Wrapped? | Why |
| --- | --- | --- |
| `useCart`: `add`, `remove`, `setQuantity`, `clear`, `dismissToast` | ✅ `[]` | they are the hook's public API; consumers use them in props, effects and context values; they only close over the stable `dispatch` |
| `App`: `handleAddToCart` | ✅ `[add]` | passed down to the product list; stable as long as `add` is stable |
| `App`: `focusSearch` (for the `/` shortcut) | ✅ `[]` | stored in a ref by `useKeyDown`; a new identity would look like "the handler changed" |
| `useDocumentTitle`: none | — | the hook takes a value, not a callback |
| `useKeyDown`: `onKeyDown` inside the effect | ❌ not wrapped | it is created *inside* the effect, which is the correct place: the effect owns its lifetime, so its identity doesn't matter |
| `Toast`: `onDismiss` | the *caller's* responsibility | the component documents the requirement instead of hiding it |
| `SearchBar`: `handleChange`, `handleSubmit` | ❌ | used by a plain DOM element and a `<form>`; nothing compares them |

Seven wrapped callbacks in the whole app, each with a stated reason, and two places where the right answer was to leave the function alone. Notice also the alternative that shows up twice: **creating the function inside the effect that uses it** — the simplest way to avoid a stale closure *and* an unnecessary `useCallback` at the same time.

---

## 12. Practice

### Beginner — stabilise the prop set

This component re-renders its `memo`-wrapped child on every parent render. Fix it, then verify with `console.count('RowCard')` in the child.

```tsx
const RowCard = memo(function RowCard({ product, onSelect, style }: RowCardProps) {
  console.count('RowCard');
  return (
    <li style={style} onClick={() => onSelect(product.id)}>
      {product.name}
    </li>
  );
});

function ProductRows({ products }: { products: readonly Product[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  return (
    <div>
      <button onClick={() => setTick((t) => t + 1)}>unrelated {tick}</button>
      <ul>
        {products.map((product) => (
          <RowCard
            key={product.id}
            product={product}
            onSelect={(id) => setSelected(id)}
            style={{ padding: 8 }}
          />
        ))}
      </ul>
    </div>
  );
}
```

Requirements: while clicking "unrelated", `RowCard` must stay at **one render per product**. Do it without changing the JSX's shape (`RowCard` still receives `product`, `onSelect`, `style`), and write one comment explaining each memo you add.

### Intermediate — make the toast behave, then measure

**File: `src/practice/AutoToast.tsx`** — a component that shows a message and hides it after 1500 ms, driven by a parent that re-renders every 300 ms for an unrelated reason.

Requirements:

1. First write the parent so the toast's callback is an inline arrow, and observe that the toast **never disappears** while the parent keeps ticking (this is the measured bug from section 3).
2. Then fix it with `useCallback` in the parent, and confirm the toast disappears after 1500 ms even though the parent renders five times in that window.
3. Then produce a **third** version where the child itself is memoised but the callback is still inline, and explain in one sentence why that does not help.
4. Finally, produce a fourth version where the parent passes no callback at all — instead it passes a `visible` boolean and the child calls `onHidden()` from a stable handler that the *child* owns.

### Challenge — a stabilised custom hook API

**File: `src/practice/useSortableList.ts`** — a hook that owns a sort key and returns `{ sort, rows, setSort, toggleSort, resetSort }`:

- `rows` must keep its identity while `sort` and `items` are unchanged (verify with the identity-logging technique from file 07, section 2).
- `setSort`, `toggleSort`, `resetSort` must be stable across renders (verify with a render count in a `memo`-wrapped consumer that receives them as props).
- The comparator must handle ties deterministically (`localeCompare` on the name after comparing the numeric fields).
- Sorting must never mutate `items` (verify by freezing the array with `Object.freeze([...items])` in the test).
- Then answer: if a consumer puts `toggleSort` in a `useEffect` dependency list, how many times does that effect run over five unrelated parent renders — and why does the answer depend on the hook's implementation rather than on the consumer?

---

## 13. Solutions

### Beginner

```tsx
import { memo, useCallback, useMemo, useState } from 'react';

interface RowCardProps {
  product: Product;
  onSelect: (id: string) => void;
  style: CSSProperties;
}

// The style object is the same for every row, so it belongs OUTSIDE the component:
// a module constant is created once and can never be "unstable".
const ROW_STYLE: CSSProperties = { padding: 8 };

const RowCard = memo(function RowCard({ product, onSelect, style }: RowCardProps) {
  console.count('RowCard');
  return (
    <li style={style} onClick={() => onSelect(product.id)}>
      {product.name}
    </li>
  );
});

function ProductRows({ products }: { products: readonly Product[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // One stable handler for all rows (instead of one per row), so every card gets
  // the SAME function object and `memo` can skip it.
  const handleSelect = useCallback((id: string) => setSelected(id), []);

  return (
    <div>
      <button onClick={() => setTick((t) => t + 1)}>unrelated {tick}</button>
      <ul>
        {products.map((product) => (
          <RowCard key={product.id} product={product} onSelect={handleSelect} style={ROW_STYLE} />
        ))}
      </ul>
    </div>
  );
}
```

Three comments' worth of reasoning: `handleSelect` is wrapped because it is a prop of a `memo` child; `ROW_STYLE` moved to module scope because it never depends on render data (a `useMemo(() => ({ padding: 8 }), [])` would also work, but a constant is simpler and survives even faster); and `product` needs no memoisation because the array's elements are already stable objects from the data layer. `selected` is state that no card *receives*, so changing it does not touch the cards at all — a nice side effect of passing `id` to the parent rather than a `selected` boolean to each row.

### Intermediate

```tsx
import { memo, useCallback, useEffect, useState } from 'react';

// Version 4 — the most robust design: the CHILD owns its own timer, and the
// parent only tells it whether to be visible. No callback in the dependency list,
// nothing to stabilise in the parent, and the child is testable on its own.
const AutoHideMessage = memo(function AutoHideMessage({ message, onHidden }: { message: string; onHidden: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onHidden, 1500);
    return () => window.clearTimeout(timer);
  }, [message, onHidden]);
  return <div role="status">{message}</div>;
});

export function Parent() {
  const [visible, setVisible] = useState(true);
  const [tick, setTick] = useState(0);

  // Version 2 fix: stable, so the timer is not restarted by the ticks below.
  const hide = useCallback(() => setVisible(false), []);

  return (
    <div>
      <button type="button" onClick={() => setTick((t) => t + 1)}>
        unrelated tick {tick}
      </button>
      {visible ? <AutoHideMessage message="Saved" onHidden={hide} /> : <p>Hidden</p>}
    </div>
  );
}
```

Answers: (1) with an inline arrow, every parent tick creates a new `onHidden`, so the effect re-runs, the cleanup clears the pending timer and a new 1500 ms timer starts — the toast survives indefinitely while the parent keeps rendering. (2) `useCallback(…, [])` keeps the identity, so the effect runs once and the toast disappears on schedule. (3) memoising the **child** does not help because the problem is not the child's re-rendering — it is the *identity of a prop in the child's effect dependency list*; the child would still receive a new callback with each parent render that reaches it. (4) the fourth version removes the callback from the parent's render path entirely: the child owns its timer (it already had one), and `onHidden` is the only thing that must be stable — which the parent supplies with `useCallback`. (If even that feels too fragile, `useRef`-based "latest callback" handling inside the child, as in `useKeyDown`, makes the child immune to unstable callbacks altogether.)

### Challenge

**File: `src/practice/useSortableList.ts`**

```ts
import { useCallback, useMemo, useState } from 'react';

export type SortKey = 'name' | 'price-asc' | 'price-desc';

const collator = new Intl.Collator('en-IN');

function compare<T extends { name: string; priceMinor: number }>(key: SortKey, a: T, b: T): number {
  switch (key) {
    case 'name':
      // Deterministic tie-break so equal names keep a stable order.
      return collator.compare(a.name, b.name) || a.priceMinor - b.priceMinor;
    case 'price-asc':
      return a.priceMinor - b.priceMinor || collator.compare(a.name, b.name);
    case 'price-desc':
      return b.priceMinor - a.priceMinor || collator.compare(a.name, b.name);
    default: {
      const unhandled: never = key;
      throw new Error(`Unhandled sort key: ${String(unhandled)}`);
    }
  }
}

export function useSortableList<T extends { name: string; priceMinor: number }>(items: readonly T[]) {
  const [sort, setSortState] = useState<SortKey>('name');

  // Identity stable while `items` and `sort` are unchanged.
  const rows = useMemo(() => [...items].sort((a, b) => compare(sort, a, b)), [items, sort]);

  // Stable API: `[]` for the two that need nothing, and `[]` for the toggler
  // because it uses the updater form instead of reading `sort`.
  const setSort = useCallback((next: SortKey) => setSortState(next), []);
  const resetSort = useCallback(() => setSortState('name'), []);
  const toggleSort = useCallback(
    () => setSortState((current) => (current === 'price-asc' ? 'price-desc' : current === 'price-desc' ? 'name' : 'price-asc')),
    [],
  );

  return { sort, rows, setSort, toggleSort, resetSort };
}
```

Answer to the closing question: the effect runs **once**, no matter how many unrelated parent renders happen — because `toggleSort` is created once (`[]` dependencies, and the updater form means it never needs to read `sort`). The point of the question is that this is a property of the **hook**, not of the consumer: `useCallback(…, [sort])` would have been "correct" too (no stale value) but would change identity on every sort change, forcing the consumer's effect to re-run for a reason the consumer cannot see or control. When you publish a hook, its API stability is part of its contract — the same reason `useCart` returns wrapped action creators.

---

## 14. Summary

- Every render creates new function objects; React compares props and dependencies with `Object.is`, so a new function is a *changed* value.
- `useCallback(fn, deps)` freezes a function's identity until its dependencies change — it is `useMemo` for functions.
- **Measured:** a `memo` child rendered **1** time with stable props and **5** times with inline ones, over five parent renders.
- **Measured:** an unstable `onDismiss` restarted a toast's timer — the toast was still on screen past its deadline.
- **Measured:** `useCallback(() => count, [])` returned `0` forever while the screen said `3`; `[count]` returned `3`.
- Wrap callbacks when they are props of `memo` children, dependencies of effects that start things, part of a context value, part of a custom hook's public API, or props of reference-comparing third-party components.
- Do not wrap inline DOM handlers, single-use functions, or anything feeding a child that is not `memo`-ised; and do not wrap "just in case".
- The dependency list includes props and state the function reads — and the alternative to a long list is often to move the function **inside** the effect that uses it.
- Stability is a **chain**: stable `dispatch` → wrapped callbacks → memoised value → stable context value → `memo` consumers. Fixing one link without the others changes nothing.
- React Compiler will insert much of this automatically; keep the memos that protect **behaviour**, keep the ones a measurement justifies, and delete the rest.

---

**What's next →** [`09-custom-hooks.md`](./09-custom-hooks.md): everything in this part, packaged for reuse. We will read the lab's `useCart`, `useLocalStorageState`, `useDebouncedValue`, `useKeyDown` and `useDocumentTitle` line by line — the lazy initialiser that reads storage once, the ref that keeps a document listener fresh, the options object that makes a hook configurable, and the testing and naming rules that separate a good custom hook from a hook-shaped function.
