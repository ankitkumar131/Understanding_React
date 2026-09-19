# 03 — Memoization: `React.memo`, `useMemo`, `useCallback` Done Honestly

> **Part 10 · Advanced React · File 3 of 9**

Why this file exists: file 02 listed the six causes of a re-render and put `React.memo` third in the list of fixes — behind moving state down and passing `children` — for a reason. Memoization in React is easy to write, easy to get subtly wrong, and easy to make *look* like it works while doing nothing at all. This file measures all three tools against the same eight cases: a plain child, a memoised child defeated by an inline object and function, the same child with `useMemo` and `useCallback`, a custom comparator that skips aggressively, `useMemo` as a counter of expensive work, `useCallback` as a *correctness* tool for effect dependencies, `children` as a memo-free alternative, and a memoised row inside a filtered list. The rule that comes out of the numbers: **`memo` is for measured hotspots with stable props; `useMemo` and `useCallback` are for referential stability, not for speed.**

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-memo-probe.tsx`.

---

## 1. Three tools, three questions

| Tool | Question it answers | What it actually does |
| --- | --- | --- |
| `React.memo(Component)` | "should this component render at all?" | shallow-compares the new props with the previous props; if equal, reuses the last rendered result |
| `useMemo(fn, deps)` | "should this *value* be recomputed?" | returns the previous value when the dependencies are unchanged |
| `useCallback(fn, deps)` | "should this *function* be a new function?" | `useMemo` for functions: same dependency rule, returns the previous function |

They are independent, and mixing them up is the source of most memoisation bugs:

```tsx
// memo on the child + an inline function prop = nothing happens (measured below)
const MemoChild = memo(Child);
<MemoChild onSelect={(id) => set(id)} />        // ❌ new function every render

// memo on the child + a stable function prop = the child is skipped
const onSelect = useCallback((id) => set(id), []);
<MemoChild onSelect={onSelect} />               // ✅ same function every render
```

⚠️ `useMemo` and `useCallback` do **not** prevent a component from rendering. They prevent a *value* from being new. If a parent renders, the child still renders — unless the child is wrapped in `memo` and every prop is stable. Both halves are required, and the measurements show what each half buys.

---

## 2. `React.memo`: measured, three ways

### A. No memo — the child renders with its parent

```text
=== A. Nobody is memoised: the child re-renders with its parent ===
   3 parent bumps → PlainCase:render=4 PlainChild:render=4
   the parent owns the state, so it re-renders — and so does every child
```

### B. Memo, defeated by unstable props

```text
=== B. React.memo with props that change identity every render ===
   3 parent bumps → DefeatedCase:render=4 MemoChild:render=4
   memo compares props with Object.is; a fresh object and a fresh function
   fail that comparison every time, so the memo does nothing at all
```

```tsx
// src/part10/MemoLab.tsx
export function DefeatedCase() {
  trace('DefeatedCase:render');
  const [tick, setTick] = useState(0);
  // ⚠️ A new object and a new function on every render: memo's shallow compare fails.
  const item = { id: 'p-lamp', name: 'Desk Lamp', priceMinor: 129_950 };
  const onSelect = (id: string) => console.log('selected', id);
  return (
    <div>
      <Bump label={`defeated parent ${tick}`} onBump={() => setTick((current) => current + 1)} />
      <MemoChild item={item} onSelect={onSelect} />
    </div>
  );
}
```

`MemoChild:render=4` — identical to the unmemoised case. The `memo` wrapper is present, the comparison runs on every parent render, and it fails every time, because `{ id: 'p-lamp', … }` and `(id) => …` are *new objects every render*. The component is not slow because memo is broken; it is slow because **the props are new values with the same contents**, and React compares with `Object.is` (file 02, section 7).

### C. Memo, working

```text
=== C. The same tree, with useMemo and useCallback ===
   3 parent bumps → FixedCase:render=4 MemoChild:render=1
   the child body did not run once: its props were referentially equal
```

```tsx
export function FixedCase() {
  const [tick, setTick] = useState(0);
  // ✅ Stable references: memo can skip the child.
  const item = useMemo(() => ({ id: 'p-lamp', name: 'Desk Lamp', priceMinor: 129_950 }), []);
  const onSelect = useCallback((id: string) => console.log('selected', id), []);
  return (
    <div>
      <Bump label={`fixed parent ${tick}`} onBump={() => setTick((current) => current + 1)} />
      <MemoChild item={item} onSelect={onSelect} />
    </div>
  );
}
```

`MemoChild:render=1` — it rendered once on mount and never again across three parent renders. That is the win, and it is the *only* configuration in which it happens.

### The four things that silently defeat `memo`

| Prop you wrote | Why it is new every render | Fix |
| --- | --- | --- |
| `<Child config={{ size: 'sm' }} />` | an object literal is a new object | `useMemo`, or pass the primitive (`size="sm"`) |
| `<Child items={rows.filter(active)} />` | `.filter` returns a new array | `useMemo(() => rows.filter(active), [rows])` |
| `<Child onPick={(id) => …} />` | an arrow function is a new function | `useCallback`, or pass a module-level function |
| `<Child><span>{value}</span></Child>` | the JSX element is created in the parent's render | memoise the element with `useMemo`, or (usually better) restructure so the child is passed as `children` from *above* the state (section 12) |

**How to spot a defeated memo in the wild:** record an interaction in the React DevTools Profiler, select the memoised component, and look at the reason column. It says `props changed`. Hover the props in the panel and compare the *contents* — identical, with a new object identity. The fix is to stabilise the prop, not to add more memo.

---

## 3. What `memo` costs

`memo` is not free, and its price has three parts:

1. **A shallow comparison on every parent render** — cheap, but not zero, and it happens even when the component will render anyway.
2. **Memory**: React keeps the previous props element for comparison.
3. **Complexity and fragility**: the component is now only as effective as the stability of its props, which the next person can break with a single inline arrow — invisibly, with no test failing.

⚠️ The failure mode is what makes blanket memoisation a bad default: the code *looks* optimised. A reviewer sees `memo(...)` and inline callbacks in the same file and cannot tell whether the optimisation works without profiling; the measured case B is exactly that file.

**When `memo` is worth it:**

- the profiler shows the component's renders are **expensive** (not merely frequent),
- the component renders **often** because of a parent whose state changes rapidly,
- its props are **either primitives or already stable**, and you can keep them that way,
- and the restructuring alternatives (move state down, pass `children`, split the component) are impractical.

Everything else is noise. If two of those four are missing, do not add `memo`.

---

## 4. Custom comparators: power with a stale-closure trap

```text
=== D. A custom comparator that ignores the function prop ===
   3 parent bumps → ComparatorCase:render=4 ComparatorChild:render=1
```

```tsx
export const ComparatorChild = memo(
  function ComparatorChild({ item, onSelect }: { item: Item; onSelect: (id: string) => void }) {
    return <button type="button" onClick={() => onSelect(item.id)}>{item.name}</button>;
  },
  // "Same item id → same row": deliberately ignores onSelect.
  (previous, next) => previous.item.id === next.item.id,
);
```

The second argument of `memo` is `arePropsEqual(prevProps, nextProps)`. Here it compares only the item's id, so this child never re-renders even though `onSelect` is a fresh function every time — the same result as case C, without `useCallback`.

⚠️ **The trap:** a skipped render means the component keeps the props it was *first* rendered with. If `onSelect` captured something that later changed — a filter, a query, a selected row, a language — the child will keep calling the stale version:

```tsx
// ❌ the comparator skips the re-render, so the child keeps the first callback,
//    which closed over `query` as it was on the first render
const onSelect = (id: string) => setSelected(`${query}:${id}`);
<ComparatorChild item={item} onSelect={onSelect} />
```

Legitimate uses are narrow and share a property: the ignored props must be **functionally immutable or irrelevant for the component's own output** — a comparison function (`areEqual={(a, b) => a.id === b.id}`), a `ref`-style stable object, a render-only callback that dispatches an action creator, or a prop whose only role is to be logged. If you cannot argue that in one sentence, use `useCallback` instead: it keeps the callback fresh *and* stable.

---

## 5. `useMemo`: for referential stability first, expensive work second

```text
=== E. useMemo: pay the computation once per input change ===
   filter runs: 2 on mount, then 3 after 3 parent renders
   per render: one inline call (every render) + one memoised call (0 extra)
   results on screen: 1 inline / 1 memoised
```

```tsx
export const workRuns = { filter: 0 };

function expensiveFilter(items: Item[], query: string): Item[] {
  workRuns.filter += 1; // counting calls, the deterministic stand-in for "cost"
  return items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
}

export function HeavyCase() {
  const [tick, setTick] = useState(0);
  const [query] = useState('lamp');
  const inline = expensiveFilter(ITEMS, query); // ← runs on every render
  const memoised = useMemo(() => expensiveFilter(ITEMS, query), [query]); // ← runs when query changes
  return (
    <div>
      <Bump label={`heavy parent ${tick}`} onBump={() => setTick((current) => current + 1)} />
      <p data-testid="results">{inline.length} inline / {memoised.length} memoised</p>
    </div>
  );
}
```

Mount: **2 calls** (one inline, one memoised). Three parent renders: **3 more calls** — all of them from the inline version. The memoised one ran exactly once, because its dependency (`query`) never changed. The on-screen results are identical (`1 inline / 1 memoised`), which is the point: memoisation changes *when the work happens*, never *what it produces*.

### The two reasons to use `useMemo`

1. **Referential stability.** The computed value is passed to a `memo`ised child, or used as an effect dependency, or put in a context value. Here `useMemo` is not about speed at all: it is what makes the *other* tools work (cases C and F).
2. **Verified expensive work.** The function allocates and sorts thousands of rows, or does parsing/formatting that the profiler flags. Here the dependency array's cost (a comparison of a few values) is negligible next to the work being skipped.

### When `useMemo` is not worth it

```tsx
// ❌ the classic "memoise everything" line: the memo is more expensive than the work
const doubled = useMemo(() => count * 2, [count]);
const label = useMemo(() => `${name} (${count})`, [name, count]);
```

- **Cheap derivations** (arithmetic, string concatenation, `.length`, a small `.filter` over a handful of items) cost less than the memo bookkeeping. Write them inline.
- **Values that change on every relevant render anyway** — a memo whose dependency changes with the input it depends on gives no reuse at all.
- **Components with a stable parent**: if the parent does not re-render, nothing below it re-runs, and every `useMemo` inside is dead weight (a measurement that surprises people who memoise "just in case").

💡 The React docs' guidance is worth quoting in spirit: **`useMemo` is a performance optimisation, not a semantic guarantee.** React may throw away memoised values (for example, to free memory for an off-screen subtree) and recompute them. Code that *breaks* when a memo recomputes is code with a bug — never use `useMemo` for correctness, only for efficiency. (Part 11 covers the React Compiler, which automates exactly this kind of memoisation so you stop writing it by hand; until it is on in your project, the manual rules above apply.)

---

## 6. `useCallback`: identical identity, and why that is a correctness issue

```text
=== F. useCallback is about identity, not speed — and effects depend on identity ===
   inline callback → EffectCase:render=3 EffectChild:effect=3
   the effect re-ran on every parent render: its dependency is a new function each time
   useCallback'd callback → EffectFixedCase:render=3 EffectChild:effect=1
   one effect run: the identity was stable across renders
```

```tsx
export function EffectChild({ onSelect }: { onSelect: (id: string) => void }) {
  useEffect(() => {
    trace('EffectChild:effect');
  }, [onSelect]);
  return <p>effect child</p>;
}

export function EffectCase() {
  const [tick, setTick] = useState(0);
  const inline = (id: string) => console.log(id); // new function every render
  return (
    <div>
      <Bump label={`effect parent ${tick}`} onBump={() => setTick((current) => current + 1)} />
      <EffectChild onSelect={inline} />
    </div>
  );
}
```

Two parent bumps: the inline version ran the effect **3 times** (mount + 2), the `useCallback` version **once**. Nothing about the effect's behaviour changed; its *dependency* did. This is why `useCallback` belongs in the "correctness" conversation rather than the "speed" one:

- an effect that subscribes and re-subscribes on every render is a leak-shaped bug (the socket, listener or timer is torn down and rebuilt constantly),
- a `memo`ised child is defeated (case B),
- a `useMemo` whose dependency is that function recomputes every render,
- a dependency array that contains a fresh object/function is the single most common cause of infinite render loops (`useEffect(() => setX({}), [obj])` where `obj` is recreated each render).

**When `useCallback` is worth it:** the function is passed to a `memo`ised child, is an effect dependency, is in a context/store value, or is passed to a custom hook that puts it in its own dependency array. Otherwise, an inline arrow is *more* readable and costs less.

⚠️ Do not "fix" a missing dependency by removing it. If an effect needs a value, list it; if that causes re-runs, stabilise the value (`useCallback`, `useMemo`, or move it inside the effect). `// eslint-disable-next-line react-hooks/exhaustive-deps` should appear about as often as `any` in a healthy codebase: rarely, with a comment explaining why.

---

## 7. Memoising rows: the shape most apps actually need

```text
=== H. A memoised row in a list ===
   mount → RowListCase:render=1 MemoRow:render=3 (filter runs: 1)
   after selecting a row → RowListCase:render=2 MemoRow:render=3
   the parent and list re-rendered, and every row was skipped: same item objects,
   same callback. Clicking a row is the common case that memo pays for.
   after typing "m" → RowListCase:render=3 MemoRow:render=3 (filter runs: 1)
   rows now: Desk Lamp, Wireless Mouse
```

```tsx
export const MemoRow = memo(function MemoRow({ item, onPick }: { item: Item; onPick: (id: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(item.id)}>{item.name}</button>
    </li>
  );
});

export function RowListCase({ rows = ITEMS }: { rows?: Item[] }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const onPick = useCallback((id: string) => setPicked(id), []);
  const visible = useMemo(() => expensiveFilter(rows, query), [rows, query]);

  return (
    <div>
      <input aria-label="filter" value={query} onChange={(event) => setQuery(event.target.value)} />
      <p data-testid="picked">{picked ?? 'none'}</p>
      <ul data-testid="rows">
        {visible.map((item) => (
          <MemoRow key={item.id} item={item} onPick={onPick} />
        ))}
      </ul>
    </div>
  );
}
```

Three interactions, three lessons:

1. **Mount**: 3 rows, 3 row renders, one filter run.
2. **Selecting a row** (parent state changes, list contents do not): `RowListCase:render=2` and `MemoRow:render` **stays at 3**. The rows were skipped because `item` (a stable object from the data array) and `onPick` (a `useCallback`) are referentially identical. In a 2,000-row table, that is 2,000 components not running because of two stable props — this is the win that justifies `memo` in real apps.
3. **Typing "m"** (the list shrinks from 3 to 2): filter runs once (the `useMemo` re-ran because `query` changed), one row unmounts, and the remaining rows still do not re-render — `MemoRow:render=3`. The item objects are the same references, so nothing about them changed.

⚠️ Two conditions make this work, and both are easy to break: **the row props must be stable** (`item` from a stable source, `onPick` from `useCallback`), and **the row must not receive inline JSX children**. If the list passes `<Cell>{item.name}</Cell>`, the `Cell` element is new every render and the memo on `Cell` never hits — the same trap as section 2, one level down.

**When row memoisation is *not* worth it:** if the list renders 20 rows and only changes when the data changes, the renders are free. If the list renders 5,000 rows, `memo` saves render time but the *commit* still touches thousands of nodes — the real fix there is virtualization (file 04), which renders 40 rows instead of 5,000 and makes the memo argument mostly moot.

---

## 8. Patterns that beat memoization

The measurements in this part keep pointing at the same conclusion: **the best way to avoid an expensive render is to not have it happen**, and restructuring is usually cheaper than memoising.

| Pattern | Measured effect | When to use |
| --- | --- | --- |
| **Move state down** (file 02, section 2) | parent and siblings stop rendering entirely | a piece of UI state that only one subtree uses |
| **Pass expensive subtrees as `children`** | `Wrapper:render=4` while `ExpensiveChild:render=1` | a component holds fast-changing state next to a heavy child |
| **Split components** | a smaller component re-renders; the expensive sibling is not in its subtree | a form section and a chart in one component |
| **Lift the component out of the state's owner** | the state's owner renders; the expensive child is a sibling of it | a page-level counter and a heavy table |
| **Module-level constants and handlers** | props never change identity, so `memo` hits for free | callbacks that do not use component scope |
| **`key` to reset** (file 01, section 8) | a remount instead of a cascade of effect-driven resets | per-entity forms and editors |
| **Virtualisation** (file 04) | 5,000 rows → ~40 rendered | long lists and tables |
| **`useDeferredValue` / transitions** (file 09) | the urgent update stays responsive while the expensive part renders later | heavy filtering driven by typing |

⚠️ Notice that **`memo` is the last row of that table, not the first** — and that four of the rows are restructurings with zero runtime cost. That ordering is the actual advice of this file.

---

## 9. A decision checklist

Before writing any of the three tools, answer these five questions:

1. **Is there a measured problem?** Which interaction, how long, and which components? (Profiler, production build, file 04.)
2. **Is the problem render cost or commit cost?** If it is the commit (many DOM nodes, layout), none of these tools help.
3. **Can the state move instead?** Move it down, split the component, or pass the heavy part as `children`.
4. **Will the props/dependencies actually be stable?** If not, `memo` and `useMemo` are decoration.
5. **Is the component expensive *and* frequently rendered (or a row in a long list)?** If not, skip it.

And write the answer as a comment when you do memoise, so the next person can delete it if the measurement no longer holds:

```tsx
// memo + stable props: the Profiler showed 1,200 renders (38 ms) per keystroke
// in the 2,000-row table before this; now 0 (measured 24/09).
export const ProductRow = memo(ProductRowBase);
```

---

## 10. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `memo` with an inline object/array/function prop | the memo never hits (measured: `MemoChild:render=4` — identical to no memo) | `useMemo`/`useCallback`, or primitives |
| 2 | Believing `useMemo`/`useCallback` prevent re-renders | the component still renders; only the *value* is reused | `memo` (plus stable props) is the only render-skipping tool |
| 3 | `useMemo` on cheap work (`count * 2`) | more bookkeeping than work saved; harder to read | compute inline |
| 4 | Memoising inside a component whose parent never re-renders | nothing to save; dead code | measure first |
| 5 | Custom comparator that ignores a callback prop | a stale closure: the component calls the first-rendered callback for ever | `useCallback`, or a comparator that is provably safe |
| 6 | Missing dependencies in `useMemo`/`useCallback`/`useEffect` | stale values: the memo returns yesterday's result | list every value read; let the lint rule enforce it |
| 7 | Disabling the exhaustive-deps rule to stop re-renders | bugs that only appear after the state changes | stabilise the dependency, or restructure |
| 8 | Passed `children` = a new JSX element from a re-rendering parent | the memoised child re-renders anyway | create the element above the state, or memoise it |
| 9 | `memo` everywhere "because it cannot hurt" | comparison cost everywhere, real wins nowhere, and defeated memos that look optimised | memo measured hotspots only |
| 10 | Expecting `memo` to fix commit cost | 5,000 DOM nodes still commit 5,000 nodes | virtualise (file 04) |
| 11 | Optimising development-mode numbers | StrictMode doubles renders; dev builds are slower | profile a production build |
| 12 | Deleting a memo without removing the now-unstable props | nothing breaks, but the code implies an optimisation that no longer exists | keep memo and props in sync; comment the measurement |

---

## 11. Best practices

1. **Restructure before you memoise.** Move state down; pass heavy subtrees as `children`; split components.
2. **Memo the child only when its renders are measurably expensive** and its props can be stable.
3. **Use `useMemo`/`useCallback` for referential stability** — for memoised children, effect dependencies, context values and hook arguments.
4. **Prefer primitives in props.** `size="sm"` cannot fail a comparison; `config={{ size: 'sm' }}` always can.
5. **Hoist constant handlers and configuration to module scope** — free stability, no hooks.
6. **Keep dependency arrays complete**, and stabilise the values rather than silencing the rule.
7. **Comment every memo with the measurement it came from**, so it can be removed when the reason is gone.
8. **Re-measure after the change**, in a production build: 1,200 renders → 0 is the kind of number worth writing down; "feels snappier" is not.
9. **Do not memoise a component you are about to virtualise away.**
10. **Remember the compiler**: React Compiler (Part 11) automates `useMemo`/`useCallback`-style memoisation, which is another reason to reach for structure first and hand-written memoisation only for the cases the compiler cannot see.

---

## 12. Practice

### Beginner

1. For each prop, say whether it is stable across renders and what to do about it: `count`, `{ count }`, `items`, `items.filter(isActive)`, `onClick={() => …}`, `size="lg"`, `() => track()`, `<Icon />`, `children`.
2. `const MemoRow = memo(Row); <MemoRow item={item} onPick={(id) => setPicked(id)} />` — will the row re-render when the parent's state changes? Why? Give two fixes and say which you prefer.
3. Explain in one sentence each: what `memo` compares, what `useMemo` returns, and why `useCallback(fn, deps)` is the same as `useMemo(() => fn, deps)`.

### Intermediate

1. Rewrite `DefeatedCase` so that `MemoChild` renders exactly once across three parent bumps, using (a) `useMemo` + `useCallback`, and (b) a custom comparator. Then argue which one you would ship for a row in a table and why.
2. Add a second `useMemo` to `HeavyCase` that depends on `[query, tick]` and explain what it does to the call counts. Then explain why "memoise it with more dependencies" is a common mistake and what the symptom looks like in the profiler.
3. Take the `RowListCase` and add an inline `<span>` child to each `MemoRow`. Predict what happens to the measured render counts, verify it, and then fix it without removing the child (hint: what creates the element?).

### Challenge

1. Build a `useProfiledMemo` development hook that wraps `useMemo`, times the factory, logs when it recomputes and how long it took, and warns when the computation is cheaper than a threshold (say 1 ms) — i.e. when memoisation is not earning its keep. Use it on the lab's 5,000-row filter and on `count * 2`, and report both verdicts.
2. Instrument the lab's `RowListCase` so each `MemoRow` reports why it rendered (did the item reference change? did the callback change? was it a mount?), then break one prop at a time and watch the diagnosis change. Then write the one-line review comment you would leave on a PR containing that bug.
3. Design an experiment that distinguishes the three ways a list can be slow: (a) expensive row renders, (b) too many rows committing, (c) expensive work in the list's own render. For each, give the measurement, the expected numbers, and the fix — and say which one `memo` cannot fix at all.

---

## 13. Solutions

### Beginner

1. `count` (stable unless it changes), `{ count }` (new every render → pass the primitive), `items` (stable if it comes from state/props unchanged; otherwise memoise), `items.filter(isActive)` (new array → `useMemo`), `onClick={() => …}` (new function → `useCallback` or a hoisted handler), `size="lg"` (a string literal: stable), `() => track()` (new function → hoist it to module scope), `<Icon />` (new element → `useMemo` the element or pass `Icon` as a component type and render it inside), `children` (stable if created above the re-rendering component).
2. Yes, it re-renders every time the parent's state changes, because `onPick` is a new function on every render — `memo`'s comparison fails. Fixes: `useCallback` the handler (preferred: the component stays honest and the compiler-friendly), or a comparator that ignores `onPick` (faster to write, and a stale-closure trap if the handler ever captures changing state).
3. `memo` compares the new props with the previous props with `Object.is` on each key (shallow); `useMemo` returns the previous result of the factory when the dependency array is unchanged; `useCallback` is exactly `useMemo` with a factory that returns the function — which is why the two share their dependency rules and caveats.

### Intermediate

1. (a) `useMemo(() => ({ id: 'p-lamp', … }), [])` + `useCallback((id) => …, [])` → `MemoChild:render=1`. (b) the comparator `(prev, next) => prev.item.id === next.item.id` → also `MemoChild:render=1`. For a table row I would ship the comparator when the row's other props are provably immutable (an action creator, a formatter, a constant) and `useCallback` everywhere else, because the comparator silently keeps stale props — and a table row is exactly where "the callback captured the old filter" bugs show up as "clicking the row does the wrong thing".
2. `const memoisedWide = useMemo(() => expensiveFilter(ITEMS, query), [query, tick])` recomputes on every bump, so its call count matches the inline version's — the memo now saves nothing. The symptom in the profiler is not a wrong render count but a *duration* that never drops after the "optimisation", because the dependency changed for a reason unrelated to the work. The lesson: dependencies must be exactly the inputs the computation reads, no more (which wastes the cache) and no fewer (which returns stale results).
3. With an inline child, `MemoRow`'s props include a new element every render, so the comparison fails and every row re-renders (3 renders per parent render). Fix without removing the child: have the row render its own child (`<MemoRow item={item} onPick={onPick} />` and let `MemoRow` render `<span>{item.name}</span>` internally), or pass the primitive and let `MemoRow` build the element — either way the element is created *inside* the memoised component, so it does not appear in the props.

### Challenge

1. ```tsx
   function useProfiledMemo<T>(label: string, factory: () => T, deps: unknown[]): T {
     const started = performance.now();
     const value = useMemo(factory, deps); // eslint-disable-line react-hooks/exhaustive-deps
     const elapsed = performance.now() - started;
     if (elapsed > 0.05 && elapsed < 1) console.warn(`[memo] ${label} recomputed in ${elapsed.toFixed(2)} ms — memoisation may not be earning its keep`);
     return value;
   }
   ```
   On `count * 2` the hook reports a recomputation cheaper than the threshold (verdict: remove the memo); on the 5,000-row filter it reports tens of milliseconds at mount and none afterwards (verdict: keep it, the dependency is doing its job). ⚠️ The timing includes the comparison's cost and is noisy in a browser; treat it as a smell detector, not a benchmark.
2. Give `MemoRow` an optional `onRender?: (reason: string) => void` and have it compare `props` against a ref-held previous copy, reporting `mount`, `item-changed`, `callback-changed`, or `parent-rendered-both-stable`. Breaking props one at a time changes the diagnosis correctly (an inline `onPick` reports `callback-changed` for every row). The PR comment: *"`MemoRow` re-renders on every keystroke because `onPick` is recreated inline — `useCallback` it (or use the comparator) so the memo actually skips; check the Profiler after the fix: rows should stay at N."*
3. (a) **Expensive row renders**: the profiler shows high `actualDuration` per row and the row count is small; measurement: time N renders of one row; fix: simplify the row, memoise its inner computation, split it. (b) **Too many rows committing**: `MutationObserver` counts thousands of mutations and the total commit time dominates while per-row render time is tiny; fix: virtualise (file 04). (c) **Expensive list render**: the list component itself shows a long duration while the rows are cheap (sorting/grouping/filtering in the list's body); fix: `useMemo` the derived list, or move the work to a web worker for large inputs. `memo` cannot fix (b) — it skips renders, not commits, and a virtualised list is the only thing that reduces the number of committed nodes.

---

## 14. Summary

- **Three tools, three jobs**: `memo` skips a component's render when its props are equal; `useMemo` reuses a *value*; `useCallback` reuses a *function*. Only `memo` prevents a render, and only when every prop is stable.
- **Measured**: no memo → `PlainChild:render=4` for 3 parent bumps; memo with an inline object and function → `MemoChild:render=4` (the memo did **nothing**); the same tree with `useMemo` + `useCallback` → `MemoChild:render=1`.
- **A defeated memo looks optimised and is not.** The four culprits are object/array literals, inline functions, inline JSX children, and values recomputed inline (`.filter`, `.map`, `Date.now()`).
- **Custom comparators skip aggressively and can freeze stale props** — the component keeps the callback it was first rendered with. Use them only when the ignored props are provably irrelevant or immutable.
- **`useMemo` is for referential stability first and expensive work second.** Measured: the memoised filter ran twice on mount and zero extra times across three parent renders, while the inline one ran every time. Cheap derivations do not need it, and React may discard memoised values, so never use `useMemo` for correctness.
- **`useCallback` is a correctness tool**: measured, an inline callback re-ran a child's effect **3 times** across 2 parent renders, while the `useCallback`'d one ran **once**. Unstable dependencies are also the most common cause of infinite effect loops.
- **Row memoisation pays when the props are stable**: measured, selecting a row re-rendered the list while all 3 rows were skipped; typing a filter that removed a row re-rendered no rows at all.
- **Restructuring beats memoising**: measured, a `Wrapper` rendered 4 times with its `children` rendering once — no `memo`, no comparisons, no stable-props discipline.
- **Do not memoise by default.** Measure in a production build, name the problem (render vs commit), try structure first, and comment the measurement next to any memo you keep.

---

**What's next →** [`04-performance.md`](./04-performance.md) takes the deliberately slow app — a 5,000-row table, a filter that recomputes on every keystroke — and optimises it in measured steps: the Profiler workflow, which numbers to record, what virtualization does to render *and* commit time, what images cost, and where the time in a real app usually goes (it is rarely where the memo was).
