# 09 — Loading States: Races, Skeletons, Debouncing, and Pending UI

> **Part 7 · API Integration · File 9 of 11**
> Why this file exists: a request has a duration, and that duration is where users decide whether your app feels fast, broken, or untrustworthy. This file is about everything the user sees *between* the click and the data: the four-state screen, skeletons versus spinners, keeping old data visible while refreshing, disabling exactly the right controls, and the bug that punishes everyone who forgets cancellation — measured here, twice: a naive hook ended up showing `results: p-keyboard, p-keycap-set` (the *old* query's data) while the guarded one showed `results: p-mouse`.

---

## 1. Loading is a design problem, not a spinner

The API can be instant or slow, and the lab can prove both with one parameter — file 01 measured:

```text
no delay:   0.004197s
?delay=800: 0.805669s
```

An 0.8-second wait is nothing on a fast connection and an eternity on a train. Your component cannot control the network, but it fully controls **what the user sees during it**, and four decisions matter:

| Decision | Options | Default that works |
| --- | --- | --- |
| What to show first | spinner / skeleton / nothing / old data | skeleton matching the final layout |
| What to keep showing | blank / stale data with an indicator | stale data + subtle indicator |
| What can the user still do | everything / nothing / the relevant controls only | everything except the control that is in flight |
| What screen readers hear | silence / a live announcement | one polite announcement, not one per keystroke |

Everything below is those four decisions, made concrete.

---

## 2. The four states, on a real screen

File 04 introduced the union; here it is as the hook that the rest of this file uses:

```ts
type State =
  | { status: 'loading' }                                    // nothing to show yet
  | { status: 'ready'; products: Product[] }                 // success (possibly empty)
  | { status: 'empty' }                                      // success with zero rows — a distinct UX case
  | { status: 'error'; message: string };                     // failure, with a way forward
```

```tsx
{state.status === 'loading' && <ProductsSkeleton />}
{state.status === 'empty' && <EmptyState term={query} onClear={clearFilters} />}
{state.status === 'error' && <p role="alert">…<button onClick={retry}>Try again</button></p>}
{state.status === 'ready' && <ProductGrid products={state.products} />}
```

Why `empty` deserves its own state rather than being `ready.length === 0`: the *message* differs ("No products match “key”" versus a generic empty catalogue), and it usually needs an action ("Clear filters"). File 04's transcript shows what a real empty state looks like:

```text
=== choosing the "audio" category ===
   url   : /products?q=key&category=audio
   rows  : (none)
   status: No products match “key”.
```

---

## 3. The hook, line by line

```tsx
// File: src/part7/useProducts.ts (the guarded version — the one to copy)
import { useEffect, useState } from 'react';
import type { Product } from '../api/types';

type State =
  | { status: 'loading' }
  | { status: 'ready'; products: Product[] }
  | { status: 'error'; message: string };

export function useProducts(query: string) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    void (async () => {
      try {
        const url = query === 'key' ? '/api/products?q=key&delay=800' : `/api/products?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) throw new Error(`Request failed with ${response.status}`);

        const products = (await response.json()) as Product[];
        setState({ status: 'ready', products });
      } catch (error) {
        if (controller.signal.aborted) return;                 // the caller walked away — say nothing
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }
    })();

    return () => controller.abort();
  }, [query]);

  return state;
}
```

| Line | What it prevents |
| --- | --- |
| `new AbortController()` inside the effect | one controller per *request*, not one per component |
| `setState({ status: 'loading' })` before the fetch | showing the previous query's results as if they were current |
| `signal: controller.signal` | a stale response overwriting a newer one (section 4) |
| `if (!response.ok) throw` | `fetch`'s "it resolved, so it worked" trap (file 02) |
| `if (controller.signal.aborted) return;` | an error message for a request the user cancelled |
| `return () => controller.abort()` | cancellation on unmount **and** before every re-run (the effect cleanup runs on both) |
| `[query]` as the only dependency | the request is a pure function of the query; nothing else can trigger it |

⚠️ `setState` after an abort is not just noisy — in React 18/19 it is *possible* and silently wrong: React no longer warns about state updates on unmounted components, so a leaked update can update a component that has been replaced. The `aborted` check is the guard, and `AbortController` is what makes it reliable.

---

## 4. The race condition, measured both ways

The scenario is the everyday one: a user types `key`, then quickly types `mouse`. The `key` request is slow (`?delay=800`); the `mouse` request is fast. Both are in flight, and **the slow one finishes last**.

```text
=== B. the race: a slow request started first, finishing last ===
   [hook] start fetch for "key"
   naive hook (no cleanup):
   [hook] start fetch for "mouse"
   [hook] resolving "mouse" (200)
   [hook] resolving "key" (200)
   FINAL DOM: results: p-keyboard, p-keycap-set
   ↑ the box says "key", because the discarded slow request wrote last

   [hook] start fetch for "key"
   guarded hook (AbortController + cleanup):
   [hook] cleanup for "key" → abort
   [hook] start fetch for "mouse"
   [hook] "key" was aborted — its result will never touch state
   [hook] resolving "mouse" (200)
   FINAL DOM: results: p-mouse
   ↑ the box says "mouse": the old request was cancelled before it could write
```

Two things are worth noticing beyond "the bug is fixed":

1. **The naive hook's failure is silent.** No error, no warning, no spinner left behind — the screen simply shows the wrong data, at the moment the user is most confident about what they asked for. This is why it survives code review.
2. **The guarded version aborts *before* the new request starts** (`cleanup for "key" → abort` precedes `start fetch for "mouse"`). React runs the previous effect's cleanup before the next effect, so the ordering is guaranteed by the framework rather than by luck.

The same bug appears in three disguises you should recognise:

| Shape | How it happens |
| --- | --- |
| **Search-as-you-type** | the example above; every keystroke starts a request |
| **Route change** | navigating from product A to product B while A's request is slow (Part 6: a param change re-renders rather than remounts) |
| **Refresh/retry button** | clicking "Try again" twice; the first response can land after the second |

There are two correct fixes, and they compose:

```ts
// Fix 1 — cancellation (the one above): the request is stopped.
const controller = new AbortController();
fetch(url, { signal: controller.signal });
// cleanup: controller.abort();

// Fix 2 — a sequence guard: late responses are ignored even if they arrive.
const requestId = useRef(0);
const id = ++requestId.current;
const response = await fetch(url);
if (id !== requestId.current) return;      // a newer request has already won
```

Cancellation saves bandwidth and parsing; the guard protects against responses that cannot be cancelled (a `POST` already committed, a library that ignores signals). **Use cancellation when you can, and a guard when you cannot.** (File 02, section 9 introduced both; this is where they pay off.)

---

## 5. Debouncing: fewer requests, not just cancelled ones

Cancellation stops stale data from rendering; it does not stop the request from being *sent*. Typing `keyboard` fires eight requests, all but one of which are wasted.

```tsx
// File: src/hooks/useDebouncedValue.ts (from Part 4, file 09 — reused here)
export function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

```text
=== useDebouncedValue (Part 4 lab) ===
   immediately after typing "abc": debounced="" (never updated to "a" or "ab")
   350 ms later:                    debounced="abc"
```

Used with the hook above:

```tsx
const [input, setInput] = useState('');          // what the user types (instant, controlled)
const debounced = useDebouncedValue(input, 300); // what the network sees (settled)
const state = useProducts(debounced);            // one request per pause, not per keystroke

<input value={input} onChange={(event) => setInput(event.target.value)} />
```

| Without debounce | With debounce |
| --- | --- |
| 8 requests for `keyboard` | 1 request, 300 ms after the last keystroke |
| 8 cancellation aborts | 0 wasted requests |
| server load scales with typing speed | server load scales with pauses |

Numbers to keep in mind: **150–300 ms** for search-as-you-type, **500–800 ms** for autosave (file 07's pattern), and **never** for a button the user pressed deliberately. Also note that a debounce is not a replacement for cancellation — a 300 ms debounce still allows two overlapping requests if the user pauses twice.

💡 React 19's `useDeferredValue` is the *rendering* cousin of debouncing: it keeps the input responsive while a heavy result list renders from the previous value (Part 10 covers it). Debouncing throttles the network; `useDeferredValue` throttles the paint. Different problems, often used together.

---

## 6. Skeletons versus spinners versus nothing

| Feedback | Perceived speed | Best for | Watch out for |
| --- | --- | --- | --- |
| **Nothing** (just the old screen) | fast, until the user notices nothing happened | sub-100 ms, local operations | looks broken when the network is slow |
| **Spinner** | neutral | short waits, unknown layout, a single refresh | a spinner on every panel is visual noise |
| **Skeleton** | fast — the page looks nearly loaded | lists, tables, cards where the shape is known | must match the real layout, or it causes a jolt |
| **Progress bar** | predictable | uploads, multi-step imports | needs real progress numbers |
| **Old data + subtle indicator** | fastest | refetch/refresh of data already on screen | must be honest that it is old |

```tsx
// File: src/part7/ProductsSkeleton.tsx
export function ProductsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="skeleton-row">
          <span className="skeleton-bar skeleton-title" />
          <span className="skeleton-bar skeleton-price" />
        </li>
      ))}
    </ul>
  );
}
```

```css
/* The three lines of CSS that make a skeleton read as "loading" rather than "broken" */
.skeleton-row { display: flex; gap: var(--space-2); padding: var(--space-2); }
.skeleton-bar { background: var(--surface-2); border-radius: 4px; height: 1em; animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.55 } }
@media (prefers-reduced-motion: reduce) { .skeleton-bar { animation: none } }
```

Four rules for skeletons that help rather than annoy:

1. **Match the real layout** — same height, same row count (or a sensible default), same column positions. A skeleton that shifts when data lands is worse than a spinner.
2. **Do not over-animate.** A gentle opacity pulse; nothing that moves, slides, or shimmers aggressively (and honour `prefers-reduced-motion`, as above).
3. **Show a plausible count** (3–6 rows), not 40, so the page does not jump when the real data (a pageful) arrives.
4. **Announce it once for assistive tech**, and keep the visual furniture out of the accessibility tree (`aria-hidden="true"` on the placeholder shapes, a single `role="status"` sentence elsewhere).

```tsx
// The announcement that goes with any of the three feedback styles
<p className="sr-only" role="status">{state.status === 'loading' ? 'Loading products…' : ''}</p>
```

⚠️ **Do not show a spinner for very fast requests.** File 01 measured a plain request at `0.004197s`; a spinner that appears for 4 ms is a flash of noise. The cheapest fix is a delayed indicator:

```tsx
// Only show the busy UI if the request is still running after 150 ms.
function useDelayedFlag(active: boolean, delayMs = 150) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return visible;
}
```

---

## 7. Keeping old data visible while refreshing

For a **refetch of data already on screen** (a filter change, a manual refresh, a background update), replacing the list with a skeleton throws away information the user was using. The stale-while-revalidate pattern keeps it:

```ts
type State =
  | { status: 'loading' }                                        // first load: nothing to show
  | { status: 'refreshing'; products: Product[] }                // data on screen, request in flight
  | { status: 'ready'; products: Product[] }
  | { status: 'error'; message: string; products?: Product[] };  // keep the last good data if we have it
```

```ts
setState((current) =>
  current.status === 'ready' ? { status: 'refreshing', products: current.products } : { status: 'loading' },
);
```

```tsx
{state.status === 'refreshing' && <p className="inline-status" role="status">Refreshing…</p>}
{(state.status === 'ready' || state.status === 'refreshing') && <ProductGrid products={state.products} dimmed={state.status === 'refreshing'} />}
```

Two details that make it feel professional:

- **Dim or mark the stale area** (a subtle opacity, a small "Refreshing…" line) so the user knows the data is being updated, rather than assuming it is live.
- **Keep the error case non-destructive**: if the refresh fails, keep showing the last good data *and* the error, rather than blanking the screen (the `products?` field above).

For **a genuinely new query** (typing a different search term), the old results are *not* stale data — they are the wrong data. That case wants `loading` plus a skeleton, and it is exactly why the hook in section 3 sets `status: 'loading'` at the start of every effect run. Deciding which of the two you are in is the whole of this section:

| Change | Old data is… | Show |
| --- | --- | --- |
| Same query, refetch (Refresh button, polling) | still valid, just old | old data + "Refreshing…" |
| New query (search term, filter) | wrong | skeleton (or keep it dimmed, if the layout would jump) |
| Navigate to a different record | wrong | skeleton for the new record |

---

## 8. Pending states on controls

Every write in files 05–08 had one, and the transcripts measured them:

```text
=== C. a valid create (POST → 201) ===
   while the request is in flight: button="Saving…" disabled=true

=== A. PATCH a single field: the row waits for the server (pessimistic) ===
   immediately after the click: "Optimistic Lamp₹111In stockSaving…"
   button label while pending: "Saving…"
```

Rules for pending UI:

1. **Disable the control that is in flight, and only that one.** Disabling the whole form teaches users to wait; disabling one button keeps the rest usable.
2. **Change its label**, don't just fade it: `Save` → `Saving…`, `Delete` → `Deleting…`, `Try again` → `Retrying…`. A disabled button with the same label looks broken.
3. **`aria-busy` on the region** while it settles, so assistive tech knows an update is coming.
4. **Never disable without an end.** If the request can hang, a timeout (file 10) is what un-disables the button. A permanently disabled `Save` is the most common self-inflicted bug in this area.
5. **For lists: "Load more" appends**, keeping the existing rows and scroll position — do not re-render the whole list from a skeleton.

```tsx
// "Load more" without losing what is on screen
const [extra, setExtra] = useState<Product[]>([]);
const [loadingMore, setLoadingMore] = useState(false);

async function loadMore() {
  setLoadingMore(true);
  try {
    const next = await listProducts({ page: page + 1, pageSize: PAGE_SIZE });
    setExtra((current) => [...current, ...next.items]);
  } finally {
    setLoadingMore(false);          // released on every path, like file 05's guard
  }
}
```

💡 **Optimistic feedback is the other half of pending UI**: for actions you are confident about (file 07's toggles, file 08's deletes) the user sees the result immediately and the pending state only exists in the background. The choice between "show a spinner" and "show the outcome" is a UX judgement about confidence, not a technical one.

---

## 9. Accessibility of loading and updating regions

Screen-reader users cannot see a skeleton pulse, so the *state* has to be announced in words:

| Mechanism | Use it for | Behaviour |
| --- | --- | --- |
| `role="status"` (implicitly `aria-live="polite"`) | "Loading products…", "Refreshing…", "Saved" | announced when the user is idle |
| `role="alert"` (implicitly `aria-live="assertive"`) | errors, failures | interrupts immediately — do not overuse |
| `aria-busy="true"` on a region | a container being replaced | tells AT to wait for the update |
| `aria-hidden="true"` on visual placeholders | skeleton bars | keeps decorative noise out of the tree |
| `.sr-only` (visually hidden) text | label a spinner that has no text | gives the announcement something to read |

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

⚠️ **Do not put a live region on the search results container.** With `aria-live="polite"` on a list that updates per keystroke, assistive tech reads the whole list after every character. Announce the *settled* state instead (after debounce), or announce a count: *"12 results for keyboard."*

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | no cancellation in a search effect | stale results win the race (verified: `results: p-keyboard, p-keycap-set`) | `AbortController` + cleanup, or a sequence guard |
| 2 | `setState` in an aborted request | phantom errors for cancelled requests | `if (controller.signal.aborted) return;` |
| 3 | a `loading` boolean plus your data in separate states | "loading" and rows at the same time, or neither | one discriminated union |
| 4 | spinner with no delay | a 4 ms flash on fast responses | show the busy UI after ~150 ms |
| 5 | skeleton with a different layout than the content | a visible jolt when data arrives | match height, count and columns |
| 6 | skeleton forever | a failed request that never resolves the state | every path must set a terminal state (`ready`/`error`) |
| 7 | disabling the whole form while one field saves | users wait for unrelated work | disable only the control in flight |
| 8 | a disabled control with no timeout | permanently stuck UI | request timeouts (file 10) + `finally` |
| 9 | replacing a list with a skeleton on every refetch | losing scroll position and context | keep old data, mark it as refreshing |
| 10 | one request per keystroke | server load, flicker, wasted bandwidth | debounce 150–300 ms |
| 11 | `aria-live` on a per-keystroke list | constant screen-reader chatter | announce counts, after the debounce |
| 12 | ignoring `prefers-reduced-motion` | pulsing skeletons are hostile to some users | gate animations in CSS |

---

## 11. Best practices

1. **Model the screen as states, not flags** — `loading | ready | empty | error` (+ `refreshing`).
2. **Cancel every request you start** and ignore aborted outcomes silently.
3. **Debounce text input** (150–300 ms) and **never debounce** a deliberate button press.
4. **Delay the busy indicator** (~150 ms) so fast responses feel instant.
5. **Match the skeleton to the layout**, keep the count plausible, and honour reduced motion.
6. **Keep stale data visible when refetching the same query**; replace it with a skeleton only when the old data is wrong.
7. **Pending states belong on the control that started the work**, with a changed label and an end condition.
8. **Append for "load more"**, replacing nothing, and keep the scroll position.
9. **Announce state changes once**, politely, with `role="status"`; reserve `role="alert"` for errors.
10. **Test on a slow connection** (`?delay=800` exists for this) and with the API stopped — the two cases your happy-path development never sees.

---

## 12. Practice

### Beginner — make the states visible

1. Run the app with `?delay=800` on its list request. Capture a screenshot of the first paint, then of the loaded state. Name which of the four states each screenshot is.
2. Stop the API and reload the page. Which state renders, and how long does it take to appear? Then explain why a request to a dead port fails faster than a slow request succeeds.
3. Type three characters quickly in the search box with the Network tab open. Count the requests, then add a 300 ms debounce and count again.
4. Open the app with the network throttled to "Slow 3G" and check the button label while a save is in flight. Does it change? Is it disabled? Is there any way the user can submit twice?

### Intermediate — build and measure the guarantees

1. Write a probe (start from `src/dev/loading-probe.tsx`) that renders a search screen and asserts:
   - the first paint shows `loading…`, not results;
   - a slow query followed by a fast one ends with the **fast** query's results (the race);
   - the aborted request's failure never sets an error state;
   - a `500` produces the error state with a retry button;
   - clicking retry while a request is in flight does not create two overlapping states.
2. Add a `refreshing` state to your list: on a manual refresh the rows stay, dimmed, with a "Refreshing…" line. Assert that the rows are still in the DOM during the refresh.
3. Add `useDelayedFlag` and prove that a 4 ms response never renders the skeleton but an 800 ms one does.
4. Count requests with and without debouncing for the string `keyboard`, and write the two numbers into a comment above the hook.

### Challenge — perceived performance, measured

1. Build the products page three ways behind a query flag: (a) spinner, (b) skeleton, (c) keep-previous-results with an inline indicator. Measure each with the Performance panel or a simple timestamp probe: time to first paint, time to first meaningful content, and the number of layout shifts.
2. Add a "Load more" button to the gallery from file 04 that appends a page without losing the scroll position, and verify the appended rows are in DOM order (not sorted client-side after append).
3. Make the search announce `"<n> results for <term>"` in a `role="status"` region after the debounce, and verify with a screen reader (or by asserting the live region's text in a probe) that it does not announce per keystroke.
4. Write a short `PERF-NOTES.md` recording: the three implementations' measurements, which one you would ship and why, and the conditions under which you would switch (slow devices, large lists, expensive row components).

---

## 13. Solutions

### Beginner

1. The first paint is `loading` — the gallery transcript shows exactly this: `dom: ProductsSearchCategoryAllAudioKeyboardsSelects…Loading produc`. The loaded state is `ready` with three rows and `Page 1 of 2 · 6 total`.
2. With the API stopped you get the `error` state (`Could not load products: …` plus a **Try again** button) on the next tick: a connection refusal is immediate (`ECONNREFUSED` in Node), whereas a slow request takes its full delay. Different latency, same state machine.
3. Without debouncing, three keystrokes → three requests, and each new one aborts the previous. With a 300 ms debounce, one request fires after the last keystroke. (Part 4's `useDebouncedValue` measurement: typing `a`, `ab`, `abc` leaves `debounced=""` until 350 ms has passed, then `"abc"` once.)
4. On a slow connection the button reads `Saving…` and is `disabled=true` (verified in file 05's transcript), and the `submittingRef` guard blocks same-tick repeats even before the disable lands — so no, the user cannot submit twice.

### Intermediate

```ts
// The assertions, in the style of the transcripts
PASS  first paint shows loading, not the previous results
PASS  the fast query "mouse" wins over the slow query "key"   → results: p-mouse
PASS  the aborted request never set an error state            → no error node in the DOM
PASS  500 → error state with a retry button
PASS  retry while in flight does not create overlapping states (1 error, 1 loading)
PASS  refreshing keeps 3 rows in the DOM while the request is in flight
PASS  a 4 ms response never renders the skeleton; an 800 ms one does
PASS  requests for "keyboard": 8 without debounce, 1 with debounce
```

The interesting assertion is the fourth-from-last: "retry while in flight" is where a naive implementation ends up with two concurrent requests whose responses can arrive out of order — the same race, caused by a button instead of a keystroke.

### Challenge

Typical numbers from a local run (your machine will differ, but the *shape* will not):

| Implementation | First paint | Time to content | Layout shifts |
| --- | --- | --- | --- |
| Spinner | ~50 ms (spinner) | ~810 ms (`?delay=800`) | 1 (content replaces spinner) |
| Skeleton | ~50 ms (skeleton rows) | ~810 ms | ~0 (same geometry) |
| Keep previous + indicator | ~50 ms (old rows) | ~810 ms (rows swap) | 0, but the user briefly sees data for the *previous* query |

The choice depends on the query: for a manual refresh, "keep previous" wins on every metric; for a *new* search term, showing the previous query's rows is misleading (the user typed something else), so a skeleton is the honest option. That is the whole trade-off, and it is why the state union in section 7 has both `loading` and `refreshing`.

For "Load more", the appended page must be concatenated in server order: `[...current, ...next.items]` — sorting client-side after append mixes pages and produces rows out of order, which is the classic sign of client-side re-sorting over server pagination.

---

## 14. Summary

- Loading is **four decisions** (what shows first, what stays, what stays usable, what is announced), not a spinner.
- Model screens as **`loading | ready | empty | error`** (plus `refreshing`), so impossible combinations cannot be rendered.
- **Cancel every request** (`AbortController` + cleanup) and ignore aborts; add a **sequence guard** when cancellation is impossible. Measured: the naive hook ended on the *old* query's data (`results: p-keyboard, p-keycap-set`), the guarded one on the new (`results: p-mouse`).
- **Debounce text input** (150–300 ms): 8 keystrokes, 1 request instead of 8.
- **Skeletons should match the layout**, show a plausible count, animate gently, and honour `prefers-reduced-motion`. **Delay the busy UI ~150 ms** so 4 ms responses never flash.
- **Keep old data while refreshing the same query**; use a skeleton when the old data is wrong (a different query or record).
- **Pending states belong to the control that started the work** (`Save` → `Saving…`, disabled, with a guaranteed end) — verified in files 05 and 07's transcripts.
- **Announce with `role="status"`**, reserve `role="alert"` for errors, and never put a live region on a per-keystroke list.

---

**What's next →** [`10-error-handling.md`](./10-error-handling.md): everything that happens when the request goes wrong. The taxonomy of failures (a `404` you expected, a `500` you did not, a timeout, an abort, an offline laptop), one error type that carries the status *and* the body, retries that are actually safe (verified: exponential backoff with jitter, `503` twice then `200`, without retrying `404`/`401`/aborts), timeouts that un-stick the UI, error boundaries for render-time crashes, and a user-facing message policy.
