# Hooks Cheatsheet — Every Hook, One Page Each

> **Reference · Cheatsheet 4 of 9**
> React 19. Rules first, then each hook: signature · when to use · gotcha · example.

---

## 0. The rules (non-negotiable)

1. **Top level only** — never inside a condition, loop, `try`, or nested function. React identifies hooks by call order.
2. **Only from components or other hooks** (names start with `use`).
3. **Lint enforces it** — `eslint-plugin-react-hooks` (and the React Compiler's validation pass) fail the build otherwise.
4. **Effects** must list every reactive value they read, and clean up anything they start.

---

## 1. `useState` — a value that re-renders

```tsx
const [value, setValue] = useState<T>(initial);          // initial value or a lazy initialiser function
```

| Use for | Gotcha | Example |
| --- | --- | --- |
| Anything the UI renders and the user changes | It is a **snapshot**: the value does not change mid-render | `const [open, setOpen] = useState(false);` |

```tsx
setCount(count + 1);                 // from this render's value
setCount((c) => c + 1);              // ✅ from the latest value — use when updates queue up
setTodos((current) => [...current, todo]);            // immutable array update
setUser((u) => (u === null ? null : { ...u, name })); // immutable object update
const [draft, setDraft] = useState(() => readDraft()); // lazy: the function runs once
```

**Never:** mutate (`push`, `obj.x =`) · set state during render · keep derived values in state.

---

## 2. `useEffect` — synchronise with the outside world

```tsx
useEffect(() => { /* setup */ return () => { /* cleanup */ }; }, [deps]);
```

| Runs | When |
| --- | --- |
| after every render | no dependency array |
| once after mount | `[]` |
| when `deps` change | `[a, b]` |
| cleanup before the next run and on unmount | always, if returned |

```tsx
useEffect(() => {
  const controller = new AbortController();
  const query = window.matchMedia('(min-width: 900px)');
  const update = (event: MediaQueryListEvent) => setIsWide(event.matches);

  query.addEventListener('change', update);
  void load(controller.signal);
  return () => { query.removeEventListener('change', update); controller.abort(); };
}, []);
```

| Use for | Do not use for |
| --- | --- |
| Subscriptions, timers, DOM APIs, non-React libraries | Deriving state from props/state |
| Analytics on a real change | Responding to a click |
| Syncing to `document.title`, focus, scroll | Fetching in an app (use `useQuery` or a loader) |

⚠️ StrictMode runs effects twice in development to expose missing cleanups. If your effect creates something without cleaning it up, that is a real bug.

---

## 3. `useRef` — a value that survives renders without re-rendering

```tsx
const ref = useRef<T | null>(null);      // React 19 requires the argument
```

| Use for | Never |
| --- | --- |
| DOM nodes, timer ids, `AbortController`s, previous values, mutable instance data | Render from `ref.current` (changing it does not re-render) |

```tsx
const inputRef = useRef<HTMLInputElement | null>(null);
const timerRef = useRef<number | null>(null);

useEffect(() => {
  timerRef.current = window.setInterval(() => setTick((t) => t + 1), 1000);
  return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); };
}, []);

inputRef.current?.focus();
```

---

## 4. `useContext` — read a value from an ancestor provider

```tsx
const value = useContext(MyContext);     // T | null if the default is null
```

```tsx
const ThemeContext = createContext<Theme | null>(null);

export function useTheme(): Theme {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
```

| Rule | Why |
| --- | --- |
| Memoise the provider's `value` | every consumer re-renders when the value changes identity |
| Provide a **typed hook**, not the raw context | one error message for the misuse, no `| null` at call sites |
| Keep high-frequency state out of context | a keystroke in context re-renders the whole app |

---

## 5. `useReducer` — state transitions with names

```tsx
const [state, dispatch] = useReducer(reducer, initialState);
```

```tsx
type Action = { type: 'add'; title: string } | { type: 'toggle'; id: string } | { type: 'clear' };

function reducer(state: Task[], action: Action): Task[] {
  switch (action.type) {
    case 'add': return [...state, createTask(action.title)];
    case 'toggle': return state.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
    case 'clear': return [];
    default: { const never: never = action; return never; }   // exhaustiveness
  }
}
```

Use it when several values change together, when the next state depends on the previous in non-trivial ways, or when you want the transitions unit-testable. `dispatch` is stable (safe in dependency arrays).

---

## 6. `useMemo` / `useCallback` — cache a value / a function

```tsx
const sorted = useMemo(() => [...items].sort(compare), [items]);
const onSelect = useCallback((id: string) => setSelected(id), []);
```

| Situation | Verdict |
| --- | --- |
| Expensive computation whose inputs rarely change | ✅ `useMemo` |
| Stable identity needed for an effect dependency or subscription | ✅ `useCallback` |
| The value is passed to a `memo`ised child | ✅ both, if the parent re-renders often |
| Trivial computation (`a + b`), or inputs change every render | ❌ noise |
| You have React Compiler enabled | usually unnecessary — the compiler inserts it; keep existing ones for now |

⚠️ Memoisation is **shallow**: a new object/array/function each render always defeats it.

---

## 7. `useId` — stable ids for accessibility

```tsx
const id = useId();                       // e.g. ":r1:" — same on server and client
<label htmlFor={`${id}-email`}>Email</label>
<input id={`${id}-email`} aria-describedby={`${id}-error`} />
{error !== null && <p id={`${id}-error`} role="alert">{error}</p>}
```

Use it for `id`/`htmlFor`/`aria-*` pairs inside reusable components; do not use it as a list key.

---

## 8. `useLayoutEffect` — before paint

```tsx
useLayoutEffect(() => { measureAndAdjust(); }, [deps]);
```

Use only when you must read layout and adjust synchronously (tooltips, measuring a node). It blocks painting, so prefer `useEffect` unless you have measured a visible flicker.

---

## 9. `useImperativeHandle` — expose methods to a parent ref

```tsx
const Input = forwardImperative(() => …);   // modern equivalent: pass ref as a prop and useImperativeHandle
export function FancyInput({ ref }: { ref: Ref<FancyInputHandle> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => { if (inputRef.current !== null) inputRef.current.value = ''; },
  }), []);
  return <input ref={inputRef} />;
}
```

Rare, and a sign that a library is wrapping a DOM node. Prefer props and state.

---

## 10. `useSyncExternalStore` — subscribe to an external store safely

```tsx
const isOnline = useSyncExternalStore(
  (onChange) => { window.addEventListener('online', onChange); window.addEventListener('offline', onChange);
    return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange); }; },
  () => navigator.onLine,          // client snapshot
  () => true,                       // server snapshot (SSR)
);
```

Use it when you wrap a non-React store (a vanilla state container, a browser API) and need tearing-free reads in concurrent rendering. Library authors use it; app code rarely needs it.

---

## 11. `useTransition` / `useDeferredValue` — keep the UI responsive

```tsx
const [isPending, startTransition] = useTransition();
startTransition(() => setFilter(query));               // mark non-urgent

const deferredQuery = useDeferredValue(query);         // lagging copy of a value you do not own
```

| Use | When |
| --- | --- |
| `useTransition` | you trigger the update and want `isPending` |
| `useDeferredValue` | the value comes from props/parent and you cannot wrap the setter |

Neither makes work faster: they let React keep the fast parts fast and show the previous result meanwhile.

---

## 12. `useOptimistic` — show the result before the server confirms

```tsx
const [optimisticLikes, addOptimisticLike] = useOptimistic(post.likes, (current: number) => current + 1);

<form action={async () => {
  addOptimisticLike(undefined);                       // visible immediately
  await like(post.id);                                // reverts automatically on failure
}}>
  <button type="submit">{optimisticLikes} likes</button>
</form>
```

Scope: the optimistic value lives only while the async action runs. For query-cache optimistic updates, use the `onMutate`/`onError`/`onSettled` pattern instead.

---

## 13. `useActionState` — a form action with pending state and errors

```tsx
const [state, submit, isPending] = useActionState(
  async (previous: FormState, formData: FormData): Promise<FormState> => {
    const email = String(formData.get('email') ?? '');
    const result = await save({ email });
    return result.ok ? initialState : { formError: result.message, fieldErrors: result.errors };
  },
  initialState,
);

<form action={submit}>
  {state.formError !== null && <p role="alert">{state.formError}</p>}
  <input name="email" aria-invalid={state.fieldErrors.email !== undefined} />
  <button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
</form>
```

Notes: the action runs in a transition, receives `FormData`, needs no `preventDefault`, and React resets uncontrolled fields after a successful action.

---

## 14. `useFormStatus` — "is my enclosing form pending?"

```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending, data, action, method } = useFormStatus();     // must be a child of the <form>
  return <button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send'}</button>;
}

<form action={submit}>
  <SubmitButton />
</form>
```

Use it for reusable buttons/components inside a form; use `useActionState`'s `isPending` when the state lives in the same component.

---

## 15. `use` — read a promise or a context conditionally

```tsx
const report = use(weatherPromise);      // suspends until it resolves; errors go to an error boundary
const theme = use(ThemeContext);         // like useContext, but allowed inside conditions/loops
```

Unlike other hooks, `use` may be called conditionally. Wrap the suspending component in `<Suspense>` and an error boundary.

---

## 16. Custom hooks — the pattern

```tsx
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw === null ? initial : (JSON.parse(raw) as T); }
    catch { return initial; }
  });

  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
```

**Hooks to keep in your head (not in React):** `useQuery`, `useMutation`, `useQueryClient` (TanStack Query) · `useForm`, `useFieldArray`, `useWatch` (React Hook Form) · `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `useLoaderData` (React Router) · `useSelector`, `useDispatch` (Redux) · `useTranslation`, `useMediaQuery`, `useVirtualizer`.

---

## 17. Cleanup checklist (the bugs that ship)

| Resource | Clean up with |
| --- | --- |
| `setInterval` / `setTimeout` | `clearInterval` / `clearTimeout` in the effect's cleanup |
| `fetch` | `AbortController.abort()` |
| Event listeners (`window`, `document`, elements) | `removeEventListener` with the **same** function reference |
| WebSocket / EventSource | `.close()` |
| Observers (`IntersectionObserver`, `ResizeObserver`) | `.disconnect()` |
| Subscriptions (store, socket, library) | the unsubscribe function the library returned |
| Third-party widget | its `.destroy()` / `.dispose()` |

```tsx
useEffect(() => {
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);      // same reference → must not be inline
}, [onClose]);
```

---

## 18. Hook error messages, decoded

| Message | Cause | Fix |
| --- | --- | --- |
| “Rendered more hooks than during the previous render” | a hook inside a condition/loop, or an early return **before** hooks | move all hooks above the return |
| “Invalid hook call” | hook called outside a component/hook, or two copies of React | call it in a component; dedupe `react` |
| “Cannot update a component while rendering a different component” | `setState` called during another component's render | move it to an effect or an event |
| “Maximum update depth exceeded” | state set during render or in an effect with unstable deps | see Part 18, scenario S1.2 |
| “The final argument passed to useEffect changed size between renders” | a dependency array whose length changes | keep the array length constant |
| “Missing dependency” lint error | an effect reads a reactive value not listed | list it, or restructure so it is not reactive |
| “useRef requires an initial argument” (React 19) | `useRef<T>()` | `useRef<T \| null>(null)` |
