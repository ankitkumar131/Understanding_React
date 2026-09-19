# 04 — Error Handling: Catching What React, the Network and the User Throw at You

> **Part 15 · Production · File 4 of 8**

Why this file exists: in development, errors are a red overlay and a console message; in production, an unhandled error is a blank white screen and a support ticket with no details. This file is the complete failure model of a React application: the four kinds of errors you will meet (render, async, network/API, user input), where each one is caught, what the user should see, what the developer should see, and how to make sure a failure that reaches a real user reports itself. It also covers the traps — error boundaries not catching event handlers or async code, retry storms, and error messages that leak internals.

---

## 1. Know what you are catching: four kinds of errors

| Kind | Example | Where it appears | Caught by |
| --- | --- | --- | --- |
| **Render error** | reading `undefined.name`, a bad hook call | while React renders your component | an **error boundary** (they exist for this) |
| **Async/render-later error** | `await` inside `useEffect`, a rejected promise in an event handler | after the render, outside React's stack | `try/catch` + `catch` in the promise chain, or a boundary via an async-handling pattern |
| **Network/API error** | 500, timeout, offline, invalid JSON | the data layer | the HTTP client + the data library's error state (Part 9) |
| **User input error** | invalid email, empty required field | a form | validation (Part 8) — arguably not an "error" at all |

⚠️ **Error boundaries do not catch event handlers, `setTimeout` callbacks, promises, or errors in the boundary itself.** They catch errors thrown while rendering, in lifecycle methods, and in constructors. This single misunderstanding causes most "our error boundary never fires" bugs.

```text
render()      ─── throws ──► error boundary ✅
event handler ─── throws ──► the event system (console + a global handler) ❌ not a boundary
useEffect()   ─── throws ──► React treats a *synchronous* effect throw as a render error ✅
await fetch() ─── rejects ─► your catch ❌ not a boundary (unless it happens during the render pass)
```

---

## 2. Error boundaries, properly

```tsx
// src/shared/ui/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };                                    // render the fallback
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Side effects belong here, not in getDerivedStateFromError
    this.props.onError?.(error, info);
  }

  reset = (): void => { this.setState({ error: null }); };

  render(): ReactNode {
    if (this.state.error !== null) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
```

This is one of the very few places where a **class component** is still the correct answer in modern React: there is no hook equivalent of `getDerivedStateFromError` / `componentDidCatch`. (React 19 adds `onUncaughtError` / `onCaughtError` options on `createRoot`, which are a complement — see section 5 — not a replacement.)

```tsx
// Usage: a boundary around an area, with a retry the user can click
<ErrorBoundary
  fallback={(error, reset) => (
    <div role="alert">
      <h2>Something went wrong in this section</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )}
  onError={(error, info) => reportError(error, { componentStack: info.componentStack })}
>
  <ProductTable />
</ErrorBoundary>
```

| Property | Recommended |
| --- | --- |
| Granularity | one at the app root **and** one around each independent area (a widget, a route, a dashboard panel) |
| Fallback content | says what failed, offers a way out (retry, go home), never a raw stack trace |
| `role="alert"` | yes, so screen readers announce the failure |
| Reporting | `componentStack` from `ErrorInfo` plus the error; send it somewhere you will read |
| Reset | a `key` on the boundary, or a `reset` callback — a boundary that cannot recover traps the user |

```tsx
// Resetting a boundary when the route changes (a common requirement)
const location = useLocation();
<ErrorBoundary key={location.pathname} fallback={…}>…</ErrorBoundary>
```

💡 **The `key` trick** is the simplest reset: a new `key` unmounts the boundary and its subtree, clearing the captured error. Use it when the error is "stuck" and navigating away should recover.

---

## 3. The three-level boundary layout

```text
<App>                                    ← provider errors, "the app failed to start"
  <ErrorBoundary level="app">
    <Layout>                             ← navigation errors, "this page failed"
      <ErrorBoundary level="route">
        <ProductsPage>                   ← widget errors, "this table failed, the rest works"
          <ErrorBoundary level="widget">
            <ProductTable />
          </ErrorBoundary>
        </ProductsPage>
      </ErrorBoundary>
    </Layout>
  </ErrorBoundary>
</App>
```

| Level | Fallback | Rationale |
| --- | --- | --- |
| app | "Something went wrong. Reload." | nothing else can be trusted; keep it minimal and self-contained |
| route | "This page could not be displayed" + retry/navigate | the rest of the app keeps working (nav, account menu) |
| widget | a small in-place panel | one failing widget should not blank a dashboard |

⚠️ The app-level fallback must not depend on app state, context, or routers — those may be exactly what failed. Keep it a static element (plain HTML + a reload link), which is why many teams inline it rather than importing components.

---

## 4. Async errors: the ones boundaries miss

```tsx
// ❌ the classic: the error escapes React entirely
useEffect(() => {
  fetch('/api/products').then((r) => r.json()).then(setProducts);   // rejection → unhandled
}, []);

// ✅ explicit handling with state the UI can show
const [error, setError] = useState<Error | null>(null);
useEffect(() => {
  const controller = new AbortController();
  fetch('/api/products', { signal: controller.signal })
    .then((r) => { if (!r.ok) throw new Error(`Request failed with ${r.status}`); return r.json(); })
    .then(setProducts)
    .catch((cause: unknown) => { if (!controller.signal.aborted) setError(toError(cause)); });
  return () => { controller.abort(); };                              // no state update after unmount
}, []);
```

The rules that prevent most async bugs:

| Rule | Why |
| --- | --- |
| Every promise chain has a `.catch`, or is `await`ed inside a `try/catch` | otherwise it becomes an unhandled rejection |
| Check `response.ok` — `fetch` does not reject on 404/500 | the most common silent failure in React apps |
| Abort on unmount / dependency change | avoids setting state after unmount and stale responses winning |
| Distinguish abort from real failure (`signal.aborted`) | an aborted request is not an error to show the user |
| Represent failure as state (`error`), not as a thrown error | the UI must be able to render it |
| Let the data library do it where possible | TanStack Query exposes `error`/`isError` and retries with backoff (Part 9) |

```tsx
// With TanStack Query, the same concern is handled declaratively
const { data, error, isPending, refetch } = useQuery({ queryKey: ['products'], queryFn: fetchProducts });
if (isPending) return <Skeleton />;
if (error !== null) return <ErrorPanel error={error} onRetry={() => void refetch()} />;
```

⚠️ **Retry policy is part of error handling.** Retrying a 400 forever is a bug; retrying a 503 with backoff is correct. TanStack Query's default is 3 retries with exponential backoff — sensible for GETs, wrong for mutations (which default to 0). Make the policy explicit and test the failure path (Part 13, file 05).

---

## 5. Global safety nets

Even with boundaries and catches, some failures escape. Catch them at the edges:

```ts
// src/app/errorReporting.ts — one place that knows what to send where
import type { ErrorInfo } from 'react';

export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  const normalised = error instanceof Error ? error : new Error(String(error));
  const payload = {
    message: normalised.message,
    stack: normalised.stack,
    ...context,
    url: window.location.href,
    release: import.meta.env.VITE_APP_VERSION ?? 'dev',
    userAgent: navigator.userAgent,
  };
  if (import.meta.env.DEV) { console.error('[error]', payload); return; }
  void fetch('/api/client-errors', {
    method: 'POST', keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => { /* reporting must never throw */ });
}
```

```tsx
// src/main.tsx — createRoot options catch errors React itself surfaces (React 19)
createRoot(container, {
  onUncaughtError: (error, errorInfo) => reportError(error, { componentStack: errorInfo.componentStack }),
  onCaughtError: (error, errorInfo) => reportError(error, { handledBy: 'boundary', componentStack: errorInfo.componentStack }),
  onRecoverableError: (error) => reportError(error, { recoverable: true }),
}).render(<App />);
```

```ts
// window-level nets for everything outside React (event handlers, timers, third-party scripts)
window.addEventListener('error', (event) => reportError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason, { kind: 'unhandledrejection' }));
```

| Net | Catches | Notes |
| --- | --- | --- |
| Error boundary | render/effect errors | the only one that can show in-place UI |
| `onUncaughtError` / `onCaughtError` (React 19) | what React surfaces, including boundary-caught errors | ideal hook for reporting; the boundary still owns the UI |
| `window.onerror` | event-handler and sync errors outside React | no component context |
| `window.onunhandledrejection` | missed promise rejections | usually the first sign of a forgotten `await`/`catch` |
| Server/edge logs | errors the API returns | join them to client reports by request id |

💡 **De-duplicate before sending.** A render loop can throw thousands of times per second; most reporting SDKs sample or de-duplicate by message+stack. If you write your own endpoint, rate-limit **client-side** too (e.g. one report per message per session).

⚠️ **Never send PII or tokens in error reports.** Stack traces can contain user data in arguments; URLs can contain ids or search terms. Scrub before sending, and treat report payloads as public data.

---

## 6. Making errors readable: messages, codes and users

```ts
// src/shared/api/errors.ts — one error shape for the whole app
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,               // machine-readable, from the API
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toError(cause: unknown): Error {
  if (cause instanceof ApiError) return cause;
  if (cause instanceof Error) return cause;
  return new Error(typeof cause === 'string' ? cause : 'Something went wrong');
}
```

| Layer | What it may say | Example |
| --- | --- | --- |
| API response body | machine-readable code + safe message | `{ "code": "insufficient_stock", "message": "Only 2 left" }` |
| Client data layer | maps status/code to a normalised error | `new ApiError('Only 2 left', 409, 'insufficient_stock')` |
| UI | what the user can do about it | "Stock ran out. Reduce the quantity to 2 and try again." |
| Logger/console | everything (status, request id, stack) | `[cart] add failed 409 insufficient_stock req_9f2` |

```tsx
function messageFor(error: Error): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'insufficient_stock': return 'Stock ran out for one of your items. Reduce the quantity and try again.';
      case 'payment_declined': return 'Your payment was declined by the bank. Try another card.';
      default: return error.message;
    }
  }
  return 'Something went wrong. Please try again.';
}
```

⚠️ **Three things never to show a user**: a stack trace, a raw API error object, and a message you have not thought about ("Request failed with status code 500"). The default branch matters more than the specific cases — write it carefully, and make sure it is not a lie ("Check your internet connection" when your server is down is a lie users notice).

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Expecting a boundary to catch an async error | the boundary never fires; the error is unhandled | catch in the promise/`try` |
| 2 | `fetch` without `response.ok` | 404/500 treated as success | check `ok` and throw `ApiError` |
| 3 | A boundary with no reset | the user is stuck until a reload | `key` or a `reset` callback |
| 4 | One boundary at the root only | any error blanks the whole app | per-area boundaries |
| 5 | App-level fallback that uses the app's components/context | the fallback itself throws | static, dependency-free markup |
| 6 | No reporting | you learn about errors from users | boundary `onError` + `createRoot` options |
| 7 | Reporting without de-duplication | one loop floods your endpoint | rate-limit/sample |
| 8 | PII in reports | a data-protection problem | scrub payloads |
| 9 | Retrying everything | retry storms, duplicate mutations | retry idempotent GETs; never blind-retry payments |
| 10 | Swallowing errors (`catch {}`) | silent failures users cannot report | at minimum log with context; usually show something |
| 11 | Showing raw errors to users | confusing and leaky (SQL, paths, hostnames) | map code → human message |
| 12 | Setting state after unmount/abort | warnings, wrong UI, races | `AbortController` + a check on `signal.aborted` |

---

## 8. Best practices

1. **Classify the error first** (render / async / network / user) — the classification tells you where to catch it.
2. **Boundaries at three levels** (app, route, widget), each with a fallback that says what failed and offers a way out.
3. **Every promise has a handler**, and every `fetch` checks `response.ok`.
4. **Represent failure as state** and render it deliberately (skeleton → error panel → empty state → data).
5. **Normalise errors once** (`ApiError`, `toError`) so the UI never has to guess.
6. **Report with context**: component stack, route, release version, request id — and de-duplicate.
7. **Never leak internals** to users or to error payloads (no stacks, tokens, or PII).
8. **Make retries deliberate**: exponential backoff for idempotent reads; explicit, user-initiated for writes.
9. **Test the failure paths** — the error branch is code (Part 13, file 05: MSW `HttpResponse.error()`, 500 handlers).
10. **Write the empty/loading/error triad for every screen** and review them together; the error screen is part of your UX, not an afterthought.

---

## 9. Practice

### Beginner

1. Write an `ErrorBoundary` and use it around one component that throws. Verify the fallback renders and that a "Try again" button resets it.
2. Prove to yourself that a boundary does **not** catch: (a) an error thrown in an `onClick`, (b) a rejected promise. Add the handlers that do.
3. Make a `fetch` fail (bad URL) and show a readable error panel instead of a blank screen.

### Intermediate

1. Add route-level boundaries so one page failing leaves navigation usable. Reset on route change with a `key`.
2. Implement `ApiError` + `toError`, map three server codes to human messages, and write the default message carefully.
3. Add `onUncaughtError` / `onCaughtError` reporting to `createRoot` plus `unhandledrejection`, and de-duplicate by message.

### Challenge

1. Build the full failure path for a checkout: network timeout during payment, a declined card, a partial failure where the order exists but the email failed, and a render error in the confirmation screen. For each, specify the catch site, the user message, the retry semantics and the report payload.
2. Add an error-reporting endpoint to a small server: accept, rate-limit, scrub PII, store, and group by message+release. Then wire the client and prove (with a deliberate error) that reports arrive and group correctly.
3. Write the error-handling review for an app you know: list every screen's failure states, mark the ones that are missing, and fix the two most user-visible. Include the evidence (tests) you added.

---

## 10. Solutions

### Beginner

1. The boundary from section 2 with `fallback={(error, reset) => …}`; clicking "Try again" calls `reset`, which sets `error: null` and re-renders the children. If the underlying cause is deterministic (it throws again), the fallback returns — which is correct and worth observing.
2. `onClick={() => { throw new Error('boom'); }}` shows a console error and does **not** trigger the boundary; `Promise.reject(new Error('boom'))` unhandled appears in `window.onunhandledrejection`. Fix: `try/catch` in the handler and set an error state; `.catch` on the promise or `await` in a `try`.
3. `fetch('/api/does-not-exist')` resolves with `ok === false`; without the check you parse an error body as data. With the check, throw `new ApiError('Request failed with 404', 404, 'not_found')` and render the mapped message.

### Intermediate

1. Wrap each route element: `<ErrorBoundary key={location.pathname} fallback={…}>{element}</ErrorBoundary>`; navigating away changes the key and clears the error, while the layout (nav, account menu) stays mounted because it is outside the boundary.
2. `ApiError` as in section 6, `messageFor` with three cases (`insufficient_stock`, `payment_declined`, `validation_failed`) and a default that says what happened without inventing a cause: "Something went wrong on our side. Try again in a moment." Add the request-id suffix for support in the console only.
3. `createRoot(container, { onUncaughtError, onCaughtError, onRecoverableError })` plus the two window listeners; de-duplicate with a `Set<string>` of `${message}:${release}` per session, and `keepalive: true` so a report survives navigation. Verify by throwing inside an event handler (window net) and inside a component (boundary/`onCaughtError`).

### Challenge

1. Payment timeout: catch in the mutation, show "We could not reach the payment provider. No money has been taken — you can try again." with a retry, and never auto-retry a payment; report with the idempotency key so support can reconcile. Declined card: the API returns `payment_declined`; message names the likely cause and offers another card; no retry. Partial failure (order created, email failed): the order screen still succeeds, with a non-blocking notice and a server-side retry; the client reports the failure but does not roll back. Render error in confirmation: route-level boundary with "Your order was placed (order #1234). We could not display the details — open your orders." plus a link, because the failure must not imply the order failed.
2. Endpoint: `POST /api/client-errors` validating a small schema, a per-IP and per-session rate limit, PII scrubbing (strip query strings and known fields), storage keyed by a hash of message+stack+release for grouping, and a retention policy. Client: the `reportError` of section 5 pointed at it. Evidence: trigger a deliberate error, confirm one row, then trigger it in a loop and confirm the rate limiter caps it.
3. The review is a table: screen → states present (loading/error/empty/partial) → notes. Typical gaps: a list with no error state ("infinite spinner"), a form with a generic "Something went wrong" for validation errors, a dashboard where one failing panel kills the page (missing widget boundary), and a payment flow that retries automatically. Fix the two most visible, and add one test each (MSW 500 → the error panel; a throwing child → the boundary fallback).

---

## 11. Summary

- **Four kinds of errors, four catch sites**: render errors → error boundaries; async/event errors → `try/catch` or `.catch`; network errors → the HTTP client plus the data layer's `error` state; user input → validation.
- **Boundaries only catch render/lifecycle errors** — not event handlers, not promises, not timers. That single fact explains most "the boundary never fired" reports.
- **Three levels of boundaries** (app, route, widget) with fallbacks that state what failed and offer a way out; the app-level fallback stays dependency-free.
- **`getDerivedStateFromError` + `componentDidCatch`** remain the only way to build a boundary — one of the rare places a class component is still correct.
- **Async hygiene prevents most production failures**: check `response.ok`, abort on unmount, distinguish aborts from failures, represent failure as state, and make retry policy explicit (GETs with backoff, writes never blind-retried).
- **Global nets complete the picture**: React 19's `onUncaughtError`/`onCaughtError`/`onRecoverableError`, plus `window.onerror` and `onunhandledrejection` — all reporting through one `reportError` that de-duplicates and never sends PII.
- **Normalise errors once** (`ApiError`, `toError`) and map codes to human messages, with a default that does not invent a cause.
- **The error screen is part of the UX**: write the loading/empty/error triad for every screen, and test the failure path with MSW (Part 13, file 05).

---

**What's next →** [`05-logging.md`](./05-logging.md) turns error handling into observability: log levels and a logger module that behaves correctly per environment, the measured fact that `console.log` calls (and their data) ship to every user's bundle, what must never be logged, batching and beacons that survive a tab close, correlation ids and breadcrumbs, and alerts that page a human only when they should.
