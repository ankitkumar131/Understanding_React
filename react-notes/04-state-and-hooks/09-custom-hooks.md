# 09 — Custom Hooks: Packaging Behaviour for Reuse

> **Part 4 · State and Hooks · File 9 of 10**
> Why this file exists: a custom hook is a function whose name starts with `use` and which calls other hooks — and that is genuinely *all* it is. What makes it worth writing is that it gives a **name to a piece of stateful behaviour**, so the component that uses it reads like the feature it implements. This chapter takes the lab's five hooks apart line by line (`useCart`, `useLocalStorageState`, `useDebouncedValue`, `useKeyDown`, `useDocumentTitle`), measures the property that surprises people most — two calls to the same hook keep **completely separate** state (12 and 101) — and shows the ref trick that keeps a document listener attached exactly once while still seeing the newest props.

---

## 1. What a custom hook is

```ts
// The whole idea, in four lines:
function useCounter(start = 0) {
  const [count, setCount] = useState(start);
  return { count, increment: () => setCount((c) => c + 1) };
}
```

That is a custom hook. It is a **plain function** with two requirements:

1. its name starts with `use`, and
2. it only calls other hooks from its own top level.

It shares **logic**, never **state**. Every component (or every call site) that uses `useCounter` gets its own `count` — its own `useState` slot in its own position in the tree.

**Verified** — the same hook called twice inside one component:

```text
8. one custom hook used twice in the same component
   first: 12   second: 101   (separate state per hook call)
```

Two calls, two independent counters: `12` and `101`. If a custom hook shared state, React's whole model — state belongs to a component instance at a position in the tree — would collapse.

What a custom hook is **not**:

| It is not… | Because |
| --- | --- |
| a component | components return JSX and are called by React; hooks return values and are called by *your* code |
| a way to share state between components | state sharing is context/`useState` lifting (Part 5); hooks share the *logic* that manages state |
| a class replacement "with a `use` in front" | no lifecycle methods, no `this`; the rules of hooks are the contract |
| a mini-framework | a hook is a function; if it has "options", "plugins" and a "provider", you probably want a library |
| necessarily reusable | a hook used once is still worth it when it *names a concept* (that is a documentation win) |

---

## 2. Why the name must start with `use`

React identifies hooks **by call order**, not by name, at runtime. The `use` prefix is for **tools**:

- the linter (`react-hooks/rules-of-hooks`) only inspects functions whose names match `use[A-Z].*`, so it can apply the rules of hooks to your function;
- the linter (`react-hooks/exhaustive-deps`) only checks dependency arrays inside functions it recognises as hooks;
- React's own error messages and the React Compiler use the same convention;
- humans reading the file instantly know "this function must be called like a hook".

```ts
function useCart() { … }        // ✅ linter treats it as a hook
function getCart() { … }        // ❌ calls useState inside a plain function → "Invalid hook call"
function UseCart() { … }        // ⚠️ not matching the pattern strictly (`use[A-Z]`) — rename it
```

Consequences worth knowing:

- A function called `useCart` **may not** be called conditionally — it must be called like any other hook (section 3).
- A function called `getCart` **must not** call hooks — if it needs state, rename it to `useCart`.
- The lab's naming: **`use` + the thing being managed** (`useCart`, `useDebouncedValue`, `useKeyDown`, `useDocumentTitle`, `useLocalStorageState`), files in `src/hooks/`, one hook per file when the hook has a helper or a type to export.

---

## 3. The rules, and the exact errors

Custom hooks inherit the rules of hooks (file 10 states them formally). Three verified failures make the cost concrete:

```text
9. a hook called inside an `if`
   thrown: Rendered more hooks than during the previous render.

10. an early return between two hooks
   thrown: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.

12. a hook called inside an event handler
   thrown synchronously : (no error thrown)
   reported to window   : Invalid hook call. Hooks can only be called inside of the body of a function component.
```

The first two are order violations in a component (React counts hook calls per render and compares with the previous render). The third is not an order problem at all: an event handler is not a render, so there is nowhere to put a hook slot — and notice that the error arrives **asynchronously** through `window.onerror`, which is exactly why "it seemed to work" is a dangerous conclusion when you call a hook in the wrong place.

The three rules, restated for custom hooks:

1. Call hooks at the **top level** of the function — never inside `if`, loops, `try`/`catch`, or after an early `return`.
2. Call them from **React functions**: components or other hooks. Never from event handlers, timers, plain utilities, or class methods.
3. Name your function with the `use` prefix so tools can enforce 1 and 2.

---

## 4. Anatomy: inputs, outputs, and return shapes

A well-designed hook can be described in one sentence: **"give it these, and it hands you back those, and while it is alive it does this."**

| Part | Design question | The lab's answer |
| --- | --- | --- |
| **Inputs (arguments)** | What does the caller know that the hook needs? Prefer primitives. | `useDebouncedValue(value, delayMs)`, `useKeyDown(key, handler, options)` |
| **Options** | Group optional configuration in one object with defaults, so the call site reads well and the API can grow. | `useKeyDown(key, handler, { ignoreInInputs: true })` |
| **Outputs** | Tuple (like `useState`) or object (like an API)? | tuple for a value+setter pair; object for `useCart`/`useUndoableState` |
| **Stability** | Which returned functions/objects must keep their identity? | wrapped in `useCallback`/`useMemo` (file 08) |
| **Purity** | Is everything done during render pure? | yes; effects and refs handle the impure parts |
| **Cleanup** | What happens when the consumer unmounts? | every timer/listener/attribute is reverted (files 03/04) |

**Tuple vs object** — a real decision, not a style preference:

```ts
// Tuple: the caller renames the parts, which reads exactly like useState.
const [open, setOpen] = useToggle(false);

// Object: the caller destructures only what it needs, and the hook can grow
// without breaking call sites (adding a field is not a breaking change).
const { value, undo, redo, canUndo, canRedo } = useUndoableState('');
```

Rule of thumb: **two values that are a "pair" → tuple; three or more related values, or an API with actions → object.** (Objects also cost a `useMemo` if consumers put the hook's result in a dependency list.)

**Name the boolean helpers positively.** `canUndo`/`canRedo` read better at the call site than `undoDisabled`/`!canUndo`, and positive names survive double negation in JSX.

---

## 5. The lab's five hooks

| Hook | File | What it packages |
| --- | --- | --- |
| `useCart()` | `src/hooks/useCart.ts` | the whole cart: reducer state, derived totals, stable actions, memoised API object |
| `useLocalStorageState(key, initial, validate?)` | `src/hooks/useLocalStorageState.ts` | state mirrored into `localStorage` (lazy read, guarded write) |
| `useDebouncedValue(value, delayMs?)` | `src/hooks/useDebouncedValue.ts` | a value that lags behind rapid changes |
| `useKeyDown(key, handler, options?)` | `src/hooks/useKeyDown.ts` | a document-level keyboard shortcut with a fresh handler and a single listener |
| `useDocumentTitle(title)` | `src/hooks/useDocumentTitle.ts` | `document.title` kept in sync, restored on unmount |

Five hooks, and notice what they have in common: each one **names a concept** that a component would otherwise have to spell out inline, and each one is used by at least one component. None of them is "a helper" — helpers live in `src/utils/` (like `formatMoney`) and take no hooks.

---

## 6. `useCart`, line by line

The hook that file 05 and file 06 built. Reading it end to end shows all four hooks of this part working together:

```ts
export function useCart(): CartApi {
  const [state, dispatch] = useReducer(cartReducer, emptyCart);          // file 06: the state machine

  const itemCount = useMemo(() => cartItemCount(state), [state]);         // file 07: identity
  const subtotalMinor = useMemo(() => cartSubtotalMinor(state), [state]);

  const add = useCallback(
    (product: Pick<Product, 'id' | 'name' | 'priceMinor'>) => {
      dispatch({ type: 'add', product });                                 // file 08: stable, [] is correct
    },
    [],
  );
  const remove = useCallback((productId: string) => dispatch({ type: 'remove', productId }), []);
  const setQuantity = useCallback(
    (productId: string, quantity: number) => dispatch({ type: 'setQuantity', productId, quantity }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const dismissToast = useCallback(() => dispatch({ type: 'dismissToast' }), []);

  return useMemo(
    () => ({ state, itemCount, subtotalMinor, add, remove, setQuantity, clear, dismissToast }),
    [state, itemCount, subtotalMinor, add, remove, setQuantity, clear, dismissToast],        // file 07: the API object
  );
}
```

Line-by-line reasoning, in the order a reader meets them:

- **`useReducer` instead of `useState`** because the cart is a set of rules (file 06), and because `dispatch` is guaranteed stable — which is what makes the empty dependency lists below *correct* rather than merely convenient.
- **`useMemo` on `itemCount`/`subtotalMinor`**: derived values that several components read. The computation is trivial; the point is identity. (If you deleted both memos the app would still be correct — a good check to run in your head for every memo: *what breaks if I delete it?* Here: extra work downstream, nothing incorrect.)
- **`useCallback([])` on the five actions**: they are the hook's **public API**. A consumer may pass `add` to a `memo` child, put it in an effect's dependency list, or place it in a context value; all three require stability (file 08 measured the toast timer breaking without it).
- **The returned object is `useMemo`-ised**: `CartProvider` hands it to `<CartContext value={…}>`, and context compares the value with `Object.is` (file 05 measured 4 consumer renders vs 1).
- **The return type is declared** (`CartApi`), so a typo in a field name is a compile error at every call site instead of `undefined` at runtime.

---

## 7. `useLocalStorageState` — two effects of an external system

```ts
export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  validate?: (value: unknown) => value is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === 'undefined') return initialValue;      // ① not in a browser / SSR
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return initialValue;                        // ② nothing saved yet
      const parsed: unknown = JSON.parse(stored);                      // ③ whatever was saved is NOT T
      if (validate !== undefined) return validate(parsed) ? parsed : initialValue;
      return parsed as T;                                              // ④ the caller promised a guard
    } catch {
      return initialValue;                                             // ⑤ corrupt JSON / storage blocked
    }
  });

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));                // ⑥ write after the commit
    } catch {
      // Persisting is best-effort: private mode and quota limits can block it.
    }
  }, [key, value]);

  const set = useCallback((next: T) => setValue(next), []);            // ⑦ stable setter
  return [value, set];
}
```

The seven decisions, one at a time:

1. **A lazy initialiser, not a plain value.** `useState(readStorage())` calls `readStorage` on *every* render; `useState(() => readStorage())` calls it once. File 02 measured exactly this: over four renders the lazy form ran the initialiser **1×** and the eager form **4×**, throwing away three results. Reading external storage during render is also a side-effect-ish act; doing it once, at initialisation, is the acceptable version of it (file 04's "initialization is the only allowed `ref.current` access during render" has the same shape).
2. **A `typeof localStorage === 'undefined'` guard** keeps the hook safe in server rendering (our `render-static.tsx` harness runs with no `localStorage` global — that is how the guard was tested).
3. **`JSON.parse` returns `unknown`**, and TypeScript is right: storage is written by *any* version of the app that ever ran, including a buggy one. Casting straight to `T` would be a lie the compiler cannot catch.
4. **An optional type guard** (`validate?: (value: unknown) => value is T`) lets the caller make the promise safely. The lab passes `isCategoryChoice`, a real type guard:

   ```ts
   const isCategoryChoice = (value: unknown): value is CategoryChoice =>
     value === 'all' || (typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value));
   ```

   Without it, a stale stored value (`"audio2"`, or an object from an old schema) would flow into the app as a "valid" category and produce an empty, broken screen.
5. **Every failure path falls back to `initialValue`** — a corrupt JSON blob must not crash the app on startup. (The probe wrote `'{"broken":'` into storage to test this.)
6. **The write happens in an effect, not during the render or in the setter.** Rendering stays pure; the effect runs after commit, and its dependency list means it writes when either the key or the value changes. `localStorage.setItem` interactions are exactly the kind of "synchronise with an external system" work that effects are for (file 03, section on the no-effect table).
7. **`set` is wrapped in `useCallback([])`** so the hook's contract is stable (file 08) — a `useState` setter is already stable, so this is a thin, dependency-free wrapper.

💡 **The general pattern behind points 1 and 6** — *read once at initialisation, write after every change* — applies to every external system you mirror into React state: `window.matchMedia`, `navigator.language`, a WebSocket, a third-party widget. The read is a lazy initialiser; the write is an effect (or an event handler, if the change originates from your code).

---

## 8. `useDebouncedValue` — a timer per keystroke, and why it is safe

```ts
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    // Cleanup cancels the PENDING update, so only the last change in a burst wins.
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

**Verified** — typing `"a"`, `"ab"`, `"abc"` with 60 ms between keystrokes and a 120 ms delay:

```text
13. useDebouncedValue(value, 120) while typing "a", "ab", "abc" in 60ms
   debounced value right after the last keystroke : ""
   debounced value 200ms later                    : "abc"
```

Right after the last keystroke the debounced value is still the **initial** `""` — no intermediate value was ever published. 200 ms later it is `"abc"`, the final value. Three keystrokes produced **one** settled result.

Why the cleanup makes this correct, rather than merely convenient: each keystroke is a new render, so the effect re-runs; React calls the previous cleanup first, cancelling the previous timer; only the last timer survives to fire. Without the cleanup, three timers would be pending and `setDebounced` would be called three times — the value would flicker through `"a"`, `"ab"`, `"abc"` and, if the calls were asynchronous in a different order (a fetch per keystroke), the *oldest* result could land last.

**The connection to `useEffect`'s contract**: "an effect with a cleanup can be re-run at any time; the cleanup must leave the world as if the effect had never run". The debounce hook is a perfect example of a hook that *relies* on that guarantee.

**The one gotcha**: it debounces the *value*, not the *callback*. If you need to debounce an action (an API call that is not driven by a value), write a sibling hook:

```ts
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs = 300,
): (...args: A) => void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;   // keep the newest callback, like useKeyDown below
  }, [callback]);
  const timerRef = useRef<number | undefined>(undefined);
  return useCallback((...args: A) => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => callbackRef.current(...args), delayMs);
  }, [delayMs]);
}
```

⚠️ Note that it must **clear its own pending timer on unmount** if the callback can touch state — otherwise a debounced update fires after the component is gone (a memory leak and, in React, a warning-free no-op you will not notice until it matters). Adding `useEffect(() => () => window.clearTimeout(timerRef.current), [])` is the fix.

---

## 9. `useKeyDown` — a listener that is attached exactly once

This is the most instructive hook in the lab, because it solves the problem that file 08's toast had, but from the other direction: instead of asking the caller to memoise the handler, the hook makes an unstable handler harmless.

```ts
export function useKeyDown(key: string, handler: KeyHandler, options: KeyDownOptions = {}): void {
  const { ignoreInInputs = false } = options;
  const handlerRef = useRef(handler);

  // ① Keep the ref pointing at the newest callback — never during render.
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key) return;
      if (ignoreInInputs && isEditable(event.target)) return;
      handlerRef.current(event);          // ② always the LATEST handler
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);   // ③ symmetric cleanup
    };
  }, [key, ignoreInInputs]);              // ④ NOT dependent on `handler`
}
```

The four decisions:

1. **The handler lives in a ref.** `useRef` gives one box that survives renders (file 04); writing to it in an effect keeps the ref "pure enough" — React's own guidance allows reading/writing `ref.current` in effects, and forbids it during render.
2. **The listener reads through the ref**, so it always calls the newest closure — the stale-closure problem from file 08 disappears *without* asking the caller to wrap anything.
3. **Cleanup removes exactly the function that was added.** Because the listener is created inside the effect, add and remove are guaranteed to match; this is why the effect's dependency list can be small.
4. **The dependency list contains only `key` and `ignoreInInputs`** — the values that must re-attach the listener. The handler is deliberately excluded; that is the *point* of the ref, not an oversight. (The linter permits this because the handler is not used inside the effect — only `handlerRef` is.)

**Verified** — the lab's `/` shortcut from `App.tsx` (`useKeyDown('/', focusSearch, { ignoreInInputs: true })`):

```text
14. useKeyDown("/", handler, { ignoreInInputs: true })
   pressing "/" on the page        : handler calls -> 1
   pressing "/" inside the input   : handler calls -> 1   (ignored while typing)
```

The handler ran when the key was pressed on the page, and did **not** run when the user was typing in an input — the `ignoreInInputs` option, with `isEditable` covering `INPUT`, `TEXTAREA` and `contentEditable`. Two details make the option work correctly:

```ts
function isEditable(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable;
}
```

`event.target` (not `currentTarget` — file 06 of Part 3's event recap) is what identifies the focused element, and the `instanceof HTMLElement` check is needed because the event target is typed as `EventTarget | null` and *could* be `document` or `window`.

⚠️ **The general rule this hook encodes**: when a listener must be attached to something outside React (the document, a WebSocket, an `IntersectionObserver`), and the callback needs fresh props, **split the two concerns**: attach/detach depends on the *configuration* (the key, the options), while the *callback* is read through a ref. Trying to do both with one dependency list gives you either a stale handler or a re-attach on every render.

---

## 10. `useDocumentTitle` — the "restore what you changed" pattern

```ts
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;          // cleanup restores what we found
    };
  }, [title]);
}
```

**Verified:**

```text
15. useDocumentTitle
   before mount      : ""
   while mounted     : "(2) MegaShop"
   after a change    : "(3) MegaShop"
   after unmount     : ""   (the cleanup restored the old title)
```

The value added by the hook is not the assignment — it is the **cleanup**: the component that mounted the hook does not leave a modified document behind. That is the same discipline as `Toast`'s timer and `useKeyDown`'s listener, applied to a DOM property. Components that mount and unmount (`<ProductPage productId={id} />` in Part 6) would otherwise accumulate titles from whichever component mounted last, and "the title is wrong after navigating back" would be a mystery bug.

Three notes on the hook's design:

- **It takes a value, not a callback**, which makes it impossible to misuse: `useDocumentTitle(count > 0 ? `(${count}) MegaShop` : 'MegaShop')` reads like a template string, and the effect only re-runs when the string changes.
- **Restoring `previous` on *every* title change** (not only on unmount) means the hook behaves correctly even if the title changed elsewhere in between.
- **It is a single-purpose hook.** A "useDocument" hook that also managed `document.body` classes and the favicon would be harder to read and harder to test; three small hooks are better than one large one.

---

## 11. Composition: hooks calling hooks, and where to stop

Custom hooks may call other custom hooks. The lab composes them in both directions:

```ts
// A hook built from hooks: useCart is useReducer + useMemo + useCallback.
export function useCart(): CartApi { … }

// A component built from hooks (App):
const focusSearch = useCallback(() => searchRef.current?.focus(), []);
useKeyDown('/', focusSearch, { ignoreInInputs: true });       // hook → hook (useCallback inside)
```

Three levels, three different tools — the boundary is not arbitrary:

| Level | Use it for | Example | Can it call hooks? |
| --- | --- | --- | --- |
| **Pure function** (`src/utils/`) | values in, values out; no state, no lifetime | `formatMoney`, `checkoutTotalMinor` | no |
| **Custom hook** (`src/hooks/`) | *stateful behaviour* with a lifetime: state, effects, refs, and the cleanup that goes with them | `useDebouncedValue`, `useKeyDown` | yes |
| **Component** (`src/components/`) | *rendering*: JSX, markup, accessibility, styling | `<ProductCard />`, `<CartPanel />` | yes |

Two symptoms that tell you the level is wrong:

- A "hook" that returns JSX: that is a component. (If it also returns values — `<Toast />` needs `onDismiss` — return an array: `const [toastElement, toastApi] = useToast()`. Then the element is rendered by the component and the API is used by handlers, which is precisely the split the two kinds of code need.)
- A "hook" that could be a pure function: if nothing inside uses a hook, put it in `src/utils/`. It will be faster to test and impossible to misuse.

**The reuse question, honestly**: `useLocalStorageState`, `useDebouncedValue`, `useKeyDown` and `useDocumentTitle` are the kind of hooks you will write in every project — they are small, well-understood pieces of browser behaviour. `useCart` is the app-specific kind: it names *your* domain. Both are worth writing, for the same reason: the component that consumes them says *what* the screen does, not *how* React is being driven.

---

## 12. Testing a custom hook

Hooks cannot be called outside a render, so tests render a tiny host component (or use a library's `renderHook`, which does the same thing). The lab's probe is a readable template:

```tsx
function UndoDemo() {
  const history = useUndoableState(0);
  return (
    <div>
      <button className="set1" onClick={() => history.set(1)}>set 1</button>
      <button className="undo" onClick={history.undo}>undo</button>
      <span className="value">{history.value}</span>
      <span className="flags">{`canUndo=${history.canUndo} canRedo=${history.canRedo}`}</span>
    </div>
  );
}

// then, in the test: render it into a container and click, wrapped in act(...)
await act(async () => (container.querySelector('.undo') as HTMLButtonElement).click());
```

**Verified** results (the challenge solution of this chapter, `src/practice/useUndoableState.ts`):

```text
1. initial value and flags: 0 · canUndo=false canRedo=false
2. after set(1) then set(2): 2 · canUndo=true canRedo=false
3. after undo: 1 · canUndo=true canRedo=true
4. after a second undo (nothing left to undo): 0 · canUndo=false canRedo=true
5. set(0) while the value is already 0: a no-op: 0 · canUndo=false canRedo=true   (a naive history would push 0 again)
6. after redo: 1 · canUndo=true canRedo=true
```

Four things these assertions demonstrate about *testing hooks*:

1. **Test through the public surface** — the rendered value and the `canUndo`/`canRedo` flags. Nothing here reaches for the internal `past`/`future` arrays.
2. **Assert the boundary conditions** — "nothing left to undo" is where the interesting bugs are (an off-by-one in `past.at(-1)`).
3. **Assert the no-ops** — step 5 verifies that setting the *same* value produces no history entry; a naive implementation would have pushed `0` and made `canUndo` true.
4. **Keep the harness tiny.** The demo component exists only to give the hook a render; business logic (the reducer itself) is tested as a plain function (file 06's `console.assert` tests).

💡 **The deeper testing lesson**: the *pure* parts of a hook should be extractable and testable without React at all. `useUndoableState`'s reducer is a pure function of `(state, action)`; `useDebouncedValue` has no logic of its own beyond the timer; `useKeyDown`'s `isEditable` is a plain function. Test the pure parts directly, and use a host component for the hook's lifetime behaviour (timers, listeners, cleanup). Part 11 covers the standard tooling (`@testing-library/react`'s `renderHook`, `userEvent`, fake timers).

---

## 13. The hook landscape you are now equipped for

React 19.3 ships 20 hooks; the lab probed each one's availability in the installed version:

```text
react version: 19.3.0
available (19): useState, useReducer, useEffect, useLayoutEffect, useInsertionEffect,
  useEffectEvent, useRef, useContext, useMemo, useCallback, useTransition, useDeferredValue,
  useId, useSyncExternalStore, useDebugValue, useImperativeHandle, useActionState, useOptimistic, use
missing   (1): useFormStatus        ← it lives in React DOM, not React:
react-dom: flushSync, createPortal, preload, preinit, useFormStatus, useFormState, requestFormReset
```

Grouped by what they are for (React's own documentation structure):

| Group | Hooks | Where in these notes |
| --- | --- | --- |
| **State** | `useState`, `useReducer` | files 02, 06 — done |
| **Context** | `useContext` | file 05 — done |
| **Ref** | `useRef`, `useImperativeHandle` | file 04 — done |
| **Effect** | `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useEffectEvent` | file 03; `useLayoutEffect`/`useEffectEvent` in Part 10 |
| **Performance** | `useMemo`, `useCallback`, `useTransition`, `useDeferredValue` | files 07–08; transitions in Part 10 |
| **Other** | `useId`, `useSyncExternalStore`, `useDebugValue`, `useActionState`, `useOptimistic`, `use` | Part 10 and Part 8 (forms/actions) |
| **React DOM** | `useFormStatus`, `useFormState` (legacy name for `useActionState`) | Part 8 |

Anything a hook does not cover, a custom hook usually can: the library ecosystem is essentially "well-tested custom hooks" (`react-hook-form`, `react-query`, `react-router`'s `useNavigate`, `zustand`'s `useStore`). Reading those libraries becomes much easier now that you know a hook is a function with a state slot — and reading them is next on the ladder after this part.

⚠️ **The compiler-era note (one last time)**: custom hooks are unaffected by React Compiler in the sense that they remain the *unit of reuse* — the compiler optimises inside components, and it honours the same rules of hooks. What changes is that the memos *inside* your hooks may become unnecessary; what does not change is naming, rules, and the discipline of cleanup.

---

## 14. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | A function that calls hooks without the `use` prefix | "Invalid hook call" at the first hook, and no linter help | rename to `useSomething` |
| 2 | A hook called inside an `if`, loop, or `try` | "Rendered more/fewer hooks than during the previous render" | call it unconditionally at the top; move the condition inside the hook |
| 3 | Calling a hook in an event handler or timer | the error arrives asynchronously via `window.onerror` | extract the logic into a hook or a plain function |
| 4 | Expecting two calls to share state | two independent states (measured: 12 and 101) | share state with context or lift it; hooks share logic |
| 5 | A hook that returns JSX | consumers get a "value" they must render, and lifecycle confusion follows | make it a component, or return `[element, api]` |
| 6 | A hook with a huge, needless API (12 fields) | every consumer destructures half of it; it is a service, not a hook | split by concern (`useCart` vs `useCartTotals`) |
| 7 | Unstable functions in the hook's return value | consumers' effects re-run, memo children re-render | wrap with `useCallback` (file 08) |
| 8 | A fresh object returned every render | consumers re-render or effects churn | `useMemo` (file 07), especially for context values |
| 9 | Forgetting cleanup for timers/listeners/observers | leaks, "state update after unmount", duplicated listeners | return a cleanup from the effect; keep add/remove symmetric |
| 10 | Reading `localStorage`/`matchMedia` during render on every render | impure render, SSR crashes, repeated work | lazy initialiser + a guard, writes in effects |
| 11 | A hook whose options object is created inline and *used in the effect deps* | the listener re-attaches every render | destructure the options into primitives in the dependency list (as `useKeyDown` does) |
| 12 | Testing hooks by reaching into their internals | tests break on refactors, and behaviour stays untested | test through the rendered output + reducer-level unit tests |

---

## 15. Best practices

1. **Name hooks after the concept they manage**, not the mechanism: `useCart` beats `useCartReducer`.
2. **One hook, one concern.** If the description needs "and", split it.
3. **Give it a precise return type**, and use a tuple for pairs and an object for APIs.
4. **Stabilise everything you return** that could end up in a dependency list.
5. **Keep the pure logic outside the hook** (reducers, formatters, guards) so it can be unit-tested without React.
6. **Guard the browser** (`typeof window === 'undefined'`, `typeof localStorage === 'undefined'`) so the hook survives server rendering and tests.
7. **Own your cleanup**: every listener, timer, observer and mutated DOM property must be reverted.
8. **Use a ref for "latest value"** when you need fresh props *and* a stable subscription (the `useKeyDown` pattern).
9. **Document the contract** in a comment or the type when a caller must memoise something (as `Toast`'s `onDismiss` does).
10. **Write the hook when a pattern appears twice, or when it names a concept** — not because hooks are fashionable.

---

## 16. Practice

### Beginner — `useToggle`

**File: `src/practice/useToggle.ts`**

Write a hook that returns `[value, toggle]` (tuple), where `toggle` flips the boolean and there is an optional `initialValue: boolean = false`. Requirements: `toggle` must be stable; `value` must be a boolean; a second hook call in the same component must be independent. Then use it in a tiny component with two buttons — "Filters" and "Cart" — and confirm that opening one does not affect the other.

### Intermediate — `useInterval(callback, delayMs | null)`

**File: `src/practice/useInterval.ts`**

Write a hook that calls `callback` every `delayMs`, and **pauses** when `delayMs` is `null` — without losing its place. Requirements:

- A changing `callback` must **not** restart the timer (verify by passing an inline arrow that closes over a changing value).
- Setting `delayMs` to `null` must stop the ticks, and setting it back must resume.
- Cleanup must clear the interval on unmount.
- Then answer: why does `useInterval` exist at all, when `setInterval(() => setCount(c => c + 1), 1000)` in a component is the "obvious" version? What exactly goes wrong with the obvious version when the delay needs to change?

### Challenge — `useUndoableState<T>`

**File: `src/practice/useUndoableState.ts`**

Build a generic undo/redo hook on top of `useReducer` (file 06) and `useCallback`/`useMemo` (files 07–08), returning:

```ts
export interface UndoableState<T> {
  value: T;
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
  historyLength: number;
}
```

Requirements:

1. `set` pushes the previous value onto the undo stack and **clears the redo stack**.
2. `set` with the **same** value (compared with `Object.is`) must be a no-op — no history entry, no re-render.
3. `undo`/`redo` at the ends of the stacks are no-ops.
4. An optional `limit` caps how many entries are kept (the oldest fall off), so a long editing session cannot grow without bound.
5. `undo`, `redo`, `set`, `reset` must be stable across renders; the returned object must keep its identity unless the history changed.
6. The reducer must be exported as a **pure function** so it can be tested without React.

Then verify the six scenarios in section 12's transcript (initial flags, two sets, two undos, the no-op set, one redo) and answer: why does step 5 matter for a *reducer-based* design in particular, and what would a `useState`-based implementation need in order to match it?

---

## 17. Solutions

### Beginner

**File: `src/practice/useToggle.ts`**

```ts
import { useCallback, useState } from 'react';

/** A boolean with a stable toggle, and an optional explicit setter. */
export function useToggle(initialValue = false): [boolean, (next?: boolean) => void] {
  const [value, setValue] = useState(initialValue);

  // The updater form means the callback never reads `value`, so `[]` is correct
  // AND the callback stays stable (file 08).
  const toggle = useCallback((next?: boolean) => {
    setValue((current) => (next === undefined ? !current : next));
  }, []);

  return [value, toggle];
}

// Usage — two independent toggles:
export function FilterBar() {
  const [filtersOpen, toggleFilters] = useToggle();
  const [cartOpen, toggleCart] = useToggle();

  return (
    <div>
      <button type="button" onClick={() => toggleFilters()}>
        Filters {filtersOpen ? '▲' : '▼'}
      </button>
      <button type="button" onClick={() => toggleCart()}>
        Cart {cartOpen ? '▲' : '▼'}
      </button>
      <p>{filtersOpen ? 'filters visible' : 'filters hidden'} · {cartOpen ? 'cart visible' : 'cart hidden'}</p>
    </div>
  );
}
```

Two calls to `useToggle` are two separate `useState` slots — exactly the isolation measured in section 1 (`12` / `101`). Opening the filters panel leaves the cart flag untouched, because there is no shared state anywhere: the "sharing" is only in the *code* of the function.

### Intermediate

**File: `src/practice/useInterval.ts`** — as created in the lab:

```ts
import { useEffect, useRef } from 'react';

/**
 * Calls `callback` every `delayMs`. Passing `null` pauses it without losing the
 * hook's position, and a changing callback does NOT restart the timer.
 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  // The callback lives in a ref, so the effect below only depends on `delayMs`.
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;
    const id = window.setInterval(() => callbackRef.current(), delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}
```

**Verified** with `delayMs = 40` and an inline callback:

```text
7. useInterval(40ms): ticks after 150ms: 3
8. paused at tick: 3
9. ticks 150ms after pausing (frozen?): 3
10. ticks 150ms after resuming: 6
```

Three ticks in 150 ms, frozen at `3` for 150 ms while paused, then resuming to `6` — and crucially the inline arrow (`() => setTicks((t) => t + 1)`, a new function on every render) never restarted the timer, because the effect depends only on `delayMs`.

Answer to the closing question: with the "obvious" version,

```ts
// ❌ the classic bug
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), delayMs);
  return () => clearInterval(id);
}, [delayMs]);
```

changing `delayMs` is handled correctly (the effect re-runs), but the "obvious" version most people write first is `setInterval(…, 1000)` with `[]` — and then a *speed* control cannot exist, because the interval captured the first delay forever. A `useInterval` hook exists so that **the delay is a piece of state** (or a prop), not a constant baked into a closure: it turns "how often" into an input, and it makes "paused" expressible as `null` instead of having to tear the component down.

### Challenge

**File: `src/practice/useUndoableState.ts`** (verified: `npx tsc -b` silent, and the transcript in section 12)

```ts
import { useCallback, useMemo, useReducer } from 'react';

export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

type HistoryAction<T> =
  | { type: 'set'; next: T }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; next: T };

/**
 * The rules, as a PURE function — exported so tests can call it directly
 * (file 06's argument for reducers: no renderer needed to prove the rules).
 */
export function historyReducer<T>(state: History<T>, action: HistoryAction<T>, limit = 50): History<T> {

export interface UndoableState<T> {
  value: T;
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
  historyLength: number;
}

export function initialHistory<T>(value: T): History<T> {
  return { past: [], present: value, future: [] };
}

export function useUndoableState<T>(initialValue: T, limit = 50): UndoableState<T> {
  const [history, dispatch] = useReducer(
    // `limit` is bound into a small wrapper so the exported reducer stays generic.
    (state: History<T>, action: HistoryAction<T>) => historyReducer(state, action, limit),
    initialValue,
    initialHistory<T>,
  );

  // Stable API: all four functions only close over `dispatch`.
  const set = useCallback((next: T) => dispatch({ type: 'set', next }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback((next: T) => dispatch({ type: 'reset', next }), []);

  // The returned object is memoised so consumers' dependency lists stay quiet.
  return useMemo(
    () => ({
      value: history.present,
      set,
      undo,
      redo,
      reset,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      historyLength: history.past.length,
    }),
    [history, set, undo, redo, reset],
  );
}
```

Everything that was verified:

```text
1. initial value and flags: 0 · canUndo=false canRedo=false
2. after set(1) then set(2): 2 · canUndo=true canRedo=false
3. after undo: 1 · canUndo=true canRedo=true
4. after a second undo (nothing left to undo): 0 · canUndo=false canRedo=true
5. set(0) while the value is already 0: a no-op: 0 · canUndo=false canRedo=true
6. after redo: 1 · canUndo=true canRedo=true
```

Answer to the closing question: step 5 works because the reducer **compares before it builds a new state** — `Object.is(state.present, action.next)` returns the *identical* state object, and React's `useReducer` bails out of re-rendering when the reducer returns the same reference (exactly the `useState` bailout measured in file 02, section on mutation and the bailout). In a `useState`-based implementation you would have to write the same guard by hand inside the setter:

```ts
// useState equivalent — easy to forget, and the reason the reducer wins here
setHistory((previous) => {
  if (Object.is(previous.present, next)) return previous;   // ← the bailout
  return { past: [...previous.past, previous.present].slice(-limit), present: next, future: [] };
});
```

Adding `undo`/`redo`/`reset` and the `limit` on top of that setter would produce four places to get the immutability right; the reducer makes the whole rule set one pure function that a test can call directly (file 06's argument, demonstrated).

---

## 18. Summary

- A **custom hook** is a function whose name starts with `use` and which calls hooks at its top level. It shares **logic**, never state: two calls keep separate state (measured: `12` and `101`).
- The `use` prefix is what makes the rules-of-hooks and dependency-array lints apply to your function — and what warns the reader.
- The rules are inherited: no hooks in conditions, loops, `try`/`catch`, after early returns, or in event handlers/callbacks. The exact errors are "Rendered more/fewer hooks than during the previous render" and "Invalid hook call".
- Design hooks deliberately: **inputs** (primitives wherever possible), an **options** object for optional configuration, **outputs** as a tuple for pairs and an object for APIs, and **stable** functions/objects in the result.
- The lab's five hooks show five reusable patterns: reducer-based domain logic (`useCart`), external storage with a lazy read and an effect write (`useLocalStorageState`), cleanup-driven debouncing (`useDebouncedValue`, measured `""` → `"abc"`), a ref-backed listener attached once (`useKeyDown`, measured 1 call on the page / 0 while typing), and restore-on-unmount (`useDocumentTitle`, measured title restored to `""`).
- **Pure logic belongs outside the hook** (reducers, guards, formatters) so it can be tested without a renderer; the hook is tested through a tiny host component.
- Know the boundary: pure function → custom hook → component. A hook that returns JSX is a component; a hook that needs no hooks is a utility.
- Custom hooks remain the unit of reuse in the compiler era; the lints, naming and cleanup rules are exactly what the compiler expects from your code.

---

**What's next →** [`10-hooks-rules.md`](./10-hooks-rules.md): the formal rules this part has been obeying all along — why call order is the whole mechanism, exactly what React's error messages mean, how `exhaustive-deps` thinks about values (and how to make it stop complaining *correctly*), what the React Compiler requires of your code, and a checklist to run before you commit a component.
