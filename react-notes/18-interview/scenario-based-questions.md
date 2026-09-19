# Scenario Questions: "Why Is My Component Doing This?"

> **Part 18 · Interview Preparation · File 4 of 4**

Why this file exists: this is the round that decides senior offers. Not "what is `useEffect`"
but *"the input loses focus after every keystroke — what is happening?"* These questions test
whether you have a **causal model** of React, because the answer is almost never the symptom.
Every scenario below is structured the way you should answer it: **symptom → mechanism →
diagnosis → fix → how you would prevent it.**

Practise by reading only the symptom and saying the rest out loud.

---

## 1. "My component renders twice on every change"

**Mechanism.** In development, `StrictMode` deliberately double-invokes render functions, state
initialisers and effects (mount → unmount → mount) to surface impure renders and missing
cleanup. It does not happen in production builds.

**Diagnosis.** Check `main.tsx` for `<StrictMode>`. Then check whether the *double* is dev-only:
`npm run build && npm run preview` and count again.

**Fix.** Usually nothing — it is a feature. If the second render reveals a real problem (a
duplicated API call, a doubled subscription), fix *that*: add the cleanup, make the effect
idempotent.

```tsx
// ❌ Double subscription in StrictMode, because there is no cleanup
useEffect(() => { socket.on('message', handler); }, []);

// ✅ The second mount is harmless now
useEffect(() => {
  socket.on('message', handler);
  return () => socket.off('message', handler);
}, []);
```

**Prevent it.** Keep `StrictMode` on. It is finding bugs in development that would otherwise
appear in production as doubled network traffic.

⚠️ **Removing `StrictMode` to "fix" it is the wrong answer**, and saying so out loud is worth
points.

---

## 2. "My input loses focus after every keystroke"

**Mechanism.** The component is being **unmounted and remounted**, which destroys its DOM node
and its state. React decides identity from the element's *type and position* in the tree, plus
its `key`.

**Diagnosis.** Three usual causes, in order of frequency:

```tsx
// ❌ 1. A component defined INSIDE another component's body
function Page() {
  function Field() { return <input />; }     // a NEW function identity every render
  return <Field />;                          // → React sees a different type → remount
}

// ✅ Hoist it, or inline the JSX
function Field() { return <input />; }
function Page() { return <Field />; }

// ❌ 2. A key that changes
<TaskItem key={`${task.title}-${index}`} />  // editing the title changes the key → remount

// ✅ A stable identity
<TaskItem key={task.id} />

// ❌ 3. Alternating element types
{editing ? <input /> : <span />}             // fine — but wrapping one of them in a fragment
                                             // or a div in only one branch changes the position
```

**Fix.** Give the component a stable identity: define it at module scope, use a stable key, and
keep the tree shape consistent.

**Prevent it.** Never define a component inside another component. It also re-creates every
callback and defeats memoisation, so it costs you twice.

---

## 3. "My state resets for no reason"

**Mechanism.** Same root cause as #2 — a remount destroys state. If it is *not* a remount, the
state is being overwritten by an effect that runs when you did not expect.

**Diagnosis.** Put a `console.log` in the component body and in the effect. A mount log means
remount (see #2). Otherwise, find the effect that writes that state:

```tsx
// ❌ The classic: an effect that resets state whenever a prop changes
useEffect(() => { setForm({ title: task.title }); }, [task]);
// If `task` is a new object every render (e.g. from an unmemoised selector or an inline
// object literal), the form is wiped on every render — the user cannot type.

// ✅ Depend on the primitive that actually matters
useEffect(() => { setForm({ title: task.title }); }, [task.id]);

// ✅ Or better: derive it, or key the form to the record
<TaskForm key={task.id} defaultValues={{ title: task.title }} />
```

**Fix.** Depend on primitives (`task.id`, not `task`), or make the component's identity carry
the reset (`key={task.id}`) so the "reset" is explicit rather than accidental.

**Prevent it.** Ask "should this value be state at all?" If it can be derived from props, do
not store it. The `key` trick is the idiomatic React way to say "start fresh for this record".

---

## 4. "My `useEffect` runs in an infinite loop"

**Mechanism.** The effect updates state that is in its own dependency array, so it re-runs,
updates, re-runs. The usual trigger is a **new object or array reference every render**.

```tsx
// ❌ `options` is a new object every render → the effect's deps are never equal → loop
const options = { id: 1 };
useEffect(() => { fetch(options.id).then(setData); }, [options]);

// ❌ A function defined in the body, in the deps
const load = () => fetch(id);
useEffect(() => { load(); }, [load]);

// ❌ Setting state unconditionally
useEffect(() => { setItems(items.filter(Boolean)); }, [items]);
```

**Fixes, in order of preference:**

```tsx
// 1. Depend on primitives
useEffect(() => { fetch(id).then(setData); }, [id]);

// 2. Stabilise the object or function
const options = useMemo(() => ({ id }), [id]);
const load = useCallback(() => fetch(id), [id]);

// 3. Guard the update so it only happens when something actually changed
useEffect(() => {
  const next = items.filter(Boolean);
  if (next.length !== items.length) setItems(next);
}, [items]);

// 4. Move it out of an effect entirely — it belongs in an event handler
```

**Prevent it.** Enable `exhaustive-deps` (it tells you the truth about your dependencies) and
treat any effect whose deps include an object literal as a smell.

---

## 5. "The data shown is from the previous search"

**Mechanism.** A **race condition**: two requests in flight, and the slower one resolves last,
overwriting the newer result. Nothing to do with React's rendering — it is asynchronous ordering.

**Diagnosis.** Type "Berlin", then quickly "Paris". Watch the Network tab: the Berlin response
arrives after the Paris one.

```tsx
// ✅ Fix 1: cancel the superseded request
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: controller.signal })
    .then((r) => r.json())
    .then(setResults)
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;  // ours, not an error
      setError(error);
    });
  return () => controller.abort();
}, [query]);

// ✅ Fix 2 (no cancellation): ignore stale responses
useEffect(() => {
  let current = true;
  fetch(url).then((r) => r.json()).then((data) => { if (current) setResults(data); });
  return () => { current = false; };
}, [query]);

// ✅ Fix 3: use a data library — TanStack Query keys the cache by query, so a
//    superseded response cannot overwrite a newer one
useQuery({ queryKey: ['places', query], queryFn: () => searchPlaces(query) });
```

**Prevent it.** Debounce to *reduce* the number of requests, but never as the fix — a user can
press Enter twice. Cancellation is the correctness mechanism.

---

## 6. "The list shows the wrong item after I delete a row"

**Mechanism.** Index-based keys. React matches children positionally, so deleting index 0 makes
it reuse the DOM node that belonged to index 1 — carrying that node's input value, focus and
component state onto different data.

**Diagnosis.** Delete the first of three rows while the second is being edited. If the editing
state survives on the wrong row, you have index keys.

```tsx
// ❌
{todos.map((todo, index) => <TodoItem key={index} todo={todo} />)}

// ✅
{todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)}
```

**Prevent it.** Keys come from the data. If your data has no id, generate one when the item is
created (`crypto.randomUUID()`) — never at render time, or it changes every render and defeats
the purpose.

---

## 7. "My checkbox updates in the DOM but not in state" (or vice versa)

**Mechanism.** A checkbox is controlled by `checked`, not `value`. And a controlled input
*requires* `onChange`, or React renders it read-only.

```tsx
// ❌ value does nothing for a checkbox — the box reflects DOM state, not yours
<input type="checkbox" value={todo.done} onChange={handleToggle} />

// ✅
<input type="checkbox" checked={todo.done} onChange={handleToggle} />

// ❌ "A component is changing an uncontrolled input to be controlled"
<input value={user.name} onChange={…} />          // name is undefined on the first render

// ✅
<input value={user.name ?? ''} onChange={…} />
```

**Prevent it.** Type the model so the value cannot be `undefined` (`name: string`, not
`name?: string`), and use `checked` for checkboxes and radios.

---

## 8. "Clicking the button twice creates two records"

**Mechanism.** The handler is async, the button stays enabled, and nothing deduplicates the
request.

```tsx
// ✅ Disable while pending
const create = useCreateTask();
<button onClick={() => create.mutate(values)} disabled={create.isPending}>
  {create.isPending ? 'Saving…' : 'Save'}
</button>

// ✅ Without a data library
const [pending, setPending] = useState(false);
async function onSubmit() {
  if (pending) return;
  setPending(true);
  try { await api.create(values); } finally { setPending(false); }
}
```

**The senior addition:** a client-side guard is not enough, because a **retried network request**
can also double-create. Make the server idempotent — accept a client-generated idempotency key
and reject duplicates. Say that and the answer is complete.

---

## 9. "It works in development but breaks in production"

**Mechanism.** They are **different programs**. Dev serves unbundled ESM through esbuild with no
minification and `.env.development`; production is a Rollup bundle, minified, tree-shaken, with
`.env.production`.

**Diagnosis, in order:**

```bash
npm run build && npm run preview       # 1. Reproduce locally against the REAL build
# 2. Check the console in preview — the minified error is usually enough
# 3. Build with sourcemaps to read the original stack
```

**The usual suspects:**

| Cause | Signature |
| --- | --- |
| Missing env var | `undefined/users` requests; `Cannot read properties of undefined` |
| Wrong `base` | Blank page, 404s on `/assets/*` |
| Minification-sensitive code | Anything relying on `fn.name`, property order, or `switch` on a constructor name |
| A dependency that behaves differently bundled | "does not provide an export named X" |
| `process.env` in client code | `process is not defined` |
| Long-cached `index.html` | Blank until hard refresh, only for returning users |

**Prevent it.** `npm run preview` is part of the deploy checklist, and CI builds the exact
artefact that ships.

---

## 10. "The app is slow — where do I start?"

**Mechanism.** "Slow" is two different problems. Decide which before touching code.

**Diagnosis.**

```text
Slow to LOAD  (LCP)  → it is a payload and network problem
                       npm run build; visualizer; are routes lazy? are images optimised?
Slow to RESPOND (INP) → it is a main-thread problem
                       React Profiler: which component, how often, how long?
Jumpy layout (CLS)   → images without dimensions, font swaps, late-injected banners
```

**The answer that shows seniority:** "I would measure before changing anything, and I would look
at bundle size before memoisation — most slow React apps are slow because they ship too much
JavaScript, not because a component re-renders. Then I would check the field data, because my
laptop is not the user's phone."

**Prevent it.** Budgets in CI (`size-limit`, Lighthouse CI) and `web-vitals` reporting, so a
regression fails a build instead of reaching users.

---

## 11. "My context update re-renders the entire app"

**Mechanism.** Every consumer of a context re-renders when the context **value's identity**
changes. A provider that creates a new object literal on every render changes identity on every
render.

```tsx
// ❌ New object every render → every consumer re-renders, every time
<AuthContext.Provider value={{ user, login, logout }}>

// ✅ Stable identity
const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
<AuthContext.Provider value={value}>

// ✅ And the callbacks must be stable too
const login = useCallback(async (c) => { … }, []);
```

**The deeper fix.** Split the context: a rarely-changing **state** context and a stable
**actions** context, so components that only dispatch do not re-render when the state changes.
Or move frequently-read values into a store with selector-based subscriptions (Zustand, Redux),
which re-renders only the components that read the slice that changed.

**Prevent it.** Context is for cross-cutting, slowly-changing values (theme, auth, locale). It
is not a general-purpose state manager.

---

## 12. "A user's session expires and the app silently breaks"

**Mechanism.** The client keeps using an expired token; the API returns 401; nothing handles it,
so every request fails and the user sees a broken app with no explanation.

```ts
// ✅ One place handles it: the HTTP client
if (response.status === 401) {
  refreshing ??= refreshSession().finally(() => { refreshing = null; });  // dedupe!
  try { await refreshing; return await retry(request); }
  catch {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent('auth:expired'));   // the provider logs out + redirects
    throw new ApiError('auth', 'Your session has ended. Please sign in again.', 401);
  }
}
```

**Three details that make it correct:** refresh **once** (a loop will take your API down);
**dedupe** concurrent refreshes (ten parallel 401s must not fire ten refreshes, especially with
rotating refresh tokens); and **tell the user** — a redirect to login with `returnTo`, not a
blank screen.

**Prevent it.** Proactive refresh shortly before `expiresAt` as an *optimisation*, with the 401
path always present, because clocks drift and tokens get revoked.

---

## 13. "Blank page after deploy, fixed by a hard refresh"

**Mechanism.** `index.html` is cached, so the browser requests chunk filenames from the previous
build. Those files no longer exist, the module fails to load, and React never mounts.

**Fix.** Cache headers: `index.html` → `no-cache`; `/assets/*` (content-hashed) →
`public, max-age=31536000, immutable`.

```text
/index.html            Cache-Control: no-cache
/assets/index-a1b2.js  Cache-Control: public, max-age=31536000, immutable
```

**The follow-up worth mentioning:** even with correct headers, a user with the tab open during a
deploy can hit it. Handle the dynamic-import failure — catch the chunk-load error, show "A new
version is available", and reload once.

---

## 14. "Refresh on a deep link gives 404"

**Mechanism.** An SPA has no file at `/tasks/42`. The host looks for `dist/tasks/42/index.html`,
finds nothing, and returns 404. In-app navigation works because React Router handles it in the
browser.

**Fix.** A rewrite rule that sends unknown paths to `index.html` (Netlify `[[redirects]]`,
Vercel `rewrites`, nginx `try_files $uri $uri/ /index.html`), while still serving real files —
otherwise your JavaScript 404s come back as HTML and you get
`Failed to load module script: Expected a JavaScript module but the server responded with a MIME
type of "text/html"`.

**Prevent it.** Test deep links and hard refresh against `npx serve -s dist` locally, and put it
in the deploy checklist.

---

## 15. "My test passes locally and fails in CI" (or the reverse)

**Mechanism.** Almost always one of: shared state between tests, an un-awaited async assertion,
a dependency on execution order, a timezone/locale difference, or a mocked module that leaks.

```tsx
// ❌ Asserting before React has committed
await user.click(button);
expect(screen.getByText('Saved')).toBeInTheDocument();     // may not be there yet

// ✅ findBy* waits (it is `waitFor` + `getBy`)
expect(await screen.findByText('Saved')).toBeInTheDocument();
```

**Fixes that work:** `cleanup()` after each test (RTL does this automatically with `globals`),
a **fresh** `QueryClient` per test (`gcTime: 0, retry: false` — otherwise retries outlive the
test), `server.resetHandlers()` in `afterEach`, `onUnhandledRequest: 'error'` so a forgotten
mock fails loudly instead of hitting the network, and `vi.useFakeTimers()` restored in
`afterEach`.

**Prevent it.** Tests must be independent and deterministic. If a test needs the previous test's
state, it is one test, not two.

---

## 16. A method for any scenario question you have not seen

1. **Restate the symptom precisely.** "The input loses focus after every keystroke" — not "the
   form is broken".
2. **Name the mechanism you suspect and why.** "That means a remount, because focus is DOM state
   and only a remount destroys it."
3. **Say how you would confirm it.** "I would log in the component body and check whether the
   mount runs again, and I would look at the key and the element type."
4. **Give the fix, and the trade-off if there is one.**
5. **Say how you would prevent it** — a lint rule, a test, a checklist item.

Interviewers score the *method* as much as the answer, because the method is what they get on a
Monday morning when the symptom is one they have not seen either.

---

**That completes Part 18 — and these notes.** Go back to
[`../README.md`](../README.md) for the full table of contents, or to
[`../react-roadmap.md`](../react-roadmap.md) if you want to plan the next thing you build.
The revision order that works: build something with the notes closed, then re-read the parts you
could not reproduce from memory.
