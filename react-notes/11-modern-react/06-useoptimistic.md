# 06 — `useOptimistic`: Show the Result Before the Server Agrees

> **Part 11 · Modern React · File 6 of 8**

Why this file exists: the fastest network request is the one the user does not wait for. Part 9, file 06 built optimistic updates by hand — snapshot the old list, add a temporary row, replace it on success, roll back in `catch`, and remember to do all three in the right order. `useOptimistic` gives that behaviour a name and a contract: you describe *how the state would look* if the action succeeded, React shows it while the action runs, and React **discards it automatically** when the action finishes — success or failure. This file measures both endings (the row appears before the server answers; on failure it disappears), then covers the rules that make it safe: it only applies inside an action or transition, it is derived from real state rather than stored, keys must be stable, and it is emphatically not for money, stock or anything you cannot undo.

Transcripts from `npx tsx --tsconfig tsconfig.app.json src/dev/run-actions-probe.tsx`, sections B and C.

---

## 1. The hand-written version, and its four bugs

Part 9's manual optimistic delete, in the shape most codebases write it:

```tsx
const [rows, setRows] = useState<Todo[]>(initial);
const onAdd = async (text: string) => {
  const temp = { id: `temp-${Date.now()}`, text };       // 1. fabricate an id
  setRows((current) => [...current, temp]);              // 2. show it
  try {
    const saved = await api.add(text);
    setRows((current) => current.map((row) => (row.id === temp.id ? saved : row)));  // 3. reconcile
  } catch {
    setRows((current) => current.filter((row) => row.id !== temp.id));               // 4. roll back
  }
};
```

Four things to get right in every such handler, four places to get them wrong: the fabricated id must never collide; the reconciliation must replace rather than duplicate; the rollback must be idempotent (what if the user added two rows and one failed?); and the whole thing must be cancelled correctly if the component unmounts. `useOptimistic` turns this into a *derivation*:

```tsx
const [optimisticRows, addOptimisticRow] = useOptimistic(rows, (current, text: string) => [
  ...current,
  { id: `pending-${current.length}`, text, saving: true },
]);
```

There is no rollback code, because there is nothing to roll back: `optimisticRows` is `rows` plus the pending additions, computed at render time. When the action ends — successfully or not — the pending additions simply stop being part of that computation.

---

## 2. Measured: the successful path

```text
=== B. useOptimistic: the row appears before the server answers, and rolls back on failure ===
   mid-flight list: Read part 11New lamp
   mid-flight saving row: New lamp
   after the server answered: Read part 11New lamp
```

```tsx
// src/part11/ActionsLab.tsx
const [todos, setTodos] = useState<Todo[]>(server.todos);
const [optimistic, addOptimistic] = useOptimistic(todos, (current: Todo[], text: string) => [
  ...current,
  { id: `pending-${current.length}`, text, saving: true },
]);
const [, startTransition] = useTransition();

const submit = (formData: FormData): void => {
  const text = String(formData.get('text') ?? '');
  startTransition(async () => {
    addOptimistic(text);                    // 1. the optimistic state exists *now*
    try {
      const saved = await server.add(text); // 2. a fake 60 ms server call
      setTodos((current) => [...current, saved]); // 3. the real state catches up
    } catch {
      // nothing to do: the optimistic row disappears when the transition ends (section 3)
    }
  });
};
```

**Line by line.**

- `useOptimistic(todos, reducer)` — the first argument is the **real** state (from `useState`, a store, or props); the second describes how to derive the optimistic view from it plus whatever you pass to the updater.
- `addOptimistic(text)` — the updater. It must be called **inside an action or a transition**; called from a plain click handler, React warns ("An optimistic state update occurred outside a transition or action") because it would have no well-defined end.
- `await server.add(text)` — the optimistic row is visible for exactly this window (measured mid-flight: `Read part 11New lamp`).
- `setTodos(current => [...current, saved])` — on success you commit the **real** row. Note that the optimistic row does not need to be removed: when the transition ends, the optimistic layer is discarded and `optimistic` becomes `todos` again — which now contains the server's row.
- `catch { /* nothing */ }` — on failure you do nothing, and that is the whole rollback (section 3).

💡 **The data-saving attribute** in the probe (`data-saving="true"` → `New lamp`) is the practical trick for styling: mark the optimistic entries in the derivation so the UI can render them dimmed, italic, or with a small "saving" hint, without any extra state.

---

## 3. Measured: the failing path

```text
=== C. The same flow when the server refuses ===
   mid-flight list: Read part 11Rejected lamp
   after the failure: Read part 11
   the optimistic row was rolled back because the action threw
```

The row was there while the action ran and gone when it threw. **No rollback code ran.** That is the entire value of the hook: rollback is the *absence* of a commit, not a compensating update you write and test. Consequences worth naming:

- **Rollback is automatic and complete** for the pending layer — you cannot forget it, and you cannot half-apply it.
- **You still own the error message.** The row vanishing is not a user experience; show "Could not save the lamp — retry?" (and, since file 03's automatic reset cleared the form, decide whether to restore the text).
- **You still own the real state.** If the server *did* save but the response failed (a timeout after a write), the optimistic view is gone and reality is out of sync — the honest mitigation is a refetch (Part 9's invalidation) or an idempotency key (Part 11, file 04, challenge 3).

---

## 4. The rules

| Rule | Why | Symptom when broken |
| --- | --- | --- |
| Call the updater **inside an action/transition** | React needs to know when the optimistic layer ends | console warning; the optimistic value sticks or vanishes unpredictably |
| Derive from **real state**, never store the optimistic value | the derivation *is* the mechanism | rollback stops working; duplicates on success |
| Keep **keys stable and unique** in the derivation | React reconciles by key | rows flicker or lose focus while saving |
| Keep the derivation **pure** | it runs during render, possibly twice in StrictMode | duplicated rows, random ids changing between renders |
| Expect **no ordering guarantees** between concurrent actions | measured in file 02: actions do not cancel or reorder | a stale optimistic row sitting next to a newer real one |
| Use it for **reversible, non-critical** things | it shows something that may be false | a user believes an order was placed |

⚠️ **The purity trap is easy to hit** because the natural id is `Date.now()` or `Math.random()`:

```tsx
// ❌ a new key on every render: React remounts the row constantly
useOptimistic(rows, (current, text) => [...current, { id: `${Date.now()}`, text }]);

// ✅ derived from a counter you control, or from a parameter you passed
useOptimistic(rows, (current, text) => [...current, { id: `pending-${current.length}`, text }]);
```

💡 A robust option for real apps: generate the id in the *handler* (where the call is imperative and runs once) and pass it into the updater: `addOptimistic({ id: crypto.randomUUID(), text })`. The updater then stays pure and the key is stable.

---

## 5. Three shapes you will actually need

### Shape 1 — append (this file's lab)

```tsx
const [optimistic, add] = useOptimistic(rows, (current, row: Row) => [...current, row]);
```

### Shape 2 — toggle/flag (a like, a favourite, a status change)

```tsx
const [optimisticItems, setOptimisticItem] = useOptimistic(
  items,
  (current, change: { id: string; liked: boolean }) =>
    current.map((item) => (item.id === change.id ? { ...item, liked: change.liked } : item)),
);
```

### Shape 3 — delete (the optimistic removal from Part 9, now four lines shorter)

```tsx
const [optimisticItems, removeOptimistic] = useOptimistic(items, (current, id: string) =>
  current.filter((item) => item.id !== id),
);

const onDelete = (id: string) => {
  startTransition(async () => {
    removeOptimistic(id);
    await api.deleteItem(id);          // failure → the row comes back by itself
    setItems((current) => current.filter((item) => item.id !== id));
  });
};
```

⚠️ In the delete case, the rollback *is* visible to the user (the row reappears). Say what happened: a short toast ("Could not delete — the item is back") is the difference between "buggy app" and "handled failure".

---

## 6. `useOptimistic` with forms, stores and `useActionState`

| Combination | Notes |
| --- | --- |
| **`<form action>` + `useOptimistic`** | call the updater inside the action; the form still resets on success, so the optimism is about the *list*, not the field |
| **`useActionState` + `useOptimistic`** | the action returns `{ values, errors }`; wrap the state update in a transition (or use the action you pass to `useActionState`, which is already a transition) and update the optimistic layer there |
| **Zustand/Redux + `useOptimistic`** | keep the optimistic layer local to the component (`useOptimistic(storeValue, …)` reads the store's value through a selector) — do not push pending entries into the store, or every reader must filter them |
| **TanStack Query + `useOptimistic`** | usually you do not need both: Query's `onMutate`/`onError`/`onSettled` (Part 9, file 06) is the idiomatic optimistic cache. Use `useOptimistic` for view-layer optimism that is *not* shared state |
| **Suspense (file 07)** | optimism is the opposite of a fallback: no waiting, no skeleton — but only when the action is likely to succeed |

⚠️ **Do not mix two optimistic mechanisms on the same data.** If Query's cache already applied an optimistic update and a component adds a `useOptimistic` layer on top, the rollback ordering becomes a debugging nightmare: one layer removes the row, the other re-adds it.

---

## 7. When NOT to be optimistic

| Situation | Why not |
| --- | --- |
| Money, stock, seat selection, anything with contention | the server can reject for reasons the client cannot know; a false "confirmed" is worse than a spinner |
| Destructive actions with no undo | show a confirmation and a pending state instead |
| Long operations (uploads, report generation) | optimism is for the *user's intent*, not for invented progress; use real progress UI (uploads report bytes) |
| Actions with server-assigned identity visible to the user | showing an order number that changes on commit is confusing |
| When failures are common (flaky network, strict validation) | every rollback is a visible glitch; fix the failure rate first |
| When the result is not reversible in the UI | "the row came back" is recoverable; "the payment succeeded" is not |

💡 The rule in one line: **be optimistic about what you can take back.**

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Calling the updater outside an action/transition | React warns; the layer has no defined end | call it inside `startTransition(async () => …)` or a form action |
| 2 | Storing the optimistic value in `useState` as well | two sources of truth; rollback breaks | derive only |
| 3 | Non-pure ids (`Date.now()`, `Math.random()`) inside the render-time updater | new keys every render; remounts and flicker | generate the id in the handler and pass it |
| 4 | Forgetting the real commit on success | the row disappears right after the server confirms it | `setState` with the server's object |
| 5 | Showing nothing on failure | the row silently vanishes | a toast or inline message with a retry |
| 6 | Keeping optimistic rows in a global store | every consumer must filter pending entries | keep the layer local to the component |
| 7 | Optimism for contended resources (stock, seats) | false confirmations | pending state + server truth |
| 8 | Ordering assumptions with concurrent actions | measured: actions do not cancel or reorder | request ids (file 02) or serialise the actions |
| 9 | Putting `useOptimistic` in a component that does not re-render | the optimistic value never appears | the component owning the derivation must render when the action starts (it does, via the transition) |
| 10 | Using it to avoid writing a loading state for a *slow page* | the UI claims results that do not exist | Suspense + skeletons (file 07) |
| 11 | Duplicating Query's optimistic cache with a second layer | two rollbacks fighting | pick one mechanism per data source |
| 12 | Forgetting accessibility | screen readers do not announce the optimistic row | mark pending rows (`aria-busy`, a status region) and announce failures |

---

## 9. Best practices

1. **Derive, never store.** `useOptimistic(realState, derivation)` is the whole pattern.
2. **Mark the pending entries** (`saving: true`, `pending: true`) so the UI can style and announce them.
3. **Pass ids in from the handler**, keeping the updater pure.
4. **Commit the server's object on success** — use the id and timestamps the server returned, not your placeholder.
5. **Announce failures**: toast, inline error, and a retry that re-runs the action.
6. **Refetch or invalidate after the action** when the server's view may differ from yours (Part 9).
7. **Keep the optimistic layer component-local**; shared caches have their own mechanisms.
8. **Be optimistic only about reversible things** (section 7).
9. **Test both endings** — the success test alone will not catch a missing real commit (the optimistic row hides the bug).
10. **Check it under StrictMode**, where render functions run twice: a pure updater is unaffected; an impure one duplicates rows.

---

## 10. Practice

### Beginner

1. In your own words: what does `useOptimistic`'s reducer receive, what is shown while the action runs, and what happens to the optimistic value when the action ends?
2. Predict the two transcripts of sections 2 and 3 (what is in the list mid-flight, after success, after failure) for an optimistic *delete* rather than an add.
3. For each action, say optimistic or not, and why: liking a post; deleting a comment; placing an order; renaming a folder; applying a discount code; sending a chat message.

### Intermediate

1. Convert a Part 9 optimistic delete (the three-step version) to `useOptimistic` and count the lines removed. Then write down which of the three steps disappeared entirely, which became the derivation, and which became the commit.
2. Add optimistic toggling to a favourites list: clicking the heart fills it instantly, the server call follows, and a failure un-fills it with a message. Keep the updater pure and prove it survives StrictMode double rendering.
3. A product row's optimistic entry and the server's real row briefly both exist because the ids differ (`pending-1` vs `42`). Explain why this is usually invisible, and describe the case where it is not (hint: sorting by `createdAt`, or a list with a max length).

### Challenge

1. Build `useOptimisticList` that wraps `useOptimistic` for add/update/remove, returns the derived list plus three imperative helpers, and refuses to be used outside a transition (throw a helpful error if `isPending` is false and no transition is active). Then write the test that catches a developer using it in a plain handler.
2. Design the UX for a "place order" flow that is *optimistic about the cart* but *not* about the payment: which parts update instantly, which show pending, what happens if the payment fails after the order id was created, and how the user's cart is restored.
3. Instrument an app to measure the perceived latency of three interactions with and without `useOptimistic` (time from click to visible change). Report the numbers and the failure-handling cost you accepted for them.

---

## 11. Solutions

### Beginner

1. The reducer receives the *current real state* and whatever you passed to the updater, and returns the optimistic view; while the action runs, React renders that derived view; when the action settles (success or failure), the optimistic layer is discarded and the view is recomputed from real state.
2. Optimistic **delete**: mid-flight the row is *absent* from the list; on success it stays absent (because `setItems` also removed it); on failure it **reappears**. Add: mid-flight present, success present, failure absent. In both cases the rollback is the automatic discard, and the visible change in the failing case is the clue that you owe the user a message.
3. Optimistic: like, rename, chat message (all reversible and low-stakes). Not optimistic: delete a comment (show pending; deletion is often irreversible), place an order, apply a discount code (the server decides eligibility; a false "applied" is misleading).

### Intermediate

1. The manual version's three steps: (a) *snapshot* — gone, because the real state is untouched; (b) *apply the optimistic change* — becomes the reducer passed to `useOptimistic`; (c) *replace on success / revert on failure* — the replace becomes a `setItems` with the server's object on success, and the revert disappears entirely. In practice the handler shrinks from ~12 lines to 4.
2. ```tsx
   const [optimisticFavourites, toggleOptimistic] = useOptimistic(favourites, (current, id: string) =>
     current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
   );
   const onToggle = (id: string) => {
     startTransition(async () => {
       toggleOptimistic(id);
       await api.toggleFavourite(id);
       setFavourites((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
     });
   };
   ```
   Pure: the same inputs produce the same output, so StrictMode's double render is harmless; the id comes from the handler, not from `Date.now()` inside the reducer.
3. It is usually invisible because the pending entry and the real entry are *the same row visually*: the optimistic one disappears in the same commit that the real one appears (the transition's commit). It becomes visible when order matters — the optimistic row sorts to the bottom with a fabricated timestamp and then jumps, or when a list enforces a maximum length and the temporary row pushes out a real one. The fix when order matters: sort optimistic entries by an explicit `pending: true` flag (render them last, or first, deterministically), or insert the optimistic row at the position the real row will occupy.

### Challenge

1. The wrapper keeps `const [pendingCount, setPendingCount] = useState(0)` plus the `useOptimistic` state; each helper increments the count inside the transition and decrements it in a `finally`. Guarding "must be inside a transition" is awkward from inside a hook (React does not expose the current lane), so the practical guard is: the helpers *throw* if `pendingCount === 0` — i.e. they refuse to be the first caller outside a transition — with a message pointing at the correct pattern. The test asserts the throw when a helper is called from a bare click handler.
2. Optimistic: the cart line items and the totals (recompute locally, mark the row "pending"), the order in the user's list. Not optimistic: the payment, the order number, the stock reservation. If the payment fails after the order id exists: keep the order in a "payment failed" state (it is real), show a retry-payment action, and **do not** silently drop the cart — the user should find their items where they left them. Restoring the cart is a server-side operation (the order is recorded), which is exactly why the client cannot own this transition.
3. Expect the measurement to show click-to-visible dropping from ~300 ms to ~16 ms (one frame) for the optimistic parts, with the caveat that the *user-visible truth* now arrives later (a small "saving" hint) and that failures need design work. Writing that trade-off down — 280 ms of perceived latency bought with a new failure path — is the honest engineering argument for adopting it.

---

## 12. Summary

- **`useOptimistic(realState, reducer)` derives a "what if it works" view**; the pending layer exists only while the action runs and is discarded automatically when it settles — so rollback is the *absence* of a commit, not code you write.
- **Measured success**: the row is in the list mid-flight (`Read part 11New lamp`) and after the server answers, once the real `setState` commits the server's object.
- **Measured failure**: the row is present mid-flight (`Rejected lamp`) and gone afterwards — with no rollback code anywhere.
- **It only works inside an action or transition**, which is why files 02–05 had to come first; calling the updater from a plain handler warns and misbehaves.
- **Keep the reducer pure and the keys stable** (generate ids in the handler, not with `Date.now()` inside the derivation), mark pending entries so the UI can style and announce them, and commit the server's object on success.
- **Be optimistic about what you can take back**: favourites, renames, comments, chat — yes; payments, stock, seat selection, irreversible deletes — no.
- **Do not stack optimistic mechanisms** on the same data (Query's cache *or* a local `useOptimistic` layer), and always design the failure message, because a silently vanishing row is a bug report waiting to happen.

---

**What's next →** [`07-use.md`](./07-use.md) covers React 19's most unusual API: `use(promise)` and `use(context)`. It can be called conditionally and in loops (unlike hooks), it needs a stable promise or it suspends forever, a rejected promise is an error rather than a fallback (measured: the fallback appeared, then the value), and it is the bridge between Suspense (Part 10, file 07) and your existing data cache.
