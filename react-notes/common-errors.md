# Common Errors — Decoded, Debugged, Fixed

> **Reference · Every common error, with the fix and the correct code**

How to use this file: find your message (they are grouped and alphabetised within groups), read **what it means** and **why it happens**, then apply the **fix**. The **debug** line tells you how to confirm the diagnosis — do not skip it; guessing is how a five-minute fix becomes an afternoon.

**The universal debugging loop**

```text
1. Read the whole message. The first line names the problem; the last lines name the location.
2. Find the frame in YOUR code (not node_modules, not react-dom).
3. Open that file and line. Ask: what value is actually here?
4. Form one hypothesis, then test it (console.log, a breakpoint, a smaller repro).
5. Fix the cause, then add the test that would have caught it.
```

Sections: [JavaScript runtime](#1-javascript-runtime) · [React](#2-react) · [Hooks](#3-hooks) · [TypeScript](#4-typescript) · [Build, Vite & package managers](#5-build-vite--package-managers) · [Network, API & CORS](#6-network-api--cors) · [Routing](#7-routing) · [Testing](#8-testing) · [Accessibility & forms](#9-accessibility--forms) · [Performance symptoms](#10-performance-symptoms)

---

## 1. JavaScript runtime

### 1.1 `Cannot read properties of undefined (reading 'x')`

**Meaning:** something you expected to be an object was `undefined` (or `null`).
**Why:** data has not loaded yet, a property name is misspelled, an array lookup returned nothing, or a value came from an API that does not include that field.
**Debug:** put a `console.log` immediately before the offending line and print the whole object, not just the property. Add a breakpoint and inspect the call stack to see who passed the value.
**Fix:** guard the access, or make the missing case impossible by construction.

```tsx
// ❌ crashes when data is undefined (first render, or a 404)
return <p>{data.user.name}</p>;

// ✅ optional chaining + a default
return <p>{data?.user?.name ?? 'Unknown'}</p>;

// ✅ better: make the state explicit so there is no "undefined phase"
if (state.status === 'loading') return <p role="status">Loading…</p>;
if (state.status === 'error') return <p role="alert">{state.message}</p>;
return <p>{state.data.user.name}</p>;
```

```ts
// Arrays are the same problem: find() returns undefined
const task = tasks.find((t) => t.id === id);
if (task === undefined) return <p role="alert">Task not found</p>;
```

### 1.2 `x is not a function`

**Meaning:** you called something that is not callable — usually `undefined`, a string, or the wrong export.
**Why:** a wrong import (`import { thing }` vs `export default`), a typo, calling a value that is still loading, or `Array.prototype.map` on a non-array.
**Debug:** `console.log(typeof thing, thing)` before the call; check the import path and whether the module exports a default.
**Fix:**

```tsx
// ❌ default export imported as named → undefined
import { formatDate } from './utils';

// ✅ match the export shape
import formatDate from './utils';          // if it is `export default formatDate`
import { formatDate } from './utils';      // if it is `export function formatDate`

// ❌ data is not an array yet
data.map(…)
// ✅
Array.isArray(data) ? data.map(…) : null
```

### 1.3 `Objects are not valid as a React child (found: object with keys {…})`

**Meaning:** you put a plain object into JSX.
**Why:** rendering a whole object instead of a field; a `Date`; a `Map`/`Set`; an API error object.
**Debug:** the message names the keys — search for that object in the JSX.
**Fix:**

```tsx
// ❌
<p>{user}</p>
// ✅
<p>{user.name}</p>
<p>{new Date(user.createdAt).toLocaleDateString()}</p>
<pre>{JSON.stringify(user, null, 2)}</pre>       {/* debugging only */}
```

### 1.4 `NaN` in the UI, or `₹NaN` in a total

**Meaning:** arithmetic on something that is not a number.
**Why:** an input's `value` is a **string**; `Number('')` is `0` but `Number('abc')` is `NaN`; an API field is missing.
**Fix:**

```tsx
const [points, setPoints] = useState(1);          // keep numbers as numbers

<input
  type="number"
  value={points}
  onChange={(e) => {
    const next = Number(e.target.value);
    setPoints(Number.isFinite(next) ? next : 0);
  }}
/>

// Totals: guard the array and the fields
const total = items.reduce((sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0), 0);
```

### 1.5 `Maximum call stack size exceeded`

**Meaning:** infinite recursion.
**Why:** a function calling itself without a base case, a getter/setter loop, or (in React) an effect/handler that triggers itself.
**Debug:** the stack trace shows the repeating function — that is your loop.
**Fix:** add the terminating condition; in React, see §2.5 (render loops) and §3.2 (effect loops).

### 1.6 `Uncaught (in promise) TypeError: Failed to fetch`

**Meaning:** the request never completed — the server is down, the URL is wrong, DNS failed, or CORS blocked it (see §6).
**Debug:** open the Network tab: is the request red/cancelled or absent? Check the URL, port and the response headers.
**Fix:** correct the URL/base, start the backend, or fix CORS *on the server*. Handle it in code so the UI does not hang:

```tsx
try {
  const report = await fetchWeather(city, signal);
  setState({ status: 'success', report });
} catch (cause) {
  if (signal?.aborted) return;                    // an intentional cancellation is not an error
  setState({ status: 'error', message: 'We could not reach the weather service.', retryable: true });
}
```

---

## 2. React

### 2.1 `Warning: Each child in a list should have a unique "key" prop`

**Meaning:** a list rendered without a `key` (or with duplicates).
**Why:** `map` without `key`, `key={index}` in a reorderable list, or duplicate ids in the data.
**Fix:**

```tsx
{tasks.map((task) => <TaskRow key={task.id} task={task} />)}          // ✅ stable, unique, from data
```

Use the index only for static lists that never reorder or filter. A `key` is not a prop — pass the value you need separately.

### 2.2 `Warning: React does not recognize the X prop on a DOM element`

**Meaning:** a non-HTML attribute was passed to a DOM tag.
**Why:** a typo in an attribute name (`class` instead of `className`, `tabindex`), or a camelCase custom prop leaking into a DOM element.
**Fix:**

```tsx
<label htmlFor="email" className="field" tabIndex={-1} />
// custom components may take anything; DOM elements take DOM attributes only
```

If a library needs a data attribute, use `data-*` (`data-testid="row"`).

### 2.3 `Cannot update a component (X) while rendering a different component (Y)`

**Meaning:** you called a state setter during another component's render.
**Why:** setting state in the render body; calling a parent's setter from a child's render; a `useMemo`/selector with a side effect.
**Fix:** move the update into an event handler or an effect, or derive the value instead of storing it.

```tsx
// ❌
function List({ items }: { items: Item[] }) {
  const [count, setCount] = useState(0);
  setCount(items.length);                       // during render
  return <p>{count}</p>;
}

// ✅ derived — no state at all
function List({ items }: { items: Item[] }) {
  return <p>{items.length}</p>;
}
```

### 2.4 `Too many re-renders. React limits the number of renders to prevent an infinite loop.`

**Meaning:** a state update during render created an endless loop.
**Why:** `onClick={handler()}` instead of `onClick={handler}`; `setState` in the component body; a condition that always sets state.
**Fix:**

```tsx
// ❌ calls the function during render
<button onClick={save()}>Save</button>
// ✅ passes the function
<button onClick={save}>Save</button>
<button onClick={() => save(id)}>Save</button>
```

### 2.5 `Maximum update depth exceeded` (with an effect in the stack)

**Meaning:** an effect sets state, which changes a dependency, which re-runs the effect.
**Why:** an object/array/function recreated each render in the dependency array; an effect that sets the value it depends on.
**Debug:** log the dependency values on every render — you will see new identities.
**Fix:** depend on primitives, memoise the value, or move the work out of the effect.

```tsx
// ❌ new object every render → effect runs forever
const filters = { status, page };
useEffect(() => { void load(filters).then(setRows); }, [filters]);

// ✅ primitives
useEffect(() => { void load({ status, page }).then(setRows); }, [status, page]);
```

### 2.6 `Rendered more hooks than during the previous render` / `Rendered fewer hooks than expected`

**Meaning:** the number or order of hook calls changed between renders.
**Why:** a hook inside an `if`, a loop, a `try`, or after an early `return`.
**Fix:**

```tsx
// ❌ the early return skips the second hook on some renders
function Profile({ user }: { user: User | null }) {
  if (user === null) return <p>No user</p>;
  const [name, setName] = useState('');
  …
}

// ✅ all hooks first, early returns after
function Profile({ user }: { user: User | null }) {
  const [name, setName] = useState('');
  if (user === null) return <p>No user</p>;
  return <input value={name} onChange={(e) => setName(e.target.value)} />;
}
```

### 2.7 `Invalid hook call. Hooks can only be called inside of the body of a function component.`

**Meaning:** a hook ran outside a component/hook, or React is duplicated.
**Why:** calling a hook in a plain function, in a class, or in a callback; **two copies of React** in the bundle (a linked library with its own `react`); mismatched `react`/`react-dom` versions.
**Debug:** `npm ls react react-dom` — two versions is the classic cause; check any component library you linked locally.
**Fix:** move the hook into a component/custom hook; dedupe React (`npm dedupe`, or `resolutions`/`overrides` in `package.json`); for a local library, alias `react` to the app's copy.

### 2.8 `Warning: An update to X inside a test was not wrapped in act(...)`

**Meaning:** state changed after the test's assertions finished (see §8.5).

### 2.9 `Each child in a list should have a unique "key"` with duplicate keys

**Meaning:** two items share an id (often `undefined` for both).
**Why:** keying on a field that is missing for some items, or a data set with duplicated ids.
**Fix:** key on a guaranteed unique field; if the data can duplicate, make the key composite (`${id}-${index}`).

### 2.10 `Cannot use JSX unless the '--jsx' flag is provided` (TS17004)

**Meaning:** a `.tsx` file compiled without JSX support (see §4.5).

---

## 3. Hooks

### 3.1 `React Hook useEffect has a missing dependency: 'x'`

**Meaning:** the effect reads a reactive value that is not in its dependency array → a **stale value** bug.
**Why:** reading state/props inside the effect (or a function defined in render) without listing it.
**Debug:** follow the value into the effect and ask “can this change while the component is mounted?”
**Fix:** list it; if the list churns, stabilise the value (`useCallback`/`useMemo`, hoist it, or read it from a ref instead).

```tsx
// ❌ stale `roomId` after a navigation
useEffect(() => { connect(roomId); }, []);

// ✅
useEffect(() => {
  const socket = connect(roomId);
  return () => socket.close();
}, [roomId]);
```

Do **not** silence the rule with `// eslint-disable-next-line` unless you can explain why the value can never change.

### 3.2 `The final argument passed to useEffect changed size between renders`

**Meaning:** the dependency array's length changed between renders.
**Why:** a conditional array (`deps={[a, ...(b ? [b] : [])]}`) or a lint fix applied inside a branch.
**Fix:** keep the array a fixed length — include all dependencies, always.

### 3.3 `useRef requires an initial argument` (React 19)

**Meaning:** `useRef<T>()` with no argument.
**Fix:** `const ref = useRef<HTMLInputElement | null>(null);`

### 3.4 `Cannot read properties of null (reading 'current')` / ref is always null

**Meaning:** you read `ref.current` before the element mounted, or you attached the ref to a child component that ignores it.
**Why:** reading during render; conditional rendering of the element; a function component that does not forward `ref` (React < 19) — in React 19 `ref` is a normal prop, so a component must still pass it to a DOM element.
**Fix:** read refs in effects/handlers, not in render; render the element unconditionally; forward the ref.

```tsx
const inputRef = useRef<HTMLInputElement | null>(null);

useEffect(() => { inputRef.current?.focus(); }, []);       // after mount
return <input ref={inputRef} />;
```

### 3.5 `Can't perform a React state update on an unmounted component` (legacy warning)

**Meaning:** an async callback set state after the component disappeared.
**Why:** a fetch/timer without cleanup. (React 18+ no longer warns, but the leak and the race remain.)
**Fix:** cancel in the cleanup:

```tsx
useEffect(() => {
  const controller = new AbortController();
  void load(controller.signal).then((data) => { if (!controller.signal.aborted) setData(data); });
  return () => controller.abort();
}, []);
```

### 3.6 `Warning: Cannot update a component while rendering a different component` (from a hook)

**Meaning:** a custom hook sets state during render (or a `useMemo` has a side effect).
**Fix:** move the update into an effect or an event; make `useMemo` pure.

### 3.7 Effect runs twice in development

**Meaning:** `<StrictMode>` intentionally double-invokes effects to expose missing cleanups.
**Fix:** none — if your effect cannot survive being run twice, it is a bug (see §3.5). Do not “fix” it by removing StrictMode.

---

## 4. TypeScript

| Error | Meaning | Fix |
| --- | --- | --- |
| `TS2322: Type 'X' is not assignable to type 'Y'` | a value of the wrong type reached a typed slot | adapt the value (`Number()`/`String()`/`??`), or correct the type |
| `TS2339: Property 'x' does not exist on type 'Y'` | typo, wrong type, or a union you have not narrowed | narrow first, or fix the model/type |
| `TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'` | a callback/shape mismatch | make the callback match the expected signature |
| `TS7006: Parameter 'x' implicitly has an 'any' type` | untyped callback parameter with `noImplicitAny` | write the handler inline, or annotate it |
| `TS7053: Element implicitly has an 'any' type because expression of type 'string' can't index` | indexing with an arbitrary string | `Record<K, V>`, `keyof`, or narrow the key |
| `TS18048 / TS2532: 'x' is possibly 'undefined'` | `strictNullChecks` doing its job | `?.`, `??`, early return, or narrow |
| `TS2554: Expected N arguments, but got M` | signature changed (React 19 `useRef`) | pass the argument |
| `TS2786: 'X' cannot be used as a JSX component` | an `async` component or a wrong return type | components return elements, not promises |
| `TS6133: 'x' is declared but its value is never read` | unused import/variable (fails `tsc -b`) | delete it (or prefix with `_` where configured) |
| `TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled` | `enum`, `namespace`, or a constructor parameter property | union of literals, plain object, explicit field |
| `TS5101: Option 'baseUrl' is deprecated` | an old tsconfig with a new TypeScript | use `paths` without `baseUrl` |
| `TS17004: Cannot use JSX unless the '--jsx' flag is provided` | `.tsx` without JSX config | `"jsx": "react-jsx"` in `tsconfig.json` |
| `TS17008: JSX element 'X' has no corresponding closing tag` | mismatched tag | fix the markup; the caret points at the opening tag |
| `TS17001: JSX elements cannot have multiple attributes with the same name` | duplicated prop | remove one |
| `TS1005: '…' expected` | syntax error, often a stray `>` or a missing `)` in JSX | look one line above the caret |

### 4.1 `Property 'value' does not exist on type 'EventTarget'`

**Meaning:** the event was typed generically.
**Why:** `(e) => e.target.value` with `e` annotated as `Event`, or the handler extracted without a type.
**Fix:**

```tsx
const handleChange = (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value);
// or let inference do it:
<input onChange={(e) => setQuery(e.target.value)} />
```

### 4.2 `Type 'string' is not assignable to type 'number'`

**Meaning:** a form value (always a string) flowed into numeric state.
**Fix:** convert at the boundary and validate: `const next = Number(value); if (Number.isFinite(next)) setPoints(next);`

### 4.3 `Object is possibly 'null'` on `useRef`

**Fix:** `const el = useRef<HTMLDivElement | null>(null);` then `el.current?.scrollIntoView()`.

### 4.4 `Type 'Promise<Element>' is not a valid JSX element` (async component)

**Meaning:** an `async function` component returns a promise.
**Fix:** return JSX; do the awaiting in an action/effect/loader, or use `use(promise)` inside a Suspense boundary.

### 4.5 `Cannot find module './X' or its corresponding type declarations`

**Why:** wrong path or casing (Linux is case-sensitive), a missing file extension in an ESM path, or a missing alias in *either* tsconfig or the bundler.
**Fix:** check the path and the file's actual name; add the alias in both places:

```jsonc
// tsconfig.json
"paths": { "@/*": ["./src/*"] }
```
```ts
// vite.config.ts
resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } }
```

---

## 5. Build, Vite & package managers

### 5.1 `Port 5173 is already in use`

**Why:** a previous dev server (or another process) holds the port.
**Fix:** `pkill -f vite`, or use an explicit port: `vite --port 5199 --strictPort`. In this book's lab the message appeared because a leftover server from an earlier run was still listening — always check with `ss -ltnp | grep 5199`.

### 5.2 `Module not found: Can't resolve 'X'`

**Why:** the package is not installed, is a dev-only dependency used at runtime, has a wrong case, or needs an extension.
**Fix:** `npm i X` (or `npm i -D X`), verify `node_modules/X` exists, and check the import path.

### 5.3 `process is not defined` (in the browser)

**Why:** Node globals do not exist in the browser.
**Fix:** use `import.meta.env.VITE_…`, or inject a constant with `define`:

```ts
// vite.config.ts
define: { __APP_VERSION__: JSON.stringify('1.4.2') }
```

### 5.4 Environment variable is `undefined` in the app

**Why:** missing `VITE_` prefix, the wrong `.env` file for the current mode, or `import.meta.env` destructured at module scope before validation.
**Debug:** `console.log(import.meta.env)` during a dev run; check which `.env.[mode]` files exist.
**Fix:** prefix with `VITE_`, place it in the right file, restart the dev server (env changes are not hot-reloaded), and validate at startup. **Anything with `VITE_` is public — never a secret.**

### 5.5 `vite build` succeeds but the app crashes in production

**Why:** Vite does not type-check, and production builds differ (no dev warnings, minification, env values baked at build time).
**Fix:** always run `tsc -b` before/with the build (`"build": "tsc -b && vite build"`) and test the built output with `npm run preview`.

### 5.6 `Something went wrong` / a blank white page after deploying

**Why:** the app is served from a sub-path but built for `/`, or the HTML references assets that were not uploaded.
**Fix:** set `base: '/my-app/'` (or the correct root), and deploy the whole `dist/` directory.

### 5.7 `Uncaught SyntaxError: Unexpected token '<'` in the browser

**Why:** the server returned `index.html` (HTML) where JavaScript was expected — usually a wrong asset path (a 404 rewritten to the SPA fallback).
**Fix:** correct the `base`/asset path, and exclude `/assets/*` from the SPA rewrite.

### 5.8 `ERR_OSSL_EVP_UNSUPPORTED` / OpenSSL errors in an old toolchain

**Why:** an old bundler against a newer Node's OpenSSL.
**Fix:** upgrade the bundler (Vite 8 has no such problem) rather than setting legacy OpenSSL flags.

### 5.9 `ERESOLVE unable to resolve dependency tree`

**Why:** peer-dependency conflicts (often React 19 with a library that still declares React 18).
**Fix:** find a version that supports React 19; check with `npm info <pkg> peerDependencies`. `--legacy-peer-deps` is a last resort and should be documented, not habitual.

### 5.10 `Hydration failed because the initial UI does not match what was rendered on the server`

**Why:** the first client render differs from the server HTML — usually a value read during render that only exists in the browser (`Date.now()`, `Math.random()`, `localStorage`, `window.innerWidth`).
**Fix:** compute those values in an effect, or pass them from the server:

```tsx
// ❌ differs between server and client
<p>Generated {new Date().toLocaleTimeString()}</p>

// ✅ render a stable value
<p>Generated {new Date(iso).toLocaleTimeString()}</p>
```

---

## 6. Network, API & CORS

### 6.1 `Access to fetch at '…' from origin '…' has been blocked by CORS policy`

**Meaning:** the browser refused to hand your code a response because the server did not authorise your origin.
**Why (in development):** you called an absolute URL to a backend on another port. **Why (in production):** the API's CORS configuration does not list your origin.
**Debug:** the Network tab shows the request; the console names the missing header. `curl -i` the URL and look for `Access-Control-Allow-Origin`.
**Fix:** in development, use a **proxy** so the browser sees a same-origin request; in production, configure CORS on the server (an allow-list of origins, not `*` when credentials are involved). **CORS is a browser protection, not server security** — it does not stop `curl`.

```ts
// vite.config.ts — the request goes to /api on the same origin, and Vite forwards it
server: { proxy: { '/api': { target: 'http://localhost:8098', changeOrigin: true } } }
```

```tsx
// the app then uses a relative URL everywhere
fetch(`/api/tasks/${id}`);
```

### 6.2 404 on a call the backend says exists

**Why:** a wrong base URL, a duplicated prefix (`/api/api/tasks`), a trailing slash, or a proxy that does not rewrite the path.
**Debug:** print the exact URL (`console.log(url)`) and compare it with the Network tab.

### 6.3 `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

**Meaning:** `response.json()` parsed HTML — the request hit the SPA fallback or an HTML error page.
**Why:** a wrong URL/port, or a 404 HTML page returned by the host.
**Fix:** check the URL and status; the 204/empty-body variant throws a different but related error:

```ts
if (response.status === 204) return undefined as T;              // DELETE has no body
if (!response.ok) throw new ApiError(`Failed with ${response.status}`, response.status);
return (await response.json()) as T;
```

### 6.4 `TypeError: Failed to fetch` in tests, but the app works

**Why:** the test environment's base URL does not match the request handlers (the book's lab hit exactly this: `VITE_API_URL=http://localhost:3001/api` while MSW matched `/api/...`).
**Fix:** make both relative (`/api`), so app and handlers agree. Check with `server.listen({ onUnhandledRequest: 'error' })` — it fails loudly instead of pretending.

### 6.5 Requests fire twice (or four times)

**Why:** StrictMode double-invokes effects in development; several components fetch the same data; an unstable dependency; a state change that re-triggers the effect.
**Fix:** production renders once; for the rest, deduplicate with a query cache keyed by resource, and stabilise dependencies.

### 6.6 A stale response overwrites a newer one

**Meaning:** a race. **Fix:** cancel the previous request and ignore aborted results (see Part 17, file 03):

```tsx
controllerRef.current?.abort();
const controller = new AbortController();
controllerRef.current = controller;
const result = await api.search(query, controller.signal);
if (controller.signal.aborted) return;               // a newer search won
setResult(result);
```

### 6.7 `401 Unauthorized` after the token expires

**Fix:** refresh once and retry, then sign out and explain:

```ts
if (response.status === 401 && session?.refreshToken !== undefined) {
  const refreshed = await refreshSession(session.refreshToken);
  if (refreshed === null) { logout(); throw new Error('Session expired'); }
  return requestWith(refreshed.token, path, init);      // retry once, with a guard against loops
}
```

---

## 7. Routing

### 7.1 404 when refreshing a deep URL

**Why:** the static host has no SPA fallback, so `/tasks/42` is looked up as a file.
**Fix:** rewrite unknown paths to `index.html` (`try_files $uri /index.html;` in nginx, a `_redirects` file on Netlify, `rewrites` on Vercel). The book measured this exact 404 on a plain static server.

### 7.2 `useNavigate() may be used only in the context of a <Router> component`

**Why:** the component is rendered outside the router (a test that forgot `createMemoryRouter`, or a portal outside the provider).
**Fix:** wrap it in `RouterProvider` (app) or inject a memory router (tests).

### 7.3 Route renders but shows nothing

**Why:** a parent layout route is missing `<Outlet />`, or the child path does not match.
**Fix:**

```tsx
function Layout() {
  return <><nav>…</nav><main><Outlet /></main></>;
}
```

### 7.4 `/tasks/new` opens the detail page for a task called "new"

**Why:** the dynamic route `tasks/:id` is matching first in a declarative tree.
**Fix:** order static routes before dynamic ones (data mode ranks by specificity automatically, but the file reads better with static first).

### 7.5 `No HydrateFallback element provided to render during initial hydration`

**Why:** a lazy route is matched on the very first render and no **already-known** route provides a fallback. A `HydrateFallback` declared *inside* the lazy module cannot help — the module has not loaded yet.
**Fix:** declare it on a non-lazy ancestor route:

```tsx
{ path: '/', element: <Layout />, HydrateFallback: () => <p role="status">Loading…</p>, children: [ … ] }
```

### 7.6 Infinite redirect loop between `/login` and a protected route

**Why:** the guard redirects to `/login`, but the session status is still treated as anonymous after signing in (state not updated), or the login page is itself inside the guard.
**Fix:** three statuses (`loading`/`anonymous`/`authenticated`), render a "checking" state while loading, and keep `/login` outside the guard.

---

## 8. Testing

### 8.1 `Unable to find an element with the role "button"` / `getByRole` fails

**Why:** the element is not what you think (a `div`, a link), the accessible name differs, or the content is behind an async update.
**Fix:** use `findBy*` for async, check the accessible name (it is computed from label/aria-label/content), and prefer semantic elements in the component.

```tsx
// ❌ brittle
screen.getByTestId('submit');
// ✅ behaviour-first
await screen.findByRole('button', { name: 'Save' });
```

### 8.2 `Found multiple elements with the role …`

**Why:** the query is ambiguous (two "Save" buttons, or a previous render not cleaned up).
**Fix:** narrow with `name`, or scope with `within(screen.getByRole('dialog'))`; ensure RTL auto-cleanup is enabled (`globals: true` or an explicit `afterEach(cleanup)`).

### 8.3 `Warning: An update to X inside a test was not wrapped in act(...)`

**Why:** a state update happened after the test's last assertion (an unawaited async update).
**Fix:** await the UI change with `findBy*`/`waitFor`, or wrap the triggering action in `act`. It almost always means the test is asserting too early.

### 8.4 `ReferenceError: expect is not defined` / `document is not defined`

**Why:** missing test globals or the wrong environment.
**Fix:**

```ts
test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] }
```

### 8.5 `toHaveTextContent is not a function`

**Why:** the jest-dom matchers are not installed/imported.
**Fix:** `npm i -D @testing-library/jest-dom` then `import '@testing-library/jest-dom/vitest';` in the setup file.

### 8.6 `onUnhandledRequest: "error"` — `Error: connect ECONNREFUSED`

**Why:** a real request was attempted (a URL that does not match any MSW handler).
**Fix:** add the handler, or align the base URL (§6.4). This failure mode is desirable — it catches typos the moment they happen.

### 8.7 Fake timers and `userEvent` hang

**Why:** user-event awaits real timers that never advance.
**Fix:** `const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });` and advance inside `act`.

### 8.8 A test that passes alone but fails in the suite

**Why:** shared state between tests — `localStorage`, module-level stores, MSW handlers, a mutable fake API.
**Fix:** reset in `beforeEach` (`localStorage.clear()`, `server.resetHandlers()`, a fresh store), and never share a `QueryClient` between tests (`retry: false` for tests too).

---

## 9. Accessibility & forms

### 9.1 `Form field without a label` / screen reader announces “edit text”

**Fix:** a real `<label htmlFor>` for visible labels; `aria-label` for symbol-only controls.

```tsx
<label htmlFor="search">Search</label>
<input id="search" type="search" />
<button type="button" aria-label="Clear search">×</button>
```

### 9.2 The form reloads the page on submit

**Why:** the browser's default submit behaviour.
**Fix:** `event.preventDefault()` in `onSubmit`, or use an action (`<form action={submit}>`), or `type="button"` for non-submit buttons.

### 9.3 A `div` acts as a button but keyboard users cannot use it

**Fix:** use a `<button>`; if you must use another element, add `role="button"`, `tabIndex={0}` and Enter/Space handling — and know you are re-implementing the platform. eslint-plugin-jsx-a11y catches most of these.

### 9.4 The modal can be tabbed “behind”

**Fix:** the native `<dialog>` element with `showModal()` gives a focus trap and an inert background; otherwise implement focus management explicitly (focus the dialog, trap Tab, restore focus to the trigger on close, close on Escape).

### 9.5 Validation errors are invisible to assistive tech

**Fix:**

```tsx
<input id="email" aria-invalid={invalid} aria-describedby={invalid ? 'email-error' : undefined} />
{invalid && <p id="email-error" role="alert">Enter a valid email address.</p>}
```

---

## 10. Performance symptoms

| Symptom | Likely cause | First fix |
| --- | --- | --- |
| Typing feels laggy in a big form | state at the top, everything re-renders | move the input's state down, or use `useDeferredValue` |
| Long list slow to appear | too many DOM nodes | window/paginate (20 000 rows windowed to 50 mounted in 3.2 ms vs ~255 ms for 4 000 full rows; dev build) |
| One row's change re-renders every row | parent state + unmemoised rows | compiler, or `memo` + stable callbacks |
| First load slow | bundle size | split routes, check the visualiser |
| Janky drag/scroll | work during render, layout thrash | measure with the Performance panel, defer non-urgent updates |
| Memory grows over time | leaked timers/listeners/subscriptions | every effect that creates something must clean it up |
| The same data fetched repeatedly | no cache | one query key per resource |

**Before optimising:** reproduce with a number (a trace, a render count, a bundle size). After: re-measure, and keep the measurement as a test where you can.

---

## Where to go next

- **See the code run.** Every error in this file came from a real project; the whole project
  (six apps, 62 tests, the measurement harness, and the raw command transcripts) is in
  [`../react-lab/`](../react-lab/README.md). `npm install && npm test -- --run` is the fastest
  way to watch a passing test turn into a failing one.
- **Rapid revision:** [`cheatsheets/`](./cheatsheets/) — nine one-page references.
- **Interview preparation:** [`18-interview/react-interview.md`](./18-interview/react-interview.md).
- **Back to the map:** [`react-roadmap.md`](./react-roadmap.md).
