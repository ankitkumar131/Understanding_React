# Common Errors, Decoded

> Every error message you will meet in a React + TypeScript project, what it actually means, and
> the fix. Read the message, find it here, fix the cause — not the symptom.
>
> Search this file for the first distinctive phrase of the error (the part in quotes is usually
> what you can copy).

---

## 1. Build and tooling errors

### `Failed to resolve import "./App.css" from "src/App.tsx"`

**Meaning.** You deleted or moved a file that is still imported. Vite fails loudly on a missing
import, which is the behaviour you want.

**Fix.** Remove the import, or restore the file. If you deleted `App.css`, also delete
`import './App.css'` from `App.tsx`.

---

### `';' expected` — pointing at a `<` in your code

**Meaning.** JSX in a `.ts` file. TypeScript parses `.ts` as plain JavaScript, so `<div>` looks
like a broken expression.

**Fix.** Rename the file to `.tsx`. Rule: **any file containing JSX is `.tsx`**.

---

### `Adjacent JSX elements must be wrapped in an enclosing tag`

**Meaning.** A component returned more than one root element.

**Fix.** Wrap in a fragment: `return (<><h1>a</h1><p>b</p></>);` — a fragment adds no DOM node.

---

### `Element type is invalid: expected a string … but got: undefined`

**Meaning.** The thing you rendered as a component is `undefined`. Almost always an import
problem.

**Causes and fixes.**

| Cause | Fix |
| --- | --- |
| Default vs named import mismatch | `export default function X` → `import X from …`; `export function X` → `import { X } from …` |
| Wrong capitalisation | `import userCard` → the variable is lowercase, so JSX treats it as a DOM tag |
| A circular import | Break the cycle — the module was not initialised when it was read |
| Importing a folder with no `index.ts` | Add the barrel or import the file directly |
| A package that does not export what you think | Check its docs; `import * as pkg` and log it |

---

### `Cannot find module '@/features/tasks' or its corresponding type declarations`

**Meaning.** The path alias is not configured, or configured in only one place.

**Fix.** Both of these must exist:

```ts
// vite.config.ts
resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }
```

```jsonc
// tsconfig.app.json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }
```

If the app *runs* but `tsc` fails, you have the Vite half only.

---

### `__dirname is not defined` (in `vite.config.ts`)

**Meaning.** The config file is an ES module, where `__dirname` does not exist.

**Fix.** `fileURLToPath(new URL('./src', import.meta.url))`.

---

### `process is not defined` (in the browser)

**Meaning.** You used `process.env` in client code. There is no `process` in a browser.

**Fix.** `import.meta.env.VITE_SOMETHING`, and make sure the name has the `VITE_` prefix.

---

### `Some chunks are larger than 500 kB after minification`

**Meaning.** A warning, not an error: your entry chunk is big. Users on slow connections pay for
it on first paint.

**Fix.** Code-split your routes (`lazy(() => import(...))`), analyse with
`rollup-plugin-visualizer`, and replace or lazy-load the largest dependency.

---

### `The following dependencies are imported but could not be resolved`

**Meaning.** A package is missing from `node_modules`, or the name is misspelled
(typosquatting is a real risk — check the name against the registry).

**Fix.** `npm install <package>`, then restart the dev server.

---

## 2. React runtime errors

### `Too many re-renders. React limits the number of renders to prevent an infinite loop.`

**Meaning.** You called a state setter **during render**, so the render triggers another render.

```tsx
// ❌ Calls setCount during render
<button onClick={setCount(count + 1)}>+1</button>

// ✅ Passes a function to call later
<button onClick={() => setCount(count + 1)}>+1</button>
```

Also caused by: a `setState` in the component body, or an effect whose dependency is a value it
creates itself.

---

### `Rendered more hooks than during the previous render`

**Meaning.** The number or order of hook calls changed between renders — a hook inside an `if`, a
loop, or after an early `return`.

**Fix.** Move every hook to the top level, before any conditional return. If you need conditional
behaviour, put the condition *inside* the hook (`enabled: shouldRun`, or an early `return` inside
the effect).

---

### `Invalid hook call. Hooks can only be called inside of the body of a function component.`

**Meaning.** One of three things.

| Cause | Fix |
| --- | --- |
| Hooks called in a plain function, a class, or outside a component | Move them into a component or a `use*` hook |
| **Two copies of React** in the bundle | `npm ls react` — dedupe; usually a library bundling its own React |
| A library expecting React as a peer dependency, installed as a regular dependency | Move it to `peerDependencies` / reinstall |

The duplicate-React case is the one that confuses people, because the code looks correct.

---

### `Cannot update a component while rendering a different component`

**Meaning.** A state setter ran during another component's render — usually `navigate()` or a
parent's setter called in the child's body.

```tsx
// ❌ During render
if (!user) navigate('/login');

// ✅ Return the redirect instead
if (!user) return <Navigate to="/login" replace />;

// ✅ Or do it in an effect / event handler
useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);
```

---

### `Objects are not valid as a React child`

**Meaning.** You rendered a plain object. Usually an API response or an `Error`.

```tsx
<p>{user}</p>                       // ❌ user is an object
<p>{user.name}</p>                  // ✅
<p>{error}</p>                      // ❌ Error is an object
<p>{error.message}</p>              // ✅ — and better: a mapped userMessage(error)
<p>{date}</p>                       // ❌ if date is a Date object
<p>{date.toISOString()}</p>         // ✅
```

A promise in the same position gives the same error — `use()` or a data library resolves it first.

---

### `Each child in a list should have a unique "key" prop`

**Meaning.** Items rendered with `map` have no `key`.

```tsx
{items.map((item) => <Row item={item} />)}              // ❌ warning
{items.map((item) => <Row key={item.id} item={item} />)} // ✅
```

⚠️ The warning is the *mild* version of the problem. Without keys, deleting an item makes React
reuse the wrong DOM node — see `Wrong row keeps its state` in section 6.

---

### `Warning: Each child in a list should have a unique "key"` — but you *have* keys

**Cause.** The `key` is on the wrong element. It belongs on the **outermost element returned by
`map`**, not on a child inside it, and not on the fragment unless you use `<Fragment key=…>`.

```tsx
// ❌
{items.map((item) => <li><Row key={item.id} item={item} /></li>)}

// ✅
{items.map((item) => <li key={item.id}><Row item={item} /></li>)}
```

---

### `A component is changing an uncontrolled input to be controlled`

**Meaning.** An input's `value` went from `undefined` to a string (or vice versa). React switches
the input's mode, which loses DOM state.

```tsx
// ❌ user.name is undefined on the first render
<input value={user.name} onChange={…} />

// ✅
<input value={user.name ?? ''} onChange={…} />
```

**Prevent it** by typing the model so the field cannot be `undefined` (`name: string`, not
`name?: string`).

---

### `You provided a `checked` prop to a form field without an `onChange` handler`

**Meaning.** A controlled checkbox with no way to change. React renders it read-only.

**Fix.** Add `onChange`. And note: checkboxes are controlled by `checked`, **not** `value`.

---

### `Cannot read properties of undefined (reading 'map')`

**Meaning.** You called `.map` on something that is not an array — usually data that has not
arrived yet, or an API field that was absent.

```tsx
// ❌ data is undefined on the first render
{data.items.map(…)}

// ✅ Guard the state first
if (isPending) return <Skeleton />;
if (!data) return <EmptyState />;
return <ul>{data.items.map(…)}</ul>;

// ✅ And type optional API fields honestly
interface Response { items?: Item[] }
const items = response.items ?? [];
```

---

### `Cannot read properties of null (reading 'current')` / a ref is null

**Meaning.** You read `ref.current` before mount or after unmount.

**Fix.** Null-check (`ref.current?.focus()`), and never read or write a ref during render.

---

### `useContext` returns `undefined`

**Meaning.** The component is rendered outside the provider, or two copies of the context module
exist.

**Fix.** Wrap the tree in the provider — and make the hook throw a helpful error:

```ts
export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
```

---

### `Cannot read properties of undefined (reading 'useContext')`

**Meaning.** `React` itself is `undefined` — usually a bad import (`import React from 'react'` in
a project configured for the automatic JSX runtime is fine, but `import { React } from 'react'`
is not), or a duplicate React.

---

## 3. Data and async errors

### `Unexpected token '<', "<!DOCTYPE "… is not valid JSON`

**Meaning.** You called `.json()` on an HTML response. Almost always a 404 or 500 that returned
an HTML error page — because **`fetch` resolves on HTTP errors**.

**Fix.** Check `response.ok` before parsing:

```ts
if (!response.ok) throw new ApiError(kindFor(response.status), `Request failed (${response.status})`);
```

Also check the URL: a missing `VITE_API_URL` produces `undefined/users`, which your dev server
answers with `index.html` — hence the HTML.

---

### `Failed to fetch` / `TypeError: NetworkError when attempting to fetch resource`

**Meaning.** The request never completed. Causes, in order of likelihood: the server is not
running; CORS blocked it; you are offline; the URL is wrong; a browser extension blocked it.

**Diagnosis.** Open the Network tab. If you see a **CORS** error, it is a server configuration
issue, not a React bug. If you see nothing at all, the request was blocked before it left.

---

### `Access to fetch at '…' from origin '…' has been blocked by CORS policy`

**Meaning.** The API did not return the headers that let your origin read the response.

**Fix (server side).**

```http
Access-Control-Allow-Origin: http://localhost:5173     # never "*" with credentials
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: content-type, authorization
Access-Control-Allow-Credentials: true                 # only if you send cookies
```

**In development**, avoid it entirely with the Vite proxy:

```ts
server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } }
```

⚠️ The proxy is dev-only. Production needs real CORS headers — which is why this error "only
happens in production".

---

### The request succeeds but the UI shows the previous result

**Meaning.** A race condition: two requests in flight, and the older one resolved last.

**Fix.** Cancel the superseded request:

```tsx
useEffect(() => {
  const controller = new AbortController();
  load(controller.signal);
  return () => controller.abort();
}, [query]);
```

And ignore `AbortError` — it is your own doing, not a failure.

---

### `AbortError: The user aborted a request`

**Meaning.** Your `AbortController` cancelled the request. This is *expected* when you unmount or
supersede a request.

**Fix.** Do not treat it as an error:

```ts
catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  setError(error);
}
```

---

### A value is stale inside a callback or interval

**Meaning.** A stale closure: the function captured the values from the render in which it was
created.

```tsx
// ❌ count is captured as 0 forever
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);
  return () => clearInterval(id);
}, []);

// ✅ The functional updater does not need the captured value
setCount((c) => c + 1);
```

Other fixes: add the value to the dependency array, or hold it in a ref.

---

## 4. TypeScript errors

### `Argument of type 'never[]' is not assignable to parameter of type 'SetStateAction<Item[]>'`

**Meaning.** `useState([])` infers `never[]`.

**Fix.** `useState<Item[]>([])`.

---

### `Type 'string | undefined' is not assignable to type 'string'`

**Meaning.** A value that might not exist is being used as if it does. Most commonly
`useParams()`.

```tsx
const { id } = useParams();       // string | undefined — the route may not have matched
useNote(id!);                     // ❌ an assertion that becomes a crash
const { id = '' } = useParams();  // ✅ an explicit fallback
```

---

### `Object is possibly 'null'` / `'undefined'`

**Meaning.** `strictNullChecks` is doing its job.

**Fix.** Add a guard, not a `!`:

```tsx
if (!user) return <Spinner />;
<p>{user.name}</p>
```

---

### `Property 'children' does not exist on type '{ … }'`

**Meaning.** `children` is not implicit — you must declare it.

**Fix.** Add `children: ReactNode` to the props interface.

---

### `Effect callbacks are synchronous to prevent race conditions`

**Meaning.** You passed an `async` function to `useEffect`. Its return value would be a Promise,
not a cleanup function.

```tsx
// ❌
useEffect(async () => { const data = await load(); setData(data); }, []);

// ✅
useEffect(() => {
  let cancelled = false;
  load().then((data) => { if (!cancelled) setData(data); });
  return () => { cancelled = true; };
}, []);
```

---

### `Type 'MutableRefObject<HTMLInputElement | null>' is not assignable to type 'Ref<HTMLInputElement>'`

**Meaning.** The wrong `useRef` overload.

**Fix.** For a DOM ref use `useRef<HTMLInputElement>(null)`. For a mutable box, use
`useRef<T | undefined>(undefined)`.

---

### `'X' is declared but its value is never read`

**Meaning.** `noUnusedLocals` / `noUnusedParameters` in the Vite template.

**Fix.** Delete the dead code. Prefixing with `_` silences it for parameters.

---

### `Cannot find name '__APP_VERSION__'`

**Meaning.** A `define`-injected constant is not declared for TypeScript.

**Fix.** In `vite-env.d.ts`: `declare const __APP_VERSION__: string;`

---

### `Property 'VITE_API_URl' does not exist on type 'ImportMetaEnv'`

**Meaning.** Exactly what you want: a typo in an environment variable name, caught at compile
time.

**Fix.** Correct the spelling — TypeScript usually suggests the right one.

---

## 5. Deployment errors

### A blank page with 404s on `/assets/index-*.js`

**Cause.** `base` does not match where the app is served, or the wrong directory was published.

**Fix.** Sub-path deploy → `base: '/my-app/'` in `vite.config.ts`. Publish `dist/`, not the
project root.

---

### 404 when refreshing a deep link (but in-app navigation works)

**Cause.** An SPA has no file at `/tasks/42`. The host needs to serve `index.html` for unknown
paths.

**Fix.**

```toml
# netlify.toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

```nginx
location / { try_files $uri $uri/ /index.html; }
```

---

### `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"`

**Cause.** The SPA rewrite is catching asset requests, so a `.js` file returns `index.html`.

**Fix.** Make the rewrite skip real files (every config above does this with `try_files` or by
serving existing files first).

---

### The app is blank after a deploy until a hard refresh

**Cause.** `index.html` is cached, so browsers request chunk filenames from the previous build
that no longer exist.

**Fix.** `Cache-Control: no-cache` on `index.html`; `public, max-age=31536000, immutable` on
`/assets/*`.

---

### It works in development but not in production

**They are different programs.** Check, in order:

```bash
npm run build && npm run preview      # reproduce against the real build
```

1. Environment variables actually present at build time (`grep` the bundle for the API URL)
2. `base`
3. `tsc -b` in the build script (type errors do not fail a Vite build)
4. Code that depends on function names or property order (minification changes both)
5. Build with `sourcemap: true` temporarily to read the real stack

---

## 6. "The behaviour is wrong but there is no error"

These are the expensive ones, because nothing tells you.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deleting a row makes another row lose its text/state | Index keys | `key={item.id}` |
| The edit form shows the previous record | `defaultValues` are read once, on mount | `key={entity.id}` on the form |
| Typing in a search fires a request per character | No debounce | An effect with a `setTimeout` cleanup |
| Two records created from one click | Async handler, enabled button | Disable while pending + server idempotency |
| The list does not update after adding an item | Mutated the array (`push`) | A new array with spread or `map` |
| A checkbox appears to work but ignores state | `value` instead of `checked` | `checked={done}` |
| `disabled="false"` disables the button | The string `"false"` is truthy | `disabled={false}` |
| `0` renders on screen | `{count && <Badge />}` | `{count > 0 && …}` |
| The effect runs on every render | A new object/array literal in the deps | Depend on primitives, or `useMemo` |
| Every context consumer re-renders constantly | A new provider value object each render | `useMemo` the value |
| A long list makes the page unusable | Rendering every row | Virtualise; `useDeferredValue` for filtering |
| The user sees "undefined is not a function" | A raw `err.message` rendered | One `userMessage()` mapping |
| State survives a navigation you expected to reset | The component stayed mounted | Reset explicitly, or key the route |
| A timer keeps running after leaving the page | No cleanup | `return () => clearInterval(id)` |
| Subscriptions double in development | `StrictMode` + no cleanup | Add the cleanup (do not remove `StrictMode`) |

---

## 7. How to debug anything, in order

```text
1. Read the whole error. The first line says what, the component stack says where.
2. Reproduce it with the smallest possible case.
3. Check the console AND the network tab — half of "React bugs" are API responses.
4. Log at the boundary: what did the component receive, and what did it render?
5. Bisect: comment out half the tree, or revert half the change.
6. Reproduce it against the production build (npm run preview) before you believe it.
7. When you fix it, write the test that would have caught it.
```

💡 **Keep a personal error log.** Every time an error costs you more than twenty minutes, write
down: the message, the cause, the fix, and how you would recognise it next time. After a year it
is worth more than any cheat sheet — including this one.

---

## 8. Where to go from an error

| Area | Chapter |
| --- | --- |
| JSX and TSX syntax | [Part 3 · 05](./03-react-fundamentals/05-jsx.md) · [Part 3 · 06](./03-react-fundamentals/06-tsx.md) |
| State and effects | [Part 4 · 02](./04-state-and-hooks/02-usestate.md) · [Part 4 · 03](./04-state-and-hooks/03-useeffect.md) |
| Hook rules | [Part 4 · 10](./04-state-and-hooks/10-hooks-rules.md) |
| Forms and controlled inputs | [Part 5 · 03](./05-react-concepts/03-controlled-components.md) · [Part 8](./08-forms-validation/) |
| Lists and keys | [Part 3 · 11](./03-react-fundamentals/11-rendering-lists.md) |
| API errors | [Part 7 · 02](./07-api-integration/02-fetch.md) · [Part 15 · 04](./15-production/04-error-handling.md) |
| CORS and security | [Part 15 · 06](./15-production/06-security.md) |
| TypeScript | [Part 2 · 09](./02-typescript/09-narrowing.md) · [Part 2 · 11](./02-typescript/11-typescript-react.md) |
| Build and environment | [Part 16 · 01](./16-build-tools/01-vite.md) · [Part 16 · 04](./16-build-tools/04-environment-config.md) |
| Deployment | [Part 15 · 08](./15-production/08-production-checklist.md) |
| Debugging scenarios in interview form | [Part 18 · 04](./18-interview/scenario-based-questions.md) |
