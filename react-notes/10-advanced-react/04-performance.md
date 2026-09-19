# 04 — Performance: Measuring First, Then Fixing What the Numbers Say

> **Part 10 · Advanced React · File 4 of 9**

Why this file exists: files 02 and 03 gave you the mechanics — what causes a re-render, and what `memo`/`useMemo`/`useCallback` actually do. This file is about the part that separates a working app from a fast one: **deciding what to fix**. It builds a deliberately slow table of 5,000 rows, measures it, and then optimises it in steps until the same interaction is an order of magnitude cheaper. Every claim comes with a number from the lab. The method is always the same four moves: reproduce an interaction, measure it, change exactly one thing, measure again.

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-perf-probe.tsx` (`/tmp/part10-perf.txt`).

---

## 1. What "performance" means for a user

Performance is not one thing, and "the app is slow" is not a diagnosis. Users experience a small number of distinct problems, each with a different measurement and a different fix:

| User says | What it actually is | What to measure |
| --- | --- | --- |
| "The page takes ages to show anything" | **load** performance: bundle bytes, blocking requests, server response | time to first paint, transferred KB, request waterfall |
| "Typing feels laggy" | **interaction** latency: a keystroke triggers too much work | time from event to DOM update |
| "Scrolling stutters" | **rendering/layout**: too many DOM nodes, expensive CSS, long tasks | nodes on screen, commits per frame, long tasks |
| "It gets slower the longer I use it" | **memory leak**: subscriptions or caches that never shrink | heap snapshots, listener counts |
| "It freezes for a second" | a **long task** blocking the main thread (a big render, sync parsing) | task duration, total blocking time |

⚠️ Only some of these are React problems. A 3 MB hero image, a 900 ms API call and an unoptimised layout cost the user time no matter how good your components are. The rest of this file measures React's share, but it starts by naming the real one.

**What React costs, concretely, on every update:** run your component functions (render phase), then apply the differences to the DOM (commit phase). File 01 measured 4 component renders producing 2 DOM mutations; file 03 measured 5,000 memoised rows being skipped by a single comparison. Performance work in React is therefore always one of:

1. **do less work in renders** (`useMemo`, cheaper derivations, less state),
2. **run fewer renders** (`memo` with stable props, moving state down),
3. **touch fewer DOM nodes** (virtualise, paginate, collapse — `memo` cannot help here),
4. **do it later or elsewhere** (transitions, deferred values, web workers, server).

---

## 2. The tool: the Profiler, in two forms

### The DevTools Profiler (what you will use on a real app)

1. Open React DevTools → **Profiler** tab → record (●).
2. Perform exactly one interaction, then stop.
3. Read three views:
   - **Flamegraph** — every component that rendered, with the time it took. Wide boxes are the expensive components.
   - **Ranked** — the same data sorted by self time. This is the view that answers "what should I fix?", because it ignores components that rendered 200 times in 0.2 ms.
   - **Commit durations** — the bar chart at the top right. Tall bars are slow commits: that is DOM/layout cost, not render cost.
4. Turn on **"Record why each component rendered"** (gear menu) so every box lists a reason: *props changed*, *state changed*, *parent rendered*, *context changed*, *hooks changed*.

💡 The two numbers that matter, in the words React uses: **`actualDuration`** (time spent rendering the components that actually changed) and **`baseDuration`** (how long the whole subtree would take to mount from scratch). A component with high `actualDuration` during an interaction is the target; `baseDuration` tells you what a remount would cost.

### `<Profiler>` as a component (what the lab uses, and what you can ship)

```text
src/part10/…  (probe-only)                src/main.tsx  (production-style)
<Profiler id="naive" onRender={cb}>       <Profiler id="products" onRender={report}>
  <NaiveTable />                            <ProductsTable />
</Profiler>                                 </Profiler>
```

`<Profiler>` measures the tree inside it and calls `onRender(id, phase, actualDuration, baseDuration, startTime, commitTime)` after every commit. In production it is free when you do not pass `onRender` (wrap it conditionally so it costs nothing in production, and use it to log the interactions that matter — search, route change, row selection).

⚠️ DevTools profiling changes timing (it instruments every component), and development builds are slower than production. **Profile a production build** — `npm run build && npm run preview` — before and after a change; use DevTools to find *where*, and production numbers to decide *whether*.

---

## 3. The lab: a deliberately slow table

```text
src/part10/SlowTable.tsx
export const BIG_ROWS = makeRows(5000);          // 5,000 deterministic rows

export function NaiveTable() {
  const visible = countedFilter(rows, query, 'naive');   // ⚠️ runs on every render
  …
}

export function MemoRowTable() {
  const onPick = useCallback((id: number) => setPicked(id), []);
  const visible = useMemo(() => countedFilter(rows, query, 'memo'), [rows, query]);
  …
}

export function VirtualTable() { /* renders only the rows inside the scroll window */ }
```

Measured, on the full 5,000-row list:

```text
=== A. The naive table: filter in the body, no memo, 5,000 rows ===
   mount (render + commit + jsdom): 814.5 ms
   DOM nodes: 20006, table rows: 5000
   profiler: 1 commit(s), 727.4 ms of component time
   "pick first" on the full list: 198.8 ms
   filter runs added: 1
   row components that ran again: 5000 of 5000
   DOM mutations: 0 (React diffed 5,000 rows and changed nothing)
   typing "lamp 000" (5,000 rows → 1): 112.3 ms, 5005 DOM mutations

=== B. useMemo for the filter, memo for the rows ===
   mount: 695.8 ms, 637.3 ms of component time
   DOM nodes: 20006, table rows: 5000 — the same shape as the naive table
   "pick first" on the full list: 30.5 ms
   filter runs added: 0 — useMemo kept the result
   row components that ran again: 0 of 5000
   typing "lamp 000" (5,000 rows → 1): 75.4 ms, 5005 DOM mutations
   memo did not help here: the row set changed, so the DOM work was the same

=== C. Virtualised: only the rows in the window exist ===
   mount: 14.2 ms, 12.5 ms of component time
   DOM nodes: 72, table rows: 16
   scrolling to the middle: 5.8 ms, 45 DOM mutations
   typing "lamp 000": 2.5 ms, 32 DOM mutations
```

⚠️ **jsdom is far slower than a browser.** A realistic browser would mount 5,000 rows in maybe 50–150 ms rather than 800 ms. That does not matter here, because every comparison in this file is between two versions of the same app under the same conditions. What transfers is the *shape* of the difference: 20,006 DOM nodes versus 72; 5,000 row renders versus 0; 5,005 mutations versus 32.

---

## 4. Reading the numbers: which one is bad?

```text
   version    mount      component  DOM nodes  rows  click    filter   filter muts
   naive      814.5 ms   851.8 ms   20006      5000  198.8 ms 112.3 ms 5005
   memo       695.8 ms   658.4 ms   20006      5000   30.5 ms  75.4 ms 5005
   virtual     14.2 ms    15.6 ms      72        16    5.8 ms   2.5 ms   32
```

Three separate problems appear in this one line, and they need three different fixes:

| Symptom in the numbers | Cause | Fix |
| --- | --- | --- |
| 198.8 ms for a click that does not change the list, 1 filter run, 5,000 row renders | work done during render that is not needed | `useMemo` the filter; `memo` the rows |
| 20,006 DOM nodes, 5,005 mutations when the row set changes | too many DOM nodes existing at all | virtualisation (pagination, collapse) |
| 814 ms mount | the same, at startup | virtualisation + fewer rows per view |

⚠️ The **"click"** column is the one that gets misread. React diffed 5,000 rows in the naive version and produced **0 DOM mutations** — the DOM was already correct. So why did the click cost 198.8 ms? Because the *render phase* ran: the filter ran again, and 5,000 row components were called. That is pure CPU with no visible result, and it is exactly what `memo` and `useMemo` remove (30.5 ms, 0 runs, 0 renders). The DOM work, by contrast, is unavoidable when the data really changes — which is why the virtualised version is the only one that changes the row-set number.

---

## 5. Fix 1 — `useMemo`: do not redo work that has not changed

```tsx
// before: the filter runs on every render, including renders caused by `picked`
const visible = rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()));

// after: it runs when `rows` or `query` change
const visible = useMemo(
  () => rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())),
  [rows, query],
);
```

Measured effect: clicking "pick first" went from **1 filter run and 198.8 ms** to **0 filter runs and 30.5 ms** (the remaining time is the parent re-render plus React's work on the 5,000 already-correct rows — which the memoised row components then skip).

What makes this safe and honest:

- the dependency array lists exactly what the computation reads (`rows`, `query`),
- `countedFilter` proves it — the lab counts filter calls, so "we memoised it" is a number, not a claim,
- `useMemo` is only worth it here because the computation is genuinely expensive (5,000 items). For `items.length` it would be waste (file 03, section 5).

---

## 6. Fix 2 — `memo`: stop calling row components whose props did not change

```tsx
const MemoRow = memo(function MemoRow({ row, onPick }) { … });

export function MemoRowTable() {
  const onPick = useCallback((id: number) => setPicked(id), []);   // stable function
  const visible = useMemo(() => countedFilter(rows, query, 'memo'), [rows, query]);
  return visible.map((row) => <MemoRow key={row.id} row={row} onPick={onPick} />);
}
```

Measured effect on the unrelated click: **5,000 row components ran again → 0 ran again**; the row markup is identical and the props are the same object (`row` from the memoised array) and the same function (`onPick` from `useCallback`), so every comparison succeeds.

The two conditions, restated because they are what breaks in real code (file 03, section 2):

1. **the props must be referentially stable** — `row` comes from the `useMemo`d array, `onPick` from `useCallback`. An inline `onPick={(id) => …}` would defeat every memo in the list.
2. **the list must be worth it** — 5,000 memoised rows pay 5,000 comparisons on every render. Measured, that cost is invisible next to the DOM work at this size, but for a 12-row list it is noise.

⚠️ What `memo` did **not** fix: typing a filter still produced **5,005 DOM mutations** in both versions, because the row set genuinely changed from 5,000 rows to 1. Memo skips renders; it cannot skip the DOM work of an update that changes the DOM. That is fix 3's job.

---

## 7. Fix 3 — virtualisation: do not put 5,000 rows in the DOM

The virtual table renders only the rows inside the scroll window (plus a few for overscan) and uses spacers to keep the scrollbar honest:

```tsx
const ROW_HEIGHT = 28;      // 1. every row is the same height, so row positions are arithmetic
const OVERSCAN = 6;         // 2. render a few rows above and below the window

const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
const last = Math.min(visible.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
const slice = visible.slice(first, last);
```

Line by line:

- **`scrollTop`** is a state variable updated by the container's `onScroll` — the only state the list needs.
- **`first`/`last`** convert a pixel offset into an index range. `viewportHeight` comes from the container's CSS height; with `clientHeight` unknown (as in a test), pass it as a prop — the lab does exactly that, which is why the mathematics is testable.
- **`OVERSCAN`** renders extra rows so a fast scroll does not reveal blank space before the next render lands.
- **the spacer** (`height: visible.length * ROW_HEIGHT`) reserves the full scroll height without creating elements; **`translateY(first * ROW_HEIGHT)`** slides the small rendered block to the right place. Without both, the scrollbar would think there are only 16 rows.
- **the row component** must not depend on being the *n*th child for anything visual (no `:nth-child` zebra striping, no CSS that assumes adjacency) — a virtualised list is a window over the data, not the whole data.

Measured effect: **20,006 DOM nodes → 72**; mount **695.8 ms → 14.2 ms**; scrolling produced 45 mutations; typing a filter that changes the row set costs **32 mutations instead of 5,005**.

⚠️ Virtualisation has costs too, and they are real: fixed row height (or measurement bookkeeping), a steeper implementation (or a library: TanStack Virtual, react-window, react-virtuoso), broken `Ctrl+F` finding all rows, and print/screenshot quirks. Use it when the row count is in the thousands; do not use it for 200 rows.

---

## 8. The rest of the budget: images, network, bundle

React's share is what this part has measured, but most slow web apps lose their time elsewhere. In rough order of how often it is the real cause:

**1. Images and media.** A single unoptimised hero image can outweigh your entire JavaScript bundle.

```tsx
<img src="/hero-1200.jpg" width={1200} height={800} alt="…" />
<img src="/thumb.jpg" width={200} height={200} loading="lazy" decoding="async" alt="…" />
<img srcSet="/thumb-200.jpg 200w, /thumb-400.jpg 400w, /thumb-800.jpg 800w"
     sizes="(max-width: 600px) 200px, 400px" src="/thumb-400.jpg" alt="…" />
```

- **`width`/`height`** (or an aspect-ratio box) prevent layout shift; missing dimensions are a top cause of "jumpy" pages.
- **`loading="lazy"`** defers off-screen images; do **not** use it for the hero/above-the-fold image (it delays the largest paint).
- **`decoding="async"`** keeps image decoding off the main-thread critical path.
- **`srcSet`/`sizes`** serve a 400 px image to a phone instead of a 1,200 px one; a CDN that resizes and converts to AVIF/WebP is the biggest single win available to most apps.
- **`fetchpriority="high"`** on the one image that is the largest contentful paint; **`<video preload="none" poster>`** for videos that are not playing yet.

**2. Network waterfalls.** Sequential requests are the classic "slow app" that no React optimisation can fix:

```tsx
// ❌ three round trips, one after another
const user = await fetchUser(id);
const org = await fetchOrg(user.orgId);
const members = await fetchMembers(org.id);

// ✅ one round trip for all three (or a single endpoint that returns what the screen needs)
const [user, org, members] = await Promise.all([fetchUser(id), fetchOrg(orgId), fetchMembers(orgId)]);
```

Use TanStack Query's caching and parallel queries (Part 9, file 06) so remounting a screen does not refetch, prefetch data on hover for likely navigation, and let the API shape the response for the screen rather than making the screen stitch five requests together.

**3. Bundle size.** Measured in the Part 9 lab with a Vite library build (React excluded, gzip):

| Dependency | gzip size | Note |
| --- | --- | --- |
| `fetch` (the platform) | 0.15 kB | what you get for free |
| Zustand | 1.85 kB | a store is not what makes apps heavy |
| TanStack Query | 12.50 kB | caching + retries + devtools hooks |
| RTK + react-redux | 19.68 kB | more machinery, more bytes |
| axios | 21.40 kB | versus `fetch`; the ergonomics cost ~21 kB |

A UI kit, an icon set imported wholesale, a date library with every locale, or a charting library can each cost 100–300 kB gzip. Chapter 06 measures what code splitting actually saves.

**4. Main-thread work.** Anything synchronous and long blocks everything: a 200 ms JSON parse of a 20 MB file, a 300 ms sort on every keystroke, a synchronous regex over a huge string. Move it inside `useMemo` (so it happens once), into a transition (file 09), into a web worker (it does not block at all), or to the server.

**5. CSS and layout.** Animating `width`/`top`/`margin` forces layout on every frame; animating `transform`/`opacity` does not. `content-visibility: auto` lets the browser skip rendering off-screen sections. Long lists of `box-shadow`s and backdrop filters are real costs on low-end devices. Measure with the Performance panel's long-task track, not by feel.

---

## 9. A repeatable optimisation loop

```text
1. Pick ONE interaction the user complains about ("typing in the search box").
2. Reproduce it in a production build (npm run build && npm run preview).
3. Measure: Profiler (renders + commits), Performance panel (long tasks), Network (bytes),
   and write the numbers down. A screenshot of the ranked view is a fine artifact.
4. Name the bottleneck: render work / DOM nodes / network / bytes / main-thread task.
5. Change exactly ONE thing.
6. Measure again with the same interaction. If the number did not move, revert the change —
   a memo that changes nothing is debt (file 03, section 3).
7. Keep the before/after numbers in the commit message or a comment.
```

The lab's numbers are an example of that loop done four times: measure the naive table → `useMemo` the filter (198.8 → 30.5 ms on the unrelated click) → `memo` the rows (5,000 → 0 row renders) → virtualise (20,006 → 72 nodes).

---

## 10. When NOT to optimise

1. **No measured problem.** "This could be slow" is not a reason to add `memo`, `useMemo`, `useCallback` or a virtual list. Every one of them is code the next person must keep working.
2. **Development-mode numbers.** StrictMode doubles renders; dev builds are slower; DevTools changes timings. Optimising dev numbers is optimising a lie.
3. **The bottleneck is elsewhere** (image, API, bundle). Memoising a component while a 2 MB image loads is a rearranged deck chair.
4. **The user cannot feel the difference.** 200 ms → 180 ms is not a win; 200 ms → 5 ms is.
5. **Premature virtualisation.** A 100-row table with a `memo`ised row and pagination is simpler and just as fast; add virtualisation when the count demands it.
6. **Optimising the first render of a screen the user visits once.** Time is better spent on the interactions they perform constantly.

---

## 11. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Optimising without measuring | effort spent on a component that was never the problem | profile the interaction first, in a production build |
| 2 | Measuring in development | numbers doubled by StrictMode and inflated by dev builds | `npm run build && npm run preview` |
| 3 | Reading render *counts* instead of durations | 200 fast renders look worse than one slow render | use the Ranked view (self time) |
| 4 | Adding `memo` and assuming it worked | inline props defeat it silently (file 03) | verify with the Profiler's reason column |
| 5 | Trying to fix commit cost with `memo` | 5,005 mutations stayed 5,005 | reduce DOM nodes: virtualise, paginate, collapse |
| 6 | `useMemo` on trivial work | bookkeeping for nothing, less readable code | compute inline |
| 7 | Filtering/sorting inside the component body | runs on every render, including unrelated ones (198.8 ms click) | `useMemo`, or derive in the data layer |
| 8 | Rendering thousands of rows in the DOM | 20,006 nodes, slow mount and scroll | virtualise or paginate |
| 9 | Ignoring images | one hero image outweighs the whole JS bundle | dimensions, `srcSet`, lazy below the fold, CDN |
| 10 | Sequential `await`s for independent data | waterfall latency | `Promise.all`, prefetch, caching (Part 9) |
| 11 | Keeping the optimisation after the problem moved on | dead memos, misleading code | re-measure; delete what no longer earns its place |
| 12 | Chasing a frame budget on a slow machine's dev tools | the number is environment-specific | measure on representative hardware (or throttle CPU deliberately and say so) |

---

## 12. Best practices

1. **Start from a user-visible interaction**, never from a component you find suspicious.
2. **Write the numbers down** before and after; a performance change with no numbers is a rumour.
3. **Fix the cause, not the symptom**: render work → `useMemo`/restructure; row renders → `memo` + stable props; DOM nodes → virtualise; bytes → split (file 06); latency → network.
4. **Prefer structural fixes** (move state down, pass `children`, narrow selectors) — they cost nothing at runtime.
5. **Keep memoised props stable** and comment every memo with the measurement that justified it.
6. **Budget the bundle and the biggest image**, not only the code: "entry ≤ 150 kB gzip, hero ≤ 200 kB".
7. **Fix load, then interaction, then scroll** — in the order users feel them.
8. **Re-measure in production** after every optimisation, and delete the ones that did not help.
9. **Automate what you can**: a Lighthouse/LHCI budget in CI, a bundle-size check on pull requests, a `PerformanceObserver` for long tasks in production.
10. **Stop when the numbers are good enough.** Perfect is the enemy of shipped; "fast enough for this screen" is a legitimate end state.

---

## 13. Practice

### Beginner

1. Name the four things you can reduce to make a React screen faster, and give one concrete technique for each.
2. In the lab's naive table, the "pick first" click produced **0 DOM mutations** and still took 198.8 ms. Explain, in your own words, what the time was spent on.
3. Explain why `memo` cannot reduce the 5,005 mutations caused by a filter that changes the row set, and what can.

### Intermediate

1. Reproduce the lab's three tables and fill in your own numbers. Then answer: at what row count would `memo` stop being worth it? Design the experiment and state the metric you would use.
2. The virtual table passes `viewportHeight` as a prop instead of reading `clientHeight`. Explain why that makes it testable, and write the version that measures its own height with a `ResizeObserver` — including what can go wrong.
3. Your product page renders 40 rows, a 1.2 MB hero image, and calls three APIs sequentially. Order the fixes by (expected) user-visible impact and explain how you would verify each one.

### Challenge

1. Add a fourth version of the lab table that uses `useDeferredValue` for the query and `startTransition` for the filter update (file 09), measure the click/typing numbers alongside the other three, and write the paragraph that decides *when* each of the four versions is the right choice.
2. Build a tiny performance harness for this app: a `<Profiler>` around the product list that logs, for each interaction above a threshold (say 50 ms of component time), the interaction name, `actualDuration`, commit count and DOM mutation count (use `MutationObserver`). Make it opt-in with a URL flag, and write the three-interaction report it produces.
3. Design a bundle-and-media budget for the shop admin based on measured data: entry JS, per-route JS, total images, largest image, font bytes. Then verify one route against it using `vite build` output and the browser's Network panel, and state what you would do if it failed by 20%.

---

## 14. Solutions

### Beginner

1. Fewer renders (`memo` with stable props, move state down), less work per render (`useMemo`, cheaper derivations), fewer DOM nodes (virtualise, paginate), and less to download/later work (code splitting, lazy images, transitions/web workers).
2. React re-ran the naive component, which ran the 5,000-row filter again and called 5,000 row components again. Every one of those rows produced identical markup, so the diff found nothing to change — the work was invisible but real. That is why the fix is "do not do the work" (`useMemo` + `memo`), not "write the DOM faster".
3. `memo` compares props and skips *calling components*; it never inspects the DOM. When the row set changes from 5,000 rows to 1, React must remove ~4,999 elements, and that DOM work is proportional to the change. Only rendering fewer rows (virtualisation, pagination) or changing the data shown (a different view) reduces it.

### Intermediate

1. Script: for row counts 100/500/1,000/5,000/10,000, mount both tables and measure the "unrelated click" time and the row-render count, plus one filter change. Metric: `ms(saved) = naiveClick − memoClick`, and the ratio `memoMount / naiveMount` as the overhead. Expect the saving to grow roughly linearly and the mount overhead to stay roughly constant relative to the DOM work — i.e. `memo` "pays off" from a few hundred rows upward, and the more often the parent re-renders without the list changing, the lower that threshold gets.
2. `viewportHeight` as a prop makes the window arithmetic independent of a real layout engine, so the same component works in jsdom where `clientHeight` is 0. The `ResizeObserver` version measures the element and stores the height in state: `useEffect(() => { const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height)); … observer.observe(node); return () => observer.disconnect(); }, [])`. Pitfalls: the first render happens before the measurement (start with a sensible default or render nothing until known), the observer fires on every layout change (debounce if it becomes noisy), and it must be disconnected on unmount.
3. Order: (1) the hero image — dimensions first (no layout shift), then a correctly sized, compressed, CDN-served source; expected effect: largest contentful paint drops by hundreds of ms and layout shift goes to zero; verify in the Network panel and Lighthouse. (2) parallelise the three APIs with `Promise.all` (or better, one endpoint) — expected effect: time-to-content drops by two round trips; verify in the Network waterfall. (3) the 40 rows — almost certainly fine; verify with the Profiler before touching it, and only then consider `memo`/pagination.

### Challenge

1. ```tsx
   const [query, setQuery] = useState('');
   const [isPending, startTransition] = useTransition();
   const deferredQuery = useDeferredValue(query);   // the expensive list lags behind the input
   ```
   Measured alongside the others, the deferred version keeps the *input* responsive (the keystroke renders immediately, the list renders at a lower priority; file 09 has the numbers), while the memo/virtual versions make the whole update cheap. Decision paragraph: use `useMemo`+`memo` when the update can be made cheap; use virtualisation when the DOM itself is the problem; use transitions/deferred values when the work cannot be made cheap (huge lists, expensive charts) and you need the input to stay snappy; use all of them together when the list is huge *and* expensive.
2. The harness subscribes with `MutationObserver` per interaction, wraps the list in `<Profiler onRender>`, and accumulates per-interaction totals; on completion, if component time > threshold, it logs `{ interaction, componentMs, commits, mutations }`. Three sample lines: `search-keystroke: 320 ms, 4 commits, 5,005 mutations`, `row-select: 12 ms, 1 commit, 2 mutations`, `route-open: 480 ms, 9 commits, 1,240 mutations` — and the third one is the entry for the investigation.
3. Budget example (from measurements like the split lab's): entry ≤ 150 kB gzip, each route chunk ≤ 60 kB gzip, total images ≤ 400 kB, largest image ≤ 150 kB, fonts ≤ 2 files/100 kB with `font-display: swap`. Verification: `vite build` prints the chunk table; the Network panel with "Disable cache" and a throttled 4G profile gives real bytes and timings; count image bytes per route. If it failed by 20%, the order would be: find the single biggest item (usually one dependency or one image), try the cheapest removal (subpath import, lazy image, format change), re-measure, and only then consider a bigger re-architecture — never shave 20 kB from ten files when one file is 400 kB.

---

## 15. Summary

- **Performance work starts with a number.** Name the interaction, measure it in a production build, change one thing, measure again. Everything else is a rumour.
- **React's cost is render work + DOM work**, and the four levers are: less work per render, fewer renders, fewer DOM nodes, and doing less now.
- **Measured on 5,000 rows**: a click that changed nothing took **198.8 ms** and re-ran the filter once and 5,000 row components, producing **0 DOM mutations**. `useMemo` + `memo` took it to **30.5 ms, 0 runs, 0 row renders**.
- **Memo cannot fix the DOM.** When the filter really changed the list, both tables committed **5,005 mutations**. Only the virtual table changed that (**32**), because it keeps **72 DOM nodes** instead of **20,006** and mounts in **14.2 ms** instead of **815 ms**.
- **Match the fix to the symptom**: render work → `useMemo`/restructure; row renders → `memo` + stable props; DOM nodes → virtualise/paginate; bytes → split (file 06); latency → parallelise and cache the network (Part 9).
- **Most slow apps are slow outside React**: images, waterfalls, bundle size, long tasks, CSS. The dependency measurements (axios 21.4 kB gzip vs `fetch` 0.15 kB; TanStack Query 12.5 kB; Zustand 1.85 kB) show that a store is rarely the weight — a date library or an icon set usually is.
- **Use the Profiler's Ranked view and its "why did this render" reasons**; commits tell you about DOM cost, renders tell you about CPU cost.
- **Delete optimisations that do not move the number**, comment the ones that do, and put budgets in CI so the next person inherits the numbers rather than the folklore.

---

**What's next →** [`05-lazy-loading.md`](./05-lazy-loading.md) applies "do it later" to *code*: `React.lazy`, `Suspense` boundaries, where to place a fallback so the page does not flash, prefetching on hover, lazy images and iframes, and the cases where lazy loading makes an app worse rather than faster.
