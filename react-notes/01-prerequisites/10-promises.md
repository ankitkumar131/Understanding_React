# 10 — Promises

> **Part 1 · Prerequisites · File 10 of 11**
>
> **Why this file exists:** every API call in React returns a promise. Every
> "Loading…" state exists because a promise had not settled yet. If promises are
> vague to you, `useEffect` + `fetch` will be a guessing game. This file makes the
> lifecycle of a request obvious.

---

## 1. The problem: asynchronous code

JavaScript runs your code on **one thread**, one line at a time. But some work
takes time in the outside world: network requests, timers, reading files, waiting
for a user.

If JavaScript *waited* for each of those, the page would freeze. So instead it
starts the work, keeps going, and runs a **callback** when the work finishes.

```js
console.log('1. start');

setTimeout(() => {
  console.log('3. timer finished (after 1s)');
}, 1000);

console.log('2. end');
```

**Output:**

```text
1. start
2. end
3. timer finished (after 1s)
```

`setTimeout` does not block. It schedules a callback and returns immediately.

### Why callbacks alone are painful

Fetch a user, then their orders, then each order's items, then render:

```js
getUser(userId, (userError, user) => {
  if (userError) return handle(userError);

  getOrders(user.id, (ordersError, orders) => {
    if (ordersError) return handle(ordersError);

    getItems(orders[0].id, (itemsError, items) => {
      if (itemsError) return handle(itemsError);

      render(user, orders, items);
    });
  });
});
```

This is **callback hell**: three levels of indentation, error handling repeated at
every level, and no clean way to run two things at once. It gets worse with each
extra step — and real features have many steps.

**A promise is a value that represents "something that will finish later"**, which
you can chain, combine and pass around. That is the fix.

---

## 2. What a promise is

```text
                 ┌──────────────┐
   new Promise ──▶│   pending    │  (work in progress)
                 └──────┬───────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
   ┌─────────────┐             ┌─────────────┐
   │  fulfilled  │             │  rejected   │
   │  (resolved) │             │  (failed)   │
   └─────────────┘             └─────────────┘
     .then(value)                .catch(error)
```

A promise is **always in exactly one of three states**:

| State | Meaning | Settled? |
| --- | --- | --- |
| `pending` | still working | no |
| `fulfilled` | finished successfully, with a **value** | yes |
| `rejected` | failed, with a **reason** (usually an `Error`) | yes |

Once settled, **a promise never changes again**. Calling `.then()` after it has
resolved still works — you just get the value immediately (on the next tick).

### Creating a promise

```js
const promise = new Promise((resolve, reject) => {
  // Do something asynchronous...
  const success = true;

  if (success) {
    resolve('the value');    // → fulfilled with 'the value'
  } else {
    reject(new Error('something failed')); // → rejected
  }
});

console.log(promise); // Promise { 'the value' }  (or Promise { <pending> })
```

You will rarely write `new Promise` yourself. It appears in three places in real
React work:

1. **Wrapping a callback API** (a `setTimeout`, a legacy library).
2. **A deliberate artificial delay** (`await new Promise(r => setTimeout(r, ms))`).
3. **Testing helpers**.

Everything else — `fetch`, `axios`, `import()` — already returns a promise.

```js
// The "delay" helper you will write at least fifty times in your career
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await wait(500); // now you can pause inside an async function
```

---

## 3. `.then()`, `.catch()`, `.finally()`

```js
fetch('https://api.example.com/users/1')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();          // returns ANOTHER promise
  })
  .then((user) => {
    console.log('user:', user);      // the resolved value of the previous step
  })
  .catch((error) => {
    console.error('failed:', error.message); // any rejection above lands here
  })
  .finally(() => {
    console.log('done — success or failure'); // cleanup; runs either way
  });
```

Rules that make promises click:

1. **`.then()` returns a new promise.** That is why you can chain.
2. **Whatever you `return` from a `.then()` becomes the value of the next
   `.then()`.** If you return a promise, the chain *waits* for it.
3. **One `.catch()` at the end catches errors from every step above it.**
4. **`.finally()` runs in both cases** and passes the value/error through
   unchanged (it is for cleanup, not for transforming values).

```js
Promise.resolve(1)
  .then((n) => n + 1)      // 2
  .then((n) => n * 10)     // 20
  .then((n) => {
    throw new Error('boom at ' + n);
  })
  .catch((error) => `recovered: ${error.message}`) // returns a VALUE
  .then((value) => console.log(value));            // "recovered: boom at 20"
```

That last chain shows something important: **a `.catch()` that returns a value
puts the chain back into the success path.** A `.catch()` that throws (or returns
a rejected promise) keeps it failed.

### Values, not callbacks: passing a function reference

```js
const logUser = (user) => console.log(user.name);

// ✅ Pass the function
fetch('/api/me').then((r) => r.json()).then(logUser);

// ❌ Calls it immediately with nothing and passes `undefined` as the handler
// fetch('/api/me').then(logUser());
```

Same trap as `onClick={handle}` vs `onClick={handle()}` in React. It shows up in
both worlds because the underlying idea — passing functions around — is the same.

---

## 4. Combining promises

### `Promise.all` — wait for all, fail fast

```js
const [user, orders, settings] = await Promise.all([
  fetch('/api/user').then((r) => r.json()),
  fetch('/api/orders').then((r) => r.json()),
  fetch('/api/settings').then((r) => r.json()),
]);
```

- Runs all three **in parallel** (they start immediately, at the same time).
- Resolves with an **array of results in the same order** as the input, no matter
  which finished first.
- **Rejects as soon as any promise rejects** — one failure fails the whole thing.

```js
// Timings, to make the parallelism concrete
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.time('parallel');
await Promise.all([wait(300), wait(300), wait(300)]);
console.timeEnd('parallel');   // ~300ms, not 900ms
```

**React use:** a dashboard that needs three endpoints before it can render.

### `Promise.allSettled` — wait for all, never fail

```js
const results = await Promise.allSettled([
  fetch('/api/user').then((r) => r.json()),
  fetch('/api/missing').then((r) => {
    if (!r.ok) throw new Error('404');
    return r.json();
  }),
]);

console.log(results);
// [
//   { status: 'fulfilled', value: {...} },
//   { status: 'rejected', reason: Error: 404 }
// ]
```

**React use:** partial dashboards, where one broken widget should not blank the
page.

```tsx
const results = await Promise.allSettled([loadSales(), loadVisitors(), loadErrors()]);
const [sales, visitors, errors] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
// Then render each widget with its own "unavailable" state.
```

### `Promise.race` — first to settle wins (success *or* failure)

```js
// A timeout pattern you will implement in Part 7
function fetchWithTimeout(url, timeoutMs = 5000) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}
```

### `Promise.any` — first **success** wins

```js
// Try two mirrors; take whichever answers first, ignore failures
const response = await Promise.any([
  fetch('https://api-primary.example.com/data'),
  fetch('https://api-backup.example.com/data'),
]);
```

If *all* reject, `Promise.any` rejects with an `AggregateError` containing every
reason.

### Cheat table

| Method | Resolves when | Rejects when | Use for |
| --- | --- | --- | --- |
| `Promise.all` | all fulfil | **any** rejects | required data in parallel |
| `Promise.allSettled` | all settle | never | optional/independent data |
| `Promise.race` | first settles (either way) | first to reject | timeouts |
| `Promise.any` | first fulfils | all reject | redundant sources |

---

## 5. Error handling: what actually counts as a rejection

```js
// 1. An explicit rejection
Promise.reject(new Error('nope')).catch((e) => console.log(e.message)); // "nope"

// 2. A thrown error inside a then/callback
Promise.resolve()
  .then(() => {
    throw new Error('thrown');
  })
  .catch((e) => console.log(e.message)); // "thrown"

// 3. A returned rejected promise
Promise.resolve()
  .then(() => Promise.reject(new Error('returned')))
  .catch((e) => console.log(e.message)); // "returned"

// 4. Asynchronous throws inside setTimeout are NOT caught by the promise chain
Promise.resolve()
  .then(() => {
    setTimeout(() => {
      throw new Error('async throw'); // ⚠️ uncaught! crashes/logs separately
    }, 0);
  })
  .catch((e) => console.log('never runs:', e.message));
```

### Rejections are always `Error` objects — please

```js
// ❌ Rejecting with a string loses stack traces and is inconsistent
Promise.reject('Something failed');

// ✅ Always reject with an Error (or a subclass)
Promise.reject(new Error('Something failed'));

// ✅ With extra data — this is what API layers do (see file 03's ApiError)
class HttpError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}
```

### Unhandled rejections

```js
// ⚠️ No catch: the browser prints "Uncaught (in promise) Error: ..."
fetch('/api/whatever').then((r) => r.json());
```

In a React app an unhandled rejection usually means a spinner that spins forever.
Every request needs a `.catch()` (or a `try/catch` around an `await`).

### Don't swallow errors

```js
// ❌ The user sees an empty screen and nobody knows why
.doWork().catch(() => {});

// ✅ At minimum, log it; ideally, surface it to the UI
.doWork().catch((error) => {
  console.error('doWork failed:', error);
  setError(error);          // show a message to the user (Part 7)
});
```

---

## 6. The microtask queue (why order surprises happen)

Promises resolve on the **microtask queue**, which runs *before* timers.

```js
console.log('1 script start');

setTimeout(() => console.log('2 setTimeout (macrotask)'), 0);

Promise.resolve().then(() => console.log('3 promise (microtask)'));

console.log('4 script end');

// Output:
// 1 script start
// 4 script end
// 3 promise (microtask)
// 2 setTimeout (macrotask)
```

Practical consequences:

```js
let value = 'initial';

Promise.resolve().then(() => {
  value = 'updated';
});

console.log(value); // "initial" ⚠️ — the .then() has not run yet
```

**The React-relevant version of this:** state updates and promise callbacks do not
happen "instantly" at the line you wrote them. This is the same reason
`setCount(count + 1); console.log(count)` prints the old value — you are reading a
snapshot, and the update lands later.

---

## 7. Promises in React

### 7.1 `useEffect` cannot be `async`

```tsx
// ❌ React will warn: "Effect callbacks are synchronous to prevent race conditions"
useEffect(async () => {
  const response = await fetch('/api/users');
  const users = await response.json();
  setUsers(users);
}, []);

// ✅ Async function INSIDE the effect
useEffect(() => {
  let cancelled = false;

  async function load() {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const users: User[] = await response.json();
      if (!cancelled) setUsers(users);
    } catch (error) {
      if (!cancelled) setError(error as Error);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  }

  load();

  // Cleanup: ignore a late response when the component unmounts or deps change
  return () => {
    cancelled = true;
  };
}, []);
```

Why the inner function? Because `async` functions always return a promise, and
React expects the effect callback to return **either nothing or a cleanup
function**. Returning a promise breaks that contract. (Full explanation in
Part 4.)

### 7.2 Race conditions: the bug promises cause in UIs

```tsx
// ❌ Problem: type "ab", then quickly type "abc".
// If the response for "ab" arrives AFTER "abc", you show results for "ab".
useEffect(() => {
  fetchSearch(query).then((results) => setResults(results));
}, [query]);
```

Three standard fixes, all of which you will use:

```tsx
// ✅ 1. A boolean guard per request (ignore stale responses)
useEffect(() => {
  let ignore = false;

  fetchSearch(query).then((results) => {
    if (!ignore) setResults(results);
  });

  return () => {
    ignore = true;
  };
}, [query]);
```

```tsx
// ✅ 2. AbortController: actually cancel the request (Part 7 covers this fully)
useEffect(() => {
  const controller = new AbortController();

  fetchSearch(query, { signal: controller.signal })
    .then((results) => setResults(results))
    .catch((error) => {
      if (error.name !== 'AbortError') setError(error);
    });

  return () => controller.abort();
}, [query]);
```

```tsx
// ✅ 3. Let a data library handle it (TanStack Query, Part 9)
const { data: results, isLoading } = useQuery({
  queryKey: ['search', query],
  queryFn: () => fetchSearch(query),
});
```

> 🏭 **Production rule:** never trust "the last request I made" to be "the request
> whose response arrives last". Networks do not preserve order. Either cancel,
> ignore stale responses, or hand the problem to a library that does it for you.

### 7.3 Event handlers can be `async`

```tsx
function SaveButton({ data }: { data: Payload }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // success!
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={isSaving}>
      {isSaving ? 'Saving…' : 'Save'}
    </button>
  );
}
```

`handleClick` is passed to `onClick` and returns a promise — React does not care,
because it ignores the return value of event handlers. (Contrast with effects,
where the return value *is* meaningful.)

### 7.4 Promise-returning props

```tsx
interface ConfirmProps {
  onConfirm: () => Promise<void>;   // ← async callback type
}

function ConfirmDialog({ onConfirm }: ConfirmProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        try {
          await onConfirm();
        } finally {
          setIsPending(false);
        }
      }}
    >
      Confirm
    </button>
  );
}
```

---

## 8. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Forgetting to `return` inside `.then()` | Next step receives `undefined` | return the value *or* the inner promise |
| `async` callback passed directly to `useEffect` | Warning about effect callbacks | define an inner async function, call it |
| No `.catch()` / `try` | Spinner spins forever; "Uncaught (in promise)" | always handle rejection |
| `Promise.all` for optional data | One failure blanks the whole view | `Promise.allSettled` |
| Sequential `await`s in a loop | Slow (n round trips) | `Promise.all` for independent work |
| Assuming promise callbacks run immediately | Reading stale values on the next line | values update in a later microtask |
| Race conditions on fast typing | Results from an old query overwrite new ones | ignore flag, `AbortController`, or a query library |
| Rejecting with a string | No stack trace; inconsistent handling | reject with `Error` |
| Swallowing errors with an empty `catch` | Silent failures | log and/or show an error state |
| `new Promise` around code that already returns a promise | Extra nesting, harder errors | just `return fetch(...)` |
| Mixing `.then()` and `await` on the same call | Confusing flow | pick one style per function (prefer `await`) |

---

## 9. Practice exercises

### Beginner

Predict the outputs, then verify (as a browser-console snippet or in a `.js` file
run with `node`).

```js
// 1
console.log('A');
Promise.resolve('B').then((v) => console.log(v));
console.log('C');

// 2
Promise.resolve(2)
  .then((n) => n * 3)
  .then((n) => n + 4)
  .then((n) => console.log('value:', n));

// 3
Promise.reject(new Error('bad'))
  .catch((e) => {
    console.log('caught:', e.message);
    return 'recovered';
  })
  .then((v) => console.log('then:', v));

// 4
Promise.all([Promise.resolve(1), Promise.reject(new Error('x')), Promise.resolve(3)])
  .then((v) => console.log('all:', v))
  .catch((e) => console.log('all failed:', e.message));

// 5
Promise.allSettled([Promise.resolve(1), Promise.reject(new Error('x'))]).then(console.log);
```

**Solution**

```text
A
C
B                     ← microtasks run after the current script finishes

value: 10             ← 2 * 3 = 6, then 6 + 4 = 10

caught: bad
then: recovered       ← a catch that returns a value resumes the success path

all failed: x         ← Promise.all fails fast

[
  { status: 'fulfilled', value: 1 },
  {
    status: 'rejected',
    reason: Error: x
        at <stack trace lines…>
  }
]
```

> 💡 `console.log` prints an `Error` with its full stack, which is why the fifth
> result looks noisy. If you only want the message, log `reason.message` (or map
> the results before logging).

**The lesson:** logging `A`, `C`, `B` is not a quirk — it is the microtask queue.
Once you internalise that, the timing of `console.log` around `setState` stops
being surprising.

### Intermediate

Write `promises.js` implementing these functions, then demonstrate each:

1. `delay(ms)` → resolves after `ms` milliseconds with the string `"waited <ms>ms"`.
2. `fetchUser(id)` → a fake API using `delay`, resolving with
   `{ id, name }`; reject for `id <= 0` with an `Error`, and reject for `id === 13`
   with an error whose `status` is `404`.
3. `fetchUserWithTimeout(id, timeoutMs)` → uses `Promise.race` to reject with a
   timeout error if the fake API is too slow.
4. `fetchAllUsers(ids)` → uses `Promise.all`; returns **both** the users and the
   errors separately, so one failure does not lose the successes
   (use `Promise.allSettled` internally).
5. `firstSuccessful(...tasks)` → uses `Promise.any`; if all fail, resolves with
   `null` instead of throwing.
6. `retry(fn, attempts)` → retries the promise-returning `fn` on failure, and
   re-throws the last error when attempts run out.
7. `runInParallel()` → runs three `delay` calls and prints the elapsed time;
   then `runSequentially()` does the same with `await`s in order, proving the
   difference.

**Solution**

```text
js-playground/promises.js
```

```js
// ---------------------------------------------------------------- 1
const delay = (ms) => new Promise((resolve) => setTimeout(() => resolve(`waited ${ms}ms`), ms));

// ---------------------------------------------------------------- 2
const USERS = {
  1: { id: 1, name: 'Ada Lovelace' },
  2: { id: 2, name: 'Grace Hopper' },
};

function fetchUser(id) {
  return new Promise((resolve, reject) => {
    if (id <= 0) {
      reject(new Error(`Invalid user id: ${id}`));
      return;
    }

    setTimeout(() => {
      if (id === 13) {
        const error = new Error('User not found');
        error.status = 404;
        reject(error);
        return;
      }
      resolve(USERS[id] ?? { id, name: `User ${id}` });
    }, 100);
  });
}

// ---------------------------------------------------------------- 3
function fetchUserWithTimeout(id, timeoutMs = 150) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([fetchUser(id), timeout]);
}

// ---------------------------------------------------------------- 4
async function fetchAllUsers(ids) {
  const results = await Promise.allSettled(ids.map((id) => fetchUser(id)));

  return results.reduce(
    (acc, result, index) => {
      if (result.status === 'fulfilled') {
        acc.users.push(result.value);
      } else {
        acc.errors.push({ id: ids[index], message: result.reason.message });
      }
      return acc;
    },
    { users: [], errors: [] }
  );
}

// ---------------------------------------------------------------- 5
async function firstSuccessful(...tasks) {
  try {
    return await Promise.any(tasks);
  } catch {
    return null; // every task failed
  }
}

// ---------------------------------------------------------------- 6
async function retry(fn, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      console.log(`attempt ${attempt} failed: ${error.message}`);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------- 7
async function runInParallel() {
  const started = Date.now();
  await Promise.all([delay(200), delay(200), delay(200)]);
  console.log(`parallel took ~${Date.now() - started}ms`); // ~200ms
}

async function runSequentially() {
  const started = Date.now();
  await delay(200);
  await delay(200);
  await delay(200);
  console.log(`sequential took ~${Date.now() - started}ms`); // ~600ms
}

// ---------------------------------------------------------------- demo
async function main() {
  console.log(await delay(10));                      // "waited 10ms"

  console.log(await fetchUser(1));                   // { id: 1, name: 'Ada Lovelace' }

  await fetchUser(13).catch((error) =>
    console.log('caught 404:', error.message, 'status:', error.status)
  );

  // A 100ms API with a 50ms timeout → the timeout wins
  await fetchUserWithTimeout(1, 50).catch((error) =>
    console.log('timeout path:', error.message)
  );

  console.log(await fetchAllUsers([1, 2, 13, -1]));
  // { users: [ {1...}, {2...} ], errors: [ { id: 13, message: 'User not found' },
  //                                         { id: -1, message: 'Invalid user id: -1' } ] }

  console.log(await firstSuccessful(
    Promise.reject(new Error('a')),
    delay(20).then(() => 'second wins')
  )); // "second wins"

  console.log(await firstSuccessful(Promise.reject(new Error('x')))); // null

  let attemptCount = 0;
  const flaky = async () => {
    attemptCount += 1;
    if (attemptCount < 3) throw new Error('flaky');
    return `succeeded after ${attemptCount} attempts`;
  };
  console.log(await retry(flaky, 5));

  await runInParallel();
  await runSequentially();
}

main().catch((error) => console.error('unexpected failure:', error));
```

**Expected output (timings approximate)**

```text
waited 10ms
{ id: 1, name: 'Ada Lovelace' }
caught 404: User not found status: 404
timeout path: Timed out after 50ms
{
  users: [ { id: 1, name: 'Ada Lovelace' }, { id: 2, name: 'Grace Hopper' } ],
  errors: [ { id: 13, message: 'User not found' },
            { id: -1, message: 'Invalid user id: -1' } ]
}
second wins
null
attempt 1 failed: flaky
attempt 2 failed: flaky
succeeded after 3 attempts
parallel took ~200ms
sequential took ~600ms
```

**Why this solution is good**

- **`delay` is the tests-and-demos workhorse** — remember it; you will write it
  constantly.
- **`fetchUser` rejects with real `Error` objects** and attaches `status` to the
  404 case, because UI code needs to distinguish "not found" from "network down".
- **`fetchUserWithTimeout` never awaits the loser.** `Promise.race` leaves the
  losing promise running (here that is fine; for real requests you would also
  abort it — see Part 7).
- **`fetchAllUsers` keeps successes and failures side by side.** A dashboard that
  shows four widgets and one error message is better than a blank page.
- **`firstSuccessful` converts "all failed" into `null`**, so callers do not need
  a `try/catch` for an expected outcome.
- **`retry` uses a `for` loop with `await`**, which is the readable way to express
  "try again". Compare it to the recursion in file 8 — both work; the loop is
  easier to reason about.
- **`runInParallel` vs `runSequentially`** makes the difference measurable instead
  of theoretical: 200ms vs 600ms.

### Challenge

Build `pipeline.js` — a small **data-loading pipeline** with realistic failure
handling. This is the shape of a real dashboard's data layer.

Requirements:

1. `createFetcher({ latency, failureRate })` returns a function
   `fetchResource(name)` that:
   - resolves with `{ name, data: 'payload for <name>', attempt }` after
     `latency` ms;
   - rejects with an `Error` (with a `.transient = true` property before
     `failureRate` attempts have failed) at a random rate below `failureRate`;
   - always succeeds on the third attempt for the same resource (so retries
     terminate).
2. `loadWithRetry(fetchResource, names, { attempts = 3, timeoutMs = 500 })`:
   - loads all resources **in parallel**;
   - retries only *transient* failures, up to `attempts` times;
   - applies a timeout per resource using `Promise.race`;
   - never rejects: returns `{ loaded, failed }` where `failed` entries are
     `{ name, reason }`.
3. `loadWithFallback(primary, fallbackName)`: try the primary loader; if it fails,
   load a fallback resource and mark the result `degraded: true`.
4. `report(results)`: prints a table-ish summary and returns a small object
   `{ ok, degraded, failed }`.
5. A `main()` that:
   - demonstrates a healthy load,
   - demonstrates a load with a permanently failing resource (use a name like
     `'broken'` that always fails),
   - demonstrates the fallback path,
   - prints the total elapsed time and shows that resources loaded in parallel.

**Solution**

```text
js-playground/pipeline.js
```

```js
// ---------------------------------------------------------------- helpers
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms, label) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
};

// ---------------------------------------------------------------- 1. fetcher
function createFetcher({ latency = 60, failureRate = 0.5, maxAttempts = 3 } = {}) {
  const attemptsByResource = new Map();

  return async function fetchResource(name) {
    const attempt = (attemptsByResource.get(name) ?? 0) + 1;
    attemptsByResource.set(name, attempt);

    await wait(latency);

    // A deliberately broken resource: always fails, permanently
    if (name === 'broken') {
      const error = new Error(`"${name}" is permanently broken`);
      error.transient = false;
      throw error;
    }

    // Succeed by the maxAttempts-th try so retries always terminate
    const shouldFail = attempt < maxAttempts && Math.random() < failureRate;

    if (shouldFail) {
      const error = new Error(`transient failure for "${name}" (attempt ${attempt})`);
      error.transient = true;
      throw error;
    }

    return { name, data: `payload for ${name}`, attempt };
  };
}

// ---------------------------------------------------------------- 2. retry + timeout
async function loadOne(fetchResource, name, { attempts, timeoutMs }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(fetchResource(name), timeoutMs, name);
    } catch (error) {
      lastError = error;

      // Permanent failures (or timeouts) are not retried
      if (error.transient !== true) break;
    }
  }

  throw lastError;
}

async function loadWithRetry(fetchResource, names, { attempts = 3, timeoutMs = 500 } = {}) {
  const settled = await Promise.allSettled(
    names.map((name) => loadOne(fetchResource, name, { attempts, timeoutMs }))
  );

  return settled.reduce(
    (acc, result, index) => {
      if (result.status === 'fulfilled') {
        acc.loaded.push(result.value);
      } else {
        acc.failed.push({ name: names[index], reason: result.reason });
      }
      return acc;
    },
    { loaded: [], failed: [] }
  );
}

// ---------------------------------------------------------------- 3. fallback
async function loadWithFallback(fetchResource, primaryName, fallbackName) {
  try {
    const resource = await fetchResource(primaryName);
    return { ...resource, degraded: false };
  } catch (primaryError) {
    // Note: the fallback may itself throw — the caller still sees a rejection
    const fallback = await fetchResource(fallbackName);
    return {
      ...fallback,
      degraded: true,
      fallbackReason: primaryError.message,
    };
  }
}

// ---------------------------------------------------------------- 4. report
function report({ loaded, failed }) {
  console.log('\n--- load report ---');
  for (const { name, data, attempt } of loaded) {
    console.log(`✅ ${name.padEnd(10)} ${data} (attempt ${attempt})`);
  }
  for (const { name, reason } of failed) {
    console.log(`❌ ${name.padEnd(10)} ${reason.message}`);
  }

  return {
    ok: failed.length === 0,
    degraded: loaded.some(({ degraded }) => degraded === true),
    failed: failed.length,
  };
}

// ---------------------------------------------------------------- 5. demo
async function main() {
  const fetchResource = createFetcher({ latency: 60, failureRate: 0.6 });

  console.log('--- healthy load (parallel) ---');
  let started = Date.now();
  const healthy = await loadWithRetry(fetchResource, ['users', 'orders', 'settings']);
  console.log(`elapsed: ~${Date.now() - started}ms`); // ~60-180ms, not 3x
  console.log(report(healthy));

  console.log('\n--- with a permanently broken resource ---');
  const broken = await loadWithRetry(fetchResource, ['users', 'broken'], { attempts: 3, timeoutMs: 400 });
  console.log(report(broken));   // users ✅, broken ❌

  console.log('\n--- fallback ---');
  const withFallback = await loadWithFallback(fetchResource, 'primary-feed', 'cached-feed');
  console.log(withFallback);
  // { name: 'cached-feed', data: ..., degraded: true, fallbackReason: 'transient failure…' }

  console.log('\n--- partial dashboard (allSettled) ---');
  const partial = await Promise.allSettled([
    fetchResource('sales'),
    fetchResource('visitors'),
    fetchResource('errors'),
  ]);
  console.log(
    partial.map((r, i) => (r.status === 'fulfilled' ? `widget ${i}: ok` : `widget ${i}: unavailable`))
  );
}

main().catch((error) => console.error('unexpected failure:', error));
```

**Expected output (randomness means exact lines vary)**

```text
--- healthy load (parallel) ---
elapsed: ~60-180ms
--- load report ---
✅ users      payload for users (attempt 1)
✅ orders     payload for orders (attempt 2)
✅ settings   payload for settings (attempt 1)
{ ok: true, degraded: false, failed: 0 }

--- with a permanently broken resource ---
--- load report ---
✅ users      payload for users (attempt 1)
❌ broken     "broken" is permanently broken
{ ok: false, degraded: false, failed: 1 }

--- fallback ---
{ name: 'cached-feed', data: 'payload for cached-feed', attempt: 1,
  degraded: true, fallbackReason: 'transient failure for "primary-feed" (attempt 1)' }

--- partial dashboard (allSettled) ---
[ 'widget 0: ok', 'widget 1: unavailable', 'widget 2: ok' ]
```

**Why this solution is a realistic data layer**

- **Transient vs permanent errors drive the retry decision.** Retrying a broken
  request forever is a real production bug; the `transient` flag is exactly how
  real clients distinguish "try again" from "give up and show an error" (Part 7).
- **Timeouts are per resource, not per page.** One slow endpoint should not block
  the others, which is why `withTimeout` wraps the individual fetch.
- **`Promise.allSettled` at the top level** means the dashboard renders whatever
  succeeded, and reports the rest — far better UX than an all-or-nothing load.
- **The fallback returns a usable value with `degraded: true`**, so the UI can
  show a subtle "showing cached data" notice instead of an error.
- **Parallelism shows up in the clock.** Three 60ms resources finish in ~60-180ms
  (retries add time), not 300ms — a difference you can measure and quote when
  someone asks why you used `Promise.all`.

---

## 10. Summary

- Asynchronous code does not block; callbacks were the first solution and caused
  callback hell.
- A promise is a value that is `pending`, `fulfilled` or `rejected` — and once
  settled, never changes.
- `.then()` transforms, `.catch()` handles failures (returning a value recovers
  the chain), `.finally()` cleans up.
- `Promise.all` (fail fast), `allSettled` (never fails), `race` (first settles),
  `any` (first success) — know which one your situation needs.
- Rejections travel through the chain; **always handle them**, and always reject
  with `Error` objects.
- Promises run on the **microtask queue**, so their callbacks run after the
  current script — which is why reading a value right after setting it shows the
  old one.
- In React: effects cannot be `async` (use an inner function), event handlers can;
  guard against **race conditions** with an ignore flag, `AbortController`, or a
  data library.

**What's next →** [`11-async-await.md`](./11-async-await.md): the syntax that makes
all of this read like synchronous code — and the last prerequisite before React
itself.
