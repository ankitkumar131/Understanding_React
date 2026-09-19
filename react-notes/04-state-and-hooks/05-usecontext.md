# 05 — `useContext`: Sharing Data Without the Prop Train

> **Part 4 · State and Hooks · File 5 of 10**
> Why this file exists: props are the right way to pass data — until the same piece of data is needed six levels down, by components that have nothing to do with it. Then every layer in between becomes a courier, and every new consumer forces edits in files that do not care. Context is React's answer, and it comes with precise rules about *which components re-render when the value changes*. This chapter refactors the lab's cart from "threaded through props" to "read from context", and measures every claim: what re-renders, what does not, and why a missing provider should throw instead of quietly returning a default.

---

## 1. The problem: prop drilling

At the end of Part 3, the lab's cart count travelled like this:

```tsx
// App.tsx — the badge needs a number that only App can compute
<Header title="MegaShop" subtitle={`${products.length} products in the catalogue`}>
  <span className="cart">🛒 {itemCount}</span>
</Header>

// Header.tsx — receives children it does not understand and did not ask for
export function Header({ title, subtitle, children }: HeaderProps) { /* … */ }
```

Two levels, one messenger. Now imagine the real shape of a shop: the badge lives inside a toolbar, inside a sticky bar, inside a layout, inside a route outlet. To get `itemCount` there, you pass it as a prop through five components that only forward it:

```tsx
<App cart={cart}>
  <Layout cart={cart}>
    <StickyBar cart={cart}>
      <Toolbar cart={cart}>
        <CartBadge cart={cart} />   {/* ← finally the only component that cares */}
```

That is **prop drilling**, and its costs are concrete:

| Cost | What it feels like |
| --- | --- |
| Every intermediate component must declare a prop it does not use | "why does `Layout` need to know about carts?" |
| Adding a second consumer means editing every layer again | a five-file commit for a one-line feature |
| Refactoring the cart's shape breaks components that merely pass it along | your "leaf" change reaches the app shell |
| Intermediate components become hard to reuse | `Layout` is now shop-specific |
| Types get noisy (`Pick<CartApi, 'itemCount'>`) or dishonest (`any`) | friction every time you touch it |

Context removes the couriers. The consumer reads what it needs directly; the provider puts it in the air; everything in between is untouched.

⚠️ **Context does not remove props; it removes *passing*.** The value still comes from somewhere (a provider), and most components still take ordinary props. Part 3's rules about props remain: they are still the default for parent→child data.

---

## 2. What context actually is

A context is a **named channel plus a provider plus consumers**:

```tsx
const CartContext = createContext<CartApi | null>(null);   // 1. the channel (a value + a default)
<CartContext value={cart}>{children}</CartContext>          // 2. the provider (publishes a value)
const cart = useContext(CartContext);                       // 3. the consumer (reads the nearest one)
```

React looks up the tree from the component that calls `useContext` to the nearest matching provider and hands over that provider's `value`. No prop is passed; the component declares a dependency on a channel.

Three properties define its behaviour, and all three are measured in section 5:

1. **The nearest provider wins.** A nested provider can override an outer one (used for theming a subtree, or for tests).
2. **Consumers re-render when the value changes** — where "changes" means `Object.is` on the `value` prop, not a deep comparison.
3. **Every consumer of a context re-renders when its value changes.** There is no selector mechanism (unlike a store library) — this is the fact that decides when context is the wrong tool.

### Context is not a state manager

| Myth | Reality |
| --- | --- |
| "Context replaces Redux/Zustand" | Context is a **transport**. The state itself still lives in a `useState`/`useReducer` somewhere above the provider (file 06, Part 5). |
| "Context is global state" | A context is only available **below its provider**. Two independent provider trees have independent values. |
| "Context is for performance" | Context is for **convenience**. It usually *costs* renders (section 6), which is why the value must be memoised. |
| "Put everything in context" | Then every consumer re-renders for every change, and your components can no longer be understood from their props alone. |

---

## 3. Creating a context with a safe default

```ts
import { createContext, useContext } from 'react';
import type { CartApi } from '../hooks/useCart';

/**
 * The cart context. `null` is the default value on purpose: a component that
 * forgets the provider then gets a clear error instead of a mysterious crash
 * (a default value like `{ lines: [] }` would silently "work" and hide the bug).
 */
export const CartContext = createContext<CartApi | null>(null);

export function useCartContext(): CartApi {
  const cart = useContext(CartContext);
  if (cart === null) {
    throw new Error('useCartContext must be used inside <CartProvider> — did you forget to wrap the tree?');
  }
  return cart;
}
```

**File: `src/context/cartContext.ts`** (this is real lab code, complete)

Two decisions in that snippet are worth defending.

**Decision 1 — the default value is `null`, and the hook throws.**

A default value is what `useContext` returns when **no provider is above the component**. If you choose a friendly default (`{ lines: [] }`), a component used outside its provider silently renders an empty cart and *looks* fine. If you choose `null` and throw, you get a message that names the exact mistake.

**Verified** — the harness rendered a consumer with no provider above it:

```text
4. useCounter() with no provider above it
   thrown: useCounter must be used inside <CounterProvider> — did you forget to wrap the tree?
```

And here is what the friendly-default version does instead — **also verified** (a context created with `createContext('light')`, read with no provider):

```text
5. context WITH a default value, read with no provider: "light" (no error, silently wrong)
```

No error, no warning, and a screen that is wrong. In a theme app that means "the user's dark mode is ignored"; in a cart app it means "the badge shows 0 while items exist". **Default values are for genuinely optional values (a theme fallback); for required dependencies, use `null` + a throwing hook.**

**Decision 2 — the hook lives in its own file, separate from the provider component.**

The oxlint rule `react(only-export-components)` warns when a module exports both a component and a plain function, because it breaks Fast Refresh's ability to swap that module in place (Part 3, file 04, section 8). So the lab keeps:

```text
src/context/cartContext.ts     the channel + the hook   (no JSX, no component)
src/context/CartProvider.tsx   the provider component    (JSX, a component)
```

Each file then satisfies the rule naturally, and the naming tells you where to look.

---

## 4. The provider

**File: `src/context/CartProvider.tsx`**

```tsx
import type { ReactNode } from 'react';
import { useCart } from '../hooks/useCart';
import { CartContext } from './cartContext';

/**
 * Owns the ONE cart instance for the tree below it. `useCart` returns a memoised
 * object, so consumers re-render when the cart changes — not when this provider
 * happens to render for some other reason.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCart();
  return <CartContext value={cart}>{children}</CartContext>;
}
```

Notes:

- **`value={cart}` on `<CartContext>`** is the React 19 syntax. Before React 19 you had to write `<CartContext.Provider value={cart}>`; that form still works and you will meet it in older code, but new code uses the shorter version. (This lab runs React 19.3.0, where the shorthand works — the harness and the app both exercise it.)
- **The provider owns the state.** `useCart()` (a `useReducer`, file 06) is called *here*, once. Consumers only read.
- **`children` is typed `ReactNode`** and passed through untouched. This has a performance consequence — measured next — because React does not re-render elements it merely forwards.

---

## 5. Measured: exactly what re-renders when context changes

Five experiments, all from `src/dev/context-probe.tsx` (`/tmp/part4-context.txt`). Each counts how many times a component's function ran.

### Experiment 1 — a fresh value object on every render

```tsx
function NaiveProvider({ children }: { children?: ReactNode }) {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);
  const value = makeValue(count, () => setCount((c) => c + 1)); // ← new object, every render

  return (
    <CounterContext value={value}>
      <button className="naive-tick" onClick={() => setTick((t) => t + 1)}>unrelated tick {tick}</button>
      <Consumer />
      {children}
    </CounterContext>
  );
}
```

```text
1. value = a NEW object on every provider render
   consumer renders: 4   (1 mount + 3 unrelated ticks)
```

Three clicks on a button that has nothing to do with the context produced three consumer renders. `Object.is` saw a new object each time, so React did exactly what it promised: it re-rendered every consumer.

### Experiment 2 — the same, with a memoised value

```tsx
const value = useMemo(() => makeValue(count, () => setCount((c) => c + 1)), [count]);
```

```text
2. value = useMemo(() => makeValue(count, …), [count])
   consumer renders: 1   (the same value identity was reused)
```

One render for the whole session — mount, plus three unrelated provider renders that changed nothing the consumer cares about. **This is the single most important line in this chapter.**

### Experiment 3 — a real value change is the only thing that should re-render

```text
6. what actually re-renders a memoised consumer?
   after 3 unrelated provider renders : consumer renders 1
   after one real value change (+1)   : consumer renders 2
   the passed child re-rendered how many times in total: 1
```

The consumer (`memo(...)`, so only context or props can move it) re-rendered exactly once — when the cart's value really changed. The unrelated child that does not consume the context was never touched.

### Experiment 4 — children created inside the provider vs passed through

```text
3. a provider re-rendering 3 times with a STABLE context value, two children
   child created INSIDE the provider (<InlineChild />)  renders: 4
   child created by the HARNESS and passed as children  renders: 1
```

`InlineChild` is created in the provider's own JSX, so it is part of the provider's render output and re-renders with it. `PassedChild` is created by the *parent* and handed over as `children`; the provider just forwards the same element object, and React skips re-rendering it.

This is the documented "children as props" pattern, and it is worth knowing because it gives you a way to make a provider cheap: **keep the subtree that must not re-render outside the provider's own JSX.**

```tsx
// ❌ every keystroke in the provider re-renders an expensive subtree
<SettingsProvider>
  <ExpensiveDashboard />
</SettingsProvider>

// ✅ the provider re-renders; the dashboard element is the same object, untouched
<SettingsProvider>{dashboardElement}</SettingsProvider>
```

### Experiment 5 — the default value leaks silently (section 3)

```text
5. context WITH a default value, read with no provider: "light" (no error, silently wrong)
```

---

## 6. Fixing the lab: from props to context, one file at a time

Here is the refactor, in the order you would actually do it.

**Step 1 — memoise the value that `useCart` returns** (`src/hooks/useCart.ts`). Without this, every consumer re-renders on every provider render (experiment 1):

```ts
// The returned object is memoised: it is passed to <CartContext value={…}>,
// and a fresh object on every render would re-render every consumer.
return useMemo(
  () => ({ state, itemCount, subtotalMinor, add, remove, setQuantity, clear, dismissToast }),
  [state, itemCount, subtotalMinor, add, remove, setQuantity, clear, dismissToast],
);
```

Note *why* the dependency list is long: `state` changes on every cart change (that is the point), while every action creator is already stable (`useCallback` around `dispatch`, whose identity never changes — file 08). The memo therefore changes identity exactly when the cart changes, and not once more.

**Step 2 — create the channel and the hook** (`src/context/cartContext.ts`, section 3).

**Step 3 — create the provider** (`src/context/CartProvider.tsx`, section 4).

**Step 4 — turn a prop into a consumer** (`src/components/CartBadge.tsx`, new file):

```tsx
import { useCartContext } from '../context/cartContext';

/**
 * Reads the cart from CONTEXT instead of taking props.
 * The header no longer needs to know that a cart exists at all.
 */
export function CartBadge() {
  const { itemCount } = useCartContext();
  return <span className="cart">🛒 {itemCount}</span>;
}
```

**Step 5 — delete a prop** (`src/components/CartPanel.tsx`):

```tsx
export function CartPanel() {
  const cart = useCartContext();
  const { state, itemCount, subtotalMinor } = cart;
  // …the rest of the component is unchanged
}
```

The `cart` prop is gone, along with its interface field and its type import. The component now declares its own dependency on the cart, which is more honest: it cannot be rendered meaningfully without a provider.

**Step 6 — put the provider at the top and split `App`** (`src/App.tsx`):

```tsx
export default function App() {
  return (
    <CartProvider>
      <Shop />
    </CartProvider>
  );
}

function Shop() {
  const [category, setCategory] = useLocalStorageState<CategoryChoice>('megashop:category', 'all', isCategoryChoice);
  const [query, setQuery] = useState('');

  // From context — any depth of the tree can do the same.
  const { add, dismissToast, itemCount, state: cartState } = useCartContext();
  // …unchanged from here
}
```

Why the split into `App` + `Shop`? Because `Shop` needs the cart, and `useCartContext()` only works **below** the provider. A component cannot consume a context it renders itself — the provider has to be an ancestor. This is a standard React shape: a small outer component that composes providers, and an inner component that uses what they provide.

**Step 7 — verify nothing changed for the user.** The full app trace after the refactor is byte-for-byte the same as before it (`/tmp/part4-app.txt`):

```text
1. fresh mount
   cart badge : 🛒 0
   panel      : Nothing here yet — add a product to see it appear.
2. clicked "Add to cart" on Mechanical Keyboard
   cart badge : 🛒 1
   lines      : Mechanical Keyboard
   quantities : 1
   total      : 1 item · ₹4,999.00
   toast      : Mechanical Keyboard added to cart
3. clicked the same button again
   quantities : 2   (one line, not two)
4. pressed "+" nine more times
   quantity   : 10
   "+" disabled at the cap : true
5. clicked "Remove" → cart badge : 🛒 0
7. clicked "Clear cart" → lines : (none)
10. clicked the "Audio" category chip → localStorage["megashop:category"] : "audio"
11. remounted the app with localStorage seeded to "audio" → active chip : Audio2
```

Same behaviour, fewer props, and any future component — a cart drawer, a checkout summary, a "you might also like" panel — can read the cart by importing one hook.

### What did *not* change, and why

The Add-to-cart callback is still passed as a prop:

```tsx
<ProductList products={visible} onAddToCart={handleAddToCart} … />
```

`ProductList` is a *presentational* component that renders whatever list it is given, and `onAddToCart` is part of its contract. Sending it through context would make the component unusable without the cart provider, harder to test, and impossible to reuse for a "similar products" shelf that adds to a different list. **Props for parent→child contracts; context for widely shared, ambient data.** The cart's *contents* are ambient (many screens care); the *callback for a specific list* is not.

---

## 7. When a value updates often: the real limitation

Context re-renders **every** consumer when the value changes. That is fine for a cart, a theme, a locale or a logged-in user, all of which change rarely. It is a poor fit for:

| Value | Why context hurts | Better tool |
| --- | --- | --- |
| Mouse position, scroll offset, window size | changes dozens of times a second; every consumer re-renders | local state where it is used, or a store with selectors |
| A form's field values (per keystroke) | every consumer re-renders on every keystroke | local state in the form, or a form library (Part 8) |
| A live-updating ticker / websocket stream | high frequency, often only a small part of the tree needs it | a store with selectors (`useSyncExternalStore`, Part 10) |
| A big object where consumers need one field each | no way to "subscribe to a slice" | split contexts, or a store with selectors |

Two techniques keep context usable anyway:

**Split the contexts by concern and update frequency.**

```tsx
// state changes often; the actions never change
const CartStateContext = createContext<CartState | null>(null);
const CartActionsContext = createContext<CartActions | null>(null);
```

A component that only adds to the cart (a product card's button) consumes the *actions* context only, so it neither re-renders when the cart changes nor holds the state. This is the classic "state and dispatch in two contexts" pattern, and file 06 revisits it with a reducer.

**Memoise consumers when the value rarely changes.**

```tsx
const CartBadge = memo(function CartBadge() {
  const { itemCount } = useCartContext();
  return <span className="cart">🛒 {itemCount}</span>;
});
```

`memo` does not stop a context update (context bypasses memo — a memoised consumer still re-renders when its context value changes, which is exactly what experiment 6 measured), but it does stop *parent* renders from dragging the consumer along.

---

## 8. TypeScript with context

Four patterns cover real code.

**1. Nullable context + throwing hook** (section 3) — the default for required dependencies.

**2. A non-null context with an honest default** — for genuinely optional values:

```ts
export type Theme = 'light' | 'dark';
export const ThemeContext = createContext<Theme>('light'); // a real, usable default
```

**3. Splitting state and actions in the type system** — two contexts, two types:

```ts
export interface CartState {
  lines: readonly CartLine[];
  lastAddedName: string | null;
}

export interface CartActions {
  add: (product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  dismissToast: () => void;
}

export const CartStateContext = createContext<CartState | null>(null);
export const CartActionsContext = createContext<CartActions | null>(null);
```

Now a `ProductCard` button can depend on `CartActions` alone, and TypeScript makes it impossible to accidentally read state from the actions context.

**4. Contexts for unions** — the value can be a discriminated union, so impossible states stay impossible:

```ts
type AuthContextValue =
  | { status: 'anonymous'; signIn: (email: string) => Promise<void> }
  | { status: 'authenticated'; user: User; signOut: () => void };
```

Consumers get exhaustive `switch` support (file 06 shows the same idea for reducer actions).

---

## 9. Testing components that use context

A component that reads context cannot be tested in isolation without a provider — which is a feature, because the test then states the component's requirements explicitly (Part 13).

```tsx
// The real provider is the best wrapper: it tests the wiring too.
render(
  <CartProvider>
    <CartBadge />
  </CartProvider>,
);

// For a component that needs a SPECIFIC value, provide a stub with the same type.
const stub: CartApi = {
  state: { lines: [{ productId: 'p1', name: 'Keyboard', unitMinor: 499900, quantity: 2 }], lastAddedName: null },
  itemCount: 2,
  subtotalMinor: 999800,
  add: () => {},
  remove: () => {},
  setQuantity: () => {},
  clear: () => {},
  dismissToast: () => {},
};

render(
  <CartContext value={stub}>
    <CartPanel />
  </CartContext>,
);
```

💡 Because the test uses the same `CartContext` the app uses, a change to the context's shape breaks the test — which is exactly what you want. A hand-rolled mock object (`jest.mock('../context/cartContext')`) would keep passing while the app broke.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | A fresh object as the provider value | every consumer re-renders on every provider render (measured: 4 renders) | `useMemo` the value (measured: 1) |
| 2 | A friendly default value + no provider | silently wrong UI (`"light"`, "0 items") | `null` default + a throwing hook (`useCartContext`) |
| 3 | Consuming a context in the same component that provides it | `null` value / your own error message | split into an outer provider component and an inner consumer (`App` + `Shop`) |
| 4 | Putting everything into one giant context | every consumer re-renders for every change; components stop being readable | split by concern and update frequency |
| 5 | Context for high-frequency values (scroll, mouse, keystrokes) | re-render storms | local state, or a store with selectors |
| 6 | Context instead of props for parent→child contracts | components become untestable and non-reusable | props down; context only for ambient data |
| 7 | Forgetting `memo` on expensive consumers | they re-render when their parent does | `memo` (still re-renders on value changes) |
| 8 | Using `useContext(SomeContext)` directly everywhere | every consumer duplicates the null check | a `useX()` hook next to the context |
| 9 | Mutating the value object in a consumer | nothing re-renders; other screens go stale | treat the value as immutable (file 02) |
| 10 | Nesting providers that shadow each other accidentally | the inner one wins, sometimes unintentionally | one provider per concern, or document the override (they are legitimate for theming/tests) |
| 11 | `createContext<T>()` with no default, then assuming it is `T` | a runtime `undefined` in consumers | `createContext<T \| null>(null)` and check |
| 12 | Expecting context to work like a selector store | every consumer re-renders | split contexts, or use a store (Part 5+) |

---

## 11. Best practices

1. **Ask whether context is warranted.** Use it for data that is *ambient* — needed by many components at different depths, and rarely changed: theme, locale, current user, feature flags, cart, notifications.
2. **Keep state ownership in one place.** The provider calls the hook (`useCart()`), consumers read. Never let a consumer keep a copy.
3. **Memoise the value.** `useMemo` around the provider value (or inside the hook that produces it) is not an optimisation; it is the difference between "re-renders when the cart changes" and "re-renders constantly".
4. **Export a typed hook, not the context.** `useCartContext()` keeps the null check in one place and the error message helpful.
5. **Split state from actions.** Actions are usually stable strings of functions; state changes. Consumers that only act should not re-render.
6. **Name hooks after the domain:** `useCartContext`, `useAuth`, `useTheme`, `useLocale`.
7. **Keep the provider thin.** Compute the value (including memoisation), provide it, render `children`.
8. **Prefer props for explicit contracts**, especially callbacks and per-instance data.
9. **Document the provider's requirement** in the hook's error message and in the component's docs — the error is the first thing a teammate will read.
10. **Consider a store (Part 5+) when values update frequently or components need slices**, and keep context for the ambient, slow-changing things it is good at.

---

## 12. Real-world example: five contexts that earn their place, and three that do not

| Context | Changes | Consumers | Verdict |
| --- | --- | --- | --- |
| **Theme** (`light`/`dark`) | rarely (user action) | most of the tree | ✅ textbook context |
| **Locale / i18n** (language + `t()` function) | rarely | most of the tree | ✅ textbook, and the value is easy to memoise |
| **Current user / auth** | on sign-in/out | nav, guards, avatars | ✅ and, with `null` + hook, it doubles as the "am I signed in?" check |
| **Cart** (this chapter) | on add/remove | badge, panel, checkout, product cards | ✅ ambient data with a few writers |
| **Feature flags** | rarely (config load) | scattered leaf components | ✅ good fit — no props, no re-fetch |
| **Scroll position** | constantly | a progress bar | ❌ local state where it is used, or a store with selectors |
| **The currently focused element / form draft** | constantly | a submit button's disabled state | ❌ keep it close; a context per keystroke is a re-render storm |
| **"All app data"** (one big `AppContext`) | constantly | everything | ❌ this is a global store wearing a costume; use a real one or split it |

---

## 13. Practice

### Beginner — a theme context with a toggle

**File: `src/practice/themeContext.ts`** and **`src/practice/ThemeToggle.tsx`** plus **`src/practice/ThemedCard.tsx`**.

Requirements:

- `createContext<Theme>('light')` with `type Theme = 'light' | 'dark'`.
- A `ThemeProvider` that owns the state (`useState<Theme>`) and provides **a memoised value** containing the theme and a `toggle()` function.
- `ThemeToggle` reads the context and renders a button whose label is `Switch to dark` / `Switch to light`.
- `ThemedCard` reads the context and renders its `children` inside a `<div className={theme === 'dark' ? 'card card--dark' : 'card'}>`.
- Add a `console.count('ThemedCard')` to `ThemedCard`, click the toggle five times, and confirm the count grows by one per click (the value changed, so the consumer re-renders — correct).
- Then wrap `ThemedCard` in `memo(...)` and add an unrelated state to the provider (a counter button that is not provided through context). Clicking that button must **not** grow `ThemedCard`'s count. Explain the result in one sentence.

### Intermediate — split state and actions, and prove the benefit

Refactor the cart from this chapter into **two** contexts (`CartStateContext`, `CartActionsContext`) and one provider that supplies both.

Requirements:

- `useCartState()` and `useCartActions()` hooks, each throwing when its provider is missing.
- A new component `src/practice/AddToCartButton.tsx` that consumes **only** the actions context.
- Instrument `AddToCartButton` with `console.count('AddToCartButton')` and `CartBadge` (state consumer) with `console.count('CartBadge')`.
- Click "add to cart" three times and report the two counts. Then change something in the cart state **without** adding (for example, a "dismiss toast" button that only the *state* context carries) and report again.
- Answer: why does the split help a product grid with 200 cards?

### Challenge — an auth context with a discriminated union and a fake API

**File: `src/practice/authContext.ts`**, **`src/practice/AuthProvider.tsx`**, and **`src/practice/AuthGate.tsx`**.

Requirements:

- `type AuthState = { status: 'anonymous' } | { status: 'signing-in' } | { status: 'authenticated'; user: { id: string; name: string } } | { status: 'error'; message: string }`.
- The provider owns the state and exposes `signIn(email, password)` (a fake 800 ms promise that rejects for the password `"wrong"`) and `signOut()`.
- Value memoised; `null` default + throwing `useAuth()` hook.
- `AuthGate` renders one of four outputs, using a `switch` with a `never` check.
- No `any`; the union must make `state.user.name` inaccessible in the `'anonymous'` branch.
- Prove the error path: sign in with `"wrong"`, see the error branch, retry with anything else and see the authenticated branch.
- Then answer: why is `status: 'signing-in'` part of the union rather than a separate `isLoading` boolean?

---

## 14. Solutions

### Beginner

**File: `src/practice/themeContext.ts`**

```ts
import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}

/** A real, usable default: an absent provider means "light", which is a sane fallback. */
export const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside <ThemeProvider> — did you forget to wrap the tree?');
  }
  return value;
}
```

**File: `src/practice/ThemeProvider.tsx`**

```tsx
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeValue } from './themeContext';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [clicks, setClicks] = useState(0); // unrelated state, to test re-renders

  const toggle = useCallback(() => setTheme((current) => (current === 'light' ? 'dark' : 'light')), []);

  // Memoised: `toggle` is stable, so the value identity changes only with `theme`.
  const value = useMemo<ThemeValue>(() => ({ theme, toggle }), [theme, toggle]);

  return (
    <ThemeContext value={value}>
      <button type="button" onClick={() => setClicks((c) => c + 1)}>
        unrelated provider counter: {clicks}
      </button>
      {children}
    </ThemeContext>
  );
}
```

**File: `src/practice/ThemeToggle.tsx`**

```tsx
import { useTheme } from './themeContext';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle}>
      Switch to {theme === 'light' ? 'dark' : 'light'}
    </button>
  );
}
```

**File: `src/practice/ThemedCard.tsx`**

```tsx
import { memo, type ReactNode } from 'react';
import { useTheme } from './themeContext';

export const ThemedCard = memo(function ThemedCard({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  console.count('ThemedCard');
  return <div className={theme === 'dark' ? 'card card--dark' : 'card'}>{children}</div>;
});
```

Answers to the two questions. Clicking the toggle five times grows the count by five, because the context **value changed** (the `theme` field) and context updates bypass `memo` — a memoised consumer still re-renders when its own context changes. Clicking the unrelated counter does **not** grow the count: the value identity is unchanged (thanks to `useMemo`) and `memo` blocks the parent-driven re-render. Both behaviours come from the same two rules measured in section 5.

### Intermediate

**File: `src/practice/cartContexts.ts`**

```ts
import { createContext, useContext } from 'react';
import type { Product } from '../data/products';
import type { CartState } from '../state/cart';

export interface CartActions {
  add: (product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  dismissToast: () => void;
}

export const CartStateContext = createContext<CartState | null>(null);
export const CartActionsContext = createContext<CartActions | null>(null);

export function useCartState(): CartState {
  const state = useContext(CartStateContext);
  if (state === null) throw new Error('useCartState must be used inside <CartProviders>');
  return state;
}

export function useCartActions(): CartActions {
  const actions = useContext(CartActionsContext);
  if (actions === null) throw new Error('useCartActions must be used inside <CartProviders>');
  return actions;
}
```

**File: `src/practice/CartProviders.tsx`** (the provider that supplies both)

```tsx
import { useMemo, type ReactNode } from 'react';
import { useCart } from '../hooks/useCart';
import { CartActionsContext, CartStateContext } from './cartContexts';

export function CartProviders({ children }: { children: ReactNode }) {
  const cart = useCart();

  // Two memoised values with deliberately different dependency lists: `state`
  // changes when the cart changes, `actions` never does.
  const state = useMemo(
    () => ({ lines: cart.state.lines, lastAddedName: cart.state.lastAddedName }),
    [cart.state.lines, cart.state.lastAddedName],
  );
  const actions = useMemo(
    () => ({
      add: cart.add,
      remove: cart.remove,
      setQuantity: cart.setQuantity,
      clear: cart.clear,
      dismissToast: cart.dismissToast,
    }),
    [cart.add, cart.remove, cart.setQuantity, cart.clear, cart.dismissToast],
  );

  return (
    <CartStateContext value={state}>
      <CartActionsContext value={actions}>{children}</CartActionsContext>
    </CartStateContext>
  );
}
```

**File: `src/practice/AddToCartButton.tsx`**

```tsx
import { memo } from 'react';
import type { Product } from '../data/products';
import { useCartActions } from './cartContexts';

export const AddToCartButton = memo(function AddToCartButton({ product }: { product: Product }) {
  const { add } = useCartActions(); // actions only — this component ignores the cart's contents
  console.count('AddToCartButton');
  return (
    <button
      type="button"
      disabled={product.stock <= 0}
      onClick={() => add({ id: product.id, name: product.name, priceMinor: product.priceMinor })}
    >
      {product.stock <= 0 ? 'Notify me' : 'Add to cart'}
    </button>
  );
});
```

Measured behaviour (the same mechanism as the lab's memoised-provider experiment): clicking "add to cart" three times grows `CartBadge` three times (it reads the state context, which changed) while `AddToCartButton` stays at **1** — the actions value never changes identity, so its consumers never re-render. Dismissing the toast changes `lastAddedName` in the state → `CartBadge` re-renders; `AddToCartButton` still does not.

Why the split helps a 200-card grid: with a single combined context, every add-to-cart click would re-render all 200 cards, because the value's identity changed for everyone. With actions separated, the 200 buttons subscribe to a value that never changes, so a click re-renders only the badge and the panel — a difference measured in milliseconds per interaction on a real catalogue.

### Challenge

**File: `src/practice/authContext.ts`**

```ts
import { createContext, useContext } from 'react';

export interface User {
  id: string;
  name: string;
}

export type AuthState =
  | { status: 'anonymous' }
  | { status: 'signing-in' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

export interface AuthValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
```

**File: `src/practice/AuthProvider.tsx`**

```tsx
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthState, type AuthValue, type User } from './authContext';

/** A fake API: resolves after 800ms, or rejects when the password is "wrong". */
function fakeSignIn(email: string, password: string): Promise<User> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (password === 'wrong') reject(new Error('That password does not match this account.'));
      else resolve({ id: `u-${email.length}`, name: email.split('@')[0] ?? 'friend' });
    }, 800);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'anonymous' });

  const signIn = useCallback(async (email: string, password: string) => {
    setState({ status: 'signing-in' });
    try {
      const user = await fakeSignIn(email, password);
      setState({ status: 'authenticated', user });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }, []);

  const signOut = useCallback(() => setState({ status: 'anonymous' }), []);

  const value = useMemo<AuthValue>(() => ({ state, signIn, signOut }), [state, signIn, signOut]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
```

**File: `src/practice/AuthGate.tsx`**

```tsx
import { useAuth } from './authContext';

export function AuthGate() {
  const { state, signIn, signOut } = useAuth();

  switch (state.status) {
    case 'anonymous':
      return (
        <button type="button" onClick={() => void signIn('asha@example.com', 'secret')}>
          Sign in as Asha
        </button>
      );
    case 'signing-in':
      return <p role="status">Signing in…</p>;
    case 'error':
      return (
        <div role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={() => void signIn('asha@example.com', 'wrong')}>
            Try the broken password again
          </button>
          <button type="button" onClick={() => void signIn('asha@example.com', 'secret')}>
            Use the right password
          </button>
        </div>
      );
    case 'authenticated':
      return (
        <p>
          Welcome, {state.user.name}! {/* `user` exists only in this branch */}
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </p>
      );
    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled auth state: ${JSON.stringify(unhandled)}`);
    }
  }
}
```

Answer to the closing question: `'signing-in'` belongs *inside* the union because it is one of the states the screen can be in, and the union makes it impossible to render "signed in" while a request is in flight. With a separate `isLoading` boolean you could construct `{ isLoading: true, user: Asha }`, which is contradictory, and every consumer would have to decide what that means. The union has exactly one meaning per value, the compiler enforces the `switch`'s completeness, and `state.user.name` is unreachable in the anonymous branch — the same "make invalid states impossible" principle used for the cart's actions in file 06.

---

## 15. Summary

- **Prop drilling** is the problem context solves: data needed deep in the tree, by components that have nothing to do with the layers between them.
- A context is a **channel** (`createContext`), a **provider** (`<Context value={…}>` in React 19), and **consumers** (`useContext`). It transports data; it does not own state.
- **Default values are dangerous for required data** (measured: `"light"`, no warning, silently wrong). Use `createContext<T | null>(null)` and a hook that throws a helpful message.
- **The value must be memoised.** Measured: a fresh object per render → 4 consumer renders; a `useMemo` value → 1.
- Consumers re-render **when the value changes** (`Object.is`), and **`memo` does not stop that** — it only stops parent-driven renders.
- Children **created inside** a provider re-render with it; children **passed through** as `children` do not (measured: 4 vs 1).
- Context is ideal for **ambient, slow-changing** data: theme, locale, auth, cart, feature flags. It is a poor fit for **high-frequency** values, where a store with selectors (Part 5+) or local state wins.
- **Split contexts by concern and update frequency** (state vs actions) so that components which only act never re-render.
- Keep the state in **one** place (the provider), read it everywhere, and never let a consumer hold a copy.
- Export a **typed hook** (`useCartContext`), keep it in its own file (Fast Refresh), and let the error message teach the next developer.

---

**What's next →** [`06-usereducer.md`](./06-usereducer.md): when state changes in a dozen different ways, `useState` turns into a pile of setters and half-finished transitions. `useReducer` replaces them with **one pure function** — `(state, action) => newState` — that can be read top to bottom, tested without React, and made exhaustive by TypeScript. We will dissect the lab's real `cartReducer`, prove its purity against a deeply frozen state object, and measure how three dispatches in one click still produce a single render.
