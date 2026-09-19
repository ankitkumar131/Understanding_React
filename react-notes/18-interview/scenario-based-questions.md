# 04 — Scenario-Based Questions (Debugging and Design)

> **Part 18 · Interview Preparation · File 4 of 4**

These are the questions that decide senior-level interviews, because there is no memorised answer: the interviewer describes a symptom and watches how you reason. Every answer in this file follows the same shape:

```text
Scenario                  ← the symptom, exactly as a user or a colleague reports it
Short interview answer    ← the likely cause, in one sentence
Detailed explanation      ← the mechanism, the alternatives you would rule out, how you would confirm
Example                   ← the broken code, the fix, and a test that would have caught it
```

The habit to demonstrate: **reproduce → isolate → explain → fix → prevent**. Say the words out loud; interviewers are grading the process, not the punchline.

---

## 1. Rendering mysteries

### S1.1 — "My component renders twice."

**Short answer:** In development with `<StrictMode>`, React intentionally renders twice to surface impure components and missing effect cleanups; in production it renders once. If it happens in production, look for state set during render, an effect that sets state unconditionally, or an unmount/remount caused by an unstable `key`.

**Detailed explanation:** Three genuinely different situations get reported as "renders twice":
1. **StrictMode double render (dev only)** — expected; it exists so that impure code and unclean effects break loudly in development instead of subtly in production. The check is: does it happen in a production build? If no, you are done.
2. **Two renders per update from state set in an effect** — a render, an effect, a `setState`, and a second render. The fix is to derive the value during render instead of synchronising it with an effect.
3. **Unmount + remount** — a changed `key`, a component defined *inside* another component (a new type every render, so React throws away the subtree), or a router that remounts on navigation. This is the one that loses state and looks like "rendering twice".

Confirm with a render counter plus a mount counter (an effect with `[]`), and use React DevTools' "Highlight updates" to see the tree.

**Example:**

```tsx
function Parent() {
  const [count, setCount] = useState(0);

  // ❌ A new component type on every render → React unmounts and remounts the subtree
  const Inner = () => <p>Inner</p>;

  // ❌ Effect that always sets state → render → effect → render
  const [doubled, setDoubled] = useState(0);
  useEffect(() => setDoubled(count * 2), [count]);

  // ✅ Correct: derive during render, define components at module scope
  const doubled2 = count * 2;
  return <><button type="button" onClick={() => setCount((c) => c + 1)}>{count}</button><p>{doubled2}</p></>;
}
```

```tsx
// The test that prevents the remount class of bug:
it('keeps the child mounted across parent updates', async () => {
  const user = userEvent.setup();
  render(<Parent />);
  const before = screen.getByTestId('mounted-at').textContent;
  await user.click(screen.getByRole('button', { name: /count/ }));
  expect(screen.getByTestId('mounted-at')).toHaveTextContent(before!);   // same instance → not remounted
});
```

### S1.2 — "It renders in an infinite loop."

**Short answer:** Something sets state during render, or an effect sets state on every run because its dependency array is missing or contains a value that changes identity each render.

**Detailed explanation:** The two loops have different signatures. **During-render loops** throw "Too many re-renders" immediately and usually come from `onClick={handler()}` (calling instead of passing), `setState` at the top level of a component, or a `useMemo`/selector that writes state. **Effect loops** are quieter (they run until the tab dies) and come from an effect whose dependency is a new object/array/function each render — often a value produced by a parent, or a function defined inline.

To diagnose: comment out the effect, or log inside it. Then fix the identity, do not silence the linter by removing the dependency.

**Example:**

```tsx
// ❌ During render
function Bad() {
  const [value, setValue] = useState(0);
  setValue(1);                                   // every render schedules another render
  return <p>{value}</p>;
}

// ❌ Effect loop: `options` is a new object every render
function AlsoBad() {
  const [data, setData] = useState<Item[]>([]);
  const options = { status: 'open' };
  useEffect(() => { void load(options).then(setData); }, [options]);
  return <p>{data.length}</p>;
}

// ✅ Fixes: move the state update into an event, and stabilise the dependency
const OPEN_OPTIONS = { status: 'open' } as const;                        // or useMemo if it depends on props
useEffect(() => { void load(OPEN_OPTIONS).then(setData); }, []);          // truly constant → run once
```

### S1.3 — "The UI does not update when I change state."

**Short answer:** You mutated an existing array/object (or a ref), so React saw the same reference. Or you changed something React does not render from — a ref, a module variable, or a plain object outside state.

**Detailed explanation:** React compares with `Object.is`. `todos.push(x)` keeps the same array identity; `task.done = true` keeps the same object identity; even `setTasks(todos)` with a mutated array is "no change". The ref variant is different and equally common: refs are not rendered from, so updating `ref.current` never re-renders anything — which is correct behaviour, and the reason a ref is the wrong place for data that appears on screen.

**Example:**

```tsx
// ❌ Mutations
const toggleBroken = (id: string) => {
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
  setTodos(todos);                                  // same reference → React bails out
};

// ✅ Immutable updates
const toggle = (id: string) => setTodos((current) => current.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

// ✅ Or a reducer, which makes the rule structural
dispatch({ type: 'toggle', id });

// ✅ The test that catches it: assert the DOM, not the array
expect(await screen.findByRole('checkbox', { name: /Write/ })).not.toBeChecked();
```

### S1.4 — "The list shows the wrong items after deleting one."

**Short answer:** The list uses the array index as `key`, so React reuses DOM nodes for different items.

**Detailed explanation:** With `key={index}`, deleting the first item makes every subsequent item keep a key that belonged to a different item. React's diffing then reuses the DOM node (including its state: focus, checkbox state, uncontrolled inputs) for different data — the classic "the wrong row is crossed out". The rule: keys must be stable and unique *among siblings*, derived from the data (`task.id`), and only used as an index when the list is static, never reordered, and never filtered.

**Example:**

```tsx
// ❌
{todos.map((todo, index) => <TodoItem key={index} todo={todo} />)}

// ✅
{todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)}
```

```tsx
// The test that proves it:
it('removes the row that was clicked, not the row at that position', async () => {
  const user = userEvent.setup();
  render(<TodoApp />);
  await user.click(screen.getByRole('button', { name: 'Delete "Second"' }));
  expect(screen.queryByText('Second')).not.toBeInTheDocument();
  expect(screen.getByText('First')).toBeInTheDocument();
});
```

---

## 2. Data and effect problems

### S2.1 — "My API is called repeatedly."

**Short answer:** The fetching effect has an unstable dependency (an object, array or inline function recreated each render), or the request is triggered from render, or several components each fetch the same resource independently.

**Detailed explanation:** Diagnose by printing the dependency on every render — you will see a new identity each time. Then either stabilise it (`useMemo`/`useCallback`, hoist it out, or reduce it to primitives) or move the fetch out of the effect entirely (a query library keys by value, not identity, so an equal-but-new object does not refetch). The second half of the answer matters for senior interviews: **caching and deduplication**. Ten components asking for the same resource should produce one request — that is `useQuery` with one query key, or a route loader.

**Example:**

```tsx
// ❌ Refetches on every render: `filter` is a new object each time
const filter = { status, page };
useEffect(() => { void loadTasks(filter).then(setTasks); }, [filter]);

// ✅ Depend on primitives
useEffect(() => { void loadTasks({ status, page }).then(setTasks); }, [status, page]);

// ✅ Better: a query keyed by values — deduplicated, cached, cancelled, and refetched only when the values change
const { data } = useQuery({
  queryKey: ['tasks', { status, page }],
  queryFn: ({ signal }) => api.listTasks({ status, page }, signal),
});
```

### S2.2 — "The old search result overwrites the new one."

**Short answer:** Two requests are in flight and the slower (older) one resolves last. Fix by cancelling the previous request (`AbortController`) and ignoring results from aborted requests.

**Detailed explanation:** This is a race condition, and it is invisible in fast local development — which is exactly why it ships. Three layers of defence: abort the previous request when a new one starts; guard `setState` with `signal.aborted`; and cancel on unmount (or let a query library do all three, since `queryFn` receives a signal). Add a test with two different delays so the race is deterministic (`await delay(80)` for the slow city, `delay(0)` for the fast one).

**Example:**

```tsx
export function useWeather() {
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async (city: string) => {
    controllerRef.current?.abort();                       // cancel the previous search
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: 'loading', city });
    try {
      const report = await fetchWeather(city, controller.signal);
      if (controller.signal.aborted) return;              // a newer search won: drop this result
      setState({ status: 'success', city, report });
    } catch (cause) {
      if (controller.signal.aborted) return;              // an abort is not an error to show
      setState({ status: 'error', city, message: describe(cause), retryable: isRetryable(cause) });
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);
  return { state, search: run };
}
```

### S2.3 — "The timer always shows 0" (or "the interval never sees fresh state").

**Short answer:** A stale closure: the callback captured the first render's state. Use the functional updater, or keep the latest value in a ref.

**Detailed explanation:** The `setInterval` callback was created once (empty dependency array) with the value from that render. `setCount((c) => c + 1)` has no captured value, so it is always current. If you must *read* the value (for a decision), store it in a ref that an effect keeps fresh, and read `ref.current` inside the interval — or re-create the interval when the value changes (correct, but it resets the timer, so say that trade-off out loud). Clean up in all cases: a leaked interval keeps running after the component unmounts, and React 18+ will show you the missing cleanup in StrictMode.

**Example:**

```tsx
function Stopwatch() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;                                  // returning nothing is a valid cleanup
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);   // no captured value
    return () => window.clearInterval(id);
  }, [running]);

  return <><output>{seconds}s</output><button type="button" onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Start'}</button></>;
}
```

### S2.4 — "My form loses what the user typed when the parent re-renders."

**Short answer:** The component is being remounted (usually a `key` that changes, or a component defined inside another component), or the input is controlled by a value the parent resets on every render.

**Detailed explanation:** Two distinct causes. If it is a **remount**, the state is destroyed and recreated: check for a `key` derived from something volatile (an index, a random id, `Math.random()`), and check for components declared inside another component's body. If it is a **controlled value that resets**, the parent is passing `value={something}` computed fresh (for example `value={undefined}` after a state update) — the input then follows the parent instead of its own state. The robust pattern for "a form that starts from data but is edited independently" is to initialise state once and give the form a stable `key` derived from the record's id, so switching records *should* remount and typing should not.

**Example:**

```tsx
// ❌ A new component type each render → the input remounts and loses focus/value
function Wrapper({ record }: { record: Record }) {
  const Editor = () => <input defaultValue={record.title} aria-label="Title" />;
  return <Editor />;
}

// ✅ A stable component, and a key that only changes when the record changes
function Editor({ initialTitle }: { initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  return <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />;
}

<Editor key={record.id} initialTitle={record.title} />     {/* remount only on record change — intentional */}
```

### S2.5 — "The modal closes and reopens by itself, and the page jumps."

**Short answer:** The state is being toggled by an effect that re-runs, or by an event that fires twice (a click on the overlay *and* on the dialog), or the modal is remounted because its parent re-created it.

**Detailed explanation:** Three common mechanisms: (1) the modal's parent re-renders and the `key` (or the component identity) changes, so the modal remounts — which looks like close/reopen; (2) click handling both inside and outside the dialog (use `event.target === event.currentTarget` on the backdrop, plus a stop-propagation where needed); (3) an effect that "opens on mount" running again because a dependency changed. The accessible pattern also matters for the answer: focus moves into the dialog on open, Escape closes it, focus returns to the trigger on close, and the background is inert (`<dialog showModal>` or `aria-modal`).

**Example:**

```tsx
function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();          // native focus trap, inert background
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} aria-labelledby="modal-title" onClose={onClose} onClick={(event) => {
      if (event.target === event.currentTarget) onClose();  // backdrop click only
    }}>
      <h2 id="modal-title">{title}</h2>
      {children}
      <button type="button" onClick={onClose}>Close</button>
    </dialog>
  );
}
```

---

## 3. Architecture and design scenarios

### S3.1 — "How would you structure a large React application?"

**Short answer:** Feature folders with one-way dependencies, a shared design-system folder, routes as data, server state in a query cache, UI state local, a handful of contexts for app-wide values, and explicit boundaries so features cannot import each other's internals.

**Detailed explanation:** Structure is about answering "where does this go?" in five seconds and preventing cycles. Layering per feature is `types → api → hooks → components → pages`, and the app shell composes providers, routes and boundaries. Cross-cutting concerns (auth, theming, logging, error reporting, analytics) live in `app/` or `shared/`, and are the only things allowed to be imported by everyone. The review question: "if we delete this feature, what breaks?" — the answer should be "its route and its entry in the router". Mention what you would *not* do: a global `components/` dump, a global `store.ts` you import everywhere, or a `utils/` folder that becomes a second application. If the codebase is older, explain a migration path — deleting `export default` collisions and cycles first, then co-locating feature state — rather than a rewrite.

**Example:**

```text
src/
├── app/                      # composition root: providers, router, layout, global error boundary
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
├── auth/                     # shared concern: session, guards, useAuth
├── shared/
│   ├── ui/                   # Button, Input, Modal — no domain knowledge
│   ├── lib/                  # fetch wrapper, formatters, parsing helpers
│   └── hooks/                # useLocalStorage, useDebouncedValue, useMediaQuery
└── features/
    ├── tasks/
    │   ├── api.ts            # the only file that knows the endpoint
    │   ├── hooks.ts          # queries, mutations, optimistic updates
    │   ├── components/       # TaskList, TaskForm, TaskCard
    │   ├── pages/            # TaskListPage, TaskDetailPage
    │   ├── types.ts
    │   └── index.ts          # the public surface other features may import
    └── reports/
```

### S3.2 — "When would you use Context instead of Redux?"

**Short answer:** Context for low-frequency, app-wide values (theme, locale, current user, a client instance). Redux (Toolkit) when many unrelated components read and write the same state, updates follow complex rules, or the team benefits from DevTools tracing and a single enforced pattern. Often the honest answer is "neither — the data is server state, so it belongs in a query cache".

**Detailed explanation:** The technical difference is re-render behaviour: a context value change re-renders every consumer, whereas a store lets each component subscribe to a slice (`useSelector`) with its own equality check. The decision table that interviewers want:

| Need | Tool |
| --- | --- |
| Theme, current user, feature flags (rarely change) | Context |
| Server data (lists, details, pagination) | Query cache (TanStack Query) |
| Complex client state with many writers (a canvas editor, undo/redo) | Redux Toolkit or Zustand |
| Form state | React Hook Form or actions |
| One screen's state | `useState` next to the screen |

Also name the failure modes: a context with a fast-changing value (an input) that re-renders the app; a Redux store used as a cache for server data (double bookkeeping, stale values, no deduplication). And answer the "is Redux required for large apps?" question directly: **no** — plenty of large apps use a query cache plus local state, and choosing Redux is a trade-off in consistency and tooling, not a size threshold.

**Example:**

```tsx
// Context: one provider, memoised value, typed hook — stable and low-frequency
const SessionContext = createContext<AuthValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const value = useMemo<AuthValue>(() => ({ session, login, logout }), [session, login, logout]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
```

### S3.3 — "How would you optimise a slow React page?"

**Short answer:** Measure first (Profiler/Performance panel), then fix in order of payoff: render less (windowing, pagination, code splitting), move state down, memoise the specific hotspot, and reduce work in render — then measure again.

**Detailed explanation:** A structured answer beats a list of techniques. Step 1, **budget**: what is slow (load, interaction, layout)? A 4-second first paint and a janky drag have different causes. Step 2, **measure**: a trace plus the Profiler's ranked chart tells you whether time is spent in JavaScript, rendering, or the network. Step 3, **fix structurally**: windowing (this book measured 20 000 rows windowed to 50 mounting in 3.2 ms versus 4000 full rows in ~255 ms, development build), split a route (a lazy chunk fetched on demand), move a fast-changing state out of a heavy subtree, and let the React Compiler handle memoisation where it can prove it. Step 4, **verify**: the same measurement, plus a render-count assertion in a test so the regression does not come back. Name what you would *not* do first: sprinkle `useMemo` everywhere, memoise a component whose props change every render, or virtualise a 20-row list.

**Example:**

```tsx
// The harness that turns advice into evidence (from Part 17's performance lab):
const start = performance.now();
const { unmount } = render(<List rows={4000} />);
console.log(`mount ${rows} rows`, performance.now() - start, 'ms');

rowCalls = 0;
act(() => { buttons[1].click(); });
console.log('rows re-rendered after one click:', rowCalls);      // the assertion that catches regressions
```

### S3.4 — "The bundle is 1.5 MB. How do you find out why?"

**Short answer:** Build with a visualiser to see the module graph, then split by route (`lazy`/dynamic import), check for duplicate or heavy dependencies (moment, lodash, a whole icon set), and verify with a before/after build.

**Detailed explanation:** The analysis step matters more than the fix: `npx vite build` prints sizes; `rollup-plugin-visualizer` (or `vite-bundle-visualizer`) shows *which module* is large; `npm ls <package>` catches duplicates at different versions. Typical findings: a date library imported at the top level, `import * as _ from 'lodash'`, an icon library imported as a barrel file (`import { FaX } from 'react-icons/fa'` is fine, but some libraries bundle everything), and a charting library needed on one screen. Fixes: dynamic import per route, `manualChunks` for stable vendors (so a deploy does not force users to re-download React), and checking that the production build is actually what you measured (a dev build is 3–10× larger).

**Example:**

```jsonc
// vite.config.ts — vendor chunking, so app deploys do not invalidate the framework cache
export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },
});
```

```bash
npm run build                                 # 2.09 kB lazy chunk, 345.82 kB vendor, 368 ms  (measured in Part 17)
npx vite-bundle-visualizer                    # open the treemap and find the biggest box that is not React
```

### S3.5 — "A user reports data from someone else's account."

**Short answer:** Treat it as a security incident first: check caching (is the query cache or a shared HTTP cache keyed only by URL?), then check the API (authorization on every request, not just the route), then the client (tokens, logout behaviour, service workers). Frontend state must be scoped to the session and cleared on logout.

**Detailed explanation:** The realistic causes, in order: (1) a shared cache that ignores the user — for example a CDN caching `/api/tasks` without `Vary: Authorization`, or a browser cache serving a previous user's response; (2) server-side authorization missing on one endpoint (the UI hides it, the API allows it); (3) client state not cleared on logout (a store or query cache holding the previous user's data while the next user signs in); (4) a stale service worker serving cached responses. The response: reproduce with two accounts, check the request headers and cache-control on the response, clear the cache on logout (`queryClient.clear()`), and add a test that signs out and asserts the previous data is gone. Say clearly that **no client-side measure fixes a missing server check**.

**Example:**

```tsx
const logout = () => {
  tokenStore.clear();
  queryClient.clear();                         // drop every cached response, not just the current user's keys
  setSession(null);
  setStatus('anonymous');
};

// Test:
it('does not show the previous user\'s tasks after signing out and in as someone else', async () => {
  const { rerender } = renderApp({ as: 'asha' });
  await screen.findByText('Asha\u2019s task');
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  rerender(<App initialSession={vikSession} />);
  expect(await screen.findByText('Vik\u2019s task')).toBeInTheDocument();
  expect(screen.queryByText('Asha\u2019s task')).not.toBeInTheDocument();
});
```

### S3.6 — "Would you render this on the server?"

**Short answer:** If the first paint must be fast, the page must be indexable, or data should arrive with the HTML, consider SSR/SSG (Next.js, React Router framework mode). If it is an authenticated internal dashboard, an SPA behind a login is usually simpler and cheaper.

**Detailed explanation:** The decision table that shows judgement: **SSG** for content that changes rarely (marketing, docs, blogs); **SSR** for personalised, SEO-relevant pages with fresh data (product pages, dashboards you want to be fast on first paint); **SPA** for authenticated tools where SEO is irrelevant and the app is behind a login. Also mention the costs: a server to run and monitor, hydration mismatches to debug (never read `Date.now()`/`localStorage` during render), and the fact that streaming/server components change how data loading is written. And say what stays the same: state, hooks, components, tests.

**Example:**

```tsx
// A hydration mismatch: the server renders one time, the client another
function Timestamp() {
  return <p>Generated {new Date().toLocaleTimeString()}</p>;      // ❌ differs between server and client
}

// Fixes: render a stable value, or move it to an effect (client-only after hydration)
function Timestamp({ iso }: { iso: string }) {
  return <p>Generated {new Date(iso).toLocaleTimeString()}</p>;   // the server decides the value
}
```

---

## 4. Team, process and production scenarios

### S4.1 — "Your pull request breaks a test in CI that passed locally. What do you do?"

**Short answer:** Reproduce it in the same conditions as CI (clean install, the same Node version, no local `.env`, tests in parallel), read the actual error rather than re-running, and fix the cause — usually shared state, ordering, timing, or an environment-dependent assertion.

**Detailed explanation:** The usual suspects: tests that pass alone but fail together (shared `localStorage`/module state between files → reset in `beforeEach`), timing (real timers and network delays → fakes and explicit waits for state, not sleeps), timezone/locale differences (`toLocaleString` assertions with a fixed locale), and environment (a `.env.local` that exists on your machine but not on CI — the book hit exactly this when measuring env precedence). The fix is a *deterministic* test: no reliance on wall-clock time, no cross-test state, no hidden network.

**Example:**

```ts
// vitest.config.ts / vite.config.ts test block + setup file
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,                 // every test starts with clean spies
    env: { VITE_API_URL: '/api' },      // match the MSW handlers exactly — a mismatch fails every request test
  },
});

// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => localStorage.clear());
afterEach(() => { server.resetHandlers(); cleanup(); });
afterAll(() => server.close());
```

### S4.2 — "How do you review a React pull request?"

**Short answer:** Check behaviour and tests first (does it do what the ticket says, is it tested where it is risky), then accessibility, then boundaries (errors, loading, empty, permissions), then performance and naming — and keep style opinions to the linter.

**Detailed explanation:** A checklist worth saying out loud: does the change have a test that fails without it? Are the failure paths handled (network error, empty state, permission denied)? Does it break keyboard or screen-reader use (a `<div onClick>`, a missing label, focus lost after an action)? Are server-state boundaries respected (one query key per resource, invalidation after mutations)? Are the names honest (`useTasks` returns tasks; `handleSubmit` handles submission)? Is the diff small enough to review properly? And the human part: ask questions instead of asserting preferences, and distinguish "this is a bug" from "I would have done it differently".

**Example:**

```text
Review checklist (copy into the PR template)
- [ ] Behaviour matches the ticket; I ran it (or the preview link)
- [ ] A test exists that fails without this change
- [ ] Loading / empty / error / permission states handled
- [ ] Keyboard + screen-reader path works (labels, roles, focus)
- [ ] No new `any`, no `as` at a boundary, no secrets in the client
- [ ] Server state: correct query keys, invalidation after writes, no duplicate fetching
- [ ] Bundle impact considered (any new dependency? dynamic import it?)
```

### S4.3 — "A bug is reported in production. Walk me through your process."

**Short answer:** Reproduce (or find the affected users/session), check monitoring and logs for the release and the request id, form one hypothesis and test it, ship the smallest safe fix (rolling back if the cause is unclear and the impact is high), then add a test and, if relevant, a guard.

**Detailed explanation:** The scenario is really about the difference between debugging locally and debugging a system. Mention: correlation ids and structured logs so you can find the request; error reporting with release and source maps so a stack trace is readable; feature flags or a fast rollback path for mitigation; and the post-incident step of turning the bug into a test. This is where you mention the tools without bragging: Sentry-style error tracking, an uptime/alert rule, a build number visible in the UI footer, and a deploy log that says which commit is live.

**Example:**

```ts
// One place that sends telemetry, called by the error boundary and the query client
export function reportError(error: unknown, context: Record<string, unknown>): void {
  const release = import.meta.env.VITE_RELEASE;
  if (import.meta.env.PROD) void fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: error instanceof Error ? error.message : String(error), release, context }),
    keepalive: true,                                  // survive a page unload
  });
}

// Query client hook: every query failure is reported with its key
new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => reportError(error, { queryKey: query.queryKey }),
  }),
});
```

### S4.4 — "How would you deploy this safely?"

**Short answer:** CI runs type-check, lint and tests; the build produces hashed assets; a preview deploy per pull request; production deploys are the same artefact promoted (not rebuilt); environment configuration comes from the platform, never from the repo; and every deploy has a rollback path.

**Detailed explanation:** The safe-deploy story includes: cache headers (immutable hashed assets, no-cache for `index.html`), SPA fallback (a static host must rewrite unknown paths to `index.html` or a refresh on `/tasks/42` 404s — the book measured this), source maps uploaded to the error tracker and not publicly served, feature flags for risky changes, a smoke test after deploy, and a documented rollback (previous artefact or a revert commit). For a release that changes an API contract, the order matters: additive server change → deploy client → remove the old path later.

**Example:**

```yaml
# .github/workflows/ci.yml (the shape, not a cargo cult)
name: CI
on: [pull_request, push]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run verify          # lint + type-check + tests + build, in that order
      - run: npx vite build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist }
```

### S4.5 — "How do you keep a React codebase healthy over years?"

**Short answer:** Quality gates in CI (lint, types, tests, build), a small set of conventions written down, dependency upgrades on a schedule, and a habit of deleting code — dead components, unused exports, and the second implementation of anything.

**Detailed explanation:** The parts that age badly are the ones nobody decided: duplicated fetch logic per screen, three date libraries, a `utils/` folder with 40 unrelated functions, and tests that assert implementation details so every refactor breaks them. Countermeasures: the `verify` script as the single gate; ADRs for the decisions that will be questioned later; Dependabot-style upgrades in small batches with the test suite as the safety net; a convention for query keys and feature folders; and accessibility/performance budgets that fail CI (Lighthouse CI, a bundle-size check). Say the honest thing: the tests are what make the upgrades boring.

**Example:**

```jsonc
// package.json scripts: one command that means "this is correct"
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "eslint .",
    "verify": "npm run lint && tsc -b && vitest run && vite build"
  }
}
```

---

## 5. Rapid-fire scenarios

| # | Symptom | First suspicion | Fix |
| --- | --- | --- | --- |
| 1 | Input loses focus on every keystroke | the component remounts (inline component or unstable `key`) | hoist the component, stabilise the key |
| 2 | `undefined` rendered in the UI | data that has not loaded, or a missing default | four-state union, defaults, `??` |
| 3 | A button submits the page unexpectedly | `<button>` inside a `<form>` defaults to `type="submit"` | `type="button"` |
| 4 | `NaN` in a total | a `string` from an input used in arithmetic | `Number(value)`, validate, keep `number` in the model |
| 5 | Style from the wrong row "sticks" | index keys | stable keys |
| 6 | Tests pass alone, fail together | shared module state (`localStorage`, a mutable store) | reset in `beforeEach` |
| 7 | Effect runs on every render | unstable dependency identity | primitives, `useMemo`, or move the work out |
| 8 | "Cannot read properties of undefined" | deep access on possibly-missing data | `?.`, defaults, narrow the type |
| 9 | The same request fires 4 times | four components fetching independently | one query key + a cache |
| 10 | The modal can be tabbed behind | a `<div>` modal without a focus trap | `<dialog showModal>` or proper focus management |
| 11 | Form data vanishes on refresh | nothing persisted (fine) or state not saved when expected | persist deliberately, or accept it |
| 12 | Production looks different from local | a dev-only mock, a missing `VITE_*` variable, or a cached `index.html` | verify the built bundle's env values; check cache headers |
| 13 | The sentry-style stack trace is minified | source maps not uploaded | upload maps to the tracker, keep them out of the public bundle |
| 14 | Crash on refresh at a deep URL | no SPA fallback on the host | rewrite unknown paths to `index.html` |
| 15 | A stale value appears after signing out and in | cache not cleared, query cache per user not keyed | `queryClient.clear()` on logout; per-user keys |

---

## 6. Summary — how to answer scenario questions

- **Diagnose out loud**: reproduce, isolate, explain, fix, prevent. Naming the process is most of the score.
- **Two causes are almost always the answer for rendering bugs**: a new identity (a new object/array/function/component type) and a stale closure. Say which one you suspect and how you would confirm it.
- **Root-cause over symptom-fix.** "Remove the dependency from the array" silences the warning; "the object is recreated each render, so I would memoise it or pass primitives" fixes the bug.
- **Security scenarios go to the server.** Client-side guards, hidden buttons and cached data are UX; authorization is an API responsibility.
- **Measure performance claims.** Name the tool (Profiler, bundle visualiser, traces), the metric (mount time, re-render count, chunk size), and the before/after — as this book's Part 17 lab does, with the caveat that the numbers are development-build and machine-specific.
- **Finish with prevention**: the test you would add, the lint rule or type you would introduce, the checklist item in the PR template. That is what turns a fix into engineering.

---

**What's next →** the reference material: [`../cheatsheets/react-cheatsheet.md`](../cheatsheets/react-cheatsheet.md) starts the ten one-page references, and [`../common-errors.md`](../common-errors.md) is the error-decoding companion (message → meaning → cause → debug → fix → correct code) for the mistakes you will meet on your first day on a real React codebase.
