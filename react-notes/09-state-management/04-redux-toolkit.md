# 04 — Redux Toolkit: Slices, Immer, Typed Hooks and Thunks

> **Part 9 · State Management · File 4 of 6**

Why this file exists: file 03 built Redux by hand so the mechanism would be visible, and the price of that visibility was boilerplate — action types, action creators, a `switch`, a listener list, a bridge to React. Redux Toolkit (RTK) is the official answer to that price: it is Redux with those parts generated, plus two ergonomic upgrades that sound like magic until you see the measurement (Immer's "safe mutation" and `.withTypes()` hooks). This file writes the same shop-admin cart with `configureStore`, `createSlice`, memoised selectors and `createAsyncThunk`, and measures what changes: which components re-render, what Immer actually does to your objects, and what the development checks catch. It ends with an honest look at RTK Query — the part of RTK that overlaps with file 06.

The transcripts quoted below come from `npx tsx src/dev/state-probe.ts` (no React) and `npx tsx --tsconfig tsconfig.app.json src/dev/run-rtk-probe.tsx` (with React).

---

## 1. What Redux Toolkit is

RTK is **the recommended way to write Redux**, published by the Redux team, and it removes four of the five things people complain about:

| The complaint | Plain Redux | Redux Toolkit |
| --- | --- | --- |
| "Too much boilerplate" | action types + creators + reducer, three times over | one `createSlice` generates all of it from a `reducers` object |
| "I always forget to copy the array" | you write `[...state.items, item]` by hand | you write `state.items.push(item)` and Immer copies |
| "`useSelector`/`useDispatch` are untyped" | `as RootState` casts scattered around | `useSelector.withTypes<RootState>()` once, in one file |
| "Async needs a library" | `redux-thunk` installed and wired separately | `createAsyncThunk` is built in |
| "Immutable update helpers are fiddly" | `immutability-helper`, `lodash/fp` | Immer is built in |

What it does **not** change: the store, actions, reducers, dispatch, middleware and selectors from file 03. RTK is that same machine with generators bolted on. Everything you learned about purity, identity and one-way flow still applies — including the two dev-time checks that this file measures.

⚠️ Version note: RTK 2.x (the version in this lab, 2.12.0) dropped the `createStore`-era APIs, made `configureStore` the only entry point, and — relevant if you read older tutorials — the `redux-thunk` extra argument and `createSlice.extraReducers` object syntax are the *old* spellings. `builder.addCase(...)` inside `extraReducers` is current.

---

## 2. Install, create, provide

```bash
npm install @reduxjs/toolkit react-redux
```

```ts
// src/part9/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { cartReducer } from './cartSlice';
import { productsReducer } from './productsSlice';

export const store = configureStore({
  reducer: {
    cart: cartReducer, // state.cart
    products: productsReducer, // state.products
  },
  // Middleware is on by default (thunk + dev-only immutability/serialisability
  // checks); add yours with concat, never by replacing the array.
});

// These three types are the whole reason a typed Redux app is pleasant.
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './part9/store';

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <App />
  </Provider>,
);
```

### Line by line

- `reducer: { cart, products }` — an object of reducers. `configureStore` composes them with `combineReducers` for you and names the keys: `rootReducer.cart === cartReducer`. The key is the slice's address in the state tree, and it is what selectors walk (`state.cart`, `state.products`).
- `configureStore` also installs, with no configuration: `redux-thunk`, an immutability check that freezes state in development (section 5), and a serialisability check that warns about non-serialisable actions and state (section 5).
- `type RootState = ReturnType<typeof store.getState>` — the type of the whole tree, *derived from the store itself*, so it cannot drift. Never write the root state type by hand; the store is the source of truth.
- `Provider store={store}` — the same context trick file 03 measured: the project's one context whose value never changes, so no re-render is ever caused by it.

**Why the store lives in a module rather than in a component:** the router, a WebSocket handler, a test and a debugging session all need `store` without being inside React. Compare with file 05's Zustand store: the same choice, made by the same reasoning.

---

## 3. `createSlice`: state, actions and reducer in one file

```ts
// src/part9/cartSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CartItem } from './cartModel';

export interface CartState {
  items: CartItem[];
  coupon: string | null;
}

const initialState: CartState = { items: [], coupon: null };

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    itemAdded(state, action: PayloadAction<CartItem>) {
      const line = state.items.find((item) => item.id === action.payload.id);
      if (line) line.qty += action.payload.qty; // ← looks like a mutation. It is not.
      else state.items.push(action.payload);
    },
    itemRemoved(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },
    quantitySet(state, action: PayloadAction<{ id: string; qty: number }>) {
      const { id, qty } = action.payload;
      if (qty <= 0) state.items = state.items.filter((item) => item.id !== id);
      else {
        const line = state.items.find((item) => item.id === id);
        if (line) line.qty = qty;
      }
    },
    couponApplied(state, action: PayloadAction<string | null>) {
      state.coupon = action.payload;
    },
    cartCleared(state) {
      state.items = [];
      state.coupon = null;
    },
  },
});

export const { itemAdded, itemRemoved, quantitySet, couponApplied, cartCleared } = cartSlice.actions;
export const cartReducer = cartSlice.reducer;
```

### Line by line

- `name: 'cart'` — the prefix for every generated action type: `itemAdded` becomes `'cart/itemAdded'`. The naming convention from file 03, applied for you.
- `reducers: { itemAdded(state, action) { … } }` — a plain object of small functions, each one a *case* of the reducer you would have written by hand. RTK turns each key into: an action creator (`itemAdded(item)` → `{ type: 'cart/itemAdded', payload: item }`) and a `case` in the combined reducer.
- `PayloadAction<CartItem>` — the action type, typed at the payload. `action.payload.id` is a `CartItem`, so a typo is a compile error instead of `undefined` at runtime.
- `state.items.find(...)` then `line.qty += 1` — this **is** a mutation of `line`, and it is safe: Immer passes the reducer a draft, records the writes, and produces a new object from the old one plus the changes. Section 4 shows what actually comes out.
- No `return` anywhere — with Immer you *may* return a new state instead (both styles work), but you may not do both (section 4).
- `export const { itemAdded, … } = cartSlice.actions` — destructured action creators. Components import `itemAdded`, not `'cart/itemAdded'`, so a rename is a compile error in one place.
- `export const cartReducer = cartSlice.reducer` — the reducer for `configureStore`. Note the three exports: `cartSlice.actions`, `cartSlice.reducer`, and the slice's own `name`/`selectSlice` helpers.

💡 Compare the size: file 03's hand-written reducer plus its action creators is about 60 lines for the same cart; the slice is 45 and has no `switch`, no string literals and no creator functions to write.

---

## 4. Immer: what "safe mutation" actually does

Immer is the `produce` function behind every RTK slice. It takes a value, gives your function a *draft* (a Proxy that records writes), and returns a new value when the function finishes — copying only the paths you touched.

```ts
import { produce } from 'immer';

const cart = { items: [{ id: 'p-lamp', name: 'Desk Lamp', priceMinor: 129_950, qty: 1 }], coupon: null };
const next = produce(cart, (draft) => {
  draft.items[0].qty = 2; // a write, recorded on the proxy
});

console.log(cart.items[0].qty); // 1 — the original is untouched
console.log(next.items[0].qty); // 2 — the copy has the change
console.log(cart.items === next.items); // false — the changed path was copied
```

### Measured: the identity rules

```text
=== C. Redux Toolkit: the same store, less code ===
   after 3 dispatches: Desk Lamp ×1, Wireless Mouse ×1, Keyboard ×1
   the listener was notified 1 time(s) for 1 dispatch
   the items ARRAY is a new array: true
   but the untouched Desk Lamp object is reused: true
   and the untouched Wireless Mouse object is reused: true
   mutating state directly throws in dev: Cannot add property 3, object is not extensible
```

Three facts, each with a consequence:

1. **The array is new** — the UI updates, because the store's reference changed (file 03, section 5).
2. **The untouched objects are reused** — structural sharing. Every `React.memo`, every `useSelector` comparison and every memoised selector built on those objects keeps working, for free.
3. **A direct mutation outside a reducer throws in development** — `state.cart.items.push(...)` from anywhere, including a component, hits a frozen object: `Cannot add property 3, object is not extensible`. React's rule ("never mutate state") is now *enforced* rather than advised. In production the freeze is off (for speed), so the error you see in dev protects you from the bug you would otherwise ship.

### The rules of Immer inside a reducer

| You want to | Write |
| --- | --- |
| Change one field | `state.coupon = 'SAVE20'` |
| Add to an array | `state.items.push(item)` |
| Remove from an array | `state.items = state.items.filter(...)` or `state.items.splice(index, 1)` |
| Update one item in an array | find it and assign: `line.qty += 1` |
| Change a nested object | assign through the path: `state.user.address.city = 'Pune'` |
| Replace everything | `return newStateFromScratch` — returning is allowed |

⚠️ **Never both return and mutate.** Returning a value tells Immer "this is the new state"; if you also mutated the draft, that work is discarded (and RTK's checks warn about it). Pick one style per reducer — the common convention is mutation for updates, `return` only when you are building a fresh value.

⚠️ **Nothing outside the reducer may hold a draft.** Once the reducer returns, the draft is revoked; touching it later throws `Cannot perform 'get' on a proxy that has been revoked`. This catches a real bug: an object from `state` stored in a variable, then mutated in an event handler months later.

---

## 5. The two development checks, measured

```text
   mutating state directly throws in dev: Cannot add property 3, object is not extensible
   a Date inside an action → 2 dev warning(s), first one:
     A non-serializable value was detected in an action, in the path: `payload.when`. Value: Sat Sep 19 2026 11:55:33 GMT+0000 (Coordinated Universal Time)
```

Both checks come from `configureStore`, they run in development only, and they are the reason the 40-line hand-written store in file 03 is a teaching aid rather than a substitute.

| Check | Catches | What to do |
| --- | --- | --- |
| **Immutability** (freeze + `Immer`'s revoked drafts) | `state.x = y` outside a reducer; mutating a slice of state in a component; keeping a draft | move the change into a reducer; copy before editing |
| **Serialisability** | `Date`, `Map`/`Set`, class instances, functions, promises, DOM nodes in actions or state | pass an ISO string or a timestamp; construct the object where it is displayed |

When the warning is genuinely wrong (a deliberately non-serialisable value, e.g. a large file handle in a dev-only slice), silence it narrowly:

```ts
configureStore({
  reducer: rootReducer,
  middleware: (getDefault) => getDefault({ serializableCheck: { ignoredActionPaths: ['payload.fileHandle'], ignoredPaths: ['uploads.blob'] } }),
});
```

⚠️ Ignore it *narrowly*, never globally. The check exists because replay, persistence and devtools all assume plain data — silencing it everywhere means the first bug it would have caught arrives in production instead.

---

## 6. Typed hooks, written once

```ts
// src/part9/store.ts
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

```tsx
// anywhere in the app
const units = useAppSelector((state) => summarize(state.cart.items).units); // state is RootState
const dispatch = useAppDispatch(); // typed: knows every action creator's payload
```

### Line by line

- `withTypes<T>()` is react-redux v9's way to bind a hook's type parameter once and produce a new hook. `useAppSelector(state => state.cart… )` is fully inferred; a typo in a slice name is a compile error, and editors autocomplete the whole state tree.
- `useAppDispatch()` returns a `Dispatch<AppDispatch>` — a dispatch that knows your thunks, so `dispatch(fetchProductsPage({ page: 1 }))` type-checks while `dispatch(fetchProductsPage('page 1'))` does not.
- **Define these two once, in the store file, and import them everywhere.** The alternatives you will see in the wild are `useSelector((state: RootState) => …)` at every call site (repetition) and `createDispatchHook`/`createSelectorHook` with a custom context (needed only for a second store, which you almost never want).

⚠️ `useAppDispatch` must not be confused with `store.dispatch`. Use the hook inside components (it reads the store from context, so tests can provide a different one); use `store.dispatch` outside React (a router loader, a service module). Both are typed the same way here, which is the point of `AppDispatch`.

---

## 7. Selectors and memoisation, measured

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
=== F. Memoised selectors, measured ===
   selectCartNames called twice: 1 run(s), same array? true
   after adding an item: 2 run(s) — a real change re-runs it
   names: Desk Lamp, Wireless Mouse
   selectCartSummary called twice → 1 run(s), same object? true
```

`createSelector` (re-exported by RTK from Reselect) wraps a function with an input-selector list and a one-entry cache: the body runs when any input's identity changes. The measurements show both halves of the contract — cached for repeated calls, re-run on a real change.

**Why it matters in Redux specifically:** `useSelector` re-runs your selector on *every* store change (all slices), and compares the result. A selector that returns a fresh object every time therefore re-renders its component on every unrelated change. A memoised selector returns the *same object* when nothing that matters changed, so React skips it.

```tsx
// ✅ memoised: the component re-renders when the cart really changed
const summary = useAppSelector(selectCartSummary);

// ✅ or avoid the object entirely: primitives compare with Object.is
const units = useAppSelector((state) => summarize(state.cart.items).units);

// ❌ new object on every store change → re-render (plus a dev warning)
const summary = useAppSelector((state) => ({ lines: state.cart.items.length, total: summarize(state.cart.items).totalMinor }));
```

**Parameterised selectors — the classic trap.** A selector that needs an argument cannot be a module constant:

```tsx
// ❌ a new function per render → cache misses, and react-redux warns
const product = useAppSelector((state) => state.products.items.find((p) => p.id === id));

// ✅ 1. select the collection, filter in the component (fine — filtering is cheap)
const items = useAppSelector(selectProducts);
const product = items.find((p) => p.id === id);

// ✅ 2. or memoise per id with a factory
const makeSelectProduct = (id: string) => createSelector([selectProducts], (items) => items.find((p) => p.id === id));
function useProduct(id: string) {
  const selectProduct = useMemo(() => makeSelectProduct(id), [id]);
  return useAppSelector(selectProduct);
}
```

---

## 8. What this does to re-renders, measured

```text
=== A. The provider injects the store through context ===
   <Provider store={store}> passes the store down with a context —
   useAppSelector/useAppDispatch read it; components never import it

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

Compare with file 02's context measurements — the same app, the same cart, and this is where a store beats context:

| Behaviour | Context (file 02) | Redux Toolkit (measured here) |
| --- | --- | --- |
| Dispatch-only component re-renders on a cart change | yes in the naive tree (`NaiveAddButton=1`), no in the split tree | no (`RtkAddButton: 0`) |
| A coupon change re-renders a component that reads only `items` | yes (`ContextCartBadge=1`) | no (badge absent from the transcript) |
| A change in an unrelated slice re-renders cart components | yes (one provider value) | no (`(no renders)`) |
| Two dispatches in one tick | one commit per dispatch per consumer | one render, batched |

The mechanism, in one sentence: **each component subscribes to a projection of the state, not to the state.** That is only possible because a store's notifications carry the whole state and each subscriber decides for itself.

---

## 9. Async with `createAsyncThunk`

A thunk action creator wraps an async function and dispatches three actions around it:

```ts
// src/part9/productsSlice.ts
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { listProducts, type ProductQuery } from '../api/products';
import type { ApiProduct } from '../api/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ProductsState {
  items: ApiProduct[];
  total: number;
  query: ProductQuery;
  status: LoadStatus;
  error: string | null;
}

const initialState: ProductsState = { items: [], total: 0, query: {}, status: 'idle', error: null };

/** A thunk: a function that dispatches actions around an async call. */
export const fetchProductsPage = createAsyncThunk('products/fetchPage', async (query: ProductQuery, { signal }) => {
  const page = await listProducts(query, signal);
  return { items: page.items, total: page.total, query };
});

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    queryChanged(state, action: PayloadAction<ProductQuery>) {
      state.query = action.payload;
    },
    productRemoved(state, action: PayloadAction<string>) {
      state.items = state.items.filter((product) => product.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProductsPage.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProductsPage.fulfilled, (state, action) => {
        // The page on screen has moved on: drop this response.
        if (JSON.stringify(action.meta.arg) !== JSON.stringify(state.query)) return;
        state.status = 'ready';
        state.items = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(fetchProductsPage.rejected, (state, action) => {
        if (action.meta.aborted) return; // an abort is not a failure
        state.status = 'error';
        state.error = action.error.message ?? 'Could not load products';
      });
  },
});

export const { queryChanged, productRemoved } = productsSlice.actions;
export const productsReducer = productsSlice.reducer;
```

### Line by line

- `createAsyncThunk('products/fetchPage', async (payload, thunkAPI) => …)` — the first argument is the action type prefix, the second is an async function whose return value becomes the `fulfilled` payload (wrapped in a promise you can `await`). A thrown error becomes `rejected`.
- `{ signal }` — the thunk API's `AbortSignal`. Pass it to `fetch`/axios (Part 7, file 10) so an aborted thunk actually cancels the request. `dispatch(fetchProductsPage(...)).abort()` cancels it; the aborted thunk rejects with `action.meta.aborted === true`.
- **Three actions per thunk**: `'products/fetchPage/pending'`, `'…/fulfilled'`, `'…/rejected'`. They are not created by this slice, which is why they are handled in `extraReducers` — reducers for actions from elsewhere.
- `builder.addCase(...)` — the current syntax. It is typed, so `action.payload` inside `fulfilled` is the thunk's return type (`{ items, total, query }`) and inside `rejected` is `unknown`.
- `state.status = 'loading'` — one **status field, not three booleans.** `isLoading`/`isError`/`isReady` as separate flags can encode impossible states (loading *and* ready); a union cannot. This is the same argument as file 01, section 5.
- `state.error = null` on `pending` — clear the previous error when a new attempt starts, or the UI shows a stale message under fresh data.
- `if (JSON.stringify(action.meta.arg) !== JSON.stringify(state.query)) return;` — the **stale-response guard**, measured below. `action.meta.arg` is the argument the thunk was created with.
- `if (action.meta.aborted) return;` — an abort is a normal consequence of the user navigating away; showing "Request failed" for it is a bug report waiting to happen.

### Measured: the thunk's lifecycle, and the stale response

```text
=== E. A thunk dispatches three actions around one request ===
   status/rows after each dispatch: idle/0 → loading/0 → ready/3
   items: Mechanical Keyboard, Wireless Mouse, Studio Headphones
   total rows on the server: 6
   error: null
   GET requests: 1 (/products?_page=1&_limit=3)

=== F. Two requests in flight: the stale one is dropped ===
   the fast query landed first: 0 rows, query {"q":"zzzz","page":1,"pageSize":3}
   after the slow response arrived: 0 rows, status ready
   state.query is still {"q":"zzzz","page":1,"pageSize":3}, so the "lamp" response was ignored
   requests sent: 2
```

Section E is the whole lifecycle in one line: `idle` → `loading` (the `pending` action) → `ready` (the `fulfilled` action), with exactly one network request for one dispatch. Section F is the race Part 7, file 10 handled with `AbortController` — here handled by *identity*: the slow `q=lamp` response arrived after the user had moved to `q=zzzz`, so the guard dropped it and the screen kept showing what the user asked for. Note the guard has to be in the reducer because by the time the response arrives, the reducer is the only code that knows what the user is looking at.

Two more tools worth knowing:

```ts
// `condition` — skip the thunk entirely if a request is already in flight
export const fetchProductsPage = createAsyncThunk('products/fetchPage', async (query: ProductQuery, { signal }) => {
  const page = await listProducts(query, signal);
  return { items: page.items, total: page.total, query };
}, {
  condition: (query, { getState }) => {
    const { status, query: current } = (getState() as RootState).products;
    return !(status === 'loading' && JSON.stringify(current) === JSON.stringify(query));
  },
});
```

```ts
// `unwrap()` — get the promise's value, and catch the failure where you dispatch
try {
  const page = await dispatch(fetchProductsPage({ page: 1 })).unwrap();
  console.log(page.total);
} catch (error) {
  // a real error, or a SerializedError from the rejected action
}
```

`condition` prevents duplicate in-flight requests; `unwrap()` turns the thunk promise into a normal try/catch so a component can react to the *specific* failure (show a toast, retry once) rather than reading a status field. Both are needed in real code, and both are thin conveniences over the three-action pattern.

---

## 10. Feature folders and slice composition

File 03 argued for one slice per feature; this is what that looks like on disk, and the shape this lab uses:

```text
src/
├── part9/
│   ├── store.ts            ← configureStore + RootState/AppDispatch + typed hooks
│   ├── cartSlice.ts        ← cart feature: state + actions + reducer + selectors
│   ├── productsSlice.ts    ← products feature: thunk + status + error
│   ├── selectors.ts        ← memoised selectors (createSelector) shared by both
│   └── cartModel.ts        ← domain types and pure helpers (no Redux, no React)
├── api/                    ← transport only: fetch calls, no state
└── routes/                 ← components: read with useAppSelector, write with useAppDispatch
```

Rules that keep this shape healthy as the app grows:

1. **A slice owns one feature's state and nothing else.** If a reducer in `cartSlice` needs `state.products`, the features are entangled — either move the shared piece into a third slice, or pass what is needed as an action payload.
2. **Selectors live next to the state they select**, and generic ones (`createSelector` compositions) can live in a shared file. Components import selectors; they never reach into `state.x.y` inline (except in the store file, where the convention is established).
3. **Domain types and pure helpers have no store imports.** `cartModel.ts` knows nothing about Redux, which is what lets file 02's context and file 05's Zustand reuse it verbatim. This is the single best defence against a store that cannot be replaced.
4. **Routes import hooks, leaf components take props.** A presentational button that takes `onClick` is testable with no store; a container that reads three selectors is where the store wiring lives.
5. **`extraReducers` is for cross-slice reactions.** When `checkoutSlice` completes and `cartSlice` must empty itself, that is a `cart/cleared` action dispatched by a listener (below) or handled in `extraReducers` — not a `dispatch` from inside a reducer.

### Reacting to actions: listener middleware

```ts
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { cartCleared, itemAdded } from './cartSlice';

export const listenerMiddleware = createListenerMiddleware();

// "When an item is added, write the cart to localStorage — debounced."
listenerMiddleware.startListening({
  matcher: isAnyOf(itemAdded, cartCleared),
  effect: async (_action, listenerApi) => {
    await listenerApi.delay(250); // debounce: cancelPendingTasks on the next match
    const { cart } = listenerApi.getState() as RootState;
    localStorage.setItem('shop-admin:cart', JSON.stringify(cart));
  },
});
```

This is the RTK 2 replacement for most `redux-saga` uses: a place for side effects that react to actions, with `delay`, `condition`, `take`, `cancelActiveListeners` and access to `dispatch`/`getState`. Add it in `configureStore` with `prepend(listenerMiddleware.middleware)`.

---

## 11. `createEntityAdapter`: when a list is really a table

If a slice holds a collection that is looked up by id more than it is iterated, the adapter normalises it:

```ts
import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';

const productsAdapter = createEntityAdapter<ApiProduct>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const productsSlice = createSlice({
  name: 'products',
  initialState: productsAdapter.getInitialState({ status: 'idle' as LoadStatus }),
  reducers: {
    productReceived: productsAdapter.upsertOne, // payload: one product
    productsReceived: productsAdapter.setAll, // payload: an array
    productRemoved: productsAdapter.removeOne, // payload: an id
  },
});

export const { selectAll, selectById, selectIds, selectTotal } = productsAdapter.getSelectors(
  (state: RootState) => state.products,
);
```

**What you get:** an `{ ids: string[], entities: Record<string, T> }` shape (so `selectById` is O(1) and an update touches one entity, not the whole array), plus built-in reducers (`addOne`, `upsertMany`, `removeAll`, …) and memoised selectors. **What it costs:** one more layer of vocabulary, and a state shape that is less pleasant to read in devtools.

Use it when the collection is large or frequently updated by id; skip it for a handful of rows fetched once (this lab's 6 products need none of it).

---

## 12. RTK Query, and where it overlaps with file 06

RTK Query is a data-fetching and caching layer built into RTK. It is the same idea as TanStack Query (file 06), with a different integration philosophy: the cache *is* a Redux slice, so everything is visible in DevTools and dispatchable like any other action.

```ts
// The shape, not run in this lab (file 06 verifies the equivalent with TanStack Query)
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const productsApi = createApi({
  reducerPath: 'productsApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Product'],
  endpoints: (builder) => ({
    listProducts: builder.query<ApiProduct[], { page?: number }>({
      query: ({ page = 1 }) => `/products?_page=${page}&_limit=3`,
      providesTags: ['Product'],
    }),
    createProduct: builder.mutation<ApiProduct, ApiProductDraft>({
      query: (draft) => ({ url: '/products', method: 'POST', body: draft }),
      invalidatesTags: ['Product'], // ← the whole invalidation story in one line
    }),
  }),
});

export const { useListProductsQuery, useCreateProductMutation } = productsApi;
```

```ts
// in the store
configureStore({
  reducer: { [productsApi.reducerPath]: productsApi.reducer },
  middleware: (getDefault) => getDefault().concat(productsApi.middleware), // for caching + lifetimes
});
```

That is a complete server-state setup: caching, deduplication, loading/error status, cache tags and invalidation, with **no thunks and no slices for the server data**. Which raises the question this file should answer honestly:

| | RTK Query | TanStack Query |
| --- | --- | --- |
| Where the cache lives | a Redux slice (visible in DevTools, dispatchable) | its own `QueryClient` outside Redux |
| Needs Redux in the app | yes | no (one provider) |
| Invalidation model | **tags** (`providesTags`/`invalidatesTags`) | **keys** (`invalidateQueries({ queryKey })`) |
| Optimistic updates | `onQueryStarted` + `updateQueryData` | `onMutate` (file 06) |
| Devtools | the Redux DevTools you already have | its own React Query DevTools |
| Bundle | inside the ~19.7 kB gzip RTK + react-redux figure | ~12.5 kB gzip measured separately |
| Strongest reason to choose it | the app already uses RTK; one state container to reason about | the app does not need Redux; the API is smaller and the ecosystem larger |

**The decision rule**: if the app already has a Redux store, RTK Query is the natural home for server state, and mixing it with thunks that fetch-and-store by hand is the worst of both worlds. If the app does not need Redux for client state, do not add Redux *just* to cache server data — file 06's library is smaller and does the same job. What you should never do is what file 03, section 13 warned about: hand-writing the cache in a slice with `lastFetchedAt`, `invalidate` actions and manual deduplication.

---

## 13. Testing

Three levels, in order of value:

**1. Reducers and slices — pure functions, no store:**

```ts
// cartSlice.test.ts
import { cartReducer, cartCleared, itemAdded } from './cartSlice';

const state = { items: [], coupon: null } as CartState;
const after = cartReducer(state, itemAdded({ id: 'p-lamp', name: 'Desk Lamp', priceMinor: 129_950, qty: 1 }));

expect(after.items).toHaveLength(1);
expect(after.items[0]?.qty).toBe(1);
expect(cartReducer({ items: [], coupon: 'SAVE20' }, cartCleared()).coupon).toBeNull();
```

Note what is absent: `render`, `screen`, `Provider`, mocks. A slice's reducers are the *rules of the app*, and they are testable as data in, data out — the payoff of the purity principle from file 03.

**2. Thunks — a real store with a mocked API:**

```ts
// productsSlice.test.ts
import { configureStore } from '@reduxjs/toolkit';
import { fetchProductsPage, productsReducer } from './productsSlice';

vi.mock('../api/products', () => ({
  listProducts: vi.fn(async () => ({ items: [{ id: 'x', name: 'X' }], total: 1 })),
}));

const store = configureStore({ reducer: { products: productsReducer } });
await store.dispatch(fetchProductsPage({ page: 1 }));

expect(store.getState().products.status).toBe('ready');
expect(store.getState().products.items).toHaveLength(1);
```

A **fresh store per test** is the rule (a module-level store carries state between tests and produces "passes alone, fails together" suites).

**3. Components — a helper written once:**

```tsx
// test-utils.tsx
export function renderWithStore(ui: ReactNode, { preloadedState }: { preloadedState?: Partial<RootState> } = {}) {
  const store = configureStore({ reducer: { cart: cartReducer, products: productsReducer }, preloadedState });
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}
```

Then a test can start from any state (`preloadedState: { cart: { items: [lamp], coupon: null } }`) instead of clicking its way there — which is only possible because the state is a plain object. Part 13 covers testing in depth.

---

## 14. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `return` **and** mutate in the same reducer | Immer discards the mutation; the state silently does not change | pick one style; mutate for updates, `return` for replacements |
| 2 | Mutating state outside a reducer | dev throws `Cannot add property …, object is not extensible`; production silently fails to update | copy in the component, change in the reducer |
| 3 | Keeping a reference to a draft (or to a `state` object) and editing it later | `Cannot perform 'get' on a proxy that has been revoked` | copy what you need out of the state; never keep drafts |
| 4 | Hand-writing `RootState` | it drifts from the store; errors appear in unrelated files | `ReturnType<typeof store.getState>` |
| 5 | `useSelector` at every call site with a local type annotation | repetition, and a `state: any` creeps in | `useAppSelector` from the store file |
| 6 | A selector returning a new object (or a parameterised selector created inline) | re-renders on every store change; dev warning | memoise with `createSelector`, or return primitives |
| 7 | Three booleans for async state (`isLoading`, `isError`, `isReady`) | impossible combinations render briefly | one `status` union + `error` |
| 8 | No stale-response guard in a thunk's `fulfilled` | an old response overwrites newer data — wrong results, no error | compare `action.meta.arg` with the current query, or use `condition` |
| 9 | Treating `action.meta.aborted` as an error | "Request failed" toasts when the user navigates | `if (action.meta.aborted) return` |
| 10 | One giant slice | merge conflicts, no isolation, giant diffs in DevTools | one slice per feature |
| 11 | Reducers that `dispatch` or `fetch` | impure, untestable, double-invoked in StrictMode | thunks / listener middleware |
| 12 | `middleware: [myMiddleware]` in `configureStore` | thunks stop working and dev checks vanish | `getDefault().concat(myMiddleware)` |

---

## 15. Best practices

1. **Let the generated code be generated.** Do not write action types by hand any more than you write HTML by hand.
2. **One slice per feature**, exported as `{ actions, reducer }`, with the slice's state interface beside it.
3. **Keep domain logic out of slices** (`cartModel.ts`: `summarize`, `itemFromProduct`) so other implementations and tests can reuse it.
4. **Model status as a union**, with `error: string | null` beside it, and clear the error on `pending`.
5. **Pass `signal` to your fetch calls** in every thunk, and ignore `aborted` rejections.
6. **Guard stale responses** — or prevent them with `condition`.
7. **Memoise selectors that build objects or sort**, and prefer primitive selectors elsewhere.
8. **`unwrap()` when the caller needs to react** to success or failure; read status fields when the UI just needs to render.
9. **Keep the store in one module**, with `RootState`, `AppDispatch` and the typed hooks exported from it.
10. **Put side effects in thunks or listener middleware**, never in reducers, and never in render.
11. **Test reducers first**, thunks second, components third — the first two give the most confidence per line of test.
12. **Write a `renderWithStore` helper before the third component test**, not after the thirtieth.

---

## 16. Practice

### Beginner

1. Convert this hand-written feature into a slice: state `{ count: number; step: number }`, actions "increment by `step`", "set step", "reset".
2. Write `selectCartUnits`, `selectCartTotalMinor` and `selectCartLines` for the lab's cart slice, and use them in a `CartBadge` component that reads with `useAppSelector`.
3. Explain in one sentence each: (a) what `configureStore` adds over `createStore` (file 03), (b) why `state.items.push(item)` works inside a slice reducer but throws outside one, (c) why `RootState` is derived from the store rather than written by hand.

### Intermediate

1. Add a `cartSlice` reducer called `quantityIncremented(by: number)` that increases every line's quantity by `by` but never above 10. Write two reducer tests, including the boundary case at 10.
2. Write the thunk for "load order detail by id", with: `signal` passed through, a status union, an `error` field, an `aborted` guard, and a guard that ignores a response for an id the user has navigated away from. Then explain which of the two guards would have prevented the bug in Part 7, file 10's race-condition probe.
3. A teammate puts the fetched product list in `productsSlice` (with `status`, `error`, `total`) and also keeps a `lastFetchedAt`. Write the three-paragraph review: what is fine, what will go wrong, and what you would do instead.

### Challenge

1. Move the cart's persistence from file 03's challenge (a subscription + debounce) into a **listener middleware** that listens for `itemAdded`/`itemRemoved`/`quantitySet`/`cartCleared`, debounces 250 ms, and writes a versioned payload. Include corrupt-JSON recovery on boot, and explain why the rehydrate must happen before the first render.
2. Add an **undo/redo** feature with listener middleware: capture previous states of the cart slice for `itemRemoved` only (undo a delete is the useful case), expose `undoRemove`, and expire the ability after 10 seconds. Say what you would show the user while the window is open.
3. Given an app with a Redux store and 12 hand-written thunks that fetch data into slices, plan the migration to RTK Query: which thunks become `builder.query`, which become `builder.mutation`, how tags replace the manual invalidation, and how you would migrate one screen at a time so the app works throughout.

---

## 17. Solutions

### Beginner

1. ```ts
   const counterSlice = createSlice({
     name: 'counter',
     initialState: { count: 0, step: 1 },
     reducers: {
       incremented(state) { state.count += state.step; },
       stepSet(state, action: PayloadAction<number>) { state.step = action.payload; },
       reset() { return { count: 0, step: 1 }; }, // returning a fresh value is allowed
     },
   });
   export const { incremented, stepSet, reset } = counterSlice.actions;
   export const counterReducer = counterSlice.reducer;
   ```
   Note the third reducer: no state to mutate, so `return` is the clearer style — and never both in one function.
2. ```ts
   export const selectCartUnits = (state: RootState) => summarize(state.cart.items).units;
   export const selectCartLines = (state: RootState) => state.cart.items.length;
   export const selectCartTotalMinor = (state: RootState) => summarize(state.cart.items, state.cart.coupon).totalMinor;

   export function CartBadge() {
     const units = useAppSelector(selectCartUnits);
     return <span>{units}</span>;
   }
   ```
   Three primitive selectors rather than one object selector: `Object.is` is enough, so the badge re-renders only when the number changes.
3. (a) `configureStore` composes slice reducers, installs thunk and the dev-only immutability/serialisability checks, and wires the DevTools — none of which the hand-written store does. (b) Inside a slice reducer, Immer passes a *draft* proxy that records writes and produces an immutable result; outside, `state` is the real, frozen object. (c) The store's type *contains* every slice's contributions, so deriving `RootState` from `typeof store.getState` means adding a slice automatically adds it to the type — a hand-written type would silently omit it.

### Intermediate

1. ```ts
   quantityIncremented(state, action: PayloadAction<number>) {
     for (const line of state.items) line.qty = Math.min(10, line.qty + action.payload);
   }
   ```
   Tests: a line at 9 with `by: 2` becomes 10 (clamped, not 11); a line at 3 with `by: 0` stays 3. Both are one-liners against `cartReducer`, because the rule lives in the reducer and not in a component's click handler.
2. ```ts
   export const fetchOrderDetail = createAsyncThunk('orders/fetchDetail', async (id: string, { signal }) => {
     return await getOrder(id, signal);
   });
   // fulfilled:
   if (JSON.stringify(action.meta.arg) !== state.openOrderId) return;   // navigated away
   if (action.meta.aborted) return;                                      // request cancelled
   ```
   The `meta.arg` guard is the one that prevents Part 7's race: two clicks on different orders, the slower one arriving last, and the detail page showing the wrong order. The `aborted` guard prevents a "failed" state for a request the user cancelled by navigating. Together they cover both halves of "the user did not ask for this any more".
3. What is fine: `status`/`error`/`total` are exactly the fields a request needs, and a slice is a reasonable place for them. What goes wrong: `lastFetchedAt` is the first symptom of hand-writing a cache — the next requirements are "don't refetch if fresh", then "dedupe two components asking at once", then "invalidate after a create", and each one is code you now own and can get subtly wrong (the classic failure being a list that never refreshes after a mutation, or one that refetches on every mount). What to do instead: if the app already has Redux, move it to RTK Query with tags (section 12) and delete the thunk, the slice fields and the manual invalidation; if the app does not need Redux for client state, use file 06's library and keep the slice count at zero.

### Challenge

1. ```ts
   listenerMiddleware.startListening({
     matcher: isAnyOf(itemAdded, itemRemoved, quantitySet, cartCleared),
     effect: async (_action, api) => {
       api.cancelActiveListeners(); // the newest change wins
       await api.delay(250); // debounce
       const payload = { version: 1, state: (api.getState() as RootState).cart };
       try { localStorage.setItem('shop-admin:cart', JSON.stringify(payload)); } catch { /* quota / private mode */ }
     },
   });
   ```
   On boot: read the key, `JSON.parse` inside `try`/`catch`, check `version`, migrate if older, and pass the result as `preloadedState` to `configureStore` — so the first paint is already correct. Doing the same thing in a `useEffect` after mount means the app renders an empty cart, then the stored one: a visible flash, and a window where a user could interact with the wrong state.
2. Keep `lastRemoved: { item: CartItem; index: number; expiresAt: number } | null`; the listener sets it and schedules `delay(10_000)` then dispatches `undoExpired()` which clears it. `undoRemove` re-inserts at `index` (so the cart order is restored, not appended) and clears the field. UI: a toast with an "Undo" button and a shrinking countdown; after expiry the toast disappears and the delete becomes permanent (and if the server was already told, the undo must issue a compensating request — see file 01's challenge for the trade-off).
3. For each thunk, ask "is this a read or a write?". Reads become `builder.query` with a key per parameter (`getOrder: builder.query<Order, string>({ query: (id) => \`/orders/${id}\`, providesTags: (_r, _e, id) => [{ type: 'Order', id }] })`); writes become `builder.mutation` with `invalidatesTags`. Tags replace the manual invalidation: the list `providesTags: ['Order']`, the detail provides `{ type: 'Order', id }`, a create invalidates `['Order']`, an update invalidates `[{ type: 'Order', id }]` — so the detail refreshes but untouched list rows do not. Migrate one screen at a time: mount the API reducer and middleware alongside the existing slices (they coexist), convert the first screen's thunk and delete its slice fields, then keep going. The app works at every step, and the slice file shrinks until it can be deleted.

---

## 18. Summary

- **RTK is Redux with the boilerplate generated**: `createSlice` turns a `reducers` object into action creators *and* a reducer, `configureStore` composes slices and installs middleware and dev checks, and typed hooks remove the casts.
- **Immer makes reducers readable and still immutable.** Measured: the `items` array is new, the untouched line objects are reused (structural sharing), and a direct mutation outside a reducer throws `Cannot add property 3, object is not extensible`. Never return *and* mutate; never keep a draft.
- **The dev checks are the safety net**: the freeze catches mutation, and the serialisability warning catches a `Date` in an action (measured, with the exact message) — both are development-only, so their absence in production is not evidence that the code is fine.
- **Typed hooks are defined once**: `useAppSelector = useSelector.withTypes<RootState>()`, `useAppDispatch = useDispatch.withTypes<AppDispatch>()`, with `RootState` derived from the store.
- **Selectors decide re-renders.** Measured: a memoised selector ran once for two calls and did not recompute on an unrelated field change; in the React binding a component whose selected value did not change did not re-render, and a change in another slice woke nobody.
- **`createAsyncThunk` is three actions and a status union.** Measured: `idle → loading → ready` with one request, and a stale response for `q=lamp` dropped because `state.query` had moved on to `q=zzzz`.
- **Use `signal`, ignore `aborted`, guard stale responses, and prevent duplicates with `condition`.** `unwrap()` is for callers that must react to a specific failure.
- **Keep domain logic out of slices**, one slice per feature, and side effects in thunks or listener middleware.
- **RTK Query is the natural server-state choice for an app that already has Redux**; if it does not, file 06's library does the same job with ~7 kB less gzip and without a store.

---

**What's next →** [`05-zustand.md`](./05-zustand.md) strips the ceremony out: a store created by a single function call, no provider, selectors for free, `persist` in one line — plus the measured pitfall that crashes React when a selector returns a new object, and the honest comparison of when Zustand is a better fit than RTK (and when it is not).
