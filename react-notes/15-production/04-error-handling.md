# 04 — Error Handling in Production: Boundaries, Typed Errors, Useful Messages

> **Part 15 · Production · File 4 of 8**

Why this file exists: in development an error is a red stack trace and you fix it. In
production an error is a user staring at a white screen, a support ticket with no details,
and an engineer at 2am guessing. This file builds the three layers of error handling a real
app needs — **render errors** (error boundaries), **async/API errors** (typed, recoverable),
and **user messages** (honest without leaking internals) — plus the fallback UI and
recovery paths that turn "the app broke" into "that one thing failed, try again".

Part 10 file 08 taught error boundaries mechanically. This file is about using them as an
architecture.

---

## 1. The three kinds of error (and why one handler cannot cover them)

| Kind | Where it happens | Caught by | Typical cause |
| --- | --- | --- | --- |
| **Render error** | While React renders / in a lifecycle | Error boundary (class component) | `undefined.map`, bad data shape, thrown in render |
| **Async error** | In a promise / event handler / effect callback | `try/catch`, `.catch()`, query `onError` | 500, timeout, network offline, 401 |
| **Programmer error** | Anywhere, from a logic bug | Boundary + logging | Wrong assumption, race condition |

⚠️ **Error boundaries do NOT catch:**

```text
❌ event handlers        → use try/catch in the handler
❌ asynchronous code     → setTimeout, promise rejections, request callbacks
❌ server-side rendering
❌ errors in the boundary itself
```

This is the most-cited surprise in React. The rule to remember: **a boundary catches errors
thrown while React is rendering the tree below it. Everything else is your job.**

---

## 2. Layer 1 — Error boundaries, placed deliberately

A single top-level boundary means the whole app blanks out on any bug. Place boundaries
where a failure should be *contained*:

```text
<ErrorBoundary fallback={<AppCrashed />}>        ← last resort, whole app
  <QueryClientProvider> <Router>
    <Layout>
      <ErrorBoundary fallback={<PageFailed />}>  ← per page
        <Suspense fallback={<PageSkeleton />}>
          <Routes />
        </Suspense>
      </ErrorBoundary>
      <Sidebar />                                 ← survives a page crash
    </Layout>
```

**Placement rules**

1. **One around the app** — never let a bug produce a blank page.
2. **One per route** — a broken settings page must not take the nav with it.
3. **One per independent widget** — a chart, a comments panel, a third-party embed.
4. **Never around something that must never fail** — auth provider, router. If those die,
   there is nothing meaningful to render.

```tsx
// src/shared/ui/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** What to show when the subtree throws. */
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Called with the error so you can log it (file 05). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

/**
 * React still requires a class component for boundaries: there is no hook equivalent
 * because a boundary must survive its own subtree throwing, and hooks belong to a
 * component that is itself part of that subtree.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === 'function' ? fallback(error, this.reset) : fallback;
  }
}
```

**Line by line**

- `getDerivedStateFromError` — the *only* way to switch to fallback UI. Called during
  render, so it must be pure (no logging here; that is what `componentDidCatch` is for).
- `componentDidCatch(error, info)` — fires after commit, receives the component stack in
  `info.componentStack`. This is where you report.
- `reset()` — clearing the error re-renders the children. Without it, a boundary that has
  fired once is permanently broken until a full reload.
- The function-form fallback — lets each call site show a context-appropriate message
  *and* offer retry.

⚠️ **Resetting a boundary does not undo the cause.** If the data that crashed the render is
still there, the subtree crashes again instantly. Real recovery usually means invalidating
the query or navigating away:

```tsx
<ErrorBoundary
  onError={reportError}
  fallback={(error, reset) => (
    <ErrorPanel
      title="This section failed to load"
      detail={error.message}
      onRetry={() => { queryClient.invalidateQueries(); reset(); }}
      onHome={() => navigate('/')}
    />
  )}
>
```

🔍 **Why boundaries must be classes:** hooks live inside the component that renders them.
If that component throws during render, its own hooks are gone. A boundary has to be an
*ancestor* whose state survives the child's failure — and `getDerivedStateFromError` is a
static method precisely because it runs when no instance state can be trusted.

---

## 3. Layer 2 — Typed API errors

`fetch` does not reject on 404 or 500. It resolves. If you do not check `response.ok`, a
server error becomes a JSON parse error three lines later and the real cause is lost.

```ts
// src/shared/lib/apiError.ts
export type ApiErrorKind =
  | 'network'        // offline, DNS, CORS, timeout — the server never answered
  | 'auth'           // 401 / 403
  | 'notFound'       // 404
  | 'validation'     // 422 — the server rejected our input
  | 'rateLimit'      // 429
  | 'server'         // 5xx
  | 'unknown';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
    /** Field-level messages from a 422, e.g. { email: 'already in use' } */
    readonly fields: Record<string, string> = {},
    /** Set for errors we expect and want to retry/report quietly. */
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  401: 'auth', 403: 'auth', 404: 'notFound', 422: 'validation', 429: 'rateLimit',
};

function kindFor(status: number): ApiErrorKind {
  if (status in KIND_BY_STATUS) return KIND_BY_STATUS[status];
  if (status >= 500) return 'server';
  return 'unknown';
}
```

```ts
// src/shared/lib/httpClient.ts
import { ApiError, type ApiErrorKind } from './apiError';
import { getSessionToken } from '@/features/auth';
import { config } from '@/config';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(getSessionToken() ? { authorization: `Bearer ${getSessionToken()}` } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    // The only place a network failure surfaces — fetch rejects ONLY here
    throw new ApiError('network', 'Cannot reach the server. Check your connection.', null,
      {}, true);
  }

  if (!response.ok) {
    const kind: ApiErrorKind = response.status >= 500 ? 'server'
      : response.status === 401 || response.status === 403 ? 'auth'
      : response.status === 404 ? 'notFound'
      : response.status === 422 ? 'validation'
      : response.status === 429 ? 'rateLimit' : 'unknown';

    let message = `Request failed (${response.status})`;
    let fields: Record<string, string> = {};
    try {
      const body = (await response.json()) as { message?: string; errors?: Record<string, string> };
      if (body.message) message = body.message;
      if (body.errors) fields = body.errors;
    } catch { /* a 500 often returns HTML — that is fine, we keep the default message */ }

    throw new ApiError(kind, message, response.status, fields, kind === 'server' || kind === 'rateLimit');
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
```

💡 **Why a class and not a plain object:** `instanceof ApiError` lets any layer
distinguish "our API failed in a known way" from "a TypeError escaped somewhere". That
distinction decides whether you show a friendly message or open a bug report.

⚠️ **`instanceof` breaks across module boundaries** (two copies of a package, or a bundler
splitting chunks). If you ever see `instanceof` fail, fall back to a discriminant:
`if ('kind' in error)`.

---

## 4. Layer 3 — Turning errors into words a user can act on

The mapping from error kind to message is a *product* decision. Keep it in one function so
every screen says the same thing about the same failure:

```ts
// src/shared/lib/errorMessages.ts
import { ApiError } from './apiError';

export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':    return 'We could not reach the server. Check your connection and try again.';
      case 'auth':       return 'Your session has ended. Please sign in again.';
      case 'notFound':   return 'We could not find that item. It may have been deleted.';
      case 'validation': return error.message;         // the server's field messages are safe to show
      case 'rateLimit':  return 'Too many requests. Please wait a moment and try again.';
      case 'server':     return 'Something went wrong on our side. Your data is safe — please retry.';
      default:           return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';    // never leak a stack trace
}

export function canRetry(error: unknown): boolean {
  return error instanceof ApiError && error.retryable;
}
```

```tsx
// A component that handles all four states explicitly
function TaskList() {
  const { data, isPending, isError, error, refetch } = useTasks();

  if (isPending) return <Skeleton rows={5} />;
  if (isError) {
    return (
      <ErrorPanel title="Could not load tasks" detail={userMessage(error)}>
        {canRetry(error) && <button onClick={() => refetch()}>Try again</button>}
      </ErrorPanel>
    );
  }
  if (data.length === 0) return <EmptyState title="No tasks yet" hint="Create your first task." />;
  return <ul>{data.map((t) => <TaskItem key={t.id} task={t} />)}</ul>;
}
```

🏭 **The four states are not optional.** Every screen that loads data has: pending, error,
empty, and success. The empty state is the one everyone forgets, and it is the state new
users see first.

⚠️ **Never render `error.message` from an unknown error.** It may contain a file path, a
SQL fragment, or a token. Show your own text; log the original (file 05).

---

## 5. Errors you can recover from, vs errors you report

| Error | Recover | Report |
| --- | --- | --- |
| Network blip on a read | ✅ retry (automatic, with backoff) | ❌ noise |
| 401 | ✅ refresh token or redirect to login (Part 14) | ❌ |
| 422 validation | ✅ show field errors | ❌ |
| 500 from our API | ✅ offer retry | ✅ yes — our bug |
| Render crash caught by a boundary | ✅ fallback + reset | ✅ **always** |
| Unhandled promise rejection | ⚠️ show a toast | ✅ always |

```ts
// src/app/main.tsx — the last line of defence
window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});
window.addEventListener('error', (event) => reportError(event.error ?? new Error(event.message)));
```

🔍 **These two listeners catch what no `try/catch` did** — a forgotten `await`, a
`.then()` chain with no `.catch()`. In a production app they are usually where you learn
about the most bugs, precisely because they are the ones nobody handled.

---

## 6. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Expecting a boundary to catch an event-handler error | Nothing is caught; app still blanks | `try/catch` in the handler |
| One boundary at the root | Any bug whitescreens the whole app | Per-route boundaries |
| No `reset` in the fallback | Fallback is permanent until reload | Expose a retry that invalidates + resets |
| Not checking `response.ok` | `Unexpected token < in JSON` on a 500 | The `request<T>()` wrapper |
| Showing `err.message` verbatim | Users see `undefined is not a function` | `userMessage()` |
| Logging errors to `console` only | Nobody ever sees them | A real reporter (file 05) |
| Retrying a 422 forever | Infinite request loop | Retry only when `retryable` |
| Catching and swallowing (`catch {}`) | Bug becomes invisible | Log it, then decide |

---

## 7. Practice

### Beginner
1. Add a root `ErrorBoundary` and a component that throws when a prop is `undefined`;
   verify the fallback renders and the rest of the app still works.
2. Add a "Throw on purpose" button in dev and confirm an error inside an `onClick` is
   **not** caught by the boundary.

### Intermediate
1. Implement `ApiError` + `request<T>()` and convert one feature's api module to use it.
2. Add a boundary around one route with a retry button that invalidates queries and resets.

### Challenge
1. Write tests for `userMessage()` covering every `ApiErrorKind`, plus one for the
   non-`ApiError` path.
2. Build an offline-aware retry: on `kind === 'network'`, retry with exponential backoff
   (max 3 attempts) and surface a single message when they all fail. Test it with fake
   timers.

---

## 8. Solutions

### Beginner
1. `function Boom({ x }: { x?: { name: string } }) { return <p>{x!.name}</p>; }` rendered with
   no prop throws inside render → the boundary catches it. The nav outside the boundary
   keeps working, which is the whole point of placement.
2. `onClick={() => { throw new Error('handler'); }}` — the boundary does nothing; the error
   reaches `window.onerror`. That is the difference between render errors and everything
   else, demonstrated in ten seconds.

### Intermediate
1. After conversion, `grep -rn "fetch(" src/features` should return nothing — every call
   goes through `request<T>()`, so auth headers and error normalisation cannot be forgotten.
2. The retry callback must do both: `queryClient.invalidateQueries({ queryKey: ['tasks'] })`
   (fresh data) *then* `reset()` (clear the boundary). Reset alone re-renders the same
   broken state.

### Challenge
1. Nine cases: seven kinds, a plain `Error`, and a string. The string case is the one that
   catches people — `throw 'nope'` is legal JavaScript and must not crash your handler.
2. ```ts
   async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
     let last: unknown;
     for (let i = 0; i < attempts; i++) {
       try { return await fn(); }
       catch (e) { last = e; if (!(e instanceof ApiError && e.kind === 'network')) throw e;
                   await sleep(2 ** i * 500); }
     }
     throw last;
   }
   ```
   Test with `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync(500)`; assert three calls
   and one surfaced error — not three toasts.

---

## 9. Summary

- **Three kinds of error, three mechanisms:** boundaries for render, `try/catch` for async,
  reporting for both.
- **Boundaries do not catch event handlers, promises or timeouts** — the most important
  sentence in this file.
- **Place boundaries to contain failure:** app root, per route, per widget. Never around
  auth or the router.
- **`fetch` resolves on HTTP errors.** Check `response.ok` and throw a typed `ApiError`
  with a `kind`, `status` and field messages.
- **One function maps errors to user-visible text.** Retry only what is retryable; never
  show a raw message from an unknown error.
- **Four states everywhere:** pending, error, empty, success.
- **Recover what you can, report what you must** — 500s and render crashes always get
  reported; 401s and network blips get handled.

---

**What's next →** [`05-logging.md`](./05-logging.md) takes the `reportError()` calls above
and makes them useful: what a client-side log entry should contain, breadcrumbs, sampling,
PII, and why `console.log` is not observability.
