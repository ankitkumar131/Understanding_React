# 07 — `useMemo`: Caching Values, and Knowing When Not To

> **Part 4 · State and Hooks · File 7 of 10**
> Why this file exists: `useMemo` is sold as "make React fast", and used that way it usually makes code slower to read and no faster to run. It solves exactly two problems — **an expensive computation that should not run on every render**, and **a value that must keep the same identity between renders** — and those two problems have precise symptoms. This chapter measures both: a computation that ran 1 time with `useMemo` and 3 times without it, an array that kept its identity across three renders while a plain array was rebuilt every time, and the "memo that never hits" case where the optimisation is pure overhead.

---

## 1. Two problems, one hook

Memoisation means **caching the result of a computation together with the inputs that produced it**. `useMemo` stores one previous result per hook slot and re-uses it when the dependency list is unchanged (`Object.is` comparison, element by element).

```ts
const memoised = useMemo(() => compute(a, b), [a, b]);
```

It exists to solve two different problems, and it is worth separating them because they have different symptoms:

| Problem | Symptom you can see | What `useMemo` buys |
| --- | --- | --- |
| **Expensive computation** | a slow render, a janky interaction, a profiler flame graph with one huge bar | the computation runs once per dependency change instead of once per render |
| **Unstable identity** | a `memo`-wrapped child re-renders anyway; an effect re-runs on every render; a context consumer re-renders constantly | the *reference* stays the same, so `Object.is` comparisons elsewhere hold |

Everything else — "React will be faster if I wrap this number" — is noise. A memoised `count + 1` costs a dependency comparison and a slot in React's memory; it saves nothing.

---

## 2. Identity, measured

Start with the second problem, because it is the one people get wrong most often.

**File: `src/dev/ref-memo-probe.tsx`** (temporary harness) — a component that creates one array through `useMemo` and one plainly, and logs whenever either array **changes identity**, by using each array as an effect dependency (effects compare with `Object.is`, exactly like React's memoisation):

```tsx
function MemoIdentity({ tick }: { tick: number }) {
  const memoized = useMemo(() => [1, 2, 3], []);
  const plain = [1, 2, 3];

  useEffect(() => {
    console.log(`(render ${tick}) memoized array changed`);
  }, [memoized]);
  useEffect(() => {
    console.log(`(render ${tick}) plain array changed`);
  }, [plain]);

  return <span className="memo-id">{`${memoized.length}/${plain.length}`}</span>;
}
```

**Verified output** for three renders:

```text
3. identity of the value a useMemo returns (three renders)
   (render 0) memoized array changed
   (render 0) plain array changed
   (render 1) plain array changed
   (render 2) plain array changed
```

Read the pattern: the `useMemo` array **changed once** (when it was created on the first render) and then stayed the same object for the next two renders. The plain array changed **every** render — a brand-new array each time, compared with `Object.is`, always "different".

That difference is invisible until something else depends on it:

| Consumer of the value | With a stable reference | With a new reference each render |
| --- | --- | --- |
| `useEffect(..., [value])` | the effect runs when the *contents* change | the effect runs **every render** |
| `memo(Child)` receiving it as a prop | the child re-renders when the value changes | the child re-renders every render — `memo` is defeated |
| `<Context value={…}>` | consumers re-render when the value changes | every consumer re-renders on every provider render (file 05) |
| `useCallback`/`useMemo` that depend on it | recomputes when the value changes | recomputes every render |

That is why "objects and functions in a dependency array" is not an edge case; it is the difference between an effect that runs twice a session and one that runs sixty times a second.

---

## 3. Cost, measured

The first problem — recomputation — needs an actual measurement, because "expensive" is a claim, not a feeling.

**Verified** — the same `n` at every render, so the memo's dependency never changed:

```text
4. an expensive calculation over three renders (same n every time)
   useMemo(() => heavy(n), [n]) : ran 1x
   heavy(n) called directly     : ran 3x
```

One call versus three. In a real app the numbers grow with the input: a 50,000-row sort takes ~80 ms, and running it on every render (including every unrelated keystroke in the same component) turns a smooth screen into a visible stutter. The `useMemo` version runs it when the rows or the sort key change — and not otherwise.

⚠️ **Do not memoise before measuring.** The lab's own filter runs in microseconds over 8 products; wrapping it in `useMemo` there is about *identity for memoised children*, not about the cost of filtering. File 10 (Part 10) covers the measurement tooling (React DevTools Profiler); rule of thumb until then: if the computation is under a millisecond, memoise only for identity.

---

## 4. The trap: a memo that never hits

The most common misuse of `useMemo` looks like this:

```tsx
function ExpensiveList({ products, page }: { products: readonly Product[]; page: number }) {
  const options = { page };                 // ← a NEW object on every render
  const pageSlice = useMemo(() => {
    return products.slice(options.page * 10, options.page * 10 + 10);
  }, [options]);                            // ← never equal to last render's object

  return /* … */;
}
```

**Verified** — a memo whose dependency object is rebuilt every render:

```text
5. useMemo with a dependency that is rebuilt on every render: ran 3x over 3 renders
   (the memo never hits — it is pure overhead until the dependency is stable)
```

Three renders, three runs: the memo never helped, and the linter said so in advance:

```text
react-hooks(exhaustive-deps): React hook useEffect depends on `options`, which changes every render
```

(That message came from an `useEffect` in the same harness; `useMemo` gets the same style of diagnostic, because both hooks use the same dependency machinery.)

Three fixes, in order of preference:

```tsx
// 1. Depend on the primitives that actually matter
const pageSlice = useMemo(() => products.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [products, page]);

// 2. Memoise the object (when it genuinely is a unit you pass around)
const options = useMemo(() => ({ page, sort }), [page, sort]);
const pageSlice = useMemo(() => query(options), [options, query]);

// 3. Move it out of the component entirely — the cheapest fix of all
const PAGE_SIZE = 10;   // module scope: created once, never re-created
```

Diagnostic question for any memo that seems useless: **"is every dependency the same value as last render?"** If one of them is an object, array, or function created during this render, the answer is no.

---

## 5. Where `useMemo` genuinely pays

| Use case | Why it helps | Lab example |
| --- | --- | --- |
| A genuinely expensive derivation (sorting, grouping, parsing, an `Intl` formatter built per locale) | avoids recomputing on unrelated renders | a 50,000-row sort in a report screen |
| A value passed to a `memo`-wrapped child | keeps the child's props identical, so `memo` can skip it | `visible` handed to `<ProductList />` |
| A value used in another hook's dependency list | keeps that effect/memo stable | the `options` object handed to a fetch effect |
| A context value | stops every consumer re-rendering on unrelated provider renders (file 05 measured 4 renders → 1) | `useCart`'s memoised API object |
| An object built for a third-party library that compares props by reference | honours the library's contract | chart data, map layers, table columns |
| A formatter/parser whose construction is measurable | constructed once per dependency change | `new Intl.NumberFormat(...)` for a rarely changing currency |

**The lab's real usage** — two places, both justified:

```tsx
// App.tsx — `visible` and `counts` are handed to memoised-ish children and used
// by several components; keeping their identity stable when the inputs did not
// change is what the memo is for here (the filtering itself is trivial).
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
```

```ts
// hooks/useCart.ts — the memoised API object is provided through context, so a
// fresh object on every render would re-render every consumer (file 05).
return useMemo(
  () => ({ state, itemCount, subtotalMinor, add, remove, setQuantity, clear, dismissToast }),
  [state, itemCount, subtotalMinor, add, remove, setQuantity, clear, dismissToast],
);
```

Notice the second example's dependency list: `state` changes on every cart change (correct — consumers must re-render), while the seven fields listed individually include the stable action creators so that the memo is not recreated on unrelated renders.

---

## 6. Where `useMemo` does not pay

| Situation | Why it is a net loss | Better |
| --- | --- | --- |
| `useMemo(() => a + b, [a, b])` | the comparison costs as much as the addition | compute it |
| A value used only inside this component's own JSX | nothing else compares it | compute it |
| Wrapping every value "just in case" | more code, more dependency lists to maintain, slots held in memory | measure first, memoise what shows up |
| A child that is not wrapped in `memo` | the parent re-renders it anyway; a stable prop changes nothing | `memo` the child, or accept the render |
| To make `===` work as *correctness* (e.g. "this must be the same array") | React may discard memo caches; correctness must not depend on it | restructure so identity does not matter |
| Because the linter suggested it | the linter is warning about a *dependency-array* problem, not demanding a memo | fix the dependency list |

Both halves of that table matter. `useMemo` is not free: it retains the previous values (memory), it adds a dependency list to keep correct (maintenance), and it gives the reader a hint that something here is performance-sensitive (a hint that is false if it is not).

---

## 7. `useMemo` vs the alternatives

| You want | Tool | Note |
| --- | --- | --- |
| A derived value | compute during render | the default; file 01 |
| A derived value that is expensive or must keep its identity | `useMemo` | this file |
| A derived value that survives unmount / is shared across components | a store, cache, or `localStorage` | memo caches live and die with the component instance |
| A stable *function* | `useCallback` | file 08 — literally `useMemo(() => fn, deps)` |
| A value that is expensive to *create* once, for the component's whole life | `useState` with a lazy initialiser, or `useRef` | file 02 / 04 |
| A value derived from server data | a data library's cache | Part 7 |

⚠️ **Never put side effects inside `useMemo`.** It looks like an effect because it "runs at a specific time", but the computation is part of *rendering*:

```tsx
// ❌ wrong tool, wrong place: this is a side effect in a render-phase function
useMemo(() => {
  trackEvent('list_rendered');
  return products.length;
}, [products]);

// ✅ side effects belong in effects (or better: in the event that caused them)
useEffect(() => {
  trackEvent('list_rendered');
}, [products]);
```

The React Compiler's lint set has a rule precisely for this misuse (`use-memo`: "Validates usage of the `useMemo` hook without a return value"), and the practical consequence of getting it wrong is that the side effect runs during React's render phase — possibly twice (StrictMode), possibly never (if React discards the render), and definitely at a time you do not control.

---

## 8. Dependencies, again (and the linter's real messages)

`useMemo` uses the same dependency machinery as `useEffect`, with the same rules:

- Every reactive value the computation reads belongs in the list.
- Objects, arrays and functions created during render never compare equal — memoise their *source*, or depend on primitives.
- An empty list means "this value is fully determined at creation time" (a constant, a formatter, a config object).

```tsx
// ✅ a formatter built once for the component's life
const money = useMemo(() => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }), []);

// ✅ recomputed only when the inputs change
const grouped = useMemo(() => groupByCategory(products, sortKey), [products, sortKey]);

// ❌ the classic: the object is new every render, so the memo never hits
const options = { sortKey };
const grouped = useMemo(() => groupByCategory(products, options), [options, products]);
```

If the linter reports `React Hook useMemo has a missing dependency` or `depends on 'x', which changes every render`, the fix is the same as file 03: **fix the dependency, or restructure** — never disable the rule.

---

## 9. React Compiler changes the conversation

Everything above is manual memoisation: you decide what to cache and write the dependency list. Since React 19, there is an official alternative — **React Compiler** — that analyses components and inserts memoisation automatically where it can prove it is safe.

What this means for you, concretely:

- **Keep learning `useMemo`.** The lab (and most codebases you will join) runs without the compiler, and `useMemo` remains the correct tool for the two problems in section 1.
- **Do not scatter `useMemo` "for the compiler".** React's documentation is explicit that the compiler works from the *rules of React* (purity, no mutation, correct hook order — file 10) rather than from manual memos, and that once it is enabled you can often *remove* manual memoisation for values it can derive itself.
- **The migration path is the linter.** `eslint-plugin-react-hooks` v7 ships the compiler's diagnostics (`purity`, `immutability`, `refs`, `set-state-in-render`, `preserve-manual-memoization`, …) so you can adopt them *before* enabling the compiler. Some of those diagnostics already appear in this lab's oxlint output for our deliberately impure harness files.
- **`useMemo` becomes a tool for the compiler too.** `preserve-manual-memoization` exists to make sure your hand-written memos keep working when the compiler runs around them — which is another reason to keep them correct and few.

The honest summary: **manual memoisation is still what you control today; the compiler is where the boilerplate is going.** Write memos for the two real problems, keep them correct, and treat "the compiler will handle it" as a reason to write *fewer* memos than an excuse to ignore the rules.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | An object/array/function in the dependency list, created during render | the memo never hits (measured: 3 runs over 3 renders) | depend on primitives, or memoise the object |
| 2 | Memoising cheap arithmetic | more code, no measurable gain | compute it |
| 3 | Using `useMemo` for a side effect | double execution / missing execution / side effects during render | `useEffect`, or the event handler |
| 4 | Using `useMemo` for correctness ("the ref must be the same object") | works until React discards a cache | restructure; memoisation is a performance hint |
| 5 | Memoising a value but passing a fresh object elsewhere in the same props | the `memo` child still re-renders | stabilise **all** props of that child (file 08) |
| 6 | Missing dependencies | stale values — the memo returns yesterday's result | include everything you read |
| 7 | Wrapping a component's entire render output in one giant memo | hard to read, hard to keep correct | split into components |
| 8 | Assuming `useMemo` runs once | it runs whenever a dependency changes (including the first render) | read the dependency list as "when this recomputes" |
| 9 | Using `useMemo` where `useCallback` belongs | a memo returning a function works, but reads wrongly | `useCallback(fn, deps)` |
| 10 | Memoising results that depend on props you forgot | values frozen at the first render | list the props |
| 11 | A memo for every value "to be safe" | dependency lists rot; readers lose the signal that something is hot | measure, then memoise |
| 12 | Using `useMemo` to keep a value alive after unmount | the cache dies with the component | a store, a module-level cache, or storage |

---

## 11. Best practices

1. **Ask which problem you are solving**: cost or identity. If neither, delete the memo.
2. **Measure before you memoise** — the profiler, not intuition.
3. **Keep computations pure.** `useMemo` runs during render.
4. **Depend on primitives** wherever possible; memoise objects at their source.
5. **Let the linter own the dependency list.** A warning here is a bug report.
6. **Memoise the value, not the whole JSX**, when only one derived thing is hot.
7. **Treat a memo as a contract with the reader**: "this is expensive or identity-sensitive". Delete it when it stops being true.
8. **Prefer moving work out of the component** (module constants, precomputed maps, a utility) over caching it inside.
9. **When the identity matters downstream, stabilise the whole chain** — `useMemo` for objects, `useCallback` for functions (file 08), `memo` for components, and a memoised context value (file 05).
10. **Revisit memos when adopting React Compiler**: `preserve-manual-memoization` will keep them working, but the compiler's job is to make most of them unnecessary.

---

## 12. Real-world example: the three memos in MegaShop (and the ones we refused)

| Value | Memoised? | Why |
| --- | --- | --- |
| `visible` (filtered products) | ✅ `useMemo([category, query])` | it is passed down as props and read by several components; keeping its identity stable when the inputs did not change is cheap and prevents downstream work |
| `counts` (per-category totals) | ✅ `useMemo([])` | computed once from the static catalogue; recomputing it every render would allocate a new object for no change |
| `useCart`'s returned API object | ✅ `useMemo` over state + stable actions | it is the context value; a fresh object would re-render every consumer (measured in file 05: 4 renders vs 1) |
| `handleAddToCart` | ✅ `useCallback([add])` | a stable prop for a list of cards (file 08) |
| `totalMinor`, `itemCount` inside the cart panel | ❌ | trivial arithmetic over a handful of lines; used in the same component that computes them |
| `formatMoney(...)` results | ❌ | cheap, and memoising them would freeze the formatting (a locale change should re-format) |
| `COMPARE_AT` (the compare-at price table) | ❌ — it is a **module constant** | the cheapest optimisation is not needing the hook at all |
| `Math.round((savingsMinor / compareAtMinor) * 100)` | ❌ | arithmetic; the real fix was naming it in a `const` above the JSX (Part 3, file 09) |

Three memos out of eight candidate values, each with a stated reason. That ratio — *some* memoisation, never everywhere — is what a healthy React codebase looks like, and it stays healthy when the compiler arrives.

---

## 13. Practice

### Beginner — find and fix the memo that never hits

The component below has a `useMemo` that runs on every render. Fix it **three** different ways (primitives, a memoised object, and moving a value to module scope), and for each version say what changed.

```tsx
const PAGE_SIZE = 10;

function PaginatedList({ products, page }: { products: readonly Product[]; page: number }) {
  const settings = { page, pageSize: PAGE_SIZE };
  const slice = useMemo(() => {
    const start = settings.page * settings.pageSize;
    return products.slice(start, start + settings.pageSize);
  }, [settings, products]);

  return (
    <ul>
      {slice.map((product) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  );
}
```

Then add `console.count('slice computed')` inside the memo and verify in the browser: with the broken version, the count grows every time the parent re-renders (click something unrelated); with each fixed version, it grows only when `page` or `products` changes.

### Intermediate — memoise a context value and prove it

Using the `ThemeProvider` from file 05's exercise, add an unrelated `useState` counter inside the provider (not part of the context value).

Requirements:

- `console.count('ThemedCard')` inside a `memo`-wrapped consumer.
- Click the unrelated counter five times → the consumer's count must **not** grow. (It will, if the value object is not memoised — prove both directions.)
- Then add a genuinely expensive computation to the provider (a loop of a few million iterations, or `Array.from({ length: 2_000_000 }, (_, i) => i).filter(i => i % 7 === 0).length`) and memoise it with `[]`. Measure the difference in the profiler, or simply observe the interaction latency with the counter button: without the memo, each click costs the full computation.
- Answer: which of the two problems (cost or identity) does each of the two memos in this exercise solve?

### Challenge — a `useMemo`-based memoised selector factory

**File: `src/practice/useTopProducts.ts`**

Write a hook `useTopProducts(products: readonly Product[], limit: number)` that:

- groups products by category (a `Record<Category, Product[]>`, built once per `products` change),
- sorts each group by rating descending, then by name (`Intl.Collator`) for ties,
- returns the top `limit` per category,
- returns an object `{ byCategory, totalKept }` whose **identity** only changes when `products` or `limit` changes (prove it with an effect that logs on identity change, like section 2),
- runs the whole pipeline exactly once per dependency change — verify with a counter, and confirm that re-rendering the consuming component for an unrelated reason does not re-run it.

Then answer three questions:

1. Why is `[products, limit]` the right dependency list, and what would `[products]` alone do?
2. Why must the sort operate on a copy of each group?
3. If `products` is a new array on every parent render (for example, because the parent builds it with `.filter()` inline), what happens to this hook's memo, and what are the two possible fixes?

---

## 14. Solutions

### Beginner

```tsx
const PAGE_SIZE = 10;

// Fix 1 — depend on the primitives that matter (simplest, always correct)
function PaginatedListPrimitives({ products, page }: { products: readonly Product[]; page: number }) {
  const slice = useMemo(() => {
    const start = page * PAGE_SIZE;
    return products.slice(start, start + PAGE_SIZE);
  }, [page, products]);
  // …
}

// Fix 2 — memoise the settings object when it is a real unit you pass around
function PaginatedListMemoObject({ products, page }: { products: readonly Product[]; page: number }) {
  const settings = useMemo(() => ({ page, pageSize: PAGE_SIZE }), [page]);
  const slice = useMemo(() => {
    const start = settings.page * settings.pageSize;
    return products.slice(start, start + settings.pageSize);
  }, [settings, products]);
  // …
}

// Fix 3 — notice that nothing was dynamic in the first place
// `PAGE_SIZE` was already a module constant; the only dynamic part was `page`,
// so Fix 1 *is* Fix 3 applied properly. Moving the whole computation out of the
// component is the right answer when the inputs are module-level:
const sliceProducts = (products: readonly Product[], page: number): Product[] => {
  const start = page * PAGE_SIZE;
  return products.slice(start, start + PAGE_SIZE);
};
// …and then: const slice = sliceProducts(products, page);  // no memo needed at all
```

What changed in each case: **Fix 1** removed the unstable dependency. **Fix 2** kept one object but gave it a stable identity, so both memos hit. **Fix 3** removed the need for memoisation entirely — the cheapest and most readable option, and the one to look for first. The `console.count` experiment behaves as described: the broken version counts on every parent render; all fixed versions count only when `page` or `products` changes.

### Intermediate

```tsx
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeValue } from './themeContext';

const expensiveGrouping = (): number =>
  Array.from({ length: 2_000_000 }, (_, i) => i).filter((n) => n % 7 === 0).length;

function ThemedCardInner({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  console.count('ThemedCard');
  return <div className={theme === 'dark' ? 'card card--dark' : 'card'}>{children}</div>;
}
const ThemedCard = memo(ThemedCardInner);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [clicks, setClicks] = useState(0); // unrelated to the context value

  // Problem 2 (identity): a memoised value keeps consumers from re-rendering.
  const toggle = useCallback(() => setTheme((current) => (current === 'light' ? 'dark' : 'light')), []);
  const value = useMemo<ThemeValue>(() => ({ theme, toggle }), [theme, toggle]);

  // Problem 1 (cost): computed once, not on every click.
  const stats = useMemo(() => expensiveGrouping(), []);

  return (
    <ThemeContext value={value}>
      <button type="button" onClick={() => setClicks((c) => c + 1)}>
        unrelated counter: {clicks} (stats: {stats})
      </button>
      {children}
    </ThemeContext>
  );
}
```

Answers: the `value` memo solves **identity** — without it, `ThemedCard` (which is `memo`-wrapped and therefore only re-renders when its props or its context value change) would re-render on every click of the unrelated counter. The `stats` memo solves **cost** — without it, every click would re-run a two-million-item loop before the counter could move, and the button would feel stuck. Two memos, two different problems, both necessary — and notice that neither would be justified by "memoise everything": each has a specific symptom it removes.

### Challenge

**File: `src/practice/useTopProducts.ts`**

```ts
import { useMemo } from 'react';
import { CATEGORIES, type Category, type Product } from '../data/products';

export interface TopProducts {
  byCategory: Record<Category, Product[]>;
  totalKept: number;
}

const collator = new Intl.Collator('en-IN');

export function useTopProducts(products: readonly Product[], limit: number): TopProducts {
  return useMemo(() => {
    const groups = Object.fromEntries(CATEGORIES.map((category) => [category, [] as Product[]])) as Record<
      Category,
      Product[]
    >;
    for (const product of products) groups[product.category].push(product);

    const byCategory = Object.fromEntries(
      CATEGORIES.map((category) => {
        // Copy before sorting: `sort` mutates, and the group array is ours to mutate
        // but the SORT must not depend on insertion order for tie-breaks.
        const sorted = [...groups[category]].sort(
          (a, b) => b.rating - a.rating || collator.compare(a.name, b.name),
        );
        return [category, sorted.slice(0, limit)];
      }),
    ) as Record<Category, Product[]>;

    const totalKept = Object.values(byCategory).reduce((sum, group) => sum + group.length, 0);
    return { byCategory, totalKept };
  }, [products, limit]);
}
```

The three answers:

1. `[products, limit]` names both inputs the computation reads. `[products]` alone would freeze `limit` at its first value: changing the limit would not recompute, and the UI would silently ignore the control (a bug that is easy to "fix" by adding `limit` to the slice expression but forgetting the dependency list — which is exactly why the linter exists).
2. `[...groups[category]]` copies before sorting because `Array.prototype.sort` mutates its receiver. Sorting the group in place would corrupt the grouping for any later consumer, and it would make the result depend on the order in which sorting happened — the definition of a hidden coupling.
3. If `products` is a new array on every parent render (an inline `.filter()` in the parent's JSX), this memo **never hits**: every render recomputes and the returned object changes identity, dragging every consumer along. The two fixes are: (a) memoise the array in the parent, or lift the filtering into a memo that depends on primitives; or (b) change this hook's contract to depend on the *inputs* of that filter (`query`, `category`) and do the filtering inside the memo itself — which is the better design, because it moves the unstable value out of the dependency list entirely.

---

## 15. Summary

- `useMemo` caches one computation per hook slot, re-using it while the dependency list stays equal (`Object.is`).
- It solves **two** problems: an expensive computation, and a value that must keep its **identity**. If neither applies, the memo is overhead.
- **Identity is measurable**: a memoised array changed once across three renders; a plain array changed every render (verified).
- **Cost is measurable**: `useMemo(() => heavy(n), [n])` ran once over three renders; `heavy(n)` ran three times (verified).
- A memo whose dependency is rebuilt every render **never hits** (verified: 3 runs over 3 renders) — and the linter says `depends on 'x', which changes every render`.
- Memoise for: expensive derivations, props to `memo` children, effect dependencies, context values, third-party props compared by reference.
- Do not memoise: cheap arithmetic, values used only locally, non-`memo` children, or anything "just in case".
- **Never use `useMemo` for side effects** — it runs during render (the compiler's `use-memo` rule flags it explicitly).
- Memoisation is a **performance hint, not a correctness guarantee**: React may recompute, so never depend on it for behaviour.
- **React Compiler** is the official direction for automatic memoisation; keep your manual memos correct and few, and let the compiler-era lints guide the migration.

---

**What's next →** [`08-usecallback.md`](./08-usecallback.md): stabilising functions. We will measure a `memo`-wrapped child rendering **once** when its props are stable and **five** times when an inline arrow or a fresh object slips in, watch a `useCallback` with a missing dependency return `0` forever while the screen says `3`, and see why the lab's cart exposes stable action creators — the same stability that made the toast timer behave correctly in file 03.
