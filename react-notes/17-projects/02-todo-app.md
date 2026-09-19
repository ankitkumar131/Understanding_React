# 02 — Project: Todo App (Lists, Forms, Filters, Persistence)

> **Part 17 · Projects · File 2 of 7**

Why this project: a todo app is the second thing everyone builds and the first thing that touches *real* UI problems — a list that changes length, a form that must clear itself, filters that must agree with the data, keys that must be stable, and persistence that must survive a reload (and a corrupt value). This project's structure is the lesson: **all the logic lives in one hook (`useTodos`), the components only render**, and the tests walk through the whole journey. Everything you learn here reappears in the CRUD app, the auth app and the capstone, only with a server underneath.

Measured: the finished project's tests run in **943 ms** (6 tests) in this lab's suite — `/home/user/lab/part17-projects.txt`.

---

## 1. Requirements

| # | Requirement | The underlying skill |
| --- | --- | --- |
| 1 | Add a todo by typing a title and submitting | controlled input + form submission (Part 7) |
| 2 | An empty or whitespace-only title cannot be added | validation at the boundary |
| 3 | Toggle a todo between active and done | immutable updates in a list |
| 4 | Delete a single todo | removing by id, not by index |
| 5 | Filters: All / Active / Completed | derived state (never a second copy) |
| 6 | A live count of remaining items | derived state, memoised |
| 7 | "Clear completed" in one action | a bulk update |
| 8 | Todos survive a reload | persistence + lazy initial state |
| 9 | Corrupt stored data does not crash the app | defensive parsing |
| 10 | The input clears after a successful add | form lifecycle |

---

## 2. The file tree

```text
src/projects/todo/
├── types.ts             # Todo, Filter, createTodo()
├── useTodos.ts          # all state + persistence (the brain)
├── TodoItem.tsx         # presentational, memoised row
├── TodoApp.tsx          # form, filters, list, empty state (the view)
└── TodoApp.test.tsx     # 6 tests covering the whole journey
```

The split is deliberate: `useTodos` knows nothing about JSX, and the components know nothing about storage. That means the rules (what "add" means, what happens with corrupt data, what counts as remaining) are testable without rendering, and the rendering is testable without knowing the rules.

---

## 3. The model

```ts
// src/projects/todo/types.ts
export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export type Filter = 'all' | 'active' | 'completed';

export function createTodo(title: string): Todo {
  return {
    id: crypto.randomUUID(),          // stable, unique, and usable as a React key
    title: title.trim(),
    done: false,
    createdAt: Date.now(),
  };
}
```

⚠️ **Why `id` and not the array index?** React uses `key` to decide which DOM nodes correspond to which items. With `key={index}`, deleting the first item makes every remaining item keep a key that now belongs to a different todo — React reuses the wrong DOM, and inputs/animations/state attach to the wrong row (Part 5 taught this; here you meet it for real). `crypto.randomUUID()` is available in every current browser and in Node, so you do not need a library.

---

## 4. The brain: one hook

```ts
// src/projects/todo/useTodos.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createTodo, type Filter, type Todo } from './types';

const STORAGE_KEY = 'react-lab:todos';

function loadInitial(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Todo =>
        typeof item === 'object' && item !== null &&
        typeof (item as Todo).id === 'string' && typeof (item as Todo).title === 'string' &&
        typeof (item as Todo).done === 'boolean',
    );
  } catch {
    return [];                       // corrupt storage must not break the app
  }
}

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>(loadInitial);        // lazy initialiser: read once, on mount
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const add = useCallback((title: string) => {
    const trimmed = title.trim();
    if (trimmed === '') return;
    setTodos((current) => [createTodo(trimmed), ...current]);      // newest first
  }, []);

  const toggle = useCallback((id: string) => {
    setTodos((current) => current.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));
  }, []);

  const remove = useCallback((id: string) => {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTodos((current) => current.filter((todo) => !todo.done));
  }, []);

  const visible = useMemo(() => {
    if (filter === 'active') return todos.filter((todo) => !todo.done);
    if (filter === 'completed') return todos.filter((todo) => todo.done);
    return todos;
  }, [todos, filter]);

  const remaining = useMemo(() => todos.filter((todo) => !todo.done).length, [todos]);

  return { todos, visible, filter, remaining, add, toggle, remove, clearCompleted, setFilter };
}
```

| Piece | The decision | Why |
| --- | --- | --- |
| `useState(loadInitial)` | pass the **function**, not its result | the storage read happens once; passing `loadInitial()` would run it on every render |
| `loadInitial` try/catch + shape check | defend at the boundary | a truncated or hand-edited value must not white-screen the app (the same rule as Part 14's token store) |
| `useEffect` writing to storage | keep storage in sync with state | one writer, one direction: React state → storage |
| `useCallback` for the mutations | stable identities | they are passed to a memoised child, and stability is what makes `memo` effective (Part 15, file 07) |
| `visible` / `remaining` with `useMemo` | derived, never stored | two copies of the same truth is the classic bug: a stored `remaining` drifts after a delete |
| filter as state | UI state, not server state | it changes often and matters only to this screen (Part 9) |

⚠️ **What is deliberately absent**: a `useEffect` that sets `remaining` when `todos` changes. Deriving the value during render is simpler, cannot drift, and is faster than an extra render pass. Reach for `useMemo` only to avoid recomputing on unrelated renders (and measure if it matters — Part 15, file 07).

---

## 5. The view

```tsx
// src/projects/todo/TodoItem.tsx
import { memo } from 'react';
import type { Todo } from './types';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

export const TodoItem = memo(function TodoItem({ todo, onToggle, onRemove }: TodoItemProps) {
  return (
    <li className="todo-item">
      <label>
        <input
          type="checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo.id)}
          aria-label={`Mark "${todo.title}" as ${todo.done ? 'active' : 'done'}`}
        />
        <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.title}</span>
      </label>
      <button type="button" onClick={() => onRemove(todo.id)} aria-label={`Delete "${todo.title}"`}>
        ×
      </button>
    </li>
  );
});
```

```tsx
// src/projects/todo/TodoApp.tsx
import { useState, type FormEvent } from 'react';
import { TodoItem } from './TodoItem';
import { useTodos } from './useTodos';
import type { Filter } from './types';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

export function TodoApp() {
  const { visible, filter, remaining, add, toggle, remove, clearCompleted, setFilter } = useTodos();
  const [title, setTitle] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();                    // a plain form would navigate and reload the page
    add(title);
    setTitle('');                              // clear after adding
  };

  return (
    <section className="todo-app" aria-labelledby="todo-heading">
      <h2 id="todo-heading">Todos</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="new-todo">New todo</label>
        <input id="new-todo" value={title} onChange={(event) => setTitle(event.target.value)}
               placeholder="What needs doing?" autoComplete="off" />
        <button type="submit" disabled={title.trim() === ''}>Add</button>
      </form>

      <div role="group" aria-label="Filter todos">
        {FILTERS.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      <p data-testid="remaining">{remaining} {remaining === 1 ? 'item' : 'items'} left</p>

      {visible.length === 0 ? (
        <p data-testid="empty">Nothing here yet.</p>
      ) : (
        <ul>
          {visible.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onToggle={toggle} onRemove={remove} />
          ))}
        </ul>
      )}

      <button type="button" onClick={clearCompleted}>Clear completed</button>
    </section>
  );
}
```

Points worth noticing (each one is a Part 5–7 lesson made concrete):

| Detail | Reason |
| --- | --- |
| `value={title}` + `onChange` | a controlled input: React is the single source of truth, so clearing it is one line |
| `event.preventDefault()` | without it the browser submits the form and reloads the page |
| `disabled={title.trim() === ''}` | the UI refuses the invalid action before the handler runs |
| `<label htmlFor="new-todo">` | clicking the label focuses the input; the accessible name is real |
| `aria-pressed` on filters | tells assistive tech which filter is active — and gives tests an unambiguous handle |
| `role="group" aria-label="Filter todos"` | groups the three buttons into one labelled control |
| `key={todo.id}` | stable identity for list items (see section 3) |
| empty state | an empty list renders an explanation, not nothing |
| `memo(TodoItem)` | rows re-render only when their own todo or callbacks change; the callbacks are stable thanks to `useCallback` in the hook |

---

## 6. Run it

```bash
npm install
npm run dev      # render <TodoApp /> in your app shell
npm test -- --run src/projects/todo
```

---

## 7. The tests

```tsx
// src/projects/todo/TodoApp.test.tsx (excerpt — the full file has six tests)
async function addTodo(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.type(screen.getByLabelText('New todo'), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
}

it('adds a todo and clears the input', async () => {
  const user = userEvent.setup();
  render(<TodoApp />);
  await addTodo(user, 'Write the notes');

  expect(within(screen.getByRole('list')).getByText('Write the notes')).toBeInTheDocument();
  expect(screen.getByLabelText('New todo')).toHaveValue('');
  expect(screen.getByTestId('remaining')).toHaveTextContent('1 item left');
});

it('persists todos in localStorage and reloads them', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<TodoApp />);
  await addTodo(user, 'Survive a reload');
  unmount();

  render(<TodoApp />);                       // fresh mount, same storage
  expect(screen.getByText('Survive a reload')).toBeInTheDocument();
});

it('ignores corrupt stored data instead of crashing', () => {
  localStorage.setItem('react-lab:todos', '{"not":"an array"');
  render(<TodoApp />);
  expect(screen.getByTestId('empty')).toBeInTheDocument();
});
```

```text
 ✓ src/projects/todo/TodoApp.test.tsx (6 tests) 943ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

| Test | Behaviour it locks in |
| --- | --- |
| adds a todo and clears the input | the form lifecycle end to end |
| does not add an empty todo | the disabled button and the hook's guard agree |
| toggles completion, updates the count and filters | the three filters and the derived count |
| deletes a todo and clears completed ones | single and bulk removal |
| persists across a remount | lazy initial state + the effect that writes |
| ignores corrupt stored data | the defensive parse |

💡 The persistence test is worth studying as a technique: it does **not** call `localStorage.getItem` and compare JSON. It adds a todo through the UI, unmounts, and mounts a fresh tree — so it tests the behaviour ("my todos are still there") rather than the implementation ("we wrote key X"). If you later move to IndexedDB or a server, the test still means something.

---

## 8. Common mistakes in this project

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `key={index}` | deleting a row makes the wrong row's state follow it | `key={todo.id}` |
| 2 | Storing `remaining` or `visible` in state | the copy drifts after every change | derive during render |
| 3 | `useState(loadInitial())` | reads storage on every render (and may differ between them) | `useState(loadInitial)` |
| 4 | Mutating state (`todos.push(...)`, `todo.done = true`) | React does not see the change | new arrays/objects (`map`, `filter`, spread) |
| 5 | Missing `preventDefault` | the page reloads on submit | call it first |
| 6 | No empty state | users see a blank area and assume it is broken | explicit empty message |
| 7 | `useEffect` syncing input state from props/todos | stale or duplicated state | keep the input as the single owner |
| 8 | Writing to storage in the render body | side effects during render (StrictMode will run it twice) | write in an effect |
| 9 | Filters that mutate the array in place | order changes under the user's feet | `filter` returns a new array |
| 10 | Unlabelled checkboxes | "checkbox" announced with no context | `aria-label` naming the todo |
| 11 | One giant component | every state change re-renders everything, and tests are unreadable | hook for logic, rows as presentational children |
| 12 | Throwing on corrupt storage | app white-screens from an old value | parse defensively, fall back to `[]` |

---

## 9. Practice (extend the project)

### Beginner

1. Add an "Edit" affordance: double-clicking a title turns it into an input, Enter saves, Escape cancels. Keep the editing id in state (only one row may be edited at a time) and test both keys.
2. Add a counter of completed items next to the remaining count.
3. Disable "Clear completed" when there is nothing completed.

### Intermediate

1. Add sorting by `createdAt` (newest/oldest) as another piece of UI state, and show that it does not affect the filters.
2. Persist the filter and sort as well, and test that a reload restores them.
3. Turn the storage layer into its own module (`todoStorage.ts`) with `load()`/`save()`, move the corrupt-data test next to it, and leave one integration test that proves the app still persists.

### Challenge

1. Split the app into `useTodos` (state) and `useFilteredTodos(todos, filter)` (derivation), then write unit tests for the second hook with `renderHook` — no rendering of the app at all.
2. Add undo for the last destructive action (delete, clear completed) with a 5-second window: what state do you keep, where does the timer live, and how do you test it with fake timers?
3. Replace `localStorage` with IndexedDB behind the same interface, keeping every existing test green, and write down what changed for the user (capacity, async, failure modes).

---

## 10. Solutions

### Beginner

1. `const [editingId, setEditingId] = useState<string | null>(null)` and, in the row, either the span (with `onDoubleClick={() => setEditingId(todo.id)}`) or an input (with `onKeyDown` handling `Enter` and `Escape`). Keep the draft title in a separate state object keyed by id, and save through a new `rename(id, title)` in the hook.
2. `const completed = todos.length - remaining;` — derived, so it cannot drift.
3. `disabled={!todos.some((todo) => todo.done)}`.

### Intermediate

1. `const [sort, setSort] = useState<'newest' | 'oldest'>('newest')`, and in the hook sort a copy of the filtered array: `[...filtered].sort((a, b) => sort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)`. Note the copy: `sort` mutates, and mutating state is a bug (section 8).
2. Store `{ todos, filter, sort }` under one key — one object avoids half-restored states — and validate each field in `loadInitial`.
3. `todoStorage.ts` exports `load(): Todo[]` and `save(todos: Todo[]): void`; the corrupt-data test moves with it, and one integration test still asserts the behaviour through the UI (the test that would catch a wiring mistake).

### Challenge

1. `useFilteredTodos(todos, filter, sort)` returns the array; `renderHook(() => useFilteredTodos(list, 'active', 'newest'), { initialProps })` lets you assert the result directly, including the unstable-order case. The unit test is faster and clearer than rendering the app — and it survives any change to the markup.
2. Keep a snapshot of the previous `todos` plus the action's description; the timer lives in a ref and is cleared on a new action or on unmount; the test uses `vi.useFakeTimers()` and `act(() => vi.advanceTimersByTime(5000))` to prove the window closes (Part 13's fake-timer rules apply: `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`).
3. The interface is `load(): Promise<Todo[]>` and `save(todos): Promise<void>`, so every caller must handle the async nature. The hook gains loading/error states (the app now starts in a "loading" state instead of "empty"), and the tests must await the initial load — which is a real teaching moment: persistence that can fail needs the same four states as a network call (Part 17, file 03).

---

## 11. Summary

- **One hook owns the logic, components only render** — which makes the rules unit-testable and the markup refactorable.
- **Derive, never duplicate**: `visible` and `remaining` are computed from `todos`, so they cannot drift; filters and sorting are UI state.
- **Every list update is immutable** (`map`, `filter`, spread) and **every key is stable** (`todo.id`, never the index).
- **The form is controlled**, prevents the default submission, refuses empty input in two places (button and hook), and clears itself after a successful add.
- **Persistence is defensive**: a lazy initialiser reads storage once, an effect writes it back, and corrupt data degrades to an empty list instead of a crash.
- **The tests describe the journey** — add, filter, delete, reload, corrupt-storage — and the persistence test proves the behaviour through the UI rather than asserting on `localStorage` internals.
- **Accessibility is part of the markup**: real labels, `aria-pressed` filters, named checkboxes and delete buttons.

---

**What's next →** [`03-weather-app.md`](./03-weather-app.md) adds the outside world: a weather app with typed API responses, a request lifecycle (`idle` → `loading` → `success` | `error`), cancellation for stale searches, retryable versus permanent failures, and tests that fake every one of those states with MSW.
