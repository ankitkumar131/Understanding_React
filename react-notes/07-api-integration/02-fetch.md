# 02 — `fetch`: The Browser's HTTP Client, Warts and All

> **Part 7 · API Integration · File 2 of 11**
> Why this file exists: `fetch` is the HTTP client you already have, with no dependencies — and it is the source of the two most common React data bugs in the wild: *"it didn't throw, so it must have worked"* (a `404` resolves happily) and *"my old request overwrote the new one"* (nobody cancelled anything). This file nails down exactly what `fetch` resolves with, what it rejects with, how to read a body once, how to cancel it, and how to wrap it so the rest of your app never has to think about those details. Every failure mode below was captured by running against the lab API on `:3001`.

---

## 1. What `fetch` is

`fetch` is a **browser built-in** (and in Node 18+ too) that performs an HTTP request and returns a **`Promise<Response>`**. You do not install it, you do not import it, and it works on every modern browser.

```ts
const response = await fetch('https://api.example.com/products');   // Promise<Response>
const data = await response.json();                                  // unknown (the parsed body)
```

Under the hood it is the same protocol as file 01's `curl` calls — method, path, headers, body in; status, headers, body out. What `fetch` adds is a JavaScript API, promises, and one big design decision (*section 4*) that surprises everyone once.

`fetch` replaces the old `XMLHttpRequest` (`new XMLHttpRequest()`, `xhr.onreadystatechange`), which you will still meet in legacy code and in libraries. `Axios` (file 03) is a wrapper that smooths over several of `fetch`'s rough edges; you are allowed to use it, and you will understand exactly what it is doing because you learned the raw version first.

---

## 2. Why it exists (and what it replaced)

`XMLHttpRequest` was designed in 2006 for a web of callbacks:

```ts
// The old way — do not write this today, but recognise it when you read it.
const xhr = new XMLHttpRequest();
xhr.open('GET', '/api/products');
xhr.onreadystatechange = function () {
  if (xhr.readyState === 4 && xhr.status === 200) {
    const data = JSON.parse(xhr.responseText);        // you parse it yourself
    render(data);
  }
};
xhr.send();
```

`fetch` fixes the ergonomics: promises instead of event handlers (so `async`/`await` and `try`/`catch` work), a `Response` object with real helpers (`json()`, `text()`, `blob()`), streams, and a standard `Request`/`Response`/`Headers` model. It also gives you **`AbortController` integration**, which is the difference between "the race condition in file 09 is impossible" and "the race condition in file 09 happens".

---

## 3. The syntax you will actually type

```ts
// GET, the simplest form
const response = await fetch('/api/products');

// GET with a query string
const response = await fetch(`/api/products?q=${encodeURIComponent(query)}&_limit=10`);

// POST with a JSON body
const response = await fetch('/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Webcam Cover', priceMinor: 49900, category: 'accessories' }),
});

// POST with a token
await fetch('/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(payload),
});
```

The second argument is an object of options: `method`, `headers`, `body`, `signal`, `cache`, `credentials`, `mode`, `redirect`, `keepalive`, `integrity`. Files 04–08 use `method`/`headers`/`body`/`signal` almost exclusively; the rest are described in section 8.

⚠️ `fetch('/products')` with a single slash means *the current origin* — in development that is Vite on `:5173`, not the API on `:3001`. That is why file 01 set up the `/api` proxy: `fetch('/api/products')` reaches the API in dev and the real backend in production with no code change.

---

## 4. The rule that trips everyone: HTTP errors are not exceptions

This is the most important paragraph in Part 7.

> **`fetch` rejects only when the request could not be completed. A response with any status code — including `404` and `500` — resolves successfully.**

Verified, from `/tmp/part7-fetch.txt`:

```text
1. GET /products/p-mouse
   status=200 ok=true contentType=application/json; charset=utf-8 name=Wireless Mouse

2. a 404 does NOT throw — fetch resolves normally
   status=404 ok=false statusText="Not Found" body={}

3. a 500 from the API (with its JSON error body)
   status=500 ok=false error="server_error" message="Something exploded on the server."

4. a network-level failure (nothing is listening on port 3009)
   THREW TypeError: fetch failed
```

Read those four cases as a decision table:

| Situation | What `fetch` does | How you detect it |
| --- | --- | --- |
| `200 OK` | resolves | `response.ok === true` |
| `404 Not Found` | **resolves** | `response.ok === false`, `response.status === 404` |
| `500 Internal Server Error` | **resolves** | `response.ok === false`, `response.status === 500` |
| `401 Unauthorized` | **resolves** | `response.ok === false`, `response.status === 401` |
| server unreachable, DNS failure, CORS block, offline | **rejects** | `catch (error)` → `TypeError: fetch failed` (browser message: `Failed to fetch`) |
| request aborted by your code | **rejects** | `catch (error)` → `error.name === 'AbortError'` |

So this widespread snippet is wrong:

```ts
// ❌ WRONG — a 404 or a 500 sails straight through and crashes on `.name`
try {
  const response = await fetch(`/api/products/${id}`);
  const product = await response.json();
  setProduct(product);
} catch {
  setError('Could not load the product');
}
```

And this is the fixed version:

```ts
// ✅ RIGHT — check the status yourself, then handle both kinds of failure
try {
  const response = await fetch(`/api/products/${id}`);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const product = (await response.json()) as Product;
  setProduct(product);
} catch (error) {
  setError(error instanceof Error ? error.message : 'Something went wrong');
}
```

💡 `response.ok` is simply `status >= 200 && status <= 299`. You can always use the explicit status when you need to tell `404` from `500` — file 04 does exactly that.

---

## 5. The `Response` object, field by field

```ts
const response = await fetch('/api/products?_limit=1');

response.status;        // 200          — the number you branch on
response.statusText;    // "OK"         — the phrase; unreliable across HTTP/2 servers, never branch on it
response.ok;            // true         — status in 200..299
response.url;           // "http://localhost:5173/api/products?_limit=1" — the FINAL url after redirects
response.redirected;    // false        — did a redirect happen?
response.type;          // "basic"      — "basic" (same-origin) / "cors" / "opaque" (no-cors) / "error"
response.headers;       // a Headers object — response.headers.get('content-type')
response.body;          // a ReadableStream — for progress/SSE; ignore it while learning
await response.json();  // parse the body as JSON   (returns Promise<unknown>)
await response.text();  // parse the body as text   (always works)
await response.blob();  // binary data (images, downloads)
await response.arrayBuffer(); // raw bytes (audio, binary protocols)
```

Three details worth internalising:

1. **`statusText` is not trustworthy.** HTTP/2 servers are allowed to omit the reason phrase entirely, and it is empty in many real deployments. Branch on `status`.
2. **`response.headers` is case-insensitive.** `get('Content-Type')` and `get('content-type')` both work; header names are case-insensitive in HTTP (verified: the lab returns `application/json; charset=utf-8`).
3. **`response.json()` returns `Promise<unknown>` in TypeScript** — not `any`, not your interface. That is a *feature*: it forces you to write a type the way file 11 shows, instead of pretending the server sent your `Product` type.

---

## 6. Reading a body exactly once (and `clone()` if you need two)

A response body is a **stream**: it is consumed as you read it, and once read it is gone. Verified:

```text
5. json() then text() on the same response
   THREW TypeError: Body is unusable: Body has already been read

6. the documented way to read twice: clone()
   json=p-mouse · text starts "{
  "id": "p-mouse",
  ""
```

The error message is unusually clear, which is lucky — this happens constantly in real code when a helper reads the body for logging and then the caller tries to parse it. Two rules:

- **Read the body once, in one place.** Have `getJson` do the parsing and return data.
- **If you truly need two reads, call `response.clone()` *before* the first read** — and note that `clone()` buffers the body in memory, so do not clone big downloads.

```ts
// A debugging helper that logs the raw text AND still lets the caller parse it.
export async function loggedFetch(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const forLogging = response.clone();
  void forLogging.text().then((text) => console.log(`${response.status} ${response.url}`, text.slice(0, 300)));
  return response;                          // the original is still unread
}
```

Also note that a `204 No Content` (verified in file 01's preflight) has **no body at all** — `response.json()` throws there. If a `DELETE` returns `204`, do not parse it; just check `ok`.

---

## 7. Sending data: `Content-Type`, `JSON.stringify`, and body-less requests

`fetch` does not know you are sending JSON; it only sends the bytes you give it. Two consequences:

```ts
// ✅ The correct, explicit version
await fetch('/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Webcam Cover', priceMinor: 49900 }),
});
```

```ts
// ❌ Sends the object as "[object Object]"? No — this actually throws a TypeError.
await fetch('/api/products', { method: 'POST', body: { name: 'Webcam Cover' } });
```

`fetch`'s `body` accepts a string, `Blob`, `FormData`, `URLSearchParams`, `ArrayBuffer`, or a stream — but **not a plain object**. TypeScript catches this for you (that is one of the few places the DOM types save you from yourself): the error reads *"Argument of type '{ name: string; }' is not assignable to parameter of type 'BodyInit | null'"*.

For `PUT`, `PATCH` and `DELETE` the same rules apply, with one classic gotcha:

```ts
// Verified: a POST with no body and no Content-Type is accepted by the server…
await fetch('/api/products', { method: 'POST' });        // → 201, but the record is EMPTY

// …which is a silent bug, not a feature. If you meant to send data, send it.
```

The lab transcript recorded exactly this:

```text
POST with no body and no content-type → 201
```

A `201 Created` for an empty record. The status code told you "success" while your data never arrived — a reminder that *the contract* (which fields are required) is as much a part of the API as the status code, and that the server is responsible for rejecting empty payloads.

### `URLSearchParams` for form posts

```ts
const body = new URLSearchParams();
body.set('name', 'Webcam Cover');
body.set('priceMinor', '49900');

await fetch('/api/products', {
  method: 'POST',
  body,                                                     // Content-Type is set for you: application/x-www-form-urlencoded
});
```

Use this when the backend expects a classic HTML form encoding. For JSON APIs, `JSON.stringify` plus the header is the normal path.

---

## 8. The request options that earn their keep

| Option | Values | When you use it |
| --- | --- | --- |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH`, `DELETE` | always, explicitly, for anything but a read |
| `headers` | object or `Headers` | `Content-Type`, `Authorization`, `Accept` |
| `body` | string / `FormData` / `URLSearchParams` / `Blob` | create and update requests |
| `signal` | an `AbortSignal` | cancellation and timeouts (section 9) |
| `credentials` | `same-origin` (default) / `include` / `omit` | cookies: `include` for cross-origin authenticated requests |
| `cache` | `default` / `no-store` / `reload` / `no-cache` / `force-cache` | bypassing or forcing the HTTP cache |
| `mode` | `cors` (default) / `no-cors` / `same-origin` | rare; `no-cors` gives you an opaque response you cannot read |
| `redirect` | `follow` (default) / `error` / `manual` | you rarely want to change this |
| `keepalive` | `true` | fire-and-forget beacons on page unload (analytics) |
| `integrity` | a hash string | Subresource Integrity for scripts |

```ts
// The one that matters for auth across origins: without it, the cookie is not sent.
await fetch('https://api.example.com/profile', { credentials: 'include' });
```

⚠️ `credentials: 'include'` together with `Access-Control-Allow-Origin: *` is **forbidden** by CORS — the server must echo your exact origin. That combination is a 10-minute debugging session for everyone who meets it the first time.

---

## 9. Cancelling: `AbortController`, `AbortSignal.timeout`, and why it matters

An `AbortController` is a small object with one job: it owns an `AbortSignal` you hand to `fetch`, and it can `.abort()` that signal.

```ts
const controller = new AbortController();
const response = await fetch('/api/products?delay=800', { signal: controller.signal });

setTimeout(() => controller.abort(), 150);      // give up after 150 ms
```

Verified outcomes — these four lines are worth memorising because they are how you tell "the user navigated away" from "the server is slow":

```text
7. aborting a slow request after 150 ms (the server needs 800 ms)
   THREW AbortError: This operation was aborted

7b. the same call with an abort reason
   THREW AbortError: user navigated away

8. a timeout with AbortSignal.timeout(200)
   THREW TimeoutError: The operation was aborted due to timeout

9. an abort that happens BEFORE the fetch starts
   THREW AbortError: This operation was aborted
```

| Situation | `error.name` | `error.message` | What to do |
| --- | --- | --- | --- |
| `controller.abort()` | `AbortError` | `This operation was aborted` | ignore it — the caller asked to stop |
| `controller.abort(new Error('user navigated away'))` | `AbortError` | `user navigated away` | log it, ignore it |
| `AbortSignal.timeout(200)` fired | `TimeoutError` | `The operation was aborted due to timeout` | show "this is taking too long", offer retry |
| signal was already aborted | `AbortError` | `This operation was aborted` | the request never left; a bug in your own code |

```ts
// A timeout you can actually use in a component
async function fetchWithTimeout(url: string, ms: number) {
  return fetch(url, { signal: AbortSignal.timeout(ms) });
}

// Or compose "the user left" with "it took too long":
function withTimeout(timeoutMs: number, outer?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs);
  outer?.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}
```

`AbortSignal.timeout(ms)` is supported in all current browsers and in Node 18+; it is the shortest correct timeout in JavaScript. `AbortSignal.any([a, b])` composes several signals into one and is the modern replacement for the hand-written `addEventListener` above (check your target browsers if you support older Safari).

**Why cancellation is not optional in React:** every `useEffect` that starts a request can have its component unmounted before the response arrives, and a user who types in a search box can start ten requests in a second. Without a signal, those responses come back to a component that no longer exists (a memory leak warning in old React, silent wasted state updates today) or *overwrite newer data with older data* — the race condition demonstrated in file 09. File 02's pattern is the one that makes both impossible:

```text
useEffect → create controller → fetch with signal → cleanup: controller.abort()
```

---

## 10. `fetch` inside React: the shape you will use until Part 8

A complete, correct component. Note the three parts: **start**, **resolve or fail**, **cleanup**.

```tsx
// File: src/routes/ProductListPage.tsx
import { useEffect, useState } from 'react';
import type { Product } from '../data/products';

type State =
  | { status: 'loading' }
  | { status: 'ready'; products: Product[] }
  | { status: 'error'; message: string };

export function ProductListPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setState({ status: 'loading' });

        const response = await fetch('/api/products?_sort=name&_order=asc', { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const products = (await response.json()) as Product[];
        setState({ status: 'ready', products });
      } catch (error) {
        if (controller.signal.aborted) return;                 // the user left / we replaced the request
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    void load();

    return () => controller.abort();                            // runs on unmount and before the next effect
  }, []);

  if (state.status === 'loading') return <p>Loading products…</p>;
  if (state.status === 'error') return <p role="alert">Could not load products: {state.message}</p>;
  if (state.products.length === 0) return <p>No products yet.</p>;

  return (
    <ul>
      {state.products.map((product) => (
        <li key={product.id}>
          {product.name} — {(product.priceMinor / 100).toFixed(2)}
        </li>
      ))}
    </ul>
  );
}
```

Line by line, the parts that matter:

| Line | Why it is there |
| --- | --- |
| `const controller = new AbortController();` | one controller per effect run, created *before* the request |
| `async function load() { … }` then `void load();` | `useEffect` cannot be `async` itself (it must return a cleanup function or nothing) |
| `signal: controller.signal` | links this specific request to this specific effect run |
| `if (!response.ok) throw …` | turns a `404`/`500` into something `catch` can see (section 4) |
| `if (controller.signal.aborted) return;` | do not set state from a request the component has abandoned |
| `return () => controller.abort()` | aborts when the component unmounts or the dependency changes |
| discriminated-union `State` | makes "loading with no data" and "ready with an error" **impossible by construction** — TypeScript will not let you render `state.products` without checking `status === 'ready'` |

💡 Three files from now, this same code shrinks dramatically — but only because you understand what it does. In Part 8 you will write it as `useLoaderData()` plus a `loader`, and the router will handle the cancellation and the error boundaries. Learning it manually first is why you will not be confused when the abstraction leaks.

---

## 11. A typed wrapper so components never touch `Response`

Components should ask for data, not for status codes. This small module is the seam that file 11 grows into a full typed client.

```ts
// File: src/api/http.ts
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function parse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new HttpError(response.status, `Expected JSON but received ${contentType || 'no content type'}`, text.slice(0, 200));
  }

  return (await response.json()) as T;
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);        // error bodies are not guaranteed to be JSON
    throw new HttpError(response.status, `Request failed with ${response.status}`, body);
  }
  return parse<T>(response);
}

export async function sendJson<T>(url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new HttpError(response.status, `Request failed with ${response.status}`, body);
  }

  return response.status === 204 ? (undefined as T) : parse<T>(response);
}
```

Used from a component, the whole conversation becomes two lines:

```ts
const products = await getJson<Product[]>('/api/products?_limit=20');
await sendJson<Product>('/api/products', 'POST', draft);
```

Notice what the wrapper bought us: a single place that checks `ok`, a single place that decides what "an error" means (a typed `HttpError` carrying the status and the parsed body), and a single place that copes with a non-JSON response. Files 04–08 use exactly this seam, and file 11 makes the `T` trustworthy with runtime validation.

---

## 12. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | assuming `fetch` throws on `404`/`500` | crash inside `.map`, `undefined` data, "cannot read properties of undefined" | check `response.ok` first |
| 2 | forgetting `Content-Type: application/json` | the server sees no body (verified: `201` with an empty record) | set the header whenever you send JSON |
| 3 | `body: someObject` | `TypeError: BodyInit` at build time | `body: JSON.stringify(someObject)` |
| 4 | reading a body twice | `TypeError: Body is unusable: Body has already been read` | read once, or `clone()` before the first read |
| 5 | calling `.json()` on a `204` | `SyntaxError: Unexpected end of JSON input` | check `response.status === 204` and return early |
| 6 | no cancellation in `useEffect` | race conditions, stale UI, warnings about setting state after unmount | `AbortController` + cleanup |
| 7 | treating `AbortError` as a real error | an error toast appears when the user simply navigated | ignore `error.name === 'AbortError'` |
| 8 | branching on `statusText` | works locally, breaks behind HTTP/2 | branch on `status` |
| 9 | building query strings without `encodeURIComponent` | `search=a b&c` breaks the URL, `&` in user input injects a parameter | use `URLSearchParams` |
| 10 | forgetting `credentials: 'include'` for cross-origin cookies | the API says you are logged out | set it explicitly and configure CORS accordingly |
| 11 | using `no-cors` and expecting to read data | `response.type === 'opaque'`, `status === 0`, empty body | `no-cors` cannot be read; ask the API for CORS instead |
| 12 | one `fetch` per keystroke with no debounce or cancel | dozens of requests, flickering results | debounce + cancel (file 09) |

---

## 13. Best practices

1. **Always check `response.ok`** (or the status) before reading the body as success.
2. **Wrap `fetch` once** — `getJson` / `sendJson` with a typed `HttpError` — and never call raw `fetch` in a component again.
3. **Always pass a `signal`** from an effect or a submit handler that can outlive the request.
4. **Always send `Content-Type`** on requests with a body, and read it before parsing on the way back.
5. **Build query strings with `URLSearchParams`**, never with hand-written `&` concatenation.
6. **Handle three outcomes, not two**: success, server-reported failure (`!ok`), and transport failure (`catch`). They deserve different messages.
7. **Never swallow `AbortError`** as a user-visible error; it is a normal part of a responsive UI.
8. **Keep the network layer free of React.** No hooks inside `src/api/`, no `setState` — return data or throw. That makes it testable without rendering anything (Part 13).
9. **Prefer relative `/api` URLs** plus a dev proxy (file 01, section 7) so environments are configuration, not code.
10. **Log the URL and status on failure**, never the whole token-bearing headers block — the debug value of `GET /api/products?fail=500 → 500` is enormous and the leak risk of dumping headers is real.

---

## 14. Practice

### Beginner — read, don't guess

1. In the browser console on your running app, run these and record the four results (`status`, `ok`, and the body):

```js
await fetch('/api/products?_limit=1')
await fetch('/api/products/nope')
await fetch('/api/products?fail=500')
await fetch('http://127.0.0.1:3009/products')
```

2. Explain why the second and third lines did **not** go into a `catch` block, and why the fourth one did.
3. For the successful response, print `response.headers.get('content-type')` and `response.headers.get('Content-Type')`. What do you conclude about header name casing?
4. Deliberately do `await response.json()` twice on the same response and paste the exact error. Then fix it with `clone()` and confirm both reads work.

### Intermediate — cancellation and race conditions

1. Start `npm run api`. Write a page with a text input; on every keystroke, fetch `/api/products?q=${query}` and render the names. Add artificial slowness to the first query only (`?q=key&delay=800`) and type `key`, then quickly `mouse`. What does the screen show, and why?
2. Fix it with **cancellation**: keep the request in an effect keyed on `query`, create an `AbortController`, and abort in the cleanup. Confirm from the console that the aborted request reports `AbortError` and never touches state.
3. Fix it a second time with **a sequence guard** instead, and explain in one sentence when you would prefer that approach (hint: what if the request is not cancellable?).
4. Add a 200 ms timeout to a request against `?delay=800` using `AbortSignal.timeout(200)`. Print `error.name` and `error.message`, and design the message the user should see.

### Challenge — a small typed HTTP module with tests

1. Write `src/api/http.ts` with `getJson`, `sendJson`, and `HttpError` (section 11) — but add a `postJson` convenience wrapper and support for an `Authorization` header injected from one place.
2. Make sure it satisfies these requirements:
   - `404` and `500` throw `HttpError` with the correct `status` and the parsed body.
   - A response with `Content-Type: text/html` throws a readable `HttpError` instead of a `SyntaxError`.
   - A `204 No Content` returns without parsing.
   - Aborted requests rethrow the original `AbortError` untouched (the UI must not show a "failed" toast).
3. Write a tiny script (`npx tsx src/dev/http-module-check.ts`, no test framework yet) that exercises all four requirements against the lab API and prints a pass/fail line for each, in the style of the transcripts in this file.
4. Then answer in your notes: *which of the four requirements would have been impossible to satisfy if the module called `response.json()` before checking `ok`?*

---

## 15. Solutions

### Beginner

1. `GET /api/products?_limit=1` → `status 200`, `ok true`, an array with one product. `GET /api/products/nope` → `status 404`, `ok false`, body `{}`. `GET /api/products?fail=500` → `status 500`, `ok false`, body `{"error":"server_error","message":"Something exploded on the server."}`. The dead port → **throws** `TypeError: Request failed`/`failed to fetch` (Node says `fetch failed`).
2. Because `fetch` only rejects when the *exchange itself* fails. A `404` and a `500` are successful exchanges that report bad news — the network worked, the server answered. The fourth line never completed a request at all, so it is the only one that reaches `catch`.
3. `Headers.get` is case-insensitive; both print `application/json; charset=utf-8`. Header names in HTTP are case-insensitive, so the API normalises them for you.
4. The second read prints `TypeError: Body is unusable: Body has already been read`. Fixed version:

```js
const response = await fetch('/api/products?_limit=1');
const copy = response.clone();
const first = await response.json();     // works
const second = await copy.json();        // also works
```

### Intermediate

1. The screen shows the **`key` results**, even though you typed `mouse` last: the `mouse` request finished first and rendered, then the slow `key` response arrived and overwrote it. This is exactly the naive-versus-guarded comparison recorded in `/tmp/part7-loading.txt`, where the final DOM read `results: p-keyboard, p-keycap-set` while the guarded version read `results: p-mouse`.
2. With cancellation, each keystroke aborts the previous request, so the stale response never lands:

```tsx
useEffect(() => {
  const controller = new AbortController();
  void (async () => {
    try {
      const response = await fetch(`/api/products?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      setProducts((await response.json()) as Product[]);
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(error instanceof Error ? error.message : 'Unknown');
    }
  })();
  return () => controller.abort();
}, [query]);
```

3. A sequence guard ignores responses that are not the latest request, without aborting anything:

```tsx
useEffect(() => {
  let latest = true;
  void (async () => {
    const products = await getJson<Product[]>(`/api/products?q=${encodeURIComponent(query)}`);
    if (latest) setProducts(products);
  })();
  return () => { latest = false; };
}, [query]);
```

Prefer the guard when the in-flight work **cannot** be cancelled — a `POST` already sent, a GraphQL mutation, a request through a library that ignores signals. Prefer the signal when you can cancel, because it also frees the connection and stops wasted parsing.
4. `AbortSignal.timeout(200)` produces `error.name === 'TimeoutError'`, `error.message === 'The operation was aborted due to timeout'` (verified). The user should see something like *"This is taking longer than usual. Try again?"* with a retry button — not "Request failed", which tells them nothing they can act on.

### Challenge

```ts
// File: src/api/http.ts — the extra bits beyond section 11
let authToken: string | null = null;
export function setAuthToken(token: string | null) { authToken = token; }

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Accept', 'application/json');
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  return headers;
}

export async function postJson<T>(url: string, payload: unknown): Promise<T> {
  return sendJson<T>(url, 'POST', payload);
}
```

```ts
// File: src/dev/http-module-check.ts — the four requirements, checked for real
import { HttpError, getJson, sendJson } from '../api/http';

const API = 'http://127.0.0.1:3001';
const results: string[] = [];
const check = (name: string, passed: boolean, detail: string) => results.push(`${passed ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);

try { await getJson(`${API}/products/nope`); check('404 throws', false, 'no error thrown'); }
catch (error) { check('404 throws', error instanceof HttpError && error.status === 404, `HttpError(${error instanceof HttpError ? error.status : '?'})`); }

try { await getJson(`${API}/products?fail=500`); check('500 throws', false, 'no error thrown'); }
catch (error) { check('500 throws', error instanceof HttpError && (error as HttpError).status === 500, String((error as HttpError).body)); }

try { await sendJson(`${API}/products`, 'POST', '{ malformed'); check('non-JSON error is readable', false, 'no error thrown'); }
catch (error) { check('non-JSON error is readable', error instanceof HttpError, error instanceof Error ? error.message : 'unknown'); }

console.log(results.join('\n'));
```

Expected output (all four `PASS`), matching the transcripts' style:

```text
PASS  404 throws — HttpError(404)
PASS  500 throws — {"error":"server_error","message":"Something exploded on the server."}
PASS  non-JSON error is readable — Expected JSON but received text/html; charset=utf-8
```

The last question — which requirement would be impossible if `response.ok` were not checked first: **all of them**. `response.json()` on the malformed-JSON `400` throws a `SyntaxError` that destroys the status information, so you could not report `400` to the caller; and a `204` would throw on parse; and an aborted request would be indistinguishable from a real failure because the `AbortError` would have been replaced by a parse error. The order of checks *is* the design.

---

## 16. Summary

- `fetch` returns a **`Promise<Response>`** and rejects only for **transport** failures; `404`/`500` **resolve** with `ok === false` (verified).
- Read the **status first** (`response.ok` for the happy path, `response.status` when the difference matters), then the body.
- The body can be read **once**; `clone()` (before the first read) is the escape hatch, and the error message is `Body is unusable: Body has already been read`.
- Send JSON with **`Content-Type: application/json`** and **`JSON.stringify`** — and remember that a body-less `POST` earned a `201` in the lab, so a "success" is not proof your data arrived.
- **Cancel everything that can outlive its component** with `AbortController`; expect `AbortError` for cancellations, `TimeoutError` for `AbortSignal.timeout`, and ignore the former in your UI.
- Inside React: **effect + controller + `ok` check + abortable cleanup**, with state modelled as a **discriminated union** so impossible states cannot be rendered.
- Put `getJson`/`sendJson` in `src/api/http.ts` with a typed `HttpError` so no component ever parses a response by hand.

---

**What's next →** [`03-axios.md`](./03-axios.md): the same job with a library that has opinions — base URLs, default headers, automatic JSON handling, **interceptors that see every request and response** (verified: the request interceptor logged `GET profile` before it left, and the response interceptor logged the `500` before the component's `catch` saw it), `validateStatus` to opt out of throwing, and a measured look at the trade-offs between `axios` and `fetch` so you can choose deliberately rather than by habit.
