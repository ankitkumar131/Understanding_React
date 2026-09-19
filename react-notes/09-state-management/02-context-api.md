# 02 — Context API as a State Tool

> **Part 9 · State Management · File 2 of 6**

Why this file exists: Part 5, file 09 introduced `createContext` and `useContext`, and this file assumes you have read it. What that file could not cover is the part that only matters once context is used for *state* rather than for a theme string: **when does a consumer re-render, and why?** The answer is one sentence long, and almost every "context is slow" story in a React codebase comes from not knowing it. This file states the rule, then measures it — the same cart published four different ways, with render counts printed for each — and finishes with the pattern that makes context a legitimate state manager: a reducer for the transitions, a split for the delivery, and a custom hook for the callers.

---

## 1. Context transports; it does not store

A context object is a labelled pipe. A provider puts a value into the pipe; `useContext` reads the nearest value above the reader. Nothing in that description is about state: the value could be a constant, a function, a router, a formatter, or a `useState` value that happens to change.

```tsx
const ThemeContext = createContext<'light' | 'dark'>('light'); // the pipe
const theme = 'dark';                                          // the value (not state!)
<ThemeContext value={theme}>…</ThemeContext>;                   // into the pipe
const theme = useContext(ThemeContext);                        // out of the pipe
```

Everything important follows from one consequence of that design: **a context has no way to know which part of its value a consumer read.** It compares the whole value by identity (`Object.is`) and, if it changed, re-renders every consumer below it. React has no "this consumer only wanted `state.coupon`" information, because `useContext` returns the value the provider gave it, not a projection of it.

Compare that with a store (file 05), where a consumer subscribes with a *selector* — `useCartStore((state) => state.items.length)` — so the store knows what was read and can skip the rest.

That single difference explains:

- why a provider that rebuilds its value object on every render re-renders the entire subtree,
- why a coupon change re-renders a badge that never reads the coupon (measured below),
- why the fixes are "memoise the value" and "split the contexts" rather than "read less".

---

## 2. The rule, stated once

> **Every consumer of a context re-renders when the value's identity changes — regardless of which parts of the value it read.**

Three corollaries:

1. **Values that are primitives are stable by identity.** `value={count}` (a number) only changes when the number changes. `value={{ count }}` (an object) is a new object on every render, so it changes whenever the provider renders — including for reasons that have nothing to do with `count`.
2. **`dispatch` from `useReducer` is stable for the lifetime of the component.** It is safe to put in a context on its own; React guarantees the function never changes.
3. **Reducers keep untouched branches by reference** (`{ ...state, coupon }` leaves `state.items` identical), which is what makes "split by concern" effective: a per-slice context only changes when its slice's identity changes.

⚠️ The first corollary is the one that bites. It is not that `{ count }` is *wrong*; it is that it makes the provider's value unstable for reasons the consumer cannot see, and the symptom appears somewhere else entirely (a "why does this re-render?" question two months later).

---

## 3. The same cart, published four ways

The example is the shop-admin cart from file 01 — `items` plus a `coupon` — and the same reducer is published through four different context setups:

```text
src/part9/
├── cartModel.ts       ← CartItem, summarize(), formatMoney() — shared by every variant
├── cartReducer.ts     ← the reducer and its action creators
├── CartContext.tsx    ← four providers + their consumers (this file)
└── renderLog.ts       ← probe helper: counts component renders by label
```

The reducer is the one from file 01, unchanged:

```ts
// src/part9/cartReducer.ts
export type CartAction =
  | { type: 'cart/itemAdded'; item: CartItem }
  | { type: 'cart/itemRemoved'; id: string }
  | { type: 'cart/quantitySet'; id: string; qty: number }
  | { type: 'cart/couponApplied'; coupon: string | null }
  | { type: 'cart/cleared' };

export const initialCartState: CartState = { items: [], coupon: null };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'cart/itemAdded': {
      const existing = state.items.find((line) => line.id === action.item.id);
      return {
        ...state,
        items: existing
          ? state.items.map((line) => (line.id === action.item.id ? { ...line, qty: line.qty + action.item.qty } : line))
          : [...state.items, action.item],
      };
    }
    case 'cart/itemRemoved':
      return { ...state, items: state.items.filter((line) => line.id !== action.id) };
    case 'cart/quantitySet':
      return {
        ...state,
        items:
          action.qty <= 0
            ? state.items.filter((line) => line.id !== action.id)
            : state.items.map((line) => (line.id === action.id ? { ...line, qty: action.qty } : line)),
      };
    case 'cart/couponApplied':
      return { ...state, coupon: action.coupon };
    case 'cart/cleared':
      return initialCartState;
    default:
      assertNever(action);
      return state;
  }
}
```

### Variant 1 — one context, value built in the body (the pitfall)

```tsx
// src/part9/CartContext.tsx
interface CartValue {
  state: CartState;
  dispatch: Dispatch<CartAction>;
  addByName: (item: CartItem) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const CartContext = createContext<CartValue | null>(null);

export function NaiveCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const addByName = useCallback((item: CartItem) => dispatch(addItem(item)), []);
  const toggleTheme = useCallback(() => setTheme((current) => (current === 'light' ? 'dark' : 'light')), []);

  // ⚠️ A fresh object on every provider render.
  const value: CartValue = { state, dispatch, addByName, theme, toggleTheme };
  return <CartContext value={value}>{children}</CartContext>;
}
```

### Variant 2 — the same value, memoised

```tsx
export function MemoCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const addByName = useCallback((item: CartItem) => dispatch(addItem(item)), []);
  const toggleTheme = useCallback(() => setTheme((current) => (current === 'light' ? 'dark' : 'light')), []);

  // ✅ The object identity only changes when one of its inputs does.
  const value = useMemo<CartValue>(
    () => ({ state, dispatch, addByName, theme, toggleTheme }),
    [state, addByName, theme, toggleTheme],
  );
  return <CartContext value={value}>{children}</CartContext>;
}
```

### Variant 3 — split into state and dispatch

```tsx
const CartStateContext = createContext<CartState | null>(null);
const CartDispatchContext = createContext<Dispatch<CartAction> | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  return (
    <CartStateContext value={state}>
      <CartDispatchContext value={dispatch}>{children}</CartDispatchContext>
    </CartStateContext>
  );
}

export function useCartState(): CartState {
  const state = useContext(CartStateContext);
  if (state === null) throw new Error('useCartState must be used inside <CartProvider>');
  return state;
}

export function useCartDispatch(): Dispatch<CartAction> {
  const dispatch = useContext(CartDispatchContext);
  if (dispatch === null) throw new Error('useCartDispatch must be used inside <CartProvider>');
  return dispatch;
}
```

### Variant 4 — one context per concern

```tsx
const ItemsContext = createContext<CartItem[] | null>(null);
const CouponContext = createContext<string | null | undefined>(undefined);

export function SlicedCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  // Each concern gets its own context, so a change to one cannot wake up the
  // readers of the other. `state.items` keeps its identity unless it changed.
  const items = useMemo(() => state.items, [state.items]);
  return (
    <ItemsContext value={items}>
      <CouponContext value={state.coupon}>
        <CartDispatchContext value={dispatch}>{children}</CartDispatchContext>
      </CouponContext>
    </ItemsContext>
  );
}
```

Note `<CartStateContext value={state}>` — dropping `.Provider`. React 19 lets the context object be the provider directly; both spellings work, and the shorter one is what the React 19 docs use. (The lab's `auth/authContext.tsx` from Part 6 uses it too.)

---

## 4. Measured: the naive provider

The probe in `src/dev/context-probe.tsx` renders all four trees at once and counts how many times each labelled component body runs. Runs are printed unedited:

```text
=== C. 1. Naive provider: adding to the cart ===
   clicked "Add Desk Lamp" → NaiveCartBadge=1 NaiveAddButton=1 ThemeToggleButton=1
   the dispatch-only button re-rendered because the value object is new

=== D. 2. Naive provider: toggling the theme (nothing to do with the cart) ===
   clicked "Toggle theme" → NaiveCartBadge=1 NaiveAddButton=1 ThemeToggleButton=1
   the cart badge re-rendered for a theme change: every consumer wakes up
```

Reading these two measurements:

- **The add button re-rendered although it only wants `dispatch`.** It reads `const { dispatch } = useCartValue()`, so it consumes the whole context. A new object identity is, to the context, a new value — so the button re-renders even though `dispatch` is the same function it had before. Multiply by the number of consumers in a real app and this is the entire "context is slow" reputation.
- **The theme toggle re-rendered the cart badge.** This is the clearest demonstration of the rule in section 1: the badge reads `state.items`, and it re-rendered because `theme` changed — because both live in one value object, and the pipe delivers the whole object to everyone.

Neither symptom is a bug in React. Both are exactly what "value identity changed" means, and both have a one-line fix — but only if you know which one you are applying.

---

## 5. The fix everyone tries first: `useMemo`

```text
=== E. 3. useMemo around the value: does it help? ===
   memo + "Add Desk Lamp" → NaiveCartBadge=1 NaiveAddButton=1 ThemeToggleButton=1
   (the cart state really changed, so a re-render here is correct)
   memo + "Toggle theme" → NaiveCartBadge=1 NaiveAddButton=1 ThemeToggleButton=1
   still re-rendering: the memo input (theme) changed, so the value changed.
   useMemo stops CHANGES you did not cause; it cannot stop the ones you did.
```

`useMemo` fixes one specific problem: **the provider re-rendering without any of its inputs changing.** If a parent re-renders, or a state value is set to the same value, an unmemoised provider hands down a fresh object and wakes every consumer. In that case `useMemo` is exactly right and the consumers stop re-rendering.

What it cannot fix is a change that *genuinely happened inside the value*. `theme` is part of this value, so toggling the theme changes the memo's dependency array, so the value changes, so every consumer re-renders. That is not a memoisation failure; it is the object being too big.

💡 So there are two different problems and two different fixes:

| Problem | Symptom | Fix |
| --- | --- | --- |
| Provider re-renders with no input change | consumers spin for "no reason" | `useMemo` the value |
| The value holds several unrelated concerns | a change to one concern wakes the others | **split the contexts** |

`useMemo` is worth doing anyway as cheap insurance, but splitting is the fix that scales — and the measurements below show why.

---

## 6. The real fix, part 1: state and dispatch in separate contexts

```text
=== F. 4. Split state/dispatch: adding to the cart ===
   clicked "Add Desk Lamp" → ContextCartBadge=1 ContextCartTotal=1 ContextCouponBox=1
   the dispatch-only button did NOT re-render (it never reads state)
```

Compare with the naive run: the same click now produces **three** renders instead of four, and the one that disappeared is the button. `ContextAddButton` is:

```tsx
export function ContextAddButton({ item }: { item: CartItem }) {
  noteRender('ContextAddButton');
  const dispatch = useCartDispatch(); // dispatch only — never reads state
  return (
    <button type="button" data-testid="ctx-add" onClick={() => dispatch(addItem(item))}>
      Add {item.name}
    </button>
  );
}
```

It consumes `CartDispatchContext`, whose value is `dispatch` — a function that React keeps identical for the life of the component. Identity unchanged → no re-render, no matter how many times the cart changes. In a real app that is every "Add to cart" button, every action button in a toolbar, every "open modal" trigger: components that *do* something but *read* nothing.

⚠️ Note why this works at all: it works because the *value* is a stable function. The same split done with an inline object (`value={{ dispatch }}`) would fix nothing. The fix is the stable value, plus putting it in its own context so the unstable one (state) cannot drag it along.

Now the second half of the split's benefit — and its limit:

```text
=== G. 5. Split state/dispatch: applying a coupon ===
   clicked "Apply SAVE20" → ContextCartBadge=1 ContextCartTotal=1 ContextCouponBox=1
   the badge re-rendered even though it does not read the coupon:
   state is ONE object, so a change to any field is a change to the value
```

The coupon change re-rendered the badge, which reads `items` and nothing else. The reducer was careful (`{ ...state, coupon }` left `state.items` untouched, by reference), but the *context* is not the reducer: it publishes the whole `CartState` object, and that object is new. This is the case where "split by concern" earns its name.

---

## 7. The real fix, part 2: one context per concern

```text
=== H. 6. Sliced by concern: applying a coupon ===
   clicked "Apply SAVE20" → SlicedCouponBox=1
   only the coupon reader re-rendered; the badge and the buttons stayed put

=== I. 7. Sliced by concern: adding to the cart ===
   clicked "Add Desk Lamp" → SlicedCartBadge=1
   the items reader re-rendered; the coupon reader and both buttons did not
```

Two clicks, two renders total — each one in the component that read the thing that changed. The sliced provider does nothing clever; it just stops putting unrelated values in one pipe:

```tsx
const ItemsContext = createContext<CartItem[] | null>(null);
const CouponContext = createContext<string | null | undefined>(undefined);
const CartDispatchContext = createContext<Dispatch<CartAction> | null>(null);

export function SlicedCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  const items = useMemo(() => state.items, [state.items]);
  return (
    <ItemsContext value={items}>
      <CouponContext value={state.coupon}>
        <CartDispatchContext value={dispatch}>{children}</CartDispatchContext>
      </CouponContext>
    </ItemsContext>
  );
}

export function SlicedCartBadge() {
  const items = useContext(ItemsContext);
  if (items === null) throw new Error('SlicedCartBadge must be used inside <SlicedCartProvider>');
  return <span data-testid="sliced-badge">{summarize(items).units} units</span>;
}
```

(A library called `use-context-selector` makes this unnecessary by letting a consumer subscribe to a *selected slice* of one context — at the cost of a dependency and of context behaving like a store. If you find yourself needing it, that is the signal to reach for file 05's tool instead.)

### When the update is skipped entirely

There is one more case worth knowing, because it explains why some clicks render nothing at all:

```text
=== K. 9. Same value, no re-render: React bails out when the context value is unchanged ===
   clicked "Apply SAVE20" again → (no renders)
   the reducer produced a new state object, but the coupon string is the same
   value, so React skipped the update and no consumer re-rendered
```

The reducer ran, produced a new `CartState` object, and `SlicedCouponProvider` still published the *same string* `'SAVE20'`. React compares the published value with `Object.is`, finds it identical, and does not re-render the consumers. This is the same mechanism that makes "return the same reference for no-op" worth following in a reducer (file 01, section 5): a context is only as noisy as the values you publish.

⚠️ One trap here: React may still re-render the provider's *children* once and then bail out of the descendants. Bail-outs are a performance detail, not a correctness guarantee — never rely on them for logic (for example, do not assume a consumer's `useEffect` will not run).

---

## 8. The complete pattern: context + `useReducer`

This is the shape to use when state must be app-wide, low-frequency, and read by many components. It is the cart, complete:

```text
src/part9/
├── cartModel.ts       ← types + pure helpers (summarize, formatMoney)
├── cartReducer.ts     ← state + actions + reducer (pure, testable, no React)
└── CartContext.tsx    ← provider, two contexts, two hooks, the consumers
```

```tsx
// src/part9/CartContext.tsx (the provider, trimmed to the essentials)
const CartStateContext = createContext<CartState | null>(null);
const CartDispatchContext = createContext<Dispatch<CartAction> | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  return (
    <CartStateContext value={state}>
      <CartDispatchContext value={dispatch}>{children}</CartDispatchContext>
    </CartStateContext>
  );
}

export function useCartState(): CartState {
  const state = useContext(CartStateContext);
  if (state === null) throw new Error('useCartState must be used inside <CartProvider>');
  return state;
}

export function useCartDispatch(): Dispatch<CartAction> {
  const dispatch = useContext(CartDispatchContext);
  if (dispatch === null) throw new Error('useCartDispatch must be used inside <CartProvider>');
  return dispatch;
}
```

```tsx
// Using it
function CartHeader() {
  const { items } = useCartState();          // reads state, re-renders when it changes
  const { totalMinor } = summarize(items);   // derived, not stored
  return (
    <header>
      <span>{items.length} lines</span>
      <span>{formatMoney(totalMinor)}</span>
    </header>
  );
}

function QuickAddButton({ product }: { product: ApiProduct }) {
  const dispatch = useCartDispatch();        // writes, never re-renders on state changes
  return (
    <button type="button" onClick={() => dispatch(addItem(itemFromProduct(product)))}>
      Quick add
    </button>
  );
}
```

### Line by line

- `createContext<CartState | null>(null)` — the `null` default is deliberate. A real default would hide the mistake of rendering a consumer outside the provider; `null` plus the throw makes it a startup error with a readable message.
- `useReducer(cartReducer, initialCartState)` — the transitions live in a pure function in their own file, so they can be tested with no React at all (file 01, section 5).
- `value={state}` for one context and `value={dispatch}` for the other: two pipes, two independent identities.
- `useCartState` / `useCartDispatch` — components never touch `useContext` or the context objects directly. That is deliberate, for three reasons:
  1. the throw is written once instead of at every call site;
  2. if the provider is later split, memoised, or swapped for a store, only this file changes;
  3. tests can wrap a component in `<CartProvider>` and get exactly the same API production has.
- `summarize(items)` inside `CartHeader` — the total is derived on every render. The alternative (a `total` field kept in sync in the reducer) is the drift bug from file 01, section 1, wearing a context costume.

### Provider composition

Nesting providers by hand gets ugly at four or five levels. Two standard escapes:

```tsx
// 1. A single component that owns the app's providers.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <ToastProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </ToastProvider>
      </CartProvider>
    </AuthProvider>
  );
}

// 2. A tiny compose helper, if you prefer data over JSX.
const compose = (...providers: Array<ComponentType<{ children: ReactNode }>>) =>
  providers.reduce((Accumulated, Provider) => {
    function Composed({ children }: { children: ReactNode }) {
      return (
        <Accumulated>
          <Provider>{children}</Provider>
        </Accumulated>
      );
    }
    return Composed;
  });
```

Order matters in exactly one situation: a provider that *uses* another context must be below it (`CartProvider` that reads `useAuth()` must sit inside `AuthProvider`). Everything else is arbitrary, so pick an order and keep it.

---

## 9. Context in the wild

Every serious React app already has several of these, and noticing them is the quickest way to stop being afraid of context:

| Provider | What it transports | Changes how often? |
| --- | --- | --- |
| React Router's `BrowserRouter` | the current location and router functions | every navigation |
| TanStack Query's `QueryClientProvider` | the cache client | never |
| `AuthProvider` (Part 6) | `{ user, signIn, signOut }` | at login/logout |
| `ThemeProvider` | `'light' | 'dark'` and a toggle | rarely |
| `I18nProvider` | locale + translator function | on language change |
| `ToastProvider` | `showToast()` + the queue | per toast |
| `FeatureFlagsProvider` | flags fetched at boot | once |
| react-hook-form's `FormProvider` | the form's `control` | never (the value is stable) |

The lab's auth context, from Part 6, is a textbook small provider — note the memoised value and the custom hook:

```tsx
// src/auth/authContext.tsx (Part 6, unchanged)
const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? null : (JSON.parse(stored) as User);
  });

  const signIn = useCallback((email: string) => { /* … */ }, []);
  const signOut = useCallback(() => { /* … */ }, []);

  const value = useMemo<AuthValue>(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
```

What makes it good: two contexts' worth of concerns would be worse, but it is only *one* concern (`user` + the two functions that change it), the functions are `useCallback`-stable, the value is memoised, and callers use `useAuth()` rather than the raw context.

---

## 10. When **not** to use context

| Situation | Why context is wrong | Use instead |
| --- | --- | --- |
| State changes many times per second (mouse position, a drag, a canvas) | every consumer re-renders on every change — context has no selector | `useSyncExternalStore` / a store (file 05), or keep it local |
| Exactly one component reads it | the provider is a wrapper around a prop | props |
| Two levels of components | drilling is cheaper and visible in the JSX | props |
| Server data | context has no staleness, no retry, no deduplication, no invalidation | a query cache (file 06) |
| The value is a big fleet of unrelated things ("global app state") | one change re-renders everyone (measured in sections 4 and 6) | split by concern, or a store |
| You need to read it outside React (router loader, WebSocket handler) | `useContext` is a hook | a store's `getState()` |
| It is state that should be in the URL | context dies on refresh | `useSearchParams` |

The one-line test from Part 5 applies: **"if I deleted the provider, would the app still be describable?"** A theme provider can be deleted. A `GlobalStateProvider` that holds the cart, the user, the filters and the modal flags cannot — which is the sign it is doing a store's job.

💡 If a value is *read* everywhere but *written* rarely, context is usually right. If it is *written* from many places, or read through projections, a store with selectors (file 05) is usually better.

---

## 11. Context vs props vs store

| | Props | Context | Store (Zustand/RTK) |
| --- | --- | --- | --- |
| Provider needed | no | yes | no (Zustand) / yes (RTK) |
| Re-render granularity | per prop | **per value identity** | per selector result |
| Read outside React | no | no | yes |
| Write from outside React | no | no | yes |
| Typed without extra work | yes | yes (with a typed hook) | yes (with `.withTypes` or `create<T>`) |
| Testable in isolation | easiest | needs a test provider | needs a fresh store per test |
| Discoverability | the JSX shows the flow | invisible — the provider may be far away | invisible — an import can come from anywhere |
| Best for | 1–2 levels, explicit data flow | low-frequency, widely read, app-wide values | frequently written, selectively read, readable outside React |
| Cost when it goes wrong | prop noise, "relay" components | whole-subtree re-renders | a second place where state changes; store sprawl |

There is no winner in that table; there is a best fit per value. The mistake to avoid is picking one row and using it for everything in an app — which is how you get a 600-line store, or a provider pyramid twelve levels deep.

---

## 12. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `value={{ state, dispatch }}` inline | every provider render wakes every consumer, including dispatch-only buttons | memoise the value **and** split by concern |
| 2 | One context for unrelated state | a coupon change re-renders the cart badge (measured) | one context per concern |
| 3 | `useMemo(() => ({ … }), [])` with missing deps | consumers render with stale values | either list every input, or drop the memo and split instead |
| 4 | `createContext({})` with a fake default | a consumer outside the provider silently gets empty data | `createContext<T \| null>(null)` + a throwing hook |
| 5 | Exporting the context object and using `useContext` everywhere | the "must be inside a provider" check is duplicated, and refactors touch every file | export typed hooks only |
| 6 | Using context for high-frequency values | hundreds of re-renders per second | a store, or local state |
| 7 | Storing server data in a context | no staleness, retry, dedupe or invalidation — all hand-written | a query cache (file 06) |
| 8 | Mirroring props into provider state | the copy stops tracking the prop | read the prop directly, or lift the state's owner |
| 9 | Deep provider pyramids in every file | unreadable JSX, duplicated nesting | an `AppProviders` component or a compose helper |
| 10 | Assuming a consumer's `useEffect` will not run on bail-out | logic runs (or does not) when you least expect it | never depend on bail-outs for behaviour |
| 11 | Provider above `BrowserRouter` that uses routing hooks | `useNavigate` throws "used outside a Router" | order providers so a provider sits below the routers it uses |
| 12 | Using context where two props would do | indirection for nothing; harder to test | props until a third consumer appears |

---

## 13. Best practices

1. **Context is for delivery, not storage.** Keep the state in `useState`/`useReducer`/a store and publish only what consumers need.
2. **One concern per context.** If two values change for different reasons, they belong in two contexts.
3. **Memoise the value** with a complete dependency list, or split until the value is a primitive or a stable function.
4. **Split state from dispatch.** It is the cheapest high-value split in React: action-only components stop re-rendering entirely.
5. **Export typed hooks, not the context object.** `useCartState`/`useCartDispatch` with a throwing guard.
6. **Default to `null` and throw** with a message that names the provider.
7. **Pair context with a reducer** when transitions have rules; keep the reducer in its own file with no React imports.
8. **Do not put server data in context.** Pass the query client or the `useQuery` hook around instead.
9. **Read context in the component that needs the value**, not in a wrapper that re-publishes it — every extra layer is another place for identity to change.
10. **Measure before optimising.** React DevTools' "Highlight updates" tells you in two seconds whether a context is actually a problem; the counts in this file are what "a problem" looks like.

---

## 14. Practice

### Beginner

1. Given a `ThemeContext` whose value is `{ theme, toggleTheme }` and a `Sidebar` that only calls `toggleTheme`, why does `Sidebar` re-render when the theme changes? What is the smallest change that stops it?
2. Write the provider, the contexts and the hooks for a `ToastProvider` with `showToast(message: string)` and a `toasts: Toast[]` list. Which context should hold the list, and which should hold `showToast`? Why?
3. Explain in one sentence each: (a) why `dispatch` from `useReducer` is safe in a context, (b) why `state` is not, (c) why a memoised object value can still change.

### Intermediate

1. Take the four variants in this file and predict, *before running*, which components re-render in each of these four scenarios: add an item; apply a coupon; toggle the theme; add the same item twice. Then run `npx tsx --tsconfig tsconfig.app.json src/dev/run-context-probe.tsx` and compare.
2. The cart's `summarize(items, coupon)` is called in three consumers. Refactor so the summary is computed **once** per cart change, and say what you gained and what you lost (hint: the sliced provider plus a `SummaryContext`; think about what happens when the coupon changes but the items do not).
3. A teammate proposes putting the whole app in one `AppStateContext` "so anything can read anything". Write the three-sentence reply, including the measurement you would point at.

### Challenge

1. Add a `useCartSelector` hook that lets a consumer subscribe to a *projection* of the cart state (`useCartSelector((state) => summarize(state.items).units)`) while keeping context as the delivery mechanism. You will need `useSyncExternalStore` or a store of subscribers inside the provider. Then state honestly when this is worth it and when switching to file 05's tool is simpler.
2. Make the cart persist to `localStorage` without losing the render behaviour measured in this file: a debounce, a version field, a migration for an old shape, and a decision about what to do when the stored JSON is corrupt. Explain where the write happens and why it must not be in render.
3. Instrument the app to answer "which context change caused this re-render?" in development: a wrapper that logs the provider name when its value identity changes, plus a component-level logger. Explain the limits of the answer you get (React does not tell a component why it rendered) and what React DevTools' profiler adds.

---

## 15. Solutions

### Beginner

1. `Sidebar` reads the whole value object, and the theme change creates a new object, so every consumer re-renders. The smallest change: split the contexts — `ThemeContext` for the string, `ThemeActionsContext` for the stable `toggleTheme` — so `Sidebar` subscribes only to the actions context. (`useMemo` alone does not help, because `theme` is a genuine input to the value.)
2. Two contexts: `ToastListContext` (the `toasts` array, changes per toast) and `ToastActionsContext` (`showToast`, stable). Then a "Show toast" button, which only dispatches, never re-renders as toasts come and go — the same shape as `ContextAddButton` in section 6.
3. (a) React guarantees `dispatch` is the same function for the component's lifetime, and the context compares by identity, so it never looks changed. (b) The state object is replaced by every reducer transition (a new object even for an unrelated slice), so its identity changes. (c) `useMemo` recomputes when any dependency changes — and if one dependency is a value that changes often (a `theme` string, a `state` object), the memoised object changes just as often.

### Intermediate

1. Predictions: **add** — naive: badge, button, theme button? no (the theme button reads `toggleTheme`, so yes it re-renders in the naive tree because the value is new; measured: `ThemeToggleButton=1`); split: badge, total, coupon box render, add button does not. **Coupon** — naive: everything; split: badge, total, coupon box (measured); sliced: coupon box only (measured). **Theme** — naive and memo: everything the value reaches; split/sliced: nothing (the theme lives in the other providers). **Same item twice** — the quantity changes, so the same pattern as "add", with the badge number incrementing.
2. Add `SummaryContext` published by the sliced provider: `const summary = useMemo(() => summarize(state.items, state.coupon), [state.items, state.coupon])`. Gain: one computation per change instead of three, and one identity for all three consumers so they render together. Loss: the summary is now in the value, so a coupon change re-renders the *badge* again — you have reintroduced the coarse identity problem one level down. The honest conclusion: memoise the computation, but keep publishing the fine-grained slices; let each consumer derive its own numbers from `items` and `coupon` unless the calculation is genuinely expensive (then a store with selectors is the better tool, file 05).
3. "One context means every consumer re-renders on every change to anything in it — we measured a coupon change re-rendering the cart badge. That is invisible in a demo and obvious in a 200-row table. I would keep the contexts split by concern and add a store only if we need selector-level subscriptions or reading the state outside React."

### Challenge

1. Keep a `Set` of listeners in the provider, publish `{ state, subscribe, getState }` in a *stable* context value, and implement `useCartSelector(selector)` with `useSyncExternalStore(subscribe, () => selector(getState()))` — remembering that the snapshot must be referentially stable when the selected value is equal (the `useShallow` problem from file 05, in miniature). Worth it when you already have the context and need a few expensive components to be selective; not worth it when you need many selectors or non-React access — that is exactly what file 05's library already does, without the hand-rolled subscription plumbing and its two subtle traps (unstable snapshots, and tearing when a store changes during a render).
2. Persist inside an effect, never in render (render must stay pure): `useEffect(() => { const id = setTimeout(() => localStorage.setItem(KEY, JSON.stringify({ version: 1, state })), 250); return () => clearTimeout(id); }, [state])` — the debounce stops a write per keystroke, and the cleanup prevents the previous timer from firing. On boot, read inside the `useReducer` initialiser (or a `init` function) rather than in an effect, so the first paint already shows the restored cart instead of an empty one that flashes to filled. Version the payload (`{ version: 1, state }`), migrate old shapes in a `switch (payload.version)`, and treat a parse failure as "no stored cart": wrap `JSON.parse` in `try`/`catch`, delete the key, and log once — a corrupt storage entry must never white-screen the app. (File 05 shows a library rolling all of this — including the migration hook — into one middleware.)
3. Log inside each provider: `useEffect(() => console.log('[provider]', name, 'value changed'), [value])` (an effect runs after a commit, so it tells you "the value changed", not "a consumer re-rendered"), and inside the probe-only components log their own renders. Together they show the cause (`value changed`) and the effect (`these consumers rendered`). The limit is real and worth stating: React does not record *why* a component re-rendered, so a component rendering without any provider logging means the cause was a parent's render or its own state. The profiler fills in the rest — it shows each commit, which components rendered in it, and how long they took — which is the tool to reach for when the counts are fine in a probe but bad in the real app.

---

## 16. Summary

- **Context transports a value; it does not store one.** The state still lives in `useState`/`useReducer`/a store — context only decides who can read it without prop drilling.
- **The rule: every consumer re-renders when the value's identity changes**, no matter which part of the value it read. Measured: a theme toggle re-rendered the cart badge, and a coupon change re-rendered a badge that never reads the coupon.
- **`useMemo` fixes one specific failure** — a provider re-rendering with no input change. It cannot fix a value object that contains unrelated concerns. Measured: the memoised tree still re-rendered on every theme toggle.
- **Splitting state from dispatch** removes re-renders entirely for action-only components. Measured: `ContextAddButton=0` renders while the badge and total rendered once each.
- **Splitting by concern** keeps a change to one slice from waking the readers of another. Measured: the coupon change rendered only the coupon reader, and the item add rendered only the items reader.
- **A context is only as noisy as the value you publish.** Measured: applying the same coupon twice rendered nothing, because the published string did not change.
- **Context + `useReducer` + typed hooks + a throwing guard** is the pattern: reducer in its own React-free file, two contexts, `useCartState()`/`useCartDispatch()` exported instead of the context object.
- **Do not use context for high-frequency state, server data, URL state, or a single consumer.** It is the right tool for low-frequency, widely-read, app-wide values — and the moment you want selector-level subscriptions, the next file's tool exists precisely for that.

---

**What's next →** [`03-redux.md`](./03-redux.md) starts from the store mechanism this file's provider sits on top of: the state, the actions, the reducers, `dispatch`, selectors and middleware — measured on a hand-written forty-line store and then on Redux Toolkit, including the two dev-time checks that caught a direct mutation and a non-serialisable action.
