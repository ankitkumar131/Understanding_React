# 01 — State Management: The Progression from `useState` to a Store

> **Part 9 · State Management · File 1 of 6**

Why this file exists: Parts 3–8 used `useState` and `useReducer` without ever asking *where* each piece of state should live. In small components that question answers itself. In an app with a header, a cart, a catalogue, a filter bar and a modal, it does not — and the wrong answer is what makes a React app feel "messy" long before it gets slow. This file is the map. It defines what counts as state, sorts state into five kinds, and walks the progression that every React codebase follows whether or not anyone decided to: **local → lifted → reducer → context → external store → server cache** — with the rule for when to stop climbing. Files 02–06 then take one rung each, in depth.

Everything measured in this file comes from a real run against a live mock API; the transcript is quoted as it was printed, and every number can be reproduced with `npx tsx src/dev/state-probe.ts` (setup shown in section 6).

---

## 1. What state is — and what is not

**State is data that changes over time and must survive a re-render.**

The second half of that sentence is the useful half. A variable inside a component disappears the moment React renders the component again, so anything that must outlive a render has to be stored in React (or outside it) rather than in a plain variable.

```tsx
function SearchBox() {
  let query = '';                       // ❌ gone on every render
  const [committed, setCommitted] = useState('');   // ✅ survives renders

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setCommitted(query);
      }}
    >
      <input
        onChange={(event) => {
          query = event.target.value;   // ❌ resets to '' on the next render
        }}
      />
      <p>You searched for: {committed}</p>
    </form>
  );
}
```

Data that does **not** change, or that can be computed from other data, is not state:

| Kind of value | Is it state? | Where it lives |
| --- | --- | --- |
| The text the user is typing | ✅ yes | `useState` in the form |
| The cart lines the user added | ✅ yes | shared client state (file 05) or context (file 02) |
| The product list from the API | ✅ yes, but **server state** | a query cache (file 06) |
| `?category=audio` in the URL | ✅ yes, but **URL state** | the URL, read with `useSearchParams` (Part 6) |
| `PRODUCTS_PER_PAGE = 3` | ❌ no | a module constant |
| The cart total | ❌ no — derived | compute it from the lines (`summarize`) |
| `items.length > 0` | ❌ no — derived | `items.length > 0` at render time |
| The input's DOM value | ❌ not React's | the DOM (until you make it controlled) |

⚠️ The most common early bug is treating a *derived* value as state. Two copies of one fact drift apart the moment one of them is updated without the other:

```tsx
// ❌ two sources of truth for one fact
const [items, setItems] = useState<CartItem[]>([]);
const [total, setTotal] = useState(0); // must be updated in every place items changes

function add(item: CartItem) {
  const next = [...items, item];
  setItems(next);
  setTotal(summarize(next).totalMinor); // forget this line once → wrong total for ever
}

// ✅ one source of truth, everything else derived at render time
const [items, setItems] = useState<CartItem[]>([]);
const total = summarize(items).totalMinor; // always correct by construction
```

💡 The test: **"if I forget to update this value somewhere, can the app show something wrong?"** If yes, it is derived data, not state.

---

## 2. The five kinds of state

Every piece of state in a front-end app falls into one of five buckets. The bucket decides the tool, and choosing the wrong bucket is the root cause of most "state management" pain.

| Kind | Who owns the truth | Examples | Where it belongs |
| --- | --- | --- | --- |
| **Local UI state** | this component | a modal's `isOpen`, a dropdown's `isExpanded`, the text in an input | `useState` in the component that renders it |
| **Shared client state** | the browser session | the cart, a theme, an auth user, a draft order, filters the user set | lifted props → context → a store (files 02, 04, 05) |
| **Server state** | the server | the product list, order detail, the signed-in user's profile | a server-cache library (file 06) |
| **URL state** | the URL | `/products?category=audio&page=2`, the current tab in a tabbed page | `useSearchParams`, route params (Part 6) |
| **Form state** | the form, mid-edit | field values, touched flags, validation errors, dirty fields | `useState`/`useReducer`/react-hook-form (Part 8) |

Two of these deserve emphasis because beginners misplace them constantly:

- **Server state is a cache, not a store.** You do not own it; it can change without you; two screens can hold two different ages of it. File 06 is entirely about this, and it is the single biggest upgrade available to most React apps.
- **URL state is shared state that survives a refresh, a bookmark and a "send me that link" message.** Filters, sort order, pagination and open tabs belong in the URL. If a piece of state should be linkable, that is the deciding factor, and React Router's `useSearchParams` is the tool (Part 6, files 04–05).

---

## 3. Rung 1: `useState` where the data is used

The first rule of state management is not to manage any. State that only one component needs should live in that component — a habit called **colocation**.

```tsx
function ProductsToolbar() {
  const [isOpen, setIsOpen] = useState(false); // nobody else needs this

  return (
    <div>
      <button type="button" onClick={() => setIsOpen((open) => !open)}>
        Filters {isOpen ? '▲' : '▼'}
      </button>
      {isOpen && <CategoryFilter />}
    </div>
  );
}
```

**Why this is the first rung:** the state has one writer and one reader, both inside the same function. There is nothing to synchronise, nothing to name, nothing to trace. This is also the state most likely to be *wrongly* promoted to a global store — a reducer, a context, an action type and three files, for a boolean that one component reads.

**When to climb:** a sibling needs it, a parent needs to render it, or a component far away needs to change it. Then go to rung 2.

---

## 4. Rung 2: lift state up

"Lifting state up" means moving the value to the **closest common ancestor** of every component that reads or writes it, and passing it down as props.

```tsx
// Before: two siblings, each with its own copy — they cannot see each other.
function SearchBox() {
  const [query, setQuery] = useState('');
  return <input value={query} onChange={(event) => setQuery(event.target.value)} />;
}

function Results() {
  const [query] = useState(''); // a second, useless copy
  return <p>Results for “{query}”</p>; // always empty
}
```

```tsx
// After: the parent owns the value; children are told what to show and what to do.
function ProductsPage() {
  const [query, setQuery] = useState('');

  return (
    <section>
      <SearchBox value={query} onChange={setQuery} />
      <Results query={query} />
    </section>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} />;
}

function Results({ query }: { query: string }) {
  return <p>Results for “{query}”</p>;
}
```

### Line by line

- `const [query, setQuery] = useState('')` — the single source of truth moves to the parent. This is the whole change.
- `value={query}` + `onChange={setQuery}` — the child becomes **controlled**: it holds no state, it renders what it is given and reports what happened. That is the pattern Part 8, files 02–03 built an entire form on.
- The child's props are the contract: `value: string` in, `onChange: (value: string) => void` out. Nothing about *where* the value lives leaks into the child, which is what makes it reusable and testable in isolation.

### When lifting starts to hurt: prop drilling

Prop drilling is passing a prop through components that do not use it, purely to reach one that does.

```tsx
function App() {
  const [user, setUser] = useState<User | null>(null);
  return <Layout user={user} onSignOut={() => setUser(null)} />;
}

function Layout({ user, onSignOut }: { user: User | null; onSignOut: () => void }) {
  return (
    <div className="layout">
      {/* Layout does not care about either prop… */}
      <Sidebar user={user} onSignOut={onSignOut} />
    </div>
  );
}

function Sidebar({ user, onSignOut }: { user: User | null; onSignOut: () => void }) {
  return <footer>{user ? <button onClick={onSignOut}>Sign out</button> : <span>Guest</span>}</footer>;
}
```

Neither `Layout` nor `Sidebar` needs the user object; they are conduits. Two or three levels of this is normal and fine. The moment a prop is threaded through four or more layers, or through components that are clearly unrelated to the data, the shape of the app is telling you the value is *app-wide* and belongs in a different mechanism — context (file 02) or a store (files 04–05).

⚠️ Do **not** reach for global tools at the first sign of drilling. Lifting one more level is almost always cheaper than a new provider or a new store, and it keeps the data flow visible in the JSX. Climb one rung at a time.

---

## 5. Rung 3: `useReducer` — when updates have rules

`useState` is fine while a value changes one field at a time. It stops being fine when the *transitions* have rules: a value that can only go up if another value is set, a wizard that cannot skip steps, a cart where adding an existing item increments quantity instead of appending a line.

`useReducer` splits that in two: **state** (a value) and **dispatch** (a message about what happened). The rules live in one pure function.

```tsx
// src/part9/counter.ts — no React in this file at all
export interface CounterState {
  value: number;
  step: number;
  history: string[];
}

export type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'setStep'; step: number }
  | { type: 'reset' }
  | { type: 'loadedFromServer'; value: number };

export const initialCounterState: CounterState = { value: 0, step: 1, history: [] };

export function counterReducer(state: CounterState, action: CounterAction): CounterState {
  switch (action.type) {
    case 'increment':
      return { ...state, value: state.value + state.step, history: [...state.history, '+'] };
    case 'decrement':
      return { ...state, value: state.value - state.step, history: [...state.history, '-'] };
    case 'setStep':
      return { ...state, step: action.step };
    case 'reset':
      return initialCounterState;
    case 'loadedFromServer':
      return { ...state, value: action.value, history: [...state.history, 'server'] };
    default: {
      assertNever(action); // compile-time exhaustiveness, no runtime effect
      return state; // an unknown action never changes anything
    }
  }
}

export function selectCounterLabel(state: CounterState): string {
  return `${state.value} in steps of ${state.step}`;
}
```

```tsx
// Using it in a component
function Counter() {
  const [state, dispatch] = useReducer(counterReducer, initialCounterState);

  return (
    <div>
      <p>{selectCounterLabel(state)}</p>
      <button type="button" onClick={() => dispatch({ type: 'decrement' })}>
        −
      </button>
      <button type="button" onClick={() => dispatch({ type: 'increment' })}>
        +
      </button>
      <button type="button" onClick={() => dispatch({ type: 'setStep', step: 5 })}>
        Step 5
      </button>
      <button type="button" onClick={() => dispatch({ type: 'reset' })}>
        Reset
      </button>
    </div>
  );
}
```

### Line by line

- `state: CounterState, action: CounterAction` — two inputs, one output. No `this`, no closure over props, no fetching, no `Date.now()`. That is what makes the next six points true.
- `{ type: 'increment' }` — an **action** is a plain object describing *what happened*, in the past tense. `type: 'increment'` is a fact; `type: 'ADD_ONE_AND_SAVE'` is an instruction, which is a smell — the reducer decides what an increment means.
- `{ ...state, value: … }` — the reducer **returns the next state**; it never assigns to the argument. The spread copies, then the named field wins.
- `history: [...state.history, '+']` — nested arrays are copied too. A shallow spread alone would leave both states sharing one array, so an old history would change when the new one does.
- `case 'reset': return initialCounterState;` — returning a module constant is allowed *because nothing ever mutates it*. (If you are not sure nothing mutates it, return `{ ...initialCounterState, history: [] }`.)
- `assertNever(action)` — a helper whose parameter type is `never`. Add a sixth action to the union and forget to handle it, and this line stops compiling (`Argument of type … is not assignable to parameter of type 'never'`). At runtime it does nothing.
- `return state` — the reducer's contract for "not mine". Returning the **same reference** matters: React bails out of re-rendering when the state is identical, and Redux-style stores use that identity to decide whether anything changed.
- `selectCounterLabel` — a **selector**: a plain function from state to a value a component wants. Keeping it outside the component means every caller derives the label the same way.

### Measured: the reducer's promises, verified

Run it and watch the contract hold:

```text
$ npx tsx src/dev/state-probe.ts

=== A. A reducer is a function: state in, state out ===
   initial      {"value":0,"step":1,"history":[]}
   after +      {"value":1,"step":1,"history":["+"]}
   initial now  {"value":0,"step":1,"history":[]} — the argument was never touched
   label        1 in steps of 1
   setStep(10)  {"value":1,"step":10,"history":["+"]}
   three separate "+" calls from the same start: 1, 1, 1 (fresh object each time, so each one starts from 0)
   every call returns a new object: true
   against a frozen state: value 1 (it copies, never mutates)
   an unknown action returns the SAME reference: true
```

Four properties, each with a reason it matters:

1. **The input is never modified** (`initial now` is still `0`). Purity means you can call the reducer twice with the same arguments and compare the results — that is what makes it testable without React, and what lets React's StrictMode double-invoke it safely.
2. **Every call returns a fresh object** (`true`). New state, not edited state. React compares references, so a mutated-and-returned same object would be invisible to it.
3. **A frozen state does not break it** — the reducer copies instead of assigning. This is why `Object.freeze` in development is a useful bug detector (file 04 measures the store doing exactly that).
4. **An unknown action returns the same reference** (`true`). The reducer is a total function: any input, including nonsense, produces a valid state.

💡 Note what `three separate "+" calls` proves by contrast: a reducer has no memory of its own. Feed it the same state five times, get the same next state five times. All memory lives in the state value you pass in — which is exactly why time travel, undo, and replay become easy (file 03).

### When to choose `useReducer` over `useState`

| Situation | `useState` | `useReducer` |
| --- | --- | --- |
| One independent primitive (`isOpen`, `query`) | ✅ | overkill |
| Two or three primitives updated separately | ✅ (three `useState`s) | fine either way |
| Fields that must change together | ❌ easy to leave inconsistent | ✅ one action, one transition |
| The same transition is triggered from many places | ❌ logic duplicated per caller | ✅ one case in the switch |
| You want to log/undo/replay transitions | ❌ | ✅ actions are data |
| The rules deserve unit tests | ❌ tests go through the UI | ✅ test the function |
| Four or more `useState`s that are always updated together | ❌ | ✅ |

The last row is the practical trigger: when you find yourself writing `setA(...); setB(...); setC(...)` in three different handlers, you have a reducer that has not been written yet.

---

## 6. Rung 4: a store — the reducer, lifted out of React

`useReducer` keeps the state inside one component. To share it, you must lift it again — and the destination this time is not a parent component but a **store**: an object that holds state outside React, lets anyone read it, lets anyone send it actions, and notifies subscribers when it changes.

That description is the entire idea, and it is only about forty lines. Here is a working implementation — not a library, a teaching aid:

```ts
// src/part9/plainStore.ts — a hand-written Redux, so nothing is hidden
export type Reducer<S, A> = (state: S, action: A) => S;
export type Listener = () => void;
type UnknownDispatch = (action: unknown) => unknown;

export interface Store<S> {
  getState: () => S;
  dispatch: UnknownDispatch;
  subscribe: (listener: Listener) => () => void;
}

export type Middleware<S> = (store: Store<S>) => (next: UnknownDispatch) => UnknownDispatch;

export function createStore<S, A>(
  reducer: Reducer<S, A>,
  preloadedState: S,
  middlewares: Middleware<S>[] = [],
): Store<S> {
  let state = preloadedState;
  const listeners = new Set<Listener>();

  const baseDispatch = (action: unknown): unknown => {
    state = reducer(state, action as A);
    // Every subscriber is told "something may have changed"; each one calls
    // getState() and decides for itself whether the change matters.
    for (const listener of [...listeners]) listener();
    return action;
  };

  // applyMiddleware, minus the ceremony: build the dispatch function from the
  // inside out, so the left-most middleware sees the action first.
  const api: Store<S> = { getState: () => state, dispatch: (action) => dispatch(action), subscribe };
  const dispatch: UnknownDispatch = middlewares.reduceRight<UnknownDispatch>(
    (next, middleware) => middleware(api)(next),
    baseDispatch,
  );

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { getState: () => state, dispatch, subscribe };
}
```

A todo reducer to give it something to hold:

```ts
// src/part9/plainStore.ts (continued)
export interface Todo {
  id: string;
  title: string;
  done: boolean;
}

export type TodoAction =
  | { type: 'todos/added'; id: string; title: string }
  | { type: 'todos/toggled'; id: string }
  | { type: 'todos/removed'; id: string };

export const initialTodos: Todo[] = [];

export function todosReducer(state: Todo[] = initialTodos, action: TodoAction): Todo[] {
  switch (action.type) {
    case 'todos/added':
      return [...state, { id: action.id, title: action.title, done: false }];
    case 'todos/toggled':
      return state.map((todo) => (todo.id === action.id ? { ...todo, done: !todo.done } : todo));
    case 'todos/removed':
      return state.filter((todo) => todo.id !== action.id);
    default:
      return state;
  }
}
```

### Line by line

- `let state = preloadedState` — the store is a closure over one variable. That variable *is* the application state; everything else is bookkeeping.
- `new Set<Listener>()` — subscriptions. A `Set` (not an array) makes `unsubscribe` a one-line `delete` and silently ignores double-subscribing the same function.
- `state = reducer(state, action)` — the only place in the app where state is replaced. Every change, without exception, goes through the reducer. This single line is what makes the state machine *knowable*: if it is not in the reducer, it cannot change.
- `for (const listener of [...listeners]) listener()` — notify everyone. Copying the set with `[...listeners]` means a listener that unsubscribes during notification cannot corrupt the loop.
- `middlewares.reduceRight(...)` — middleware are composed from the right, so the **left-most one in the array runs first**. `[logger(), thunk()]` gives: logger sees the action → thunk sees it → reducer sees it.
- `api.dispatch` is the *outermost* dispatch, not `baseDispatch`. That is why a middleware (or a thunk) that calls `dispatch` re-enters the whole chain rather than jumping to the reducer.

And two middleware, to show what they actually are:

```ts
// src/part9/plainStore.ts (continued)
/** Middleware that logs every action and whether the state changed. */
export function logger<S>(label: string): Middleware<S> {
  return (store) => (next) => (action) => {
    const before = store.getState();
    const result = next(action);
    const after = store.getState();
    console.log(`${label} ${String((action as { type: string }).type)} changed=${String(before !== after)}`);
    return result;
  };
}

/** Middleware that lets dispatch() accept a function — this is what a thunk is. */
export function thunk<S>(): Middleware<S> {
  return (store) => (next) => (action) => {
    if (typeof action === 'function') {
      return (action as (dispatch: Store<S>['dispatch'], getState: () => S) => unknown)(store.dispatch, store.getState);
    }
    return next(action);
  };
}
```

### Measured: the store doing its job

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

What each line shows:

- **Five `dispatch` calls, five notifications** — and the second listener (which reads `state.length`) shows the state *at the moment of each notification*: `1, 2, 2, 1, 2`. `toggled` did not change the length, `removed` brought it back to 1, and the thunk's added todo made it 2. Subscribers are called after the reducer has run, so they always see the new state — there is no "half-updated" moment.
- **`[logger] undefined changed=false`** — that is the thunk *function* itself passing through. The logger sits outside the thunk middleware, so it sees a function with no `type` (hence `undefined`) and observes that state did not change. A nice accident that makes middleware order visible.
- **`[logger] todos/added changed=true` a sixth time** — the thunk's own `dispatch` goes through the *whole* chain again, so the logger sees the resulting action too. Middleware only wraps actions that pass through it.
- **`changed=false`** is not an error: it is the check that makes structural sharing visible. A reducer that returns the same reference (see section 5) means "nothing changed", and a store can skip notifying subscribers — which is how a well-written store avoids unnecessary re-renders (file 04 shows Redux Toolkit doing exactly this).

💡 This is all Redux *is*: a store that is one reducer plus a listener list. Files 03 and 04 add the parts that make it pleasant at scale — typed hooks, `createSlice`, Immer, devtools — but if the forty lines above make sense, Redux stops being magic.

---

## 7. Rung 5: context — sharing without prop drilling

Context does not hold state. It **transports** a value from a provider to any component below it, skipping the components in between. That distinction is the source of most context confusion, and file 02 is devoted to it: how to combine context with `useReducer` for app-wide state, why a context value must be stable, how to split contexts by concern, and how to measure which consumers re-render.

For now, the one-sentence version: **context is a delivery mechanism; the state still lives in a `useState`/`useReducer`/store at the top.**

---

## 8. Rung 6: an external store

A store created in a module and read through `useSyncExternalStore` (files 05 and 06) has properties a context cannot match:

- **No provider.** The store is imported, so there is no pyramid to nest and no "component used outside `<Provider>`" crash.
- **Selector-level subscriptions.** A component subscribes to *the slice it renders*, so a change to an unrelated slice does not re-render it (measured in file 05: the Add button re-renders 0 times while the badge re-renders once).
- **Readable outside React.** `store.getState()` works in a router loader, a WebSocket handler, an `await` after an unmount — anywhere.
- **Writable outside React.** `store.dispatch(...)` / `setState(...)` from a plain module, a timer or a test, with React updating because it subscribed.

The price: an extra library, a second place (besides components) where state can change, and a store file that needs naming, typing and discipline. Files 03–05 cover the three common choices, with the trade-offs spelled out.

---

## 9. Server state is not client state

This is the rung people skip, and skipping it is why so many React apps feel slow and buggy.

The product list in the shop admin is not "the app's state". It is a **copy** of something the server owns. Four consequences follow, and none of them are solved by putting the copy in a store:

1. **It can be stale.** Someone else edited a product a minute ago. Your copy has no way to know.
2. **Two screens can disagree.** The list and the detail page hold two copies at two different ages.
3. **It needs its own lifecycle.** Loading, error, retry, refetch, cache expiry, deduplication of identical requests (Part 7 files 09–10 built all of that by hand).
4. **Mutations invalidate it.** After a successful `POST`, every cached list containing that row is now wrong.

Files 05 and 06 of Part 7 *did* build that by hand — deliberately, so the machinery is visible. File 06 of this part replaces it with a library that has already solved it, and shows the measured difference (`staleTime`, request deduplication, invalidation, optimistic updates, retry with backoff).

⚠️ Putting server data in a Redux store usually means writing a cache by hand: `isLoading`, `error`, `lastFetchedAt`, `invalidateAfterMutation`, plus deduplication of in-flight requests. It can be done — and if a codebase already has Redux, RTK Query (file 04) is the sane version. But "Redux for the server data" is not a default; it is a choice with a real cost.

---

## 10. URL state

Some state does not belong in memory at all. Ask: **"if the user copies the address bar right now, should the recipient see what they see?"**

| State | Belongs in the URL? |
| --- | --- |
| `?category=audio&sort=price&page=2` | ✅ yes — shareable, bookmarkable, survives refresh |
| `/products/p-lamp` | ✅ yes — the identity of the resource |
| The text in a search box *while typing* | ❌ no — would fire a history entry per keystroke |
| The committed search term (after Enter) | ✅ yes — that is the search the results show |
| A modal's open state | ❌ usually not (except as a deep link) |
| The cart | ❌ no — it is not addressable; a store or the server owns it |

Reading and writing it is React Router's job (Part 6, files 04–05): `useSearchParams` returns a `URLSearchParams` and a setter that updates the address bar without a page reload. The payoff is a browser back button that works, links that can be pasted into chat, and one less provider in the tree.

---

## 11. Derived state: store less, compute more

Every value you store is a value you must remember to update. Every value you *derive* updates itself.

```tsx
// src/part9/cartModel.ts
export interface CartSummary {
  lines: number;
  units: number;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  couponCode: string | null;
}

export function summarize(items: CartItem[], coupon: string | null = null): CartSummary {
  const units = items.reduce((total, item) => total + item.qty, 0);
  const subtotalMinor = items.reduce((total, item) => total + item.qty * item.priceMinor, 0);
  // The customer gets the better of the two discounts, never both.
  const rate = Math.max(units >= BULK_UNITS ? BULK_RATE : 0, couponRate(coupon));
  const discountMinor = Math.round(subtotalMinor * rate);
  return {
    lines: items.length,
    units,
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
    couponCode: coupon,
  };
}
```

One function, used by all three cart implementations in this part (context, Zustand, Redux Toolkit) — so the three cannot drift. Section 3 of file 04 shows the version of this idea that costs something: a **memoised selector**, which caches the result of an expensive derivation and recomputes only when its inputs change.

The rule of thumb:

1. **Derive by default** — compute it in render, or in a plain function.
2. **Memoise** when the computation is measurably expensive or the result is passed to a memoised child (Part 10, file 03 covers when that actually matters).
3. **Store** only when the value is an *input* to the system: someone types it, the server sends it, the user chooses it.

---

## 12. The decision table

This is the table to come back to. Read the "kind of data" column, and the other three columns are decided for you.

| Data | Where it lives | Tool | Why |
| --- | --- | --- | --- |
| A dropdown's open/closed flag | that component | `useState` | one reader, one writer |
| A form's field values mid-edit | the form component | `useState` / react-hook-form | it is temporary and local (Part 8) |
| Which row is selected in a table | the table | `useState` | local UI state |
| Two siblings needing the same value | their parent | lifted `useState` | cheapest correct answer |
| A wizard's step + partial answers | the wizard | `useReducer` | transitions have rules |
| Theme, locale, toast queue, current user | app root | context + a hook | low-frequency, read by many |
| The cart (used by header, cart page, checkout) | a module-level store | Zustand or RTK (files 04–05) | written from many places, read in many places, survives navigation |
| Catalogue, order list, product detail | a query cache | TanStack Query (file 06) | server-owned, needs staleness handling |
| Filters, sort, page, active tab | the URL | `useSearchParams` (Part 6) | shareable, bookmarkable |
| Feature flags from the server | a query + context | TanStack Query + a small context | fetched, then read everywhere |
| Anything computed from the above | nowhere | derive it | two copies drift |

Three sanity checks to apply before adding a tool:

1. **Who writes it?** One place → local. Many places → lifted, reducer, or store.
2. **Who owns the truth?** The server → server cache. The user's session → client store. The URL → the URL.
3. **Would the app survive if this value were derived instead of stored?** If yes, derive it.

---

## 13. The shop admin, annotated

The lab app this part is built on has exactly one of each, and naming them is the best way to internalise the table:

```text
src/
├── App.tsx                      ← providers live here (auth + browser router)
├── routes/
│   ├── ProductsPage.tsx         ← URL state: ?category=&page= (useSearchParams)
│   ├── ProductDetailPage.tsx    ← route param (:id) → server state (query)
│   └── LoginPage.tsx            ← form state (controlled inputs)
├── auth/authContext.tsx         ← context: user + signIn/signOut, backed by localStorage
├── part9/
│   ├── cartStore.ts             ← Zustand store: the cart (file 05)
│   ├── cartSlice.ts             ← the same cart as a Redux Toolkit slice (files 03–04)
│   ├── cartReducer.ts           ← the same cart as a plain reducer (file 02)
│   ├── useProducts.ts           ← server state: useQuery / useMutation (file 06)
│   └── CatalogPanel.tsx         ← a modal's isOpen would live here (useState)
└── api/                         ← transport only: fetch calls, no state
```

Notice what is *not* in a store: the product list (server state, file 06), the filters (URL state), the login form's fields (form state), and every modal flag (local state). The cart is in a store because it is written from the product list, the detail page and the cart page, and read by the header on every screen — three writers, many readers, and it must survive navigation. That is the test, and the cart passes it while the other four fail it.

**What the interview answer looks like:** *"Local UI state stays in the component; shared session state goes in a store; anything the server owns goes in a query cache because it needs staleness and invalidation, not just storage; anything shareable goes in the URL. A reducer for state whose transitions have rules, context to deliver state that is read widely and changes rarely, and a store when many places write the same state."*

---

## 14. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Storing derived values (`total`, `count`, `filtered`) | the copy drifts from the source; a stale total shows wrong money | derive at render; memoise only if measured |
| 2 | Reaching for a global store for a modal flag | four files and an action type for a boolean; the modal is now untestable alone | `useState` in the component that renders it |
| 3 | Lifting state higher than needed | every prop change re-renders the whole subtree; the tree becomes a relay | lift to the closest common ancestor, no higher |
| 4 | Passing a setter down instead of a named callback (`onSignOut`) | children learn the shape of your state; refactors ripple everywhere | pass intent-named callbacks |
| 5 | Putting server data in a client store by hand | you must write dedup, staleness, retry and invalidation yourself — and usually get 3 of 4 wrong | a query cache (file 06) |
| 6 | One enormous context object | every change re-renders every consumer (measured in file 02: a coupon change re-renders the cart badge) | split contexts by concern |
| 7 | New value object on every provider render | consumers re-render for changes they do not read | memoise the value, or split the contexts |
| 8 | Mirroring props into state (`const [x, setX] = useState(props.x)`) | the copy ignores later prop changes | use the prop; lift if it must change |
| 9 | Multiple `useState`s that must change together | an impossible state appears (tracked with no tracking number) | one reducer action, or one object state |
| 10 | Mutating state (`.push`, `obj.field = x`) | React sees the same reference and skips the re-render | copy: `[...items, item]`, `{ ...obj, field }` |
| 11 | Filters in component state | share, refresh and back-button all lose them | `useSearchParams` |
| 12 | Adding a state library before measuring the problem | more indirection, no less pain | climb one rung at a time; measure first |

---

## 15. Best practices

1. **Start local.** Colocate state next to the JSX that renders it, and move it only when a second reader or writer appears.
2. **One source of truth per fact**, always. If two places can hold the same information, one of them is a bug waiting for a trigger.
3. **Derive, then memoise, then store** — in that order of preference.
4. **Name state after the domain** (`cart`, `productFilters`, `checkoutStep`), not after the mechanism (`data`, `globalState`, `storeA`).
5. **Model transitions, not fields.** `{ type: 'checkout/stepCompleted', step: 'address' }` beats three boolean flags.
6. **Keep reducers pure**: no fetching, no `Date.now()` inside a `case`, no `Math.random()`. Pass values in as action payloads.
7. **Return the same reference for "nothing changed".** It is the cheapest optimisation available and every store relies on it.
8. **Put server data in a server cache** and client session data in a client store; do not mix them in one container.
9. **Let the URL hold what should be linkable.**
10. **Justify every global tool in the PR description** with the number of writers and readers, or with a measurement.

---

## 16. Practice

### Beginner

1. Classify each item as **local / shared client / server / URL / form** state, and say where it should live: (a) the open product's id on a detail page, (b) the category filter, (c) the product list, (d) the quantity typed in a form, (e) the cart, (f) whether the "Add to cart" toast is visible.
2. Take this component and remove its derived state:

   ```tsx
   function CartBadge() {
     const [items, setItems] = useState<CartItem[]>([]);
     const [count, setCount] = useState(0);
     const [hasItems, setHasItems] = useState(false);
     function add(item: CartItem) {
       const next = [...items, item];
       setItems(next);
       setCount(next.length);
       setHasItems(next.length > 0);
     }
     return <span>{hasItems ? `${count} items` : 'Cart is empty'}</span>;
   }
   ```
3. Write the `CartAction` union and reducer for a cart with: add an item, remove an item, set a quantity, apply a coupon, clear. Keep it pure.

### Intermediate

1. Convert a three-`useState` "checkout wizard" (`step`, `address`, `paymentMethod`) into one `useReducer` with the rule "you cannot reach `payment` before `address` is filled". Then write two reducer tests that need no React.
2. Given this prop chain — `App → Layout → Sidebar → UserMenu → SignOutButton` — decide whether to keep drilling, lift further, or move the value to a store. Justify with the number of writers and readers, and say what you would measure before deciding.
3. Add a `logger` middleware to `plainStore.ts` that prefixes each line with a sequence number, and use it to explain in your own words why the thunk's inner `dispatch` is logged twice in section 6's transcript — once as a function, once as the resulting action.

### Challenge

1. Implement **undo/redo** for the cart using the `history: CartAction[]` idea from the counter: keep `past`, `present`, `future`; make `undo()` and `redo()` plain functions; and decide what `undo` should do about an action that has already been sent to the server (this is a real product decision with no single right answer — argue both sides).
2. Design the state for a page of a shop with: a search box (debounced), filters, sort, pagination, a "compare" list of at most four products, and a "recently viewed" strip that persists across sessions. Name every piece of state, its kind, its home, and the one thing that would break if you put it in the wrong bucket.
3. Take an app you have written (or the Part 7 CRUD app) and inventory its state with the table from section 12. For every row that is in the wrong bucket, describe the symptom it would cause in production.

---

## 17. Solutions

### Beginner

1. (a) **URL** — it is the route's own identity; with a router, use the `:id` param. (b) **URL** — shareable, and the back button should work. (c) **Server** — a query cache; it is a copy of something the server owns. (d) **Form** — local to the form, and it must not be lost on a sibling re-render. (e) **Shared client** — many writers, read on every screen, must survive navigation: a store. (f) **Local UI** — one component renders it and nothing else reads it.
2. Everything except `items` is derived:

   ```tsx
   function CartBadge() {
     const [items, setItems] = useState<CartItem[]>([]);
     const count = items.reduce((units, line) => units + line.qty, 0);
     const hasItems = count > 0;
     function add(item: CartItem) {
       setItems((current) => [...current, item]);
     }
     return <span>{hasItems ? `${count} items` : 'Cart is empty'}</span>;
   }
   ```

   Note the second fix as well: `setItems((current) => …)` instead of closing over `items`. The functional form reads the freshest state, which is what makes it safe in event handlers and effects.
3. ```ts
   export type CartAction =
     | { type: 'cart/itemAdded'; item: CartItem }
     | { type: 'cart/itemRemoved'; id: string }
     | { type: 'cart/quantitySet'; id: string; qty: number }
     | { type: 'cart/couponApplied'; coupon: string | null }
     | { type: 'cart/cleared' };
   ```
   Each case returns a new object; `itemAdded` folds an existing id into `qty + 1`; `quantitySet` with `qty <= 0` removes the line (one rule, one place — not in the caller). This is exactly `src/part9/cartReducer.ts`, which file 02 uses in a provider.

### Intermediate

1. The reducer holds `{ step, address, paymentMethod }` with `case 'wizard/next'` refusing to advance past `details` until `address.city` is non-empty, plus `case 'wizard/back'`. The two tests are `expect(wizardReducer(state, { type: 'wizard/next' })).toBe(state)` (same reference: nothing changed) and `expect(wizardReducer(filledState, { type: 'wizard/next' }).step).toBe('payment')`. No `render`, no `screen`, no jsdom — because the rule is not in a component.
2. Keep drilling if there are one writer and one reader (`UserMenu` writes, `SignOutButton` reads — actually just one writer), and the intermediate components are *layout* components that already receive many props. Lift further only if `App` is not the natural owner; move to context/a store when a third consumer appears, when the chain is longer than about three levels, or when the intermediate components are reused in contexts where the props are meaningless. Measure before deciding: React DevTools' "Highlight updates" shows whether the drilling causes re-renders of the conduits — if `Layout` re-renders on every keystroke elsewhere in the app, that is the evidence, not the level count.
3. The `logger` wraps `next`, which for `[logger, thunk]` means: logger → thunk → reducer. A function action reaches the logger first (which logs it as `undefined changed=false`, because the thunk has not run it yet), then the thunk executes it; the function's inner `dispatch` re-enters the *outermost* dispatch, so the logger sees the resulting object action too, and logs it as `todos/added changed=true`. The lesson: middleware wrap the dispatch function, so a nested dispatch is a second trip through the whole chain.

### Challenge

1. Keep `{ past: CartAction[], present: CartState, future: CartAction[] }`; `undo()` pops from `past`, pushes `present`'s producing action onto `future`, and re-applies `past` from the initial state (or keeps inverse actions — simpler, but two places to maintain). The server question has two defensible answers: **optimistic undo** (send a compensating request, e.g. re-add the removed line — fast, but the undo can fail, so the UI must be able to show "undo failed"), or **hidden undo** (delay the write for a few seconds so most undo actions never hit the network — no failure mode, but a window where the user's action is not durable). What you must not do is undo only locally: the next refetch will bring the deleted row back, and the user will have watched the app contradict itself.
2. Search text → **URL** (shareable) but debounce nothing (the *committed* term is what goes in the URL); filters/sort/page → **URL**; compare list → **shared client** (a store, because it is written from list rows and read in a sticky bar; and it must survive navigation); recently viewed → **shared client + persistence** (a store with a `persist` middleware, or the server if it should follow the account); the fetched product pages → **server cache**, keyed by query + filters. The thing that breaks if misplaced: compare in local state disappears on navigation, recent views in a query cache evict after `gcTime`, and filters in local state break the back button.
3. The symptoms to look for: a stale total (derived value stored), a lost filter on refresh (URL state in `useState`), a spinner that never clears (server state without an error path), two screens disagreeing about a price (server copies in two stores), and a modal that cannot be tested without the whole app (local state lifted too far).

---

## 18. Summary

- **State is data that must survive a re-render.** Anything computable from other data is *derived*, and storing it creates a second source of truth that will drift.
- There are **five kinds of state** — local UI, shared client, server, URL, form. Naming the kind decides the tool, and the biggest wins come from putting server data in a cache and shareable data in the URL.
- **The progression is a ladder, not a requirement**: `useState` → lift → `useReducer` → context → external store → server cache. Climb one rung at a time, and only when a writer/reader appears that the current rung cannot serve.
- **`useReducer` is the right tool when transitions have rules.** Measured: it never mutates its input, always returns a fresh object, works against a frozen state, and returns the *same reference* for an unknown action.
- **A store is a reducer plus a listener list.** Forty lines make the whole idea visible: one state value, one `state = reducer(state, action)` line, a `Set` of listeners, and middleware composed around dispatch.
- **Middleware are wrappers around dispatch** — measured: the logger sees a thunk as `undefined changed=false` before the thunk runs, then sees the inner action as `todos/added changed=true` because a nested `dispatch` re-enters the whole chain.
- **Context transports, a store holds.** Context is the right answer for low-frequency, widely-read values; a store is the right answer when many places write the same state and subscriptions must be selective (files 02, 05).
- **Server state is not client state**: it can be stale, it is shared, it needs loading/error/retry/invalidation. File 06 replaces the hand-written version from Part 7 with a library that already does it.
- Every "where should this live?" question has three answers to check: **who writes it, who owns the truth, and can it be derived instead?**

---

**What's next →** [`02-context-api.md`](./02-context-api.md) takes the rung this file left as a sentence: context as a state tool. You will see the same cart published four ways — a naive value, a memoised value, split state/dispatch, and split by concern — and measure exactly which consumers re-render in each case, including the measurement that a coupon change wakes up a badge that never reads the coupon, and the fix that stops it.
