# 05 — Logging, Monitoring and Observability

> **Part 15 · Production · File 5 of 8**

Why this file exists: in development you have the browser, the React DevTools and a stack trace; in production you have a user saying "it broke yesterday". Logging and monitoring are how an app explains itself when you are not watching — and how you find out about failures before your users tell you. This file starts with a measurement that surprises almost everyone: **your `console.log` calls (and whatever they print) ship to every user's browser**, and in Vite 8 the old esbuild trick to remove them is *ignored* — this lab verified that `esbuild: { drop: ['console'] }` produced an identical bundle while printing "oxc options will be used and esbuild options will be ignored". It then covers log levels, a logger module that behaves correctly per environment, what you must never log, how to get logs from the browser to somewhere you can query, breadcrumbs and correlation ids, and how to turn all of it into alerts that page a human.

Measured: `/home/user/lab/part15-logs.txt`.

---

## 1. Who reads your logs, and what they need

| Reader | Needs | Time horizon |
| --- | --- | --- |
| **You, developing** | what value arrived, why the branch was taken | seconds |
| **You, debugging a report** | the sequence of events before the failure, with ids | hours/days later |
| **On-call at 3 a.m.** | "is it broken, how badly, since when, what changed" | minutes |
| **Product/support** | "did this user's order actually go through" | days |
| **Audit/compliance** | who did what, when (for sensitive actions) | months/years |

The design rule that follows: **log events with fields, not sentences**, so the same record can answer several of those questions. `"cart add failed"` cannot answer any of them; `{ event: 'cart.add.failed', code: 'insufficient_stock', sku, quantity, userId, requestId }` answers most.

⚠️ **Do not log to answer a question you have not asked.** Logs cost bandwidth, storage, money and risk (they are data). Every log line should have a plausible future reader and question.

---

## 2. Levels, and what each one is for

| Level | Means | In production | Example |
| --- | --- | --- | --- |
| `debug` | developer detail, high volume | off (or sampled) | "recomputed totals for 12 items" |
| `info` | normal, notable business events | on, low volume | "order placed", "session refreshed" |
| `warn` | unexpected but handled | on | "retrying request (attempt 2)", "deprecated API used" |
| `error` | something failed and a human should care | on, **alerted** | "payment provider returned 500" |

```ts
// src/shared/lib/logger.ts — a logger that behaves differently per environment
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: Level = import.meta.env.DEV ? 'debug' : 'info';

// console methods are captured by reference so the bundler can drop the calls
const sink: Record<Level, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  const write = (level: Level, event: string, fields: Record<string, unknown> = {}): void => {
    if (ORDER[level] < ORDER[MIN_LEVEL]) return;                 // debug is a no-op in production
    const record = { level, scope, event, at: new Date().toISOString(), ...fields };
    sink[level](record);
    if (level === 'error') reportError(record);                  // errors also go to the reporter (file 04)
  };
  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
```

```tsx
// Usage: a scoped logger, events in dot notation, fields not prose
const log = createLogger('cart');
log.info('cart.item.added', { sku, quantity, priceMinor });
log.error('cart.checkout.failed', { code: error.code, requestId, itemCount });
```

💡 Two small habits with outsized value: **scope per feature** (`createLogger('cart')`) so you can filter, and **an `event` name in a hierarchical form** (`cart.item.added`) so you can grep and aggregate. Both make logs usable under pressure, which is the only time they matter.

---

## 3. What actually ships to production (measured)

```tsx
<button onClick={() => {
  console.log('[cart] add item', { sku: 'LAMP-01', priceMinor: 129950, email: 'buyer@example.com' });
  console.debug('[cart] debug detail');
}}>
```

```text
=== default production build (npx vite build) ===
console.log            FOUND (bundle 221695 bytes)
console.debug          FOUND
the logged string      FOUND ('[cart] add item')
the logged email       FOUND ('buyer@example.com')      ← a real user's email, in the shipped file

=== esbuild: { drop: ['console','debugger'] } (Vite 8) ===
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored.
The following esbuild options were set: `{ drop: [ 'console', 'debugger' ] }`
bundle identical: 221695 bytes, console.log still FOUND              ← the option did nothing

=== build.minify: 'terser' + terserOptions.compress.drop_console: true ===
console.log            not found   (221232 bytes)
console.error          not found   ← drop_console removes ALL console methods
the logged email       not found

=== terserOptions.compress.pure_funcs: ['console.log','console.debug','console.info'] ===
console.log            not found
console.debug          not found
the logged email       not found
console.error          FOUND       ← only the listed methods are dropped (221440 bytes)
```

Six lessons from that measurement, all of them practical:

1. **Debug logs and their data are public in a client build** — measured: the literal email string ended up in `dist/assets/index-*.js`.
2. **Vite 8 transforms with Oxc, not esbuild**: the `esbuild: { drop: [...] }` option is ignored (Vite even warns you), so old blog-post advice does not apply.
3. **Console removal at build time is a minifier concern**: `build.minify: 'terser'` plus `terserOptions.compress` is the supported path in Vite 8 (it requires installing `terser`).
4. **`drop_console: true` is a blunt instrument** — it removed `console.error` too, which is exactly the call you may want to keep (or route through your reporter anyway).
5. **`pure_funcs` gives precision**: listing `console.log`/`debug`/`info` removed those calls *and their string literals* while keeping `console.error`.
6. **Relying on the bundler is fragile**; a logger module that never calls `console.debug` in production is robust, testable, and works the same in any bundler.

```ts
// vite.config.ts — the precise version, if you prefer the build to enforce it
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        pure_funcs: ['console.log', 'console.debug', 'console.info'],   // keep console.error
        drop_debugger: true,
      },
    },
  },
});
```

⚠️ **Do not put secrets in logs "just for now".** Logs are copied into issue trackers, screenshots, support tickets and third-party services; a token in a log is a token leaked, and log retention rules (GDPR and friends) apply to log data like any other personal data.

---

## 4. What never to log (and how to make that enforceable)

| Never log | Why |
| --- | --- |
| Passwords, password hashes, "password reset" tokens | the most damaging leak, and always avoidable |
| Access/refresh tokens, session ids, CSRF tokens, API keys | full account takeover from a log file |
| Full card numbers, CVV, bank details | regulatory (PCI-DSS), and unambiguous |
| National ids, health data, precise location | sensitive personal data with legal weight |
| The entire request/response body "for debugging" | bodies contain all of the above |
| Email/phone/full name when a stable id would do | minimise personal data; use `userId` |

```ts
// src/shared/lib/redact.ts — a last line of defence in the logger
const REDACT_KEYS = /^(password|token|accessToken|refreshToken|authorization|cookie|cardNumber|cvv|ssn)$/i;
const REDACT_PATTERNS = [/[\w.+-]+@[\w-]+\.[\w.]+/g, /\b\d{13,19}\b/g];   // email, long digit runs

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return REDACT_PATTERNS.reduce((acc, re) => acc.replace(re, '[redacted]'), value);
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, REDACT_KEYS.test(key) ? '[redacted]' : redact(v)]));
  }
  return value;
}
```

```ts
// Make it hard to log outside the logger: fail the lint instead of the audit
// eslint.config.js
{ files: ['src/**/*.{ts,tsx}'], rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] } }
```

💡 **Redaction is a safety net, not a licence.** The primary control is not passing sensitive values to the logger at all; redaction catches the mistake you did not notice. Test it — a redaction function without a test is a comment.

---

## 5. Getting logs off the browser

A browser cannot write to a log file: it has no filesystem, and the user can close the tab at any moment. Client logs travel over the network to a collector, which means three engineering problems: **transport** (do not lose the last events), **volume** (do not flood), and **correlation** (join client and server records).

```ts
// src/shared/lib/logTransport.ts — batched, non-blocking, survives navigation
interface LogRecord { level: string; scope: string; event: string; at: string; [key: string]: unknown }

let queue: LogRecord[] = [];

export function enqueue(record: LogRecord): void {
  queue.push(record);
  if (queue.length >= 20) void flush();
}

export async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await fetch('/api/client-logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ records: batch, release: import.meta.env.VITE_APP_VERSION ?? 'dev' }),
      keepalive: true,                       // survives page unload
    });
  } catch {
    // Never let logging break the app; dropping is better than throwing
  }
}

// The last events before a user closes the tab
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    const body = JSON.stringify({ records: queue, release: 'dev' });
    navigator.sendBeacon?.('/api/client-logs', body);         // fire-and-forget, no CORS preflight for text/plain
    queue = [];
  }
});
```

| Concern | Practice |
| --- | --- |
| Losing the last events | `keepalive: true` or `navigator.sendBeacon` on `visibilitychange` |
| Flooding the collector | batch (e.g. 20 records or 5 seconds), rate-limit per session, sample `debug`/`info` |
| Blocking the UI | never `await` logging in a click handler; fire and forget |
| Ordering | include a monotonic counter or timestamp; server sorts |
| Privacy | redact client-side **before** sending; the server should reject obviously sensitive fields |
| Cost | set the level per environment and keep `info` events rare |

⚠️ **Logging endpoints are an attack surface.** Anyone can POST anything to `/api/client-logs`, so the server must authenticate (or at least rate-limit by IP/session), cap the payload size, validate the shape, and never trust a "userId" from the body (take it from the session). Otherwise your log store becomes free storage for someone else, or a place to inject convincing-looking fake records.

---

## 6. Correlation: making a story out of scattered records

```ts
// src/shared/api/http.ts — every request carries an id that appears in logs on both sides
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestId = crypto.randomUUID();
  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: { ...init.headers, 'x-request-id': requestId },
  });
  if (!response.ok) {
    log.error('api.request.failed', { path, status: response.status, requestId });
    throw new ApiError('Request failed', response.status, 'http_error', { requestId });
  }
  return (await response.json()) as T;
}
```

| Id | Where it comes from | Why |
| --- | --- | --- |
| `requestId` | the client, echoed by the server | joins a user's error report to server logs |
| `traceId` | an APM/OpenTelemetry propagator | joins client → API → downstream service |
| `sessionId` | a random per-tab id (not the auth session) | groups a user's actions without identifying them |
| `userId` | only when signed in, only where needed | support questions ("did this user's order go through") |
| `release`/`version` | the build (file 01) | separates "broken since v42" from "broken since forever" |
| `route` | the router | which screen the user was on |

💡 **Show the id to the user in error messages** ("Error reference: 9f2c"). It costs nothing and turns "it broke" into a five-minute lookup.

---

## 7. Breadcrumbs: what happened before the error

An error alone is often not actionable; the sequence is. Error SDKs keep a rolling buffer of recent events (navigation, clicks, network calls) and attach it. You can build the core of it in twenty lines:

```ts
// src/shared/lib/breadcrumbs.ts
interface Crumb { at: number; kind: 'nav' | 'click' | 'http' | 'log' | 'state'; message: string; data?: Record<string, unknown> }

const MAX = 30;
let crumbs: Crumb[] = [];

export function addBreadcrumb(crumb: Omit<Crumb, 'at'>): void {
  crumbs = [...crumbs.slice(-(MAX - 1)), { ...crumb, at: Date.now(), ...(crumb.data ? { data: redact(crumb.data) as Record<string, unknown> } : {}) }];
}

export function getBreadcrumbs(): Crumb[] {
  return crumbs;
}
```

```tsx
// Wire it where events originate — cheap, and it pays off on the first hard bug
useEffect(() => addBreadcrumb({ kind: 'nav', message: `navigated to ${location.pathname}` }), [location.pathname]);
<button onClick={(event) => { addBreadcrumb({ kind: 'click', message: 'clicked checkout', data: { id: product.id } }); onSubmit(event); }} />
```

Then attach `getBreadcrumbs()` to every error report (file 04). ⚠️ A breadcrumb buffer is memory the user does not own, so **redact it** the same way as logs, and keep it small (30 entries, no bodies).

---

## 8. From logs to answers: dashboards and alerts

Logs are for questions you ask after something happens; **metrics and alerts** are for noticing without asking.

| Signal | Source | Alert when |
| --- | --- | --- |
| Error rate (per minute) | reporter/collector | above a threshold, or a step change after a release |
| New issue group | error SDK | any new group in production (with a release tag) |
| Failed login rate | server logs/metrics | a spike (credential stuffing) |
| API latency p95 | server/APM | above the budget for 5 minutes |
| Core Web Vitals (LCP/INP) | RUM (file 07) | p75 above the budget |
| Availability | uptime check | 2 consecutive failures |
| Client-side `unhandledrejection` count | reporter | a sustained rise (a forgotten `catch`) |

```text
A useful alert has four parts:
1. A symptom a user would recognise ("checkout error rate > 2% for 5 minutes")
2. A threshold that is not noise (and a "page vs ticket" distinction)
3. A link to the runbook: what to check, how to roll back (file 08)
4. An owner: who is expected to act
```

⚠️ **Alert fatigue is a real failure mode.** Every alert that fires without action trains the team to ignore the next one. Start with a handful (error rate, new issue group, availability, one business metric), tune the thresholds for a month, and delete anything nobody acted on.

---

## 9. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `console.log` everywhere | measured: logs and their data ship to production | a logger with levels; drop debug in prod |
| 2 | Logging whole objects/requests | PII, tokens and card data in a third-party service | log ids and fields you choose |
| 3 | Logging without an event name | nobody can filter or aggregate | hierarchical `event` names |
| 4 | Treating `warn` as `error` (or vice versa) | alerts nobody trusts | a level policy (section 2) |
| 5 | `await`ing logging in a handler | logging makes the UI slower or fails the action | fire-and-forget |
| 6 | No correlation id | you cannot join client and server records | `requestId` on every request |
| 7 | Sending every event | cost, noise, rate limits | batch, sample, and keep `info` rare |
| 8 | Trusting the client's log payload | fake users, oversized payloads, injected data | authenticate, rate-limit, validate server-side |
| 9 | Logging only errors | no context to reproduce | breadcrumbs + `info` for key business events |
| 10 | Never testing redaction | the leak is discovered by a customer | unit-test `redact()` with real-ish payloads |
| 11 | Alerts on everything | ignored alerts, missed incidents | few alerts, tuned, with owners |
| 12 | No release tag in reports | "when did this start?" is unanswerable | include `release` everywhere |

---

## 10. Best practices

1. **Log events with fields**, using a scoped logger and hierarchical event names.
2. **Levels per environment**: `debug` in development, `info` and above in production, `error` for things a human must see.
3. **Assume everything in the bundle is public**, and never log secrets, tokens or personal data — redact as a safety net and test the redaction.
4. **Do not rely on the bundler alone**: a logger that skips `console.debug` in production works regardless of Vite/Terser/Oxc versions (and if you do want the build to strip calls, measured Vite 8 settings are `build.minify: 'terser'` + `pure_funcs`).
5. **Batch and beacon**: queue, flush in batches, `keepalive`/`sendBeacon` for the last events, and never block the UI.
6. **Correlate everything**: `requestId`, `traceId`, `sessionId`, `release`, `route`.
7. **Collect breadcrumbs** for the last 30 actions and attach them to error reports (redacted).
8. **Alert on symptoms users feel**, with thresholds you have tuned, links to a runbook, and an owner.
9. **Protect and govern the pipeline**: authenticate and rate-limit the collector, set retention, and review the fields you store against your privacy rules.
10. **Read your own logs.** A monthly skim of production logs and alert history finds more real problems than any static tool.

---

## 11. Practice

### Beginner

1. Add a logger module to an app and replace every `console.log` with `log.debug`/`log.info`. Verify that `debug` output is absent in a production build.
2. Log an object containing an email and a token, then run your `redact()` over it and assert both are gone. Write the test.
3. Add an ESLint rule that fails on bare `console.log` (allowing `console.error`), and fix the violations.

### Intermediate

1. Build the batched transport with `keepalive`, plus a `visibilitychange` beacon. Verify in the Network tab that a batch is sent when you navigate away.
2. Add `requestId` generation in the HTTP client and echo it back from a stub server; log it with the error and show the id to the user in the error message.
3. Implement breadcrumbs (30-entry ring buffer) and attach them to error reports; trigger an error and read the report to confirm the sequence is there.

### Challenge

1. Design the observability plan for a checkout flow: which events at which levels, which ids, which breadcrumbs, which metrics, which alerts (with thresholds and owners), what is never logged, and how long data is retained.
2. Measure the true cost of logging: add up the payload size per session, requests per user, and storage per 1 000 users/day at your sampling rate, then choose the sampling and retention policy that fits a budget.
3. Implement log-based diagnosis end to end with a small collector: accept batches, validate and rate-limit, redact server-side as well, store them, and build one query that answers "what happened in this user's session at 14:32?" — including the client records, the API requests, and the release version.

---

## 12. Solutions

### Beginner

1. `createLogger` as in section 2, with `MIN_LEVEL` derived from `import.meta.env.DEV`. In a production build the `debug` calls return early — and if you rely on the bundler instead, the measured configuration keeps the removal precise (`pure_funcs` for `log`/`debug`/`info`, leaving `console.error`).
2. `redact({ email: 'buyer@example.com', token: 'eyJhbGciOi…' })` → `{ email: '[redacted]', token: '[redacted]' }`. The unit test is the thing that keeps this true when someone adds a new sensitive field.
3. `'no-console': ['error', { allow: ['warn', 'error'] }]` — the logger module itself gets an inline exception (`/* eslint-disable no-console */` at the top) so the rule is "console only inside the logger", which is enforceable and clear.

### Intermediate

1. The queue flushes at 20 records or on a timer; `keepalive: true` lets the request outlive the page, and the `visibilitychange` beacon covers the tab-close case where `fetch` may be cancelled. Verify with DevTools: navigate away mid-session and confirm the final POST in the Network tab (or in the collector's log).
2. `crypto.randomUUID()` per request, sent as a header, logged on failure, echoed by the server and shown to the user as an error reference. This one field is the difference between "we had an error once" and "here is the exact request, its server-side handling, and its stack".
3. The ring buffer holds 30 redacted entries; the reporter attaches `breadcrumbs: getBreadcrumbs()`. Trigger an error after three navigations and two clicks and read the report: the sequence should be legible enough to reproduce the path without asking the user anything.

### Challenge

1. Checkout observability: `info` for `checkout.started`, `payment.submitted`, `order.created` (ids, amounts in minor units, no card data); `warn` for retries and slow provider responses; `error` for provider failures, validation rejections on the server, and failed emails; breadcrumbs for navigation and clicks on checkout steps; ids: `requestId`, `sessionId`, `userId` (when known), `release`, `route`; metrics: checkout success rate, p95 latency, provider error rate; alerts: success rate below 95% for 5 minutes (page), any new error group tagged with the release (ticket), provider error rate above 2% (page); never logged: card data, tokens, full addresses (use ids/regions); retention: 30 days for logs, 13 months for aggregated metrics.
2. The maths: at 30 events/session × ~300 bytes = ~9 kB per session of payload; 1 000 users/day ≈ 9 MB/day ≈ 270 MB/month before compression (JSON compresses ~5–10×). Sampling `info` at 10% and keeping errors at 100% typically cuts volume by an order of magnitude while preserving the signals you alert on — the decision should be written down with those numbers, because "we log everything" is a budget nobody agreed to.
3. Collector: validate the shape (a schema), rate-limit per session/IP, cap payload size, redact again server-side (never trust the client), store with `release`, `sessionId`, `requestId` indexed, and expose one search. The query "what happened in this user's session at 14:32?" then returns: the client breadcrumbs, the logged events, the API requests with their statuses and latencies (joined by `requestId`), and the release version — which is the moment logging stops being a chore and starts being how you debug production.

---

## 13. Summary

- **Everything in the bundle is public** — measured: `console.log` calls, their strings, and even a user's email were present in the production JS (`221695` bytes) with no configuration to stop them.
- **Vite 8 uses Oxc**: `esbuild: { drop: ['console'] }` is *ignored* (with a warning, bundle byte-identical). Console removal is a minifier job — measured working options: `build.minify: 'terser'` with `drop_console: true` (removes everything, including `console.error`) or `pure_funcs: ['console.log','console.debug','console.info']` (removes those, keeps `error`).
- **The robust answer is a logger module**: levels, scopes, structured event fields, `debug` off in production, errors forwarded to the reporter — independent of bundler behaviour and testable.
- **Never log secrets or personal data**, and treat redaction as a tested safety net rather than a policy.
- **Client logs need a transport**: batching, `keepalive`/`sendBeacon` on tab close, non-blocking, sampled, and collected by an endpoint that authenticates, rate-limits and validates.
- **Correlation ids make a story out of scattered records**: `requestId` across the client and server, `sessionId`, `release`, `route` — and show the id to the user in error messages.
- **Breadcrumbs** (the last ~30 actions, redacted) turn "it broke" into a reproducible sequence.
- **Metrics and alerts are for noticing, logs are for explaining**: alert on user-visible symptoms with tuned thresholds, a runbook link and an owner — and delete alerts nobody acts on.

---

**What's next →** [`06-security.md`](./06-security.md) covers what the browser does and does not protect you from: XSS and React's escaping (measured: text children are escaped, `dangerouslySetInnerHTML` is not, and React blocks `javascript:` URLs in JSX but not in raw HTML), sanitising rich text, same-origin and CORS, cookies and CSRF, Content Security Policy, and supply-chain hygiene.
