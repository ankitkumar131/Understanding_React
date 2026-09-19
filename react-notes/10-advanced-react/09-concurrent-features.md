# 09 — Concurrent Features: `useTransition` and `useDeferredValue`

> **Part 10 · Advanced React · File 9 of 9**

Why this file exists: files 02–04 made re-renders *fewer and cheaper*; this file makes them **interruptible**. There is a class of update that cannot be made cheap — a filter over a huge list, a chart re-computed from 10,000 points, a table re-sorted on every keystroke — and for that class React offers two tools: `useTransition` and `useDeferredValue`. Both let an urgent update (what the user typed, clicked or is dragging) commit immediately while a non-urgent update (the expensive result of it) is rendered in the background, and both come with measurements in this file: 47.6 ms per keystroke without them, three keystrokes producing **4 expensive renders eagerly but 2 with a deferred value** because React skipped the intermediate values, and a render log that shows `pending=true` for exactly one pass.

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-concurrent-probe.tsx` (`/tmp/part10-concurrent.txt`).

---

## 1. The problem: one queue for two kinds of work

React renders updates in the order it receives them. When everything shares one priority, a keystroke that triggers a 40 ms list render blocks the *next* keystroke — the classic "typing feels laggy" bug, and it has nothing to do with network latency.

The insight behind concurrency is that not all updates matter equally:

| Update | Priority | Example |
| --- | --- | --- |
| The user's own input | **urgent** — must commit before the next paint | typing, clicking, dragging, toggling |
| The result of that input | **non-urgent** — can take a moment | filtering, sorting, charting, re-laying out a huge list |

React 18 introduced the machinery to keep two lanes: a transition renders in the background and can be **interrupted and restarted** if something urgent arrives, while urgent updates always go first. React 19 keeps it and adds `use()` and actions on top (chapter 07).

⚠️ **What concurrency is not:** it is not a web worker, not a thread, not asynchronous rendering in the "await" sense, and not a way to make work cheaper. Everything still runs on the main thread; the difference is that the expensive render can be *paused between components* and thrown away if it is no longer needed. "It makes slow updates feels fast" is wrong; "it keeps fast updates fast while slow ones catch up" is right.

---

## 2. `useTransition`

```tsx
import { useState, useTransition } from 'react';

function ProductSearch() {
  const [text, setText] = useState('');        // urgent: the input's value
  const [query, setQuery] = useState('');      // non-urgent: what the list uses
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <input
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);                                   // commits immediately
          startTransition(() => setQuery(next));           // rendered in the background
        }}
      />
      {isPending && <span aria-hidden="true">updating…</span>}
      <ExpensiveList query={query} />
    </>
  );
}
```

Line by line:

- **`useTransition()`** returns `[isPending, startTransition]`. It does not hold state; it is a way to mark updates.
- **`startTransition(() => setQuery(next))`** schedules that state update as non-urgent. The updater must be synchronous: `startTransition(async () => …)` does not mark the awaited part (use `useActionState`/actions for async work, Part 11).
- **`isPending`** is `true` while the transition work is being rendered — designed for subtle indicators (a dimmed list, a small "updating…"), not for a page-blocking spinner.
- **Two states, not one.** The input reads `text` (urgent) and the list reads `query` (deferred). If both read the same state, the input itself becomes non-urgent and the user sees their typing lag — the most common mistake with transitions.

Measured, on a list where filtering takes a deliberately blocking 30 ms:

```text
=== D. useTransition: same idea, plus a pending flag you can show ===
   expensive runs: 2, queries seen: ["","row 02"]
   pending line: pending=false
   input value kept: row 02
   render log: ["render text=\"row 02\" query=\"\" pending=true","render text=\"row 02\" query=\"row 02\" pending=false"]
```

The render log is the whole story: **the first pass carried the keystroke (`text="row 02"`) with `pending=true` while the list still had the old query**, and the second pass — after the expensive work — had both values and `pending=false`. The expensive filter ran twice in total (mount and the transition), not once per keystroke-and-then-again, and the input's value was never behind.

---

## 3. `useDeferredValue`

```tsx
import { useDeferredValue, useMemo, useState } from 'react';

function ProductSearch() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);   // "the version of query that can lag"
  const visible = useMemo(() => expensiveFilter(products, deferredQuery), [deferredQuery]);

  return (
    <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <span>{query !== deferredQuery ? 'updating…' : ''}</span>
      <List rows={visible} />
    </>
  );
}
```

- **`useDeferredValue(value)`** returns a copy of the value that React is allowed to keep at the previous value while it renders the new one in the background. The urgent update (the input's `query`) commits first; the deferred value catches up in a lower-priority render.
- **`query !== deferredQuery`** is the built-in staleness indicator — it is exactly what `isPending` tells you in the transition version, expressed as a value comparison.
- **`useMemo` is not optional here.** Without it, the urgent render would re-run the expensive filter using the *old* deferred value — work that is thrown away on the next pass. With it, the urgent pass reuses the memo and only the deferred pass pays.

Measured:

```text
=== A. Without deferral, every keystroke blocks on the expensive list ===
   one keystroke that changes the query: 47.6 ms
   expensive runs so far: 2, queries seen: ["","row 01"]

=== B. useDeferredValue: the input is urgent, the list is not ===
   same keystroke: 36.5 ms
   expensive runs: 2, queries seen: ["","row 01"]
   render log: ["render input=\"row 01\" deferred=\"\"","render input=\"row 01\" deferred=\"row 01\""]
```

Same expensive work, two passes instead of one, and the first pass (the one the user's keystroke depends on) no longer carries it. The render log shows the stale-then-fresh sequence explicitly: the middle render has the new input with the old list, and the last one catches up.

---

## 4. The number that shows concurrency working: skipped work

```text
=== C. Three keystrokes in one tick: what lands in the list? ===
   eager list: 4 expensive run(s) for queries ["","r","ro","row"]
   deferred list: 2 expensive run(s) for queries ["","row"]
   React skipped the intermediate values: only the last one was rendered
```

Three keystrokes typed faster than the list can render. The eager version renders each intermediate query (`""`, `"r"`, `"ro"`, `"row"`) — four expensive runs, three of whose results the user never sees. The deferred version runs the expensive work twice: once for the mount and once for `"row"`, because **the background render was interrupted and restarted with the newest value before it finished**. That is the property that makes typing feel smooth: React discards work that has already been superseded.

⚠️ Two consequences worth knowing:

- **Effects in a transition can run twice** (the interrupted render may have committed, or StrictMode may double-invoke in development). Keep transition effects idempotent, or keep side effects out of transitions entirely.
- **The work must be interruptible JavaScript.** A 200 ms synchronous `JSON.parse` inside one component cannot be paused mid-function; React can only give up *between* components/updates. Transitions help most when the expensive work is distributed across a render (filtering, mapping, diffing big subtrees) and least when it is one giant function call. For that case, a web worker or the server is the answer.

---

## 5. `useTransition` or `useDeferredValue`?

| | `useTransition` | `useDeferredValue` |
| --- | --- | --- |
| You control… | the update (`startTransition(() => setX(next))`) | the value (`const deferred = useDeferredValue(x)`) |
| Typical use | "this state change is not urgent" | "this prop/value can lag" |
| Where the state lives | the component that calls the hook | anywhere; you defer a value you received |
| Pending signal | `isPending` | `value !== deferredValue` |
| Works for | your own state updates | values you do not control (props from a parent, a context value) |
| Needs a second state? | often (urgent text + deferred query) | no (one state, one deferred copy) |
| Same mechanism | yes — `useDeferredValue` is essentially a transition for a value | yes |

Rules that follow:

- **Defer what you do not own.** A component that receives a prop from above cannot wrap the parent's `setState` in a transition — but it can defer the prop.
- **Transition what you do own**, especially when several states must move together (one transition can wrap multiple setters).
- **Use both when they compose**: defer a prop, and wrap a related local state change in a transition.
- **When a component tree is expensive because of *props that change every render*, neither helps** — that is `memo`/`useMemo` territory (file 03), because the work is repeated for a reason a transition cannot fix.

---

## 6. `startTransition` outside a component

```text
=== E. startTransition() works outside components too ===
   external count: 1
```

```tsx
import { startTransition } from 'react';   // the same function, no hook

store.subscribe(() => {
  // a websocket message arrives: nice to show, but the user's typing comes first
  startTransition(() => store.bump());
});
```

The urgency is a property of the **call**, not of a component: any state update — including one that reaches React through `useSyncExternalStore` (Part 9, file 03) — can be marked non-urgent with the standalone `startTransition`. The difference from the hook is only that there is no `isPending` to read outside a component; when you need that flag, use the hook inside the component that renders the pending UI.

**When this is the right call:** live updates (websocket ticks, polled counters, presence indicators) where the data is nice-to-have and the user's input is not. **When it is not:** anything the user must see immediately (their own click acknowledgment, a route change they initiated).

---

## 7. What has to be true for a transition to help

1. **The expensive work must happen during render.** Filtering, mapping, sorting, building a big element tree. Work inside `useEffect` is not part of the transition's render pass, so a transition does not make it interruptible.
2. **The urgent update must not race the expensive one for the same state.** Two states (urgent and deferred) or a deferred value — otherwise the input lags too.
3. **The expensive subtree must be memoised enough not to re-render for other reasons.** A transition makes rendering interruptible; it does not stop a parent from re-rendering 5,000 rows on every keystroke (files 03 and 04).
4. **The work should be spread across components.** React can interrupt between units of work; one long synchronous function inside a component blocks the lot.
5. **The result must tolerate being stale for a moment.** A filtered list that lags 50 ms is fine; a controlled input that lags is not; a payment confirmation definitely not.

---

## 8. Interaction with Suspense (why the two are friends)

Chapter 07 measured the payoff: wrapping an update that suspends in a transition keeps the **old UI visible** instead of hiding it and showing a fallback:

```text
=== E (chapter 07, no transition) === fallback visible: true,  old panel visible: false
=== F (chapter 07, in a transition) === fallback visible: false, old panel visible: true, pending: true
```

That is the same machinery: with a transition, React is allowed to keep the current screen while the new one is prepared, and the `isPending` flag (or a `useDeferredValue` comparison) is how you tell the user something is coming. This is why the recommended pattern for navigation is: **route change → transition → suspense inside the new route → old screen stays until the new route's data is ready.**

---

## 9. When NOT to use them

| Situation | Better tool |
| --- | --- |
| The expensive work is a network request | caching/`staleTime` (Part 9), Suspense (chapter 07), debounce — transitions do not make requests faster |
| The same keystroke should trigger one request, not five | **debounce** the input (Part 7's `useDebouncedValue`) — this is about the network, not about rendering |
| Rendering 5,000 rows that change rarely | virtualisation (file 04) — the DOM cost is the problem |
| Rows re-rendering because props change identity | `memo` + stable props (file 03) |
| A single enormous synchronous computation | a web worker, or do it on the server |
| The update is cheap (a toggle, a small list) | nothing — adding a transition is complexity for no measured gain |
| The user must see the result immediately for correctness | not a transition (state that must stay consistent with the input) |

💡 **Debounce vs deferral, in one line:** debounce decides *whether to do the work at all* (usually to protect the network); deferral decides *when the work is allowed to happen* (to protect the typing). A search box that calls the API often wants both: debounce the request, defer the rendering of the results.

---

## 10. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Transitioning the input's own state | the user's typing lags behind their keys | keep the input urgent; transition the derived state |
| 2 | Forgetting `useMemo` with `useDeferredValue` | the urgent pass re-runs the expensive work with the stale value | memoise on the deferred value |
| 3 | `startTransition(async () => …)` | the awaited part is not marked as a transition | use actions/`useActionState` for async work (Part 11) |
| 4 | Showing a full-page spinner for `isPending` | the screen blanks for background work | subtle indicators (dim, "updating…") |
| 5 | Expecting transitions to make work cheaper | the same expensive render happens, just later | reduce the work (memo, virtualise) as well |
| 6 | Using a transition where a worker is needed | one long synchronous function still blocks | worker/server for big computations |
| 7 | Side effects inside a transition | duplicated effects when a render is repeated | keep effects idempotent; prefer no effects in transitions |
| 8 | Transitions for correctness-critical state | the UI briefly shows stale data in a place that must be exact | keep it urgent, or show an explicit pending state |
| 9 | Deferring props that change identity every render | the deferred value changes every render too | stabilise the prop first (file 03) |
| 10 | Transitioning a route change but leaving stale data | the old screen shows old data indefinitely on error | pair with a boundary and an error state (chapter 08) |
| 11 | Using `isPending` as a data-loading flag | it only means "a transition is rendering" | use the data layer's own flags (Part 9) |
| 12 | Adding transitions everywhere by default | the app becomes harder to reason about, with no measured benefit | measure the interaction first (file 04) |

---

## 11. Best practices

1. **Measure the interaction before reaching for concurrency** — if the render is 3 ms, nothing is needed.
2. **Keep input state urgent and derived state deferred**; never let the input's value be the deferred one.
3. **Memoise the expensive subtree on the deferred value**, and memoise the child components too (file 03) — a transition is not a substitute for either.
4. **Use `isPending`/staleness for subtle feedback** (a dimmed list, a small indicator), never for a blocking spinner.
5. **Defer what you do not own; transition what you do.** Use both together where appropriate.
6. **Wrap navigations and data-refreshing updates in transitions** so existing content stays on screen (chapter 07 measured why).
7. **Keep transitions for rendering; keep side effects out of them** (or make them idempotent), because interrupted renders can repeat work.
8. **Debounce the network, defer the render** — two different problems, two different tools.
9. **Combine with virtualisation and memoisation** for large lists: transitions fix responsiveness, not cost.
10. **Document the decision** next to the hook (the interaction, the measurement, why concurrency instead of a cheaper fix) so the next person can remove it when the list is virtualised.

---

## 12. Practice

### Beginner

1. Explain in your own words the difference between an "urgent" and a "non-urgent" update, and give two examples of each from an app you use.
2. Why does the transition example keep **two** pieces of state (`text` and `query`)? What goes wrong if you use one state for both the input and the list?
3. What does `isPending` mean, and what does it *not* mean?

### Intermediate

1. Reproduce the lab's eager/deferred comparison and explain the four-versus-two expensive runs from the render log. Where exactly did the intermediate values go?
2. Add a debounce (from Part 7) to both the eager and the deferred versions so the API request happens once per pause, and describe the resulting behaviour in terms of: keystrokes, renders, expensive filters, requests.
3. Take a screen of the shop admin with a slow filter and decide, with measurements, which combination of tools it needs: `memo`, `useMemo`, virtualisation, `useDeferredValue`, debounce. Justify each inclusion and each exclusion.

### Challenge

1. Build a `useResponsiveSearch` hook that combines debounce (network), deferral (render), `isPending`-style staleness, an abortable request, and a "results are stale" indicator. Then write the six-line table of what the user sees at 0 ms, 100 ms, 300 ms, 1 s and on failure.
2. Take the 5,000-row table from file 04 and add a version with `useDeferredValue` + virtualisation, then measure four versions (naive, deferral only, virtualisation only, both) on the same interactions. Write the recommendation, including which combination you would ship and what you would deliberately *not* add.
3. Investigate the claim "concurrency makes React apps feel faster". Design an experiment that separates *responsiveness* (time from keystroke to the input's paint) from *total work* (expensive runs), run it on the lab, and write the honest conclusion — including the case where total work goes **up**.

---

## 13. Solutions

### Beginner

1. Urgent updates must be committed before the browser paints the next frame because the user is waiting on them directly: typing in a controlled input, clicking a button, dragging a slider, toggling a checkbox. Non-urgent updates are the consequences: filtering a list, re-sorting a table, re-computing a chart, refreshing a background counter.
2. `text` is what the input displays and must update on the keystroke; `query` is what the expensive list filters by and may lag. With one state, the input's value itself becomes the non-urgent update, so the characters appear late — the exact symptom transitions exist to fix.
3. `isPending` means "React is currently rendering a transition you started". It does **not** mean "data is loading", "a request is in flight", or "the operation succeeded"; those are the data layer's flags (Part 9).

### Intermediate

1. The eager list re-rendered the whole component (and ran the filter) for each committed value: `""`, `"r"`, `"ro"`, `"row"` — four runs, one per keystroke plus the mount. The deferred version rendered the urgent pass three times (with the unchanged deferred value, so the memo kept the old result) and then a single deferred pass with `"row"`: the intermediate deferred values were never rendered, because React restarted the background render with the newest value before finishing.
2. With a 300 ms debounce, the input still updates per keystroke (the debounce only gates the *network* or the derived state you choose to debounce), the renders per keystroke drop to the urgent ones, the expensive filter runs once per pause, and the requests drop to one per pause (with abort/cancellation so a slow response cannot overwrite a newer one). The combination to aim for: **urgent input → debounced network → deferred render of the results**, each tool doing one job.
3. Example decision for a slow product filter: `useMemo` the filter (it must not run per unrelated render); `memo` the rows (so the list's parent renders do not re-render 500 rows); `useDeferredValue` on the query (typing stays snappy); debounce if the data comes from the network per keystroke; virtualisation only if the row count is in the thousands and the DOM is the measured bottleneck. Exclusions matter as much as inclusions: no transition on the input itself, no debounce on locally filtered data (it adds lag for nothing), no virtualisation for 50 rows.

### Challenge

1. The hook wires: `const [text, setText] = useState('')`, a debounced `debouncedText` (300 ms), `const deferredQuery = useDeferredValue(debouncedText)`, a query keyed by `deferredQuery` with an `AbortController` per request, `stale = text !== deferredQuery || isFetching`. Behaviour table: **0 ms** — input shows the keystroke, list unchanged, indicator visible; **100 ms** — indicator still visible, no request yet (debounce); **300 ms** — request starts, deferred render may run; **1 s** — results replace the list, indicator clears; **failure** — the previous results stay with an inline error and retry, because the last good data is better than an empty screen.
2. Four versions measured on the same interactions (mount, type, filter change, row select): naive (highest render time and mutations), deferral only (same total work, better typing responsiveness), virtualisation only (fewer nodes and mutations, but each keystroke still re-renders the whole filtered slice), both (fewest nodes *and* responsive typing). Ship both; deliberately do **not** add `memo` to the rows if virtualisation already renders ~20 of them, and do not add a debounce if the filter is local (no network involved) — those additions would be folklore rather than measured improvements.
3. The experiment: instrument `performance.now()` around the input's commit (time from dispatching the keystroke to the input's next paint-equivalent commit) and count expensive runs. Expected result: responsiveness improves sharply (keystroke no longer waits for the 40 ms filter), while total work stays the same or **increases** (the deferred pass re-renders the urgent component with a stale value — extra renders — and React may restart a background render). The honest conclusion: concurrency buys *perceived* responsiveness by spending more total work and more complexity; it is worth it when the interaction is user-visible (typing, dragging) and not worth it when the same effect is achievable by making the work cheaper.

---

## 14. Summary

- **Concurrency keeps urgents urgent.** `useTransition` marks state updates as non-urgent; `useDeferredValue` marks a value as allowed to lag. Both let React render the expensive result in the background, interrupt it when something urgent arrives, and discard superseded work.
- **Measured (expensive 30 ms filter, 400 rows):** without deferral a keystroke cost **47.6 ms**; with `useDeferredValue`, the urgent pass no longer carried the filter, and the render log showed the stale-then-fresh sequence — `render input="row 01" deferred=""` followed by `deferred="row 01"`.
- **`useTransition` measured:** the log `"render text=\"row 02\" query=\"\" pending=true"` then `"… query=\"row 02\" pending=false"` — one urgent pass with the keystroke, one background pass with the results, two expensive runs in total, and the input never behind.
- **Skipped work is the headline:** three keystrokes in one tick produced **4 expensive runs eagerly** (`""`, `"r"`, `"ro"`, `"row"`) and **2 deferred** (`""`, `"row"`) — React restarted the background render with the newest value instead of rendering all three intermediate results.
- **`startTransition` works outside components** (measured with an external store), because urgency belongs to the call — useful for websocket/polled updates; `useTransition` is only needed when you want `isPending`.
- **Requires `useMemo` on the expensive derived value**, two states (urgent input, deferred result), work that happens during render, and a screen that tolerates a moment of staleness.
- **It does not make work cheap.** It reorders it. Combine with `memo`, virtualisation and debounce each for their own job: `memo`/`useMemo` for repeated work, virtualisation for DOM cost, debounce for the network, transitions for responsiveness, workers/server for big synchronous computations.
- **Transitions and Suspense are the same machinery**: chapter 07 measured that a transition keeps the old screen visible instead of flashing a fallback — the pattern behind smooth navigation.

---

**Part 10 is complete.** Across nine files you have: the render/commit model and reconciliation (01), the six causes of a re-render and how to sort them (02), `memo`/`useMemo`/`useCallback` measured honestly (03), a performance method with numbers (04), lazy code and images (05), bundles and chunks (06), Suspense and `use()` (07), error boundaries (08), and concurrency (09).

**What's next →** [`../11-modern-react/01-react-19.md`](../11-modern-react/01-react-19.md) begins Part 11 with what changed in React 19 — actions, `useActionState`, `useOptimistic`, `use()`, form actions and the React Compiler — building on the `Suspense`/transition foundations this part established.
