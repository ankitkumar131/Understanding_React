# Project 2 — Todo App: Forms, Lists, Props and Communication

> **Part 17 · Projects · Project 2 of 6**

Why this project exists: the todo app is a cliché because it is the smallest app that contains
a **form** (user input), a **list** (rendering a collection), **filtering** (derived data),
**immutable updates** (add/edit/remove), and **two-way component communication** (callbacks
down, events up). Every one of those is a daily task in a real job. Project 1 taught the loop;
this project teaches the data.

**Concepts used:** controlled inputs, forms and submit events, array state, keys, filtering,
derived counts, prop callbacks, `id` generation, conditional empty states.

**Time:** 90–120 minutes.

---

## 1. The goal

```text
┌────────────────────────────────────────────┐
│  Todos                          2 of 4 left │
│  ┌──────────────────────────────┐ [ Add ]  │
│  └──────────────────────────────┘          │
│  [ All (4) ] [ Active (2) ] [ Done (2) ]   │
│                                            │
│  ☐  Write the notes                    ✎ 🗑 │
│  ☑  Set up the project                 ✎ 🗑 │
│  ☐  Deploy                             ✎ 🗑 │
│                                            │
│  [ Clear completed ]                       │
└────────────────────────────────────────────┘
```

1. Add a todo with a form (Enter or the button).
2. Toggle done/undone with a checkbox.
3. Edit a todo's title inline.
4. Delete a todo.
5. Filter All / Active / Done, with counts.
6. Clear all completed.
7. An empty state per filter ("Nothing here yet" vs "Nothing matches").

---

## 2. Set up

```bash
npm create vite@latest todos -- --template react-ts
cd todos && npm install && npm run dev
```

```text
todos/
└── src/
    ├── App.tsx
    ├── types.ts
    ├── components/
    │   ├── TodoForm.tsx
    │   ├── TodoList.tsx
    │   ├── TodoItem.tsx
    │   ├── FilterBar.tsx
    │   └── Summary.tsx
    └── lib/
        └── todos.ts        # pure functions over the todo array
```

---

## 3. Step 1 — Types first

```ts
// src/types.ts
export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;      // epoch ms — used for stable ordering
}

export type TodoFilter = 'all' | 'active' | 'done';
```

💡 **Types before components.** Deciding the shape of your data first is the single biggest
time-saver in React: every component's props fall out of it, and TypeScript then checks the
whole app against it (Part 2 file 03).

⚠️ **`id: string`, not the array index.** Indices shift when you delete an item, which makes
React reuse the wrong DOM node — the classic "I deleted row 3 and row 4 lost its checkbox
state" bug (Part 3 file 11).

```ts
// src/lib/ids.ts
/** Good enough for a client-only app. Use the server's id once you have one. */
export function createId(): string {
  return crypto.randomUUID();     // built into every modern browser
}
```

---

## 4. Step 2 — Pure logic, separate from React

```ts
// src/lib/todos.ts
import type { Todo, TodoFilter } from '../types';

export function addTodo(todos: Todo[], title: string): Todo[] {
  const trimmed = title.trim();
  if (trimmed.length === 0) return todos;                 // ignore empty input
  return [
    { id: crypto.randomUUID(), title: trimmed, done: false, createdAt: Date.now() },
    ...todos,
  ];
}

export function toggleTodo(todos: Todo[], id: string): Todo[] {
  return todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
}

export function renameTodo(todos: Todo[], id: string, title: string): Todo[] {
  const trimmed = title.trim();
  if (trimmed.length === 0) return todos;                 // never rename to nothing
  return todos.map((todo) => (todo.id === id ? { ...todo, title: trimmed } : todo));
}

export function removeTodo(todos: Todo[], id: string): Todo[] {
  return todos.filter((todo) => todo.id !== id);
}

export function clearCompleted(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !todo.done);
}

export function filterTodos(todos: Todo[], filter: TodoFilter): Todo[] {
  switch (filter) {
    case 'active': return todos.filter((todo) => !todo.done);
    case 'done':   return todos.filter((todo) => todo.done);
    case 'all':    return todos;
  }
}

export function countBy(todos: Todo[]): { all: number; active: number; done: number } {
  const done = todos.filter((todo) => todo.done).length;
  return { all: todos.length, done, active: todos.length - done };
}
```

**Why this file exists**

- Every function is **pure**: same input, same output, no side effects. That makes them
  trivially testable without rendering anything (Part 13 file 02).
- Every function returns a **new array** — `map`, `filter`, spread. Never `push`, `splice`
  (Part 1 files 06–07).
- The `switch` in `filterTodos` is **exhaustive** over the union type. Add a fourth filter to
  `TodoFilter` and TypeScript errors here until you handle it (Part 2 file 09).

🏭 **This split — logic in `lib/`, rendering in `components/` — scales.** In Part 15 file 03
it becomes `features/todos/api/` and `features/todos/hooks/`, with the same discipline.

---

## 5. Step 3 — The form (a controlled input)

```tsx
// src/components/TodoForm.tsx
import { useState, type FormEvent } from 'react';

interface TodoFormProps {
  onAdd: (title: string) => void;
}

export function TodoForm({ onAdd }: TodoFormProps) {
  const [title, setTitle] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();               // stop the browser's native submit + page reload
    if (title.trim().length === 0) return;
    onAdd(title);
    setTitle('');                         // clear the field after a successful add
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
      <label htmlFor="new-todo" className="visually-hidden">New todo</label>
      <input
        id="new-todo"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What needs doing?"
        autoComplete="off"
        maxLength={140}
        required
      />
      <button type="submit" disabled={title.trim().length === 0}>Add</button>
    </form>
  );
}
```

**Line by line**

- `value={title}` + `onChange` — the two halves of a **controlled input**. React owns the
  value; the DOM is a mirror of state (Part 5 file 03). Omit `onChange` and the field becomes
  read-only; omit `value` and React warns about switching from uncontrolled to controlled.
- `event.preventDefault()` — a `<form>` submit navigates by default, which in an SPA means a
  full page reload and lost state. Always prevent it (Part 8 file 01).
- `type FormEvent<HTMLFormElement>` — the generic tells TypeScript which element the event
  came from, so `event.currentTarget` is correctly typed (Part 3 file 12).
- `disabled={title.trim().length === 0}` — a derived boolean, computed during render.
- `required` + `maxLength` — the browser does the first layer of validation for free. This is
  UX, not security (Part 15 file 06).

⚠️ **Do not store the whole todo in the form.** The form holds a *draft title*; the parent
owns the list. Two sources of truth for one value is how forms get out of sync (Part 5
file 02).

---

## 6. Step 4 — The list and the item

```tsx
// src/components/TodoList.tsx
import type { Todo } from '../types';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Which filter is active, so the empty state can say the right thing. */
  filter: TodoFilter;
}

export function TodoList({ todos, onToggle, onRename, onDelete, filter }: TodoListProps) {
  if (todos.length === 0) return <EmptyState filter={filter} />;

  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function EmptyState({ filter }: { filter: TodoFilter }) {
  const message =
    filter === 'active' ? 'Nothing active — enjoy the quiet.'
    : filter === 'done' ? 'Nothing completed yet.'
    : 'No todos yet. Add your first one above.';
  return <p style={{ color: '#666', textAlign: 'center' }}>{message}</p>;
}
```

```tsx
// src/components/TodoItem.tsx
import { useState, type KeyboardEvent } from 'react';
import type { Todo } from '../types';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onRename, onDelete }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);

  function commit(): void {
    onRename(todo.id, draft);
    setIsEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') {
      setDraft(todo.title);              // discard the draft
      setIsEditing(false);
    }
  }

  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => onToggle(todo.id)}
        aria-label={`Mark "${todo.title}" as ${todo.done ? 'active' : 'done'}`}
      />

      {isEditing ? (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          autoFocus
          maxLength={140}
        />
      ) : (
        <span style={{ textDecoration: todo.done ? 'line-through' : 'none', flex: 1 }}>
          {todo.title}
        </span>
      )}

      <button onClick={() => { setDraft(todo.title); setIsEditing(true); }} aria-label={`Edit ${todo.title}`}>✎</button>
      <button onClick={() => onDelete(todo.id)} aria-label={`Delete ${todo.title}`}>🗑</button>
    </li>
  );
}
```

**Line by line**

- `key={todo.id}` — React's identity for reconciliation. This is what lets it reuse DOM nodes
  correctly when the list changes (Part 3 file 11).
- `checked={todo.done}` — a checkbox is controlled by `checked`, not `value`. Using `value`
  here is a silent bug: the box appears to work but never reflects state.
- **Local draft state for editing.** The item keeps `draft` locally so typing does not update
  the global list on every keystroke; the change is committed on Enter or blur. That is the
  difference between a pleasant form and one that re-renders the world per character.
- `onBlur={commit}` — clicking away saves. Combined with `Escape` to cancel, this matches what
  users expect from every inline editor they have ever used.
- `autoFocus` — React sets focus after mount. (In a real app, prefer a ref for anything but
  mount-time focus — Part 4 file 04.)
- `aria-label` on icon-only buttons — a button whose only content is `🗑` is announced as
  "button" by a screen reader. The label is not optional polish.

⚠️ **The `key` bug, concretely.** Delete the `key` (or use the index) and delete the first of
three todos while the second is being edited. With index keys, React thinks item 0 became what
was item 1, so the *editing state and draft text stay on the wrong row*. With `todo.id`, the
row disappears and the others keep their state.

---

## 7. Step 5 — Filters, summary and the container

```tsx
// src/components/FilterBar.tsx
import type { TodoFilter } from '../types';

interface FilterBarProps {
  filter: TodoFilter;
  counts: { all: number; active: number; done: number };
  onChange: (filter: TodoFilter) => void;
}

const LABELS: Record<TodoFilter, string> = { all: 'All', active: 'Active', done: 'Done' };

export function FilterBar({ filter, counts, onChange }: FilterBarProps) {
  return (
    <div role="group" aria-label="Filter todos" style={{ display: 'flex', gap: '0.25rem' }}>
      {(Object.keys(LABELS) as TodoFilter[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-pressed={filter === key}
          style={{ fontWeight: filter === key ? 700 : 400 }}
        >
          {LABELS[key]} ({counts[key]})
        </button>
      ))}
    </div>
  );
}
```

```tsx
// src/App.tsx
import { useState } from 'react';
import { FilterBar } from './components/FilterBar';
import { TodoForm } from './components/TodoForm';
import { TodoList } from './components/TodoList';
import * as todos from './lib/todos';
import type { Todo, TodoFilter } from './types';

const STORAGE_KEY = 'todos:v1';

function load(): Todo[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Todo[];
  } catch {
    return [];                       // corrupt data must not crash the app
  }
}

export default function App() {
  const [allTodos, setAllTodos] = useState<Todo[]>(load);   // lazy initialiser: runs once
  const [filter, setFilter] = useState<TodoFilter>('all');

  // Persist on every change (a side effect on the outside world)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allTodos));
  }, [allTodos]);

  const visible = todos.filterTodos(allTodos, filter);      // derived, not stored
  const counts = todos.countBy(allTodos);

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Todos</h1>
      <TodoForm onAdd={(title) => setAllTodos((prev) => todos.addTodo(prev, title))} />
      <FilterBar filter={filter} counts={counts} onChange={setFilter} />
      <TodoList
        todos={visible}
        filter={filter}
        onToggle={(id) => setAllTodos((prev) => todos.toggleTodo(prev, id))}
        onRename={(id, title) => setAllTodos((prev) => todos.renameTodo(prev, id, title))}
        onDelete={(id) => setAllTodos((prev) => todos.removeTodo(prev, id))}
      />
      {counts.done > 0 && (
        <button onClick={() => setAllTodos(todos.clearCompleted)}>Clear completed</button>
      )}
      <p>{counts.active} of {counts.all} left</p>
    </main>
  );
}
```

```tsx
// don't forget the import at the top of App.tsx
import { useEffect, useState } from 'react';
```

**Line by line**

- `useState<Todo[]>(load)` — passing the *function*, not the result. React calls it once on
  mount. Writing `useState(load())` calls `load()` on **every render**, reading and parsing
  storage needlessly (Part 4 file 02).
- `useEffect(…, [allTodos])` — writes to storage after the state changes. Storage is outside
  React, so it belongs in an effect (Part 4 file 03).
- `const visible = todos.filterTodos(allTodos, filter)` — **derived during render**, never
  stored. If you stored filtered todos in state, adding a todo while the "Done" filter is
  active would produce two inconsistent lists.
- `setAllTodos((prev) => …)` — functional updates everywhere, so rapid clicks cannot clobber
  each other.
- `counts.done > 0 && <button>` — the button only exists when it means something.
- `try/catch` in `load()` — a truncated value in storage from an older version must not
  white-screen the app (Part 14 file 05 uses the same defence).

⚠️ **Version the storage key** (`todos:v1`). The day you change the `Todo` shape, bump it —
otherwise users get `undefined` fields and a crash you cannot reproduce locally.

---

## 8. Run it

```bash
npm run dev
```

**Expected result:** add three todos, mark one done, switch to "Done" (one item, count 1),
edit a title with Enter and with Escape, delete one, refresh the page — the list is still
there.

```bash
npx tsc -b --noEmit && npm run lint
```

---

## 9. The communication map

```text
App  (owns: allTodos, filter)
 │  props: todos, counts, filter        ↓ data flows down
 │  props: onAdd, onToggle, onRename, onDelete   ↑ events flow up
 ├── TodoForm      (owns: title draft)
 ├── FilterBar     (owns: nothing)
 └── TodoList      (owns: nothing)
      └── TodoItem (owns: isEditing, draft)
```

Two rules that keep this maintainable:

1. **Data down, events up.** A child never mutates the parent's state; it calls a callback.
2. **State lives at the lowest common ancestor** of the components that need it. `allTodos`
   is in `App` because the form, list and summary all need it. `draft` is in `TodoItem`
   because nothing else does (Part 5 file 02).

---

## 10. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Index as `key` | Wrong row keeps edit state after a delete | `key={todo.id}` |
| `todos.push(newTodo)` | List never re-renders | Return a new array |
| `todo.done = !todo.done` | Checkbox does not update | `map` + spread |
| Storing filtered todos in state | Filters disagree with the list | Derive `visible` each render |
| `useState(load())` | Storage read on every render | `useState(load)` |
| Missing `event.preventDefault()` | Page reloads on submit, state lost | Prevent it |
| `value` instead of `checked` on a checkbox | Box ignores state | `checked={todo.done}` |
| No `try/catch` around `JSON.parse` | White screen after a schema change | Guard the parse |
| Icon-only buttons with no label | Screen reader says "button" | `aria-label` |

---

## 11. Exercises

### Beginner
1. Sort by `createdAt` descending and add a "Sort: newest/oldest" toggle.
2. Show a character counter in the form and disable Add above 140 characters.

### Intermediate
1. Add drag-free reordering: `Move up` / `Move down` buttons, implemented as a pure function
   in `lib/todos.ts` with a test.
2. Extract a `useTodos()` custom hook that owns the state, the effect and the callbacks, so
   `App` becomes ten lines (Part 4 file 09).

### Challenge
1. Add optimistic delete with undo: remove the row immediately, show a toast with "Undo" for
   5 seconds, restore on click. Handle the case where the user adds a todo during the window.
2. Write a test suite for `lib/todos.ts` covering every function, including the empty-title
   and unknown-id edge cases.

---

## 12. Solutions

### Beginner
1. `[...todos].sort((a, b) => b.createdAt - a.createdAt)` — copy first, because `sort` mutates
   in place, and mutating state is the bug you just learned to avoid.
2. `<span>{title.length}/140</span>` and `disabled={title.trim().length === 0 || title.length > 140}`.

### Intermediate
1. ```ts
   export function move(todos: Todo[], id: string, direction: -1 | 1): Todo[] {
     const index = todos.findIndex((t) => t.id === id);
     const target = index + direction;
     if (index === -1 || target < 0 || target >= todos.length) return todos;
     const next = [...todos];
     [next[index], next[target]] = [next[target], next[index]];
     return next;
   }
   ```
   Note that copying the array *before* swapping is what keeps it pure.
2. `useTodos()` returns `{ todos, add, toggle, rename, remove, clearCompleted }`. `App` then
   contains layout only — and the hook is reusable in a second screen, which is the point.

### Challenge
1. Keep `lastDeleted: { todo: Todo; index: number } | null`. Undo does
   `setAllTodos((prev) => [...prev.slice(0, index), todo, ...prev.slice(index)])` — inserting
   at the original index, which is why you stored it. If the user added items meanwhile, the
   index is still valid as a position, and the item lands where it was.
2. Nine-ish cases: add (empty, whitespace-only, valid), toggle (known id, unknown id), rename
   (to empty → unchanged), remove (unknown id → same array reference is *not* required, but
   the contents must be), filter (each of three), countBy (empty list).

---

## 13. What you proved you can do

- [ ] Model data with an interface before writing a component.
- [ ] Keep array logic in pure, testable functions.
- [ ] Build a controlled form and handle submit correctly.
- [ ] Render a list with stable keys and explain what breaks without them.
- [ ] Update arrays immutably with `map` / `filter` / spread.
- [ ] Derive filtered views instead of storing them.
- [ ] Persist state with a guarded `JSON.parse` and a versioned key.
- [ ] Draw the data-down / events-up map of your own app.

---

**What's next →** [`03-weather-app.md`](./03-weather-app.md) replaces `localStorage` with a
real HTTP API: `fetch`, `async`/`await`, request cancellation, loading and error states, and
TypeScript types for data you do not control.
