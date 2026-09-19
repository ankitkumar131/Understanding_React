# React Cheat Sheet — Core Syntax on One Page

> A reference, not a tutorial. Each entry links to the chapter that explains it.

## Creating a project

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app && npm install && npm run dev     # http://localhost:5173
npm run build && npm run preview            # test the REAL build
npx tsc -b --noEmit                         # type-check (Vite does not)
```

## A component

```tsx
// src/components/UserCard.tsx
interface UserCardProps {
  user: User;
  compact?: boolean;
  onSelect?: (id: string) => void;
  children?: ReactNode;
}

export function UserCard({ user, compact = false, onSelect, children }: UserCardProps) {
  return (
    <article onClick={() => onSelect?.(user.id)}>
      <h2>{user.name}</h2>
      {compact ? null : <p>{user.bio}</p>}
      {children}
    </article>
  );
}
```

- Function components only; `React.FC` is not needed — [Part 3 · 08](../03-react-fundamentals/08-props.md)
- Default values go in the destructuring pattern — [Part 3 · 08](../03-react-fundamentals/08-props.md)
- `children: ReactNode` must be declared explicitly — [Part 5 · 08](../05-react-concepts/08-children.md)

## JSX rules

| Rule | Example |
| --- | --- |
| One root element (or a fragment) | `<>…</>` |
| `{}` for JavaScript | `<p>{1 + 1}</p>` |
| Attributes are camelCase | `className`, `htmlFor`, `onClick`, `tabIndex` |
| Style is an object | `style={{ color: 'red', marginTop: 8 }}` |
| Booleans: write the expression | `disabled={!canSave}` (never `"false"`) |
| Self-close tags without children | `<img src="…" />` |
| Comments | `{/* like this */}` |
| Values are escaped | `{userInput}` cannot inject a script |

## Rendering

```tsx
// Conditional — early return
if (isPending) return <Spinner />;
if (isError) return <ErrorPanel message={message} />;
if (items.length === 0) return <EmptyState />;

// Conditional — inline
{isAdmin && <DeleteButton />}                      // ✅
{count ? <Badge count={count} /> : null}           // ✅
{count && <Badge count={count} />}                 // ⚠️ renders "0" when count is 0

// Ternary for two branches
{isEditing ? <Input /> : <Label />}

// Lists — a stable key from the data, never the index
{items.map((item) => <Row key={item.id} item={item} />)}
```

→ [Part 3 · 10](../03-react-fundamentals/10-conditional-rendering.md) · [Part 3 · 11](../03-react-fundamentals/11-rendering-lists.md)

## Hooks at a glance

```tsx
const [count, setCount] = useState(0);                  // value + setter
const [user, setUser] = useState<User | null>(null);    // annotate when it starts null
const [rows, setRows] = useState<Row[]>([]);            // otherwise never[]

useEffect(() => {                                       // sync with the outside world
  const controller = new AbortController();
  load(controller.signal);
  return () => controller.abort();                      // cleanup — always
}, [id]);                                               // deps = every value read inside

const ref = useRef<HTMLInputElement>(null);             // DOM handle
const timer = useRef<number | undefined>(undefined);    // mutable box, no re-render

const value = useContext(ThemeContext);                 // read a context
const [state, dispatch] = useReducer(reducer, initial); // complex state transitions
const total = useMemo(() => expensive(items), [items]); // cache a computation
const onSave = useCallback(() => save(id), [id]);       // cache a function identity
const isPending = useTransition();                      // mark an update interruptible
const deferred = useDeferredValue(query);               // keep input responsive
```

Rules: only at the top level, only in components or `use*` hooks, same order every render.
→ [Part 4 · 10](../04-state-and-hooks/10-hooks-rules.md)

## Updating state

```tsx
setCount(count + 1);                 // from the current value
setCount((c) => c + 1);              // ✅ from the latest pending value (use when it depends on itself)

setUser({ ...user, name: 'Ada' });                    // object: new object
setRows(rows.map(r => r.id === id ? { ...r, done: true } : r));   // array: new array + new item
setRows([...rows, newOne]);
setRows(rows.filter(r => r.id !== id));

// ❌ Never mutate — React compares references
user.name = 'Ada';  setUser(user);
rows.push(newOne);  setRows(rows);
rows.sort(byName);                    // sort mutates → [...rows].sort(byName)
```

→ [Part 4 · 02](../04-state-and-hooks/02-usestate.md) · [Part 1 · 06](../01-prerequisites/06-spread-rest.md)

## Events

```tsx
<button onClick={() => save(id)}>Save</button>          {/* ✅ a function */}
<button onClick={save(id)}>Save</button>                {/* ❌ calls it during render */}

<form onSubmit={(e) => { e.preventDefault(); submit(); }}>
<input value={text} onChange={(e) => setText(e.target.value)} />
<input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />

const n = Number(event.target.value);                   // DOM values are ALWAYS strings
```

→ [Part 3 · 12](../03-react-fundamentals/12-events.md)

## Data fetching (modern)

```tsx
const { data, isPending, isError, error, refetch } = useQuery({
  queryKey: ['tasks', { status }],
  queryFn: () => tasksApi.list({ status }),
});

// Four states, always
if (isPending) return <Skeleton />;
if (isError)   return <ErrorPanel detail={userMessage(error)} onRetry={() => refetch()} />;
if (!data?.length) return <EmptyState />;
return <List items={data} />;
```

Hand-rolled version — note the cancellation:

```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then(setData).catch(() => {});
  return () => controller.abort();
}, [url]);
```

→ [Part 7](../07-api-integration/) · [Part 9 · 06](../09-state-management/06-server-state.md)

## Composition patterns

```tsx
// children
<Modal><Form /></Modal>

// Slot props
<Card header={<Title />} footer={<Actions />} />

// Lift state up
<Filter value={filter} onChange={setFilter} />   // parent owns it
<List items={filtered} />

// Context for cross-cutting values
const theme = useContext(ThemeContext);
```

→ [Part 5 · 01](../05-react-concepts/01-component-communication.md) · [Part 5 · 07](../05-react-concepts/07-composition.md)

## Code splitting

```tsx
const Settings = lazy(() => import('./Settings'));
<Suspense fallback={<Spinner />}><Settings /></Suspense>
```

→ [Part 10 · 05](../10-advanced-react/05-lazy-loading.md) · [Part 10 · 07](../10-advanced-react/07-suspense.md)

## Error boundaries

```tsx
<ErrorBoundary fallback={<p>Something broke</p>} onError={reportError}>
  <Route />
</ErrorBoundary>
```

Catches render errors only — **not** event handlers, promises or timeouts.
→ [Part 10 · 08](../10-advanced-react/08-error-boundaries.md) · [Part 15 · 04](../15-production/04-error-handling.md)

## Performance checklist

```text
1. Measure: Lighthouse (load) + React Profiler (interaction) + web-vitals (users)
2. Ship less: lazy routes, lighter deps, optimised images
3. Render fewer nodes: virtualise long lists
4. Render less often: useDeferredValue / useTransition, then memo
5. Never memoise before measuring
```

→ [Part 10 · 04](../10-advanced-react/04-performance.md) · [Part 15 · 07](../15-production/07-performance.md)

## The ten mistakes that cause 90% of beginner bugs

| # | Mistake | Fix |
| --- | --- | --- |
| 1 | Mutating state | New object/array with spread or `map` |
| 2 | Storing derived values in state | Compute during render |
| 3 | Missing effect dependencies → stale closure | List every value read; use the functional updater |
| 4 | No effect cleanup | Return the unsubscribe / `clearTimeout` / `abort` |
| 5 | Index as `key` | A stable id from the data |
| 6 | `onClick={fn()}` | `onClick={() => fn()}` |
| 7 | Not checking `response.ok` | One `request<T>()` wrapper |
| 8 | `event.target.value` treated as a number | `Number(...)` |
| 9 | `useState([])` → `never[]` | `useState<Item[]>([])` |
| 10 | Testing `npm run dev` instead of the build | `npm run build && npm run preview` |

→ Every error, decoded: [`../common-errors.md`](../common-errors.md)
