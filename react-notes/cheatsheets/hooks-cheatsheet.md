# Hooks Cheat Sheet — Every Hook, One Page

> Signature, when to use it, when not to, and the bug it prevents.
> Deep versions: [Part 4](../04-state-and-hooks/) · [Part 10](../10-advanced-react/) · [Part 11](../11-modern-react/)

## The rules (non-negotiable)

1. **Only at the top level** — never inside `if`, loops, nested functions or `try`.
2. **Only in function components or `use*` hooks** — not in plain functions or classes.
3. **Same hooks, same order, every render** — React matches them by position, not by name.

Enforced by the `rules-of-hooks` lint rule. → [Part 4 · 10](../04-state-and-hooks/10-hooks-rules.md)

---

## State

### `useState`

```tsx
const [count, setCount] = useState(0);
const [user, setUser] = useState<User | null>(null);
const [rows, setRows] = useState<Row[]>([]);          // ❌ useState([]) infers never[]
const [config, setConfig] = useState(() => loadExpensiveConfig());   // lazy initialiser: runs ONCE
```

| Use when | Avoid when |
| --- | --- |
| A value the component owns and re-renders on | The value can be derived from props/state → compute it |
| Independent, simple values | Several values change together → `useReducer` |

```tsx
setCount(count + 1);        // reads THIS render's value
setCount((c) => c + 1);     // ✅ reads the latest pending value — use when it depends on itself
setUser({ ...user, name }); // new object
setRows(rows.map(...));     // new array — never push/splice/sort in place
```

⚠️ `useState(load())` calls `load()` on **every render**. `useState(load)` calls it once.
→ [Part 4 · 02](../04-state-and-hooks/02-usestate.md)

### `useReducer`

```tsx
type State = { status: 'idle' | 'loading' | 'ready' | 'error'; data: Item[]; error: Error | null };
type Action = { type: 'start' } | { type: 'success'; data: Item[] } | { type: 'failure'; error: Error };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':   return { ...state, status: 'loading', error: null };
    case 'success': return { status: 'ready', data: action.data, error: null };
    case 'failure': return { status: 'error', data: [], error: action.error };
  }
}

const [state, dispatch] = useReducer(reducer, { status: 'idle', data: [], error: null });
dispatch({ type: 'start' });
```

**Use when:** several values change together; transitions have rules; you want the logic testable
without rendering; `dispatch` needs a stable identity.
**Avoid when:** one boolean. That is ceremony.
→ [Part 4 · 06](../04-state-and-hooks/06-usereducer.md)

---

## Effects and the outside world

### `useEffect`

```tsx
useEffect(() => {
  const controller = new AbortController();
  load(id, controller.signal);
  return () => controller.abort();          // cleanup: before the next run AND on unmount
}, [id]);                                     // deps: EVERY reactive value read inside
```

| Deps | Runs |
| --- | --- |
| `[a, b]` | After mount, and whenever `a` or `b` changes |
| `[]` | Once after mount (+ cleanup on unmount) |
| *(omitted)* | After **every** render — almost never what you want |

**Use when:** synchronising with something outside React — a subscription, a timer, the DOM,
`localStorage`, a WebSocket.
**Do NOT use for:** deriving state (compute it), responding to a user action (use the handler),
or fetching data in a modern app (use a data library with caching and cancellation).

⚠️ **The stale closure:** a callback created in a render closes over *that render's* values.
Empty deps + `count` inside = stuck at 0. Fix with the functional updater, correct deps, or a ref.
→ [Part 4 · 03](../04-state-and-hooks/03-useeffect.md)

### `useLayoutEffect`

```tsx
useLayoutEffect(() => {
  const height = ref.current?.getBoundingClientRect().height;   // measure
  setPosition(height);                                          // …and adjust before paint
}, []);
```

Runs **synchronously after the DOM mutation, before the browser paints**. Use only for measuring
and adjusting layout, where `useEffect` would cause a visible flicker. It blocks paint — do not
use it for anything else.

### `useImperativeHandle`

```tsx
const FancyInput = forwardRef(function FancyInput(_props, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  return <input ref={inputRef} />;
});
```

Exposes a limited imperative API to a parent. Rare — prefer props, and prefer lifting the
behaviour up.

---

## Refs and context

### `useRef`

```tsx
const inputRef = useRef<HTMLInputElement>(null);       // DOM handle → ref={inputRef}
const timerRef = useRef<number | undefined>(undefined); // mutable box, no re-render
const prevRef  = useRef<string | null>(null);           // the previous value
```

**Writing to a ref never triggers a render.** That makes it right for timer ids, abort
controllers, previous values, and DOM APIs React does not model (focus, scroll, selection,
canvas). Never read or write `ref.current` **during render** — it is a side effect and breaks
under concurrent rendering.
→ [Part 4 · 04](../04-state-and-hooks/04-useref.md)

### `useContext`

```tsx
const ThemeContext = createContext<Theme>(defaultTheme);

// Provider
<ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>

// Consumer
const theme = useContext(ThemeContext);

// The pattern that catches a missing provider
export function useTheme(): Theme {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
```

⚠️ Every consumer re-renders when the value's **identity** changes. Memoise the provider value,
and split fast-changing state from stable actions.
→ [Part 4 · 05](../04-state-and-hooks/05-usecontext.md) · [Part 5 · 09](../05-react-concepts/09-context.md)

### `useId`

```tsx
const id = useId();
<label htmlFor={id}>Email</label><input id={id} />
```

A stable unique id that matches between server and client rendering. **Never** use it as a
`key` — keys must come from your data.

---

## Performance

### `useMemo`

```tsx
const sorted = useMemo(() => [...items].sort(byName), [items]);   // cache an expensive value
const options = useMemo(() => ({ id }), [id]);                    // stabilise an object identity
```

### `useCallback`

```tsx
const onSave = useCallback(() => save(id), [id]);   // cache a function identity
```

`useCallback(fn, deps)` is exactly `useMemo(() => fn, deps)`.

**Use when:** the Profiler shows a real cost; a callback goes to a `React.memo` child; an object
or function is in a dependency array and must be stable.
**Do NOT use:** everywhere, "for performance". Memoisation costs comparisons and memory, and it
cannot fix an algorithmic problem. **Measure first** — and note that React Compiler automates
much of this.
→ [Part 10 · 03](../10-advanced-react/03-memoization.md) · [Part 11 · 08](../11-modern-react/08-react-compiler.md)

### `useTransition`

```tsx
const [isPending, startTransition] = useTransition();
startTransition(() => setQuery(value));    // interruptible: typing stays responsive
```

### `useDeferredValue`

```tsx
const deferredQuery = useDeferredValue(query);
const results = useMemo(() => rows.filter(matches(deferredQuery)), [rows, deferredQuery]);
```

Both mark work as non-urgent so urgent updates (typing) are not blocked. Prefer them over
debouncing when the work is rendering, not requesting.
→ [Part 10 · 09](../10-advanced-react/09-concurrent-features.md)

---

## React 19 hooks

### `useActionState`

```tsx
const [state, submitAction, isPending] = useActionState(async (previous, formData) => {
  const result = await createTask(formData);
  return result.ok ? { success: true } : { error: result.message };
}, { error: null });

<form action={submitAction}>…</form>
```

Gives you pending + result state for a form action in one hook.
→ [Part 11 · 04](../11-modern-react/04-useactionstate.md)

### `useOptimistic`

```tsx
const [optimisticMessages, addOptimistic] = useOptimistic(messages, (current, draft) => [...current, draft]);
// show the draft immediately; React reverts automatically if the action throws
```

→ [Part 11 · 06](../11-modern-react/06-useoptimistic.md)

### `useFormStatus`

```tsx
function SubmitButton() {
  const { pending } = useFormStatus();          // reads the PARENT <form action>
  return <button disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>;
}
```

Must be called in a component rendered **inside** the `<form>`.
→ [Part 11 · 03](../11-modern-react/03-forms-actions.md)

### `use`

```tsx
const data = use(promise);        // suspends; must be paired with <Suspense>
const theme = use(ThemeContext);  // may be called conditionally, unlike useContext
```

→ [Part 11 · 07](../11-modern-react/07-use.md)

### `useSyncExternalStore`

```tsx
const isOnline = useSyncExternalStore(
  (onChange) => { window.addEventListener('online', onChange); window.addEventListener('offline', onChange);
                  return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange); }; },
  () => navigator.onLine,
  () => true,               // getServerSnapshot
);
```

The correct way to subscribe to a non-React store (Zustand and Redux use it internally).
Tear-free by construction.

---

## Custom hooks

```tsx
// src/shared/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);          // the cleanup IS the debounce
  }, [value, delayMs]);
  return debounced;
}

// Returning a tuple: annotate the return type so it is not widened to an array
function useToggle(initial = false): [boolean, () => void] {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle];
}
```

**Rules:** name it `use*`, it may call other hooks, it must follow the same top-level rules, and
it should return values the caller can destructure. Extract a hook when the same logic appears
twice — not before.
→ [Part 4 · 09](../04-state-and-hooks/09-custom-hooks.md)

---

## Choosing a hook

```text
A value I own and re-render on            → useState
Several values that change together       → useReducer
Something outside React (subscription)    → useEffect (+ cleanup)
Measure/adjust before paint               → useLayoutEffect
A mutable box / a DOM node                → useRef
A value from far up the tree              → useContext
An expensive computation                  → useMemo (after measuring)
A stable callback for a memo child        → useCallback (after measuring)
Keep typing responsive                    → useTransition / useDeferredValue
Pending + result for a form action        → useActionState
Show a change before the server confirms  → useOptimistic
A non-React store                         → useSyncExternalStore
The same logic in two components          → a custom hook
```

## The bugs each hook prevents

| Bug | Hook that fixes it |
| --- | --- |
| State stuck at its initial value in a callback | Functional updater, or correct deps |
| Doubled subscriptions in `StrictMode` | A cleanup function in `useEffect` |
| Stale search results | `AbortController` in the effect cleanup |
| A form that resets while typing | Depend on `task.id`, not `task`; or `key={task.id}` |
| Re-rendering every context consumer | `useMemo` on the provider value; split the context |
| Janky typing while filtering 5,000 rows | `useDeferredValue` + virtualisation |
| `useState([])` → `never[]` | `useState<Row[]>([])` |
