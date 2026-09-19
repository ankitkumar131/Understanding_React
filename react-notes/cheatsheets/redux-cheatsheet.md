# Redux (Toolkit) Cheatsheet

> **Part 18 · Reference · Cheatsheet 7 of 9**
> Redux is one option, not a requirement. Use it when many unrelated components share complex client state; use a query cache for server data, `useState` for one screen, and Context for low-frequency app-wide values.

---

## 1. Install and set up

```bash
npm i @reduxjs/toolkit react-redux
```

```ts
// app/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { tasksReducer } from '../features/tasks/tasksSlice';
import { counterReducer } from '../features/counter/counterSlice';

export const store = configureStore({
  reducer: { tasks: tasksReducer, counter: counterReducer },
  middleware: (getDefault) => getDefault(),        // thunk is included; add your own here
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

```tsx
// app/providers.tsx
import { Provider } from 'react-redux';
import { store } from './store';

export function Providers({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
```

```ts
// app/hooks.ts — typed hooks, used everywhere instead of the raw ones
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

---

## 2. A slice (state + reducers + actions in one file)

```ts
// features/tasks/tasksSlice.ts
import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  points: number;
}

interface TasksState {
  items: Task[];
  filter: TaskStatus | 'all';
  loading: boolean;
  error: string | null;
}

const initialState: TasksState = { items: [], filter: 'all', loading: false, error: null };

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    // Immer lets you "mutate" — the reducer still returns a new state
    taskAdded: {
      reducer(state, action: PayloadAction<Task>) { state.items.push(action.payload); },
      prepare(title: string, points = 1) {                    // prepare = custom action creator
        return { payload: { id: nanoid(), title, status: 'todo' as const, points } };
      },
    },
    taskToggled(state, action: PayloadAction<string>) {
      const task = state.items.find((t) => t.id === action.payload);
      if (task !== undefined) task.status = task.status === 'done' ? 'todo' : 'done';
    },
    taskRemoved(state, action: PayloadAction<string>) {
      state.items = state.items.filter((task) => task.id !== action.payload);
    },
    filterChanged(state, action: PayloadAction<TasksState['filter']>) {
      state.filter = action.payload;
    },
  },
});

export const { taskAdded, taskToggled, taskRemoved, filterChanged } = tasksSlice.actions;
export const tasksReducer = tasksSlice.reducer;

// Selectors next to the slice (memoise derived ones with createSelector)
export const selectAllTasks = (state: RootState) => state.tasks.items;
export const selectFilter = (state: RootState) => state.tasks.filter;
export const selectVisibleTasks = createSelector(
  [selectAllTasks, selectFilter],
  (tasks, filter) => (filter === 'all' ? tasks : tasks.filter((task) => task.status === filter)),
);
export const selectRemaining = (state: RootState) => state.tasks.items.filter((t) => t.status !== 'done').length;
```

---

## 3. Using it in components

```tsx
function TaskList() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectVisibleTasks);          // subscribes to the derived value only
  const filter = useAppSelector(selectFilter);

  return (
    <>
      <select value={filter} aria-label="Filter" onChange={(e) => dispatch(filterChanged(e.target.value as TaskStatus | 'all'))}>
        <option value="all">All</option>
        <option value="todo">To do</option>
        <option value="doing">In progress</option>
        <option value="done">Done</option>
      </select>

      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title}
            <button type="button" onClick={() => dispatch(taskToggled(task.id))}>Toggle</button>
            <button type="button" onClick={() => dispatch(taskRemoved(task.id))}>Delete</button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => dispatch(taskAdded('Write the notes', 3))}>Add</button>
    </>
  );
}
```

| Rule | Why |
| --- | --- |
| `useAppSelector` with a **narrow** selector | each component re-renders only when its slice of state changes |
| Return new objects from selectors only via `createSelector` | a freshly built array every call causes a re-render on every dispatch |
| Dispatch actions, never mutate the store | the store is read-only outside reducers |
| Keep server data out of the store | a query cache (TanStack Query) has deduplication, caching and cancellation built in |

---

## 4. Async work: `createAsyncThunk`

```ts
export const fetchTasks = createAsyncThunk('tasks/fetch', async (_arg: void, { signal, rejectWithValue }) => {
  try {
    const response = await fetch('/api/tasks', { signal });
    if (!response.ok) return rejectWithValue(`Request failed: ${response.status}`);
    return (await response.json()) as Task[];
  } catch {
    return rejectWithValue('Network error');
  }
});

// In the slice's extraReducers:
extraReducers: (builder) => {
  builder
    .addCase(fetchTasks.pending, (state) => { state.loading = true; state.error = null; })
    .addCase(fetchTasks.fulfilled, (state, action) => { state.loading = false; state.items = action.payload; })
    .addCase(fetchTasks.rejected, (state, action) => {
      state.loading = false;
      state.error = (action.payload as string | undefined) ?? action.error.message ?? 'Failed';
    });
},
```

```tsx
useEffect(() => { void dispatch(fetchTasks()); }, [dispatch]);
```

**Better default for server data:** RTK Query (below) or TanStack Query — thunks require you to hand-write loading/error/caching, which the query libraries already do.

---

## 5. RTK Query (data fetching built into the toolkit)

```ts
// features/api/apiSlice.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api', prepareHeaders: (headers) => {
    const token = tokenStore.read()?.token;
    if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
    return headers;
  }}),
  tagTypes: ['Task'],
  endpoints: (builder) => ({
    getTasks: builder.query<Task[], void>({ query: () => 'tasks', providesTags: ['Task'] }),
    addTask: builder.mutation<Task, TaskDraft>({
      query: (draft) => ({ url: 'tasks', method: 'POST', body: draft }),
      invalidatesTags: ['Task'],                       // refetch what changed
    }),
    setStatus: builder.mutation<Task, { id: string; status: TaskStatus }>({
      query: ({ id, status }) => ({ url: `tasks/${id}`, method: 'PATCH', body: { status } }),
      // optimistic update with rollback:
      async onQueryStarted({ id, status }, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getTasks', undefined, (draft) => {
          const task = draft.find((t) => t.id === id);
          if (task !== undefined) task.status = status;
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
    }),
  }),
});

export const { useGetTasksQuery, useAddTaskMutation, useSetStatusMutation } = api;

// store.ts: add `[api.reducerPath]: api.reducer` and `api.middleware`
const { data, isLoading, error } = useGetTasksQuery();
const [addTask, { isLoading: isAdding }] = useAddTaskMutation();
```

---

## 6. Zustand (the lighter alternative, ~1 kB)

```ts
import { create } from 'zustand';

interface TasksStore {
  tasks: Task[];
  filter: TaskStatus | 'all';
  add: (title: string) => void;
  toggle: (id: string) => void;
  setFilter: (filter: TaskStatus | 'all') => void;
}

export const useTasksStore = create<TasksStore>((set) => ({
  tasks: [],
  filter: 'all',
  add: (title) => set((state) => ({ tasks: [...state.tasks, createTask(title)] })),   // immutable
  toggle: (id) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
  setFilter: (filter) => set({ filter }),
}));

// Usage — select only what the component needs
const tasks = useTasksStore((state) => state.tasks);
const add = useTasksStore((state) => state.add);
```

No provider, no boilerplate, selectors included; you give up Redux DevTools' time travel (unless you add the devtools middleware) and the enforced reducer pattern.

---

## 7. Choosing: a decision table

| Situation | Use |
| --- | --- |
| One screen's UI state | `useState` / `useReducer` |
| Theme, locale, signed-in user | Context |
| Server data (lists, details) | TanStack Query / RTK Query / loader |
| Complex client state, many writers, undo/redo, DevTools tracing | Redux Toolkit |
| Simple global store, minimal ceremony | Zustand |
| Form state | React Hook Form / actions |
| URL state (filters, tabs, pagination) | `useSearchParams` |

**Interview one-liner:** “Redux is not required for large apps — it is one trade-off. I reach for it when many unrelated components share complex client state or when the team wants one enforced pattern; I reach for a query cache when the state is really the server's.”

---

## 8. Common mistakes

| Mistake | Consequence | Fix |
| --- | --- | --- |
| Storing server data in Redux “because there is a store” | double bookkeeping, stale lists, no deduplication | RTK Query / TanStack Query |
| A selector that builds a new array each call | re-render on every dispatch | `createSelector` or select primitives |
| Mutating state outside a reducer | no update, or impossible-to-trace bugs | dispatch an action; Immer handles immutability inside slices |
| Dispatching plain actions with async work inside | no loading/error states | `createAsyncThunk` or RTK Query |
| One giant slice / one giant `RootState` | unrelated re-renders, painful edits | one slice per feature, narrow selectors |
| `useSelector((state) => state)` | re-renders on everything | select the smallest slice |
| Forgetting `Provider` | “could not find react-redux context value” | wrap the app once |

---

## 9. Testing

```ts
import { configureStore } from '@reduxjs/toolkit';
import { tasksReducer, taskAdded, selectVisibleTasks } from './tasksSlice';

it('adds a task through the reducer (no React involved)', () => {
  const store = configureStore({ reducer: { tasks: tasksReducer } });
  store.dispatch(taskAdded('Write notes', 3));

  expect(store.getState().tasks.items).toHaveLength(1);
  expect(selectVisibleTasks(store.getState() as never)).toHaveLength(1);
});

it('renders tasks from a real store', () => {
  const store = configureStore({ reducer: { tasks: tasksReducer } });
  store.dispatch(taskAdded('Write notes'));
  render(<Provider store={store}><TaskList /></Provider>);
  expect(screen.getByText('Write notes')).toBeInTheDocument();
});
```

Reducers are pure functions, so they test faster than components: prefer reducer + selector tests for logic, and a handful of integration tests through the real store.
