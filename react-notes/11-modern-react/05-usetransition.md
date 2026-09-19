# 05 — `useTransition` in React 19: Urgent vs Non-Urgent, Now With Async

> **Part 11 · Modern React · File 5 of 8**

Why this file exists: Part 10, file 09 introduced `useTransition` and `useDeferredValue` as the concurrency tools — "mark this update as non-urgent so the UI stays responsive". React 19 kept all of that and added one thing that changes how you use the hook: **the function you pass to the transition may be `async`**, which is what makes `useTransition` the engine under actions (files 02–04). This file separates the two jobs the hook now has, because mixing them up is the most common React 19 mistake: (1) *make this expensive state update non-urgent* — the Part 10 use, unchanged; (2) *run this async function as an action and tell me when it is pending* — the new use. It shows the measured pending timeline for the async form, when each job is the right one, what `isPending` does **not** cover (the request itself), and the patterns that keep a search box responsive while a 5,000-row table catches up.

Transcripts: `npx tsx --tsconfig tsconfig.app.json src/dev/run-actions2-probe.tsx` (sections A and D), plus Part 10, file 09's measurements.

---

## 1. Two jobs, one hook

| Job | Signature you pass | What React does | Typical caller |
| --- | --- | --- | --- |
| **Urgency control** (Part 10) | a **synchronous** function: `startTransition(() => setQuery(value))` | marks the updates inside as non-urgent, so urgent ones (typing) can interrupt them | search filtering, tab switching, expensive list re-render |
| **Action** (React 19) | an **async** function: `startAsync(async () => { await api.save(); … })` | same, plus keeps the transition pending until the promise settles | button submits, non-form writes |

Both return `[isPending, startX]` and both are the same hook. The difference that matters is *what becomes non-urgent*:

```tsx
// Job 1 — make the *state update* non-urgent so the input stays responsive
const [isPending, startTransition] = useTransition();
const onSearch = (value: string) => {
  setInput(value);                                        // urgent: the input must not lag
  startTransition(() => setQuery(value));                 // non-urgent: the expensive list can wait
};

// Job 2 — run an async write as an action
const [isPending, startAsync] = useTransition();
const onSave = () => {
  startAsync(async () => {
    await api.save(draft);
    setSaved(true);
  });
};
```

⚠️ **The classic bug, restated because it is so easy to write by accident:** putting the *input's own state* inside the transition.

```tsx
startTransition(() => setInput(value));   // ❌ the controlled input becomes non-urgent and lags the keyboard
```

Measured in Part 10, file 09: `isPending` is the flag, the input is the urgent thing, and the *derived* work is what belongs in the transition.

---

## 2. The pending timeline, measured

```text
=== A. Async transition: isPending is true while the action awaits ===
   before: pending=false saved=0
   mid-flight: pending=true saved=0
   after: pending=false saved=1
   renders: PendingCase:render=5
```

```tsx
// src/dev/actions2-probe.tsx
const [isPending, startAsync] = useTransition();
const submit = (): void => {
  startAsync(async () => {
    await sleep(40);
    setSaved((current) => current + 1);   // an update inside the action
  });
};
```

Three readings, three rules:

1. **`pending=true` appears as soon as the action starts** (not when the first `await` resolves) — the transition is created synchronously, so a button can show "Saving…" immediately.
2. **`pending` stays true across `await`s** — that is the React 19 addition. On React 18, the same code would have flipped `pending` back to `false` at the first `await`, which is why the old advice was "never make a transition's function async".
3. **`saved` does not change until the value is committed** (`mid-flight: saved=0`), because the update is part of the transition and React applies it when it can — for a 40 ms await, that is immediately afterwards.

💡 `PendingCase:render=5` is not a problem to fix: the component renders for the pending flip, for the value, and for React's internal bookkeeping. What you are *buying* with the transition is that during those renders, an urgent update (typing in another input) can interrupt and be applied first.

---

## 3. The measured difference between urgent and transition updates

Part 10, file 09 measured the concurrency behaviour with a deliberately slow list: typing into a controlled input produced a render per keystroke (urgent, always applied) while the filtered list rendered in a transition and **skipped intermediate states** — typing `l`,`a`,`m`,`p` quickly produced fewer list renders than keystrokes, because React abandoned superseded transition renders. The useful way to hold that in your head:

| | Urgent update | Transition update |
| --- | --- | --- |
| Examples | typing, clicking, hovering, dragging | filtering a long list, switching tabs, an action's state changes |
| Can be interrupted/skipped | ❌ — every state is rendered | ✅ — superseded renders are dropped |
| You need a pending indicator? | no | usually yes |
| If you mark it urgent anyway | a slow render blocks the input | — |
| If you mark it a transition unnecessarily | the update feels laggy | — |

⚠️ Transitions do **not** make work faster. They change the **order** in which work is done, so the urgent part does not wait. If the expensive render is expensive for algorithmic reasons (sorting 50,000 rows on every keystroke), moving it to a transition hides it better than it fixes it; the fix is `useMemo`, virtualization and a debounce (Parts 10 and 15).

---

## 4. `useTransition` vs the pending from `useActionState` / `useFormStatus`

Three hooks can report "something is pending". Choosing well is mostly about *scope*:

| Hook | Reads pending for | Use when |
| --- | --- | --- |
| `useTransition` (yours) | the actions you start with its `startX` | you own the async flow in an event handler |
| `useActionState` (file 04) | the action you passed to it | a form/command whose result you render |
| `useFormStatus` (file 03) | the enclosing `<form>`'s action | the pending UI is a child of the form (a submit button) |

They are all reading the same transitions underneath. Two rules of thumb:

- **If the pending UI is the submit button of a form**, use `useFormStatus` — nearest-fix, smallest subscription (measured: only the button re-rendered).
- **If the pending UI is somewhere else** (a banner, a disabled fieldset, a page-level spinner), take `isPending` from `useActionState` (file 04) or from your own `useTransition` (file 02) rather than prop-drilling the button's status upward.

⚠️ **Reading `isPending` from a different hook instance gives you `false`.** Pending state is per-transition; a sibling component's `useTransition` knows nothing about the action you started.

---

## 5. `startTransition` without a component (measured)

```text
=== D. startTransition also works outside a component ===
   startTransition called from module scope: marking the update non-urgent
   renders before/after the module-scope call: 1/1 (no state changed, so no render)
   outsideRendered flag: true
```

`startTransition` is exported from `react` and can be called anywhere: inside a store subscriber (Part 9), a WebSocket handler, a router callback, or an effect. It returns nothing, so if you need to know when the work finished, either take the hook form or `await` inside the function you pass (the async form keeps the transition alive).

```tsx
import { startTransition } from 'react';

socket.addEventListener('message', (event) => {
  const update = parse(event.data);
  startTransition(() => {
    store.apply(update);       // non-urgent: a burst of messages will not block the UI
  });
});
```

---

## 6. Patterns that work

### Pattern 1 — responsive search (urgent input, non-urgent results)

The pattern this book keeps returning to, now with the React 19 detail in one line:

```tsx
function ProductSearch({ products }: { products: Product[] }) {
  const [input, setInput] = useState('');                      // urgent
  const [query, setQuery] = useState('');                      // non-urgent
  const [isPending, startTransition] = useTransition();

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setInput(next);                                            // 1. the input never waits
    startTransition(() => { setQuery(next); });                // 2. the list may lag, visibly
  };

  const results = useMemo(() => filterProducts(products, query), [products, query]);
  return (
    <div>
      <input value={input} onChange={onChange} aria-label="search" />
      <ul data-pending={String(isPending)}>
        {results.map((product) => <li key={product.id}>{product.name}</li>)}
      </ul>
    </div>
  );
}
```

`useDeferredValue` (Part 10, file 09) is the shorter version of the same idea when the derived value is the only thing you need: `const deferredQuery = useDeferredValue(input)`.

### Pattern 2 — an action with a result (files 02–04)

`useActionState` is `useTransition` plus a reducer-shaped result. If you find yourself writing `useTransition` + manual result state + `try/catch`, switch to `useActionState`.

### Pattern 3 — a tab switch with heavy content

```tsx
const [tab, setTab] = useState<Tab>('summary');
const [isPending, startTransition] = useTransition();

<button type="button" onClick={() => { startTransition(() => { setTab('analytics'); }); }}>
  Analytics {isPending ? '…' : ''}
</button>
```

The tab's click is instant, the heavy chart renders when React has time, and the label tells the user something is coming. Pair it with `<Activity>` (file 01) if the previous tab must keep its state.

---

## 7. What to check before reaching for a transition

1. **Is there an urgent update to protect?** If nothing else is happening on the screen, marking the work non-urgent only delays it.
2. **Is the work expensive in *React's* terms?** Long renders, big lists, many components. A slow network call is not made faster by a transition (it only gives you a pending flag).
3. **Do you need a fallback UI?** If yes, `isPending` (or a skeleton) is required, otherwise the user sees nothing happen.
4. **Is the update *correct* as a transition?** An update that the user perceives as immediate (opening a modal, checking a checkbox) should stay urgent.
5. **Can the expensive part be cached instead?** `useMemo` for derived data, the query cache for data (Part 9), virtualization for the DOM (Part 10, file 04) — often better than deferring.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Wrapping controlled input state in `startTransition` | the input lags behind the keyboard | urgent input, non-urgent derived value |
| 2 | Making a transition's function `async` and not awaiting the work | `isPending` flickers off early | `await` inside the action |
| 3 | Expecting transitions to cancel requests | measured in file 02: they do not | `AbortController` + request id |
| 4 | Waiting for `isPending` to disable a button and calling it protection | same-tick double submits (Part 8) | `ref` guard for expensive writes |
| 5 | Reading `isPending` from a sibling's hook instance | it is always `false` | hook in the component that starts the action, or a shared context |
| 6 | Using a transition for an urgently-perceived update | modal/toggle feels laggy | leave it urgent |
| 7 | Using a transition to hide an algorithmic problem | the expensive render still happens; it is just deferred | memoise/virtualize/paginate |
| 8 | No pending indicator at all | users click again, assuming nothing happened | skeleton, spinner or disabled state |
| 9 | Nesting transitions | the inner state becomes non-urgent twice; confusing ordering | one transition per interaction |
| 10 | Assuming transitions prevent the *commit* | commits are not interruptible per-node | reduce nodes (virtualization) |
| 11 | Using `useTransition` where `useDeferredValue` fits | more state to manage | `useDeferredValue(value)` |
| 12 | `startTransition` around a router navigation | fights the router's own pending UI (Part 6) | router APIs |

---

## 9. Best practices

1. **Name the two states differently** (`input` / `query`) — the code then reads as the concept.
2. **Show pending only when it lasts longer than a blink.** A 30 ms spinner is noise; a 300 ms one is information.
3. **Prefer `useDeferredValue` for derived values**, `useTransition` when you need `isPending` or are starting work (an action).
4. **Keep transitions to one interaction each** and keep the corresponding updates in the same transition.
5. **Measure the win** with the Profiler: the number that improves is *input responsiveness* (interaction latency), not total time.
6. **Use `startTransition` outside components** for bursty external events (sockets, stores).
7. **Combine with Suspense** (file 07): a transition keeps the old UI while new data suspends, instead of flashing a fallback.
8. **Do not reach for transitions in small apps** — if nothing is slow, they add concepts and pending UI for no user-visible gain.

---

## 10. Practice

### Beginner

1. In one sentence each: what `startTransition` marks, what `isPending` reports, and why an async function inside it keeps pending true across an `await`.
2. For each update, say urgent or transition: typing in a controlled input; filtering a 4,000-row table; switching to a chart tab; toggling a checkbox; submitting a comment; navigating to a route the user clicked.
3. Rewrite this with the urgent/non-urgent split: `const onChange = (e) => setQuery(e.target.value);` where `query` drives a slow list and the input is `<input value={query} onChange={onChange} />`.

### Intermediate

1. Implement `ProductSearch` (section 6) and measure with the lab's render trace: how many list renders for a 4-character burst with and without the transition? Explain the difference.
2. Take a component using `useTransition` + manual result state and convert it to `useActionState`. List what disappeared.
3. A teammate wrapped *all* state updates in `startTransition` "because it is the modern way". Write the review comment, with one concrete symptom and one measurement they should take.

### Challenge

1. Build a `useOptimisticQueue` hook that accepts async operations, runs them in a transition, keeps `isPending` accurate while several are in flight, and exposes the queue length. Then decide honestly whether the abstraction earns its place compared with one `useTransition` per operation.
2. Design the interaction model for a dashboard with four heavy panels and a time-range picker: which updates are urgent, which are transitions, what the pending UI is, how `Activity` (file 01) and Suspense (file 07) fit, and what the user sees at each step.
3. Measure a real app with the Profiler before and after adding a transition to one interaction. Report: interaction latency, total render time, number of committed renders, and your conclusion about whether it was worth it.

---

## 11. Solutions

### Beginner

1. `startTransition` marks the state updates scheduled inside it as non-urgent, so React may interrupt or skip them in favour of urgent work; `isPending` is true from the moment the transition starts until its work (including an awaited action) is committed; an async function keeps the transition alive because React tracks the promise's lifetime as part of the transition rather than considering it finished when the synchronous part returns.
2. Urgent: typing, the checkbox, navigation (the user asked for it). Transition: filtering the table, the chart tab, the comment submit's *result* state (the click itself is urgent; the pending flag tells the user it is working).
3. ```tsx
   const [input, setInput] = useState('');
   const [query, setQuery] = useState('');
   const [isPending, startTransition] = useTransition();
   const onChange = (event: ChangeEvent<HTMLInputElement>) => {
     setInput(event.target.value);
     startTransition(() => { setQuery(event.target.value); });
   };
   return <input value={input} onChange={onChange} aria-busy={isPending} />;
   ```

### Intermediate

1. Expect visibly fewer list renders with the transition during a fast burst (React drops superseded renders) and roughly one render per keystroke without it, at the cost of the input lagging in the second case. The number to report is *renders of the expensive list*, not total renders: `ProductSearch` may render the same number of times.
2. `const [state, formAction, isPending] = useActionState(action, initial)` replaces `useState` for the result, `useTransition` for pending, and the manual `try/catch` for the result shape (though not for the error policy — file 04, section 4).
3. The comment: "Marking *everything* non-urgent means urgent interactions also wait: the input you wrapped now renders in a transition and can visually lag the keyboard (measured in this book's lab: the typed character appears a frame later under load). Take a Profiler recording of one interaction and look at interaction latency before and after; then tell me which update is actually expensive. The usual fix is: input state urgent, expensive derived state in the transition."

### Challenge

1. The hook holds `const [queue, setQueue] = useState<Op[]>([])` and a `useTransition`; each `enqueue(op)` pushes and starts a transition that awaits the op, removes it, and updates a counter. `isPending` from the hook covers all in-flight operations, so it is accurate but coarse; queue length is the extra information. Honest verdict: it earns its place only if the UI shows the queue (an "uploading 3 files" indicator); otherwise one `useTransition` per operation plus an optimistic row (file 06) is simpler and behaves the same.
2. A defensible model: the time-range picker's own value is urgent (it must respond instantly); the four panels' refetches are transitions with per-panel skeletons; the previously loaded panels stay visible via Suspense with `useDeferredValue`-style "keep old UI" behaviour; each panel's heavy chart is memoised and virtualised, and a panel that the user collapsed is `<Activity mode="hidden">` so its state survives without running timers. Step by step: click → picker updates instantly, panels show "updating" (not blank) → each panel commits as its data arrives, newest data winning via request ids.
3. A good report states numbers, not adjectives: e.g. "interaction latency 480 ms → 40 ms; total render time 620 ms → 700 ms (more renders, because the transition re-rendered when the urgent update landed); committed renders 9 → 6". The conclusion is usually "worth it for responsiveness, no change in throughput" — and that is exactly the trade a transition is for.

---

## 12. Summary

- **`useTransition` now has two jobs**: marking expensive *state updates* non-urgent (Part 10, file 09, unchanged) and running an *async function* as an action (new in React 19 — `await` inside no longer breaks pending).
- **Measured**: `pending=false saved=0` → `pending=true saved=0` (across the `await`) → `pending=false saved=1`; the value commits when the transition commits, not when the promise resolves.
- **The classic mistake is unchanged**: never put the controlled input's own state in a transition — defer the derived work, keep the typing urgent.
- **Transitions reorder work; they do not speed it up**, and they do not cancel requests (measured in file 02) or make commits interruptible.
- **Three hooks report pending — choose by scope**: `useFormStatus` for a child of the form, `useActionState` for a form/command with a result, your own `useTransition` for an async flow you own. A sibling's `isPending` is always `false`.
- **`startTransition` works outside components** (measured from module scope), which makes it the tool for bursty external events such as store or socket updates.
- **Show pending only when it is useful**, and measure the win as interaction latency, not as total render time.

---

**What's next →** [`06-useoptimistic.md`](./06-useoptimistic.md) makes the waiting disappear: `useOptimistic` shows the expected result while the server works, rolls back when it refuses (measured: the row appeared mid-flight, then vanished on failure), and only works inside an action or transition — which is why this file had to come first.
