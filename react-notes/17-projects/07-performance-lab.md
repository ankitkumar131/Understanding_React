# 05 — Project: Performance Lab (Re-renders, the Compiler, Windowing)

> **Part 17 · Projects · File 7 of 7**

Why this project: performance is the topic where beginners are given the most advice and the fewest measurements. This file is a **measurement lab**, not a lecture: it renders the same list four ways, prints what each one costs, and then explains every number. By the end you will know which of `memo`, `useMemo`, `useCallback`, the React Compiler and list windowing actually change the outcome, which ones only add noise, and how to tell the difference *before* you change code.

Everything here was measured in this lab's own suite — React 19.3.0, React Compiler 1.0 enabled, jsdom, **development** build — and the raw output is in `/home/user/lab/part17-projects.txt`. Read the warning in section 2 before you quote any absolute number.

The suite this file's harness belongs to: **12 test files, 62 tests, all green** (`npx vitest run`, 32.0 s including environment setup).

---

## 1. The harness

```tsx
// src/perf/renders.test.tsx (the essential parts; the file in the lab has the full output)
let rowCalls = 0;

function Row({ index, onSelect }: RowProps) {
  rowCalls += 1;                                  // counting renders is the honest way to see what React did
  return <li><button onClick={() => onSelect(index)}>row {index}</button></li>;
}
const MemoRow = memo(Row);

/** Compiled by React Compiler 1.0 — this lab runs `react({ compiler: true })`. */
function List({ rows, visible }: { rows: number; visible?: number }) {
  const [selected, setSelected] = useState(0);
  const count = visible === undefined ? rows : Math.min(visible, rows);
  return (
    <div>
      <p aria-live="polite">selected row {selected}</p>
      <ul>
        {Array.from({ length: count }, (_, index) => (
          <Row key={index} index={index} onSelect={setSelected} />
        ))}
      </ul>
    </div>
  );
}

/** The same list, opted out of compiler memoisation with a directive. */
function ListNoMemo({ rows, Row: RowComponent }: { rows: number; Row: ComponentType<RowProps> }) {
  'use no memo';
  const [selected, setSelected] = useState(0);
  return (
    <div>
      <p aria-live="polite">selected row {selected}</p>
      <ul>
        {Array.from({ length: rows }, (_, index) => (
          <RowComponent key={index} index={index} onSelect={setSelected} />
        ))}
      </ul>
    </div>
  );
}

function timed(label: string, element: ReactElement, clickRow = 1) {
  const { unmount } = render(element);
  const buttons = screen.getAllByRole('button');   // query OUTSIDE the timer: the query itself costs time
  rowCalls = 0;
  const start = performance.now();
  act(() => { buttons[clickRow].click(); });
  console.log(`${label.padEnd(42)} ${(performance.now() - start).toFixed(1).padStart(7)} ms   rows re-rendered ${rowCalls}`);
  unmount();
  cleanup();
}
```

Three details of the harness are themselves lessons:

| Detail | Why it matters |
| --- | --- |
| A **row-render counter** next to the stopwatch | timings are noisy and machine-dependent; "how many components ran" is exact. Both belong in a perf experiment |
| The button is queried **before** the timer starts | the first version of this harness measured the *query* (a full accessibility-tree scan of 1000 buttons) and reported 934 ms of "re-render cost". The measurement was wrong, not React |
| The click targets **row 1, not row 0** | clicking row 0 sets the state to the value it already has, React bails out of the render entirely, and you measure nothing but the event dispatch. Every "React is fast" benchmark that forgets this is broken |

⚠️ **The lesson is not "React is slow".** It is that a performance claim without a baseline, a counter and a control is a guess. The harness took three iterations to become trustworthy — and all three iterations are in this file precisely so you can avoid them.

---

## 2. The numbers (and what they do and do not mean)

```text
--- mounting (every row is rendered once) ---
mount 500 rows                                91.6 ms
mount 1000 rows                              145.9 ms
mount 2000 rows                              178.9 ms
mount 4000 rows                              254.9 ms
mount 20 000 rows, windowed to 50              3.2 ms
--- one row changes state (1 000 rows) ---
compiler memoised list                         5.8 ms   rows re-rendered 0
"use no memo" list                            54.6 ms   rows re-rendered 1000
"use no memo" list + memo(Row)                14.6 ms   rows re-rendered 0
--- one row changes state (4 000 rows) ---
compiler memoised list                         1.3 ms   rows re-rendered 0
"use no memo" list                           212.6 ms   rows re-rendered 4000
"use no memo" list + memo(Row)                52.6 ms   rows re-rendered 0
```

**How to read it**

1. **Mounting is the expensive part.** Rendering 4000 rows once costs ~255 ms; rendering 20 000 rows *windowed to 50* costs 3.2 ms. Nothing you do to re-renders affects mount cost — and mount cost is exactly what a user feels when they open the page.
2. **An un-memoised update re-renders every row.** With the compiler opted out, changing one row's state ran `Row` 1000 times (54.6 ms) and 4000 times (212.6 ms). That is the "parent state change re-renders the whole list" rule from Part 5, measured.
3. **React Compiler makes the naive list behave like a memoised one.** With the compiler on, the same click re-rendered **0** rows and took 5.8 ms (1.3 ms at 4000 rows) — the compiler memoised the JSX the component returns, and React bailed out of the subtree when the element identity was unchanged.
4. **Hand-written `memo` still helps when the compiler is off — and costs something.** `memo(Row)` cut the update from 54.6 ms to 14.6 ms at 1000 rows (and 212.6 ms to 52.6 ms at 4000), but the 52.6 ms is the cost of comparing 4000 prop objects; it is not free, it is a bet that skipping the render is cheaper than doing it.
5. **Effects only appear above ~50 rows.** The same experiment at 10 rows showed noise. Optimising a 10-row list is a waste of your reader's attention.

**What these numbers are not**: production numbers. This is React's *development* build in jsdom, where every component render carries extra validation and there is no layout or paint at all. Production React is several times faster, and a real browser additionally pays for style, layout and paint — which is why 20 000 DOM rows are catastrophic in a browser even though jsdom shrugs. **Use the ratios, ignore the absolutes**, and measure in your own app (section 8) before believing anyone's table.

---

## 3. React Compiler 1.0: the default, and what it changes

| Question | Answer |
| --- | --- |
| What is it? | A build-time optimiser that understands your components and inserts memoisation automatically — the same effect as `useMemo`/`useCallback`/`memo`, decided by the compiler instead of by you |
| Why does it exist? | "Is this memo correct and complete?" is a question humans get wrong; the compiler can prove it from the code it can see |
| How do you turn it on? | In the Vite setup of this lab: `react({ compiler: true })` (Part 16, file 02). It is stable as of 1.0 (October 2025) |
| What does it memoise? | Component output (the JSX an element builds), values computed in render, and functions created in render — including, unlike manual memoisation, **after early returns**, which is where hand-written `useMemo` cannot go |
| What does it need from you? | The Rules of React (Part 16's linting setup enforces them). Impure components, mutated props/state, or values read from outside render defeat it |
| How do you opt out? | `'use no memo'` at the top of a function — used by this very harness to create the comparison |
| Does it replace `useMemo`/`useCallback`? | It makes many of them unnecessary, but the official guidance is to **leave existing ones in place** while adopting it (removing them changes the compiled output) and to keep hooks where they are needed for *correctness* — notably effect dependencies |
| Does it replace `React.memo`? | It can skip the work inside a component, which usually removes the reason for `memo`. Note it has no equivalent of `memo`'s custom comparison function |

**Reading the harness with that table**: rows re-rendered 0 with the compiler is not magic. The compiler saw a JSX array whose inputs (`count`, `Row`, `setSelected`) had not changed, reused the previously created elements, and React — comparing identity — skipped the subtree. The component function itself ran (the list's state changed), its children did not.

⚠️ **Two consequences that surprise people.** First, adopting the compiler can change *when effects fire*, because memoised values change identity less often — so pin the compiler version and run your test suite when you upgrade it. Second, code that "worked because it re-rendered" (a side effect smuggled into a component body, a mutable value read during render) can stop working: the compiler is a correctness test for impure code (Part 5's rules, once again, now with teeth).

---

## 4. The five fixes, in the order you should try them

| Order | Fix | What it costs | When it is the right answer |
| --- | --- | --- | --- |
| 1 | **Do less**: paginate, or render fewer rows (windowing) | a little state and a slice | Always the first option with long lists (section 5) |
| 2 | **Move state down** so a change re-renders less | sometimes a component split | The classic "the whole page re-renders because the filter box is at the top" |
| 3 | **Turn the compiler on** | a build-plugin upgrade, and a test run | Default advice for a new or actively maintained app (React 17/18 need `react-compiler-runtime`; React 19 needs nothing) |
| 4 | **`memo` + stable callbacks** | prop-comparison cost; one more concept | The compiler is off, or a row is expensive and props rarely change |
| 5 | **`useMemo`/`useCallback` for the specific hotspot** | memory, complexity | You measured the hotspot, or you need identity stability for an effect/listener |

Note what is *not* on the list: `useMemo` everywhere, "memoise everything", or rewriting state management. And note the ordering: **the cheapest fix is usually to render less**, which is a product decision more than a React one.

---

## 5. Windowing: the fix that always works

The harness's fourth line is the punchline: **20 000 rows, windowed to 50, mounts in 3.2 ms** — roughly 80× cheaper than 4000 full rows — because the other 19 950 elements never exist.

```tsx
function WindowedList({ rows, Row }: { rows: number; Row: (props: RowProps) => ReactElement }) {
  const [scrollTop, setScrollTop] = useState(0);
  const ROW_HEIGHT = 32;
  const HEIGHT = 320;
  const first = Math.floor(scrollTop / ROW_HEIGHT);
  const visible = Array.from({ length: Math.ceil(HEIGHT / ROW_HEIGHT) + 2 }, (_, offset) => first + offset)
    .filter((index) => index < rows);

  return (
    <ul onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        style={{ height: HEIGHT, overflowY: 'auto', position: 'relative' }}>
      <li aria-hidden style={{ height: rows * ROW_HEIGHT, padding: 0, border: 0 }} />   {/* the spacer keeps the scrollbar honest */}
      <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
        {visible.map((index) => <Row key={index} index={index} onSelect={() => {}} />)}
      </div>
    </ul>
  );
}
```

That is a naive windowing implementation — enough to show the shape and to justify the library. For real work use **`@tanstack/react-virtual`** (or `react-window` for tables/lists with fixed heights), which handle variable row heights, keyboard scrolling, and the accessibility problem that windowing creates: a screen reader cannot read rows that do not exist, so announce the count (`<p role="status">Showing rows 1–50 of 20 000</p>`) and keep the list navigable.

⚠️ **Windowing is a trade-off, not a win.** You lose simple `Ctrl+F`, printing, and "scroll to the row a link pointed at". Apply it to genuinely long, uniform lists (logs, tables, pickers), not to a 30-item list of cards.

---

## 6. Where `useMemo` and `useCallback` still earn their place

Even with the compiler, these hooks remain in the language and in real codebases for reasons that are not about render speed:

| Reason | Example |
| --- | --- |
| **Identity matters for correctness** | `useEffect(() => { subscribe(onEvent) }, [onEvent])` — an unstable `onEvent` re-subscribes on every render. The dependency array is the API, not an optimisation |
| **Identity is passed to something React does not control** | a chart library, a `Map` key, a `sort` comparator given to a memoised child, a debounced function |
| **Documenting intent** | `useMemo` saying "this derivation is expensive and its inputs are these" is useful code commentary |
| **When the compiler cannot help** | values that depend on mutable refs, or code the compiler bails on |

And the measurement that keeps you honest: at 10 rows, none of this matters. At 4000 rows with the compiler off, `memo` turned 212.6 ms into 52.6 ms — measured, not believed.

---

## 7. Practical checklist before you optimise anything

1. **Reproduce the slowness** with a device/CPU profile, not vibes. "The list feels janky" needs a number: 200 ms of scripting on an interaction is visibly janky; 5 ms is not.
2. **Count renders before changing code.** A counter in the component, or React DevTools' Profiler ("Highlight updates when components render" plus the ranked chart), tells you *which* component is expensive and *why* it re-rendered (props, state, context, parent).
3. **Try the cheap structural fix first**: windowing, pagination, moving state down, splitting a component so a big subtree does not depend on a fast-changing value.
4. **Only then** reach for memoisation, and measure again with the same harness.
5. **Keep the harness.** A test file like `src/perf/renders.test.tsx` that prints render counts is the only way to notice a regression introduced by a refactor six months from now.
6. **Watch the other axis too**: bundle size and load time. A code-split route costs one round trip on first visit and nothing afterwards (this lab's lazy route produced a 2.09 kB chunk); an eagerly imported chart library costs every visitor ~100 kB. Part 16, file 03 covers the measurement.

---

## 8. Practice

### Beginner

1. Re-run the harness with 10, 50, 100 and 500 rows and write down the row count at which the difference between the compiler list and the `"use no memo"` list first exceeds 5 ms. Explain why "it depends" is the correct answer.
2. Add a `useMemo`-based derived value (sum of all row indices) to `List` and a naive `reduce` to a copy of it; measure both with the counter and explain the result.
3. Remove `"use no memo"` from `ListNoMemo` and re-run: what happens to the row counts, and what does that tell you about directive placement?

### Intermediate

1. Implement the windowed list from section 5 in the lab and measure mounting 20 000 rows with and without windowing; include a render counter to show how many rows exist.
2. Build a "profile a component" exercise: an `ExpensivePanel` that does real work (e.g. formatting 5000 dates) rendered inside a page whose search box state lives at the top. Fix it by moving the search state into its own component, and prove the fix with the render counter.
3. Add a second list column that depends on the selected row, and decide (with measurements) whether `memo`, the compiler, or restructuring is the right answer.

### Challenge

1. Turn the harness into a **regression guard**: assert that a one-row update re-renders at most 50 rows (`expect(rowCalls).toBeLessThanOrEqual(50)`) and that mounting 1000 rows stays under a generous budget. Explain in a comment why the *count* assertion is stable across machines while the *time* assertion is not.
2. Compare rendering 4000 rows in the dev build versus a production preview (`npm run build && npm run preview`) using a browser trace, and write down the ratio you observe between the two builds.
3. Add `@tanstack/react-virtual` to the lab, replace the naive window in section 5, and measure: mount time, rows rendered, and how the accessibility story changes with variable row heights.

---

## 9. Solutions

### Beginner

1. At 10 and 50 rows the two lists differ by a few milliseconds (noise); the gap becomes unmistakable in the 500–1000 row range, because the cost of a re-render grows with the number of rows while the fixed overhead stays constant. "It depends" is correct because the threshold is a property of the *row*, the *machine*, and the *build*, not of React.
2. With the compiler enabled, a `useMemo` on a cheap derivation changes nothing measurable (the compiler already memoised what it could prove); with `"use no memo"`, the naive version redoes the work on every render while the memoised one returns the cached value — visible as a much smaller number at 4000 rows. The lesson: `useMemo` is evidence-based, and "the compiler covers most of this" is why writing it reflexively is no longer good advice.
3. Rows re-render 0 times — the directive opts the *function it is written in* out of compilation, and the compiler then treats the component as ordinary code, memoising what it can in the surrounding scope. The placement rule (top of the function, before any statement) matters; a comment is not a directive.

### Intermediate

1. The windowed list renders ~12 rows regardless of the data size; the render counter proves it (compare to 20 000 row invocations for the naive version, which will also take a very long time in a browser). Mount time drops from seconds to milliseconds, which is the entire point of the technique.
2. The expensive work runs on every keystroke because the search state sits above it. Extract the search box into `SearchBox` with its own state and pass the value *down* through a small context or a callback — now typing re-renders only the box. The counter proves it: `ExpensivePanel` renders once for the initial mount instead of once per keystroke.
3. Measure first: with the compiler on, the selected-row dependency usually resolves itself; with it off, `memo` on the second column (props: the selected row object and a stable callback) is the cheapest correct fix. Restructuring — moving the selection into the list itself — is often better still, because it removes the prop entirely.

### Challenge

1. The count assertion is a statement about *code shape* (this component must not re-render that subtree), and it is identical on every machine; a time budget varies with CPU, CI load and build mode, so it either flakes or is set so loose that it catches nothing. Assert counts, log times, and review the log.
2. Production React omits validation, dev warnings and double rendering; combined with a real browser's much faster DOM layer, the ratio is typically several-fold. Quoting your own ratio is more useful than any published number because it includes your components.
3. `useVirtualizer({ count, getScrollElement, estimateSize })` handles variable heights via measurement, keyboard scrolling and (with an `aria-rowcount`/`aria-setsize` strategy plus a live region) keeps assistive tech informed. The measurement that changes is not the mount time — windowing was already fast — it is the *maintenance* cost: you deleted ~40 lines of hand-rolled maths and gained correctness on resize and dynamic heights.

---

## 10. Summary

- **Measure before you memoise.** The harness took three revisions before its numbers were trustworthy — a bad query inside the timer, and a click on the already-selected row, both produced confident nonsense. Row-render counters plus timings are the minimum viable experiment.
- **The measured facts**: mounting dominates (4000 rows ≈ 255 ms in dev/jsdom; 20 000 windowed to 50 ≈ 3.2 ms); an un-memoised one-row update re-rendered 4000 rows (212.6 ms); with **React Compiler 1.0** enabled the same update re-rendered 0 rows (1.3 ms); `memo(Row)` with the compiler off cut 212.6 ms to 52.6 ms by skipping renders but paying for prop comparisons.
- **These are development-mode numbers in jsdom.** Use ratios, not absolutes, and measure in a production build and a real browser before making a claim.
- **The fixes in order**: render less (window/paginate), move state down, turn the compiler on, `memo` where it pays, and `useMemo`/`useCallback` for *correctness* (effect dependencies) or measured hotspots.
- **Windowing is the reliable win for long lists** — at the cost of `Ctrl+F`, printing, and the accessibility caveats, which is why you should say so out loud when you adopt it.
- **React Compiler changes the default advice**: reflexively adding `memo`/`useMemo` is now mostly noise, the official guidance is to leave existing memoisation in place while adopting it, and impure code that "worked because it re-rendered" is exactly what the compiler will expose.
- **Keep the harness in the repo.** It is the only thing that will notice a performance regression introduced by a refactor months from now.

---

**What's next →** [`../18-interview/react-interview.md`](../18-interview/react-interview.md) — Part 18 turns the same material into interview preparation: React questions with short answers, detailed explanations and runnable examples, then JavaScript, TypeScript, and scenario-based questions about the systems you have just built.
