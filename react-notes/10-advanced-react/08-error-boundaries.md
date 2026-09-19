# 08 — Error Boundaries: Failure as a Designed State

> **Part 10 · Advanced React · File 8 of 9**

Why this file exists: every app fails — a render throws on bad data, a lazy chunk cannot be downloaded, an effect runs into a null, a request rejects. Without a plan, one throw anywhere in the tree unmounts the whole app and the user stares at a white screen. This file is the plan: what an error boundary catches (render and effect errors), what it does **not** catch (event handlers, timers, promises — measured, case by case), how to reset it so a retry can actually succeed (the lab shows `reset()` alone failing because the cause was still there), where to place boundaries so one broken widget cannot take down the page, and what to report so the next person can fix it.

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-error-probe.tsx` (`/tmp/part10-error.txt`).

---

## 1. Why failure needs a design

Three facts make errors a state to design rather than an embarrassment to hide:

1. **A throw during render unmounts the whole root** unless a boundary catches it. React's answer to an unhandled render error is to remove the tree — the "white screen of death".
2. **Errors are data-dependent**, so tests pass and production throws: a product with a missing field, an API that returns `null`, an image URL that is a `blob:` after revoking it, a numeric field that arrived as a string.
3. **Users judge failure by what they can still do.** A dashboard where one widget says "could not load sales — Retry" while the rest works feels broken-ish; one that goes blank feels dead.

An **error boundary** is a component that catches errors thrown by the components *below* it and renders a fallback instead of letting the whole tree unmount. It is the only component type React calls "special" besides `Suspense`, and it is the one class component these notes still teach — because React has no hook equivalent.

---

## 2. The implementation, line by line

```text
src/part10/Boundary.tsx
```

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      if (this.props.fallback !== undefined) return this.props.fallback(error, this.reset);
      return (
        <div data-testid="boundary-default">
          <p>Something went wrong: {error.message}</p>
          <button type="button" onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- **`state = { error: null }`** — the boundary's only state is "did something below me fail?". Keeping it in state (rather than a ref) is what makes the fallback render.
- **`static getDerivedStateFromError(error)`** — React calls this **during the render phase**, immediately after a child throws. It must be static, must be pure, and only returns the new state; it is the mechanism that tells React "this boundary will handle it".
- **`componentDidCatch(error, info)`** — called **after** the fallback has been committed. This is the reporting hook, not the state hook, and `info.componentStack` is the component path (a dev-time string; do not parse it for logic). It may be called twice in development under StrictMode.
- **`render()`** — the boundary either renders its children or the fallback. Note that it renders a *replacement*: the children are unmounted and lose all their state, which is exactly what the measurement in section 4 shows.
- **`reset`** — sets `error` back to `null`, which re-renders the children. Whether that helps depends entirely on whether the cause is gone (section 5).
- **`fallback` as a function** — receiving `(error, reset)` lets the caller decide the UI and offer retry, keeping the boundary itself generic.
- **No hooks equivalent.** `useState` cannot be called in a class, and React has no `useErrorBoundary()` that can catch render errors. The standard hook-based workaround (`react-error-boundary`'s `useErrorBoundary`) does not catch render errors either — it only gives you a way to *route* your own errors into the boundary (section 6).

⚠️ An error boundary **cannot catch errors in itself**. If `Boundary.render` throws, the next boundary up handles it. That is why a boundary's fallback must be trivial code.

---

## 3. What it catches, and what it does not

| Source of the error | Caught? | Why |
| --- | --- | --- |
| Render phase (a component function throws) | ✅ | React is running the render; it looks for the nearest boundary |
| `getDerivedStateFromError`/lifecycle of children | ✅ | same phase |
| An effect (`useEffect`, `useLayoutEffect`) that throws | ✅ | effects run inside React's commit |
| Event handler (`onClick`, `onChange`) | ❌ | the handler runs straight from the DOM, outside React's render/commit |
| `setTimeout`, `setInterval`, `requestAnimationFrame` callback | ❌ | plain JavaScript; React is not on the call stack |
| Promise rejection (`.then`, `await`, `fetch`) | ❌ | same: a microtask, no React frames involved |
| Server-side rendering (the boundary exists on the server only in frameworks) | ⚠️ | needs the framework's own error handling (Next.js `error.tsx` and friends) |
| The boundary's own `render`/fallback | ❌ | a boundary cannot catch itself |

The measured transcript, section by section:

```text
=== A. A render error is caught by the nearest boundary ===
   onError ran with: the product list exploded
   UI: "Something went wrong: the product list explodedTry again"
   the whole boundary subtree was replaced: the sibling is gone too

=== C. An error in an event handler is NOT caught by a boundary ===
   UI: "throw from a handler"
   boundary UI shown: false
   window error events seen: ["the bare handler failed"]

=== E. An error thrown in an effect IS caught ===
   UI: "Something went wrong: the effect explodedTry again"

=== F. An error in a timer or promise callback is NOT caught ===
   child still mounted: true
   boundary UI shown: false
   window error events seen: []
   process-level uncaught exceptions seen: ["the async callback exploded"]
```

The pattern is consistent and worth memorising: **if React called your code, React can catch it; if the browser called your code, React cannot.** Render, effects and lifecycles are React's; event handlers and timer/microtask callbacks are the browser's.

---

## 4. The blast radius: what "replaced" means

```text
   UI: "Something went wrong: the product list explodedTry again"
   the whole boundary subtree was replaced: the sibling is gone too
```

The lab mounted a boundary containing a paragraph and the throwing component. After the throw, **both** were gone: the boundary renders the fallback *instead of* its children, and React unmounts the children (state, DOM, effects) in the process. So the boundary is a blast-radius control, and where you place it decides how much of the page disappears:

| Placement | A throw inside it takes down | Good for |
| --- | --- | --- |
| **App root** | the whole app | a last resort that shows "reload" instead of white |
| **Route / layout** | one screen, while the nav and shell survive | every route in the app |
| **Widget / panel** | one card or module | dashboards, tables, charts, editors |
| **Around a lazy route** | that route | combining code failure with data failure (chapter 05) |

The rule: **a boundary per independent region**, and never one boundary for two things that should fail independently. A dashboard with four widgets and one boundary loses all four when the chart throws.

```tsx
<Layout>
  <ErrorBoundary fallback={<RouteError />}>       {/* screen level */}
    <Suspense fallback={<PageSkeleton />}>
      <DashboardPage />
    </Suspense>
  </ErrorBoundary>
</Layout>

// inside the page
<Widget title="Sales">
  <ErrorBoundary fallback={(error, reset) => <WidgetError error={error} onRetry={reset} />}>
    <Suspense fallback={<ChartSkeleton />}>
      <SalesChart />
    </Suspense>
  </ErrorBoundary>
</Widget>
```

---

## 5. Resetting: `reset()` alone is not enough

```text
=== B. Reset alone is not enough if the cause is still there ===
   after clicking Try again: "Something went wrong: the product list explodedTry again"
```

Clicking "Try again" re-rendered the same children, which threw the same way, so the fallback came back. That is not a flaw of `reset`; it is the honest behaviour of a retry that changes nothing. What a working retry needs is for the cause to be addressed *and* for the failed subtree to be rebuilt:

```text
=== G. A key remounts the boundary and gives the user a fresh attempt ===
   first render: "Reload the dataSomething went wrong: the product list explodedTry again"
   after fixing the cause and bumping the key: "Reload the datarendered safely"
```

```tsx
function Retryable() {
  const [attempt, setAttempt] = useState(0);
  return (
    <div>
      <button onClick={() => { armed = false; setAttempt((current) => current + 1); }}>
        Reload the data
      </button>
      <Boundary key={attempt}>   {/* a new boundary, a fresh subtree */}
        <Exploding />
      </Boundary>
    </div>
  );
}
```

Measured: after the cause was cleared and the key changed, the boundary was replaced by a brand-new instance whose children rendered `rendered safely`.

Three reset strategies, in order of usefulness:

1. **Remount with a `key`** (as above) — the whole subtree is rebuilt; correct when the failure came from data or state inside it. The idiomatic React 19 version is resetting the *state that caused the error* (or the router's `resetErrorBoundary`).
2. **Reset the boundary's own state** (`reset()`) — cheap, correct only if the cause is transient (a network blip that a refetch will fix) or if the components above have already changed the inputs.
3. **Reload the route / page** — blunt, but the honest answer when the failure is a stale chunk after a deploy or an unknown corruption (chapter 05, section 5). Offer it *after* an in-place retry has failed, not instead of one.

⚠️ A retry that silently refetches a broken endpoint can loop: three attempts, then a persistent message with a support reference is the pattern that respects the user and your logs.

---

## 6. Event handlers and async code: routing errors to a boundary

Because React cannot catch what the browser calls, errors in handlers and callbacks must be routed deliberately. The measured pattern:

```text
=== D. To route a handler error into a boundary, catch it and re-throw during render ===
   UI: "Something went wrong: the handler failedTry again"
   reported by the handler itself: ["the handler failed"]
   the handler stored the error in state; the next render threw it; the boundary caught it
```

```tsx
function useErrorTrigger(): [Error | null, (error: Error) => void] {
  const [error, setError] = useState<Error | null>(null);
  return [error, setError];
}

function HandlerWithErrorTrigger({ onReport }: { onReport: (message: string) => void }) {
  const [error, setError] = useErrorTrigger();
  if (error !== null) throw error;   // the render-phase throw the boundary can see
  return (
    <button onClick={() => { try { risky(); } catch (caught) { onReport(String(caught)); setError(caught); } }}>
      do the impossible
    </button>
  );
}
```

Which errors deserve which treatment:

| Error source | Treatment |
| --- | --- |
| A handler that can fail benignly (validation, a bad input) | show an inline message or toast; do not unmount a widget for it |
| A handler failure that means the screen is now inconsistent | route it into the boundary (state + throw), so the user gets one coherent recovery UI |
| A background task (upload, poll, websocket) | catch it, report it, show a non-blocking notification; never leave it unhandled |
| Anything you did not expect | a global `window.onerror` / `unhandledrejection` listener that reports (and, for unhandled rejections, warns developers in dev) |

⚠️ Do not use the boundary as a general error reporter for handlers. "Clicking the button nukes the page" is a worse experience than "the save failed, try again". The boundary is for *the component tree being unable to render*, which is why the handler routes it only when the state is genuinely broken.

---

## 7. Reporting: what to send, where, and what never to send

```tsx
<Boundary
  onError={(error, info) => {
    reportError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      route: window.location.pathname,
      release: import.meta.env.VITE_RELEASE,
      // ⚠️ never send tokens, passwords, full request bodies or user PII
    });
  }}
>
  <App />
</Boundary>
```

What makes a report actually fixable: the **release** it happened in (so you can tell whether a fix shipped), the **route**, the **error and component stack** (which is why source maps must be uploaded to the tracker — chapter 06 shows how to build them without serving them), the **user's action** and a **correlation id** you can also show the user ("Reference: 8f3c-…"), and the **user's environment** (browser, viewport, locale — time zone bugs are real).

⚠️ Silent boundaries are also a hazard: a widget that quietly shows "something went wrong" with no report teaches nobody anything. Every fallback path should either report or be a deliberate product state ("No data yet" is not an error).

**React Router, in this app's setup:** route-level errors are handled by a route's `errorElement`/`ErrorBoundary` (Data mode), which catches loader/action errors *and* render errors in that route's subtree, and `useRouteError()` gives the component the thrown value. That means most screens need no hand-written boundary at all: the router already provides one per route — you add boundaries *inside* a screen for widgets, and a root boundary for the shell.

---

## 8. Development vs production

- **Development**: React logs the caught error with its stack and component stack, and (in many setups) the dev overlay shows a red box. StrictMode can call `componentDidCatch` twice. All of this is normal and the transcript in this file shows it.
- **Production**: nothing is logged unless your `onError` reports it. React does not send anything anywhere. If you only wrote a nice fallback with no reporting, the failure is invisible.
- **Testing**: assert on both paths — the happy render *and* the fallback with a retry that succeeds on the second attempt. A boundary nobody has ever seen fire is not covered by tests; the lab's sections B and G are exactly the two cases to encode (retry that cannot succeed, and retry that can).

---

## 9. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | No boundary at all | one throw blanks the app | root + route + widget boundaries |
| 2 | One boundary for the whole app | any failure takes everything down | one per independent region |
| 3 | Expecting handlers/async errors to be caught | the error escapes to the console/window (measured) | catch and route, or handle locally |
| 4 | `componentDidCatch` in a function component | it does not exist; nothing is caught | class boundary, or a library's boundary |
| 5 | A fallback that renders complex UI with data it might not have | "something went wrong" inside "something went wrong" | keep the fallback trivial and dependency-free |
| 6 | Retry that does not change anything | the same error returns (measured) | reset the cause *and* remount the subtree |
| 7 | Infinite retry loop | requests hammering a broken endpoint | cap attempts, then a persistent message |
| 8 | No reporting | you learn about failures from users | `onError` → tracker with release, route, stacks |
| 9 | Reporting the whole error object/user data | secrets and PII in logs | filter fields; send ids, not contents |
| 10 | Boundary around a lazy route only | data errors still blank the screen | boundary *and* `Suspense` around lazy routes |
| 11 | Swallowing the error to keep rendering | half-updated UI that looks fine and is not | let the boundary replace the broken subtree |
| 12 | Testing only the happy path | the fallback has never been rendered before it matters | test the failure and the retry |

---

## 10. Best practices

1. **Ship three layers**: a root boundary (last resort), a boundary per route, and boundaries around independent widgets.
2. **Pair every `Suspense` with a boundary** — pending and failed are both normal states (chapter 07).
3. **Make retries meaningful**: reset the state that caused the failure, remount with a `key`, and cap the attempts.
4. **Route handler errors only when the screen is genuinely broken**; handle benign failures inline.
5. **Report with context** — release, route, stacks, correlation id — and never with secrets or user content.
6. **Show the user something actionable**: what failed, what still works, a retry, and a reference to quote to support.
7. **Keep fallbacks small and dependency-free**; a fallback that itself uses the app's data layer can fail for the same reason.
8. **Use the router's own error handling** for routes, and hand-written boundaries for widgets.
9. **Test the failure paths** (render error, failed chunk, failed request, successful retry after a fix).
10. **Review your boundaries when you add a region**: a new dashboard widget needs its own boundary, or it joins the blast radius of its neighbours.

---

## 11. Practice

### Beginner

1. List four things a boundary catches and four it does not, with one sentence explaining the difference.
2. Why does the lab's boundary make the sibling paragraph disappear too? Would a boundary around only the failing component be better? When?
3. Explain what `getDerivedStateFromError` and `componentDidCatch` each do, and why they are two methods.

### Intermediate

1. Wrap the shop admin's product list in a boundary with a retry that refetches the data. Explain why this retry can succeed where the lab's `reset()` could not, and what you had to change to make the cause go away.
2. Add a root boundary to the app that reports to a `console`-based stub report function and shows a "Reload" UI. Then add a route-level boundary and a widget-level boundary, and describe — for a product row whose price is `undefined` — which one fires and what the user can still do.
3. Turn an event-handler error into a boundary error using the `useErrorTrigger` pattern, and argue the case for the opposite decision (show a toast instead) for a "Save product" failure.

### Challenge

1. Build a small `errorStore` module: `report(error, context)`, a queue that survives a page reload (localStorage), and a maximum size, and wire it into every boundary in the app. Then simulate three failures (render, effect, failed chunk) and show the three reports it produces.
2. Design the failure UX for a checkout flow: which steps get their own boundaries, what the user can retry without losing entered data, what state must be persisted to support that, and what "your order may not have been placed" messaging should say when the mutation's outcome is unknown. Justify each decision with the measured behaviours in this file.
3. Write tests for the lab's boundary: the fallback renders on a render error, it does not render for an event-handler error (the window handler records it), the retry succeeds after the cause is cleared, and the retry fails again when the cause is not. Then state which of those four tests you would keep in a repo that uses a third-party boundary library.

---

## 12. Solutions

### Beginner

1. Caught: render errors, errors in child lifecycles/`getDerivedStateFromError`, errors thrown during commit/effects, and errors inside a component rendered by the boundary (including re-throws from state-routing). Not caught: event handlers, `setTimeout`/interval/rAF callbacks, promise rejections, and the boundary's own errors. The rule: React can catch errors raised on its own call stack (render/commit); when the browser calls your code later, React has already left the stack.
2. Because a boundary renders the fallback *instead of* its children — the failed component and its siblings are unmounted together. A finer boundary around only the failing component keeps the sibling visible and is better whenever the sibling is independent (a stat card next to a failing chart); it is worse when the parts must be consistent, because a half-rendered screen can mislead.
3. `getDerivedStateFromError` runs during the render phase and returns state that makes the fallback render — it decides *that* the boundary handles the error. `componentDidCatch` runs after the commit and receives `error` plus `info` — it is the side-effect hook for logging/reporting. React separates them so the render phase stays pure (state only) while reporting stays a commit-phase side effect.

### Intermediate

1. The lab's child threw from a module flag that was still `true`, so a re-render threw again. In the real case, the retry can succeed because it *fetches again* (the cause was a transient network/parse failure) and the boundary is remounted with a new `key` so the failed subtree is rebuilt from scratch. The change: the retry callback both triggers the refetch and bumps the boundary's key (or uses the router's `resetErrorBoundary`), plus capped attempts and a message if the second attempt fails too.
2. A root boundary reporting through a stub and showing "Reload" is the last resort. With a route-level boundary and a widget-level boundary, a product row with `price: undefined` throws while rendering the table; the **widget** boundary fires, so the user sees the widget's error card with a Retry while the rest of the screen (filters, other widgets, navigation) still works; the route boundary never fires, and the root one is not involved at all.
3. The pattern: `const [error, setError] = useErrorTrigger(); if (error) throw error;` in the component, and in the handler `try { await save(); } catch (caught) { setError(caught); }`. For "Save product", the opposite decision is usually right: a failed save does not make the screen unrenderable, and the user's typed input must not be unmounted — show an inline/toast error with a retry, keep the form mounted, and report the failure. Routing it to the boundary would throw away form state as the price of a nicer-looking error.

### Challenge

1. `errorStore`: `report(error, context)` formats `{ id, time, release, route, message, stack, componentStack, context }`, pushes it into an array persisted to `localStorage` (capped, e.g. 20 entries, oldest dropped), and prints in development. Wired into boundaries, a render error produces a report with a component stack; an effect error produces one with the same shape but a different message; a failed chunk produces `Failed to fetch dynamically imported module` plus the route — and because the entry survives a reload, the three reports can be read after the fact (which is exactly why the queue must be flushed to a real endpoint in production).
2. Steps: cart, address, payment, confirmation — each with its own boundary, plus a flow-level boundary. Payment gets the strictest treatment: the mutation is idempotent (a client-generated idempotency key) so a retry cannot double-charge; address data is persisted (in a store, not component state) so a boundary reset does not clear the form; the confirmation step needs an "unknown outcome" state with copy that tells the user what to check before retrying, because a timeout after sending the request means the order may exist. Each of those decisions maps to a measured behaviour: the fallback replaces the subtree (so state must live above it), the retry only works if the cause changed (so the retry must re-issue the mutation), and nothing catches async errors automatically (so the mutation's error path must be explicit).
3. Tests: (1) render error → fallback visible; (2) event-handler error → fallback *not* visible and the window error recorded; (3) retry with the cause cleared → the child renders; (4) retry with the cause present → the fallback returns. In a repo using a third-party library, keep (1), (3) and (4) as integration tests of your wiring and drop (2) — the library's own behaviour is not yours to re-test, but *your* decision to route handler errors (or not) still needs a test if it matters to the product.

---

## 13. Summary

- **An error boundary catches errors thrown by the components below it** and renders a fallback instead of letting the tree unmount. It is a class component with `static getDerivedStateFromError` (render-phase state) and `componentDidCatch` (post-commit reporting).
- **It catches what React calls: render, lifecycles and effects. It does not catch what the browser calls: event handlers, timers and promise rejections** — measured, all four cases, with the bare handler error reaching `window` and the timer error reaching the process's uncaught-exception handler.
- **The fallback replaces the whole subtree**: in the lab the sibling paragraph disappeared with the failing component, which is why boundary *placement* (root, route, widget) is a blast-radius decision.
- **`reset()` alone is not enough** when the cause is still there — measured: the same error returned immediately. A working retry fixes the cause **and** rebuilds the subtree (`key` remount, or a router's `resetErrorBoundary`), with capped attempts.
- **Handler errors can be routed into a boundary** by catching them, storing them in state, and throwing during render — measured: the boundary then showed the error UI. Do that only when the screen is genuinely broken; otherwise show an inline error and keep the user's input.
- **Always report.** Send release, route, error and component stacks, a correlation id, and never tokens or user content. React logs in development and stays silent in production.
- **Pair every `Suspense` with a boundary** (chapter 07) and use your router's own route-level error handling for screens; hand-written boundaries are for widgets and the root.
- **Test the failure paths** — render, effect, chunk, retry-after-fix, retry-without-fix — because that is the code that runs on the day it matters.

---

**What's next →** [`09-concurrent-features.md`](./09-concurrent-features.md) closes the part with the rendering half of responsiveness: `useTransition` and `useDeferredValue` measured on an expensive list (47.6 ms per keystroke without them; intermediate values skipped with them), what `startTransition` means outside a component, what concurrency does and does not guarantee, and how to decide between deferring work, memoising it, or virtualising it.
