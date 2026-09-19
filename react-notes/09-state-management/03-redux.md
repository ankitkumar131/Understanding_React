# 03 — Redux: Store, Actions, Reducers, Dispatch and Middleware

> **Part 9 · State Management · File 3 of 6**

Why this file exists: Redux is the most talked-about and least understood piece of the React ecosystem. It is not a React library (it has no React import at all), it is not "for large apps", and in a modern codebase you would rarely write it by hand — Redux Toolkit does that (file 04). But the *mechanism* is worth an hour of your attention, because the same mechanism (a single state value, actions as data, pure reducers, a subscription list, middleware around dispatch) is what Zustand does (file 05), what TanStack Query's cache does (file 06), and what every "predictable state container" from the last decade has copied. Learn it once here and the rest of this part is vocabulary.

Everything measured in this file comes from three real runs: `npx tsx src/dev/state-probe.ts` (the store, no React), `npx tsx --tsconfig tsconfig.app.json src/dev/run-plain-store-probe.tsx` (a hand-written store read by React), and `npx tsx --tsconfig tsconfig.app.json src/dev/run-rtk-probe.tsx` (Redux Toolkit's React binding).

---

## 1. The problem Redux was invented for

Written as a story, because the problem is a *shape* of bug, not a feature request:

> A shop admin has a cart badge in the header, a cart page, a product list with "Add to cart" buttons, and a checkout step. Six months in, a bug report arrives: *"sometimes the badge says 2 and the cart page shows 3 items."* Nobody can reproduce it. The badge reads `cartCount` from a context, the cart page reads `items` from a hook, and both are updated from **five different places** — three "Add to cart" handlers, a "remove" button, and an interval that re-syncs with the server. Somewhere, one of those five forgot to update one of the two values. There is no single line of code that describes how a cart changes, so there is nowhere to look.

The symptoms that all point at the same root cause:

1. **State is changed from many places**, each with its own copy of the logic.
2. **There is no record of what happened** — you cannot answer "how did the state get like this?".
3. **Two copies of one fact drift apart.**
4. **Bugs are unreproducible** because they depend on a sequence of events nobody logged.
5. **Tests are hard**, because the logic is spread across components and can only be exercised through the UI.

Redux's answer is a single rule plus a small machine:

> **One store holds the state, the only way to change it is to send it an action, and a pure function decides what an action means.**

Every symptom above is addressed by that rule, and section 2 names how. Redux was published in 2015, three years before hooks existed, and its shape (a store outside React, subscriptions, a connector) made sense for the class components of the time. What survived — and what you should learn — is the *idea*; what changed is the ergonomics (file 04).

---

## 2. The three principles, and what each one buys you

| Principle | The rule | What it buys |
| --- | --- | --- |
| **Single source of truth** | the app's shared state lives in one store object | "where is this value?" has one answer; two screens cannot hold two ages of it |
| **State is read-only** | you never assign to state; you send an action describing what happened | every change is an auditable event with a name; time travel and logging become possible |
| **Changes are made by pure functions** | a reducer `(state, action) => newState` computes the next state | the same state + same action always give the same result, so the logic is testable, replayable and safe to double-invoke |

The third principle is the one that pays off in practice, and it is worth stating as an equation:

```text
nextState = reducer(currentState, action)
```

There is no third input. A reducer that reads `Date.now()`, `Math.random()`, `localStorage`, or a `fetch` response has a hidden input, which breaks replay, makes tests flaky and makes time travel a lie. Anything from the outside world arrives **inside the action**, as data — which is why an action is a plain, serialisable object.

⚠️ "Read-only" does not mean "frozen by hand". It means *you* never write `state.x = y`; you return a new object. In a Redux Toolkit slice the code *looks* like it mutates, and file 04 explains why that is safe (Immer) — and what still throws.

---

## 3. The vocabulary, in one table

| Term | Type (TypeScript) | One-line meaning |
| --- | --- | --- |
| **state** | `S` | the current value; one object for the whole app |
| **action** | `{ type: string; …payload }` | a plain object describing *what happened* |
| **action creator** | `(payload) => Action` | a function that builds an action |
| **reducer** | `(state: S, action: A) => S` | the pure function that applies an action |
| **store** | `{ getState, dispatch, subscribe }` | the object that holds state and runs the loop |
| **dispatch** | `(action: A) => A` | the only way to send an action to the store |
| **listener** | `() => void` | a function called after every dispatch |
| **selector** | `(state: S) => V` | a function that derives a value from state |
| **middleware** | `store => next => action => …` | a wrapper around `dispatch` for cross-cutting behaviour |
| **slice** (RTK) | `{ name, initialState, reducers }` | one feature's state + actions + reducer (file 04) |

Read the types column again in order: they compose into one sentence. A store holds an `S`; `dispatch` takes an `A`; the reducer turns `(S, A)` into a new `S`; selectors turn `S` into whatever a component wants; middleware wraps dispatch. That is the whole architecture.

---

## 4. Actions: the only way to say what happened

An action is a plain object with a `type` string and whatever data the reducer needs:

```ts
// src/part9/cartSlice.ts (Redux Toolkit's action creators, shown in file 04)
itemAdded({ id: 'p-lamp', name: 'Desk Lamp', priceMinor: 129_950, qty: 1 })
// → { type: 'cart/itemAdded', payload: { id: 'p-lamp', … } }

couponApplied('SAVE20')
// → { type: 'cart/couponApplied', payload: 'SAVE20' }

cartCleared()
// → { type: 'cart/cartCleared' }
```

### Naming

- **`domain/eventHappened`** for the type: `'cart/itemAdded'`, `'todos/toggled'`, `'auth/signedOut'`. The domain prefix keeps a growing app's action log readable and prevents collisions when two teams both add a `'reset'`.
- **Past tense, or a statement of fact**: `itemAdded`, not `addItem`. The reducer decides *what adding an item means* (fold into an existing line, cap the quantity, reject out-of-stock); the action only reports the event.
- **No instructions**: `{ type: 'cart/setQtyAndRecalculateTotalAndSave' }` is a reducer wearing a costume. Split it into the event (`quantitySet`) and the consequences (which the reducer computes).

### Why plain objects, and not calls

You could imagine `cart.addItem(item)` as the API. Actions-as-objects buy four things that method calls cannot:

1. **They can be logged.** The DevTools extension shows a list of actions with state diffs — a transcript of the session, not a black box.
2. **They can be serialised** — sent over a WebSocket, written to `localStorage`, attached to a bug report, replayed in a test.
3. **They can be replayed.** Same actions, same initial state, same result. This is what "time travel" physically is: the store re-runs the reducer from the start with fewer actions.
4. **They can be inspected and transformed by middleware** — a logger, an analytics bridge, an undo manager, an offline queue.

⚠️ That is also why Redux Toolkit *warns in development* when an action contains something non-serialisable (a `Date`, a class instance, a function). This was measured, unedited:

```text
   a Date inside an action → 2 dev warning(s), first one:
     A non-serializable value was detected in an action, in the path: `payload.when`. Value: Sat Sep 19 2026 11:55:33 GMT+0000 (Coordinated Universal Time)
```

The warning is not a style complaint. A `Date` travelling through your store breaks replay (a replayed action carries the *original* date, not a fresh one), breaks persistence (JSON turns it into a string, so the shape after a reload differs), and breaks equality checks that assume plain data. Pass an ISO string or a timestamp number as the payload, and construct a `Date` where it is displayed.

---

## 5. Reducers: pure, immutable, and identity-aware

```ts
// src/part9/plainStore.ts
export function todosReducer(state: Todo[] = initialTodos, action: TodoAction): Todo[] {
  switch (action.type) {
    case 'todos/added':
      return [...state, { id: action.id, title: action.title, done: false }];
    case 'todos/toggled':
      return state.map((todo) => (todo.id === action.id ? { ...todo, done: !todo.done } : todo));
    case 'todos/removed':
      return state.filter((todo) => todo.id !== action.id);
    default:
      return state; // ← the same reference, not a copy
  }
}
```

### Line by line

- `[...state, newTodo]` — a new array. `state.push(...)` would mutate the current array, React would see the same reference, and the UI would not update. This one habit prevents a large share of "why isn't my component re-rendering?" questions.
- `state.map(...)` with a ternary — copy-on-write for the *one* item that changed. Untouched items keep their identity, which is what makes `React.memo` and selector comparisons work (measured below).
- `{ ...todo, done: !todo.done }` — fields copied, one overridden. Learn this pattern until it is automatic: `{ ...obj, field: newValue }` and `[...array, item]`.
- `default: return state;` — **the most important line in the file.** The store compares the old and new state by reference to decide whether anything changed. Returning a fresh copy from `default` would make every unknown action look like a change and would notify every subscriber for nothing.

Measured, from the counter reducer in file 01 (same rule, different shape):

```text
=== A. A reducer is a function: state in, state out ===
   initial      {"value":0,"step":1,"history":[]}
   after +      {"value":1,"step":1,"history":["+"]}
   initial now  {"value":0,"step":1,"history":[]} — the argument was never touched
   three separate "+" calls from the same start: 1, 1, 1 (fresh object each time, so each one starts from 0)
   every call returns a new object: true
   against a frozen state: value 1 (it copies, never mutates)
   an unknown action returns the SAME reference: true
```

### Structural sharing, measured on Redux Toolkit

```text
=== C. Redux Toolkit: the same store, less code ===
   after 3 dispatches: Desk Lamp ×1, Wireless Mouse ×1, Keyboard ×1
   the listener was notified 1 time(s) for 1 dispatch
   the items ARRAY is a new array: true
   but the untouched Desk Lamp object is reused: true
   and the untouched Wireless Mouse object is reused: true
   mutating state directly throws in dev: Cannot add property 3, object is not extensible
```

- **The array is new, the untouched objects are not.** That is structural sharing: copy the path from the root to the change, share everything else. With 10,000 rows, adding row 10,001 copies one array and one row object, not 10,001 objects.
- **Direct mutation throws in development.** `state.cart.items.push(...)` outside a reducer fails with `Cannot add property 3, object is not extensible`, because the state is frozen in dev. That error is a *gift*: it catches the class of bug that produces "the UI didn't update" in production, at the moment you write it. (File 04 explains why slices can still *look* like they mutate.)

💡 The mental model to keep: **a reducer is a `switch` over actions, and every branch returns a new state value that shares as much as possible with the old one.**

---

## 6. The store: one loop, measured

```text
=== B. A store is a reducer plus a listener list (plainStore.ts) ===
[logger] todos/added changed=true
[logger] todos/added changed=true
[logger] todos/toggled changed=true
[logger] todos/removed changed=true
[logger] undefined changed=false
[logger] todos/added changed=true
   listeners notified 5 times (once per dispatch, thunk included)
   second listener saw: 1 todos | 2 todos | 2 todos | 1 todos | 2 todos
   final state: [{"id":"t1","title":"Write chapter","done":true},{"id":"t3","title":"Added from a thunk","done":false}]
```

The one-way flow, in the order it happens:

```text
UI event ──► dispatch(action) ──► middleware ──► reducer(state, action) ──► new state
                                                                              │
                                       subscribers notified ◄────────────────┘
                                              │
                                     selectors re-run ──► components re-render
```

Points worth pulling out of the transcript:

- **Subscribers run after the reducer**, so a listener always sees the *new* state (`getState()` inside the notification is not stale). The second listener's log — `1 | 2 | 2 | 1 | 2` — is the state at each notification: `toggled` did not change the count, `removed` brought it back down.
- **Every dispatch notifies, even a no-op.** The `changed=false` line is the logger *observing* that the reference was unchanged. Redux itself notifies all subscribers and leaves it to `useSelector` (or your listener) to compare; RTK's React binding is what turns that into "no re-render" (section 10).
- **Nothing about React appears here.** The store is a plain object; the sections below are only about how React learns about the notifications.

---

## 7. Middleware: where side effects live

Redux has no place for a `fetch` inside a reducer — and that is deliberate (section 2). Side effects live in **middleware**, which are functions wrapped around `dispatch`:

```ts
// src/part9/plainStore.ts
export type Middleware<S> = (store: Store<S>) => (next: UnknownDispatch) => UnknownDispatch;
```

That three-arrow shape is the whole concept. Read it inside out:

1. `store =>` — the middleware is created with access to `getState` and `dispatch`.
2. `next =>` — it receives the *next* link in the chain (another middleware, or the reducer).
3. `action =>` — it returns the function that will actually be called with each action. That function may inspect the action, call `next(action)`, dispatch something else, do nothing, or delay.

The logger and the thunk from file 01:

```ts
export function logger<S>(label: string): Middleware<S> {
  return (store) => (next) => (action) => {
    const before = store.getState();
    const result = next(action); // ← the rest of the chain runs here
    console.log(`${label} ${String((action as { type: string }).type)} changed=${String(before !== store.getState())}`);
    return result;
  };
}

export function thunk<S>(): Middleware<S> {
  return (store) => (next) => (action) => {
    if (typeof action === 'function') {
      // A thunk is just a function that receives dispatch and getState.
      return (action as (dispatch: UnknownDispatch, getState: () => S) => unknown)(store.dispatch, store.getState);
    }
    return next(action);
  };
}
```

**A thunk is not a Redux feature.** It is a function, plus a middleware that calls it. That is why `[logger(), thunk()]` produces the transcript in section 6: the logger sees the *function* before the thunk runs it (`undefined changed=false`), and then sees the action the thunk dispatches (`todos/added changed=true`), because the thunk's inner `dispatch` re-enters the whole chain.

### Middleware order

Middleware run left-to-right on the way *in* and right-to-left on the way *out*, like nested function calls:

```ts
configureStore({
  reducer: rootReducer,
  middleware: (getDefault) => getDefault().concat(logger('app')), // ✅ append
  // middleware: [logger('app')],                                 // ❌ removes thunk + dev checks
});
```

⚠️ Replacing the default middleware array silently removes `redux-thunk` (so every async action creator stops working) and the development checks from section 4 and 5. Always `concat` (or `prepend`).

### What middleware is good for

| Middleware | Does |
| --- | --- |
| `redux-thunk` (built in) | lets `dispatch` accept a function, enabling async flows |
| a logger | prints every action with a state diff — the fastest way to learn a codebase's action vocabulary |
| a crash reporter | attaches the last N actions to an error report (this is what makes production bugs reproducible) |
| a persistence bridge | writes a slice to `localStorage` on change, with debouncing |
| an offline queue | holds actions that failed while offline and replays them |
| RTK's dev checks | warn about mutating state and non-serialisable values (section 4) |
| `redux-saga` / listener middleware | more complex orchestration: debounce, race, take-latest — rarely needed once file 06's tool is in the picture |

---

## 8. How a store is wired to React (the part libraries hide)

React does not know a store exists. The bridge is a hook, and since React 18 the hook is `useSyncExternalStore`:

```ts
// src/part9/plainTodos.ts — the whole bridge, no library
export function useTodos(): Todo[] {
  return useSyncExternalStore(
    todoStore.subscribe, // subscribe(listener) → unsubscribe
    () => todoStore.getState(), // the snapshot React reads during render
  );
}
```

```tsx
// src/part9/PlainTodosPanel.tsx
export function PlainTodosPanel() {
  const todos = useTodos();

  return (
    <section>
      <p data-testid="todos-count">{todos.length} todos ({todos.filter((todo) => todo.done).length} done)</p>
      <ul data-testid="todos">
        {todos.map((todo) => (
          <li key={todo.id}>
            <input type="checkbox" checked={todo.done} onChange={() => todoActions.toggle(todo.id)} />
            {todo.title}
            <button type="button" onClick={() => todoActions.remove(todo.id)}>
              remove
            </button>
          </li>
        ))}
      </ul>
      <button type="button" data-testid="add-todo" onClick={() => todoActions.add(`t${todos.length + 1}`, `Task ${todos.length + 1}`)}>
        Add todo
      </button>
    </section>
  );
}
```

### Measured

```text
=== A. A store with no provider ===
   on mount: 0 todos (0 done)
   the store is a module import; the component was not wrapped in anything

=== B. Dispatching from a click handler ===
[todos] todos/added changed=true
   PlainTodosPanel=1
   DOM: 1 todos (0 done) — Task 1

=== C. Dispatching from plain module code ===
[todos] todos/added changed=true
   todoActions.add(...) from module scope → PlainTodosPanel=1
   DOM: 2 todos (0 done) — Task 1 | Added from module scope
   React found out because useSyncExternalStore subscribed to subscribe()

=== D. Two dispatches in one tick ===
[todos] todos/added changed=true
[todos] todos/added changed=true
   two dispatches → PlainTodosPanel=1 (React batches both notifications)
   DOM: 4 todos (0 done)

=== E. Reading and writing from plain JavaScript ===
[todos] todos/toggled changed=true
   same array reference? false (the reducer copied)
   the mounted component re-rendered PlainTodosPanel=1 because the store notified it
   1 of 4 todos are done
   a fresh store instance can be created for a test: createStore(todosReducer, [])
```

Four properties of this bridge, all visible above:

1. **No provider, no context, no prop.** The component imports the store. Rendering it anywhere — a route, a modal, a test — just works (`A`).
2. **Updates flow in both directions across the React boundary.** A click reaches the store through an action; module-scope code (`todoActions.add`) reaches the DOM without React being involved in the trigger at all (`B`, `C`).
3. **React batches.** Two dispatches in one tick produce **one** render (`D`), not two — React 18's automatic batching applies to external-store notifications as well. Without that, an action that dispatches three times would render three times with intermediate states visible.
4. **The `act(...)` warnings** you may see while running this probe are a *test-harness* requirement, not a product requirement: in a test, React must be told when to flush updates that come from outside its event system. (In the probe, every store write is wrapped in `act` for exactly that reason; in a real app there is nothing to wrap.)

⚠️ The `getSnapshot` contract — the same one that crashed a Zustand component in file 05 — matters here too. `useSyncExternalStore` calls the snapshot function during render and compares results with `Object.is`; it must return a **cached, stable** value. `todoStore.getState()` returns the same object until a reducer replaces it, so it is stable by construction. A snapshot like `() => ({ todos: store.getState() })` would be a new object on every call and React would loop until it aborted.

---

## 9. Selectors: derived state with a cache

A selector is a function from state to the value a component wants. Most selectors are one line and need no cache:

```ts
export const selectCartItems = (state: RootState) => state.cart.items;
export const selectCartUnits = (state: RootState) => summarize(state.cart.items).units;
```

A **memoised selector** caches its result and recomputes only when its inputs change:

```ts
// src/part9/selectors.ts
export const selectCartSummary = createSelector([selectItems, selectCoupon], (items, coupon): CartSummary => {
  selectorRuns.summary += 1; // probe instrumentation only
  return summarize(items, coupon);
});

export const selectSortedNames = createSelector([selectItems], (items): string[] => {
  selectorRuns.sortedNames += 1;
  return items.map((item) => item.name).sort();
});
```

```text
=== D. Selectors: memoised derived state ===
   summary computed 1 time(s) for two calls; same object? true
   names computed 0 time(s) so far
   names: Desk Lamp, Wireless Mouse
   before the coupon: {"lines":2,"units":3,"subtotalMinor":629750,"discountMinor":62975,"totalMinor":566775,"couponCode":null}
   after a coupon change: summary computed 2 time(s) — the coupon is an input
   after a coupon change: names computed 1 time(s) — names do not depend on it
   after the coupon: {"lines":2,"units":3,"subtotalMinor":629750,"discountMinor":125950,"totalMinor":503800,"couponCode":"SAVE20"}
```

What this proves:

- **Two calls, one computation, the same object back** (`same object? true`). This is the property `useSelector` depends on: if a selector returns a new object on every call, every store change looks like a change to that component, and you get re-renders (or a `getSnapshot` loop).
- **The coupon is an input to `summary`, so it recomputes** — correct behaviour, and cheap because `summarize` is fast.
- **The coupon is *not* an input to `names`, so it does not recompute.** Nothing about the sort changed, so the cached array is reused, reference and all. That is the purpose of memoisation: not "make it faster" in general, but "keep the result's identity stable so downstream comparisons can skip work".

When is a selector worth memoising? When it does real work (sorting 10,000 rows, grouping, joining) **or** when its result is passed to a memoised child or used as an effect dependency. A selector that returns `items.length` needs nothing.

---

## 10. The React binding, measured

Redux Toolkit's React binding is `react-redux`: a `<Provider>` that puts the store in a (stable) context, plus two hooks.

```tsx
// src/main.tsx
import { Provider } from 'react-redux';
import { store } from './part9/store';

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <App />
  </Provider>,
);
```

```tsx
// A component that reads state and dispatches actions
export function RtkAddButton({ item }: { item: CartItem }) {
  const dispatch = useAppDispatch(); // stable for the component's lifetime
  return (
    <button type="button" onClick={() => dispatch(itemAdded(item))}>
      Add {item.name}
    </button>
  );
}
```

### Measured

```text
=== A. The provider injects the store through context ===
   <Provider store={store}> passes the store down with a context —
   useAppSelector/useAppDispatch read it; components never import it
   initial state: {"items":[],"coupon":null}

=== B. One dispatch, and only the interested components re-render ===
   RtkCartBadge=1 RtkCartTotal=1 RtkItemsList=1 RtkUnitsFromSelector=1
   RtkAddButton: 0 renders (only useAppDispatch, which never changes)

=== C. Two dispatches in one event → one render pass ===
   two dispatches → RtkCartBadge=1 RtkCartTotal=1 RtkItemsList=1 RtkUnitsFromSelector=1
   state: ["Desk Lamp ×2","Wireless Mouse ×1"]

=== D. A selector that returns an unchanged value skips the render ===
   coupon applied → RtkCartTotal=1
   badge and list are absent: their selected values are unchanged
   total re-rendered: the discount changed it to 407840

=== E. A change in another slice does not wake the cart up ===
   products.query changed → (no renders)
```

Reading these four sections:

- **`RtkAddButton: 0 renders`** — the same result as file 02's split context, achieved by a different mechanism: `useDispatch` returns a function from a context whose value never changes. In Redux terms, a component that only dispatches never has to subscribe to state at all.
- **Batching (C)**: two dispatches in the same event produce one render per subscribing component. The store notifies twice; React coalesces.
- **`coupon applied → RtkCartTotal=1`** (D): the badge and the list are *absent from the transcript*, meaning their `useSelector` results compared equal and React skipped them. This is the crucial difference from context (file 02, section 6, where the badge re-rendered). `useSelector` re-runs your selector on every store change, compares the result with the previous one using `Object.is` (by default), and only re-renders when it differs.
- **Slice isolation (E)**: `products.query` changed and *no cart component re-rendered*, because the cart selectors returned identical values. A store does not have context's problem of one big value: every component subscribes to its own projection.

### The equality rule, and the trap

`useSelector`'s default comparison is reference equality, which is exactly why the measured components behaved well and exactly why this fails:

```tsx
// ❌ a new object every call → looks changed on every store update
const { units, totalMinor } = useAppSelector((state) => ({
  units: summarize(state.cart.items).units,
  totalMinor: summarize(state.cart.items, state.cart.coupon).totalMinor,
}));
```

`react-redux` v9 detects this pattern and warns: *"Selector unknown returned a different result when called with the same parameters. This can lead to unnecessary rerenders."* Two fixes:

```tsx
// ✅ 1. Two primitive selectors — each compared with Object.is
const units = useAppSelector((state) => summarize(state.cart.items).units);
const totalMinor = useAppSelector((state) => summarize(state.cart.items, state.cart.coupon).totalMinor);

// ✅ 2. One memoised selector — the object identity is stable between changes
const summary = useAppSelector(selectCartSummary);
const { units, totalMinor } = summary;
```

And if you must return a new object, `useSelector` accepts an equality function as its second argument (`shallowEqual` from `react-redux`) — legitimate, but a memoised selector is usually the better fix because it also caches the work.

---

## 11. What the DevTools extension actually gives you

Install Redux DevTools in the browser and a Redux app exposes a live transcript of its session:

| Panel | What you use it for |
| --- | --- |
| **Action list** | every action since page load, with the payload: the vocabulary of the codebase in one scroll |
| **State diff** | click an action to see exactly which fields changed — this is how you catch a reducer that touches too much |
| **State tree** | inspect any slice at any point in time, without `console.log` |
| **Time travel** | click an earlier point to re-render the app as it was; then re-dispatch a modified action |
| **Dispatch** | fire an action by hand to reproduce a state (create the "sometimes" from the bug report) |
| **Trace** (with middleware) | the stack trace of the `dispatch` call that produced an action |

Time travel is not a party trick: it turns an unreproducible bug into a sequence you can step through, and it is only possible because of the three principles in section 2 — a serialisable action log plus a pure reducer is a replayable machine.

⚠️ The DevTools extension adds overhead, so it is a development tool. In production, the same idea survives in a compact form: keep the last N actions in memory and attach them to error reports (a middleware, one file).

---

## 12. When Redux is the right tool — and when it is not

**Redux earns its place when several of these are true:**

- Many **unrelated** parts of the app write the same state (a cart, a board editor, a media timeline, a document with many panels).
- You need a **complete, replayable history** of changes: undo/redo, collaborative editing, an audit trail, a bug report you can replay.
- **Non-React code writes state**: a WebSocket handler, a worker, a router loader, a test.
- A **large team** benefits from one enforced pattern: actions are named, reducers are pure, devtools show intent, tests target reducers.
- The app's shared state is genuinely complex (many entities with relationships, cross-cutting invariants).

**Redux is the wrong tool when:**

- The state is a handful of values that change rarely — a theme, a locale, a modal flag. Context (file 02) costs nothing.
- Most of the "shared state" is really **server state**. That belongs in a query cache (file 06) or RTK Query (file 04), not in hand-written slices with `isLoading`/`error`/`lastFetched` fields.
- One component writes and one component reads. Lift the state.
- The reason is "our app is big". **Size is not the criterion** — complexity of shared state is. A 200-screen app with one cart and lots of pages needs context and a query library, not Redux; a single-screen spreadsheet with 40 interdependent actions needs exactly Redux.

The honest history: for years the community's default advice was "use Redux for any real app", which produced thousands of apps with a store holding one modal flag and a fetched list. That advice is dead. Modern guidance is the table in file 01, section 12: local → lifted → reducer → context → store → server cache, choosing the lowest rung that fits.

---

## 13. The cost of Redux

| Cost | What it looks like in practice |
| --- | --- |
| **Indirection** | a click → an action creator → a reducer in another folder → a selector → a prop. Two files to understand one button |
| **Boilerplate** (much less with RTK) | action types, creators, reducers, initial states that file 04 generates from a `createSlice` |
| **A second place where state changes** | components *and* the store; "where does this value come from?" now has two possible answers |
| **Bundle size** | measured in a Vite 8 lib build with React external and minification on: **RTK + react-redux ≈ 19.7 kB gzip** (Zustand ≈ 1.9 kB, TanStack Query ≈ 12.5 kB) — real, though rarely decisive on its own |
| **Onboarding** | the vocabulary (dispatch, thunk, selector, slice) is a week for a newcomer, versus an afternoon for `useState` |
| **Testing friction** | every component test now needs a store (a helper like `renderWithStore` fixes it, but it is another file) |
| **The cache temptation** | server data goes into slices, and you end up hand-writing invalidation badly |

⚠️ The last row is the one that hurts most in real codebases, and it is why file 06 exists: if you find yourself adding `lastFetchedAt`, `invalidate()` actions and manual request deduplication to a slice, you are rebuilding a query cache with fewer features.

---

## 14. Redux vs context vs Zustand

| | Redux (+RTK) | Context | Zustand |
| --- | --- | --- | --- |
| Provider | yes (`<Provider store>`) | yes (a provider per concern) | no |
| Re-render granularity | per **selector** result | per **value identity** | per **selector** result |
| Read outside React | `store.getState()` | ✗ | `getState()` |
| Write outside React | `store.dispatch()` | ✗ | `setState()` / actions |
| Devtools / time travel | built in, best in class | ✗ | devtools middleware |
| Middleware ecosystem | large (thunks, sagas, listeners, persistence) | ✗ | small, focused (persist, immer, devtools) |
| Boilerplate | medium (low with RTK) | low | very low |
| Structure / conventions | enforced: slices, actions, selectors | none — you invent it | light; slices pattern optional |
| Best for | complex shared client state, auditability, large teams | low-frequency app-wide values | the same as Redux in most day-to-day apps, with less ceremony |
| Watch out for | over-use; server data in slices | whole-subtree re-renders | less structure as the store grows; manual conventions |

There is no winner. Pick by the state's shape: if you need an *audit trail* and a team-wide convention, Redux; if you need *speed of development and less ceremony* for genuinely global client state, Zustand; if the value is read widely and changes rarely, context. File 05 ends with the same question and a decision checklist; file 06 covers the case all three of them get wrong — server data.

---

## 15. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Mutating state (`state.items.push(x)`) | the store sees no change; the UI keeps the old data (RTK throws in dev) | return a new object: `[...items, x]` |
| 2 | A fresh object from `default:` | every unknown action notifies every subscriber | `return state` |
| 3 | Putting non-serialisable values in actions (a `Date`, a class) | replay, persistence and devtools break; dev warning (measured) | send strings/numbers; construct objects where they are displayed |
| 4 | `fetch` inside a reducer | impure reducer: no replay, flaky tests, double-invoked in StrictMode | thunks / listener middleware / a query library |
| 5 | One giant slice for the whole app | no isolation, giant diffs, merge conflicts in one file | one slice per feature (`cart`, `auth`, `filters`) |
| 6 | Server data in slices by hand | you hand-write dedupe, staleness, retry, invalidation | a query cache (file 06) or RTK Query (file 04) |
| 7 | A selector returning a new object | re-renders on every store change; `react-redux` warns | primitives, or a memoised selector, or `shallowEqual` |
| 8 | Replacing `middleware` instead of `.concat` | thunks stop working; dev checks vanish | `getDefault().concat(myMiddleware)` |
| 9 | `useSelector` with a stale closure (selecting a value captured from props) | the component renders values it should not, or misses updates | pass it through the selector's state, or memoise the selector per id |
| 10 | Dispatching inside render | an infinite render loop or a "cannot update during render" error | dispatch in handlers and effects |
| 11 | Using Redux for a modal flag | ceremony for a boolean; tests need a store | `useState` |
| 12 | "We use Redux because the app is large" | a store full of copies of server data, no benefit | choose by the kind of state (file 01, section 12) |

---

## 16. Best practices

1. **Model events, not instructions.** `cart/quantitySet` beats `cart/setQtyAndSave`.
2. **Keep reducers pure** and put every outside value into the action payload.
3. **Return `state` for anything unhandled** — identity is the signal that nothing changed.
4. **Namespace action types** with the feature: `'cart/…'`, `'auth/…'`.
5. **One slice per feature**, with its own file and its own selectors.
6. **Put derived values in selectors**, never in state. Memoise only when measured.
7. **Select narrowly**: `state.cart.items.length` beats `state`, always.
8. **Async work belongs in thunks or middleware**, never in reducers or components' render bodies.
9. **Append middleware with `.concat`**, and write one (a logger) before you need one (a crash reporter).
10. **Test reducers directly** — a pure function takes two arguments and returns one; the test needs no React, no store and no mocks.
11. **Keep the store out of presentational components.** Import hooks in containers/screens; let the leaf components take props.
12. **Add a store helper for tests** (`renderWithStore(preloadedState)`) the day you add the store, not the day the tests break.

---

## 17. Practice

### Beginner

1. Write the action type, the shape of the action, and the body of the reducer case for each of these events: "the user typed into the search box", "the user submitted the search", "the request failed with a message", "the user cleared the search".
2. Here is a reducer. Find the three bugs and fix them:

   ```ts
   export function cartReducer(state: CartState, action: CartAction): CartState {
     switch (action.type) {
       case 'cart/itemAdded':
         state.items.push(action.item);
         return { ...state, items: state.items };
       case 'cart/itemRemoved':
         return { ...state, items: state.items.filter((line) => line.id === action.id) };
       case 'cart/cleared':
         return { items: [] };
       default:
         return { ...state };
     }
   }
   ```
3. Explain in one sentence each why: (a) a reducer must not `fetch`, (b) an action must be serialisable, (c) `default: return state` matters.

### Intermediate

1. Add a `logger` middleware that prints a compact state diff (the changed keys) rather than the whole state, and use it while clicking around an app you have built. What do you learn about your own action vocabulary that you did not know?
2. Write `selectCartBadge(state)` for a badge that shows `units` and a `isBulk` flag. Then implement it two ways — as one selector returning an object, and as two primitive selectors — and explain which one you would put in a hot list row, and why.
3. Trace a single click through the system: which function creates the action, which middleware sees it, when the reducer runs, when subscribers are notified, which selectors run, and which components re-render. Write the answer as a numbered list for the "Add to cart" button in this lab.

### Challenge

1. Implement **undo/redo** with the store: keep `past: CartState[]`, `present: CartState`, `future: CartState[]`; make `undo`, `redo` and `clearHistory` actions; decide (and justify) whether history survives navigation, and how many steps you keep. Then explain why this is trivial with a Redux-style store and awkward with `useState` in three components.
2. Add **persistence** as a middleware: subscribe to the store, write a whitelisted set of slices to `localStorage` with a debounce and a version field, and rehydrate before the first render. Handle: corrupt JSON, a version mismatch, and a storage write that throws (private browsing or a full quota).
3. Write a **crash reporter** middleware: keep a ring buffer of the last 30 actions (type + payload only), and expose a function that attaches them to an error report. Explain what makes those 30 actions safe to store (section 4) and what you would redact before sending them anywhere.

---

## 18. Solutions

### Beginner

1. ```ts
   { type: 'search/queryChanged'; query: string }        // on every keystroke
   { type: 'search/submitted'; query: string }           // on Enter / button
   { type: 'search/failed'; message: string }            // the request rejected
   { type: 'search/cleared' }                            // the X button
   ```
   Each case returns a new object; `submitted` also stores the submitted query separately from the live one (that is the point of splitting them — see Part 8's debounce discussion), and `failed` stores the message next to a `status` field rather than replacing data.
2. ```ts
   case 'cart/itemAdded':
     // bug 1: push mutates. Copy instead.
     return { ...state, items: [...state.items, action.item] };
   case 'cart/itemRemoved':
     // bug 2: the filter keeps the removed line. Invert the comparison.
     return { ...state, items: state.items.filter((line) => line.id !== action.id) };
   case 'cart/cleared':
     // bug 3: the coupon is silently dropped, and a constant is better here.
     return initialCartState;
   default:
     // bug 4: a fresh object on every unknown action.
     return state;
   ```
3. (a) A reducer must be pure so the same `(state, action)` always gives the same result — a `fetch` makes the result depend on the network and on when it was called. (b) An action must be serialisable so it can be logged, persisted and replayed; a `Date` or a function survives none of those intact. (c) Returning the same reference tells the store and every selector "nothing changed", which is what lets React skip work.

### Intermediate

1. Compute the changed keys by comparing the two states shallowly (`Object.keys(next).filter((key) => next[key] !== previous[key])`) and print `type` + those keys. The lesson students usually report: most actions touch one key, a few touch three — and the three-key ones are almost always a sign that the action is doing two jobs.
2. ```ts
   // One object → new identity every call
   export const selectCartBadge = (state: RootState) => {
     const { units } = summarize(state.cart.items);
     return { units, isBulk: units >= BULK_UNITS };
   };

   // Two primitives → Object.is is enough
   export const selectUnits = (state: RootState) => summarize(state.cart.items).units;
   export const selectIsBulk = (state: RootState) => summarize(state.cart.items).units >= BULK_UNITS;
   ```
   In a hot list row, use the two primitives (or one memoised selector if the object form is what the component wants) — each primitive re-renders only when its own value changes, and no comparison function is needed.
3. 1. The button's `onClick` calls `dispatch(itemAdded(item))`. 2. `itemAdded` is an action creator that builds `{ type: 'cart/itemAdded', payload: item }`. 3. Middleware see it in order; the logger prints it; the thunk passes it on (it is not a function). 4. The slice's reducer handles `cart/itemAdded` via Immer, producing new state with a new `items` array and a new state object. 5. `configureStore`'s `subscription` notifies the React binding. 6. The binding re-runs each subscribed component's selector. 7. Components whose selector result changed by `Object.is` re-render: the badge (`units` changed) and the list; the Add button does not.

### Challenge

1. Shape: `{ past: CartState[]; present: CartState; future: CartState[] }`, with `undo` popping from `past` into `present` and pushing the old `present` onto `future`. Keep history across navigation if the store is app-wide (the user expects the back button to undo the *page*, not the cart) — but cap it (say 50 steps) so memory stays bounded, and clear it on checkout so a user cannot undo a completed order into an inconsistent state. The reason it is trivial here: the state is one value with pure transitions, so "the previous state" is just a value you saved. With `useState` in three components, there is no single "previous state" to save — that is precisely the problem the store solves.
2. Subscribe once, collect the whitelisted slices, debounce ~250 ms, and write `{ version, state }`; wrap the write in `try`/`catch` (a full quota throws `QuotaExceededError`; private browsing can throw on `localStorage` access itself) and log once rather than crashing. On boot, read before rendering: parse inside `try`/`catch`; on a parse failure, delete the key and start fresh; if `version` is older, run a migration function and write the upgraded payload. Then create the store with `preloadedState` so the very first paint is correct — a rehydrate *after* mount causes a visible flash of the default state.
3. Keep `history: Array<{ type: string; payload?: unknown }>` capped at 30 entries, and expose `getActionHistory()`. The safety comes from section 4: actions are plain serialisable data with no functions, no DOM nodes, no class instances — so they can be stored, cloned and sent. Redact before sending: anything from a form field (emails, passwords, addresses, card numbers), tokens and ids that identify a person, plus the payloads of actions you know carry free text. A practical pattern is a per-action `redact(action)` allowlist rather than a copy filter, because new actions are added constantly and an allowlist fails *closed* (it drops data you meant to send) instead of open (it leaks data you meant to drop).

---

## 19. Summary

- Redux exists to fix a **shape of bug**: state changed from many places, no record of what happened, two copies drifting apart. Its answer is one rule — one store, actions describe what happened, a pure reducer decides what it means.
- **The three principles** map to concrete payoffs: single source of truth (one answer to "where is this value?"), read-only state (an auditable event log), pure reducers (testable, replayable, double-invocation-safe).
- **Actions are serialisable data**, which is what makes logging, persistence, replay and time travel possible — and why non-serialisable payloads produce a dev warning (measured: a `Date` in an action, two warnings).
- **Reducers are identity-aware.** Measured: they never touch their input, always return a fresh object for a real change, survive a frozen state, and return the *same reference* for an unknown action.
- **Structural sharing** is what keeps this cheap: measured, a new `items` array with the untouched line objects identical — and the dev build freezes state so a direct mutation throws (`Cannot add property 3, object is not extensible`).
- **A store is a reducer plus a listener list**, and middleware are functions wrapped around `dispatch` — measured: the logger saw a thunk as `undefined changed=false` and then the inner action as `todos/added changed=true`.
- **The React bridge is `useSyncExternalStore`.** Measured: a module-level store updated the DOM from a click and from module scope, and two dispatches in one tick produced one render.
- **Selectors control re-renders.** Measured: a memoised selector computed once for two calls, and did not recompute when an unrelated field (the coupon) changed. In the RTK binding, a component whose selected value is unchanged does not re-render at all, and a change in another slice wakes nobody.
- **Redux is a fit for complex, widely-written, auditable client state** — not for "large apps", not for server data, and not for a modal flag. File 04 turns the mechanism into the ergonomic version (slices, Immer, typed hooks, thunks).

---

**What's next →** [`04-redux-toolkit.md`](./04-redux-toolkit.md) writes the same cart with `configureStore` and `createSlice`, and shows what the hand-written version lacked: Immer so reducers can "mutate" safely, typed `useAppSelector`/`useAppDispatch`, memoised selectors, `createAsyncThunk` with pending/fulfilled/rejected and the stale-response guard — plus an honest comparison with RTK Query.
