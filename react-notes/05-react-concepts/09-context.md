# 09 — Context as Architecture: Theme, Auth, and Avoiding Misuse

> **Part 5 · React Concepts · File 9 of 9**
> Why this file exists: Part 4's `useContext` chapter explained *how* context works and measured its re-render behaviour (a fresh value object re-rendered every consumer four times; a memoised one re-rendered once). This chapter is about *design*: what deserves to be in context, how to shape a provider so consumers stay cheap and honest, how to split a context into state and actions so a button that only dispatches does not re-render (measured: `StateConsumer 1 → 2` while `DispatchConsumer 1 → 1`), how nested providers override for a subtree, what `use(Context)` adds in React 19, and how to test a context-driven component without a real provider at all.

---

## 1. What context is for

Context answers one specific problem: **a value is needed by many components at different depths, and threading it through props would mean giving every intermediate component a prop it does not use.**

```tsx
// Without context: Header, Toolbar, Sidebar, ProductGrid … all take `cart`
function App() {
  const cart = useCartState();
  return <Layout cart={cart} />;                 // Layout passes it to Header…
}
function Layout({ cart }: { cart: Cart }) {
  return <><Header cart={cart} /><CartPanel cart={cart} /></>;
}

// With context: only the components that USE the cart mention it.
function App() {
  return (
    <CartProvider>
      <Layout />                                  {/* knows nothing about the cart */}
    </CartProvider>
  );
}
function CartBadge() {
  const { itemCount } = useCartContext();          // reaches the value directly
  return <span className="badge">{itemCount}</span>;
}
```

Three questions decide whether context is the right tool:

1. **Is the value needed by at least two components that are not close relatives?** If it is one child, pass a prop (file 01).
2. **Is the value the same for a large part of the tree** (a theme, the signed-in user, the locale, the cart), or is it screen-specific (one filter)? Screen-specific state belongs in that screen's component (file 02).
3. **Does the value change often?** Every consumer re-renders when the value changes (Part 4, file 05), so a value that changes sixty times a second — mouse position, scroll offset — does not belong in context.

---

## 2. The mechanics, in five lines

```tsx
// 1. create a context with a default value
const ThemeContext = createContext<ThemeValue>({ name: 'system', text: '#111' });

// 2. provide a value (React 19: render the context itself as the provider)
<ThemeContext value={{ name: 'dark', text: '#f5f5f5' }}><App /></ThemeContext>

// 3. read it anywhere below
const theme = useContext(ThemeContext);

// 4. or, in React 19, read it with `use` — which may be called conditionally
const theme = use(ThemeContext);

// 5. consume a value that only exists when a provider is present, safely
function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
```

**Verified** — nested providers, defaults, and `use()` in a branch:

```text
1. nested providers: outer=dark/#f5f5f5 · inner=light/#111
2. no provider at all (createContext(defaultValue)): system/#111 — the default, quietly
3. use(Context) after an early return: signed out = "signed out (context not read)" · signed in = "signed in, theme=dark"
```

Read those three lines as three design rules:

- **The closest provider wins, for its subtree only.** The outer tree is `dark`; the panel wrapped in a second provider is `light`. That is what makes a "preview this product page in light mode" toggle, or a dark modal inside a light app, a two-line change.
- **A missing provider silently yields the default.** With `createContext({ name: 'system', … })`, everything rendered without a provider quietly used `system`. That is why the lab creates the context with `null` and throws from the hook instead (Part 4, file 05): a loud error at the call site beats a subtly wrong colour scheme.
- **`use(Context)` may be called after an early return** — unlike `useContext`, which must run unconditionally (rules of hooks, Part 4 file 10). The docs state it plainly: *"Unlike `useContext`, `use` can be called within loops and conditional statements like `if`."* Use it when the read genuinely depends on a branch (an early `if (!signedIn) return …`); prefer `useContext` in ordinary code so the dependency is visible at the top of the component.

⚠️ `use(Context)` is **not** supported in Server Components; and like every hook-like API it must be called inside a component or another hook.

---

## 3. Which values deserve to be in context

| Value | In context? | Why |
| --- | --- | --- |
| **theme** (colours, density, motion preferences) | yes | needed by leaves everywhere; changes rarely; one source of truth |
| **the signed-in user / permissions** | yes | read by guards, menus, and API helpers at every depth (file 06 of Part 6 uses it for route guards) |
| **locale / i18n messages** | yes | every formatted string depends on it |
| **the cart** (a small, app-wide domain value) | yes | the badge, the panel and every add button need it (the lab's choice) |
| **feature flags** | yes | read in many places, provided once at startup |
| **toasts / notifications** | yes | a UI service any component may call |
| **the router's current route** | yes (the router does it for you) | Part 6 |
| **a form's draft** | **no** | one screen owns it (file 02); a provider would make it global by accident |
| **a list's filter or sort** | **no** | screen-specific; props are clearer |
| **server data caches** | usually no | a data library belongs here (Part 9's server-state chapter); context is a transport, not a cache |
| **mouse position / scroll offset** | **no** | changes constantly; every consumer would re-render (Part 10's `useSyncExternalStore` or a ref) |
| **everything, in one global store** | **no** | invisible dependencies, untestable components (section 8) |

The test that decides the borderline cases: **"if I deleted the provider, would the app still be describable?"** A theme provider can be deleted (everything renders with defaults). A "global app state" provider cannot, which is a sign it is doing a state manager's job — and Part 9 discusses the tools that do that job well (`zustand`, Redux Toolkit, TanStack Query for server state).

---

## 4. Shaping the value: state plus actions

A provider's value is usually two kinds of thing, and they have very different stability:

```tsx
interface CartApi {
  state: CartState;                       // changes whenever the cart changes
  itemCount: number;                      // derived (memoised — Part 4 file 07)
  subtotalMinor: number;
  add: (product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => void;   // stable forever
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  dismissToast: () => void;
}
```

- **State** must change — that is the point.
- **Actions must be stable**, because consumers put them in dependency lists, pass them to `memo`-wrapped children and store them in refs (Part 4, file 08). In the lab they are `useCallback(…, [])` over the stable `dispatch`.
- **Derived values are memoised**, so that unrelated provider renders do not hand consumers a new number or a new object (Part 4, files 07–08).
- **The whole value is `useMemo`-ised**: a fresh object every render would re-render every consumer on every provider render (Part 4, file 05: 4 renders versus 1).

### Splitting state and actions

When consumers are sensitive to renders — a toolbar button that only dispatches, a header that only shows a count — split the value into two contexts so each consumer subscribes only to what it needs:

```tsx
const CountStateContext = createContext<number>(0);
const CountDispatchContext = createContext<() => void>(() => {});

function SplitProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const bump = useCallback(() => setCount((c) => c + 1), []);
  return (
    <CountDispatchContext value={bump}>
      <CountStateContext value={count}>{children}</CountStateContext>
    </CountDispatchContext>
  );
}
```

**Verified** — one state change, two consumers:

```text
4. one state change, two consumers: StateConsumer: 1 → 2 renders · DispatchConsumer: 1 → 1 renders (its context value never changed)
5. the dispatching component still shows the new count?: count=1, button text="bump (rendered 1x)"
```

The state consumer re-rendered (`1 → 2`); the dispatch-only consumer did **not** (`1 → 1`), because its context's value is the same function as before. And note line 5: the dispatch consumer's button text is still `rendered 1x` while the count next to it reads `1` — the total it displays is *not* its own render count, it is the current state as rendered by the *other* consumer. Two independent subscriptions, two independent render behaviours.

When to split: when a large subtree only dispatches (`AddButtons`, a toolbar, a keyboard-shortcut handler). When not to: for a small app, one memoised value is simpler, and the memo already prevents *unrelated* renders (the remaining re-renders are the ones you asked for by changing the state).

---

## 5. Providers that own nothing

A provider does not have to hold state. Two useful shapes:

```tsx
// 1. A provider that distributes a value it was handed (controlled provider).
function ControlledThemeProvider({ value, children }: { value: ThemeValue; children: ReactNode }) {
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
```

**Verified:**

```text
7. a provider that owns no state (value from props): brand/#c00
```

This is the pattern that makes theming configurable at the top of the app (the theme is state in `App`, or comes from the user's profile, or from `localStorage`) while every component below stays simple. It is also the pattern to use in tests (section 7) and in Storybook-style previews.

```tsx
// 2. A value that comes from the browser's own API, via a hook.
function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useLocalStorageState<string>('megashop:locale', navigator.language);
  const value = useMemo(() => ({
    locale,
    setLocale,
    money: new Intl.NumberFormat(locale, { style: 'currency', currency: locale === 'en-IN' ? 'INR' : 'USD' }),
  }), [locale]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}
```

Note the memoised value: the `Intl.NumberFormat` objects are constructed once per locale change, not per render — the same reasoning as Part 4, file 07's formatter example.

---

## 6. Composing providers

A real app has several providers, and their order can matter:

```tsx
// File: src/app/AppProviders.tsx
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>                 {/* outermost: nothing depends on it except the others */}
      <AuthProvider>                  {/* reads nothing from the contexts below it */}
        <CartProvider>                {/* the cart may talk to the API with the user's token */}
          <ToastProvider>             {/* any of the above may raise a toast */}
            {children}
          </ToastProvider>
        </CartProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
```

Rules that keep this readable:

1. **A provider may read the contexts *above* it, never below.** `CartProvider` can call `useAuth()` (a signed-in user's cart) but `AuthProvider` cannot call `useCart()`. Violating this gives you `undefined` at runtime and a dependency cycle in the design.
2. **Put the most widely needed, least dependent providers outermost.** Locale and theme at the top; feature-specific providers nearer the screen they serve.
3. **Prefer one `AppProviders` component** over a pyramid repeated in every entry point: `main.tsx` renders `<AppProviders><App /></AppProviders>`, and tests can reuse a trimmed version (section 7).
4. **Keep providers close to what they serve when the value is screen-specific.** A `CheckoutProvider` belongs around the checkout route, not around the whole app — the tighter the scope, the smaller the blast radius of its re-renders.

---

## 7. Testing with and without providers

Because a provider's whole job is to hand a value down, a component can be tested with a **stub** provider — no real state, no effects, no API:

```tsx
// The stub is a one-liner: provide the shape, not the behaviour.
render(
  <ThemeContext value={{ name: 'test-theme', text: '#0f0' }}>
    <PriceLabel />
  </ThemeContext>,
);
```

**Verified:**

```text
6. rendering under a stub provider (no real provider needed): test-theme #0f0
```

Three testing rules that follow:

- **Stub for presentation, real for behaviour.** If the component only *reads* the value, a stub is perfect and fast. If the test is about the interaction between the provider and consumers (add to cart → badge updates), use the real provider — that interaction *is* the subject of the test.
- **Prefer the public provider** when the hook throws without one (`useCartContext` in the lab): rendering under the real provider exercises the same path production uses, including the "no provider" error if you forget.
- **Write one `renderWithProviders` helper** (Part 13) so tests do not repeat a five-provider pyramid: it also gives you a single place to change the shape of the tree when the app grows.

---

## 8. Avoiding misuse

| Misuse | What goes wrong | Better |
| --- | --- | --- |
| Context for a value used one or two levels deep | the dependency becomes invisible; the component cannot be reused elsewhere | props (files 01–02) |
| Context as "the app's global state" | every component depends on everything; tests need the whole pyramid; re-renders are hard to trace | split by concern; consider a store (Part 9) |
| One giant context object | any change re-renders every consumer (Part 4, file 05: 4 versus 1) | memoise the value; split state from actions (section 4) |
| A fast-changing value (mouse, scroll, animation frame) | constant re-renders of the whole subtree | a ref + `useSyncExternalStore`, or a library built for it (Part 10) |
| A new object/array/function as the value on every render | every consumer re-renders on every provider render | `useMemo` the value; `useCallback` the actions |
| Defaults that hide a missing provider | silently wrong theme/locale | `createContext<T | null>(null)` + a throwing hook |
| A provider inside a conditional or a loop | rules of hooks violation; children get the wrong provider identity | always render providers at a stable position |
| A provider that also renders the page's layout | the provider cannot be reused; layout changes force provider changes | providers provide; layouts arrange (file 07) |
| Reading context in an event handler's closure across renders | stale values | read in render, use in handlers — or read from the ref pattern (Part 4, file 09) |
| Reaching into another module's context | coupling without a type | export the hook (`useCartContext`), keep the context private to its module |

💡 **Keep the context object private and export a hook.** The lab does exactly this: `src/context/cartContext.ts` exports `useCartContext` (and the type), while the `CartContext` object itself stays module-private. Consumers cannot accidentally provide a second, conflicting cart, and the hook can enforce the "must be inside a provider" rule. It also plays nicely with the `only-export-components` lint rule (Part 3, file 04): the context and hook live in a `.ts` file, the provider component lives in `CartProvider.tsx`, and Fast Refresh keeps working.

---

## 9. Measuring context performance

The blast radius of a context value change is "every consumer, and everything below them". Four tools, in the order to try them:

| Tool | What it fixes | Cost |
| --- | --- | --- |
| **Memoise the value** (`useMemo` + stable actions) | re-renders caused by the value's *identity* changing for unrelated reasons | one dependency list (Part 4, files 07–08) |
| **Split contexts** (state vs actions, or per concern) | consumers that depend on *part* of the value | more contexts to wire (section 4) |
| **Wrap consumers in `memo`** | a consumer that reads a context it does not use, rendered by a parent | a wrapper component per consumer |
| **Move the state down / use a store** | nothing above needs the value at all | restructuring (file 02, and Part 9) |

⚠️ **Do not start here.** The most common cause of "my app re-renders too much" is state living too high (file 02), not context. Measure with React DevTools' Profiler ("highlight updates" plus a recorded session) *before* splitting anything, and reason about which consumers should update when the value changes.

⚠️ **Context does not make re-renders disappear; it makes them wide.** That is acceptable for values that change rarely (theme, user, locale, cart) and unacceptable for values that change constantly. Choosing context is choosing *who* re-renders.

---

## 10. Real-world example: the lab's cart context, and two more

**The cart** (`src/context/cartContext.ts` + `src/context/CartProvider.tsx` + `src/hooks/useCart.ts`):

```tsx
// cartContext.ts — private context, public hook, loud failure.
export interface CartApi { state: CartState; itemCount: number; subtotalMinor: number; add: …; remove: …; setQuantity: …; clear: …; dismissToast: … }
const CartContext = createContext<CartApi | null>(null);

export function useCartContext(): CartApi {
  const value = useContext(CartContext);
  if (value === null) throw new Error('useCartContext must be used inside <CartProvider>');
  return value;
}
export { CartContext };
```

```tsx
// CartProvider.tsx — the provider owns the state and memoises the value.
export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCart();                                   // Part 4, file 09's hook
  return <CartContext value={cart}>{children}</CartContext>;
}
```

```tsx
// App.tsx — one provider at the top; everything below is a consumer.
export default function App() {
  return (
    <CartProvider>
      <Shop />
    </CartProvider>
  );
}
```

Why this shape works:

- **The provider is one line plus a hook.** All the logic lives in `useCart`, which is plain React and testable without any provider at all (Part 4, file 06's reducer tests).
- **The value is memoised inside `useCart`**, and the actions are stable, so consumers re-render only when the cart actually changes.
- **`CartBadge` (in the header) and `CartPanel` (at the bottom of the page) are unrelated branches** — precisely the case context exists for. Neither one passes the cart through its parents: `Header` takes no cart prop, and `ProductList` does not know the cart exists; it just calls `onAddToCart`.
- **`onAddToCart` is still a prop**, not a context lookup inside `ProductCard`: a card that asks for the cart directly would be unusable outside a provider, and its dependency on the cart would be invisible at the call site (file 01's "props down" rule). Context is used where the prop path is long; props are used where it is short. Both in the same feature — that is the design.

**A theme context** for a dashboard would be the same shape with a smaller value (`{ name, toggle }`), and the same rules (memoised value, stable toggle, throwing hook).

**An auth context** adds one wrinkle: the value is asynchronous.

```tsx
interface AuthValue {
  user: User | null;
  status: 'checking' | 'signed-in' | 'signed-out';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthValue['status']>('checking');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchSession();               // Part 7's fetch patterns
        if (!cancelled) {
          setUser(session.user);
          setStatus(session.user === null ? 'signed-out' : 'signed-in');
        }
      } catch {
        if (!cancelled) setStatus('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await signInRequest(email, password);
    setUser(session.user);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<AuthValue>(() => ({ user, status, signIn, signOut }), [user, status, signIn, signOut]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
```

⚠️ **The `status: 'checking'` state is the important part**: a context that only has `user: User | null` cannot distinguish "not signed in" from "we have not asked yet", and route guards built on it will bounce a signed-in user to the login screen on every refresh (Part 6 covers this guard properly). Model the *lifecycle*, not just the value.

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | a new value object on every provider render | consumers re-render constantly (Part 4 measured 4 vs 1) | `useMemo` the value |
| 2 | unstable actions in the value | consumers' effects re-run; `memo` children re-render | `useCallback` (Part 4, file 08) |
| 3 | one context for state, actions and unrelated concerns | every consumer re-renders for every change | split per concern / state vs actions (section 4) |
| 4 | a default that hides a missing provider | silently wrong data | `null` default + throwing hook |
| 5 | reading context in a module scope or a plain function | "Invalid hook call", or a value frozen at import time | read inside components/hooks |
| 6 | context for a value needed one level deep | invisible dependency, less reusable components | props |
| 7 | context as the app's global state store | untestable components, tangled re-renders | split by concern; a store for genuinely global state (Part 9) |
| 8 | a provider rendered conditionally | hook-order errors; children see different providers | render providers unconditionally at a stable position |
| 9 | a provider that also owns layout markup | cannot be reused or nested cleanly | providers provide; layouts arrange |
| 10 | exporting the context object and reading it directly everywhere | no guard, no single place to change the shape | export a hook (`useCartContext`) |
| 11 | assuming `useContext` can be called conditionally | "Rendered more/fewer hooks" errors | call it at the top; use `use(Context)` if the read is genuinely conditional |
| 12 | context for fast-changing values (mouse, scroll) | the whole subtree re-renders per event | a ref/store with `useSyncExternalStore` (Part 10) |
| 13 | forgetting that context values do not reach Server Components | `use()` throws there (documented limitation) | pass data as props from the server component |

---

## 12. Best practices

1. **Ask the three questions** (needed by non-relatives? stable for a wide subtree? changes rarely?) before creating a context.
2. **One file per context**: the context + types + hook in a `.ts` file, the provider component in a `.tsx` file, the hook exported and the context private.
3. **Throw when the provider is missing** instead of relying on a silent default — unless a sensible default is genuinely safe (a theme's default colours).
4. **Memoise the value; stabilise the actions.** Both are required for consumers to stay cheap.
5. **Split when it pays**: state context and dispatch context for render-sensitive trees; per-concern contexts for large apps.
6. **Keep providers near what they serve** when the value is screen-specific; put only app-wide values at the root.
7. **Order providers by dependency** (a provider may read the ones above it, never below).
8. **Model lifecycles, not just values** (`status: 'checking' | …`) so consumers can distinguish "loading" from "empty".
9. **Test with stub providers** for presentation, real providers for integration.
10. **Measure before optimising**: DevTools, then memo → split → `memo` consumers → restructure.

---

## 13. Practice

### Beginner — a theme with three consumers

Build a `ThemeProvider` with `name: 'light' | 'dark'` and a `toggle` action. Then:

1. A `ThemeToggle` button in a header that flips the theme (it must **not** re-render when… well, it will, because it reads the value — instead, make a separate `ThemeName` label that shows the current name, and verify with `console.count` that both re-render once per toggle).
2. A `Card` deep in the tree that styles itself from the theme without receiving a prop.
3. A "preview" section wrapped in a **second** provider pinned to `light`, and confirm the rest of the page stays dark (verified pattern: `outer=dark · inner=light`).
4. Then answer: which of the three components would need changes if the theme moved from context to props, and why is that a good measure of whether context was worth it?

### Intermediate — an auth context with guards

**File: `src/context/AuthContext.tsx`** (provider) and **`src/context/authContext.ts`** (context + hook)

Build an `AuthProvider` as sketched in section 10, using `localStorage` for the token (via the lab's `useLocalStorageState`):

1. `status: 'checking' | 'signed-in' | 'signed-out'`, `user`, `signIn`, `signOut`.
2. A `useAuth()` hook that throws outside the provider, and a `useSignedInUser()` helper that returns a **non-null** user or throws when the caller assumed wrongly (the guard's contract).
3. Wrap the app in `AppProviders` (locale + auth + cart + toast) and render the signed-in user's email in the header.
4. Add a `RequireSignIn` component: while `status === 'checking'` it renders a skeleton; when `signed-out` it renders a sign-in form; otherwise it renders `children`. (Part 6 turns this into a route guard.)
5. Then answer: why must `status: 'checking'` exist, and what bug appears on a page refresh without it?

### Challenge — split contexts, stubs, and a provider composition

**File: `src/context/CartContexts.tsx`** (provider), **`src/context/cartContexts.ts`** (contexts + hooks), plus tests in **`src/dev/cart-context-probe.tsx`**

1. Split the cart into three contexts: **state**, **derived totals**, and **actions** (add/remove/setQuantity/clear/dismissToast).
2. Measure, with render counters, that after adding an item: the state consumer re-renders, the totals consumer re-renders, and a consumer that reads **only actions** does **not**.
3. Verify the same with a keyboard-shortcut consumer (an actions-only component) that must not re-render as the cart grows.
4. Write a stub-provider test for `CartPanel` that supplies `state` and `totals` with fake data and asserts the rendered totals — with **no** reducer, no provider and no DOM events.
5. Then answer three questions: (a) when is splitting into three worth it, and when is one memoised value better? (b) why can the actions context be provided with a permanently stable value? (c) what breaks if the totals context's value is not memoised?

---

## 14. Solutions

### Beginner

```tsx
// src/context/themeContext.ts
import { createContext, useContext } from 'react';

export interface ThemeValue {
  name: 'light' | 'dark';
  text: string;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
```

```tsx
// src/context/ThemeProvider.tsx
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type ThemeValue } from './themeContext';

export function ThemeProvider({ initial = 'light', children }: { initial?: 'light' | 'dark'; children: ReactNode }) {
  const [name, setName] = useState<'light' | 'dark'>(initial);
  const toggle = useCallback(() => setName((current) => (current === 'light' ? 'dark' : 'light')), []);

  // Memoised value + stable action: consumers re-render only when `name` changes.
  const value = useMemo<ThemeValue>(() => ({ name, text: name === 'dark' ? '#f5f5f5' : '#111', toggle }), [name, toggle]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
```

```tsx
// Consumers, at three depths:
function ThemeName() { const { name } = useTheme(); console.count('ThemeName'); return <span>{name} theme</span>; }
function ThemeToggle() { const { toggle, name } = useTheme(); return <button type="button" onClick={toggle}>{name === 'dark' ? 'Light' : 'Dark'} mode</button>; }
function Card({ children }: { children: ReactNode }) {
  const { text } = useTheme();                    // no prop, no drilling
  return <div className="card" style={{ color: text }}>{children}</div>;
}

// The preview: a second provider pinned to light — the rest of the page stays dark.
function Page() {
  return (
    <ThemeProvider initial="dark">
      <ThemeName />
      <ThemeToggle />
      <Card>Deep content that follows the theme</Card>

      <ThemeProvider initial="light">
        <Card>Always-light preview</Card>
      </ThemeProvider>
    </ThemeProvider>
  );
}
```

Verified behaviour to expect (from the lab's nested-provider probe): `outer=dark · inner=light` — the inner provider overrides for its subtree only.

**Which components would need changes if the theme moved into props**: all of them, plus every component between the provider and the consumers — `Page`, `Card`'s container, and the preview wrapper would each need to pass `theme` down (the "prop drilling" this chapter exists to remove). That measure — *how many components must change* — is the honest test for "was context worth it?". If the answer is "one child and its parent", props were better (file 01).

### Intermediate

**File: `src/context/authContext.ts`**

```tsx
import { createContext, useContext } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthValue {
  user: User | null;
  status: 'checking' | 'signed-in' | 'signed-out';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** For components that only render once a user exists (guards, dashboards). */
export function useSignedInUser(): User {
  const { user, status } = useAuth();
  if (status !== 'signed-in' || user === null) {
    throw new Error('useSignedInUser was called while nobody is signed in — render <RequireSignIn> above it.');
  }
  return user;
}
```

```tsx
// src/context/AuthProvider.tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthValue, type User } from './authContext';

const STORAGE_KEY = 'megashop:token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthValue['status']>('checking');

  useEffect(() => {
    let cancelled = false;
    const token = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);

    if (token === null) {
      setStatus('signed-out');
      return;
    }

    void (async () => {
      try {
        const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Session expired');
        const me = (await response.json()) as User;
        if (!cancelled) {
          setUser(me);
          setStatus('signed-in');
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setUser(null);
          setStatus('signed-out');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await fetch('/api/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error('Those credentials were not accepted.');
    const session = (await response.json()) as { token: string; user: User };
    localStorage.setItem(STORAGE_KEY, session.token);
    setUser(session.user);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<AuthValue>(() => ({ user, status, signIn, signOut }), [user, status, signIn, signOut]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
```

```tsx
// RequireSignIn — the guard as a component (Part 6 makes this a route guard).
function RequireSignIn({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'checking') return <p role="status">Checking your session…</p>;
  if (status === 'signed-out') return <SignInForm />;
  return <>{children}</>;
}
```

**Why `status: 'checking'` must exist**: the session lives in `localStorage`, and `fetchSession()` is asynchronous. Without a `checking` state, the provider's first render has `user: null` — indistinguishable from "signed out" — so a guard would immediately render the **sign-in form**, and a signed-in user refreshing the page would see a flash of the login screen (or be bounced to it) before the session arrives. With `checking`, the guard renders a skeleton, then the real content. This is the same "model the lifecycle, not the value" rule as the cart's `status` union, and it is one of the small details that separates a demo from a product.

### Challenge

**File: `src/context/cartContexts.ts`**

```tsx
import { createContext, useContext } from 'react';
import type { CartState } from '../state/cart';
import type { Product } from '../data/products';

export interface CartTotals {
  itemCount: number;
  subtotalMinor: number;
}

export interface CartActions {
  add: (product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  dismissToast: () => void;
}

export const CartStateContext = createContext<CartState | null>(null);
export const CartTotalsContext = createContext<CartTotals | null>(null);
export const CartActionsContext = createContext<CartActions | null>(null);

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} must be used inside <CartProvider>`);
  return value;
}

export const useCartState = (): CartState => required(useContext(CartStateContext), 'useCartState');
export const useCartTotals = (): CartTotals => required(useContext(CartTotalsContext), 'useCartTotals');
export const useCartActions = (): CartActions => required(useContext(CartActionsContext), 'useCartActions');
```

```tsx
// src/context/CartContexts.tsx
import { useMemo, type ReactNode } from 'react';
import { CartActionsContext, CartStateContext, CartTotalsContext } from './cartContexts';
import { useCart } from '../hooks/useCart';

export function CartProvider({ children }: { children: ReactNode }) {
  const { state, itemCount, subtotalMinor, add, remove, setQuantity, clear, dismissToast } = useCart();

  // Three separate values, each as stable as it can be:
  const totals = useMemo(() => ({ itemCount, subtotalMinor }), [itemCount, subtotalMinor]);
  const actions = useMemo(() => ({ add, remove, setQuantity, clear, dismissToast }), [add, remove, setQuantity, clear, dismissToast]);

  return (
    <CartActionsContext value={actions}>
      <CartTotalsContext value={totals}>
        <CartStateContext value={state}>{children}</CartStateContext>
      </CartTotalsContext>
    </CartActionsContext>
  );
}
```

The measured expectation, with a render counter in each consumer: adding one product re-renders the state consumer and the totals consumer — and leaves an actions-only consumer at its previous count (the lab's split-context probe measured exactly this shape: `StateConsumer: 1 → 2` while `DispatchConsumer: 1 → 1`). A keyboard-shortcut handler that calls `add` on the focused product therefore never re-renders as the cart grows, which keeps the shortcut registration and its listener stable.

**Stub-provider test for `CartPanel`:**

```tsx
// No reducer, no provider, no clicking: the panel only needs values.
const state: CartState = {
  lines: [{ productId: 'p1', name: 'Mechanical Keyboard', unitMinor: 499900, quantity: 2 }],
  toast: null,
  recentlyAddedName: null,
};

render(
  <CartActionsContext value={{ add: () => {}, remove: () => {}, setQuantity: () => {}, clear: () => {}, dismissToast: () => {} }}>
    <CartTotalsContext value={{ itemCount: 2, subtotalMinor: 999800 }}>
      <CartStateContext value={state}>
        <CartPanel />
      </CartStateContext>
    </CartTotalsContext>
  </CartActionsContext>,
);
// assert: "₹9,998" appears, "Mechanical Keyboard" appears, the Remove button exists
```

Answers:

- **(a) When is three-way splitting worth it?** When at least one significant consumer is actions-only (well, and when a *totals*-only consumer exists that you want to keep off state changes). For a small app the single memoised value is simpler and already avoids *unrelated* re-renders; the split buys you the ability to keep dispatch-only subtrees (toolbars, shortcut handlers, "add" buttons in long lists) completely still while the cart changes.
- **(b) Why can the actions context value be permanently stable?** Because the actions close over nothing that changes: they call `dispatch` (stable by React's guarantee — Part 4, file 06) and the reducers hold all the logic. As long as an action does not read state directly (it should not — that is the reducer's job), its identity is stable forever, which is exactly the contract that lets consumers depend on it.
- **(c) What breaks if the totals value is not memoised?** A new `{ itemCount, subtotalMinor }` object is created on every provider render, so every totals consumer re-renders on every render of the provider — including renders caused by the *toast* changing (which does not affect totals at all). That is the Part 4, file 05 measurement in miniature: 4 renders instead of 1. The elements inside the object are equal; the identity is not, and identity is what `Object.is` compares.

---

## 15. Summary

- **Context solves one problem**: a value needed by many components at different depths. It is not a state manager and not a replacement for props.
- **The closest provider wins for its subtree** (verified: `outer=dark/#f5f5f5 · inner=light/#111`), and **a missing provider silently yields the default** (verified: `system/#111`) — which is why a `null` default plus a **throwing hook** is the pattern to copy.
- **`use(Context)` (React 19) may be called conditionally** (verified after an early return) — unlike `useContext`; it is not supported in Server Components.
- **Shape the value deliberately**: memoise it, keep actions stable, and **split state from actions** when actions-only consumers must stay still (verified: `StateConsumer 1 → 2` while `DispatchConsumer 1 → 1`).
- **Providers need not own state**: a provider that distributes a value it was handed is the pattern for configurable theming (verified: `brand/#c00`) and for tests.
- **Compose providers in dependency order** (a provider may read the ones above it), keep them out of conditionals, and put screen-specific providers close to the screen.
- **Test with stubs for presentation, the real provider for behaviour** (verified: `test-theme #0f0` rendered with no real provider).
- **Avoid misuse**: no context for one-level-deep values, for fast-changing values, for "everything", or for objects rebuilt on every render; keep the context private and export a hook; model lifecycles (`status: 'checking'`) rather than bare values.
- **Measure before optimising** — the blast radius of a context change is real, and the usual culprit is state placed too high (file 02), not context itself.

---

**What's next →** [Part 6 — Routing](../06-routing/01-routing-basics.md): how a single-page app decides which screen to show. We will start with the browser's own history API (why `pushState` exists, what a URL really contains), then move to React Router in the data-router era — routes as a tree, `<Link>` instead of `<a>`, params and query strings, nested layouts, loaders, and protected routes built on the auth context you just wrote.
