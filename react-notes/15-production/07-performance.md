# 07 — Performance: Re-renders, Memoization, Splitting and Lists

> **Part 15 · Production · File 7 of 8**

Why this file exists: "React is fast until it is not, and you cannot guess which it will be." This file starts from a measurement made in this lab — a 1000-row list where a single state update re-rendered all 1000 rows (56 ms) and `memo` + `useCallback` reduced that to **0 row renders and 7.7 ms** — and builds the whole performance model on evidence: what actually causes re-renders, which fixes work and when, how to measure (render counts and the Profiler, not vibes), why long lists need virtualisation rather than memoization, how code splitting changes the first load, and what React Compiler now does automatically. It ends with the rule that saves the most time: **measure first, and optimise the thing that is actually slow.**

Measured: [`react-lab/evidence/part15-perf.txt`](../../react-lab/evidence/part15-perf.txt) (`npx vitest run src/perf/probe.test.tsx`, jsdom).

---

## 1. What "slow" means in a React app

| Phase | What happens | Typical causes | Fix direction |
| --- | --- | --- | --- |
| **Load** | download, parse, execute JS | big bundle, no splitting, heavy dependencies | code splitting (section 5), smaller deps |
| **First render / hydration** | render the tree, paint | too many DOM nodes, heavy work during render | virtualise lists, move work out of render |
| **Update** | state changes → re-render subtree → DOM diff → paint | unnecessary re-renders, expensive children, layout thrash | memoization, state placement, virtualisation |
| **Interaction latency** | time from click to visible response | blocking work on the main thread | transitions (`useTransition`), defer work, workers |

⚠️ **Re-renders are not the enemy.** A re-render is React re-running your component functions; if the output is the same, React touches nothing in the DOM. The cost is the *work* inside your components and the *paint* that follows, not the fact that a function ran. Optimising "the number of renders" without measuring is how teams add `memo` everywhere and ship a slower, more complex app.

---

## 2. The measurement

```tsx
// src/perf/probe.test.tsx (this lab) — render counts are the reliable signal
function Row({ index, onSelect }: RowProps) {
  rowRenders += 1;
  return <li><button onClick={() => onSelect(index)}>Row {index}</button></li>;
}
const MemoRow = memo(function MemoRow({ index, onSelect }: RowProps) {
  rowRenders += 1;
  return <li><button onClick={() => onSelect(index)}>Row {index}</button></li>;
});
```

```text
naive   1000 rows, inline handler: mount 192.6 ms (renders 1000 rows) · 1 state update: parent renders 1, row renders 1000, wall clock 56.0 ms
memo    1000 rows, useCallback   : mount 151.2 ms (renders 1000 rows) · 1 state update: parent renders 1, row renders 0, wall clock 7.7 ms
summary: naive row renders = 1000, memo row renders = 0
```

```text
mount scaling:     50 rows: mount   4.6 ms · 1 state update: row renders    50 · wall clock   1.2 ms
mount scaling:   1000 rows: mount  73.5 ms · 1 state update: row renders  1000 · wall clock  14.9 ms
mount scaling:   5000 rows: mount 258.8 ms · 1 state update: row renders  5000 · wall clock 191.5 ms
mount scaling:  20000 rows: mount 1015.0 ms · 1 state update: row renders 20000 · wall clock 373.8 ms
```

What to take from it, honestly:

1. **Re-render counts are exact and comparable**; wall-clock numbers in jsdom are noisy and exclude layout and paint (a real browser does much more for 20 000 DOM nodes). Use counts to reason, and the Profiler/a real browser for absolute numbers.
2. **`memo` + a stable callback eliminated 1000 row renders** and cut the update from 56 ms to 7.7 ms in this setup. The remaining 7.7 ms is React reconciling 1000 elements even though none of them changed — **memo cannot make that part cheaper**.
3. **Mount cost grows with the number of rows** (≈50 µs per row here): 50 rows = 4.6 ms, 1000 = 73.5 ms, 20 000 ≈ 1 s. For long lists, the answer is not memoization — it is rendering fewer rows (section 6).
4. **The first measurement in a process is inflated** (192.6 ms vs 73.5 ms for the same 1000-row mount); warm up and repeat before believing a number.

---

## 3. Why a component re-renders, and the four levers

React re-renders a component when: **its own state changes**, **its parent re-renders** (unless it is memoized and its props are equal), **a context value it consumes changes**, or **its key changes** (a remount).

| Lever | What it does | Cost | Use when |
| --- | --- | --- | --- |
| `memo(Component)` | skips re-render when props are shallow-equal | a comparison per render; can be useless if props are new objects/functions | the child is expensive and props are stable |
| `useCallback(fn, deps)` | keeps a function identity stable | a dependency array to maintain | the function is passed to a memoized child or used as an effect dep |
| `useMemo(() => value, deps)` | caches a computed value | memory + deps | the computation is genuinely expensive (measured) |
| **Move state down / colocate** | the parent does not re-render at all | a refactor, not an API | often the best fix: keep state in the component that needs it |

```tsx
// ❌ state at the top re-renders the whole page for a text input
function Page() {
  const [query, setQuery] = useState('');
  return <><SearchInput value={query} onChange={setQuery} /><ExpensiveTable /></>;
}

// ✅ colocate the state: typing re-renders only the input
function SearchInput() {
  const [query, setQuery] = useState('');
  return <input value={query} onChange={(event) => setQuery(event.target.value)} />;
}
function Page() {
  return <><SearchInput /><ExpensiveTable /></>;
}
```

```tsx
// ❌ a new object every render defeats memo: the child always re-renders
<ExpensiveTable options={{ sortable: true, pageSize: 20 }} />

// ✅ stable reference (module constant if it never changes, else useMemo)
const TABLE_OPTIONS = { sortable: true, pageSize: 20 } as const;
<ExpensiveTable options={TABLE_OPTIONS} />
```

⚠️ **The dependency-array trap:** `useCallback(fn, [])` returning a function that closes over props is the classic stale-closure bug (Part 9). An empty array is a promise that the function uses nothing that changes — if that is not true, either fix the array or use a ref. The React Compiler removes this class of bug (section 7), which is a good reason to enable it.

---

## 4. Context, state and the re-render blast radius

```tsx
// ❌ one context value object: every consumer re-renders when any field changes
<AuthContext.Provider value={{ user, theme, setTheme }}>
```

```tsx
// ✅ split contexts by change frequency, and memoize the value
const UserContext = createContext<User | null>(null);
const ThemeContext = createContext<Theme>({ mode: 'light', setMode: () => {} });

const themeValue = useMemo(() => ({ mode, setMode }), [mode]);
<ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>
```

| Situation | Better tool |
| --- | --- |
| Value changes rarely, read widely (theme, locale, session) | context (split by frequency) |
| Value changes often, read in a few places (form input, drag position) | local state, or an external store with selectors (Zustand) |
| Server data | the query library's cache (Part 9) |
| Derived value from state | compute during render; `useMemo` only when measured expensive |

💡 **The blast-radius question** is the fastest way to reason about performance: *when this state changes, which components re-render?* If the answer is "the whole page", colocate or split before reaching for `memo`.

---

## 5. Loading performance: splitting and the critical path

```tsx
import { lazy, Suspense } from 'react';

// Route-level splitting: the settings screen is not in the first bundle (Part 6)
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

<Suspense fallback={<PageSkeleton />}>
  <SettingsPage />
</Suspense>
```

| Technique | Effect | Cost |
| --- | --- | --- |
| Route-level `lazy` | the first screen ships less JS | a request when the route is visited; a fallback to design |
| Component-level `lazy` (heavy, below the fold) | big wins for editors, charts, maps | more requests; keep the count low |
| Prefetch on intent (`onMouseEnter`, on view) | removes the perceived wait | a little extra bandwidth |
| Smaller dependencies (`date-fns` instead of `moment`, tree-shakeable imports) | smaller bundle | migration effort |
| Deferring non-critical work (`useTransition`, `requestIdleCallback`) | responsive interactions | more complex code |

```tsx
// Prefetch on intent: the chunk is in cache before the click
const loadSettings = () => { void import('./pages/SettingsPage'); };
<Link to="/settings" onMouseEnter={loadSettings} onFocus={loadSettings}>Settings</Link>
```

⚠️ **Splitting has a failure mode**: a bad chunk after a deploy (`Failed to fetch dynamically imported module`) when the user has an old HTML page pointing at removed assets. Handle it by catching the error, telling the user to refresh, and preferring "reload" over a blank screen — plus content-hashed filenames and keeping old assets for a grace period.

---

## 6. Long lists: virtualise, do not memoize

The measurement in section 2 is unambiguous: the cost scales with the *number of rendered rows* (20 000 rows ≈ 1 s to mount, 374 ms per update), while `memo` only removes the per-row render work. Windowing renders a small slice:

```tsx
// Concepts, not a library API: render only what is visible, plus overscan
function VirtualList<T>({ items, rowHeight, height, renderRow }: {
  items: T[]; rowHeight: number; height: number; renderRow: (item: T, index: number) => ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const first = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(height / rowHeight) + 4;          // + overscan
  const slice = items.slice(first, first + visibleCount);

  return (
    <div style={{ height, overflowY: 'auto' }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${first * rowHeight}px)` }}>
          {slice.map((item, i) => <div key={first + i} style={{ height: rowHeight }}>{renderRow(item, first + i)}</div>)}
        </div>
      </div>
    </div>
  );
}
```

| Approach | Rendered rows | Best for | Watch out for |
| --- | --- | --- | --- |
| Plain list with `memo` | all | a few hundred simple rows | mount cost grows linearly (measured) |
| **Windowed/virtualised** | visible + overscan | 1000+ rows, tables, feeds | variable heights, accessibility, `find in page`, printing |
| Pagination | one page | data you can fetch in pages | extra clicks; the server must support it |
| "Load more" | grows | feeds where pagination feels wrong | unbounded growth if never trimmed |
| CSS `content-visibility: auto` | all in DOM, skipped paint | cheap first step for long static pages | not a substitute when the DOM itself is the bottleneck |

⚠️ **Virtualisation is a real trade-off**: the DOM no longer contains all rows, so `Ctrl+F` finds only what is rendered, screen readers see a window, and `document.querySelectorAll('tr')` is not the data. Libraries (`@tanstack/react-virtual`, `react-window`) handle the tricky parts (variable heights, sticky headers, keyboard navigation) — reach for one rather than hand-rolling beyond a prototype, and keep the accessible fallback (a "table view" or pagination) for print/search use cases.

---

## 7. React Compiler: the 2025 change to this whole picture

React Compiler 1.0 (stable since 7 October 2025) is a build-time tool that memoizes automatically: it analyses data flow and reuses values and JSX when nothing relevant changed, **including after early returns and for inline arrow functions**, which manual hooks cannot do.

| Task | Before | With the compiler |
| --- | --- | --- |
| Skip re-rendering a child when unrelated state changes | `React.memo(Child)` | automatic |
| Stabilise a callback passed to a memoized child | `useCallback(fn, deps)` | automatic |
| Avoid recomputing an expensive value | `useMemo(() => calc(x), [x])` | automatic |
| Memoize after a conditional return | not possible with hooks | automatic |
| Guarantee identity for an **effect dependency** | `useMemo`/`useCallback` | still use them (the documented escape hatch) |
| Custom prop comparison for `memo` | `memo(Component, areEqual)` | not supported — keep manual `memo` |
| Opt out for one function | — | the `"use no memo"` directive |

Official guidance, which this book follows:

- **New code**: rely on the compiler for memoization; use `useMemo`/`useCallback` where you need precise control (notably effect dependencies).
- **Existing code**: leave existing memoization in place, or remove it only after careful testing — the compiler's boundaries may not match yours, and a changed memoization boundary can change when a `useEffect` fires.
- **Lint**: the Rules-of-React diagnostics now ship in `eslint-plugin-react-hooks`; running the linter is how you find code the compiler cannot optimise safely.
- **Adoption**: incremental; React 17+ is supported (below 19 needs the `react-compiler-runtime` package). Reported production wins include ~12% faster initial loads and >2.5× faster interactions.

⚠️ **The compiler is not an excuse to skip measurement.** It removes *manual* memoization, not the algorithmic problems: rendering 20 000 rows is still 20 000 rows, an expensive computation still runs when its inputs change, and a bad data-fetching pattern still fetches twice. It also does not fix `useEffect` chains or context-driven re-renders of a whole subtree.

---

## 8. How to measure (and in what order)

| Tool | Tells you | When |
| --- | --- | --- |
| Browser Performance panel | the actual flame graph, long tasks, layout/paint | a specific interaction feels slow |
| React DevTools **Profiler** | which components rendered, why, and how long ("highlight updates" for a quick visual) | "something re-renders too much" |
| Render counts in tests (as in section 2) | exactly which components re-render on an action | when you want a regression test for a fix |
| Lighthouse / Web Vitals (LCP, INP, CLS) | user-perceived load and interaction quality | before/after a release, in CI |
| Bundle analyser (`rollup-plugin-visualizer`) | what is big in the bundle | the first load is slow |
| `performance.mark`/`measure` around a suspect block | cheap, targeted timing | a computation you suspect |

```tsx
// A quick "why did this render?" in dev
function useWhyDidYouRender(name: string, props: Record<string, unknown>): void {
  const previous = useRef<Record<string, unknown>>({});
  useEffect(() => {
    const changed = Object.keys({ ...previous.current, ...props })
      .filter((key) => previous.current[key] !== props[key]);
    if (changed.length > 0) console.log(`[why-render] ${name}`, changed.map((k) => [k, previous.current[k], props[k]]));
    previous.current = props;
  });
}
```

**The order that actually works:** (1) get a number for the user-visible problem (INP, a measured interaction, the Profiler); (2) find the component/phase responsible; (3) apply the smallest fix (colocate state, virtualise, split, defer); (4) re-measure, ideally with a test that pins the render count; (5) only then consider memoization. Optimising before step 1 is how teams spend a sprint to save 3 ms.

---

## 9. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `memo` everywhere | slower, more complex, no benefit | measure; memo the expensive children only |
| 2 | `useMemo` for cheap computations | overhead + dependency bugs | compute it; memoize on evidence |
| 3 | Ignoring unstable props (`{}`, `[]`, inline arrows) | `memo` never helps | module constants or `useMemo`/`useCallback` |
| 4 | Empty dependency arrays with stale closures | wrong values rendered/executed | correct deps, or a ref, or the compiler |
| 5 | State at the top of the page | everything re-renders on every keystroke | colocate state |
| 6 | One giant context value | all consumers re-render on any change | split contexts by change frequency |
| 7 | Rendering 10 000 rows | seconds to mount (measured) | virtualise or paginate |
| 8 | Everything in one bundle | slow first load | route-level `lazy` + prefetch on intent |
| 9 | Optimising render when the problem is the network | no user-visible improvement | measure the phase that is slow |
| 10 | Heavy work during render (sorting 50 000 items on every keystroke) | janky typing | debounce, defer with `useTransition`, or move to the server |
| 11 | Animating layout properties (`width`, `top`) | layout thrash | transform/opacity |
| 12 | No before/after measurement | you cannot tell if it helped | a number, then a regression test |

---

## 10. Best practices

1. **Measure before and after**; render counts plus the Profiler for updates, Web Vitals and the bundle analyser for load.
2. **Fix the phase that is slow** (load, first render, update, interaction) — the fixes are different.
3. **Prefer structural fixes** (colocate state, split contexts, virtualise, split code) over memoization.
4. **Memoize deliberately**: expensive children, stable props, and a reason you can state.
5. **Keep dependency arrays honest** — or enable React Compiler and let it handle the boundaries, keeping hooks where you need control.
6. **Virtualise long lists** and keep an accessible/paginated alternative.
7. **Split by route**, prefetch on intent, and handle the failed-chunk case after a deploy.
8. **Move work off the interaction path** with `useTransition`/debouncing when the input should stay responsive.
9. **Set a performance budget** (bundle size, LCP, INP) and check it in CI so regressions are caught by a machine, not a user.
10. **Write down the fix**: a short comment ("memoized because this table renders 500 rows and props are stable") saves the next person from an accidental revert.

---

## 11. Practice

### Beginner

1. Reproduce the probe: 1000 rows, count renders per state update, then add `memo` + `useCallback` and count again. Explain the difference.
2. Make a component re-render 1000 children by changing unrelated state in the parent, then fix it by colocating the state.
3. Add a `useMemo` for an expensive computation and prove with a measurement that it is only worth it above a certain input size.

### Intermediate

1. Build a list of 5000 rows, measure the mount, then virtualise the first 50 and measure again. Report both numbers and the trade-offs you accepted.
2. Split a route with `lazy` + `Suspense`, measure the first-load bundle size before and after, and add prefetch-on-intent.
3. Find an unstable prop defeating `memo` in your app (an object or arrow created inline) and fix it. Prove the fix with a render count test.

### Challenge

1. Take a real slow interaction (typing in a search box filtering 20 000 rows) and improve it three ways: debounce, `useDeferredValue`/`useTransition`, and moving the filtering to a worker or the server. Measure each and recommend one with evidence.
2. Enable React Compiler in a project (following the official incremental adoption guide), run the test suite, and compare: bundle size, render counts in a few tests, and a measured interaction. Document what you removed (or kept) and why.
3. Write a performance budget for an app: bundle sizes per route, LCP/INP targets, a maximum render count for a critical interaction. Wire the budget into CI (a size check and a Lighthouse run) and show a failing build when the budget is exceeded.

---

## 12. Solutions

### Beginner

1. The probe in section 2: naive gives 1 parent render + 1000 row renders per update; with `memo(Component)` and a `useCallback` handler the parent renders once and the rows render **zero** times. The remaining cost is React reconciling the 1000 elements — visible as the residual wall-clock time (7.7 ms in the measurement).
2. State in the parent that only the input needs → every keystroke re-renders the list. Move the state into the input component: the parent does not re-render, so neither does the list. This is the cheapest fix in the file — no memoization needed.
3. `useMemo` a sort/filter of N items and time both paths: at N = 100 the difference is noise (and the memo adds a comparison), at N = 50 000 it is a visible win. The lesson is that the threshold is empirical, and you can state it with a number.

### Intermediate

1. 5000 rows measured at ~259 ms to mount in this lab; virtualised to ~50 rendered rows it is ~5 ms (the same order as the 50-row mount in section 2) — a ~50× improvement in first render. Trade-offs accepted: `Ctrl+F` only finds rendered rows, the scroll container needs a fixed height, and variable row heights need measurement.
2. `lazy` moves the route's code out of the entry chunk; the bundle analyser (or `ls -lh dist/assets`) shows the reduction. Prefetch on `onMouseEnter`/`onFocus` hides the request latency; keep fallbacks (skeletons) proportional to the expected wait so the UI does not flash.
3. Typical culprits: `style={{}}` literals, `options={{ pageSize: 20 }}`, `items={data.items ?? []}` (the `?? []` creates a new array when data is missing), and `onSelect={() => …}`. Fix with a module constant, a `useMemo`, or `useCallback`, then add a test asserting the child renders once per parent update.

### Challenge

1. Debounce (~200–300 ms) removes most work and keeps typing smooth; `useDeferredValue` keeps the input responsive while the expensive list lags a frame behind (no artificial delay, and it adapts to the device); a worker/server keeps the main thread free and is the only option when the dataset is huge. Recommendation depends on data size: debounce for client-side filtering under ~5 000 rows, worker above that, server for anything searchable at scale. Each case needs the measured before/after.
2. Enabling the compiler usually removes a pile of `useMemo`/`useCallback` wrappers — but the official advice is to leave existing memoization in place or remove it carefully, because the generated boundaries can differ and affect effects. Report the render-count deltas from a few tests (the numbers should be equal or better) and keep manual memoization where an effect's stability depends on it.
3. Budgets that people actually keep: entry JS ≤ 200 kB gzipped, per-route chunks ≤ 100 kB, LCP ≤ 2.5 s on a mid-tier device profile, INP ≤ 200 ms, and a render-count assertion for one critical interaction (e.g. "typing in search renders at most 3 components"). CI: a size-limit check on the built assets plus Lighthouse CI on the preview deployment; a failure posts the numbers so the fix is obvious.

---

## 13. Summary

- **Re-renders are not automatically a problem** — the cost is the work inside components and the paint that follows; a re-render with unchanged output rarely touches the DOM.
- **Measured in this lab**: a 1000-row list re-rendered **1000 rows (56 ms)** per state update; `memo` + `useCallback` reduced it to **0 row renders (7.7 ms)**, leaving only React's reconciliation of 1000 elements — which memoization cannot make cheaper.
- **Mount cost scales with rows** (50 → 4.6 ms, 1000 → 73.5 ms, 5000 → 258.8 ms, 20 000 → 1015 ms in jsdom): for long lists the answer is **virtualisation or pagination**, not memoization.
- **Four levers for re-renders**, in order of preference: colocate state (cheapest), split contexts by change frequency, `memo` expensive children with stable props, and only then `useMemo` for genuinely expensive values.
- **Unstable props (`{}`, `[]`, inline arrows) defeat `memo`** — and empty dependency arrays cause stale closures; React Compiler removes most of this class of bug, with `useMemo`/`useCallback` kept as escape hatches (notably for effect dependencies).
- **Load performance is a different problem**: route-level `lazy` + `Suspense`, prefetch on intent, smaller dependencies, and a plan for the failed-chunk-after-deploy case.
- **Measure in the right order**: user-visible number → the responsible phase/component → the smallest fix → re-measure and pin it with a render-count test. Everything before step one is guessing.

---

**What's next →** [`08-production-checklist.md`](./08-production-checklist.md) takes the app to a server and then walks the whole release: the production build step by step, hosting choices, SPA routing fallbacks (measured: `/` returned 200 and `/products` returned 404 on a plain static server), cache headers and content hashes, CI/CD pipelines, preview deployments, monitoring, rollback, the code-quality gates, and the pre-deploy checklist that ties Part 15 together.
