# 11 — `async` / `await` and `fetch`

> **Part 1 · Prerequisites · File 11 of 11**
>
> **Why this file exists:** this is the exact syntax you will use for every API
> call in React. It is also the last prerequisite: after this file, everything you
> need to understand `useEffect` + data fetching is in place.

---

## 1. What `async` and `await` are

`async`/`await` is **syntax sugar over promises**. It does not introduce a new
concept; it lets you write promise code that reads like sequential code.

```js
// With promises
function loadUser(id) {
  return fetch(`/api/users/${id}`)
    .then((response) => response.json())
    .then((user) => user.name);
}

// With async/await — same behaviour, easier to read
async function loadUser(id) {
  const response = await fetch(`/api/users/${id}`);
  const user = await response.json();
  return user.name;
}
```

Two rules:

1. **`async` before a function** means: "this function always returns a promise."
2. **`await` inside it** means: "pause this function until the promise settles,
   then give me its value."

```js
async function example() {
  return 42;               // actually returns Promise<42>
}

example().then(console.log); // 42
console.log(example());      // Promise { 42 }
```

**Key point:** `async` functions return promise-wrapped values. Returning `42` from
an async function is the same as returning `Promise.resolve(42)`.

```js
// These three are equivalent
const f1 = async () => 1;
const f2 = () => Promise.resolve(1);
const f3 = async () => {
  return 1;
};
```

### `await` pauses *the function*, not the page

```js
async function demo() {
  console.log('A');
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log('C');
}

console.log('1');
demo();
console.log('2');

// Output:
// 1
// A
// 2        ← the outer script keeps running; only `demo` is paused
// C        ← 100ms later
```

That is the whole point: your code reads top-to-bottom, but the browser is never
blocked.

### Top-level `await`

In **ES modules** (and in Vite), you can `await` at the top level of a module:

```js
// src/config.js — a module, so top-level await is allowed
const response = await fetch('/config.json');
export const config = await response.json();
```

> ⚠️ Top-level `await` blocks the *importing* module graph until it resolves, so
> use it for genuinely required config, not for page data. In React components you
> will always fetch inside `useEffect`, a hook, or an event handler — never at the
> top level of a component file.

---

## 2. Error handling with `async`/`await`

With promises you needed `.catch()`. With `await`, a rejected promise **throws**
at the `await` line, so you use ordinary `try`/`catch`.

```js
async function loadUser(id) {
  try {
    const response = await fetch(`/api/users/${id}`);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const user = await response.json();
    return user;
  } catch (error) {
    // Handles BOTH network failures (fetch rejects) and our thrown error
    console.error('Could not load user:', error.message);
    throw error;                 // re-throw if the caller needs to know
    // or: return null;          // or swallow it and return a fallback
  } finally {
    console.log('attempt finished');   // always runs
  }
}
```

**Three things to internalise:**

1. `try`/`catch` around `await` catches **asynchronous** errors too. This is the
   main readability win over `.then().catch()`.
2. `catch (error)` gives you whatever was thrown/rejected — an `Error` for `fetch`
   network failures, or your own error object.
3. `finally` runs on both paths — perfect for `setIsLoading(false)`.

### `throw` inside a `.then()` vs `await`

```js
// Rejected promise from fetch (network down) → caught by try/catch
try {
  await fetch('https://offline.example.invalid/');
} catch (error) {
  console.log('network error:', error.message); // "fetch failed" / "Failed to fetch"
}
```

> ⚠️ **`fetch` does not reject on HTTP error codes.** A `404` or `500` response is
> a *successful* promise with a "bad" status. You must check `response.ok` (or
> `response.status`) yourself. Forgetting this is the #1 API bug in beginner React
> code.
>
> ```js
> const response = await fetch('/api/users/999');   // 404
> const data = await response.json();               // may throw a JSON parse error,
>                                                   // or silently give you an error body
> ```

---

## 3. Sequential vs parallel `await` (a performance difference you can feel)

```js
// ❌ Sequential: 300ms + 300ms + 300ms ≈ 900ms
const user = await fetchUser(1);
const orders = await fetchOrders(1);
const settings = await fetchSettings(1);

// ✅ Parallel: ≈ 300ms total, because all three start immediately
const [user, orders, settings] = await Promise.all([
  fetchUser(1),
  fetchOrders(1),
  fetchSettings(1),
]);
```

**Rule:**

```text
await them one after another  →  only when a later request NEEDS an earlier result
await them together           →  when they are independent
```

```js
// Correctly sequential: the second call needs the first result
const user = await fetchUser(1);
const orders = await fetchOrders(user.id);   // depends on user

// Correctly parallel: independent
const [user, currency] = await Promise.all([fetchUser(1), fetchCurrencyRates()]);
```

### `await` in loops

```js
// ❌ Sequential — each iteration waits for the previous (slow, and easy to get wrong)
for (const id of ids) {
  const user = await fetchUser(id);
  users.push(user);
}

// ✅ Parallel — much faster for independent requests
const users = await Promise.all(ids.map((id) => fetchUser(id)));

// ⚠️ Sequential but BATCHED — when the server cannot handle many parallel calls
const BATCH = 5;
for (let i = 0; i < ids.length; i += BATCH) {
  const chunk = ids.slice(i, i + BATCH);
  const results = await Promise.all(chunk.map((id) => fetchUser(id)));
  users.push(...results);
}
```

### `forEach` + `async` does not work

```js
// ❌ The awaits inside are NOT awaited by the caller
ids.forEach(async (id) => {
  const user = await fetchUser(id);
  console.log(user);       // runs later; the function has already returned
});
console.log('done');       // prints BEFORE any user

// ✅ Use a for...of loop if you need sequencing
for (const id of ids) {
  const user = await fetchUser(id);
  console.log(user);
}
console.log('done');

// ✅ Or Promise.all + map if you want parallelism
await Promise.all(ids.map(async (id) => console.log(await fetchUser(id))));
console.log('done');
```

> 🔍 `forEach` ignores the return value of its callback — it cannot know about
> your promises. `map` returns them, which is why `Promise.all(ids.map(...))` works.

---

## 4. `fetch` in detail

`fetch(url, options)` returns a promise for a **`Response` object**.

```js
const response = await fetch('https://api.example.com/users/1');

console.log(response.status);      // 200
console.log(response.ok);          // true  (status in 200–299)
console.log(response.headers.get('content-type')); // "application/json"
console.log(response.url);         // the final URL (after redirects)
```

The `Response` body can only be read **once**, and reading it returns a promise:

```js
const data = await response.json();     // parse JSON
// const text = await response.text();  // plain text / HTML
// const blob = await response.blob();  // images, files
// const buffer = await response.arrayBuffer(); // binary
// const stream = response.body;        // raw stream
```

```js
// ⚠️ Reading twice throws
const a = await response.json();
// const b = await response.json();  // TypeError: Body is unusable / already read
```

### The complete pattern you should use every time

```js
async function request(url, options = {}) {
  const response = await fetch(url, options);

  // 1. Network-level success, but possibly an HTTP error
  if (!response.ok) {
    // Try to read the server's error body for a useful message
    let details = '';
    try {
      details = await response.text();
    } catch {
      details = '';
    }
    throw new Error(`HTTP ${response.status} ${response.statusText}${details ? ` — ${details}` : ''}`);
  }

  // 2. 204 No Content has no body to parse
  if (response.status === 204) return null;

  // 3. Parse based on the content type
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

// Usage
const users = await request('/api/users');
```

That is essentially what libraries like Axios do for you (Part 7) — including
attaching the status to the error object.

### POST with a JSON body

```js
async function createUser(payload) {
  const response = await fetch('/api/users', {
    method: 'POST',                                 // GET is the default
    headers: {
      'Content-Type': 'application/json',           // what we are SENDING
      Accept: 'application/json',                    // what we want BACK
      Authorization: `Bearer ${token}`,              // auth (Part 14)
    },
    body: JSON.stringify(payload),                   // must be a string!
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

await createUser({ name: 'Ada', email: 'ada@example.com' });
```

Common options:

| Option | Purpose |
| --- | --- |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH`, `DELETE` |
| `headers` | metadata: content type, auth token, custom headers |
| `body` | the request body — a string for JSON, or a `FormData` for files |
| `signal` | an `AbortSignal` to cancel the request |
| `credentials` | `'include'` to send cookies cross-origin |
| `mode` | `'cors'` (default), `'no-cors'`, `'same-origin'` |
| `cache` | `'no-store'`, `'reload'`, … |

> ⚠️ `body: payload` without `JSON.stringify` sends `[object Object]`. The server
> then fails to parse it, and you spend 20 minutes confused. Almost every
> "the API says my data is invalid" bug is either this or a missing
> `Content-Type` header.

### `FormData` for files

```js
async function uploadAvatar(file) {
  const form = new FormData();
  form.append('avatar', file);          // a File from <input type="file">
  form.append('userId', '1');

  const response = await fetch('/api/avatar', {
    method: 'POST',
    body: form,                          // ⚠️ do NOT set Content-Type yourself;
  });                                    //    fetch adds the correct boundary
  return response.json();
}
```

### Building URLs correctly

```js
// Query strings: use URLSearchParams; it encodes values for you
const params = new URLSearchParams({
  q: 'ada lovelace',
  page: '2',
  sort: 'name',
});
console.log(params.toString());          // "q=ada+lovelace&page=2&sort=name"

const response = await fetch(`/api/search?${params}`);

// Optional values: only append when present
const search = (query, page = 1, category) => {
  const params = new URLSearchParams({ q: query, page: String(page) });
  if (category) params.set('category', category);
  return fetch(`/api/search?${params}`).then((r) => r.json());
};

// Paths with special characters
const safeId = encodeURIComponent(userId);
await fetch(`/api/users/${safeId}`);
```

> 💡 `URLSearchParams.toString()` encodes spaces as `+`. Servers accept `+` and
> `%20` for a space; both are correct.

---

## 5. Cancelling: `AbortController`

Requests you no longer need should be cancelled: the user navigated away, typed a
new search, or the component unmounted.

```js
const controller = new AbortController();

fetch('/api/search?q=react', { signal: controller.signal })
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => {
    if (error.name === 'AbortError') {
      console.log('request cancelled');   // not a real error — ignore it
      return;
    }
    console.error('real failure:', error);
  });

// Later, when the user types again or the component unmounts:
controller.abort();
```

**In React (the pattern you will use constantly):**

```tsx
useEffect(() => {
  const controller = new AbortController();

  async function load() {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: Result[] = await response.json();
      setResults(data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return; // ignore
      setError(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }

  load();

  // Runs when `query` changes or the component unmounts
  return () => controller.abort();
}, [query]);
```

**`AbortController` also cancels timeouts:**

```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(url, { signal: controller.signal });
  return await response.json();
} finally {
  clearTimeout(timeoutId);   // always clear the timer
}
```

> 🔍 Before `AbortController` (or when it is unavailable), the standard trick was
> a boolean flag: `let ignore = false; ... if (!ignore) setData(data);` with
> `return () => { ignore = true; }`. The flag prevents *using* a stale response;
> the controller *cancels* the request so it stops consuming bandwidth. Use the
> flag when you only care about correctness; use the controller when you also want
> to save network work.

---

## 6. `async`/`await` in React

### 6.1 What is allowed where

| Place | Can it be `async`? | Why |
| --- | --- | --- |
| Event handler (`onClick`, `onSubmit`) | ✅ yes | React ignores the return value |
| `useEffect` callback | ❌ no | React expects nothing or a cleanup function, not a promise |
| Function *inside* an effect | ✅ yes | call it and don't return the promise |
| `useMemo`/`useCallback` callback | ❌ no | they must return a value synchronously |
| Component function itself | ❌ no | components must return JSX, not a promise (use Suspense / `use()` instead — Part 11) |
| Route loader (React Router) | ✅ yes | loaders are designed for it (Part 6) |
| Top level of a module | ✅ yes | ES modules allow it |

### 6.2 Effects

```tsx
function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // The async function is DEFINED here and CALLED here — but not returned.
    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/users', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setUsers(await response.json());
      } catch (caught) {
        if (caught instanceof Error && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  if (isLoading) return <p>Loading users…</p>;
  if (error) return <p role="alert">Could not load users: {error.message}</p>;
  if (users.length === 0) return <p>No users yet.</p>;

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

Notice the four states this component handles: **loading, error, empty, success**.
That is not optional polish — it is the difference between an app that feels
finished and one that feels broken. Part 7 covers each in depth.

### 6.3 Event handlers

```tsx
function CreateUserForm({ onCreated }: { onCreated: (user: User) => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();          // stop the browser's page reload
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });

      if (!response.ok) {
        throw new Error(response.status === 400 ? 'Please check your input' : 'Server error');
      }

      onCreated(await response.json());
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="name">Name</label>
      <input id="name" name="name" required />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create user'}
      </button>

      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

Three details worth copying:

- `event.preventDefault()` **must run before any `await`.** If you await first, the
  browser may have already performed its default submit (a page reload) — this is
  because React's synthetic events used to be pooled, and even now the safest
  habit is to read what you need from the event synchronously.
- `new FormData(event.currentTarget)` is captured before awaiting, for the same
  reason. (`currentTarget` can become `null` after an await.)
- `type="submit"` + `disabled={isSubmitting}` prevents double submissions.

---

## 7. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Forgetting `await` | You get a `Promise`, not the data (`data.map is not a function`) | `await` it, or `.then()` it |
| `async` callback passed to `useEffect` | Warning: effect callbacks are synchronous | define and call an inner async function |
| Not checking `response.ok` | 404/500 treated as success; blank or broken UI | check `response.ok` and throw |
| Reading the body twice | `TypeError: Body is unusable` | read once; store the result |
| `body: obj` instead of `JSON.stringify(obj)` | Server sees `[object Object]` | stringify it, and set `Content-Type` |
| Setting `Content-Type` manually for `FormData` | Server cannot parse the upload | let `fetch` set it |
| `await` inside `forEach` | Code after the loop runs first; nothing is awaited | `for...of`, or `Promise.all(ids.map(...))` |
| Sequential `await`s for independent work | Slow pages (n × latency) | `Promise.all` |
| Stale response overwriting fresh data | Wrong results after fast typing | `AbortController` or an ignore flag |
| `preventDefault()` after an `await` | The page reloads anyway | call it first |
| No `finally` to clear the loading flag | Spinner stays forever after an error | `finally { setIsLoading(false) }` |
| Swallowing `AbortError` as a real error | Error UI flashes during fast typing | ignore errors with `name === 'AbortError'` |
| Assuming `fetch` has a timeout | Requests hang for a long time | `AbortController` + `setTimeout` |

---

## 8. Practice exercises

### Beginner

Predict the output order, then verify.

```js
async function one() {
  console.log('one: start');
  const value = await Promise.resolve('awaited');
  console.log('one:', value);
  return 'done';
}

console.log('script: start');
one().then((result) => console.log('then:', result));
console.log('script: end');
```

Then fix each broken snippet:

```js
// A
async function getUser() {
  const response = fetch('/api/user');
  const data = response.json();      // ❌ two problems
  return data;
}

// B
function loadAll(ids) {
  ids.forEach(async (id) => {        // ❌ does not wait
    const user = await fetchUser(id);
    console.log(user);
  });
  console.log('all done');
}

// C
useEffect(async () => {              // ❌ React warning
  const data = await fetchData();
  setData(data);
}, []);
```

**Solution**

```text
script: start
one: start
script: end
one: awaited          ← the async function resumed after the current script
then: done
```

Note `script: end` prints before `one: awaited`. `await` pauses `one()`, not the
script that called it.

```js
// A — missing awaits, and no response.ok check
async function getUser() {
  const response = await fetch('/api/user');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data;
}
```

Two bugs: `fetch` and `.json()` both return promises, so without `await` you
return a promise-of-a-promise and the caller gets an unparsed `Response`. Always
check `response.ok` as well.

```js
// B — forEach cannot await; use a loop or Promise.all
async function loadAll(ids) {
  const users = await Promise.all(ids.map((id) => fetchUser(id)));
  users.forEach((user) => console.log(user));
  console.log('all done');   // now truly after all of them
}
```

```tsx
// C — an async function inside the effect, and a cleanup
useEffect(() => {
  const controller = new AbortController();

  async function load() {
    try {
      const data = await fetchData(controller.signal);
      setData(data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setError(error);
    }
  }

  load();
  return () => controller.abort();
}, []);
```

### Intermediate

Write `api.js` — a **typed API client** with `async`/`await`, ready to be used by
React. Requirements:

1. A generic `request<T>(path, options)` that:
   - prefixes a `BASE_URL`;
   - sets `Content-Type: application/json` when there is a body;
   - checks `response.ok` and throws a custom `ApiError` with `status` and the
     parsed error body;
   - returns `null` for `204 No Content`;
   - supports an `AbortSignal`;
   - adds a request timeout (default 8s) using `AbortController` — unless the
     caller supplied their own signal.
2. Resource functions: `getUsers()`, `getUser(id)`, `createUser(input)`,
   `updateUser(id, input)`, `deleteUser(id)`, plus
   `searchUsers(query, { page, pageSize })` that builds a query string with
   `URLSearchParams` and skips empty values.
3. A `loadUserWithPosts(id)` that fetches the user first, then their posts in
   parallel with their comments — proving you know which awaits must be sequential
   and which can be parallel.
4. A `runAll()` helper that takes an array of names and loads them in parallel,
   returning `{ loaded, failed }` using `Promise.allSettled`.
5. A demo `main()` that runs against a **local mock server** (see the solution) so
   you can actually see the error paths: 200, 404, 400 and a timeout.

**Solution**

```text
js-playground/api.js
```

```js
// ---------------------------------------------------------------- config
const BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------- errors
export class ApiError extends Error {
  constructor(message, { status = 0, body = null, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.url = url;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isValidationError() {
    return this.status === 400 || this.status === 422;
  }

  get isServerError() {
    return this.status >= 500;
  }
}

// ---------------------------------------------------------------- core
export async function request(path, { body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = {}) {
  // Use the caller's signal if given; otherwise create one for the timeout.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const finalSignal = signal ?? controller.signal;

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      ...rest,
      signal: finalSignal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      // Read the error body if there is one — servers usually explain themselves
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }

      throw new ApiError(`HTTP ${response.status} for ${path}`, {
        status: response.status,
        body: errorBody,
        url,
      });
    }

    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? response.json() : response.text();
  } catch (error) {
    // Turn a timeout/abort into a clear error, but let real aborts bubble up
    if (error instanceof Error && error.name === 'AbortError' && signal === undefined) {
      throw new ApiError(`Request to ${path} timed out after ${timeoutMs}ms`, { url });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Typed resource functions** (types shown in JSDoc for this JavaScript file; in
`Part 2` you will write them as TypeScript generics):

```js
/** @typedef {{ id: number, name: string, email: string }} User */
/** @typedef {{ id: number, userId: number, title: string, body: string }} Post */

/** @returns {Promise<User[]>} */
export const getUsers = () => request('/users');

/** @param {number} id @returns {Promise<User>} */
export const getUser = (id) => request(`/users/${id}`);

/** @param {{ name: string, email: string }} input @returns {Promise<User>} */
export const createUser = (input) => request('/users', { method: 'POST', body: input });

/** @param {number} id @param {Partial<User>} input @returns {Promise<User>} */
export const updateUser = (id, input) => request(`/users/${id}`, { method: 'PATCH', body: input });

/** @param {number} id @returns {Promise<null>} */
export const deleteUser = (id) => request(`/users/${id}`, { method: 'DELETE' });

/** @param {string} query @param {{page?: number, pageSize?: number}} options */
export function searchUsers(query, { page = 1, pageSize = 10 } = {}) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  return request(`/users?${params.toString()}`);
}
```

```js
// ---------------------------------------------------------------- sequencing vs parallelism
export async function loadUserWithPosts(id) {
  // 1. Sequential: we need the user before we can ask for their data
  const user = await getUser(id);

  // 2. Parallel: posts and comments are independent of each other
  const [posts, comments] = await Promise.all([
    request(`/users/${user.id}/posts`),
    request(`/users/${user.id}/comments`),
  ]);

  return { user, posts, comments };
}

export async function runAll(names) {
  const settled = await Promise.allSettled(
    names.map((name) => request(`/${name}`))
  );

  return settled.reduce(
    (acc, result, index) => {
      const name = names[index];
      if (result.status === 'fulfilled') {
        acc.loaded.push({ name, data: result.value });
      } else {
        const reason = result.reason;
        acc.failed.push({
          name,
          status: reason?.status ?? 0,
          message: reason?.message ?? 'Unknown error',
        });
      }
      return acc;
    },
    { loaded: [], failed: [] }
  );
}
```

```js
// ---------------------------------------------------------------- mock server + demo
// A tiny server so the example runs end to end with `node api.js`.
import { createServer } from 'node:http';

function startMockServer(port = 3000) {
  const users = [
    { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
    { id: 2, name: 'Grace Hopper', email: 'grace@example.com' },
  ];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Simulate a slow endpoint so the timeout path can be demonstrated
    if (url.pathname === '/slow') {
      setTimeout(() => send(200, { ok: true }), 5000);
      return;
    }

    if (url.pathname === '/users' && req.method === 'GET') {
      const q = url.searchParams.get('q');
      const filtered = q
        ? users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()))
        : users;
      send(200, filtered);
      return;
    }

    const userMatch = url.pathname.match(/^\/users\/(\d+)$/);
    if (userMatch && req.method === 'GET') {
      const user = users.find((u) => u.id === Number(userMatch[1]));
      if (!user) {
        send(404, { error: 'User not found' });
        return;
      }
      send(200, user);
      return;
    }

    if (url.pathname === '/users' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const input = JSON.parse(raw || '{}');
        if (!input.email || !input.email.includes('@')) {
          send(400, { error: 'A valid email is required' });
          return;
        }
        const user = { id: users.length + 1, ...input };
        users.push(user);
        send(201, user);
      });
      return;
    }

    if (url.pathname.match(/^\/users\/\d+\/posts$/)) { send(200, [{ id: 1, title: 'Hello' }]); return; }
    if (url.pathname.match(/^\/users\/\d+\/comments$/)) { send(200, [{ id: 1, body: 'Nice' }]); return; }

    send(404, { error: 'Unknown route' });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`mock server on http://localhost:${port}`);
      resolve(server);
    });
  });
}

async function main() {
  const server = await startMockServer(3000);

  try {
    console.log('--- success ---');
    console.log('users:', (await getUsers()).map((u) => u.name));

    console.log('--- search (query string) ---');
    console.log('search "gra":', await searchUsers('gra', { page: 2, pageSize: 5 }));

    console.log('--- 404 ---');
    await getUser(99).catch((error) => {
      console.log(error.name, error.status, error.isNotFound, JSON.stringify(error.body));
    });

    console.log('--- 400 (validation) ---');
    await createUser({ name: 'Bad', email: 'nope' }).catch((error) => {
      console.log(error.status, error.isValidationError, JSON.stringify(error.body));
    });

    console.log('--- sequential then parallel ---');
    const bundle = await loadUserWithPosts(1);
    console.log(bundle.user.name, bundle.posts.length, bundle.comments.length);

    console.log('--- parallel with partial failures ---');
    console.log(await runAll(['users', 'nope', 'slow']));

    console.log('--- timeout (short timeout against /slow) ---');
    await request('/slow', { timeoutMs: 200 }).catch((error) => {
      console.log(error.name, error.message);
    });
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error('demo failed:', error);
  process.exitCode = 1;
});
```

**Expected output**

```text
mock server on http://localhost:3000
--- success ---
users: [ 'Ada Lovelace', 'Grace Hopper' ]
--- search (query string) ---
search "gra": [ { id: 2, name: 'Grace Hopper', email: 'grace@example.com' } ]
--- 404 ---
ApiError 404 true {"error":"User not found"}
--- 400 (validation) ---
400 true {"error":"A valid email is required"}
--- sequential then parallel ---
Ada Lovelace 1 1
--- parallel with partial failures ---
{
  loaded: [ { name: 'users', data: [ … ] } ],
  failed: [ { name: 'nope', status: 404, message: 'HTTP 404 for /nope' } ]
}
--- timeout (short timeout against /slow) ---
ApiError Request to /slow timed out after 200ms
```

(Note: `runAll(['users','nope','slow'])` may report `/slow` as loaded or failed
depending on the default 8s timeout versus the server's 5s delay — with the
default timeout it loads after 5 seconds. Drop `'slow'` from that list to keep the
demo fast.)

**Why this solution is shaped this way**

- **One `request` function, one error type.** Every resource function is one line,
  and every failure carries `status` and the server's body — which is exactly what
  a UI needs to decide between "not found", "fix your input" and "server problem".
- **The custom `ApiError` adds readable getters** (`isNotFound`,
  `isValidationError`, `isServerError`) so components do not compare magic numbers.
  Part 7 builds on this exact class.
- **Timeout with `AbortController`, and respect for the caller's signal.** If the
  component passes its own signal (for unmount-cancellation), we must not overwrite
  it — hence `signal ?? controller.signal`.
- **`204` handled explicitly.** Many DELETE endpoints return no body, and
  `response.json()` on an empty body throws.
- **Content-type sniffing** means the same client works for JSON APIs and
  text/HTML endpoints.
- **`loadUserWithPosts` shows the two-step pattern**: await what is *needed*, then
  run independent requests in parallel. Getting this wrong is the most common
  performance mistake in data-heavy React apps.
- **`URLSearchParams` handles encoding and optional parameters** —
  `?q=gra&page=2&pageSize=5`, with no manual string building.

### Challenge

Build a **complete search experience** in plain JavaScript (no React yet) that
exercises everything from this file. Then explain, in comments, how each part
would be wired into React components.

Requirements:

1. `createSearchClient(baseUrl)` returns:
   - `search(query, { signal })` — GETs `/search?q=…`;
   - `suggest(query)` — debounced (file 8) + aborts the previous request;
   - `getDetail(id)` — GETs `/items/:id`;
   - `lastRequestCount` — a counter proving that debouncing reduced requests.
2. A mock server (Node `http`) with:
   - `/search?q=…` returning 5 items whose titles contain the query, with a
     200–600ms random delay (to create realistic races);
   - `/items/:id` returning the item or 404;
   - `/flaky` failing the first two calls and succeeding on the third (to exercise
     retries).
3. `withRetry(fn, { attempts, baseDelayMs })` (as in file 8, but with `await`), and
   `withTimeout(promise, ms)`.
4. A `main()` that:
   - runs a search and prints the results;
   - simulates "fast typing" (`'r'`, `'re'`, `'rea'`, `'react'` in quick
     succession) and proves only the last query's results are used, and that
     request count is far below 4;
   - gets a detail for a valid id and shows the 404 path for an invalid one;
   - retries `/flaky` and prints how many attempts it took.
5. A closing comment block: "How this maps to React" — for each piece, name the
   hook or component that would own it.

**Solution**

```text
js-playground/search-client.js
```

```js
// ---------------------------------------------------------------- utils
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms, label = 'request') =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

async function withRetry(fn, { attempts = 3, baseDelayMs = 100 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (error.permanent) throw error;

      const isLast = attempt === attempts;
      if (isLast) break;

      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.log(`retry ${attempt} after ${delay}ms (${error.message})`);
      await wait(delay);
    }
  }

  throw lastError;
}

function debounce(fn, delayMs) {
  let timerId = null;
  const debounced = (...args) => {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delayMs);
  };
  debounced.cancel = () => { if (timerId) { clearTimeout(timerId); timerId = null; } };
  return debounced;
}

// ---------------------------------------------------------------- client
function createSearchClient(baseUrl) {
  let lastRequestCount = 0;
  let activeSuggestionController = null;

  async function getJson(path, { signal } = {}) {
    lastRequestCount += 1;
    const response = await fetch(`${baseUrl}${path}`, { signal });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} for ${path}`);
      error.status = response.status;
      error.permanent = response.status >= 400 && response.status < 500; // do not retry 4xx
      throw error;
    }
    return response.json();
  }

  async function search(query, { signal } = {}) {
    return withTimeout(getJson(`/search?q=${encodeURIComponent(query)}`, { signal }), 3000, 'search');
  }

  // ⚠️ The debounced runner is created ONCE, outside `suggest`.
  // If you create it inside `suggest`, every keystroke gets its own timer and
  // nothing is debounced at all — a bug worth remembering (see the note below).
  const runDebounced = debounce(async (q, onResults) => {
    // A new request supersedes anything still in flight.
    activeSuggestionController?.abort();
    activeSuggestionController = new AbortController();

    try {
      const results = await search(q, { signal: activeSuggestionController.signal });
      onResults(results);
    } catch (error) {
      if (error.name === 'AbortError') return;      // expected: a newer query won
      console.error('suggest failed:', error.message);
    }
  }, 150);

  function suggest(query, onResults) {
    runDebounced(query, onResults);
  }

  const getDetail = (id) => getJson(`/items/${id}`);

  return {
    search,
    suggest,
    getDetail,
    get lastRequestCount() { return lastRequestCount; },
    resetCount() { lastRequestCount = 0; },
  };
}

// ---------------------------------------------------------------- mock server
import { createServer } from 'node:http';

function startMockServer(port = 3100) {
  let flakyCalls = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      await wait(200 + Math.random() * 400);          // random delay → races
      const results = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `${q} result ${i + 1}`,
      }));
      send(200, results);
      return;
    }

    if (url.pathname === '/flaky') {
      flakyCalls += 1;
      // The first two attempts fail; the client is expected to retry
      if (flakyCalls < 3) {
        send(500, { error: 'temporary failure' });
        return;
      }
      send(200, { ok: true, attempts: flakyCalls });
      return;
    }

    const detail = url.pathname.match(/^\/items\/(\d+)$/);
    if (detail) {
      const id = Number(detail[1]);
      if (id > 5) { send(404, { error: 'Item not found' }); return; }
      send(200, { id, title: `Item ${id}` });
      return;
    }

    send(404, { error: 'Unknown route' });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

// ---------------------------------------------------------------- demo
async function main() {
  const server = await startMockServer(3100);
  const client = createSearchClient('http://localhost:3100');

  try {
    console.log('--- basic search ---');
    const results = await client.search('react');
    console.log('results:', results.map((r) => r.title));

    console.log('\n--- fast typing: only the last query should win ---');
    client.resetCount();
    let latest = null;
    for (const q of ['r', 're', 'rea', 'react']) {
      client.suggest(q, (data) => { latest = data; });
      await wait(40);                    // "typing" faster than the debounce
    }
    await wait(900);                     // let the debounce + request finish
    console.log('last query results:', latest?.map((r) => r.title));
    console.log('requests actually sent:', client.lastRequestCount); // 1

    console.log('\n--- detail ---');
    console.log(await client.getDetail(3));
    await client.getDetail(99).catch((error) => {
      console.log('404 path:', error.status, error.message, 'permanent?', error.permanent);
    });

    console.log('\n--- flaky endpoint with retry ---');
    const flaky = await withRetry(
      () => fetch('http://localhost:3100/flaky').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      { attempts: 4, baseDelayMs: 20 }
    );
    console.log('flaky result:', flaky);
  } finally {
    server.close();
  }
}

main().catch((error) => console.error('demo failed:', error));

/* ---------------------------------------------------------------------------
   HOW THIS MAPS TO REACT

   fetch calls            → live in an api/ or services/ module (never in a component)
   search(query)          → useEffect(() => { ...search... }, [query]) with AbortController cleanup
   suggest + debounce     → a custom hook useDebouncedSearch(query) (Part 4), or TanStack Query's
                            built-in debouncing (Part 9)
   lastRequestCount       → a dev-only counter; in production use the Network tab / React DevTools
   getDetail(id)          → useParams() gives the id; useEffect depends on [id]
   withRetry              → wrap the api call in the query layer, not in JSX
   withTimeout            → configured once on the HTTP client (axios timeout / fetch + AbortController)
   loading/error/empty    → useState triples, or TanStack Query's isLoading/isError/data (Parts 7 and 9)
   the mock server        → replaced by MSW in tests (Part 13) or a real backend in production
---------------------------------------------------------------------------- */
```

**Expected output (timings and random delays vary)**

```text
--- basic search ---
results: [ 'react result 1', 'react result 2', 'react result 3', 'react result 4', 'react result 5' ]

--- fast typing: only the last query should win ---
last query results: [ 'react result 1', …, 'react result 5' ]
requests actually sent: 1

--- detail ---
{ id: 3, title: 'Item 3' }
404 path: 404 HTTP 404 for /items/99 permanent? true

--- flaky endpoint with retry ---
retry 1 after 20ms (HTTP 500)
retry 2 after 40ms (HTTP 500)
flaky result: { ok: true, attempts: 3 }
```

**What this challenge proves**

- **Debouncing plus aborting is what keeps a search box from hammering your API.**
  Four keystrokes produced exactly **one** request (`requests actually sent: 1`)
  because the debounce collapses them and the abort cancels anything in flight.
- **Where the debounced function is created decides whether debouncing works.**
  This is the trap I hit while writing this exercise: creating the debounced
  function *inside* `suggest` gives every keystroke its own `setTimeout`, so
  nothing collapses — the four keystrokes produced **four** requests and the
  results came from the *third* query. Hoisting `runDebounced` into the closure
  (created once, reused for every keystroke) is what makes it work. The same rule
  applies in React: pass a stable, memoized handler to the input, or the debounce
  is recreated on every render (Part 4's `useCallback`).
- **Aborting a request is not an error you should show users.** The `AbortError`
  branch returns silently; that is the correct behaviour.
- **Retries are for transient failures.** `flaky` fails with 500 (retryable) and
  succeeds on the third call; the 404 from `/items/99` is marked `permanent` so it
  is never retried.
- **Timeouts bound worst-case latency**, so one hanging endpoint cannot freeze a
  screen.
- **The final comment block is the point of the exercise:** every piece of this
  plain-JavaScript client has a named home in React, and none of it belongs inside
  a component's JSX.

---

## 9. Summary

- `async` functions always return a promise; `await` pauses the **function**, not
  the page.
- `try`/`catch`/`finally` works with `await` — that is the main reason to prefer it
  over `.then()` chains.
- **`fetch` does not reject on HTTP errors.** Check `response.ok`.
- Read the body **once** (`json()`, `text()`, `blob()`); `204` has no body.
- `POST`/`PATCH` need `JSON.stringify(body)` and `Content-Type: application/json`.
- Build query strings with `URLSearchParams`; encode path segments with
  `encodeURIComponent`.
- **Parallel `await Promise.all` for independent work, sequential `await` only when
  the next call needs the previous result.**
- `await` inside `forEach` silently does nothing useful — use `for...of` or
  `Promise.all(map)`.
- Cancel with **`AbortController`**; ignore `AbortError`; add timeouts.
- In React: not `async` in `useEffect`/`useMemo`/components; **yes** `async` in
  event handlers, inner effect functions, loaders and hooks.
- Always handle the four UI states: **loading, error, empty, success.**

**What's next →** [`../02-typescript/01-typescript-introduction.md`](../02-typescript/01-typescript-introduction.md).
Part 1 is done: you can now write modern JavaScript, reason about data shapes,
sequence asynchronous work, and call APIs. Next you will learn to **describe those
shapes with types**, which is what turns the APIs you just learned into
self-documenting code — and then React itself in Part 3.
