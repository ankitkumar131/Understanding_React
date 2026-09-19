# 05 — Client-Side Logging and Monitoring

> **Part 15 · Production · File 5 of 8**

Why this file exists: file 04 ended with `reportError(error)` calls that go nowhere. This
file makes them go somewhere useful. Client-side logging is genuinely hard — the code runs
on machines you cannot inspect, in browsers you cannot reproduce, for users who will not
write a bug report. You get exactly one chance to capture the right context at the moment
of failure. This file covers what a log entry must contain, breadcrumbs, sampling, PII,
release tracking, and the difference between logging, monitoring and alerting.

---

## 1. `console.log` is not observability

`console.log` writes to a DevTools panel **on the user's machine**, which you will never
see. It is a development tool. Three consequences:

| What you need | `console.log` | A real reporter |
| --- | --- | --- |
| See errors from real users | ❌ | ✅ |
| Know which release broke | ❌ | ✅ (release + commit) |
| Reproduce a user's path | ❌ | ✅ (breadcrumbs) |
| Know how often it happens | ❌ | ✅ (grouping + counts) |
| Not slow down the app | ❌ (it runs anyway) | ✅ (batched, sampled) |

🏭 **Keep `console.*` in development, silence or route it in production.** The common
setup: a `logger` module that writes to `console` when `config.isDev` and to the reporter
otherwise — so you never have to strip logs by hand and never ship a noisy console.

---

## 2. What a useful client log entry contains

The whole craft is context. An error message alone ("Cannot read properties of undefined")
is almost useless; the same message with context is a five-minute fix.

```ts
// src/shared/lib/logger.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Breadcrumb trail: what happened before the failure. */
  breadcrumbs?: Breadcrumb[];
  /** The route the user was on. */
  route?: string;
  /** Free-form structured data — never put secrets or PII here. */
  extra?: Record<string, unknown>;
  /** Logged-in user id, if any. An id, never an email or name. */
  userId?: string;
}

export interface Breadcrumb {
  timestamp: number;
  category: 'navigation' | 'ui' | 'http' | 'console' | 'state';
  message: string;
  data?: Record<string, unknown>;
}
```

A complete entry, as it should arrive at your backend or SaaS provider:

```jsonc
{
  "level": "error",
  "message": "Cannot read properties of undefined (reading 'title')",
  "stack": "at TaskItem (TaskItem.tsx:14:22)…",
  "release": "taskboard@1.4.2",
  "commit": "98d1890",
  "environment": "production",
  "route": "/tasks/42",
  "userId": "usr_8f2a",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)…",
  "viewport": "1366x768",
  "timestamp": "2026-09-19T09:14:02.118Z",
  "breadcrumbs": [
    { "category": "navigation", "message": "/tasks → /tasks/42" },
    { "category": "http", "message": "GET /api/tasks/42 → 200 (142ms)" },
    { "category": "ui", "message": "click: tab 'Comments'" }
  ]
}
```

The last three fields are the ones that turn "we have a bug" into "the comments tab assumes
`task.title` exists, and this task was created before we added titles".

---

## 3. A logger you can actually use

```ts
// src/shared/lib/logger.ts (continued)
import { config } from '@/config';

const MAX_BREADCRUMBS = 50;
const breadcrumbs: Breadcrumb[] = [];

export function addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
  breadcrumbs.push({ ...breadcrumb, timestamp: Date.now() });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();   // ring buffer
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) => emit('debug', message, extra),
  info:  (message: string, extra?: Record<string, unknown>) => emit('info', message, extra),
  warn:  (message: string, extra?: Record<string, unknown>) => emit('warn', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => emit('error', message, extra),
};

function emit(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[config.minLogLevel]) return;
  if (config.isDev) {
    // In development, the console IS the destination
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](message, extra ?? '');
    return;
  }
  void send({ level, message, extra, breadcrumbs: [...breadcrumbs] });
}

/** Fire-and-forget. Never let logging break the app. */
async function send(entry: Record<string, unknown>): Promise<void> {
  if (Math.random() > config.logSampleRate) return;     // sampling, section 5
  try {
    await fetch(`${config.apiUrl}/logs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...entry, ...environmentInfo() }),
      keepalive: true,      // survives navigation / tab close
    });
  } catch {
    // Deliberately empty: if logging fails, there is nowhere left to report it.
    // Failing loudly here would create an infinite error loop.
  }
}

function environmentInfo() {
  return {
    release: config.release,
    commit: config.commit,
    environment: config.mode,
    route: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}
```

**Line by line**

- `breadcrumbs` as a module-level ring buffer — bounded at 50 so a long session cannot
  grow memory without limit.
- `LEVELS` — numeric levels mean one config value (`minLogLevel: 'warn'`) silences debug
  and info in production without deleting code.
- `keepalive: true` — lets the log request finish even if the user navigates away or closes
  the tab, which is exactly when crashes happen.
- The empty `catch` — the one place an empty catch is correct. A reporter that throws
  creates a loop: error → report → report fails → error.
- `config.isDev` branch — same call sites in dev and prod, different destinations.

⚠️ **Never `await` a log call in a user-facing path.** Logging is best-effort. If your
button handler awaits a log request, a slow logging endpoint makes your UI feel slow.

---

## 4. Wiring it to the error layers from file 04

```tsx
// src/app/providers.tsx
import { logger, addBreadcrumb } from '@/shared/lib/logger';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

export function reportError(error: unknown, context?: LogContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(err.message, {
    stack: err.stack,
    name: err.name,
    kind: error instanceof ApiError ? error.kind : undefined,
    status: error instanceof ApiError ? error.status : undefined,
    ...context,
  });
}

<ErrorBoundary onError={(error, info) => reportError(error, { componentStack: info.componentStack })}>
```

```ts
// Breadcrumbs: capture the paths that lead to failures
// 1. navigation (in the router or a <NavigationListener />)
useEffect(() => addBreadcrumb({ category: 'navigation', message: location.pathname }), [location.pathname]);

// 2. HTTP (inside httpClient.ts — one line, every request covered)
addBreadcrumb({ category: 'http', message: `${init.method ?? 'GET'} ${path} → ${response.status} (${ms}ms)` });

// 3. user actions (only on stable, meaningful controls — not every keystroke)
<button onClick={() => { addBreadcrumb({ category: 'ui', message: 'click: Save task' }); save(); }} />
```

💡 **The highest-value breadcrumb is the HTTP one**, because it is added in exactly one
place (`httpClient.ts`) and covers every request in the app. Do that first.

⚠️ **Do not breadcrumb every keystroke or mouse move.** You will fill the 50-slot ring
buffer with noise and evict the navigation entries that actually mattered.

---

## 5. Sampling, volume and cost

Client logs scale with users, not with servers. Ten thousand users × one error each = ten
thousand events per deploy.

```ts
// src/config.ts
export const config = {
  // ...
  minLogLevel: import.meta.env.MODE === 'production' ? 'warn' : 'debug',
  /** 1 = send everything. 0.1 = send 10%. Errors should generally NOT be sampled. */
  logSampleRate: Number(import.meta.env.VITE_LOG_SAMPLE_RATE ?? 1),
} as const;
```

The practical policy most teams converge on:

| Event | Sample | Why |
| --- | --- | --- |
| Render crash / 500 | **Never** (100%) | Rare and always a bug |
| Network error | 10–100% | Often a user's flaky wifi, not your bug |
| `debug` / `info` | 0–1% in prod | Diagnostic noise |
| Breadcrumbs | Sent with an error only | They are context, not events |

🏭 **The rule: sample noise, never sample crashes.** A crash reported at 10% looks like a
rare edge case when it might be affecting every user.

---

## 6. PII, secrets and what must never be logged

Client logs leave the user's machine. Treat them as personal data.

```ts
// ❌ leaks credentials and personal data
logger.error('login failed', { email, password, token, body: requestBody });

// ✅ an id and a reason
logger.error('login failed', { userId: user?.id, reason: error.kind });
```

| Never log | Because |
| --- | --- |
| Passwords, tokens, refresh tokens | A log viewer becomes an account takeover |
| Full request/response bodies | They contain whatever your users typed |
| Emails, names, phone numbers, addresses | Personal data; may trigger GDPR/DPA duties |
| `localStorage` dumps | Contains your session (Part 14) |
| Full URLs with query strings | Tokens and search terms live in query strings |
| Source maps to a public URL | They de-minify your entire codebase for anyone |

```ts
// A redaction pass is cheap insurance against a careless call site
const SENSITIVE = /password|token|authorization|secret|cookie|apikey/i;

export function redact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) =>
      SENSITIVE.test(k) ? [k, '[redacted]'] : [k, typeof v === 'string' && v.length > 500 ? v.slice(0, 500) + '…' : v]),
  );
}
```

⚠️ **Source maps:** ship them to your error tracker, **not** to your CDN. Most trackers
accept an upload step in CI (`--sourcemap` upload) precisely so the public bundle stays
unreadable while your stack traces stay useful.

---

## 7. Release tracking: "when did this start?"

The single most useful question in an incident is *when did it begin*, and the answer
requires every log to carry a version.

```ts
// vite.config.ts — inject build metadata at build time
import { execSync } from 'node:child_process';

const commit = execSync('git rev-parse --short HEAD').toString().trim();
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
});
```

```ts
// src/vite-env.d.ts
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

// src/config.ts
export const config = { /* … */ release: `${import.meta.env.VITE_APP_NAME}@${__APP_VERSION__}`, commit: __APP_COMMIT__ };
```

With that, your tracker can show: *"TypeError in TaskItem — first seen in 1.4.2, 0 events
in 1.4.1, 412 events in 1.4.2."* That sentence alone usually identifies the culprit commit,
and it tells you rollback is a valid fix.

🏭 **Deploy ≠ release in an SPA.** Users keep the old JavaScript until they reload. Log the
version so you can tell "still on 1.4.1" from "genuinely broken on 1.4.2".

---

## 8. Logging vs monitoring vs alerting

| Term | Question it answers | Example |
| --- | --- | --- |
| **Logging** | What happened? | An event stream you search after the fact |
| **Monitoring** | How is it doing right now? | A dashboard of error rate, LCP, API latency |
| **Alerting** | Does a human need to act *now*? | "Error rate > 1% for 5 min" pages someone |

⚠️ **Alerting on individual client errors does not work** — you will be paged for one
user's browser extension. Alert on *rates and deltas*: error rate compared to the same
window yesterday, or a spike right after a deploy.

The minimum viable production setup, in order of value per hour spent:

1. An error tracker (Sentry, Bugsnag, GlitchTip — or your own `/logs` endpoint).
2. Real User Monitoring for Core Web Vitals (file 07) — the same `/logs` endpoint works.
3. Uptime checks on your API and your deployed URL (external, cheap, catches DNS/CDN issues
   your client code cannot).
4. Dashboards. 5. Alerts on rates.

---

## 9. Common mistakes

| Mistake | Consequence | Fix |
| --- | --- | --- |
| `console.log` as production logging | You never see user errors | A `logger` module |
| Logging the raw error object | `Error` does not JSON-serialise (message/stack are non-enumerable) | Extract `message`, `stack`, `name` |
| Unbounded breadcrumb list | Memory growth on long sessions | Ring buffer (50) |
| `await` on logging | Slow UI, blocked handlers | Fire-and-forget with `keepalive` |
| Logging tokens or bodies | Security incident | Redaction pass (section 6) |
| Shipping source maps publicly | Your source is public | Upload to the tracker instead |
| No release version | "When did this start?" is unanswerable | Inject version + commit (section 7) |
| Alerting on single errors | Alert fatigue, then ignored alerts | Alert on rates and deploy deltas |
| Empty `catch` everywhere except the reporter | Invisible bugs | Log, then decide |

🔍 **Why `JSON.stringify(new Error('x'))` gives `{}`:** `message` and `stack` are defined as
non-enumerable own properties on `Error`. This surprises everyone exactly once — always
pull the fields out explicitly.

---

## 10. Practice

### Beginner
1. Implement `logger` and `addBreadcrumb`, wire `reportError` into a root `ErrorBoundary`,
   and confirm the entry arrives at `POST /logs` (use `json-server` or a `console.table`
   stand-in).
2. Verify `JSON.stringify(new Error('boom'))` in the console and explain what you see.

### Intermediate
1. Add HTTP breadcrumbs inside `httpClient.ts` and prove they appear on a deliberately
   crashing component.
2. Add `redact()` and a test that a body containing `password` never reaches `send()`.

### Challenge
1. Inject `__APP_VERSION__` / `__APP_COMMIT__` via `vite.config.ts` and assert in a test
   that they are non-empty strings.
2. Implement a beacon: on `visibilitychange → hidden`, flush any unsent entries with
   `navigator.sendBeacon`. Test with a mocked beacon and fake timers.

---

## 11. Solutions

### Beginner
1. The `logger` from section 3, with `ErrorBoundary onError={reportError}`. With no backend,
   point `send()` at `console.table` temporarily — the shape of the payload is the lesson.
2. It prints `{}`. `message`, `stack` and `name` are non-enumerable, so `JSON.stringify`
   skips them. Fix: `JSON.stringify({ message: e.message, stack: e.stack, name: e.name })`.

### Intermediate
1. One `addBreadcrumb` call in `request<T>()` covers every API call in the app. On the crash,
   the entry's `breadcrumbs` array shows the last 50 events — usually including the request
   whose response shape caused the failure.
2. `expect(redact({ password: 'hunter2', userId: 'u1' })).toEqual({ password: '[redacted]', userId: 'u1' })`,
   plus a case-insensitive key (`Password`, `access_token`) and a long-string truncation case.

### Challenge
1. `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` plus the two `declare const`
   lines in `vite-env.d.ts` — without the declarations, TypeScript errors on an identifier
   that only exists after bundling.
2. ```ts
   document.addEventListener('visibilitychange', () => {
     if (document.visibilityState !== 'hidden') return;
     const pending = drain();
     if (pending.length) navigator.sendBeacon(`${config.apiUrl}/logs`, new Blob([JSON.stringify(pending)], { type: 'application/json' }));
   });
   ```
   `sendBeacon` is the only API guaranteed to complete during tab teardown — `fetch` with
   `keepalive` is the fallback where beacons are unavailable.

---

## 12. Summary

- **`console.log` is for you; a reporter is for your users.** Route both through one
  `logger` module.
- **Context is the product:** release, commit, route, user id, breadcrumbs. A message alone
  is nearly worthless.
- **Breadcrumbs are a bounded ring buffer**, and the HTTP one added in `httpClient.ts`
  gives the best coverage per line of code.
- **Logging must never break the app or block the UI** — fire-and-forget, `keepalive`, and
  an empty `catch` in the reporter itself.
- **Sample noise, never sample crashes.**
- **Never log secrets or personal data**; redact defensively and upload source maps to your
  tracker rather than your CDN.
- **Every entry carries a version**, because "when did this start?" decides whether you fix
  forward or roll back.
- **Alert on rates and deploy deltas**, not on individual errors.

---

**What's next →** [`06-security.md`](./06-security.md): XSS and why `dangerouslySetInnerHTML`
is dangerous, token storage revisited, CSRF, CORS, Content Security Policy, dependency
auditing, and the rule that frontend validation is a UX feature, never a security control.
