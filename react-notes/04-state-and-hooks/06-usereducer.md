# 06 — `useReducer`: State That Changes in Many Ways

> **Part 4 · State and Hooks · File 6 of 10**
> Why this file exists: a cart is not one value that goes up and down. It is `add`, `remove`, `setQuantity`, `clear`, cap the quantity at 10, keep one line per product, remember what was just added so a toast can appear, and forget it again when the toast closes. Written with `useState`, those rules end up spread across five event handlers, and the sixth feature (a "buy again" button, a discount, a stock check) finds a rule that only two of them know. `useReducer` moves every rule into **one pure function** you can read top to bottom, test without React, and make exhaustive with TypeScript. This chapter dissects the lab's real cart reducer, proves its purity against a deeply frozen state object, and measures how three dispatches in one click still produce a single render.

---

## 1. The problem: rules without a home

Here is the cart, written the way most people write it first:

```tsx
function useCartWithState() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);

  const add = (product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => {
    const existing = lines.find((line) => line.productId === product.id);
    if (existing) {
      // rule: cap at 10 — must be repeated in every place that increases a quantity
      const quantity = Math.min(MAX_PER_LINE, existing.quantity + 1);
      setLines(lines.map((line) => (line.productId === product.id ? { ...line, quantity } : line)));
    } else {
      setLines([...lines, { productId: product.id, name: product.name, unitMinor: product.priceMinor, quantity: 1 }]);
    }
    setLastAddedName(product.name);
  };

  const setQuantity = (productId: string, quantity: number) => {
    // rule: clamp — repeated here…
    const clamped = Math.max(1, Math.min(MAX_PER_LINE, Math.trunc(quantity)));
    setLines(lines.map((line) => (line.productId === productId ? { ...line, quantity: clamped } : line)));
  };

  const remove = (productId: string) => setLines(lines.filter((line) => line.productId !== productId));
  const clear = () => {
    setLines([]);
    setLastAddedName(null); // …and remembered here, but not in `remove`
  };
  const dismissToast = () => setLastAddedName(null);

  return { lines, lastAddedName, add, remove, setQuantity, clear, dismissToast };
}
```

Nothing in that code is *wrong* today. The problem is structural, and it shows up as the feature list grows:

| Symptom | Where it comes from |
| --- | --- |
| The 10-item cap is implemented in two places and must stay in sync | logic is spread across handlers |
| `remove` leaves the toast showing a removed product's name | a transition forgot part of the state |
| `setLines(lines.map(...))` reads state directly — two rapid calls can lose an update | snapshot + no updater form (file 02) |
| You cannot test any rule without rendering a component | the logic lives inside a hook that needs React |
| A new rule ("sold-out products cannot be added") has five places to go | there is no single place that defines transitions |
| Reviewing "what can happen to a cart?" means reading five functions | the set of transitions is not written down anywhere |

A reducer is the refactor that fixes all six at once: **one function, one list of transitions, no React inside.**

---

## 2. What a reducer is

```ts
function reducer(state: State, action: Action): State
```

Three properties define it, and every benefit follows:

1. **It is pure.** Same `(state, action)` → same new state, no side effects, no mutation of the inputs.
2. **It takes an action, not instructions.** `{ type: 'add', product }` describes *what happened*, not *what to do*.
3. **It returns the next state.** It never changes the old one; it produces a new one (or returns the same reference to mean "nothing changed").

```text
        add keyboard            dispatch({ type: 'add', product })
  state ─────────────► NEW state  ──────────────────────────────►  React re-renders
        (pure function)                     (queued, batched)
```

**Actions are events, not commands.** This distinction is subtle and worth a minute:

| Naming style | Example | What it means | Consequence |
| --- | --- | --- | --- |
| Command-ish | `{ type: 'setQuantity', quantity: 12 }` | "make the quantity 12" | the reducer must still clamp, because the caller may be wrong |
| Event-ish | `{ type: 'quantityChanged', quantity: 12 }` | "the user asked for 12" | the reducer owns *all* the policy: 12 becomes 10, and just as importantly, the reason is written in one place |

Both styles ship in real codebases. The lab uses the command-ish style (`add`, `remove`, `setQuantity`, `clear`, `dismissToast`) because it reads well at call sites, and puts the *policy* (clamping, one line per product, clearing the toast on `clear`) inside the reducer — which is the part that matters. What you should avoid is a reducer that merely assigns fields:

```ts
// ❌ the reducer is a setter with extra steps: all policy leaks to the callers
case 'setQuantity': return { ...state, quantity: action.quantity };
```

---

## 3. The signature, and lazy initialisation

```ts
const [state, dispatch] = useReducer(reducer, initialArg, init?);
```

| Argument | Meaning |
| --- | --- |
| `reducer` | `(state, action) => state` — must be a **stable reference** (declare it at module scope, or above the component, never inline in the component body) |
| `initialArg` | the initial state, or an argument for `init` |
| `init` (optional) | a function that computes the initial state from `initialArg` — the lazy initialiser |

```tsx
const [state, dispatch] = useReducer(cartReducer, emptyCart);
const [state, dispatch] = useReducer(cartReducer, undefined, () => loadCartFromStorage());
```

**Verified** — the lazy form runs once, not once per render:

```text
7. three dispatches in one click handler
   item count : 3   renders: 2   (all three actions queued, one re-render)
   useReducer(cartReducer, undefined, lazyReducerInit): init ran 1x over 2 renders
```

⚠️ **The reducer must be stable.** `useReducer((s, a) => …, initial)` re-creates the function on every render; React keeps using the first one, which is fine — but calling anything from an unstable closure inside it captures stale values, and the linter's `exhaustive-deps`-style checks cannot help you if the function is anonymous and inline. Declare it where its inputs are visible: at module scope for pure logic (the lab's choice), or above the component if it must close over props.

---

## 4. The lab's cart, in full

**File: `src/state/cart.ts`** (complete, real code — nothing omitted)

```ts
// ---------------------------------------------------------------------------
// Cart state: a REDUCER (pure function) plus the actions that drive it.
// No React in this file — it is plain logic, so it can be unit-tested without
// a renderer (Part 13) and reused outside React if it ever needs to be.
// ---------------------------------------------------------------------------
import type { Product } from '../data/products';

export interface CartLine {
  productId: string;
  name: string;
  unitMinor: number;
  quantity: number;
}

export interface CartState {
  lines: readonly CartLine[];
  /** The product most recently added — drives the "added to cart" toast. */
  lastAddedName: string | null;
}

export type CartAction =
  | { type: 'add'; product: Pick<Product, 'id' | 'name' | 'priceMinor'> }
  | { type: 'remove'; productId: string }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'clear' }
  | { type: 'dismissToast' };

export const MAX_PER_LINE = 10;

export const emptyCart: CartState = { lines: [], lastAddedName: null };

/**
 * The reducer: (state, action) => newState. It NEVER mutates `state`; every
 * branch returns a new object (and a new `lines` array).
 */
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const { id, name, priceMinor } = action.product;
      const existing = state.lines.find((line) => line.productId === id);

      const lines = existing
        ? state.lines.map((line) =>
            line.productId === id
              ? { ...line, quantity: Math.min(MAX_PER_LINE, line.quantity + 1) }
              : line,
          )
        : [...state.lines, { productId: id, name, unitMinor: priceMinor, quantity: 1 }];

      return { lines, lastAddedName: name };
    }

    case 'remove':
      return { ...state, lines: state.lines.filter((line) => line.productId !== action.productId) };

    case 'setQuantity': {
      const quantity = Math.max(1, Math.min(MAX_PER_LINE, Math.trunc(action.quantity)));
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.productId === action.productId ? { ...line, quantity } : line,
        ),
      };
    }

    case 'clear':
      return emptyCart;

    case 'dismissToast':
      return { ...state, lastAddedName: null };

    default: {
      // If a new action is added to the union and not handled above, `action`
      // is no longer `never` and this line stops compiling.
      const unhandled: never = action;
      throw new Error(`Unhandled cart action: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Selectors: derived values, computed from state, never stored. */
export const cartItemCount = (state: CartState): number =>
  state.lines.reduce((total, line) => total + line.quantity, 0);

export const cartSubtotalMinor = (state: CartState): number =>
  state.lines.reduce((total, line) => total + line.unitMinor * line.quantity, 0);
```

Read it as a specification rather than code:

| Line / branch | The rule it encodes |
| --- | --- |
| `CartAction` union | the **complete** list of things that can happen to a cart |
| `MAX_PER_LINE = 10` | the one place the cap exists |
| `add` with `existing` | adding the same product increments its line instead of duplicating it |
| `Math.min(MAX_PER_LINE, …)` in `add` | the cap applies on every path that can increase a quantity |
| `existing ? … : […]` | a new product starts at quantity 1 |
| `add` returns `{ lines, lastAddedName: name }` | the toast is part of the same transition — they can never disagree |
| `remove` via `filter` | new array, untouched lines keep their identity |
| `setQuantity` clamps and truncates | `2.7 → 2`, `99 → 10`, `-4 → 1` — policy in one line, not in the UI |
| `clear` returns `emptyCart` | one definition of "empty", reusable and comparable |
| `default: never` | a compile error the day someone adds an action and forgets to handle it |
| selectors | `itemCount` and `subtotalMinor` are **derived**, never stored (files 01 and 07) |

**TypeScript note.** `const unhandled: never = action;` is the exhaustiveness check from Part 2: if every case is handled, `action` is narrowed to `never` and the assignment compiles; add a sixth action to the union and this line becomes `TS2322: Type '{ type: "applyCoupon"; … }' is not assignable to type 'never'`. **The compiler now knows the cart's rules**, which is exactly what a specification should do.

---

## 5. Purity, proven

A reducer is only useful if it is pure, because React may call it more than once (StrictMode), may discard a result (an interrupted render), and tests will replay it. The strongest proof available in JavaScript is to **freeze the input deeply** and dispatch: if the reducer mutated anything, the mutation would throw.

**Verified** — the harness built a deeply frozen state and ran the real reducer against it:

```text
6. cartReducer on a DEEPLY FROZEN state (no Object.freeze error = no mutation)
   input  : 1 line(s), Keyboard, count 1
   output : 2 lines, count 2, new object: true
   same action twice -> identical result: true
   impure reducer on the same frozen state threw:
     TypeError: Cannot add property 1, object is not extensible
```

Four facts in five lines:

1. **No `TypeError`** while running the real reducer on a frozen input → it mutated nothing. (If it had done `state.lines.push(...)`, V8 would have thrown exactly like the impure example below.)
2. **`new object: true`** → it returned a new state, which is what makes React's `Object.is` comparison see a change.
3. **`same action twice → identical result`** → it is deterministic; there is no `Date.now()`, no `Math.random()`, no I/O inside.
4. **The impure reducer throws**: `Cannot add property 1, object is not extensible` — the same thing that would happen if a real reducer tried to be clever.

Here is the impure reducer used for that fourth line, for contrast:

```ts
// ❌ a reducer that mutates its input
const impureReducer = (state: CartState, action: CartAction) => {
  if (action.type === 'add') {
    (state.lines as CartLine[]).push({ productId: 'p9', name: 'Cable', unitMinor: 39900, quantity: 1 });
  }
  return state; // same reference → React sees no change
};
```

Two bugs in one function: the caller's state changes behind its back (breaking every other reader, including the previous render's UI), and the returned reference is unchanged, so React may not re-render at all.

**Why purity is worth this much attention:**

| Benefit | Because the reducer is pure |
| --- | --- |
| Replayability | `reducer(reducer(s0, a1), a2)` can be recomputed anywhere, any number of times |
| Testability | plain assertions, no renderer, no DOM (Part 13) |
| Time-travel / logging | storing the action log is enough to reconstruct every past state |
| StrictMode-proof | the double invocation produces the same result |
| Concurrency-safe | React may start a render, abandon it, and start over |

---

## 6. `dispatch`: queued, batched, stable

`dispatch` looks like a setter, and behaves like one at the call site:

```tsx
dispatch({ type: 'add', product: { id: product.id, name: product.name, priceMinor: product.priceMinor } });
```

Three properties matter, all measured:

**1. Dispatches are queued and batched.** Three dispatches in one handler produce **one** render:

```text
7. three dispatches in one click handler
   item count : 3   renders: 2   (all three actions queued, one re-render)
```

Read that carefully: the count went to **3** — all three actions were applied, in order, on top of each other — while the component re-rendered **once**. This is the same batching as file 02, but with a crucial difference in *how* the operations compose: each action is applied to the result of the previous one (`add` three times increments the line three times), because React replays queued actions against the accumulating state. You do not need "the updater form" here; the reducer *is* the updater form.

**2. `dispatch` has a stable identity.** Measured across re-renders:

```text
9. identity of the update functions across re-renders
   dispatch from useReducer: same function on both renders? true
   (that stability is why a dispatch-based callback can list [] as its deps)
```

That is why every action creator in `useCart` can be wrapped in `useCallback(…, [])` — the only thing they touch, `dispatch`, never changes:

```ts
const add = useCallback(
  (product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => {
    dispatch({ type: 'add', product });
  },
  [],
);
```

**3. Actions describe the intent, and the reducer decides.** The call site stays a one-liner; the policy stays in one place.

⚠️ **Never dispatch during render.** Dispatching schedules a state update, which would trigger another render, and so on — the same rule as calling a setter during render (file 02, section 13). Dispatch from event handlers, effects, and async callbacks.

---

## 7. `useReducer` vs `useState`

There is no universal winner; the question is "where does the complexity live?".

| Situation | `useState` | `useReducer` |
| --- | --- | --- |
| One independent value (`query`, `isOpen`, a selected id) | ✅ perfect fit, less ceremony | overkill |
| A value that goes up and down (`count`, `+1`) | ✅ | overkill |
| Two or three related values that change together | workable, but transitions start to be repeated | ✅ one transition, one place |
| Many rules: clamping, deduplication, caps, derived flags | ❌ rules spread and drift | ✅ rules live in one function |
| State with a "shape" that changes (loading → error → ready) | ❌ booleans multiply | ✅ discriminated unions |
| Logic you want to unit-test without React | ❌ logic sits inside a hook | ✅ a pure module |
| Logic you want to reuse outside React (a worker, a Node script, offline sync) | ❌ | ✅ |
| A one-off boolean in a leaf component | ✅ | ❌ ceremony |
| A form with 20 independent fields | plain state per field (or a form library, Part 8) | a reducer can help when validation is interdependent |

A useful rule of thumb: **if you find yourself writing a fourth setter for the same concept, switch.** The lab's cart has five transitions over two fields with three rules — a reducer, clearly. `SearchBar`'s draft text has one field and one writer — `useState`, clearly. Both in the same codebase, side by side, is the healthy outcome.

---

## 8. The reducer + context pattern

File 05 measured that a context value must be memoised. A reducer pairs with that naturally, because `dispatch` is stable forever and the state changes only when the reducer says so. The canonical shape — **two contexts**, so that action-only consumers never re-render — looks like this:

```tsx
// src/context/cartContext.ts                    (the channel + hooks, no components)
import { createContext, useContext } from 'react';
import type { CartAction, CartState } from '../state/cart';

export const CartStateContext = createContext<CartState | null>(null);
export const CartDispatchContext = createContext<((action: CartAction) => void) | null>(null);

export function useCartState(): CartState {
  const state = useContext(CartStateContext);
  if (state === null) throw new Error('useCartState must be used inside <CartProviders>');
  return state;
}

export function useCartDispatch() {
  const dispatch = useContext(CartDispatchContext);
  if (dispatch === null) throw new Error('useCartDispatch must be used inside <CartProviders>');
  return dispatch;
}
```

```tsx
// src/context/CartProviders.tsx                 (one reducer, two providers)
export function CartProviders({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, emptyCart);

  // `state` and `dispatch` are already stable-per-change, so no useMemo is needed:
  // context compares them with Object.is and they change exactly when they should.
  return (
    <CartStateContext value={state}>
      <CartDispatchContext value={dispatch}>{children}</CartDispatchContext>
    </CartStateContext>
  );
}
```

```tsx
// a leaf that only acts — it never re-renders when the cart changes
export const AddToCartButton = memo(function AddToCartButton({ product }: { product: Product }) {
  const dispatch = useCartDispatch();
  return (
    <button type="button" disabled={product.stock <= 0} onClick={() => dispatch({ type: 'add', product })}>
      {product.stock <= 0 ? 'Notify me' : 'Add to cart'}
    </button>
  );
});
```

Read that last component with file 05's experiment in mind: its context value is `dispatch`, whose identity never changes, so this button never re-renders because of the cart — no matter how many products are in it.

**Which shape does the lab use?** The lab wraps the reducer in a **custom hook** (`useCart`, file 09) and exposes a memoised object through one context. That is easier to read while you are learning, and it is perfectly fine for a cart that changes on user actions. The two-context version is what you reach for when a grid of hundreds of components must not re-render, or when you want components to declare "I only act" in their imports. File 09 shows the hook-based version in full; Part 5 revisits the split when you build a larger state layer.

---

## 9. Testing a reducer without React

The reason the lab puts `cartReducer` in `src/state/cart.ts` (with **no React import**) is this file, which runs in milliseconds:

```ts
import { cartReducer, cartItemCount, cartSubtotalMinor, emptyCart, MAX_PER_LINE } from '../state/cart';

// add twice → one line, quantity 2
const once = cartReducer(emptyCart, { type: 'add', product: { id: 'p1', name: 'Keyboard', priceMinor: 499900 } });
const twice = cartReducer(once, { type: 'add', product: { id: 'p1', name: 'Keyboard', priceMinor: 499900 } });
console.assert(twice.lines.length === 1, 'adding the same product must not duplicate the line');
console.assert(twice.lines[0]?.quantity === 2, 'quantity should be 2');

// the cap is enforced by the reducer, not the UI
let capped = emptyCart;
for (let i = 0; i < 25; i += 1) {
  capped = cartReducer(capped, { type: 'add', product: { id: 'p1', name: 'Keyboard', priceMinor: 499900 } });
}
console.assert(capped.lines[0]?.quantity === MAX_PER_LINE, 'quantity is capped at 10');

// clamping handles nonsense input
const clamped = cartReducer(capped, { type: 'setQuantity', productId: 'p1', quantity: 99 });
console.assert(clamped.lines[0]?.quantity === MAX_PER_LINE, '99 → 10');

// derived values are consistent with the state that produced them
console.assert(cartItemCount(twice) === 2, 'item count');
console.assert(cartSubtotalMinor(twice) === 999800, 'subtotal in paise');

// "clear" really clears, including the toast flag
const cleared = cartReducer(twice, { type: 'clear' });
console.assert(cleared.lines.length === 0 && cleared.lastAddedName === null, 'clear resets everything');
```

Every one of those assertions corresponds to a line in the *user-facing* trace we measured in the browser-like environment (`/tmp/part4-app.txt`):

```text
2. clicked "Add to cart" on Mechanical Keyboard
   cart badge : 🛒 1
   total      : 1 item · ₹4,999.00
3. clicked the same button again
   quantities : 2   (one line, not two)
   total      : 2 items · ₹9,998.00
4. pressed "+" nine more times
   quantity   : 10
   "+" disabled at the cap : true
   total      : 10 items · ₹49,990.00
   pressing "+" again while disabled -> quantity stays 10
5. clicked "Remove"        → cart badge : 🛒 0, panel back to its empty state
7. clicked "Clear cart"    → lines : (none)
```

The UI is a *view* of the reducer's rules; the reducer is the rules. That separation is why the reducer can be tested 1000 times a second while the interaction test above takes half a minute to write.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Mutating `state` in the reducer | no re-render, or a wrong value appearing later (verified: `TypeError` on a frozen state) | return new objects/arrays |
| 2 | Returning `state` unchanged after "modifying" a nested field | React bails out; nothing appears on screen | copy the levels you touch |
| 3 | Side effects in the reducer (`fetch`, `localStorage`, `console.log`) | duplicated calls under StrictMode, surprises in tests | keep the reducer pure; run effects where the *result* is observed |
| 4 | Reducer inline in the component, re-created every render | fine for React (the first one is kept), but it captures stale values and cannot be memoised or tested | declare it at module scope |
| 5 | Dispatching during render | infinite loops, warnings | dispatch from handlers/effects |
| 6 | One giant reducer for the whole app | every action touches unrelated state; conflicts in git | one reducer per domain (`cartReducer`, `filtersReducer`), combined if needed |
| 7 | Actions that describe setters (`{ type: 'setState', patch }`) | all the policy leaks back to the call sites | actions describe events/intents |
| 8 | Forgetting a case in the `switch` | silently does nothing | `default: never` exhaustiveness |
| 9 | Storing derived values in the state (`itemCount`, `subtotalMinor`) | they drift; two sources of truth | selectors (pure functions) |
| 10 | Using a reducer for one boolean | ceremony, more code, no clarity | `useState` |
| 11 | Dispatching an action and immediately reading the new state | state updates are batched, not applied (file 02) | read it in the next render, or compute it locally |
| 12 | Mutating the action object in the reducer | surprising dependencies between dispatches | treat actions as read-only input |

---

## 11. Best practices

1. **Model the domain, not the UI.** `add`, `remove`, `setQuantity`, `clear` — not `setLines`, `toggleSpinner`.
2. **Keep every rule inside the reducer.** Clamping, deduplication and caps belong where the transition happens, so there is exactly one place to change.
3. **Start from the empty state.** `emptyCart` should be a constant, so "reset" is one assignment and tests start from a known place.
4. **Type actions as a discriminated union** and finish every `switch` with `default: never`.
5. **Keep the state flat and the lines/entities small.** Deep nesting makes every update a copy exercise.
6. **Write selectors** (`cartItemCount`, `cartSubtotalMinor`) for derived values and reuse them in components and tests.
7. **Keep the reducer in a React-free module** (`src/state/…`) so it can be tested, reused and read by people who do not know React.
8. **Name the file after the state it manages.** `cart.ts`, `filters.ts`, `checkout.ts`.
9. **Give the reducer a stable identity** (module scope) and wrap the surrounding API in a custom hook (file 09).
10. **Let the reducer own the "impossible" cases**: negative quantities, unknown ids, over-cap values. The UI should never have to guard them.

---

## 12. Real-world example: what the reducer buys the shop

| Rule | Where it lives now | What the UI looks like (measured) |
| --- | --- | --- |
| One line per product | `add`'s `existing` branch | clicking "Add to cart" twice shows `quantities: 2` and one line, not two |
| Cap at 10 per line | `add` and `setQuantity` | `quantity : 10`, `"+" disabled at the cap : true`, pressing it does nothing |
| Clamp nonsense input | `setQuantity` | `99 → 10`, `2.7 → 2`, `-4 → 1` |
| Removing a line | `remove` | `lines : (none)`, badge back to `🛒 0`, empty state visible |
| Clearing everything, including the toast | `clear` returns `emptyCart` | `lines : (none)` and no toast |
| Toast tied to the last add | `add` sets `lastAddedName`; `dismissToast` clears it | `toast : Mechanical Keyboard added to cart`, gone ~2.5 s later |
| Derived totals | selectors | `1 item · ₹4,999.00`, `2 items · ₹9,998.00`, `10 items · ₹49,990.00` |
| The cart survives a reload of the *page* (category does; the cart intentionally does not) | state, not storage | step 11 of the trace: the category chip is restored, the cart is empty |

Every row is one location in one file, verified both by unit-level assertions and by an interaction trace. That is the difference between "the cart works today" and "the cart's rules are written down".

---

## 13. Practice

### Beginner — a counter with an undo history

**File: `src/practice/counterReducer.ts`** and **`src/practice/CounterPanel.tsx`**.

State: `{ past: number[]; present: number; future: number[] }`. Actions: `{ type: 'increment' }`, `{ type: 'decrement' }`, `{ type: 'undo' }`, `{ type: 'redo' }`, `{ type: 'reset' }`.

Requirements:

- Pure reducer at module scope; `default: never`.
- `undo` moves `present` to `future` and pops `past`; `redo` does the reverse; both must be no-ops when their stack is empty.
- `CounterPanel` renders the value plus Undo/Redo buttons disabled when the stacks are empty (use a selector `canUndo(state)`).
- Then answer: why is the history *inside* the reducer rather than in three separate `useState` calls in the component?

### Intermediate — a filters reducer

The lab's `App` keeps `category` (persisted) and `query` (not persisted) in two `useState`s. Move them into `src/practice/filtersReducer.ts` with actions `{ type: 'categoryChanged'; category: CategoryChoice }`, `{ type: 'queryChanged'; query: string }`, `{ type: 'cleared' }`.

Requirements:

- `cleared` resets the query but **keeps** the category (a product decision — state it in a comment).
- A selector `visibleProducts(state, products)` returning the filtered list, so the filtering rule lives with the state it depends on.
- Wire it into a small `FilterPanel` component.
- Then extend it with `{ type: 'sortChanged'; sort: 'name' | 'price-asc' | 'price-desc' }` and a selector that applies the sort **after** the filter. Report how many files changed to add a whole new feature: the reducer, the selectors, one control in the panel — and zero changes in any component that only reads the result.

### Challenge — a checkout state machine

Design `src/practice/checkout.ts` for a four-step checkout, where the steps carry data and some orders of events are illegal.

```ts
type CheckoutState =
  | { step: 'cart'; lines: readonly CartLine[] }
  | { step: 'address'; lines: readonly CartLine[]; address: string }
  | { step: 'payment'; lines: readonly CartLine[]; address: string }
  | { step: 'placing'; lines: readonly CartLine[]; address: string; cardLast4: string }
  | { step: 'placed'; orderId: string; totalMinor: number }
  | { step: 'failed'; message: string; recoverTo: CheckoutState };
```

Actions: `started` (the cart's lines arrive from the cart reducer), `addressSubmitted`, `paymentSubmitted`, `orderPlaced`, `orderFailed`, `back`, `cancel`.

Requirements:

- The reducer must **reject** illegal transitions (e.g. `paymentSubmitted` while in `cart`) by returning the same state unchanged — and a comment must say why returning `state` is correct rather than throwing.
- `orderFailed` must store enough information to retry (hence `recoverTo`), and `back` must work from `payment` → `address` without losing the typed address.
- Every `switch` ends with `default: never`.
- Write at least eight assertions in a test file (`src/practice/checkout.test.ts` style, plain `console.assert` is fine) covering the legal path and three illegal transitions.
- Finally, answer: `totalMinor` exists only in the `placed` state. What are the two reasons that is better than computing it from `lines` at that point? (Hint: one reason is about the union being the *record* of what happened; the other is about the lines no longer being needed.)

---

## 14. Solutions

### Beginner

**File: `src/practice/counterReducer.ts`**

```ts
export interface CounterState {
  past: readonly number[];
  present: number;
  future: readonly number[];
}

export type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

export const initialCounter: CounterState = { past: [], present: 0, future: [] };

function push(state: CounterState, next: number): CounterState {
  // Every real change pushes the old value onto the past and drops the redo stack.
  return { past: [...state.past, state.present], present: next, future: [] };
}

export function counterReducer(state: CounterState, action: CounterAction): CounterState {
  switch (action.type) {
    case 'increment':
      return push(state, state.present + 1);
    case 'decrement':
      return push(state, state.present - 1);
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state; // nothing to undo: same reference = no re-render
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case 'reset':
      return initialCounter;
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled counter action: ${JSON.stringify(unhandled)}`);
    }
  }
}

export const canUndo = (state: CounterState): boolean => state.past.length > 0;
export const canRedo = (state: CounterState): boolean => state.future.length > 0;
```

**File: `src/practice/CounterPanel.tsx`**

```tsx
import { useReducer } from 'react';
import { canRedo, canUndo, counterReducer, initialCounter } from './counterReducer';

export function CounterPanel() {
  const [state, dispatch] = useReducer(counterReducer, initialCounter);

  return (
    <section>
      <output>{state.present}</output>
      <button type="button" onClick={() => dispatch({ type: 'decrement' })}>
        −
      </button>
      <button type="button" onClick={() => dispatch({ type: 'increment' })}>
        +
      </button>
      <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo(state)}>
        Undo
      </button>
      <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo(state)}>
        Redo
      </button>
      <button type="button" onClick={() => dispatch({ type: 'reset' })}>
        Reset
      </button>
    </section>
  );
}
```

Answer to the closing question: the three parts of the history (`past`, `present`, `future`) must always agree — every change touches all three at once. Spread across three `useState` calls, each handler would have to update three setters in the right order, and a single missed update leaves the stacks inconsistent (for example, `past` grows while `future` is not cleared, so a *redo* resurrects a value that the user already replaced). As one reducer value, the three parts change in a single transition, tests can drive them directly, and the invariant "past + present + future = one linear history" holds by construction.

### Intermediate

**File: `src/practice/filtersReducer.ts`**

```ts
import { CATEGORIES, type Category, type Product } from '../data/products';

export type CategoryChoice = Category | 'all';
export type SortKey = 'name' | 'price-asc' | 'price-desc';

export interface FiltersState {
  category: CategoryChoice;
  query: string;
  sort: SortKey;
}

export type FiltersAction =
  | { type: 'categoryChanged'; category: CategoryChoice }
  | { type: 'queryChanged'; query: string }
  | { type: 'sortChanged'; sort: SortKey }
  | { type: 'cleared' };

export const initialFilters: FiltersState = { category: 'all', query: '', sort: 'name' };

export function filtersReducer(state: FiltersState, action: FiltersAction): FiltersState {
  switch (action.type) {
    case 'categoryChanged':
      return { ...state, category: action.category };
    case 'queryChanged':
      return { ...state, query: action.query };
    case 'sortChanged':
      return { ...state, sort: action.sort };
    case 'cleared':
      // Product decision: clearing the search must NOT silently change which
      // category the shopper is browsing — only the text field is cleared.
      return { ...state, query: '' };
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled filters action: ${JSON.stringify(unhandled)}`);
    }
  }
}

const collator = new Intl.Collator('en-IN');

/** Filter first, then sort — and always on a COPY, never on the props array. */
export function visibleProducts(state: FiltersState, products: readonly Product[]): Product[] {
  const needle = state.query.trim().toLowerCase();

  const filtered = products.filter((product) => {
    const matchesCategory = state.category === 'all' || product.category === state.category;
    const matchesQuery =
      needle === '' || product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle);
    return matchesCategory && matchesQuery;
  });

  switch (state.sort) {
    case 'name':
      return [...filtered].sort((a, b) => collator.compare(a.name, b.name));
    case 'price-asc':
      return [...filtered].sort((a, b) => a.priceMinor - b.priceMinor);
    case 'price-desc':
      return [...filtered].sort((a, b) => b.priceMinor - a.priceMinor);
    default: {
      const unhandled: never = state.sort;
      throw new Error(`Unhandled sort: ${String(unhandled)}`);
    }
  }
}

export const availableCategories = (): readonly CategoryChoice[] => ['all', ...CATEGORIES];
```

Adding the sort feature touched: this file (one action, one field, one `switch`), the panel (one control), and nothing else — every component that displays the list reads `visibleProducts(state, products)` and needed no change. That is the payoff: rules are additive, in one place.

### Challenge

**File: `src/practice/checkout.ts`** (verified: `npx tsc -b` is silent)

```ts
// Chapter 06 challenge — a checkout state machine as a pure reducer.
// No React here on purpose: this file is plain logic and can be tested directly.
import type { CartLine } from '../state/cart';

export type CheckoutState =
  | { step: 'cart'; lines: readonly CartLine[] }
  | { step: 'address'; lines: readonly CartLine[]; address: string }
  | { step: 'payment'; lines: readonly CartLine[]; address: string }
  | { step: 'placing'; lines: readonly CartLine[]; address: string; cardLast4: string }
  | { step: 'placed'; orderId: string; totalMinor: number }
  | { step: 'failed'; message: string; recoverTo: CheckoutState };

export type CheckoutAction =
  | { type: 'started'; lines: readonly CartLine[] }
  | { type: 'addressSubmitted'; address: string }
  | { type: 'paymentSubmitted'; cardLast4: string }
  | { type: 'orderPlaced'; orderId: string; totalMinor: number }
  | { type: 'orderFailed'; message: string }
  | { type: 'back' }
  | { type: 'cancel' };

export const emptyCheckout: CheckoutState = { step: 'cart', lines: [] };

export function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    case 'started':
      // Starting a new checkout replaces whatever came before it.
      return { step: 'address', lines: action.lines, address: '' };

    case 'addressSubmitted': {
      // Illegal from anywhere except the address step: returning `state`
      // unchanged is correct here (it is a no-op, not an error), and because the
      // reference is identical React will not re-render.
      if (state.step !== 'address' || action.address.trim() === '') return state;
      return { step: 'payment', lines: state.lines, address: action.address.trim() };
    }

    case 'paymentSubmitted':
      if (state.step !== 'payment') return state;
      return { step: 'placing', lines: state.lines, address: state.address, cardLast4: action.cardLast4 };

    case 'orderPlaced':
      if (state.step !== 'placing') return state;
      // The lines are dropped here on purpose: the order id + total are the
      // record of what actually happened, and the live cart is no longer needed.
      return { step: 'placed', orderId: action.orderId, totalMinor: action.totalMinor };

    case 'orderFailed':
      if (state.step !== 'placing') return state;
      // Enough context to retry without re-entering anything.
      return { step: 'failed', message: action.message, recoverTo: { ...state, step: 'payment' } };

    case 'back':
      switch (state.step) {
        case 'address':
          return { step: 'cart', lines: state.lines };
        case 'payment':
          // The address survives the trip backwards.
          return { step: 'address', lines: state.lines, address: state.address };
        case 'placing':
          // Back during a request: the card is NOT carried into the payment step
          // (only 'placing' has a cardLast4 field) — the union decides this, and
          // the component must ask the user to re-enter it or to wait.
          return { step: 'payment', lines: state.lines, address: state.address };
        case 'cart':
        case 'placed':
        case 'failed':
          return state; // nothing sensible to go back to
        default: {
          const unhandled: never = state;
          throw new Error(`Unhandled checkout step: ${JSON.stringify(unhandled)}`);
        }
      }

    case 'cancel':
      return emptyCheckout;

    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled checkout action: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** The promised total: derived from the lines while shopping, historical once placed. */
export const checkoutTotalMinor = (state: CheckoutState): number => {
  switch (state.step) {
    case 'cart':
    case 'address':
    case 'payment':
    case 'placing':
      return state.lines.reduce((total, line) => total + line.unitMinor * line.quantity, 0);
    case 'placed':
      return state.totalMinor;
    case 'failed':
      return checkoutTotalMinor(state.recoverTo);
    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled checkout step: ${JSON.stringify(unhandled)}`);
    }
  }
};
```

**Notice the line that had to change while writing it.** The first draft of `back` from `placing` returned the card number along with the payment step:

```ts
// ❌ TS2322 / TS2353: 'cardLast4' does not exist on the 'payment' variant
return { step: 'payment', lines: state.lines, address: state.address, cardLast4: state.cardLast4 };
```

The union rejected it, because "payment with a card number already known" is not a state this design allows. That is not the compiler being pedantic — it forced a real product decision ("if the user goes back during a request, they re-enter the card") to be made explicitly instead of being smuggled in as an extra field. If the design *needed* the card to survive, the fix would be to add `cardLast4` to the `payment` variant, and then the `back` case would compile.

**The assertions** (`src/dev/checkout-probe.ts`, run with `npx tsx --tsconfig tsconfig.app.json src/dev/checkout-probe.ts`) — verified output:

```text
ok   start from the cart
ok   paying from the cart is rejected
ok   started → address
ok   total while in address
ok   an empty address is rejected
ok   address trimmed and accepted
ok   back keeps the address
ok   payment → placing
ok   placing → failed
ok   back from failed is a no-op
ok   retry from recoverTo works
ok   order placed keeps the historical total
ok   cancelling after placing goes back to an empty cart

13/13 assertions passed
```

Thirteen assertions on a state machine that has six states and seven actions — and they run in milliseconds, with no renderer, no DOM and no waiting. That ratio (cheap tests covering the rules completely) is the strongest argument for putting logic in reducers.

Answer to the closing question: first, `totalMinor` in the `placed` state is the **historical record** — it is what was actually charged, and it must not change if the catalogue's prices change later or if the cart is emptied while the confirmation screen is visible. Deriving it from `lines` at render time would tie the receipt to live data. Second, the lines are no longer needed after the order is placed, so the union lets the state **drop** them: the confirmation screen cannot accidentally render a live cart quantity, and the state is smaller and simpler. `checkoutTotalMinor` shows both halves: it sums `lines` while shopping and reads the stored number once the order is placed.

---

## 15. Summary

- `useReducer` replaces many setters with **one pure function**: `(state, action) => newState`.
- Actions describe **what happened**; the reducer owns **all the policy** (clamping, deduplication, caps, clearing related fields).
- Returning the **same reference** means "nothing changed" — a legitimate and useful no-op for illegal transitions.
- **Purity is checkable**: a deeply frozen state proves no mutation happened (measured: no `TypeError`, a new object, identical replays), and an impure reducer throws `Cannot add property 1, object is not extensible`.
- `dispatch` is **stable** and **batched**: three dispatches in one handler → three actions applied, **one** re-render.
- Type actions as a **discriminated union**, finish every `switch` with `default: never`, and let the compiler tell you when a new action has no home.
- Keep **derived values out of state**; write selectors (`cartItemCount`, `cartSubtotalMinor`) as pure functions.
- Put the reducer in a **React-free module** so it can be tested in milliseconds, reused outside React, and read as a specification.
- Choose `useState` for one independent value; choose `useReducer` when transitions multiply, when values must change together, or when the logic deserves tests.
- Pair the reducer with **context** (two contexts: state and dispatch) when many components need it — action-only consumers then never re-render.

---

**What's next →** [`07-usememo.md`](./07-usememo.md): memoisation. We will measure a computation that runs once with `useMemo` and three times without it, prove that a memoised array keeps its identity across renders while a plain one does not, catch the classic "my memo never hits because the dependency is rebuilt every render", and be honest about when `useMemo` is pure overhead — including what React Compiler changes about this whole conversation.
