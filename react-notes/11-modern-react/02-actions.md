# 02 — Actions: Async Work That React Tracks

> **Part 11 · Modern React · File 2 of 8**

Why this file exists: every async interaction in Parts 7 and 8 needed the same five pieces of hand-written machinery — an `isSubmitting` boolean, a `try`, a `catch`, an error state, a `finally`, plus a guard against double clicks. That machinery is not wrong, but it is *boilerplate you write once per button*, and it can be wrong in ways nobody tests (the flag left `true` after an early `return`, the error state never cleared, the second click racing the first). React 19 introduced a single concept that replaces most of it: the **Action** — an async function handed to React, which then tracks pending state, orders the updates it triggers, and routes its errors. This file explains what an Action is, what `useTransition` does with an async function, what `isPending` does and does not promise, how overlapping actions actually behave (measured, and not what most people assume), and where errors go.

Transcripts from `npx tsx --tsconfig tsconfig.app.json src/dev/run-actions2-probe.tsx` and `.../run-actions-probe.tsx`.

---

## 1. The problem: five pieces of machinery per button

Here is the honest "before" version of a save button, the way Parts 7 and 8 built it:

```tsx
function SaveButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const save = async () => {
    if (isSubmitting) return;          // 1. guard against double clicks
    setIsSubmitting(true);
    setError(null);                    // 2. clear the old error
    try {
      await api.createProduct(draft);
      setSuccess(true);                // 3. success state
    } catch (caught) {
      setError(messageOf(caught));     // 4. error state
    } finally {
      setIsSubmitting(false);          // 5. always turn the flag off
    }
  };
  // …plus rendering four combinations of those three booleans
}
```

Five things to get right, in every component that talks to a server. The failure modes are familiar: forget the guard and a double click creates two products; forget `finally` on an early `throw` path and the button stays disabled forever; forget to clear `error` and a stale message sits under the button after a successful retry.

An **Action** is any function that React calls for you in a *transition* — the mechanism from Part 10, file 09 for marking updates as non-urgent — with one addition in React 19: **the function may be `async`**, and React will track it.

```tsx
const [isPending, startTransition] = useTransition();

const save = () => {
  startTransition(async () => {         // ← an Action
    await api.createProduct(draft);
    setSaved(true);
    // isPending was true for the whole await, and is false again now
  });
};
```

Four of the five pieces of machinery are gone. What *replaces* them, exactly, is the subject of the rest of this file — because "React tracks it" needs to be unpacked into what is guaranteed and what is not.

---

## 2. The definition, unpacked

> An **Action** is a function passed to `startTransition` (or to a `<form action>` — file 03 — or returned by `useActionState` — file 04) that React runs inside a transition. If it returns a promise, React keeps the transition pending until the promise settles.

That definition has three consequences that are easy to miss:

1. **Updates inside the action are non-urgent.** The click that started it is urgent and handled immediately; the state updates the action eventually performs are applied in the transition, which React can interrupt (Part 10, file 09).
2. **`isPending` covers the await.** Measured below: `pending=true` while the promise is in flight, `false` when it settles — including when it *throws*.
3. **The action is not a request manager.** It does not cancel previous requests, deduplicate them, or reorder their results. Section 5 measures what actually happens when two overlap, and it is the most important correction in this file.

💡 The word "Action" is deliberately borrowed from `<form action={…}>`. The mental model is: *this function is what the form/button **does***, and React handles the mechanics of doing it.

---

## 3. Async transitions, measured

```text
=== A. Async transition: isPending is true while the action awaits ===
   before: pending=false saved=0
   mid-flight: pending=true saved=0
   after: pending=false saved=1
   renders: PendingCase:render=5
```

```tsx
// src/dev/actions2-probe.tsx
function PendingCase() {
  trace('PendingCase:render');
  const [isPending, startAsync] = useTransition();
  const [saved, setSaved] = useState(0);

  const submit = (): void => {
    startAsync(async () => {
      await sleep(40);
      log.push('server answered');
      setSaved((current) => current + 1);   // ← safe: this update belongs to the action
    });
  };

  return (
    <div>
      <button type="button" data-testid="save" onClick={submit}>save</button>
      <p data-testid="state">pending={String(isPending)} saved={saved}</p>
    </div>
  );
}
```

**Line by line.**

- `const [isPending, startAsync] = useTransition();` — `useTransition` returns a flag and a function, exactly as in Part 10, file 09. The new part is only that `startAsync` now accepts an async function.
- `startAsync(async () => { … })` — React calls the function *immediately* (nothing is deferred), but state updates performed inside it are marked as transition updates. That is why `setSaved` after an `await` does not warn: React knows which transition it belongs to.
- `await sleep(40)` — the pending window. In a real app this is your `fetch`/axios call from Part 7.
- `setSaved((current) => current + 1)` — an update inside the action. It is non-urgent, so if the user types while the server is answering, React can keep the typing responsive and apply this later.
- `PendingCase:render=5` — mount, then a render for the pending state going true, then for the value, and so on. The exact count is not the point; the point is that **the component re-renders when `isPending` flips**, so a button can read it.

**Reading the timeline in the transcript:** `before: pending=false saved=0` → `mid-flight: pending=true saved=0` (the flag is up while the promise is outstanding and no result has been applied) → `after: pending=false saved=1` (settled, value committed).

---

## 4. What `isPending` promises, and what it does not

| `isPending` is `true`… | …and **not** |
| --- | --- |
| while the action's promise is unsettled | a progress percentage — it says "not finished", not "80% done" |
| across `await`s inside the action | a network indicator: `fetch` is not the only thing that resolves slowly |
| while React is still committing the updates the action triggered | about *your* request lifecycle: retries, polling and background refetches are invisible to it |
| for any reason to disable a submit button | a lock: clicking again during `isPending` is prevented only because you disable the button |

⚠️ **The double-click question.** `isPending` becomes `true` *after* React processes the state update that the click scheduled — in practice immediately, but if two clicks land in the same tick (the Part 8 measurement: two clicks, two POSTs), both handlers may run before the flag is read. The measured rule from Part 8 still holds: **a `ref` set synchronously in the handler is the only airtight guard**; `isPending` plus a `disabled` button is the good-practice default and covers every human-speed double click.

```tsx
const inFlight = useRef(false);
const submit = () => {
  if (inFlight.current) return;
  inFlight.current = true;
  startAsync(async () => {
    try {
      await api.createProduct(draft);
    } finally {
      inFlight.current = false;
    }
  });
};
```

---

## 5. Two actions at once: measured, and counter-intuitive

```text
=== B. Two overlapping actions: React does not cancel or reorder them ===
   after the fast one resolved: label=fast pending=true  ← the slow action is still in flight
   after the slow one resolved: label=slow pending=false
   completion order: resolved fast → resolved slow
   both actions committed, in the order their awaits finished — so the label ends up
   "slow" even though "fast" was clicked last. An action is not a request canceller:
   guard with a request id or an AbortController when the newest answer must win
```

The scenario: a **slow** action (80 ms) is started, then 2 ms later a **fast** one (10 ms). React knows both are transitions: `pending=true` persists while either is running (note `pending=true` after the fast one resolved). But the *commits* happen in completion order, so the state ends up reflecting the **slow**, earlier-clicked action — the last writer wins by finish time, not by click time.

This is the single most important thing to know about actions, because it is the opposite of what "React handles it for you" suggests. The fix is the same one Part 7 taught for search-as-you-type, now applied to actions:

```tsx
function useLatestAction<TArgs extends unknown[], TResult>(run: (...args: TArgs) => Promise<TResult>) {
  const [isPending, startAsync] = useTransition();
  const requestId = useRef(0);
  const [result, setResult] = useState<TResult | null>(null);

  const execute = (...args: TArgs) => {
    const id = ++requestId.current;
    startAsync(async () => {
      const value = await run(...args);
      if (id !== requestId.current) return;   // ← an older action: drop its result
      setResult(value);
    });
  };
  return { execute, isPending, result };
}
```

`AbortController` (Part 7, file 06) is the other half: the request id decides whether to *apply* a stale result, and the abort signal decides whether to keep *fetching* it. Together they make "the newest answer wins" true, which actions alone do not.

💡 When the actions are independent — "add to cart" and "load reviews" — do not guard at all; ordering only matters when they write to the *same* state.

---

## 6. Errors inside an action

```text
=== C. An error thrown inside an action reaches the error boundary ===
   boundary rendered: "something failed"
   the action error was not swallowed: React re-threw it during the commit it triggered
```

An action that rejects is an error like any other render-phase error (Part 10, file 08): React re-throws it while committing, so the nearest **error boundary** catches it and renders its fallback. Two consequences:

- **You do not need a `catch` for "the app should show an error screen".** Throwing is a legitimate way to fail, and `isPending` correctly resets to `false` on the way out (measured in section 3's `after` line for the success path; the boundary run shows the failure path reaching the boundary rather than hanging).
- **You do need a `catch` for "the form should show a field error and stay usable".** A boundary replaces the UI; a form usually wants to keep the user's input and show a message next to the field. Files 03 and 04 cover that pattern (return errors as state, never throw for expected validation failures).

| Failure kind | Correct handling | Why |
| --- | --- | --- |
| Expected validation failure ("email is taken") | return it as action state | the form must stay usable with the user's input intact |
| Expected transient failure ("network blip") | retry (Part 7's backoff), then return an error | the user cannot act on a thrown error |
| Unexpected/programming failure ("`product` is undefined") | let it throw to the boundary | the UI cannot be trusted; the boundary's fallback with a reload is honest |
| Auth expiry (401) | let it throw a redirect-ish error, or handle centrally in the API layer | one decision, in one place |

---

## 7. A reusable action helper (the honest version)

If your app has several mutations, wrap the pattern once instead of repeating it:

```tsx
// src/actions/useAsyncAction.ts
import { useCallback, useRef, useState, useTransition } from 'react';

export interface ActionResult<T> {
  data: T | null;
  error: string | null;
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
  run: (...args: TArgs) => Promise<TResult>,
) {
  const [isPending, startAsync] = useTransition();
  const [result, setResult] = useState<ActionResult<TResult>>({ data: null, error: null });
  const requestId = useRef(0);

  const execute = useCallback(
    (...args: TArgs): void => {
      const id = ++requestId.current;
      startAsync(async () => {
        try {
          const data = await run(...args);
          if (id !== requestId.current) return;
          setResult({ data, error: null });
        } catch (caught) {
          if (id !== requestId.current) return;
          setResult((previous) => ({ data: previous.data, error: messageOf(caught) }));
        }
      });
    },
    [run],
  );

  return { execute, isPending, ...result, reset: () => { setResult({ data: null, error: null }); } };
}
```

Four design decisions worth naming, because they are the difference between a helper and a foot-gun:

1. **`run` is a parameter, not inlined**, so the helper does not depend on component state; callers pass a stable function created with `useCallback` (Part 10, file 03).
2. **A request id guards the result**, so an older action cannot overwrite a newer one.
3. **Errors are returned as data, not thrown.** Callers that *want* the boundary can re-throw; the default keeps the form alive.
4. **No `isMounted` checks.** React 19 no longer warns when you set state after unmount, and the update is harmless (React drops it); the interesting guard is the request id, not the mount flag.

⚠️ Do not reach for a helper before you have three call sites. One `startTransition(async () => …)` in a component is clearer than an abstraction, and this file exists because the *concept* needs explaining, not because every button needs a hook.

---

## 8. Where actions come from

An action is just a function, so the same concept appears in four costumes. Keeping them straight is what makes the rest of this part easy to read:

| Source | Looks like | Typical use |
| --- | --- | --- |
| **Event-handler action** | `startTransition(async () => …)` inside `onClick` | a button that is not a form submit (this file) |
| **Form action** | `<form action={fn}>` | a form's submit (file 03) |
| **`useActionState` action** | `const [state, formAction, isPending] = useActionState(fn, initial)` | forms that need to render errors/results (file 04) |
| **`startTransition` from `react`** | `startTransition(() => setX(...))` imported directly | transitions outside a component (a store subscriber, an effect) |

Measured, the last one works exactly as you would hope:

```text
=== D. startTransition also works outside a component ===
   startTransition called from module scope: marking the update non-urgent
   renders before/after the module-scope call: 1/1 (no state changed, so no render)
   outsideRendered flag: true
```

`startTransition` can be called anywhere a function can — a store subscriber, a WebSocket handler, an effect — and it is the same function the hook returns. The hook exists only to give you `isPending` inside a component. (In frameworks with Server Functions, a *server* action is a function that runs on the server and is callable from the client; from your component's point of view it is still just a function you pass to `action` or `startTransition`. Nothing in this file changes; only *where it runs* does.)

---

## 9. When NOT to use an action

1. **Synchronous state changes.** `setCount(c => c + 1)` in a click handler is urgent; putting it in a transition makes typing and clicking feel laggy for no benefit.
2. **Navigation-level urgent work.** A route change the user is waiting for is urgent by default (Part 6); a transition around it delays the very thing they asked for.
3. **When you need the result immediately**, synchronously, in the same handler — actions are asynchronous by nature.
4. **For background refetches and caches** — that is the data layer's job (Part 9, TanStack Query), not an action. An action is for a *user-initiated* write.
5. **As a replacement for cancellation or dedup.** Measured in section 5: they do not cancel anything.
6. **When a plain `async` handler is genuinely simpler** — a one-line "load more" that only appends data may not need pending UI at all. The tool is for user-visible async state, not for making async code look modern.

---

## 10. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Assuming an action cancels the previous request | the slow, earlier action commits last (measured) | request id + `AbortController` |
| 2 | Using `isPending` as an airtight double-click lock | two clicks in one tick can slip through (Part 8) | `ref` guard, then `isPending` for the UI |
| 3 | Not awaiting inside the action | `isPending` flickers off before the work finishes | `await` every promise whose duration you care about |
| 4 | Wrapping every `setState` in `startTransition` | all updates become non-urgent; the UI feels slower | transitions for slow, non-urgent work only |
| 5 | Forgetting that `isPending` resets on throw | you assume a spinner stays up on failure | verify: React settles the transition either way |
| 6 | Throwing validation errors to a boundary | the whole form is replaced by a fallback | return errors as action state |
| 7 | Swallowing action errors with an empty `catch` | the user sees "nothing happened" | show a message, or re-throw |
| 8 | Reading `isPending` from a *sibling* component | the flag belongs to the hook instance that started the action | lift it, use `useFormStatus` (file 03), or a context |
| 9 | Passing an inline async function to `useCallback`'s dependency | the helper sees a new `run` each render | stabilise `run` with `useCallback` |
| 10 | Treating server functions as "magic" | you cannot test or reason about them | remember: a function that runs elsewhere, called like a normal function |
| 11 | Using `useTransition` for a *route-level* loading state | you fight the router's own pending UI | the router's navigation state (Part 6) |
| 12 | Assuming `isPending` means "the network is busy" | retries/polling/cache refetches are invisible to it | track those in the data layer |

---

## 11. Best practices

1. **Await everything whose duration the UI should show**, and let the transition stay pending for exactly that long.
2. **Use `startTransition(async () => …)` for user-initiated writes** that should not block typing or clicking.
3. **Guard results with a request id** whenever two actions can write to the same state; add `AbortController` to stop the stale fetch too.
4. **Return expected errors, throw unexpected ones.** Boundaries are for bugs and unknown states.
5. **Disable the submit button while pending**, and keep a `ref` guard if a double submit is expensive.
6. **Keep the action near the component that uses it**, unless three call sites justify a helper.
7. **Wrap the whole interaction in the action, including its optimistic update** (file 06), so the pending window matches what the user perceives.
8. **Test the failure path**, not just the happy one: assert the pending state clears and the message appears.
9. **Do not put unrelated writes in one action**; separate actions stay independent, which matches how users think about their buttons.
10. **Measure the interaction** (Part 10, file 04) if you are unsure whether the transition helped — the win should be a responsive input, not a beauty contest.

---

## 12. Practice

### Beginner

1. Rewrite this handler as an action and list which of the five pieces of machinery disappeared:
   ```tsx
   const onSave = async () => { setIsSubmitting(true); try { await api.save(draft); setSaved(true); } finally { setIsSubmitting(false); } };
   ```
2. Explain in one sentence each: what an action is, what `isPending` measures, and what React does with an error thrown inside an action.
3. For each, say whether an action is appropriate: (a) filtering a list as the user types; (b) submitting a comment; (c) incrementing a like counter; (d) fetching the next page of products; (e) toggling a theme.

### Intermediate

1. Build `PendingCase` and add a counter of **completed** actions next to the button. Predict the pending/value transitions, then verify in the lab.
2. Implement the request-id guard from section 5 in `RaceCase` and prove with the transcript that the late "slow" answer no longer overwrites "fast". Then explain what changes if you also pass an `AbortController` signal.
3. A teammate wrapped a search input's `setQuery` in `startTransition` and now says "the input feels laggy". Explain why, and describe the correct pattern (Part 10, file 09: urgent input state, deferred derived value).

### Challenge

1. Write `useAsyncAction` (section 7) as production code in `src/actions/`, with tests that cover: success, failure, stale-result dropping, and unmount mid-flight. Then use it in two components with very different shapes (a form submit and a "load more" button) and write down where the abstraction helped and where it fought you.
2. Design the cancellation policy for a product search screen: which requests are abortable, which need a request id, which are safe to leave running, and what the UI shows in each case. Include a table of "user action → requests in flight → what the user sees".
3. Instrument the app so every action reports its duration to the console in development (`performance.now()` around the await) and a `transition_ms` metric in production. Then answer with data: which action is slow, whether the transition keeps the UI responsive during it, and what the next optimisation should be.

---

## 13. Solutions

### Beginner

1. ```tsx
   const [isPending, startAsync] = useTransition();
   const onSave = () => {
     startAsync(async () => {
       await api.save(draft);
       setSaved(true);
     });
   };
   ```
   Gone: the `isSubmitting` state (now `isPending`), the `try`/`finally` around it (React settles the transition), and the risk of a stuck flag. Remaining: the guard against a double submit if it is expensive, and the `catch` if the failure should be shown inline rather than thrown.
2. An action is a function (possibly async) that React runs inside a transition, tracking pending state and the updates it triggers; `isPending` measures "this action has not settled yet" (plus any commit still in progress for it) and nothing about the network; an error thrown inside an action is re-thrown during the commit, so the nearest error boundary renders its fallback (measured).
3. (a) no — the input must stay urgent and the *derived list* is what gets deferred; (b) yes — a write with pending UI; (c) no — a like is urgent feedback (use an optimistic update if the server is slow; file 06); (d) no — that is the data layer's job, though the *button* around it may use pending state; (e) no — instant local state.

### Intermediate

1. Prediction: mount (1), pending true (2), server answers and both `saved` and `isPending` change in one commit (3). Expect `pending=true saved=0` mid-flight, then `pending=false saved=1 completed=1`, with `PendingCase:render` around 3–5 depending on how React batches the two state updates — the counter does not add renders of its own.
2. ```tsx
   const id = ++requestId.current;
   startAsync(async () => {
     const value = await run();
     if (id !== requestId.current) return;
     setLabel(value);
   });
   ```
   Now the slow action's `setLabel('slow')` is dropped because `id !== current`, so the label stays `fast` even after 90 ms. Adding an `AbortController` also *cancels the fetch*, which saves bandwidth and server work, and makes the promise reject with an abort error that the guard must ignore (`if (id !== requestId.current) return;` before handling the error).
3. `startTransition(() => setQuery(value))` marks the *input's own state* as non-urgent, so the controlled input re-renders in a transition and can lag behind the keyboard — the classic "laggy input". The fix: keep the input state urgent and defer the expensive consequence — `const deferred = useDeferredValue(query)` and render the list from `deferred`, or keep the list update in a transition started *after* the urgent `setQuery`.

### Challenge

1. The tests: (a) success — `execute` resolves, `data` set, `isPending` false; (b) failure — `error` set, `isPending` false, `data` unchanged; (c) stale — start a slow action, then a fast one, assert the final `data` is the fast result (this is the test that would have caught the naive version); (d) unmount mid-flight — no warning, no state update after unmount (React 19 drops it; assert with a spy that nothing throws). Where the abstraction fought: a component that wanted the thrown error to reach a boundary needed an escape hatch (`rethrow`), and a component that wanted to optimistically update got a worse fit than writing the action inline.
2. Proposal: typing in the search box → one request, `AbortController` aborts the previous (Part 7); clicking a product in the results → a different endpoint, request id not needed (nothing shares state); infinite scroll → leave in flight, requests are additive and idempotent; refreshing the product detail → request id, because the newest detail must win. The UI table: while typing the results list shows the previous results dimmed (`isStale`), the input never waits; while aborting, no spinner at all; while loading more, a footer spinner; on failure, an inline retry that does not clear the input.
3. Expect the numbers to show that the slow action is a network round trip (hundreds of ms) while the transition's *commit* is cheap, i.e. the wait is I/O, not React — so the improvement is caching/prefetch (Part 9) or optimistic UI (file 06), not a faster render. If instead the commit is long, the fix is in the render tree (Part 10, file 04). Writing both numbers down is what prevents the argument.

---

## 14. Summary

- **An Action is a function React runs inside a transition, and it may be async.** React tracks its pending state and the updates it triggers; that replaces the manual `isSubmitting` + `try`/`finally` machinery for user-visible async work.
- **Measured pending timeline**: `pending=false saved=0` → `pending=true saved=0` → `pending=false saved=1`. `isPending` is true while the promise is unsettled, including across `await`s, and it resets on failure.
- **`isPending` is not a network indicator, and not an airtight double-click lock** — a `ref` set before the first `await` is the only guard that survives two clicks in one tick (Part 8's measurement).
- **Actions do not cancel or reorder each other.** Measured: a slow action started first and a fast one started 2 ms later both committed, so the UI ended up showing the *slow*, earlier-clicked result. Guard shared state with a request id, and add `AbortController` to stop the stale request.
- **Errors thrown inside an action reach the nearest error boundary** (measured: `boundary rendered: "something failed"`), which is the right default for bugs and the wrong one for validation. Return expected errors as state.
- **`startTransition` is importable and callable outside components** (measured from module scope); the hook exists only to expose `isPending` inside a component.
- **Do not wrap urgent updates in transitions.** The laggy-input mistake is always "I put the input's own state in a transition"; defer the derived work instead (Part 10, file 09).
- **Use a helper only when you have three call sites**, and make it guard stale results, return errors as data, and avoid mount flags.

---

**What's next →** [`03-forms-actions.md`](./03-forms-actions.md) points all of this at `<form>`: `<form action={fn}>` and what React does with the `FormData` (including the reset nobody expects), `useFormStatus` measured from inside a submit button, how to read every kind of field from `FormData`, how validation errors travel back to the user, and when a plain React Hook Form + Zod setup (Part 8) is still the better tool.
