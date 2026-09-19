# 06 — Production React App: the Taskboard Capstone (Everything, in One App)

> **Part 17 · Projects · File 6 of 7**

Why this project: the previous five files each isolated one skill. This one puts them in a single application with a real shape — feature folders, a typed data layer, server state with optimistic writes and rollback, an auth context, an error boundary, a lazily loaded route, a dev-only fake backend so it runs with no server, and tests that cover the failure paths. If you can build this from a blank folder, you have the working knowledge the whole book was aiming at; if you can *explain* every file's boundaries while building it, you have more than that.

Measured: the capstone's own tests run in **1.1 s** (8 tests). The complete lab suite is **12 files / 62 tests, all green**, and the production build is **~0.3 s** (304–368 ms across runs), producing a 2.09 kB lazy chunk. Raw output: [`react-lab/evidence/part17-projects.txt`](../../react-lab/evidence/part17-projects.txt).

---

## 1. Requirements

| # | Requirement | Where it comes from |
| --- | --- | --- |
| 1 | Show a task list from an API, with loading / empty / error+retry states | file 03, file 04 |
| 2 | Create a task through a validated form | file 02, file 04 |
| 3 | Move a task through `todo → doing → done` with an **optimistic** update and rollback | Part 9 |
| 4 | Delete a task | file 04 |
| 5 | A Reports page that is **lazily loaded** and computes numbers from the cache | Part 6, Part 16 |
| 6 | A signed-in user is shown; the app is wrapped in an error boundary | Part 14 |
| 7 | Nothing may crash the whole app: a render error shows a retryable screen | Part 15, files 04–05 |
| 8 | It must run **without a backend** for anyone who clones the repo | quality-of-life for a teaching repo |
| 9 | Eight tests, including the rollback and the lazy route | Part 13 |
| 10 | A production build with a small lazy chunk | Part 16 |

---

## 2. Architecture first: the layers and the rule

```text
types.ts                     ← the words of the domain (Task, TaskStatus, TaskDraft) + validation
  ↑
features/tasks/api.ts        ← the only file that knows a URL or fetch exists
  ↑
features/tasks/hooks.ts      ← server state: query keys, mutations, optimistic updates
  ↑
features/tasks/TaskList.tsx  ← components: render states, call hooks, never fetch
features/tasks/TaskForm.tsx
  ↑
pages/ReportsPage.tsx        ← a screen composed of features (lazy-loaded here)
  ↑
App.tsx                      ← the shell: providers, routes, boundary, guard
```

**The rule**: a file may import only from the layers below it. `TaskList` never calls `fetch`; `hooks.ts` never imports a component; `types.ts` imports nothing. This one rule — one direction, no cycles — is what makes each layer testable in isolation, and it is exactly why the API could be replaced by MSW in tests (or by the dev mock in section 9) without touching a single component.

`features/` (rather than `components/` + `hooks/` + `api/`) is the structure Part 15, file 03 recommended: everything about *tasks* lives in one folder, so "where do I add a field to a task?" has one answer.

```text
src/projects/taskboard/
├── types.ts                      # Task, TaskStatus, TaskDraft, emptyTaskDraft, validateTaskDraft
├── features/tasks/
│   ├── api.ts                    # tasksApi: list / create / setStatus / remove  (+ ApiError)
│   ├── hooks.ts                  # taskKeys, useTasks, useCreateTask, useSetTaskStatus, useDeleteTask
│   ├── TaskForm.tsx              # create + validation
│   └── TaskList.tsx              # loading / error+retry / empty / list, with optimistic status moves
├── pages/ReportsPage.tsx         # lazily loaded screen; reads the same cache
├── App.tsx                       # error boundary, providers, routes, lazy route
└── taskboard.test.tsx            # 8 tests
```

---

## 3. The model and the validation rule

```ts
// src/projects/taskboard/types.ts
export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string;
  points: number;              // effort estimate; used by the reports page
}

export type TaskDraft = Pick<Task, 'title' | 'assignee' | 'points'>;

export const emptyTaskDraft: TaskDraft = { title: '', assignee: '', points: 1 };

export function validateTaskDraft(draft: TaskDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.title.trim().length < 3) errors.title = 'Give the task a title of at least 3 characters.';
  if (draft.assignee.trim().length < 2) errors.assignee = 'Who is doing it?';
  if (!Number.isInteger(draft.points) || draft.points < 1 || draft.points > 21) errors.points = 'Points must be between 1 and 21.';
  return errors;
}
```

`TaskDraft = Pick<Task, 'title' | 'assignee' | 'points'>` deserves a sentence: a draft is *the part of a task a user is allowed to type*. `id` and `status` are assigned by the system (an id by the server, a status by the workflow), so they are not in the draft type — and TypeScript now makes it impossible to accidentally send them. **The type encodes the rule**, instead of a comment asking politely.

---

## 4. The data layer: one file that knows about URLs

```ts
// src/projects/taskboard/features/tasks/api.ts
const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(body.message ?? `Request failed with ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;      // DELETE has no body to parse
  return (await response.json()) as T;
}

export const tasksApi = {
  list: (signal?: AbortSignal) => request<Task[]>('/tasks', { signal }),
  create: (draft: TaskDraft) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ ...draft, status: 'todo' }) }),
  setStatus: (id: string, status: Task['status']) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};
```

Four endpoints, one error type, one place where `VITE_API_URL` is read (Part 16, file 04), and the `204` case handled — the bug from file 04 that only shows up on the endpoint nobody tests.

---

## 5. Server state: the optimistic move (and its rollback)

```ts
// src/projects/taskboard/features/tasks/hooks.ts
export const taskKeys = { all: ['tasks'] as const, list: () => [...taskKeys.all, 'list'] as const };

export function useTasks() {
  return useQuery({ queryKey: taskKeys.list(), queryFn: ({ signal }) => tasksApi.list(signal) });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => tasksApi.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.list() });        // stop an in-flight refetch overwriting us
      const previous = queryClient.getQueryData<Task[]>(taskKeys.list());    // snapshot for the rollback
      queryClient.setQueryData<Task[]>(taskKeys.list(), (current = []) =>
        current.map((task) => (task.id === id ? { ...task, status } : task)),
      );
      return { previous };                                                   // context, handed to onError
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(taskKeys.list(), context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: taskKeys.list() }); },
  });
}
```

**The three hooks of an optimistic update**, in order:

1. `onMutate` runs *before* the request: it snapshots the current cache, cancels in-flight refetches (otherwise a background refetch can overwrite your optimistic value and the UI flickers), writes the optimistic value, and returns the snapshot as `context`.
2. `onError` gets that `context` back and restores the snapshot — this is the rollback. Without it the UI keeps a lie on screen.
3. `onSettled` runs after success *or* failure and invalidates the list, so the server's version becomes the truth again.

| Why each line exists | The bug it prevents |
| --- | --- |
| `cancelQueries` before writing | a stale in-flight response replacing the optimistic value |
| `getQueryData` snapshot | a rollback with nothing to roll back to |
| `map` returning new objects | mutating cached data, which React and the cache both fail to notice |
| `onError` restore | "it said done but the server refused" |
| `onSettled` invalidate | the client's guess staying in place forever |

⚠️ **A measured testing trap** (this lab hit it, and the fix is now in the test): the fake API's failing `PATCH` handler must `await delay(50)` before returning the error. Without the delay, the rollback lands before React has painted the optimistic state, so the test can never observe the optimistic value — the assertion fails even though the code is correct. When a test contradicts the implementation, suspect the timing of the fake, not the app.

---

## 6. The screens

```tsx
// src/projects/taskboard/features/tasks/TaskList.tsx (states first, list second)
export function TaskList() {
  const { data: tasks, error, isPending, refetch } = useTasks();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  if (isPending) return <p role="status">Loading tasks…</p>;

  if (error !== null && error !== undefined) {
    return (
      <div role="alert">
        <p>{(error as Error).message}</p>
        <button type="button" onClick={() => void refetch()}>Try again</button>
      </div>
    );
  }

  if (tasks === undefined || tasks.length === 0) {
    return <p data-testid="empty">No tasks yet — add the first one above.</p>;
  }

  return (
    <>
      {setStatus.isError && <p role="alert">Could not update that task: {(setStatus.error as Error).message}</p>}
      <ul aria-label="Tasks">
        {tasks.map((task) => (
          <li key={task.id}>
            <span>{task.title}</span>
            <span> · {task.assignee} · {task.points} pt</span>
            <button type="button" onClick={() => setStatus.mutate({ id: task.id, status: NEXT_STATUS[task.status] })}
                    aria-label={`Move ${task.title} from ${STATUS_LABEL[task.status]} to ${STATUS_LABEL[NEXT_STATUS[task.status]]}`}>
              {STATUS_LABEL[NEXT_STATUS[task.status]]}
            </button>
            <button type="button" onClick={() => remove.mutate(task.id)} aria-label={`Delete ${task.title}`}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

Two details worth copying. The **mutation's error is rendered inline, above the list**, not instead of it: a failed status change must not blank out data the user can still use (the partial-failure rule from file 03). And the move button's `aria-label` says "Move *Write the outline* from *To do* to *In progress*" — a screen-reader user hears the action and the destination, which is information a sighted user gets from watching the list reorder.

```tsx
// src/projects/taskboard/pages/ReportsPage.tsx — lazily loaded, derived from the cache
const totalPoints = list.reduce((sum, task) => sum + task.points, 0);
const donePoints = list.filter((task) => task.status === 'done').reduce((sum, task) => sum + task.points, 0);
const completion = totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 100);
```

The Reports page calls `useTasks()` — **the same hook, the same cache entry** as the list. Nobody fetches twice, and the numbers cannot disagree with the list, because there is only one array. That is the payoff of keying server state by resource rather than by screen.

---

## 7. The shell: providers, boundary, routes, lazy loading

```tsx
// src/projects/taskboard/App.tsx (the router and the shell)
export const taskboardRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    // React Router renders this while it resolves a lazy route on the FIRST render of the app.
    // It must live on a NON-lazy route: a fallback declared inside the lazy module is not known
    // yet, so the router cannot see it and logs "No `HydrateFallback` element provided…".
    HydrateFallback: () => <p role="status">Loading…</p>,
    children: [
      { index: true, element: <><TaskForm /><TaskList /></> },
      { path: 'reports', lazy: async () => ({ Component: (await import('./pages/ReportsPage')).default }) },
    ],
  },
];

export function App({ initialSession, router }: { initialSession?: Session | null; router?: ReturnType<typeof createBrowserRouter> }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retries are good in production and poison in tests (real seconds of backoff,
        // and a deterministic failure becomes a timeout).
        retry: import.meta.env.MODE === 'test' ? false : 1,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSession={initialSession}>
        <Boundary>
          <Suspense fallback={<p role="status">Loading…</p>}>
            <RouterProvider router={router ?? createAppRouter()} />
          </Suspense>
        </Boundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**The provider order is a dependency list, read from the outside in.** `QueryClientProvider` is outermost because it needs nothing; `AuthProvider` sits inside it so auth code can use the query client if it ever needs to; the error boundary wraps the router so a render error anywhere in the tree shows the fallback screen instead of a white page; `Suspense` catches the lazy route's suspension. Swapping two of these is a bug (an auth hook that calls `useQuery` outside `QueryClientProvider` throws a runtime error).

### The `HydrateFallback` story (a real, investigated warning)

The lab ran into this warning from React Router 8:

```text
No `HydrateFallback` element provided to render during initial hydration
```

Adding `HydrateFallback` **inside the lazy module** did not silence it, so the lab instrumented the router (`src/perf/hydrate.test.tsx`) and compared three route shapes:

| Setup | Result |
| --- | --- |
| HydrateFallback declared only inside the lazy module; app starts on `/reports` | ⚠️ warning still logged |
| HydrateFallback on the **non-lazy parent** route; app starts on `/reports` | ✅ no warning |
| app starts on a non-lazy route (`/`) | ✅ no warning |

The source is `node_modules/react-router/dist/development/lib/hooks.js:776`: the warning fires when **no already-known matched route** provides a fallback element. A lazy module's `HydrateFallback` is by definition not known until the module has loaded, so it cannot satisfy the first render. **The fix is to declare the fallback on a non-lazy route that is an ancestor of the lazy one** — which is what the code above does, and it is verified warning-free by the lab's probe.

---

## 8. The tests

```tsx
function renderApp(initialPath = '/') {
  const router = createMemoryRouter(taskboardRoutes, { initialEntries: [initialPath] });
  return { router, ...render(<App initialSession={adminSession} router={router} />) };
}
```

Because `App` accepts an injected router, every test gets a memory router (no browser history, no URL bar) with the same routes, components, providers and boundary as production. The API is faked with MSW, and the store is **one mutable object** shared by every handler:

```tsx
const store = { tasks: [...] };        // handlers read and write store.tasks, so a mutation changes later GETs
```

That single decision is what makes the optimistic-update test meaningful: the `PATCH` really changes what the next `GET` returns, so the retry after a failure observes the server's truth.

| # | Test | What it proves |
| --- | --- | --- |
| 1 | loads tasks and shows the signed-in user | query + auth context + layout |
| 2 | shows a loading state, then an empty state when there is nothing | the state machine's first and third branches |
| 3 | creates a task through the form and clears the inputs | mutation + list invalidation + form lifecycle |
| 4 | refuses invalid input and does not call the API | validation before the network |
| 5 | moves a task optimistically, and rolls back when the server refuses | the whole `onMutate`/`onError`/`onSettled` cycle |
| 6 | deletes a task | mutation + cache removal |
| 7 | renders the error state with a retry when the list request fails | failure handling that a user can recover from |
| 8 | loads the report route lazily and computes the numbers from the cache | code splitting and shared cache (navigating to `/reports` triggers the dynamic import) |

```text
 ✓ src/projects/taskboard/taskboard.test.tsx (8 tests) 1106ms
   ✓ loads the report route lazily and computes the numbers from the cache 79ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

💡 Test 5 is the one to study. It asserts three things in sequence: the row's label changes immediately (optimistic), the message "Could not update that task" appears (rollback happened), and the task is back in its original column (the cache was restored — not merely re-fetched). A test that only asserted the error message would pass even if the UI kept the wrong status.

---

## 9. Running it with no backend

A teaching repo should work on `git clone && npm install && npm run dev`. The lab achieves that with a dev-only fake API that patches `window.fetch` for `/api/tasks` and leaves every other request alone:

```ts
// src/dev/mock-api.ts (abridged)
export function installMockApi(): void {
  if (!import.meta.env.DEV) return;                 // dead code in a production build

  let tasks: Task[] = [...seed];
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/tasks')) return realFetch(input, init);

    await new Promise((resolve) => setTimeout(resolve, 250));   // pretend there is a network
    const method = (init?.method ?? 'GET').toUpperCase();
    const id = url.split('/api/tasks/')[1];
    // GET → the array, POST → append (201), PATCH → merge, DELETE → 204, anything else → 404
  };
}
```

```tsx
// src/main.tsx
installMockApi();                                   // no-op in production
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Three rules make this acceptable in a real repo: it is **guarded by `import.meta.env.DEV`** so it cannot ship; it is **obviously named** (`src/dev/`, "mock"); and it intercepts **one prefix**, so a developer who adds a real endpoint is not silently served fake data. In a production codebase you would instead point `VITE_API_URL` at a running backend (Part 16, file 04) and keep the mock for tests only.

**Run it:**

```bash
npm install
npm run dev            # http://localhost:5199 — the capstone is what src/main.tsx renders
npm test -- --run      # 12 files, 62 tests
npm run build          # type-check + production build
npm run preview        # serve dist/ and check the lazy chunk is fetched on demand
```

```text
✓ built in 368ms
dist/index.html                       0.62 kB │ gzip:   0.34 kB
dist/assets/index-DtetkJLr.css        8.24 kB │ gzip:   2.50 kB
dist/assets/rolldown-runtime-*.js     0.58 kB │ gzip:   0.36 kB
dist/assets/ReportsPage-CTBW9k2s.js   2.09 kB │ gzip:   1.02 kB   ← the lazy route
dist/assets/index-Cfv75aT3.js        12.04 kB │ gzip:   4.77 kB
dist/assets/vendor-DwDvQbTE.js      345.82 kB │ gzip: 107.76 kB   ← react, react-dom, react-router, react-query
```

Read that table as a budget: **the Reports page costs nobody anything until someone visits `/reports`** (2.09 kB), while the vendor bundle is what every visitor downloads. If the vendor chunk is the problem, the fix is to question `vendor` itself (does the first screen need the whole of `@tanstack/react-query`?) rather than to micro-optimise 12 kB of app code (Part 16, file 03).

---

## 10. Common mistakes in this app

| # | Mistake | What goes wrong | Do this instead |
| --- | --- | --- | --- |
| 1 | Components calling `fetch` directly | loading/error/abort logic duplicated everywhere | one API module + one hook per operation |
| 2 | Optimistic update without rollback | the UI shows a change the server rejected | snapshot in `onMutate`, restore in `onError` |
| 3 | Optimistic update without `cancelQueries` | a background refetch overwrites it and the UI flickers | cancel before writing |
| 4 | Invalidating everything after each write | the whole app refetches, the UI jumps | invalidate the affected keys |
| 5 | Retries enabled in tests | seconds of backoff and timeouts | `retry: false` when `MODE === 'test'` |
| 6 | A single error screen for every failure | one failed status change blanks usable data | inline, scoped errors; boundary only for render errors |
| 7 | Error boundary around *everything* with no retry | users are stuck on "something went wrong" | a reset button that clears the boundary state |
| 8 | Lazy routes with no fallback | a blank flash, and the router's warning | `HydrateFallback` on a **non-lazy** ancestor |
| 9 | Mutating cached arrays | React and the cache miss the change | `map`/`filter`/spread |
| 10 | Dev mock shipped to production | fake data in front of real users | `if (!import.meta.env.DEV) return;` |
| 11 | Auth guard on the client treated as security | the API is wide open | guard the API too (the client guard is only UX) |
| 12 | Tests that share the mock store between cases | order-dependent failures | reset the store in `beforeEach` |
| 13 | Fetching the same data per screen | two sources of truth, two round trips | key the cache by resource (`taskKeys.list()`) |

---

## 11. Practice (take it further)

### Beginner

1. Add a status filter (`All / To do / In progress / Done`) with `aria-pressed` buttons and a test for each branch.
2. Show the total points at the top of the list, derived from the same query data.
3. Disable the move button for the row that is currently mutating (`setStatus.isPending && setStatus.variables?.id === task.id`).

### Intermediate

1. Add an "assignee" filter driven by the URL (`/tasks?assignee=Asha`) with `useSearchParams`, and test that the URL survives a reload and that back/forward work.
2. Make deletion optimistic too (row disappears immediately, restored with a message on failure) and test both paths.
3. Add pagination (`?page=2`) backed by *server-side* paging: change the API to accept `?page=` and give each page its own cache key. Write down what changes in invalidation — this is where "invalidate the list" stops being enough.

### Challenge

1. Add a second role: a `viewer` may move tasks but not create or delete them. Implement it in the UI (hidden/disabled controls), in the route guard, **and** in the mock API's responses (403), then write the test that proves a viewer cannot delete a task through the UI — and a comment explaining why the UI check is not the protection.
2. Add offline support: queue mutations made while offline (a small array in `localStorage`), replay them on reconnect in order, and define what happens when one of them conflicts. Test the queue with a simulated offline fetch.
3. Replace MSW + the in-memory store with a real tiny Node API (Part 15, file 04's stub, extended with `/tasks`) and run the same test file against it. Write down which tests became slower, which became impossible to keep deterministic, and why the fast fake is still the right default for a unit/component suite.

---

## 12. Solutions

### Beginner

1. `const [filter, setFilter] = useState<'all' | TaskStatus>('all')`, then `visible = filter === 'all' ? tasks : tasks.filter((task) => task.status === filter)`. Test each filter including the empty result.
2. `const totalPoints = tasks.reduce((sum, task) => sum + task.points, 0)` in the list (derived, not stored).
3. `disabled={setStatus.isPending && setStatus.variables?.id === task.id}` — `variables` is the argument the mutation is running with, which is how you scope a mutation's pending state to one row.

### Intermediate

1. `const [params, setParams] = useSearchParams(); const assignee = params.get('assignee') ?? ''`, and filter client-side (or pass it to the API and make it part of the cache key — see challenge 3's lesson). Back/forward work because the URL is the state.
2. Same shape as the status mutation: `onMutate` snapshots the list and removes the row, `onError` restores it and sets a message, `onSettled` invalidates. Watch the message: "Could not delete *Write the outline*" is far better than "Error".
3. The API gains `?page=` and returns `{ items, total }`; keys become `['tasks','list',{page}]`. Invalidation must now cover **every page** of the list (`invalidateQueries({ queryKey: taskKeys.all })` or a predicate), because creating a task shifts items between pages — which is exactly the kind of reasoning that makes server-side pagination a design decision rather than a tweak.

### Challenge

1. `can('delete', role)` in the UI hides the control; the route guard keeps viewers out of admin pages (Part 17, file 05's app); and the mock API returns 403 for a viewer's DELETE, so the test can attempt it (e.g. by calling `tasksApi.remove` directly) and prove the API refuses. The comment: *the UI check is a courtesy; the 403 is the control.*
2. Queue `[{ id, method, url, body }]` in `localStorage`, replay on `online` in order with a stop-on-first-failure policy so later writes are not applied out of order, and surface "3 changes waiting to sync" in the UI. Test with a fetch stub that rejects while offline.
3. A real server makes the suite slower, requires lifecycle management, and introduces nondeterminism (ports, cleanup, timing) — so the fast fake stays the default. Keep the real-server test as a small "contract" suite (does the app talk to the actual API shape?) rather than as the whole suite.

---

## 13. Summary — and the end of Part 17

- **Layers with one-way imports** (`types → api → hooks → components → pages → App`) are what make a feature testable: the API was replaced by MSW and by a dev mock without a single component changing.
- **Feature folders keep related code together**; `TaskDraft = Pick<Task, …>` shows a type encoding a business rule.
- **Optimistic updates need three hooks**: snapshot and cancel (`onMutate`), restore (`onError`), reconcile with the server (`onSettled`). Skipping any one produces a specific, describable bug (section 5).
- **Errors are scoped**: an error boundary for render failures, inline retry for a failed list load, an inline message for a failed mutation — never one screen for all three.
- **The shell is a dependency list**: `QueryClientProvider → AuthProvider → Boundary → Suspense → RouterProvider`, with `retry` disabled under test.
- **Lazy routes pay off** (a 2.09 kB chunk fetched on demand) and come with a real gotcha the lab investigated and fixed: `HydrateFallback` must be declared on a **non-lazy** ancestor route.
- **The capstone runs with no backend** thanks to a `DEV`-guarded fetch mock — and that mock is the same idea as MSW, one layer further out.
- **Eight tests cover the failure paths**, including rollback-to-original-status and the lazy route, in 1.1 s — fast enough to run on every save.
- **Everything in Part 17 was built and measured in this repo** ([`react-lab/evidence/part17-projects.txt`](../../react-lab/evidence/part17-projects.txt)): six apps plus the performance lab, **45 project tests** (43 app + 2 perf) out of 12 files and **62 tests** across the whole lab, a clean `tsc -b`, and a green production build in ~0.3 s (304–368 ms across runs).

**You can now build.** What is left is the part that makes the knowledge *yours*: a portfolio project of your own, deployed, with a README that explains the trade-offs you chose — and then, when you have to go deeper, the deployment and team practices in Part 18.

---

**What's next →** [`07-performance-lab.md`](./07-performance-lab.md) turns the performance advice in this book into measurement: the same list rendered four ways, with the render counts and timings printed, so you can see exactly what React Compiler, `memo`, `useMemo` and windowing do and do not change.
