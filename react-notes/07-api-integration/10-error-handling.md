# 10 — Error Handling: Taxonomies, Retries, Timeouts, and What to Tell the User

> **Part 7 · API Integration · File 10 of 11**
> Why this file exists: the network is the least reliable part of any app, and "Something went wrong" is the least useful sentence in software. This file gives every failure a name, a decision, and a sentence the user can act on. Two measured transcripts anchor it: a retry policy that recovered from two `503`s (`attempt 1: 503 → waiting 100ms → attempt 2: 503 → waiting 200ms → attempt 3: 200 OK`) and refused to retry a `404`, a `401`, or an abort; and the fetch taxonomy where a dead port throws `TypeError: fetch failed`, a timeout reports `TimeoutError`, and an abort reports `AbortError`.

---

## 1. Everything that can go wrong

| # | Failure | How you detect it | Whose problem | User-facing meaning |
| --- | --- | --- | --- | --- |
| 1 | No connection / DNS / CORS block | `fetch` **rejects** with `TypeError: fetch failed` (browser: `Failed to fetch`) | the environment | "You appear to be offline." |
| 2 | Timeout | `TimeoutError: The operation was aborted due to timeout`, or axios `ECONNABORTED` | the network/server | "This is taking longer than usual." |
| 3 | The user navigated away | `AbortError: This operation was aborted` | nobody | **say nothing** |
| 4 | Validation failure (`400`, `422`) | `ok === false`, JSON body with field errors | the user's input | per-field messages |
| 5 | Not signed in (`401`) | status `401` | the session | "Your session expired — sign in again." |
| 6 | Not allowed (`403`) | status `403` | permissions | "Your account does not have access." |
| 7 | Gone (`404`) | status `404` (body `{}` in the lab) | the data | "We could not find that record." |
| 8 | Conflict (`409`, `412`) | status, body with details | concurrent users | "Somebody else changed this." |
| 9 | Too many requests (`429`) | status, maybe `Retry-After` | rate limits | "Too many requests — try again in a moment." |
| 10 | Server broke (`500`–`599`) | status, JSON error body | the server | "Something broke on our side." |
| 11 | **Our own bug** in the component | a thrown error during render | us | an error boundary + a bug report |
| 12 | A malformed response (HTML where JSON was promised) | `SyntaxError`, or a `HttpError` from the content-type check | the server/proxy | "We could not read the response." |

Categories 1–3 are **transport** failures (`fetch` rejects). Categories 4–10 are **HTTP** failures (the response arrived and said no). Category 11 is a **render** failure, which is a different mechanism entirely (section 8). Category 12 is the surprise that file 01 measured: a `400` whose body is `text/html`.

⚠️ The distinction matters because the *remedy* differs: transport failures are retried (sometimes), HTTP failures are interpreted (never blindly retried), render failures need a boundary, and aborts need silence.

---

## 2. One error type for the whole app

```ts
// File: src/api/errors.ts — the app's vocabulary for failure
import { HttpError } from './http';

export type FailureKind =
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'server'
  | 'unreadable'
  | 'unknown';

export interface Failure {
  kind: FailureKind;
  /** The sentence to show the user. */
  message: string;
  /** The status, when there was a response. */
  status?: number;
  /** Whether retrying the same request could plausibly help. */
  retryable: boolean;
  /** The technical detail, for logs — never rendered raw. */
  cause?: unknown;
}

export function classify(error: unknown): Failure {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'cancelled', message: 'Cancelled.', retryable: false, cause: error };
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return { kind: 'timeout', message: 'This is taking longer than usual. Try again?', retryable: true, cause: error };
  }
  if (error instanceof TypeError) {
    return { kind: 'offline', message: 'You appear to be offline. Check your connection and try again.', retryable: true, cause: error };
  }
  if (error instanceof HttpError) {
    const body = error.body as { message?: string; errors?: Record<string, string> } | null;
    const serverMessage = typeof body?.message === 'string' ? body.message : undefined;

    switch (error.status) {
      case 400:
      case 422:
        return { kind: 'validation', message: serverMessage ?? 'Please check the highlighted fields.', status: error.status, retryable: false, cause: error };
      case 401:
        return { kind: 'unauthorized', message: 'Your session expired. Sign in again to continue.', status: 401, retryable: false, cause: error };
      case 403:
        return { kind: 'forbidden', message: 'Your account does not have access to this.', status: 403, retryable: false, cause: error };
      case 404:
        return { kind: 'notFound', message: 'We could not find that record.', status: 404, retryable: false, cause: error };
      case 409:
      case 412:
        return { kind: 'conflict', message: 'Somebody else changed this while you were working. Reload to see the current values.', status: error.status, retryable: false, cause: error };
      case 429:
        return { kind: 'rateLimited', message: 'Too many requests just now. Try again in a moment.', status: 429, retryable: true, cause: error };
      default:
        if (error.status >= 500) {
          return { kind: 'server', message: 'Something broke on our side. We are on it — try again in a moment.', status: error.status, retryable: true, cause: error };
        }
        return { kind: 'unknown', message: serverMessage ?? `Request failed with ${error.status}`, status: error.status, retryable: false, cause: error };
    }
  }
  return { kind: 'unknown', message: 'Something went wrong. Try again.', retryable: false, cause: error };
}
```

Three properties worth noticing:

1. **`retryable` is part of the classification**, not a decision each component makes. `404` is not retryable; `503` and `429` are; `offline` is (later); `cancelled` is not (and should never be shown).
2. **The user-facing message lives here**, so forty screens cannot invent forty phrasings of "server error 500".
3. **`cause` carries the technical detail** for logging, and is *never* rendered — a stack trace in the UI is noise at best and a leak at worst.

The components then become simple:

```tsx
const failure = classify(error);
if (failure.kind === 'cancelled') return;                 // the user left; say nothing
setState({ status: 'error', failure });
```

```tsx
{state.status === 'error' && (
  <p className={state.failure.kind === 'offline' ? 'banner banner-offline' : 'banner banner-error'} role="alert">
    {state.failure.message}
    {state.failure.retryable && <button type="button" onClick={retry}>Try again</button>}
  </p>
)}
```

---

## 3. The retry policy, and the measurements that shaped it

A retry is not "try again in a loop". It is a policy with four rules: **which** failures, **how many** attempts, **how long** between them, and **which** requests.

```ts
// File: src/api/retry.ts
interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

const MAX_ATTEMPTS = 3;

/** Retries only what is safe to retry: network hiccups, 5xx, 408, 429. */
export async function fetchWithRetry(url: string, options: RequestInit = {}, { attempts = MAX_ATTEMPTS, baseDelayMs = 100 }: RetryOptions = {}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
      if (!retryable) throw new Error(`Request failed with ${response.status}`);
      lastError = new Error(`Request failed with ${response.status}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;      // never retry an abort
      if (error instanceof Error && /failed with 4\d\d/.test(error.message)) throw error; // a real decision, not a hiccup
      lastError = error;
    }

    if (attempt < attempts) {
      const delay = baseDelayMs * 2 ** (attempt - 1);      // 100, 200, 400 …
      const jitter = Math.random() * baseDelayMs;          // keeps clients from retrying in lockstep
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw new Error(`Gave up after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
```

Verified, in `/tmp/part7-errors.txt`:

```text
1. the server fails twice, then succeeds (the marker is in the URL):
   attempt 1: 503 (retryable)
   waiting 100ms (+31ms jitter) before the next attempt
   attempt 2: 503 (retryable)
   waiting 200ms (+1ms jitter) before the next attempt
   attempt 3: 200 OK
   → got 1 product(s): p-mouse

2. the server keeps failing and we give up after 3 attempts:
   attempt 1: 503 (retryable) → attempt 2: 503 (retryable) → attempt 3: 503 (retryable)
   → threw: Gave up after 3 attempts: Request failed with 503

3. a 404 is NOT retried (retrying cannot help):
   attempt 1: 404 (NOT retryable — giving up)

4. a 401 is NOT retried either — the user has to sign in:
   attempt 1: 401 (NOT retryable — giving up)

5. an abort is never retried (the caller asked us to stop):
   attempt 1: aborted — never retried

6. total time for 3 attempts with 100 ms base delay (exponential backoff):
   attempt 1: 503 → waiting 100ms (+51ms jitter) → attempt 2: 503 → waiting 200ms (+96ms jitter) → attempt 3: 503
   → gave up after 454ms of wall-clock time
```

| Rule | Here | Why |
| --- | --- | --- |
| **Retry 5xx, 408, 429, network** | `503` twice, then success | transient by definition |
| **Never retry 4xx** | `404`, `401` gave up after one attempt | the request is wrong; repeating it is wrong again |
| **Never retry an abort** | "aborted — never retried" | the *caller* decided to stop (file 09's race fix) |
| **Exponential backoff** | 100 ms, 200 ms, 400 ms … | the server is struggling; hammering makes it worse |
| **Jitter** | `+31ms`, `+96ms` | thousands of clients must not retry in unison |
| **Cap the attempts** | 3 | 454 ms of waiting, then an honest error |

### The idempotency rule

**Never retry a `POST` unless the server supports it.** File 01's warning, re-measured in file 05: `POST` creates a new record every time. A retried `POST` after a timeout is a duplicate order.

| Verb | Safe to retry? |
| --- | --- |
| `GET`, `HEAD`, `OPTIONS` | ✅ always |
| `PUT`, `DELETE` | ✅ idempotent by definition |
| `PATCH` | ✅ for merge patches of the same value (setting `inStock: false` twice is one effect) |
| `POST` | ❌ **unless** the server accepts an idempotency key |

```ts
// The server-side pattern that makes a POST retryable
await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify(order),
});
// The server stores the key with the result: a second request with the same key
// returns the FIRST response instead of creating a second order.
```

### `Retry-After`

When a server answers `429` or `503` with a `Retry-After` header, that is an instruction, not a hint:

```ts
const retryAfter = response.headers.get('retry-after');        // seconds, or an HTTP date
const waitMs = retryAfter ? Number(retryAfter) * 1000 : baseDelayMs;
```

---

## 4. Timeouts: the difference between "slow" and "stuck"

Without a timeout, a request can hang until the browser gives up (minutes) or the tab closes. Every request needs a ceiling, and the ceiling should be *shorter than the user's patience*.

```ts
// fetch: AbortSignal.timeout() — verified error: TimeoutError: The operation was aborted due to timeout
const response = await fetch('/api/products', { signal: AbortSignal.timeout(8000) });

// Composing a caller's signal with a timeout (so "the user left" still wins)
function withTimeout(ms: number, outer?: AbortSignal) {
  return outer ? AbortSignal.any([outer, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

// axios: a first-class option — verified error: ECONNABORTED "timeout of 200ms exceeded"
await axios.get('/api/products', { timeout: 8000 });
```

| Timeout value | For |
| --- | --- |
| 3–5 s | interactive reads the user is waiting on (search, list) |
| 8–10 s | a form submission |
| 30 s+ | uploads, exports, reports (better: make them asynchronous and poll) |
| never | only for deliberately long-lived streams, and only with cancellation |

⚠️ **A timeout must change the UI, not just the request.** The verified measurement: `?delay=800` took `0.805669s` while a normal request took `0.004197s`. When a timeout fires, the component must leave the loading state (otherwise file 09's "skeleton forever" bug appears) and offer a way forward: *"This is taking longer than usual. Try again?"*

---

## 5. What to say: a message policy

Bad messages are the visible half of bad error handling. The rule: **say what happened, in the user's terms, and what they can do next.** Never the exception's text, never a status code alone, never "Something went wrong".

| Situation | ❌ | ✅ |
| --- | --- | --- |
| offline | `TypeError: fetch failed` | "You appear to be offline. Check your connection and try again." |
| `500` | `Request failed with status code 500` | "Something broke on our side. We are on it — try again in a moment." |
| `404` on a detail page | "Error" | "We could not find that product. It may have been deleted." + link back |
| `401` | "Unauthorized" | "Your session expired. Sign in again to continue." + redirect that returns them |
| `403` | "Forbidden" | "Your account does not have access to this." |
| `422` | "Bad request" | the server's field messages, under the fields |
| `409`/`412` | "Conflict" | "Somebody else changed this while you were working. Reload to see the current values." |
| `429` | "Too many requests" | "Too many requests just now. Try again in a moment." (respect `Retry-After`) |
| timeout | "Aborted" | "This is taking longer than usual. Try again?" |
| cancelled | "AbortError" | *(nothing — the user left)* |

Where to show it:

| Scope | Where the message goes | Example |
| --- | --- | --- |
| One field | under the field, `aria-describedby` | validation errors |
| One action | next to the button / in a toast | "Could not save the product." |
| One region | inside the region, replacing its content | a list that failed to load |
| The whole screen | a page-level banner | "You are offline — showing cached data." |
| Session-wide | a global banner (from the 401 handler) | "Your session expired." |

💡 **Also log the technical side.** A `console.error` (or your logger) with the URL, method, status, and a correlation id makes support possible; the sentence the user sees makes *trust* possible. Never swap the two.

```ts
console.error('[api]', { url, method, status: failure.status, kind: failure.kind, cause: failure.cause });
```

---

## 6. Global handling: `401`, offline, and one banner

A `401` is rarely a local problem — the session is gone, so every subsequent request will fail. Handle it once, at the boundary (the axios interceptor from file 03, or a small fetch wrapper):

```ts
// File: src/api/http.ts (addition)
if (response.status === 401) {
  window.dispatchEvent(new CustomEvent('auth:expired'));
}
```

```tsx
// File: src/auth/SessionWatcher.tsx — one component, mounted once, near the root
export function SessionWatcher() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onExpired = () => {
      // Send them to sign in, remembering where they were (Part 6, file 07).
      void navigate('/login', { replace: true, state: { from: location.pathname + location.search } });
    };

    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [navigate, location]);

  return null;
}
```

Offline detection is worth having, but treat it as a *hint*, not a guarantee:

```tsx
function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
```

`navigator.onLine === true` only means "there is a network interface", not "the API is reachable" (a captive-portal wifi is the classic counter-example) — so combine it with what actually happened: the `offline` failure kind from section 2 is the real signal.

---

## 7. Errors during render are not request errors

Everything above happens in promises and event handlers. A **render-time** error — a component throwing while React builds the tree — needs an error boundary:

```tsx
// File: src/app/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: (error: Error) => ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[render]', error, info.componentStack);      // log for the team
  }

  render() {
    if (this.state.error !== null) {
      return this.props.fallback?.(this.state.error) ?? (
        <div role="alert">
          <h2>Something went wrong on this page.</h2>
          <p>The rest of the app still works.</p>
          <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Facts about boundaries worth stating plainly:

- **Class components are still the only way to write one.** This is the last place in modern React where you will write `class` — hooks cannot catch render errors. (Part 8 adds the router's `errorElement`, which is a boundary wired to a route.)
- **They do not catch**: event-handler errors, promise rejections, errors inside `setTimeout`, or errors from your own code outside rendering. Those need `try`/`catch` (request paths) or a global handler.
- **Place them at seams, not everywhere**: around a route, around a widget that renders other people's data, around a third-party embed.
- **A boundary is not a substitute for handling a request failure.** A failed fetch never throws during render; it sets state, and the state machine renders the message.

```tsx
// Place one around a route so one broken page cannot blank the app.
<ErrorBoundary>
  <ProductsGallery />
</ErrorBoundary>
```

---

## 8. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | retrying every failure | a duplicated `POST` (verified: retried `503`s created two records) | retry only 5xx/408/429/network, and never `POST` |
| 2 | retrying immediately, in a tight loop | the struggling server gets worse | exponential backoff + jitter, 3 attempts |
| 3 | no timeout | a stuck spinner forever (file 09's "skeleton forever") | `AbortSignal.timeout` / axios `timeout`, plus a UI branch |
| 4 | showing `error.message` raw | users see "TypeError: fetch failed" | classify and translate (section 2) |
| 5 | treating an abort as a failure | error toasts when the user navigates away | ignore `AbortError` |
| 6 | one generic message for all failures | nobody can act on "Something went wrong" | the message policy table |
| 7 | ignoring `Retry-After` | hammering a rate-limited API into a ban | read the header |
| 8 | retrying a `404` | pointless load, slower failure | `404` is a decision, not a hiccup |
| 9 | error boundary as the only strategy | render errors are caught, request errors are not | boundaries for render, state machines for requests |
| 10 | a global banner for every failure | users learn to ignore it | scope each message to what failed |
| 11 | no logging | production failures leave no trace | log URL, method, status, kind, correlation id |
| 12 | hiding the retry affordance | users reload the whole page, losing their work | a "Try again" button that re-runs *that* request |

---

## 9. Best practices

1. **Classify every failure once** (`classify`) and give it a kind, a message, and a `retryable` flag.
2. **Never show a raw exception** or a bare status code; write the sentence the user needs.
3. **Retry with a policy** — 5xx/408/429/network only, capped attempts, exponential backoff, jitter, and never a `POST` without an idempotency key.
4. **Always time out**, and always leave the loading state when you do.
5. **Keep `AbortError` silent** and treat it as normal control flow.
6. **Scope each message** to what actually failed (field, action, region, page).
7. **Handle `401` globally** (one listener, one redirect with a return path) and everything else locally.
8. **Log the technical detail**; never render it.
9. **Give every error a way forward**: retry, reload, sign in, go back, clear filters.
10. **Test the failures on purpose** — `?fail=500`, `?fail=404`, `?fail=422`, `?delay=800`, stop the API mid-session — because these paths are invisible until they are not.

---

## 10. Practice

### Beginner — meet each failure

1. With the API running, trigger `?fail=500`, `?fail=404`, and `?fail=422` on a list request and record what your UI currently shows for each. Translate each into one sentence a non-technical user could act on.
2. Stop the API and retry. What `error.name` do you get, and which `FailureKind` should it map to in `classify`?
3. Run a request against `?delay=3000` with a 500 ms timeout (`AbortSignal.timeout(500)`). Record the error `name` and `message`, and write the user-facing sentence.
4. Trigger an abort deliberately (start a search, type another character) and confirm your UI shows **nothing** — no toast, no banner, no error state.

### Intermediate — a retry policy you can defend

1. Implement `classify` and `fetchWithRetry` (sections 2 and 3) in your project, then write a probe that prints a line per attempt against `?fail=first2`, `fail=first5`, `?fail=404`, `?fail=422`, an abort, and a dead port. Compare your output with the transcript in section 3.
2. Add a `Retry-After`-aware wait to the `429` branch, and make the lab's middleware send the header (`res.set('Retry-After', '2')`).
3. Add a timeout to every request in your API layer, and prove with a probe that a request against `?delay=3000` with a 500 ms timeout leaves the loading state and shows the timeout message.
4. Answer in writing: *why is `PATCH` usually retryable but `POST` not?* Use the verbs' definitions from file 01 to justify it.

### Challenge — an error policy for a whole app

1. Write `src/api/errors.ts` with `FailureKind`, `Failure`, and `classify`, and route **every** failure in the app through it. No component may read `error.message` directly afterwards.
2. Add a global `SessionWatcher` for `401` that redirects to `/login` with a return path, and verify: after signing in (a stub is fine), the user lands back where they were.
3. Add an offline banner driven by a combination of `navigator.onLine` and the last failure's kind, and make it disappear when a request succeeds.
4. Build a "failure playground" page listing buttons for every failure kind (`500`, `404`, `422`, `429`, timeout, offline by stopping the API, and an abort), each rendering the message your policy produces. Ship it with a `FAILURES.md` explaining, for each kind, what the user sees, what the code does, and what is logged.

---

## 11. Solutions

### Beginner

1. `?fail=500` → the error state with "Something broke on our side…"; `?fail=404` → "We could not find that record."; `?fail=422` → the server's field messages (on a form). Each is actionable: retry, go back, fix the fields.
2. Stopping the API produces a transport failure: in Node `TypeError: fetch failed`, in the browser `TypeError: Failed to fetch` — `kind: 'offline'`, `retryable: true`, message "You appear to be offline…". (If the browser blocks a cross-origin response with CORS, you also get a `TypeError` — which is why the message says "check your connection" rather than claiming the API is down.)
3. `AbortSignal.timeout(500)` on a 3-second request rejects with `name: 'TimeoutError'`, `message: 'The operation was aborted due to timeout'` (verified in file 02). User-facing: "This is taking longer than usual. Try again?" — plus a visible retry control.
4. Nothing should appear. `AbortError` means *you* ended the request; the `aborted` check in the hook (file 09) returns before touching state, and `classify` maps it to `kind: 'cancelled'` with no UI.

### Intermediate

```text
1. ?fail=first2      → attempt 1: 503 → wait 100ms → attempt 2: 503 → wait 200ms → attempt 3: 200 OK
2. ?fail=first5      → three attempts, all 503 → "Gave up after 3 attempts"
3. ?fail=404         → attempt 1: 404 (NOT retryable) → threw after one attempt
4. ?fail=422         → one attempt, then the field errors are mapped to the form
5. abort             → attempt 1: aborted — never retried
6. dead port         → retried (network failure), then gave up with a TypeError-based message
```

2. `Retry-After` handling:

```ts
if (response.status === 429 || response.status === 503) {
  const header = response.headers.get('retry-after');
  const waitMs = header ? Number(header) * 1000 : baseDelayMs;
  await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 30_000)));
}
```

3. With a 500 ms timeout on `?delay=3000`, the request rejects as a `TimeoutError` at ~500 ms; the component's `finally`/`aborted` logic must ensure the loading state ends and the timeout message renders (assert both in the probe: no skeleton, one alert).

4. `PATCH` (a merge patch of a fixed value) and `PUT`/`DELETE` are **idempotent**: applying them twice leaves the same state, so a retry after a lost response is safe. `POST` is not idempotent: two calls create two records (verified repeatedly in this part), so retrying it needs an explicit server-side idempotency mechanism (the `Idempotency-Key` pattern in section 3).

### Challenge

```ts
// FAILURES.md — the essential table
| Kind        | User sees                                                    | Code does                                              | Logged                          |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------- |
| offline     | "You appear to be offline…"                                  | no auto-retry; a retry button; a global banner          | URL, method, kind               |
| timeout     | "This is taking longer than usual. Try again?"                | leaves loading; offers retry                            | URL, elapsed ms                 |
| validation  | per-field messages from the server                           | keeps the user's input; maps errors to fields           | status, field names             |
| unauthorized| "Your session expired…" + redirect to /login with return path | one global handler; other requests stop showing errors  | status, path                    |
| forbidden   | "Your account does not have access."                         | no retry                                                | status, path                    |
| notFound    | "We could not find that record." + link back                 | renders the not-found state                             | status, URL                     |
| conflict    | "Somebody else changed this… Reload…"                        | stops the save; offers reload                           | status, record id               |
| rateLimited | "Too many requests just now…"                                | waits for `Retry-After`, then one retry                 | status, retry-after             |
| server      | "Something broke on our side…"                               | retries with backoff (idempotent verbs only)            | status, correlation id          |
| cancelled   | *(nothing)*                                                  | aborts, ignores the outcome                             | nothing (it is not a failure)   |
```

The verification for step 2: with the return path stored in `location.state.from` (Part 6, file 07), signing in again must land the user on the page whose request produced the `401` — not on a generic dashboard.

---

## 12. Summary

- **Name every failure** with a `FailureKind` and a `retryable` flag; one `classify` function keeps 40 screens consistent.
- **Transport failures reject** (`TypeError: fetch failed`), **HTTP failures resolve** with `ok === false`, **aborts** report `AbortError`, **timeouts** report `TimeoutError` — all verified.
- **Retry only what is safe**: 5xx/408/429/network, capped attempts, exponential backoff with jitter (verified `503, 503, 200` across ~100/200 ms waits), never `404`/`401`, never an abort, and **never a `POST`** without an idempotency key.
- **Time out every request** and make the timeout change the UI, not just the request.
- **Translate before rendering**: what happened, in the user's terms, with a way forward — and log the technical detail instead of showing it.
- **`401` is global** (one listener, one redirect with a return path); everything else is scoped to what failed.
- **Render-time errors need an error boundary** (still a class component: the last one in modern React), while request failures belong in state machines. Boundaries do not catch promises or event handlers.

---

**What's next →** [`11-typescript-api-types.md`](./11-typescript-api-types.md): making all of this type-safe. Why `response.json()` returns `unknown` and why that is a gift, how to parse and validate a payload you did not write (verified rejections: `"priceMinor must be a non-negative integer"`, `"expected an object"`), DTOs versus domain models (`price_minor` → `priceMinor`, `in_stock: 0` → `inStock: false`), a typed client that cannot lie, and the `@ts-expect-error` checks that keep the types honest in CI.
