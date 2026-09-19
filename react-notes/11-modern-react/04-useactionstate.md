# 04 — `useActionState`: Result, Pending and the Action in One Hook

> **Part 11 · Modern React · File 4 of 8**

Why this file exists: file 03 handed a function to `<form action>` and file 02 showed `useTransition` tracking an async function's pending state. Neither answers the question a form actually asks: *"what did the last submit say, and is one running right now?"* `useActionState` is the hook that answers both, in one call, without a `useState` per concern. This file takes it apart: the `[state, action, isPending]` triple, the reducer-shaped contract that makes a submit counter work (measured: `saved=0` → `saved=1`), how to model success and field errors so that a failed submit leaves the form usable, the double-submit guard that neither `isPending` nor `disabled` provides on its own, and the honest comparison with the `useState` + `try/catch` version it replaces.

Transcript from `npx tsx --tsconfig tsconfig.app.json src/dev/run-actions-probe.tsx`, section A.

---

## 1. The hook's shape

```tsx
import { useActionState } from 'react';

const [state, action, isPending] = useActionState(actionFunction, initialState);
```

| Value | Type | What it is |
| --- | --- | --- |
| `state` | whatever the action returned last time | starts as `initialState`, then becomes each return value |
| `action` | a function you pass to `<form action>` (or call yourself) | React's wrapped version of your function |
| `isPending` | `boolean` | true while the wrapped action is running |

And the action function has a fixed signature:

```tsx
async function actionFunction(previousState: State, formData: FormData): Promise<State>
```

⚠️ Note the arrow direction: the **first** parameter is the *previous state*, the second is the form's data, and the **return value replaces the state**. That is the same `(state, action) => nextState` shape as `useReducer` (Part 9, file 01), which is why the counter below works instead of resetting to 1 on every submit — and it is the reason a naive `useState` port cannot simply be wrapped.

---

## 2. Measured, line by line

```text
=== A. <form action={fn}> + useActionState + useFormStatus ===
   before: saved=0 last= pending=false
   mid-flight button: "saving Write the probe (get)" disabled=true
   after: saved=1 last=Write the probe pending=false
   input value after a successful action: "" (React reset the uncontrolled field)
   server calls: 1
   renders: ActionFormCase:render=4 SubmitButton:render pending=false=2 SubmitButton:render pending=true=1
```

```tsx
// src/part11/ActionsLab.tsx
const [state, formAction, isPending] = useActionState(
  async (previous: { count: number; last: string }, formData: FormData) => {
    const text = String(formData.get('text') ?? '');
    const todo = await server.add(text);                    // fake 20 ms server
    return { count: previous.count + 1, last: todo.text };   // ← the new state
  },
  { count: 0, last: '' },                                    // ← initialState
);
```

**Line by line.**

1. `async (previous, formData) => …` — React calls this on submit. `previous` is the state from the *last completed* submit (initially `initialState`), so an accumulating counter is possible.
2. `formData.get('text')` — the field values come from the DOM (file 03), not from state.
3. `await server.add(text)` — while this is outstanding, `isPending` is `true` and the form is "in a transition".
4. `return { count: previous.count + 1, last: todo.text }` — the return value *is* the new state. Reading `previous.count` is what makes it `0 → 1 → 2`; returning a literal `{ count: 1 }` would flatten it.
5. `{ count: 0, last: '' }` — the initial state; also the value `state` holds before the first submit.
6. `[state, formAction, isPending]` — three values from one hook: render `state`, give `formAction` to the form, read `isPending` for the UI.

**What the transcript proves:**

| Measurement | Proven claim |
| --- | --- |
| `before: saved=0 last= pending=false` | `state` starts exactly as `initialState`, `isPending` starts `false` |
| mid-flight `"saving Write the probe (get)" disabled=true` | during the await, pending UI can read both the status *and* the submitted data |
| `after: saved=1 last=Write the probe pending=false` | the returned object became `state`, and pending cleared |
| `input value … ""` | the DOM field was reset — so the *state* is what carries values forward, not the DOM |
| `server calls: 1` | one submit, one call |

💡 **Where to read `isPending`.** In this lab, the *button* reads pending through `useFormStatus` (file 03) and the *form component* reads it as the third value of `useActionState`. Both come from the same transition; use whichever keeps the subscription small. `isPending` is the better choice when the thing that shows progress is a sibling of the button (a top-of-form banner, a disabled fieldset).

---

## 3. Modelling state properly

The single decision that determines whether `useActionState` feels good is **what the state object looks like**. Three shapes cover almost everything:

### Shape 1 — a discriminated result

```tsx
type SubmitState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string; fieldErrors: Record<string, string[]> };
```

Rendering is then exhaustive and type-safe, and `never` checks (Part 2) will tell you when you forget a case. This is the shape to reach for when there is a real success/failure distinction in the UI.

### Shape 2 — values + field errors (the form shape)

```tsx
interface FormState<Values> {
  values: Partial<Values>;                        // ← echo the input back for re-population
  errors: Record<string, string[] | undefined>;   // ← per-field messages for aria wiring
  ok: boolean;
}
```

This is the shape used in file 03's validation example. It is deliberately "everything the form needs to render itself again", which is what makes the automatic reset survivable.

### Shape 3 — a counter/accumulator (as in the lab)

Simple and useful for "how many times did we save", but note that it *is* a reducer: `previous.count + 1`. If the logic grows past two branches, move to shape 1.

⚠️ **Never put the `FormData` itself in the state.** It holds `File` objects and is not serialisable; holding it keeps file contents alive in memory and can break in frameworks that serialise state across the server/client boundary. Extract the primitives you need.

---

## 4. Failure paths: four ways a submit can end

| Ending | How the action signals it | What the user sees | What you write |
| --- | --- | --- | --- |
| **Success** | returns a success state | confirmation; fields reset | `return { ok: true, values: {}, errors: {} }` |
| **Expected validation failure** | returns an error state | field messages; input preserved | `return { ok: false, values, errors }` |
| **Expected transient failure** (409/500/timeout) | returns a form-level error | banner with a retry | `return { ok: false, values, errors: {}, message: 'Try again' }` |
| **Bug / unexpected** | throws | nearest error boundary (measured in file 02) | nothing — let it throw |

```tsx
async function saveProduct(previous: FormState<Draft>, formData: FormData): Promise<FormState<Draft>> {
  const values = Object.fromEntries(formData) as Partial<Draft>;
  const parsed = DraftSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, values, errors: parsed.error.flatten().fieldErrors };
  }
  try {
    await api.createProduct(parsed.data);
  } catch (caught) {
    if (isApiError(caught, 409)) {
      return { ok: false, values, errors: { name: ['That name is already taken'] } };
    }
    if (isApiError(caught, 422)) {
      return { ok: false, values, errors: caught.fieldErrors };
    }
    throw caught;                 // unknown failures are not a form problem; the boundary owns them
  }
  return { ok: true, values: {}, errors: {} };
}
```

💡 Notice the shape of the judgement: **expected errors return, unknown errors throw.** Everything else in this file is mechanics; this line is the design.

---

## 5. Guards: pending is not a lock

Two facts, both measured elsewhere in this book, combine here:

- Part 8 measured that **two clicks in the same tick produce two writes** — a `disabled` button stops the second click only once React has re-rendered with `isPending === true`, which happens after the event handler returns.
- File 02 measured that **actions do not cancel each other**, so two submits can both complete and the later one wins by completion order.

So the pending state is for *the user*, and a `ref` is for *correctness*:

```tsx
function AddProductForm() {
  const [state, formAction, isPending] = useActionState(saveProduct, initialState);
  const submitting = useRef(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitting.current && !state.ok) event.preventDefault();   // ← optional: block while a submit is running
    submitting.current = true;
  };

  return (
    <form action={formAction} onSubmit={onSubmit}>
      …
      <button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
    </form>
  );
}
```

⚠️ `onSubmit` runs **before** the action. `preventDefault()` there cancels the action entirely — so if you use this guard, you must clear the ref when the action finishes (`useEffect` on `isPending`, or a `finally` inside the action), and you must be sure it is the behaviour you want. The simpler and usually sufficient pattern: `disabled={isPending}` plus a server-side idempotency key for truly expensive writes (Part 15, file 06).

---

## 6. `useActionState` vs the code it replaces

| Concern | `useState` + `try/catch` (Parts 7–8) | `useActionState` |
| --- | --- | --- |
| Pending flag | `const [isSubmitting, setSubmitting] = useState(false)` + `finally` | `isPending` from the hook |
| Result/error | one or two more `useState`s | the returned state object |
| Wiring the form | `onSubmit` + `preventDefault` + `new FormData(e.target)` | `<form action={formAction}>` |
| Double submit | your guard | `disabled={isPending}` (+ `ref` if it matters) |
| Field values | state per field (controlled) | `FormData` from the DOM |
| Non-form callers | call the handler directly | call `formAction(formData)`, or keep a separate action |
| Testing | call the handler | submit the form (Part 13) |

The hook's win is not magic: it is **one place for the result, one for pending, and one for the action**, with React owning the transition. In the lab's counter, the naive `useState` version would have been three states (`isSubmitting`, `saved`, `last`) and a `finally` that a future edit could forget.

⚠️ **It is not a form library.** It does not track dirty fields, focus, arrays, or per-field validation timing (file 03, section 8). If you need those, keep RHF and use actions only for the pending/transition behaviour.

---

## 7. `useActionState` outside a form

Because the action is just a function, the same hook models **any** async command with a result — a "generate report" button, a "sync now" button, a delete confirmation:

```tsx
function SyncButton({ onSync }: { onSync: () => Promise<number> }) {
  const [state, runSync, isPending] = useActionState(
    async (previous: { runs: number; synced: number }) => {
      const synced = await onSync();
      return { runs: previous.runs + 1, synced };
    },
    { runs: 0, synced: 0 },
  );

  return (
    <button type="button" disabled={isPending} onClick={() => { runSync(new FormData()); }}>
      {isPending ? 'Syncing…' : `Sync (${state.runs} runs, ${state.synced} items)`}
    </button>
  );
}
```

Two details: the wrapped action **always receives a `FormData`** (pass an empty one), and reading `previous` from the argument is what keeps the counters right. If a non-form action needs arguments beyond `FormData`, that is a sign the reducer-based version (`useReducer` + `startTransition`) or a small custom hook (file 02, section 7) is a better fit.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Reading the first argument as the `FormData` | the whole action is subtly wrong (values are a state object) | `(previousState, formData)` — in that order |
| 2 | Returning `undefined` | `state` becomes `undefined` and the UI crashes on `state.errors` | always return a full state object |
| 3 | Using the old state by mutating it | `previous` is shared with the last render | return a new object |
| 4 | Putting `FormData` or `File` in the state | memory retention, serialisation failures | extract primitives |
| 5 | Trusting `isPending` as a double-submit lock | same-tick double clicks (Part 8) | `ref` guard + server idempotency for expensive writes |
| 6 | Forgetting that a successful action resets the form | user's values vanish on failure if you do not echo them | return `values` on failure |
| 7 | Throwing for validation | the boundary replaces the form | return errors |
| 8 | A different `initialState` object identity each render | not a bug, but a code smell: it hints the initial state is computed | hoist it to a module constant |
| 9 | One action for "save" and everything else | unrelated writes share pending state | separate actions |
| 10 | Expecting `useActionState` to validate client-side | validation happens when the action runs (on submit) | pre-check in `onSubmit` or use RHF |
| 11 | Calling `formAction(new FormData())` in a loop | N sequential actions, one transition | one action, one payload |
| 12 | Skipping `useFormStatus` in child components and prop-drilling `isPending` | re-renders the whole form | file 03, section 3 |

---

## 9. Best practices

1. **Design the state shape first** (section 3) — discriminated union for workflow-ish flows, `{ values, errors, ok }` for forms.
2. **Return, never mutate**, and always return a complete object.
3. **Echo the values back on failure**, so the automatic reset cannot lose the user's work.
4. **Throw only for the unexpected**, and let the error boundary (Part 10, file 08) own it.
5. **Keep `initialState` at module scope** as a frozen constant.
6. **Read `isPending` where the progress is displayed**, not necessarily in the form component.
7. **Use `useFormStatus` in a leaf child** for the submit button; it keeps the re-render local (measured).
8. **Test one success and one failure path per action** (Part 13), including "values preserved after failure".
9. **Do not build a form framework** on top of it — the moment you need arrays, focus management or cross-field rules, use RHF (Part 8).
10. **Document the action's contract** in one line above it: what it returns on success, which failures it returns, and which it throws.

---

## 10. Practice

### Beginner

1. Write the `todo` action signature and state type from this file in your own words: which parameter is the previous state, what the return value does, and what `isPending` watches.
2. Predict the values of `state`, `isPending` and the input's value at three moments (before submit, mid-flight, after success) for the lab's form, then verify against the transcript.
3. Convert this snippet to `useActionState`, keeping the same behaviour:
   ```tsx
   const [error, setError] = useState<string | null>(null);
   const [saving, setSaving] = useState(false);
   const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
     event.preventDefault(); setSaving(true); setError(null);
     try { await api.save(new FormData(event.currentTarget)); } catch { setError('Failed'); } finally { setSaving(false); }
   };
   ```

### Intermediate

1. Extend the lab's action with validation: empty text → `errors.text = ['Text is required']`, and render it next to the field with `aria-invalid`. Confirm the form's values survive.
2. Build a two-step flow (an "order" object: `draft → confirm → placed`) using one discriminated-union state and one action that advances it. Draw the state machine first, then implement it.
3. A teammate says "`useActionState` is just `useReducer` for forms". Write the counter-argument and the parts of the analogy that are fair.

### Challenge

1. Build a small `<ActionForm>` generic component that takes `action`, `initialState`, a render function for `state`, and children for fields, and type it so the state type is inferred from the action. Then use it in two places and report the typing pain points.
2. Instrument the four failure endings from section 4 in a single demo: one form, four buttons, each producing one ending. Then write the assertion list you would use in tests (Part 13) to prove each behaves as documented — including "no unhandled rejection" for the thrown case.
3. Design an idempotency scheme for a "Place order" action: what key is generated, where it is stored, how the server deduplicates, and how the UI behaves when the same key is submitted twice (including after a page reload). Then decide what part of that belongs in the client at all.

---

## 11. Solutions

### Beginner

1. `useActionState(action, initial)` returns `[state, formAction, isPending]`; the action receives `(previousState, formData)` — previous state first — returns the next state, which React commits and hands back as `state`; `isPending` is true from the moment the wrapped action starts until it settles (including its commit).
2. Before: `state = { count: 0, last: '' }`, `isPending = false`, input holds what the user typed. Mid-flight: `state` unchanged (nothing returned yet), `isPending = true`, input holds the typed value (React has not reset it yet). After success: `state = { count: 1, last: 'Write the probe' }`, `isPending = false`, input is `""`.
3. ```tsx
   type SaveState = { error: string | null; saved: boolean };
   const [state, formAction, isPending] = useActionState(async (_previous: SaveState, formData: FormData) => {
     try { await api.save(formData); return { error: null, saved: true }; }
     catch { return { error: 'Failed', saved: false }; }
   }, { error: null, saved: false });
   return (
     <form action={formAction}>
       <input name="name" />
       <button type="submit" disabled={isPending}>Save</button>
       {state.error !== null && <p role="alert">{state.error}</p>}
     </form>
   );
   ```
   The `isSubmitting` and `error` states and the `finally` are gone; the remaining `try`/`catch` is there because a 500 should be shown inline rather than replace the form.

### Intermediate

1. Add `if (text.trim() === '') return { count: previous.count, last: previous.last, errors: { text: ['Text is required'] } }` before the fetch; render `{state.errors?.text?.[0]}` under the input with `aria-invalid={state.errors?.text !== undefined}`. Because the action returned instead of throwing, `count` stays where it was and the field's typed value is still in the DOM (and echoed in `state.values` if you also return it).
2. State machine: `draft → confirm → placed`, with an error branch back to the previous step. Type it as `type OrderState = { status: 'draft' } | { status: 'confirm'; order: Draft } | { status: 'placed'; id: string }`. One action switches on `previous.status` and returns the next state; rendering switches on `state.status` and, because the union is exhaustive, the compiler flags a missing branch. The key insight: the *form* is the same element across steps, but the fields rendered depend on the status — which is where a `key` on the fieldset (Part 10) keeps stale DOM out of the way.
3. Fair parts of the analogy: both take `(previousState, input)` and return a new state; both are "state machines driven by user events"; both benefit from discriminated unions. Where it breaks: `useActionState` additionally owns the **pending** state, wraps the call in a **transition** (so the updates are non-urgent and interruptible), accepts an **async** function and awaits it, receives **`FormData` from the DOM** rather than a plain action object, and is designed to be handed to `<form action>` so React manages the submit. `useReducer` is a synchronous state machine; `useActionState` is a state machine *plus* an async scheduler.

### Challenge

1. ```tsx
   function ActionForm<S, Props extends object>({ action, initialState, render, children }: {
     action: (previous: S, formData: FormData) => Promise<S>;
     initialState: S;
     render: (state: S, isPending: boolean) => ReactNode;
     children: ReactNode;
   } & Props) {
     const [state, formAction, isPending] = useActionState(action, initialState);
     return (
       <form action={formAction}>
         {render(state, isPending)}
         {children}
       </form>
     );
   }
   ```
   The pain points: (a) inferring `S` from the action works, but the render function's `state` is only as precise as you make the action's return type; (b) children cannot easily reach `isPending` (that is what `useFormStatus` is for); (c) extra form props (`noValidate`, `className`) need the `Props` intersection and leak into the DOM unless spread carefully.
2. Assertions per ending: **success** — the success text appears, the field is empty, the action was called once; **validation** — the field error is rendered, `aria-invalid="true"`, the typed value is still present, no network call was made; **transient failure** — a form-level alert appears, the values are kept, and a retry succeeds afterwards; **bug** — the boundary's fallback rendered (mock console.error to keep the test output clean) and no unhandled rejection was reported (assert with a `process.on('unhandledRejection')` spy or by failing the test on any console.error).
3. An idempotency key is a UUID generated client-side when the *flow* starts (not on each click), stored with the draft (in memory plus `sessionStorage` so a reload resumes the same order attempt), and sent as a header (`Idempotency-Key`). The server stores `(key → orderId)` and returns the same order for a repeat. The client: disables the button while pending, keeps the key on a retry after a timeout, and rotates it only when the draft's contents change in a way that must create a new order. What belongs on the client is *only* the key's lifecycle; the deduplication guarantee is the server's, because a client cannot enforce it against a retried request it never knew about.

---

## 12. Summary

- **`useActionState(action, initialState)` returns `[state, action, isPending]`** and fixes the action's signature as `(previousState, formData) => Promise<nextState>` — previous state **first**, return value **becomes** the state.
- **Measured end to end**: `saved=0 last= pending=false` → `pending=true` mid-flight with the field data available to pending UI → `saved=1 last=Write the probe pending=false`, one server call, and the uncontrolled input reset to `""` by React.
- **The state shape is the design decision**: a discriminated union for workflows, `{ values, errors, ok }` for forms, a counter only for trivial cases. Never store `FormData`.
- **Expected errors return; unknown errors throw.** Returning keeps the form usable (and `values` keeps the user's typing through the automatic reset); throwing hands the problem to the error boundary measured in file 02.
- **`isPending` is not a double-submit lock**: `disabled` plus a `ref` (and server-side idempotency for expensive writes) is what actually prevents duplicates — Part 8 measured two same-tick submissions succeeding.
- **It replaces three pieces of state and a `finally`**, but it is not a form library: no field arrays, no focus management, no per-field validation timing. Use RHF + Zod (Part 8) above the complexity threshold, actions below it.
- **The hook works outside forms too** (call the wrapped action with an empty `FormData`), which makes it a good fit for any async command with a result.

---

**What's next →** [`05-usetransition.md`](./05-usetransition.md) returns to `useTransition` now that actions exist: what changed in React 19 (async functions are allowed), how to use it without a form, `isPending` versus the pending you get from `useActionState`, when a transition should wrap a *state* update rather than a request, and the measured difference between "urgent" and "transition" in terms of which updates get skipped.
