# 05 — Zustand: A Minimal Global Store

> **Part 9 · State Management · File 5 of 6**

Why this file exists: files 02–04 built the same cart twice — once with context and a reducer, once with Redux Toolkit — and measured the cost of each. Context re-renders consumers of an unrelated field unless you split it into pieces; Redux Toolkit adds a provider, a store module, generated actions and a vocabulary, in exchange for slice isolation, devtools and time travel. Zustand is the third point on that line: **a store created by one function call, read through selectors, with no provider at all.** It is the smallest of the three, and for a large class of apps it is the best fit — which is exactly why this file also measures the one pitfall that makes it crash React, and ends with an honest checklist of when it is *not* the right answer.

Transcripts below come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-zustand-probe.tsx` against the real store in `src/part9/cartStore.ts`.

---

## 1. What Zustand is

Zustand (German for "state") is a store library with two halves:

- a **vanilla core** — `createStore` from `zustand/vanilla`: `getState`, `setState`, `subscribe`, all in plain JavaScript with no React import;
- a **React binding** — `create` from `zustand`: the same store, plus a hook that subscribes with `useSyncExternalStore` (file 03, section 8 showed that hook by hand).

The design consequences you can see immediately:

| Property | How it falls out of the design |
| --- | --- |
| **No provider** | the store is a module-level object; components import it |
| **Selector-level subscriptions** | the hook takes a selector, and the store notifies only subscribers whose selected value changed |
| **Usable outside React** | `getState()` / `setState()` are plain methods, so a router loader, a WebSocket handler or a test can use it |
| **Very small** | measured in a Vite 8 lib build with React external and minification on: **≈ 1.9 kB gzip** for `create` + `persist` + `useShallow` |
| **Almost no conventions** | one function returns state and actions together; everything else (slices, middleware) is opt-in |

⚠️ The absence of conventions is a genuine trade, not a pure win. Redux enforces a shape (actions, reducers, selectors) which is why a large team can navigate an unfamiliar Redux codebase; Zustand gives you a plain object and trusts you to keep it tidy. Section 8's slices pattern is the community's answer.

---

## 2. Install and the smallest useful store

```bash
npm install zustand
```

```ts
// src/part9/cartStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { summarize, type CartItem } from './cartModel';

export interface CartState {
  items: CartItem[];
  coupon: string | null;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  applyCoupon: (code: string | null) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      coupon: null,

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((line) => line.id === item.id);
          return {
            items: existing
              ? state.items.map((line) => (line.id === item.id ? { ...line, qty: line.qty + item.qty } : line))
              : [...state.items, item],
          };
        }),

      removeItem: (id) => set((state) => ({ items: state.items.filter((line) => line.id !== id) })),

      setQty: (id, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((line) => line.id !== id)
              : state.items.map((line) => (line.id === id ? { ...line, qty } : line)),
        })),

      applyCoupon: (code) => set({ coupon: code }),

      clear: () => set({ items: [], coupon: null }),
    }),
    {
      name: 'shop-admin:cart', // localStorage key
      version: 1,
      partialize: (state) => ({ items: state.items, coupon: state.coupon }),
    },
  ),
);
```

```tsx
// Any component, anywhere — no provider in the tree
function CartBadge() {
  const units = useCartStore((state) => summarize(state.items).units);
  return <span>{units} units</span>;
}

function AddButton({ item }: { item: CartItem }) {
  const addItem = useCartStore((state) => state.addItem); // a stable function
  return (
    <button type="button" onClick={() => addItem(item)}>
      Add {item.name}
    </button>
  );
}
```

### Line by line

- `create<CartState>()(…)` — the **curried form**. The extra `()` exists so TypeScript can infer the state type in one pass instead of trying to infer it from the initialiser (the classic "inference from a circular reference" problem). Without the explicit type parameter, `create((set) => ({…}))` infers a wider/looser type and you lose autocompletion in selectors.
- `(set) => ({…})` — the initialiser receives `set` (and `get`, unused here). It returns **state and actions in one object**. There is no separate actions layer: an action is just a property whose type is a function.
- `items: []` / `coupon: null` — data fields and functions live side by side. That is why the `partialize` option exists later: functions cannot be persisted to JSON.
- `set((state) => ({ items: … }))` — `set` merges **shallowly**: the returned object's keys replace the store's keys, and everything else is untouched. `set({ coupon: 'SAVE20' })` therefore changes one field and leaves `items` alone.
- The **function form** of `set` reads the freshest state. `set((state) => …)` is what makes two adds in the same tick safe; `set({ items: [...items, item] })` using a stale `items` from a closure would lose the first add. Use the function form whenever the new value depends on the old.
- `{ ...line, qty: line.qty + item.qty }` — immutability is *still* your job (unlike RTK's Immer, unless you add the `immer` middleware). Zustand is not a licence to mutate.
- `persist(…, { name, version, partialize })` — writes the store to `localStorage` after every change and reads it on creation. `partialize` excludes functions; `version` labels the stored shape for migrations (section 7).
- `useCartStore((state) => …)` — **a selector, always.** `useCartStore()` with no argument subscribes to the whole store and re-renders on any change; with a selector, the component is notified only when its selected value changes.

---

## 3. Actions, immutability, and the `immer` middleware

An "action" in Zustand is an ordinary function. There is no `dispatch`, no action object, and no reducer — the store's functions call `set` directly:

```ts
// The three shapes you will use
set({ coupon: 'SAVE20' })                            // replace top-level keys (shallow merge)
set((state) => ({ items: [...state.items, item] }))  // derived from the current state
set((state) => ({ items: state.items.map(…), coupon: null }))  // several keys at once
```

Because there is no Immer by default, the immutability rules of file 03, section 5 apply unchanged: copy arrays and objects, keep untouched items by reference. If the copying becomes noisy, add the middleware:

```ts
import { immer } from 'zustand/middleware/immer';

export const useCartStore = create<CartState>()(
  immer((set) => ({
    items: [],
    addItem: (item) =>
      set((state) => {
        const line = state.items.find((l) => l.id === item.id);
        if (line) line.qty += item.qty; // mutating the draft, like an RTK slice
        else state.items.push(item);
      }),
    // …
  })),
);
```

```text
src/part9/cartStore.ts     ← without immer: spread everywhere, `set` returns new objects
src/part9/cartSlice.ts     ← the RTK slice: Immer is built in, so mutation is the style
```

⚠️ Two details that bite people who switch from RTK to Zustand:

1. **`set` merges; RTK replaces the slice.** Returning `{ items: [] }` from an RTK reducer *is* the new slice state, so a forgotten field disappears (a common cause of "my coupon vanished"). Zustand's `set` merges, so a forgotten field stays. Neither behaviour is "safer": both are conventions you must know.
2. **Nested updates need care even with Immer**: `set((state) => ({ cart: { ...state.cart, items: [...] } }))` mixes a shallow merge with a manual copy. Prefer either full manual copies with the plain form, or the Immer middleware everywhere — not both in one store.

---

## 4. Selectors and subscription granularity, measured

The whole reason to pick a store over context is in this transcript:

```text
=== B. Clicking "Add Desk Lamp" — who re-renders? ===
   ZustandCartBadge=1 ZustandCartTotal=1 ZustandItemsList=1 ZustandSummaryShallow=1
   the Add button itself: 0 renders — it subscribes to a function that never changes
   badge (units) re-rendered: the number changed
   list re-rendered: the items array is a new array
   state now: [{"id":"p-lamp","name":"Desk Lamp","priceMinor":129950,"qty":1}]
   localStorage: {"state":{"items":[{"id":"p-lamp","name":"Desk Lamp","priceMinor":129950,"qty":1}],"coupon":null},"version":1}

=== C. A change that does not touch the numbers ===
   applyCoupon('SAVE20') → ZustandCartTotal=1 ZustandSummaryShallow=1
   badge: units did not change, so the selector returned 1 === 1 and React skipped it
   total: changed (discount applied) → 1 render

=== D. A new array with the same contents (what a refetch looks like) ===
   setState with a copied array → ZustandItemsList=1
   ZustandItemsList re-rendered although the contents are identical:
   its selector returns state.items, and that reference is new
   ZustandSummaryShallow did NOT re-render: useShallow compares the fields
```

What each measurement teaches:

- **The Add button rendered 0 times** (B). Its selector returns `state.addItem` — the same function object for the store's lifetime — so `Object.is` says "unchanged" and React skips it. Compare with file 02's `NaiveAddButton=1` and file 04's `RtkAddButton: 0`: this is the store property, delivered without a provider.
- **The badge did not render when the coupon changed** (C), because its selector computes a *primitive* (`summarize(state.items).units`) and that number stayed `1`. This is precisely the case where context re-rendered the badge (file 02, section 6). The selector is the difference: context hands the consumer the whole value; a store asks the consumer what it wants.
- **`ZustandItemsList` re-rendered even though the contents were identical** (D). Its selector returns `state.items`, and `setState((state) => ({ items: [...state.items] }))` created a new array. This is not a Zustand bug — it is the identity rule — but it is worth internalising, because it is exactly what happens when a refetch replaces a list with an equal one: any component selecting the array re-renders. Selecting a *primitive* (a count, a total, a flag) avoids it; selecting an array or object means accepting reference equality.
- **`ZustandSummaryShallow` did not re-render** (D) because `useShallow` compares the object's fields instead of its identity. That is the subject of the next section.

### Selector patterns

```ts
// ✅ primitives: compared with Object.is, cheapest and most precise
const units = useCartStore((state) => summarize(state.items).units);
const coupon = useCartStore((state) => state.coupon);

// ✅ a stable function: never re-renders
const addItem = useCartStore((state) => state.addItem);

// ✅ an array/object you deliberately depend on: reference equality is what you want
const items = useCartStore((state) => state.items);

// ✅ several values as an object: compare the fields, not the object
const { lines, totalMinor } = useCartStore(useShallow((state) => ({ lines: state.items.length, totalMinor: summarize(state.items).totalMinor })));

// ❌ a new object with no comparison → the crash in section 5
const summary = useCartStore((state) => ({ lines: state.items.length, totalMinor: summarize(state.items).totalMinor }));
```

---

## 5. The trap: a selector that returns a new object

This is the pitfall that makes Zustand look broken the first time you meet it, and the measurement is unambiguous:

```text
=== H. The object-returning selector trap (in its own tree, last) ===
   React refused to continue: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.
   a selector that builds a new object on every call changes identity on
   every render check, so useSyncExternalStore sees "changed" forever
   ZustandSummaryObject rendered 55 time(s) before React stopped
   the same data through useShallow mounts fine: 1/207920

=== I. Cleaning up ===
   console.error lines captured: 9 (act() warnings from driving the store by hand)
   of those, about the uncached snapshot: 1
     The result of getSnapshot should be cached to avoid an infinite loop
```

### Why it happens

`useCartStore(selector)` is `useSyncExternalStore(subscribe, () => selector(store.getState()))` under the hood (file 03, section 8). React's contract is strict: **the snapshot function must return a cached value** — called twice with the same store state, it must return the same reference. A selector that builds `{ lines, totalMinor }` violates that contract in the most literal way: every call constructs a new object, so React concludes "the snapshot changed" on every check, re-renders, checks again, and gives up at 55 renders with `Maximum update depth exceeded`.

Two symptoms, one cause:

| Symptom | When you see it |
| --- | --- |
| `Maximum update depth exceeded` — the component tree dies | the store's state is stable but the selector's *output* is not |
| `The result of getSnapshot should be cached to avoid an infinite loop` (a warning) | the same mistake in a milder form, e.g. inside a component that also changes state |

### The fixes, in order of preference

```ts
// 1. Select primitives — no object, nothing to compare
const lines = useCartStore((state) => state.items.length);
const totalMinor = useCartStore(selectTotalMinor);

// 2. useShallow — compare the object's fields (one level deep)
const { lines, totalMinor } = useCartStore(useShallow(selectSummaryObject));

// 3. use a memoised selector: same input → same output reference
const selectSummary = (state: CartState) => summarize(state.items, state.coupon); // ← NOT enough: still a new object
```

⚠️ Fix 3 needs care, and the reason is instructive: memoising `summarize` does not help, because its *output* is still a fresh object. Either the selector's output must be a primitive, or a stable reference must be produced. `useShallow` does exactly that: it returns the *previous* object when the fields are equal, which is the stability React requires:

```ts
// zustand/shallow exports both: `useShallow` for the React hook, `shallow` for plain code
import { useShallow } from 'zustand/shallow';
```

Because this is the single most common Zustand bug, learn the rule as a sentence: **a Zustand selector must return something that is stable when the data has not changed — a primitive, a stored reference, or an object wrapped in `useShallow`.**

---

## 6. The store outside React, measured

```text
=== E. The store works outside React ===
   cartApi.add(Wireless Mouse) from module scope → ZustandCartBadge=1 ZustandCartTotal=1 ZustandItemsList=1 ZustandSummaryShallow=1
   items: Desk Lamp ×1, Wireless Mouse ×1
   badge text in the DOM: 2 units
   React updated because useSyncExternalStore subscribed to the store

=== F. Subscribing without React ===
   a plain subscribe() saw: 2→2 lines | 2→1 lines
   after unsubscribe the listener is silent (3 adds happened, 2 notifications)
```

The API, all of it:

```ts
// src/part9/cartStore.ts
export const cartApi = {
  add: (item: CartItem) => useCartStore.getState().addItem(item),
  clear: () => useCartStore.getState().clear(),
  read: (): CartItem[] => useCartStore.getState().items,
};

// Reading and writing anywhere: a router loader, a WebSocket handler, a test, a timer
useCartStore.getState();              // the current state (never mutate it)
useCartStore.setState({ coupon: null }); // a shallow merge, no action required
const unsubscribe = useCartStore.subscribe((state, previous) => {
  console.log(previous.items.length, '→', state.items.length);
});
unsubscribe();                        // the listener is silent afterwards
```

Measured in E: a call from **module scope** updated the DOM, because the store notified and `useSyncExternalStore` re-rendered the subscribing components. This is the property context can never have (file 02, section 10) and one of the two reasons RTK users reach for a store.

Measured in F: `subscribe` gives you `(state, previousState)` and a plain `unsubscribe`. The base `subscribe` fires on *every* change — a selector-scoped `subscribe` requires the `subscribeWithSelector` middleware:

```ts
import { subscribeWithSelector } from 'zustand/middleware';

const useCartStore = create<CartState>()(
  subscribeWithSelector((set) => ({ /* … */ })),
);

// now: notify only when the number of units crosses 3
const stop = useCartStore.subscribe((state) => summarize(state.items).units, (units, previous) => {
  if (units >= 3 && previous < 3) console.log('You unlocked the bulk discount');
});
```

⚠️ `subscribe` callbacks run **outside React's render cycle**. Never call `setState` on a component from inside one; dispatch into the store, or wrap the work in a React effect. And unsubscribe in the cleanup of the effect that subscribed, or a hot-reloaded dev session accumulates listeners and each change fires the old ones too.

---

## 7. Persistence, rehydration, and migrations

```text
=== G. Persistence: localStorage, reload, rehydrate ===
   after the clicks, persist wrote: {"state":{"items":[{"id":"p-lamp","name":"Desk Lamp","priceMinor":129950,"qty":3}],"coupon":"SAVE20"},"version":1}
   clear() also emptied the stored copy: {"state":{"items":[],"coupon":null},"version":1}
   simulating a stored cart from an earlier session: {"state":{"items":[{"id":"p-lamp","name":"Desk Lamp","priceMinor":129950,"qty":2}],"coupon":"SAVE20"},"version":1}
   in memory right now: 0 lines
   after rehydrate(): Desk Lamp ×2 coupon SAVE20
   a page reload does this for you, before the first render
```

The `persist` middleware writes on every change and reads on creation. The measured sequence shows all four behaviours worth knowing:

1. **What is stored** — `{ state: { …partialized fields… }, version: 1 }`. Functions are excluded by `partialize` (JSON cannot represent them) and the version labels the shape.
2. **Writes happen on every change** — no debounce by default. For a store written on every keystroke, wrap it: `persist(…, { name, storage: createJSONStorage(() => localStorage) })` plus a debounced wrapper, or persist only the fields that matter (`partialize`).
3. **`clear()` clears the stored copy too** — the middleware is symmetric: any state change is persisted, including emptying it.
4. **`rehydrate()` reads storage back into the store** — measured: the in-memory cart was empty, the stored copy held a lamp ×2 with `SAVE20`, and after `await useCartStore.persist.rehydrate()` the store held exactly that. A page reload performs this for you during store creation, before the first render — which is why a persisted Zustand store does not flash an empty cart on load. (Compare file 04's challenge, where a `useEffect`-based rehydrate *does* flash.)

Migrations:

```ts
persist(
  (set) => ({ /* … */ }),
  {
    name: 'shop-admin:cart',
    version: 3,
    migrate: (persisted, fromVersion) => {
      let state = persisted as { items: CartItem[]; coupon: string | null; vatIncluded?: boolean };
      if (fromVersion < 2) state = { items: state.items.map((line) => ({ ...line, qty: Math.max(1, line.qty) })), coupon: null };
      if (fromVersion < 3) state = { ...state, vatIncluded: true };
      return state;
    },
    // storage: createJSONStorage(() => sessionStorage), // per-tab instead of per-browser
    // skipHydration: true,                             // rehydrate by hand, e.g. after auth
  },
);
```

| Option | Use it for |
| --- | --- |
| `name` | the storage key (always namespace it: `app:feature`) |
| `version` + `migrate` | shape changes; without a version, an old payload silently produces `undefined` fields |
| `partialize` | persisting only the data (never functions, never secrets, never derived caches) |
| `storage` | `sessionStorage` (per tab), or an async store (IndexedDB) |
| `onRehydrateStorage` | a callback for "storage was corrupt" or "hydration finished" — the place to handle a failed parse instead of crashing |

⚠️ Never persist tokens, and never persist a *copy* of server data "to make it faster": the copy will be stale the moment the user returns, and file 06's cache exists precisely to handle that with `staleTime`.

---

## 8. The slices pattern: one store, several features

A single Zustand store is a plain object, and a growing app's store becomes a 300-line file unless it is split. The community pattern keeps **one store** but splits the *creators*:

```ts
// src/store/cartSlice.ts
import type { StateCreator } from 'zustand';
import type { CartItem } from './cartModel';

export interface CartSlice {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  clear: () => void;
}

export const createCartSlice: StateCreator<AppState, [], [], CartSlice> = (set) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      const line = state.items.find((l) => l.id === item.id);
      return { items: line ? state.items.map((l) => (l.id === item.id ? { ...l, qty: l.qty + item.qty } : l)) : [...state.items, item] };
    }),
  clear: () => set({ items: [] }),
});
```

```ts
// src/store/uiSlice.ts
export interface UiSlice {
  isCartOpen: boolean;
  toggleCart: () => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  isCartOpen: false,
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
});
```

```ts
// src/store/index.ts
import { create } from 'zustand';
import { createCartSlice, type CartSlice } from './cartSlice';
import { createUiSlice, type UiSlice } from './uiSlice';

export type AppState = CartSlice & UiSlice;

export const useAppStore = create<AppState>()((...args) => ({
  ...createCartSlice(...args), // ← the same `set`/`get`/`store` for every slice
  ...createUiSlice(...args),
}));
```

### Line by line

- `StateCreator<AppState, [], [], CartSlice>` — the type of a slice creator: it receives `set`/`get` typed against the **whole** `AppState`, and contributes `CartSlice`. That typing is what lets one slice read another's state (`get().items` inside a UI action).
- `...createCartSlice(...args)` — the creators are called with the same arguments and their objects are spread into one store. At runtime there is still exactly **one** store object, one `set`, one subscription list: this is code organisation, not multiple stores.
- `AppState = CartSlice & UiSlice` — the intersection is the store's type. Adding a slice means adding one line here and missing it is a compile error, not a runtime surprise.
- `useAppStore` is the only export anyone imports. Selectors stay in the feature files beside their creators.

Cross-slice actions work because `set`/`get` see the whole state:

```ts
export const createCheckoutSlice: StateCreator<AppState, [], [], CheckoutSlice> = (set, get) => ({
  isPlacingOrder: false,
  placeOrder: async () => {
    const { items, coupon } = get();        // read another slice
    set({ isPlacingOrder: true });
    try {
      const order = await createOrder({ items, coupon });
      set({ items: [], coupon: null, isPlacingOrder: false }); // and write to it
      return order;
    } catch (error) {
      set({ isPlacingOrder: false });
      throw error;
    }
  },
});
```

---

## 9. Middleware

Middleware wrap the store's `set`/`get`, and they compose — order matters, because each one sees what the previous one produced:

```ts
export const useCartStore = create<CartState>()(
  devtools(                      // outermost: names actions in the Redux DevTools panel
    persist(                     // then: writes to storage
      immer((set) => ({ … })),   // innermost: lets reducers mutate a draft
      { name: 'shop-admin:cart', version: 1 },
    ),
    { name: 'cart' },
  ),
);
```

| Middleware | Adds | Typical use |
| --- | --- | --- |
| `persist` | storage write + `rehydrate()` + `migrate` | carts, drafts, preferences |
| `devtools` | the Redux DevTools panel, with named actions | debugging a store that changes from many places |
| `immer` | mutating syntax inside `set` | stores with deep nesting |
| `subscribeWithSelector` | `subscribe(selector, listener)` | reacting to a *specific* change (analytics, side effects) |
| `combine` | separate state and actions at the type level | large stores where you want the data type alone |
| `redux` | a reducer-based store (`dispatch` + actions) | teams that want the Redux pattern with Zustand's size |

⚠️ `devtools` is a **development** aid with a runtime cost (it serialises every action to the extension). Gate it: `import.meta.env.DEV ? devtools(…) : (f) => f`, or accept the cost knowingly.

---

## 10. Async actions, and the limit of a store

A Zustand action may be `async` — it is just a function:

```ts
export interface ProductsState {
  items: ApiProduct[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  load: (query: ProductQuery) => Promise<void>;
}

export const useProductsStore = create<ProductsState>()((set, get) => ({
  items: [],
  status: 'idle',
  error: null,

  load: async (query) => {
    set({ status: 'loading', error: null });
    try {
      const page = await listProducts(query);
      // Guard: has the query changed while this request was in flight? (file 04, section 9)
      if (get().query !== query) return;
      set({ items: page.items, status: 'ready' });
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return;
      set({ status: 'error', error: error instanceof Error ? error.message : 'Failed' });
    }
  },
}));
```

That works, and it is enough for small cases — a draft autosave, an optimistic toggle, a "load more" button. It is *not* enough for a real server-data layer, and the missing pieces are exactly the ones file 06 lists:

| What you hand-write in a store | What a query cache gives you |
| --- | --- |
| `status`, `error`, retry | built-in states + exponential-backoff retry |
| cache keying per query | `queryKey` + one cache entry per key |
| deduplication of two components asking at once | built in |
| staleness (`staleTime`, refetch on focus) | built in |
| invalidation after a mutation | `invalidateQueries` |
| garbage collection of unused entries | `gcTime` |

💡 The rule that keeps this clean: **client session state in Zustand, server data in a query cache.** A Zustand store may hold `selectedProductId`; it should not hold the product.

---

## 11. Testing

Because the vanilla store is a plain object, a test can build a fresh one instead of importing the app's singleton:

```ts
// src/part9/cartStore.test.ts
import { createStore } from 'zustand/vanilla';
import { summarize } from './cartModel';
import type { CartState } from './cartStore';

function makeCartStore() {
  return createStore<CartState>()((set) => ({
    items: [],
    coupon: null,
    addItem: (item) => set((state) => ({ items: [...state.items, item] })),
    removeItem: (id) => set((state) => ({ items: state.items.filter((line) => line.id !== id) })),
    setQty: (id, qty) => set((state) => ({ items: state.items.map((line) => (line.id === id ? { ...line, qty } : line)) })),
    applyCoupon: (coupon) => set({ coupon }),
    clear: () => set({ items: [], coupon: null }),
  }));
}

test('adding the same item twice folds into one line', () => {
  const store = makeCartStore();
  const lamp = { id: 'p-lamp', name: 'Desk Lamp', priceMinor: 129_950, qty: 1 };

  store.getState().addItem(lamp);
  store.getState().addItem(lamp);

  expect(store.getState().items).toHaveLength(1);
  expect(summarize(store.getState().items).units).toBe(2);
});
```

The catch to know about: **the store object returned by `create(...)` and the hook it returns are the same store.** In a component test, either reset between tests —

```ts
beforeEach(() => useCartStore.setState({ items: [], coupon: null }));
```

— or, cleaner, refactor the store so `create` is called inside a factory (`createCartStore()`) and the app's module exports one instance of it:

```ts
export function createCartStore() {
  return create<CartState>()(persist((set) => ({ … }), { name: 'shop-admin:cart' }));
}
export const useCartStore = createCartStore(); // the app's singleton
```

Now tests get a pristine store per test, with no shared localStorage and no leakage between files — the same "fresh state per test" rule as file 04's `renderWithStore`.

---

## 12. Zustand vs Redux Toolkit vs Context

| | Zustand | Redux Toolkit | Context |
| --- | --- | --- | --- |
| Provider | none | `<Provider store>` | one per concern |
| Boilerplate | ~1 function call | `configureStore` + a slice per feature | provider + memoised value + hooks |
| Actions | plain functions on the store | generated action creators | dispatch a reducer action |
| Devtools / time travel | via the `devtools` middleware | built in, with time travel | none |
| Middleware | small, composable (`persist`, `immer`, …) | large ecosystem (thunks, sagas, listeners) | none |
| Enforced conventions | none (slices pattern is optional) | strong: slices, actions, selectors | you invent them |
| Re-render control | per selector, `useShallow` for objects | per selector, memoised selectors | per value identity (split or re-render) |
| Outside React | first-class | first-class | not possible |
| Bundle (measured, minified, React external) | **≈ 1.9 kB gzip** | **≈ 19.7 kB gzip** | 0 |
| Best fit | most app-level client state | complex state, auditability, large teams, RTK Query for server data | low-frequency app-wide values, small apps |

None of the three is "the modern one". The measured difference that matters most day to day is the last-but-three row: RTK's conventions are what let a stranger navigate your store, and Zustand's lack of them is what makes it disappear from the codebase. Both are features; you are choosing which one your team needs.

---

## 13. Choosing, in practice

A checklist that answers the question in about thirty seconds:

1. **Is it read by one or two components?** → `useState`, lifted to a parent if needed. Stop here.
2. **Is it server data?** → a query cache (file 06). Stop here.
3. **Should it be in the URL?** → `useSearchParams` (Part 6). Stop here.
4. **Is it a value read widely and written rarely (theme, locale, auth user)?** → context + a hook (file 02) is enough.
5. **Is it client state written from several places and read with selectors?** → Zustand, unless…
6. **…do you also need time travel, an audit trail, or one enforced pattern across a large team?** → Redux Toolkit (file 04).
7. **Are you already using RTK for client state and now need server state?** → RTK Query, not a second library (file 04, section 12).

Two honest notes to finish:

- Zustand's missing structure *will* show up in a large codebase: stores that mutate state in place, actions with five responsibilities, selectors defined inline in components. The slices pattern (section 8) plus a rule that selectors live beside their creators is what keeps it healthy.
- The reverse is also true: RTK's structure *will* feel heavy for a store with eight fields. Migrating a small RTK store to Zustand is a real, common refactor; migrating in the other direction happens when the audit trail or the team size finally demands it.

---

## 14. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | A selector that returns a new object | `Maximum update depth exceeded` — the tree dies (measured) | primitives, `useShallow`, or a stored reference |
| 2 | `useCartStore()` with no selector | re-renders on every store change, including unrelated slices | always pass a selector |
| 3 | Mutating state instead of copying | the UI keeps showing the old data | copy (`[...items, item]`, `{ ...line, qty }`), or the `immer` middleware |
| 4 | `set({ items: [...items, item] })` with a stale `items` from the closure | an add is lost when two happen in one tick | `set((state) => …)` |
| 5 | Persisting functions | `persist` writes them as `undefined`; rehydration leaves the store broken | `partialize` to the data fields |
| 6 | Persisting tokens or server data | an XSS-extractable credential, or stale data shown as truth | persist ids/preferences only; let the server own server data |
| 7 | No `version`/`migrate` | a shape change makes old stored payloads produce `undefined` fields | bump `version`, write the migration |
| 8 | Forgetting to unsubscribe | listeners accumulate on hot reload; work runs twice | return the unsubscribe from the effect that subscribed |
| 9 | Calling component `setState` from a `subscribe` callback | updates outside React's cycle; warnings and lost updates | dispatch into the store; let components select |
| 10 | `devtools` in production | every action serialised into the extension: slower writes | gate it on `import.meta.env.DEV` |
| 11 | One 400-line store file | merge conflicts; nobody knows what is in it | the slices pattern; selectors beside their creators |
| 12 | Server data in the store | you hand-write staleness, dedupe, retry and invalidation | a query cache (file 06) |

---

## 15. Best practices

1. **Always select.** `useCartStore((state) => state.x)`, never the whole store, in a component that renders anything.
2. **Return primitives when you can**, `useShallow` when you need several, `useStore` references when you mean them.
3. **Use the function form of `set`** whenever the next value depends on the current one.
4. **Keep actions in the store** (they are the store's API) and **selectors outside it** (they are queries).
5. **Namespace storage keys** (`app:feature`) and version every persisted shape.
6. **Never persist secrets**, and never persist a copy of server data.
7. **Split the store with the slices pattern** before it hurts; keep domain types in their own module so React never leaks into them.
8. **Expose a factory** (`createCartStore()`) and export one instance, so tests can build fresh stores.
9. **Gate `devtools` to development.**
10. **Keep server state in the query cache.** A store that holds `items`, `status` and `error` for an API call is a cache you now maintain.

---

## 16. Practice

### Beginner

1. Write a `useUiStore` with `isCartOpen`, `openCart()`, `closeCart()` and `toggleCart()`. Use it in a button that only toggles, and show that the button does not re-render when unrelated state changes.
2. Given `const { items, coupon } = useCartStore((state) => ({ items: state.items, coupon: state.coupon }))`, explain what will happen and why, then fix it two ways.
3. Explain in one sentence each: (a) why no provider is needed, (b) why `set` merges instead of replacing, (c) why `useCartStore()` without a selector is a bug in most components.

### Intermediate

1. Add a `usePrefsStore` persisting `{ theme: 'light' | 'dark'; density: 'compact' | 'comfy' }` to `localStorage` under `shop-admin:prefs`, version 1. Then write a migration to version 2 that adds `locale: 'en-IN'`, and test it by hand-writing a v1 payload into `localStorage`.
2. Convert the file 02 context cart (`cartReducer.ts` + `CartContext.tsx`) into a Zustand store, keeping `cartModel.ts` untouched. Then list every component that needed a change, and say what the diff would have been if the store had been introduced from the beginning.
3. Write an analytics listener: with `subscribeWithSelector`, log an event when the number of units crosses from below 3 to 3 or more, exactly once per crossing. Then explain why this needs the middleware and cannot be done with a component `useEffect` watching `items.length`.

### Challenge

1. Build a store with a **history** feature: `undo()` and `redo()` for the cart, with a cap of 20 steps, excluding "no-op" changes (do not push a history entry when the state is identical). Then say what you would have to change to make the history survive a page reload, and how much of the state you would persist.
2. Implement **cross-tab synchronisation**: two browser tabs share the cart via `localStorage`'s `storage` event, so adding an item in one tab updates the other, without an infinite echo loop. Explain the two mechanisms (echo: a tab writes what it just read; infinite loop: the other tab writes back) and how you break each.
3. Take a Zustand store with 8 fields and 12 actions and refactor it into the slices pattern with a factory. Then write the three tests that were hardest before the refactor and explain what made them possible.

---

## 17. Solutions

### Beginner

1. ```ts
   interface UiState {
     isCartOpen: boolean;
     openCart: () => void;
     closeCart: () => void;
     toggleCart: () => void;
   }

   export const useUiStore = create<UiState>()((set) => ({
     isCartOpen: false,
     openCart: () => set({ isCartOpen: true }),
     closeCart: () => set({ isCartOpen: false }),
     toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
   }));

   function CartToggleButton() {
     const toggleCart = useUiStore((state) => state.toggleCart); // stable → 0 re-renders
     return <button type="button" onClick={toggleCart}>Cart</button>;
   }
   ```
   The button subscribes to a function whose identity never changes, so it renders once and never again — the same measurement as section 4's Add button (0 renders).
2. The selector builds a **new object** on every call, so React's snapshot check sees a change every time: the component re-renders on every store update (and, in the worst case, loops until `Maximum update depth exceeded`). Fixes: (a) two primitive selectors — `const items = useCartStore((state) => state.items); const coupon = useCartStore((state) => state.coupon);` — or (b) one `useShallow`-wrapped selector, which returns the previous object when both fields are unchanged.
3. (a) The store is a module-level object, so components import it; context is only needed when a value must be *provided* at runtime by a parent. (b) `set` merges so that a single-field update does not erase the rest of the state — with many small actions, replacing would need every action to return the whole state. (c) Without a selector the component subscribes to everything, so every change in the store (including an unrelated `isCartOpen`) re-renders it.

### Intermediate

1. ```ts
   export const usePrefsStore = create<PrefsState>()(
     persist(
       (set) => ({
         theme: 'light',
         density: 'comfy',
         locale: 'en-IN',
         setTheme: (theme) => set({ theme }),
         setDensity: (density) => set({ density }),
       }),
       {
         name: 'shop-admin:prefs',
         version: 2,
         partialize: (state) => ({ theme: state.theme, density: state.density, locale: state.locale }),
         migrate: (persisted, from) => {
           const state = persisted as { theme: 'light' | 'dark'; density: 'compact' | 'comfy'; locale?: string };
           return from < 2 ? { ...state, locale: 'en-IN' } : state;
         },
       },
     ),
   );
   ```
   To test it, write a v1 payload by hand — `localStorage.setItem('shop-admin:prefs', JSON.stringify({ state: { theme: 'dark', density: 'compact' }, version: 1 }))` — then create the store and check that `locale` is filled and no field is `undefined`.
2. The store replaces `cartReducer.ts`'s `useReducer` wiring: the reducer's cases become store actions, and `useCartState`/`useCartDispatch` become `useCartStore(selector)` at each call site. `cartModel.ts` (`summarize`, `formatMoney`, `itemFromProduct`) and every component's *markup* stay identical — which is the point: only the plumbing changes. The components that change are exactly those that consumed the two hooks (the badge, the total, the add button, the coupon box); with the store from the start, those components would have had one import and one selector each, no provider at `App.tsx`, and no context file to delete.
3. ```ts
   useCartStore.subscribe(
     (state) => summarize(state.items).units,
     (units, previous) => {
       if (units >= 3 && previous < 3) track('bulk_discount_unlocked', { units });
     },
   );
   ```
   The middleware is required because the base `subscribe` only reports "something changed" for the whole state, so a component effect watching `items.length` would also fire on removals, quantity edits and coupon changes, and would need its own previous-value tracking. `subscribeWithSelector` compares the selected value with `Object.is` *before* calling the listener, which is what makes "crossing the threshold" a one-line condition — and it runs outside React, so it also works when no component is mounted (an analytics event that must fire even on a background tab).

### Challenge

1. Keep `past: CartState[]` and `future: CartState[]` alongside the live fields; every mutating action pushes the *previous* snapshot and clears `future`, but only when the new state actually differs (`if (Object.is(prev, next)) return;` — the identity rule again). Cap `past` at 20 (`past.slice(-20)`). To survive a reload you would persist the snapshots too — which is where the honest answer is "usually don't": the payload grows, migrations multiply (every snapshot needs migrating), and a restored undo stack can contradict the server. The usual compromise is to persist only the *current* state and lose the history on reload, or to keep one "undo last delete" slot (file 04's challenge).
2. Write `localStorage.setItem(KEY, JSON.stringify(state))` on every change (the `persist` middleware already does this), and in the *other* tab listen for the `storage` event, which fires only in tabs that did **not** write. Break the echo by treating the incoming payload as authoritative and applying it with `setState(payload, true)` (replace, not merge) *without* writing back — i.e. a flag that suppresses the next write, or a comparison that skips the write when the serialised payload equals what is already in storage. Break the loop by never responding to your own writes (the `storage` event's semantics already prevent the simplest case) and by ignoring events whose `key` is not yours. Also handle the "both tabs edit at once" case honestly: last write wins, so either accept it or add a version counter and a conflict message.
3. The factory makes each test independent (`const store = createCartStore()`), the slices keep the file navigable, and the domain types stay importable without React. The three tests that were hardest before: (a) "two adds in the same tick fold into one line" — needs the function form of `set`, now provable directly; (b) "undo after a delete restores the item at its old index" — needs the history slice, now isolated; (c) "a failed cross-slice action leaves both slices consistent" — needed `get()` across slices, which the `StateCreator<AppState>` typing now makes type-safe.

---

## 18. Summary

- **Zustand is a vanilla store plus a `useSyncExternalStore` hook.** No provider, one function call to create it, selectors for subscriptions, and ~1.9 kB gzip measured (minified, React external).
- **Actions are plain functions on the store**, and `set` merges shallowly. Use `set((state) => …)` whenever the new value depends on the old, and keep copying — immutability is only automatic with the `immer` middleware.
- **Selectors decide re-renders.** Measured: an action-only button re-rendered 0 times, a badge whose computed number did not change re-rendered 0 times when the coupon changed (the exact case where context re-rendered), and a list selecting the whole array re-rendered when a refetch produced an equal array.
- **A selector that returns a new object crashes React** — `Maximum update depth exceeded` after 55 renders, plus the `The result of getSnapshot should be cached` warning. Fix it with primitives or `useShallow`; memoising the *computation* is not enough, the **output reference** must be stable.
- **The store works outside React.** Measured: a module-scope `cartApi.add(...)` updated the DOM, and a plain `subscribe` saw `(state, previous)` until `unsubscribe()` silenced it — with `subscribeWithSelector` for selector-scoped listeners.
- **`persist` writes on every change and rehydrates before the first render.** Measured: an empty in-memory store was restored from storage by `rehydrate()`. Version the payload, migrate old shapes, partialise the data, and never persist secrets or server data.
- **The slices pattern** keeps one store but several creators, with `StateCreator<AppState>` making cross-slice reads type-safe.
- **Server data does not belong in a store.** The moment you write `status`, `error`, dedupe and invalidation by hand, you are building a worse version of the next file.

---

**What's next →** [`06-server-state.md`](./06-server-state.md) deals with the kind of state all three tools in this part handle badly: data the server owns. It replaces Part 7's hand-written loading/error/caching code with `useQuery` and `useMutation`, and measures the parts that matter — two components sharing one request, a remount inside `staleTime` fetching nothing, a mutation invalidating the list, an optimistic delete that survives a failure, retry with exponential backoff, and `placeholderData` keeping the previous page on screen.
