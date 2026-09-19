# React Cheatsheet — Core Syntax

> **Part 18 · Reference · Cheatsheet 1 of 9**
> One page for revision, not a substitute for the chapters. Everything here is React 19 + TypeScript (`.tsx`).

---

## 1. A component

```tsx
// One component per file, named export, capitalised name.
import { useState, type ReactNode } from 'react';

export interface CardProps {
  title: string;
  children: ReactNode;          // anything renderable
  tone?: 'neutral' | 'danger';  // optional, with a default below
}

export function Card({ title, children, tone = 'neutral' }: CardProps) {
  return (
    <section className={`card card--${tone}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
```

```tsx
// Entry point (main.tsx)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Rules:** name starts with a capital letter · must be pure (no side effects during render) · returns JSX, `null`, or a string/number · never call it as a function.

---

## 2. JSX rules

| Rule | Example |
| --- | --- |
| One root element (or a fragment) | `<>…</>` |
| `class` → `className`, `for` → `htmlFor` | `<label htmlFor="email">` |
| Attributes are camelCase | `onClick`, `tabIndex`, `autoComplete` |
| Self-close empty elements | `<img src="…" alt="…" />` |
| Expressions in `{}` | `<p>{count + 1}</p>` |
| Comments: `{/* … */}` | `{/* TODO: extract */}` |
| Style is an object with camelCase keys | `style={{ marginTop: 8 }}` |
| Conditional: `&&` or ternary | `{isOpen && <Panel />}` |
| Boolean props can be shorthand | `<Button disabled />` |

```tsx
{count > 0 && <Badge>{count}</Badge>}                     {/* never {count && …}: 0 renders */}
{isLoading ? <Spinner /> : <List items={items} />}
{items.map((item) => <li key={item.id}>{item.title}</li>)}
```

---

## 3. State

```tsx
const [count, setCount] = useState(0);                          // value, setter, initial
const [user, setUser] = useState<User | null>(null);            // nullable state
const [todos, setTodos] = useState<Todo[]>([]);
const [draft, setDraft] = useState(() => readStoredDraft());    // lazy initialiser: runs once

setCount(count + 1);                    // from the current snapshot
setCount((c) => c + 1);                 // from the latest value — use this when order matters
setUser((u) => (u === null ? null : { ...u, name: 'Asha' }));   // immutable update
setTodos((current) => [...current, createTodo(title)]);
setTodos((current) => current.filter((t) => t.id !== id));
setTodos((current) => current.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
```

| Do | Don't |
| --- | --- |
| Create new arrays/objects | `todos.push(x)`, `task.done = true` |
| Derive values during render | a second state holding the same truth |
| `setCount((c) => c + 1)` for sequences | `setCount(count + 1)` three times in a row |
| Keep state next to where it is used | lifting everything "just in case" |

```tsx
// Derived, never stored:
const visible = filter === 'all' ? todos : todos.filter((t) => (filter === 'done' ? t.done : !t.done));
const remaining = todos.filter((t) => !t.done).length;
```

---

## 4. Events

```tsx
<button type="button" onClick={() => setOpen(true)}>Open</button>          {/* pass, don't call */}
<input value={query} onChange={(e) => setQuery(e.target.value)} />         {/* inline → types inferred */}
<form onSubmit={(e) => { e.preventDefault(); save(); }}>…</form>
<ul onClick={(e) => { if (e.target === e.currentTarget) close(); }}>…</ul> {/* backdrop pattern */}
<div onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />

// Named handlers with explicit types
const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); };
const handleChange = (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value);
```

**Always** `type="button"` unless it is the submit button. Keyboard: Enter/Space for actions, Escape for dismiss, focus visible for everything.

---

## 5. Lists and keys

```tsx
{tasks.map((task) => <TaskRow key={task.id} task={task} onSelect={select} />)}   {/* stable, from data */}
{tasks.map((task) => <TaskRow key={task.id} ... />)}                              {/* ✅ */}
// {tasks.map((task, index) => <TaskRow key={index} ... />)}                      {/* ❌ reorder/filter breaks it */}
```

Empty state is part of the feature:

```tsx
{tasks.length === 0 ? <p>No tasks yet.</p> : <ul>{tasks.map(…)}</ul>}
```

---

## 6. Conditional rendering

| Pattern | When |
| --- | --- |
| `{isOpen && <Panel />}` | show or nothing (guard against `0`) |
| `{count > 0 && <Badge />}` | numeric conditions |
| `{a ? <A /> : <B />}` | two alternatives |
| `if (isPending) return <Spinner />` | early returns for whole-screen states |
| `switch (state.status)` | discriminated unions (exhaustive) |
| `{visible.length === 0 ? <Empty /> : <List />}` | “n things or none” |

```tsx
switch (state.status) {
  case 'idle': return <p>Search for a city.</p>;
  case 'loading': return <p role="status">Loading {state.city}…</p>;
  case 'error': return <div role="alert">{state.message}</div>;
  case 'success': return <WeatherCard report={state.report} />;
}
```

---

## 7. Forms

```tsx
// Controlled: React owns the value
const [email, setEmail] = useState('');
<input id="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error !== null} />

// Uncontrolled + action (React 19): React reads the FormData and resets the form
const [state, submit, isPending] = useActionState(async (_prev: string | null, data: FormData) => {
  const result = await save({ email: String(data.get('email') ?? '') });
  return result.ok ? null : 'Could not save. Try again.';
}, null);

<form action={submit}>
  {state !== null && <p role="alert">{state}</p>}
  <label htmlFor="email">Email</label>
  <input id="email" name="email" type="email" required />
  <button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
</form>
```

| Need | Use |
| --- | --- |
| Live validation, formatting, dependent fields | controlled (`value` + `onChange`) |
| “Submit is the event”, pending + server errors | `useActionState` + `<form action>` |
| Many fields, minimal re-renders | uncontrolled + `defaultValue`, read `FormData` |
| Complex validation rules | React Hook Form + Zod (Part 8) |

---

## 8. Component communication

```tsx
// 1. Parent → child: props
<Card title="Invoices" tone="danger" />

// 2. Child → parent: callback prop
function Search({ onSearch }: { onSearch: (q: string) => void }) {
  return <input onChange={(e) => onSearch(e.target.value)} />;
}

// 3. Siblings: lift state to the closest common parent
function FilterAndList() {
  const [filter, setFilter] = useState('all');           // owned by the parent
  return <><Filter value={filter} onChange={setFilter} /><List filter={filter} /></>;
}

// 4. Deep tree: context
const ThemeContext = createContext<Theme | null>(null);
export function useTheme() {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

// 5. Sharing logic (not state): a custom hook
const { todos, add, toggle } = useTodos();
```

---

## 9. Effects at a glance

```tsx
useEffect(() => {                                  // subscribe to an external system
  const id = window.setInterval(() => setNow(Date.now()), 1000);
  return () => window.clearInterval(id);           // cleanup: on change and on unmount
}, []);                                            // [] = runs once (nothing reactive read)

useEffect(() => { … }, [roomId]);                  // re-runs when a reactive value changes
```

| Use an effect for | Do **not** use an effect for |
| --- | --- |
| Subscriptions (socket, media query, listeners) | Deriving state from props/state — compute in render |
| Synchronising with non-React code (maps, charts, `document.title`) | Responding to a click — do it in the handler |
| Logging/analytics on a real change | Fetching in an app — use a query library or a loader |
| Timers you must clean up | “Running code after render” with no external system |

---

## 10. Accessibility essentials

```tsx
<label htmlFor="title">Title</label>                            {/* real label */}
<button type="button" aria-label="Delete Write the outline">×</button>   {/* symbol needs a name */}
<output aria-live="polite">{count}</output>                     {/* announces changes */}
<div role="alert">{error}</div>                                 {/* urgent failure */}
<button aria-pressed={active === 'done'} type="button">Done</button>     {/* toggle state */}
<div role="group" aria-label="Filter tasks">…</div>              {/* group with a name */}
```

**Checklist:** real element for the job (`button`, not `div`) · every control has an accessible name · errors linked with `aria-describedby` and `aria-invalid` · focus moves on open/close of overlays · Escape closes · the whole flow is usable with the keyboard only.

---

## 11. Performance quick list

| Symptom | First move |
| --- | --- |
| Long list is slow to appear | window/paginate (render fewer rows) |
| Whole page re-renders on a keystroke | move that state down into its own component |
| One row's change re-renders every row | compiler on, or `memo` + stable callbacks |
| Slow first load | code-split routes, check the bundle visualiser |
| Janky interaction | `useTransition`/`useDeferredValue` for non-urgent updates |
| Not sure | measure with the Profiler and a render counter before touching anything |

```tsx
const MemoRow = memo(function Row({ task, onSelect }: RowProps) { … });
const onSelect = useCallback((id: string) => setSelected(id), []);
const sorted = useMemo(() => [...items].sort(compare), [items]);
```

---

## 12. Deprecated / avoid (know the history, don't write it)

| Legacy | Current |
| --- | --- |
| Create React App | Vite (`npm create vite@latest my-app -- --template react-ts`) or Next.js |
| Class components + `componentDidMount` | function components + hooks |
| `defaultProps` | default parameter values in the signature |
| `React.FC<Props>` | a plain typed function |
| `forwardRef` (always) | `ref` is a normal prop in React 19 |
| `<Context.Provider value>` | `<Context value>` in React 19 |
| String refs / `findDOMNode` | `useRef` |
| Index as `key` | a stable id from your data |
| `useEffect` fetching everywhere | `useQuery`/loaders with caching + cancellation |
| `PropTypes` | TypeScript |
| `setState` in render to derive | compute during render |

---

## 13. Testing one component (the shape)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Counter } from './Counter';

it('increases by the step and reports the change', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Counter initial={5} step={2} onChange={onChange} />);

  await user.click(screen.getByRole('button', { name: 'Increase' }));

  expect(screen.getByTestId('value')).toHaveTextContent('Count: 7');
  expect(onChange).toHaveBeenCalledWith(7);
});
```

**Query order:** `getByRole` → `getByLabelText` → `getByText` → `getByTestId` (last resort). Assert behaviour, not class names or internal state.

---

## 14. Commands

```bash
npm create vite@latest my-app -- --template react-ts   # new project
npm install                                            # install dependencies
npm run dev                                            # dev server (HMR)
npm run build                                          # tsc -b && vite build
npm run preview                                        # serve the production build locally
npm test                                               # vitest (watch)
npx vitest run                                         # once, CI-style
npx tsc -b                                             # type-check only
npx eslint .                                           # lint
npx vite-bundle-visualizer                             # where the bytes went
```
