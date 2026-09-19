# 01 — HTTP Basics: Requests, Responses, and What the Network Tab Is Telling You

> **Part 7 · API Integration · File 1 of 11**
> Why this file exists: every React app eventually talks to a server, and almost every "the API is broken" bug is really a misunderstanding about HTTP — a wrong method, a status code nobody checked, a missing `Content-Type`, or a CORS rule the browser enforced silently. This file builds the mental model (and a real local API) before any React code appears. Every header, status code, and timing below was captured from a running server with `curl`.

---

## 1. What HTTP actually is

HTTP is a **text protocol for one exchange at a time**: the client sends a *request*, the server sends back exactly one *response*. Then the conversation is over — the next request has no memory of the previous one.

```text
client                                    server
  │  GET /products/p-mouse HTTP/1.1          │
  │  Host: 127.0.0.1:3001                    │
  │  Accept: application/json                │
  │ ───────────────────────────────────────► │
  │                                          │  (finds the resource)
  │  HTTP/1.1 200 OK                         │
  │  Content-Type: application/json          │
  │  {"id":"p-mouse","name":"Wireless Mouse"}│
  │ ◄─────────────────────────────────────── │
```

That statelessness is why authentication travels on **every** request (a cookie or an `Authorization` header) rather than being "remembered" by the protocol, and why "who is the user?" is a server-side question (Part 6, file 07).

Two versions you will see: **HTTP/1.1** (one or a few requests per connection, headers as text) and **HTTP/2** (many requests multiplexed on one connection, binary framing). You do not write either by hand — `fetch` and the browser do — but the request/response shape is identical.

---

## 2. The anatomy of a request

```http
POST /products HTTP/1.1
Host: 127.0.0.1:3001
Content-Type: application/json
Accept: application/json
Authorization: Bearer token-123
Content-Length: 118

{ "name": "Scratch Webcam Cover", "priceMinor": 49900, "category": "accessories" }
```

| Part | In this example | Notes |
| --- | --- | --- |
| **method** | `POST` | *what* you want done (section 4) |
| **path** | `/products` | *what* you are acting on; `/products/p-mouse` names one item |
| **query string** | (none here: `?category=audio&_limit=2`) | filters, sorting, pagination — data, not identity |
| **request headers** | `Content-Type`, `Accept`, `Authorization` | metadata about the message |
| **body** | the JSON | only some methods send one |

## 3. The anatomy of a response

```http
HTTP/1.1 201 Created
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 137
ETag: W/"89-..."

{ "name": "Scratch Webcam Cover", "priceMinor": 49900, ..., "id": "TV3WWSe" }
```

| Part | Example | Meaning |
| --- | --- | --- |
| **status line** | `201 Created` | what happened, as a number plus a phrase |
| **response headers** | `Content-Type: application/json; charset=utf-8` | how to interpret the body |
| **body** | the created record, **including its new id** | the result |

💡 **`Content-Type` is not decoration.** It tells `response.json()` (and you) how to read the bytes. A server that answers with `text/html` — even for an error — will make `response.json()` throw (section 9 shows a real case).

---

## 4. Methods, and the two properties that matter

| Method | Used for | Sends a body | Safe (changes nothing) | Idempotent (repeat = same result) |
| --- | --- | --- | --- | --- |
| `GET` | read one item or a list | no | ✅ | ✅ |
| `HEAD` | read headers only (existence, length) | no | ✅ | ✅ |
| `OPTIONS` | ask what is allowed (CORS preflight) | no | ✅ | ✅ |
| `POST` | create something, or trigger an action | ✅ | ❌ | ❌ (twice = two records) |
| `PUT` | replace a whole resource | ✅ | ❌ | ✅ |
| `PATCH` | change part of a resource | ✅ | ❌ | ✅ (usually) |
| `DELETE` | remove a resource | sometimes | ❌ | ✅ (deleting again is a 404, but the state is the same) |

**Why idempotency matters in a UI:** a request that times out may still have succeeded on the server. Retrying a `GET`/`PUT`/`DELETE` is safe; retrying a `POST` blindly can create a duplicate order. That single fact drives the retry policy in file 10 and the "disable the button while submitting" rule in file 05.

⚠️ **"Idempotent" does not mean "no side effects"** — it means *performing it twice leaves the server in the same state as performing it once*. `DELETE /products/p-mouse` twice returns `200` then `404`, and the database ends up equally empty in both cases.

---

## 5. Status codes: the five families

| Family | Meaning | Examples you will meet |
| --- | --- | --- |
| **1xx** | informational | `100 Continue` (rare in app code) |
| **2xx** | success | `200 OK`, `201 Created`, `204 No Content` |
| **3xx** | redirection | `301 Moved Permanently`, `304 Not Modified`, `307 Temporary Redirect` |
| **4xx** | **the client did something wrong** | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`, `429 Too Many Requests` |
| **5xx** | **the server failed** | `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout` |

The distinction is not academic — it decides what your UI should do:

| Status | Who is at fault | What the UI should do |
| --- | --- | --- |
| `400` / `422` | the user's input | show field errors next to the inputs; do not retry |
| `401` | not signed in / expired | send them to sign in, remembering where they were (Part 6, file 07) |
| `403` | signed in, not allowed | "you do not have access"; do not retry |
| `404` | the resource is gone | "not found" state on the same page; do not retry |
| `409` | conflict (duplicate, stale version) | explain and offer a refresh or a merge |
| `429` | too many requests | back off, respect `Retry-After`, disable the button briefly |
| `5xx` | the server | "something broke on our side, retrying…", retry with backoff (file 10) |

Verified in the lab, with the exact status lines:

```text
GET /products/p-mouse   → 200
GET /products/nope      → 404   (body: {})
POST /products          → 201   (body includes "id": "TV3WWSe")
PUT /products/nope      → 404   (body: {})
DELETE /products/TV3WWSe → 200  body={}
DELETE /products/TV3WWSe → 404  (the record is gone)
GET /products?fail=500  → 500   body: {"error":"server_error","message":"Something exploded on the server."}
GET /profile            → 401   body: {"error":"unauthorized","message":"Missing or invalid token"}
OPTIONS /products       → 204   (a CORS preflight; see section 8)
```

Notice `GET /products/nope` returning `404` with a body of `{}` — **an empty object, not nothing**. The response *is* valid JSON; it just does not contain the thing you asked for. Checking `response.ok` (file 02) is how you notice.

---

## 6. Headers worth recognising

| Header | Direction | What it does |
| --- | --- | --- |
| `Content-Type` | both | the media type of the body (`application/json; charset=utf-8`) |
| `Accept` | request | what the client can handle (`application/json`) |
| `Authorization` | request | credentials (`Bearer <token>`); the header that makes a request "authenticated" |
| `Cookie` / `Set-Cookie` | both | session handling the browser does automatically |
| `Cache-Control`, `ETag`, `Last-Modified` | response | caching rules and validators |
| `X-Total-Count` | response | a **custom** header: total rows for pagination (verified below) |
| `Access-Control-Allow-*` | response | CORS permissions (section 8) |

Custom headers are just headers with an `X-` habit. Verified from the lab's paginated list:

```text
$ curl -D - -o /dev/null "http://127.0.0.1:3001/products?_page=1&_limit=2"
HTTP/1.1 200 OK
X-Total-Count: 6
Access-Control-Expose-Headers: X-Total-Count, Link
```

That is the classic "one page of items, plus how many exist" combination. `Access-Control-Expose-Headers` is required for JavaScript to *read* a custom header on a cross-origin request — otherwise it is present in the response but `response.headers.get('X-Total-Count')` returns `null`.

---

## 7. The lab API for this part

The examples in Part 7 run against a **real HTTP server on `localhost:3001`**. It is deliberately boring: `json-server` over a JSON file, plus a small middleware for the failure modes you need to practise.

```text
shop-admin/
├── package.json
├── vite.config.ts            ← dev proxy: /api → http://127.0.0.1:3001
└── server/
    ├── db.json               ← products, orders, users
    └── middlewares.cjs       ← ?fail=…, ?delay=…, and a token-protected /profile
```

```json
// File: server/db.json (excerpt)
{
  "products": [
    { "id": "p-keyboard", "name": "Mechanical Keyboard", "priceMinor": 499900, "category": "keyboards", "blurb": "Quiet switches, PBT caps.", "inStock": true },
    { "id": "p-mouse", "name": "Wireless Mouse", "priceMinor": 249900, "category": "accessories", "blurb": "Silent clicks, 70-day battery.", "inStock": true }
  ],
  "orders": [
    { "id": "ORD-1001", "customer": "Grace Hopper", "status": "packed", "totalMinor": 749800 }
  ],
  "users": [
    { "id": 1, "email": "admin@megashop.test", "role": "admin" }
  ]
}
```

```js
// File: server/middlewares.cjs — the four extras that make teaching possible.
const attempts = new Map();

module.exports = (req, res, next) => {
  const { path, method, query } = req;
  console.log(`${method} ${path}`);

  // 1. /profile needs a token, so you can practise 401 handling.
  if (req.path === '/profile') {
    if (req.get('authorization') !== 'Bearer token-123') {
      res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid token' });
      return;
    }
    res.json({ id: 1, email: 'admin@megashop.test', signedInAt: new Date().toISOString() });
    return;
  }

  // 2. ?fail=500 and ?fail=404 — a JSON error body, the way a real API sends one.
  if (query.fail === '500') {
    res.status(500).json({ error: 'server_error', message: 'Something exploded on the server.' });
    return;
  }
  if (query.fail === '404') {
    res.status(404).json({ error: 'not_found', message: 'That resource does not exist.' });
    return;
  }
  // 2b. ?fail=422 — the shape a real API uses for field-level validation errors (file 05).
  if (query.fail === '422') {
    res.status(422).json({
      error: 'validation_failed',
      message: 'The product could not be saved.',
      errors: { name: 'Name must be at least 3 characters.', priceMinor: 'Price must be a positive number.' },
    });
    return;
  }

  // 3. ?fail=first2 — fail the first N attempts at this exact URL, then succeed (for retries).
  if (typeof query.fail === 'string' && query.fail.startsWith('first')) {
    const limit = Number(query.fail.slice('first'.length)) || 1;
    const key = `${method} ${req.url}`;
    const seen = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, seen);
    if (seen <= limit) {
      res.status(503).json({ error: 'temporarily_unavailable', attempt: seen, message: `Attempt ${seen} of ${limit} fails.` });
      return;
    }
  }

  // 4. ?delay=800 — latency, for loading states and cancellation.
  const delay = Number(query.delay);
  if (Number.isFinite(delay) && delay > 0) {
    setTimeout(next, Math.min(delay, 5000));
    return;
  }

  next();
};
```

```json
// package.json — the scripts that make this runnable
{
  "scripts": {
    "api": "json-server --watch server/db.json --host 0.0.0.0 --port 3001 --middlewares server/middlewares.cjs",
    "dev": "vite",
    "build": "tsc -b && vite build"
  }
}
```

```text
npm install -D json-server
npm run api
```

```text
  \{^_^}/ hi!

  Loading server/db.json
  Loading server/middlewares.cjs
  Done

  Resources
  http://0.0.0.0:3001/products
  http://0.0.0.0:3001/orders
  http://0.0.0.0:3001/users
```

⚠️ **Three gotchas worth knowing before you hit them.**

1. `npm install json-server` today installs a `1.0.0-beta` release whose CLI changed; pin the stable `npm install -D json-server@0.17.4` if you follow this part exactly.
2. The middleware file must be named `.cjs` in a Vite project, because `"type": "module"` in `package.json` makes every `.js` file an ES module — the server then fails with *"ReferenceError: module is not defined in ES module scope"*.
3. Bind explicitly with `--host 0.0.0.0`. Without it the server printed `http://localhost:3001` and listened on `::1` and the LAN address but **not** on `127.0.0.1`, so every `curl http://127.0.0.1:3001/...` returned `000` (no connection) while `localhost` worked. Verified after the fix: `127.0.0.1 → 200 · localhost → 200 · [::1] → 200`. If a server "works in the browser but not in curl", this IPv6-versus-IPv4 loopback mix-up is the first thing to check.

### Why a proxy instead of a full URL

```ts
// File: vite.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    // Anything the app asks for at /api/... is forwarded to the local API.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
```

Now your code always fetches **relative** URLs — `fetch('/api/products')` — and there is no CORS involved in development, no `http://localhost:3001` hard-coded in components, and production can point `/api` at the real backend with one server rule. (Section 8 explains what it saves you from.)

---

## 8. CORS in one page (and why it is not your bug)

Browsers enforce the **same-origin policy**: JavaScript running on `https://shop.example.com` may not read responses from `https://api.example.com` unless that server *explicitly allows it* with response headers. This protection lives in the **browser** — `curl` and your server-side code are not affected, which is exactly why "it works in Postman" is not evidence.

For a **simple** request (a `GET` with no custom headers), the browser sends it and then checks the response:

```text
$ curl -D - -o /dev/null "http://127.0.0.1:3001/products" -H 'Origin: http://localhost:5173'
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

For anything else — a `POST` with `Content-Type: application/json`, or a custom header like `Authorization` — the browser sends a **preflight** `OPTIONS` request first and waits for permission:

```text
$ curl -D - -o /dev/null -X OPTIONS "http://127.0.0.1:3001/products" \
    -H 'Origin: http://localhost:5173' \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type'
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: content-type
Access-Control-Allow-Credentials: true
```

Read those two blocks as the checklist a server must satisfy:

1. **`Access-Control-Allow-Origin`** must be the caller's origin (or `*` — but not with credentials).
2. **`Access-Control-Allow-Methods`** must include the method you used.
3. **`Access-Control-Allow-Headers`** must include every non-simple header you sent (`content-type`, `authorization`, …).

What the failure looks like from React: `fetch` rejects with `TypeError: Failed to fetch` and the Network tab shows the request as **CORS error** (often with a `200` in the server's own logs, because the server *did* answer — the browser refused to hand the response to your code). Two things it is **not**: it is not a 401, and it is not your React code.

| Fix in development | Fix in production |
| --- | --- |
| use a dev proxy (`/api` → API) | configure CORS on the API for your real origin |
| ask the backend team to allow your origin | same, with an allow-list — never blanket `*` with credentials |
| run the API on the same origin | serve the API behind the same domain (reverse proxy) |

⚠️ **CORS is not security for your API.** It stops *other websites' JavaScript* from reading responses; it does not stop anyone from calling your API with `curl`. Authorisation is still the server's job (Part 14).

---

## 9. Not every error is JSON

Verified: send malformed JSON to the lab API and the server's body parser answers *before* your code sees anything:

```text
POST with malformed JSON → 400 · content-type=text/html; charset=utf-8
   body starts: <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8…
```

And a URL that does not exist at all:

```text
$ curl -D - -o /dev/null "http://127.0.0.1:3001/nothing-here"
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8
```

So the rule for your client code: **check `Content-Type` (or just try/catch the parse) before assuming JSON.** A proxy, a load balancer, or a misconfigured backend can answer with HTML, and a bare `await response.json()` will then throw a `SyntaxError` that hides the real status code. File 02 wraps this in one helper.

---

## 10. Testing HTTP without a frontend: `curl`

`curl` is the fastest way to answer "is it the API or my code?" — and it is the tool reviewers use to check your bug report.

```text
# show status, headers and body
curl -i "http://127.0.0.1:3001/products/p-mouse"

# status code only, in a script
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3001/products"

# a POST with a JSON body
curl -X POST "http://127.0.0.1:3001/products" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Webcam Cover","priceMinor":49900,"category":"accessories"}'

# with an auth header
curl -s "http://127.0.0.1:3001/profile" -H 'Authorization: Bearer token-123'

# timing a slow endpoint
curl -s -o /dev/null -w '%{time_total}s\n' "http://127.0.0.1:3001/products?delay=800"
```

Real output from the lab, including the timing pair:

```text
=== 10. simulated latency ===
no delay:   0.004197s
?delay=800: 0.805669s
```

That 0.8 s is what makes the loading states, the race condition, and the cancellation demos in files 02, 09 and 10 reproducible instead of theoretical.

---

## 11. Reading the Network tab like a professional

Open DevTools → **Network** → reload → click a request. The five tabs answer five different questions:

| Tab | Look for |
| --- | --- |
| **Headers** | the **status code**, the **method**, the request URL, `Content-Type`, `Authorization`, and the `Access-Control-*` headers (the CORS story) |
| **Payload** | the request body and the query-string parameters (did your params actually get sent?) |
| **Preview** | the parsed JSON, collapsible — the fastest way to see the shape of a response |
| **Response** | the raw bytes as they arrived (use this when the JSON parse fails) |
| **Timing** | where the time went: queueing, DNS, TLS, **waiting (TTFB)**, content download |

Three habits worth building:

1. **Filter by `Fetch/XHR`** and check "Preserve log" — otherwise a navigation wipes the evidence.
2. **Right-click → Copy → Copy as cURL** to reproduce exactly what the browser sent, then paste into a terminal (great for bug reports).
3. **Look at the status column, not just the body.** A `200` with an empty array, a `304` from cache, and a `204` with no body are three different conversations.

---

## 12. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | using `POST` to read data | nothing caches it; retries create records | `GET` reads, `POST` creates |
| 2 | retrying a `POST` after a timeout | duplicate records | retry only idempotent requests (file 10) |
| 3 | assuming every error body is JSON | `SyntaxError: Unexpected token '<'` | check `Content-Type`, try/catch the parse |
| 4 | not sending `Content-Type: application/json` | the server may see an empty body (verified: `201` with an empty record) | always set it when sending JSON |
| 5 | treating 401 and 403 as the same | users get "not allowed" when they only need to sign in | 401 → sign in; 403 → explain permissions |
| 6 | retrying 4xx | pointless traffic, sometimes rate-limit penalties | retry 5xx/network only |
| 7 | debugging CORS in React code | hours lost on a server header | read the `Access-Control-*` headers, or use a dev proxy |
| 8 | hard-coding `http://localhost:3001` in components | breaks in every other environment | relative `/api` + a proxy (section 7) |
| 9 | ignoring custom headers like `X-Total-Count` | pagination shows "1 of 1" forever | read the header (and expose it via CORS) |
| 10 | trusting the status line only | `200` bodies with `{ "error": … }` slip through | validate the payload shape too (file 11) |
| 11 | testing with Postman/curl only | CORS and cookies behave differently in the browser | verify in the Network tab as well |
| 12 | leaving `Authorization` tokens in the URL | they leak into logs, history, and referrers | send them as headers |

---

## 13. Best practices

1. **Let the method describe the intent**: read with `GET`, create with `POST`, replace with `PUT`, adjust with `PATCH`, remove with `DELETE`.
2. **Design your client around the status families**, not individual codes; unknown codes fall back to "something went wrong, here is the status".
3. **Always send and check `Content-Type`** — on requests you build and on responses you read.
4. **Use a dev proxy** so application code only ever knows relative URLs.
5. **Learn `curl` early.** It isolates the API from React in one command.
6. **Read the Network tab before reading your code** when a request misbehaves: status, URL, payload, CORS headers.
7. **Make failures reproducible** — the lab's `?fail=500` and `?delay=800` markers exist so you can test the sad paths without waiting for a real outage.
8. **Never put secrets in URLs.** Headers or cookies only.
9. **Respect `Retry-After`, `Cache-Control`, and `ETag`** when a server sends them; they encode the server's own advice.
10. **Write down the API contract** (paths, methods, request/response shapes, error bodies) in your repo README — the moment two people build against it, ambiguity becomes bugs.

---

## 14. Practice

### Beginner — read the conversation

1. Start the lab API (`npm run api`) and run these four commands. For each, write the status code, the `Content-Type`, and one sentence describing the body:

```text
curl -i "http://127.0.0.1:3001/products"
curl -i "http://127.0.0.1:3001/products/p-mouse"
curl -i "http://127.0.0.1:3001/products/nope"
curl -i "http://127.0.0.1:3001/profile"
```

2. Then explain, in your own words, why the third command is *not* a crash and the fourth one is not a "server bug".
3. Use `-w '%{http_code}\n'` to print just the status codes, and `-D -` to print only the headers. What is the difference between `-i`, `-I`, and `-D -`?
4. Time the four commands with `-w '%{time_total}s'`. Then add `?delay=800` to one URL and time it again.

### Intermediate — methods and idempotency in practice

1. Create a product with `POST`, then immediately send the **same** `POST` again. Compare the two ids and the two `201` responses. Explain why this is the reason a "Create order" button must disable itself while submitting (file 05 previews the UI).
2. Take the id from step 1 and send `PUT` with only `{ "name": "…", "priceMinor": 1 }`. Then `GET` the record: which fields survived? Now do the same with `PATCH`. Write one sentence describing the difference.
3. `DELETE` the record twice. Record both status codes. Explain why the second is a `404` and yet the operation is still called *idempotent*.
4. Using `OPTIONS`, ask the API which methods it allows for `/products` (send the CORS preflight headers from section 8). Which methods are listed, and what would happen to a `PATCH` request if the list were missing it?

### Challenge — a failure-notes document

Write a short `API-NOTES.md` in your project that a teammate could act on, containing:

1. A table of every endpoint you used: method, path, query parameters, success status, and the error statuses it can return.
2. For each error: what the user should see, and what the code should do (from section 5's table).
3. The three requests you sent with `curl` that prove the sad paths work (`?fail=500`, `?fail=404`, a 401 from `/profile`), with their real output.
4. A paragraph answering: *"If the browser shows a CORS error but curl works, what is the first thing you check, and why is the API not necessarily broken?"*
5. One entry recording the lab's two setup gotchas — the `json-server` beta CLI and the `.cjs` middleware extension — and what the error messages look like when you get them wrong.

---

## 15. Solutions

### Beginner

1. `GET /products` → `200`, `application/json; charset=utf-8`, an array of six products. `GET /products/p-mouse` → `200`, same content type, **one object** (not an array). `GET /products/nope` → `404`, `application/json; charset=utf-8`, body `{}`. `GET /profile` without a token → `401`, JSON body `{"error":"unauthorized","message":"Missing or invalid token"}`.
2. The `404` is a *successful exchange* that reports "no such resource" — the request was fine, the resource is absent, and the client is expected to handle it as a normal state (file 04's "not found" screen). The `401` is the server doing its job: the endpoint is protected by design, and the correct client response is to sign in, not to file a bug.
3. `-i` includes the response headers *and* the body; `-I` sends a `HEAD` request and prints headers only; `-D -` dumps headers to stdout while the body still goes to its normal place (or to `-o /dev/null`). Use `-i` while exploring, `-o /dev/null -w` in scripts, and `-D -` when you want headers without polluting the body output (as in section 6's examples).
4. The three fast requests are a few milliseconds; the `?delay=800` one is about `0.8s` — verified: `0.004197s` versus `0.805669s`.

### Intermediate

1. Two `POST`s produce **two different ids** and two records (`TV3WWSe`, `XajLHoN` in the lab run). That is why `POST` is not idempotent: a double-click, an impatient retry, or a flaky network can create duplicate orders. The UI answers this by disabling the submit button while the request is in flight, and by making the server idempotent when it matters (an idempotency key).
2. `PUT` with only two fields **replaced the whole record**: `blurb` disappeared (verified — the keys afterwards were exactly the ones sent). `PATCH` changed only the fields sent and left `name` and `priceMinor` intact (verified). The sentence: *PUT means "here is the new version of this resource"; PATCH means "change these fields".*
3. `DELETE` returns `200` the first time and `404` the second. It is still idempotent because the *state of the server* is the same after one or two calls: the record is gone either way.
4. `OPTIONS /products` returns `204` with `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`. If that list omitted `PATCH`, the browser would block the preflight and your `PATCH` would never be sent — the failure would appear as a CORS error in the browser even though the server supports `PATCH` perfectly well.

### Challenge

```markdown
# API-NOTES.md (example structure)

| Method | Path | Query | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | /products | `q`, `category`, `_sort`, `_order`, `_page`, `_limit` | 200 | — |
| GET | /products/:id | — | 200 | 404 (body `{}`) |
| POST | /products | — | 201 (body = the created record with a new id) | 400 (malformed JSON, `text/html`) |
| PUT | /products/:id | — | 200 (full record) | 404 (body `{}`) |
| PATCH | /products/:id | — | 200 (partial record) | 404 |
| DELETE | /products/:id | — | 200 (`{}`) | 404 if already gone |
| GET | /profile | — | 200 | 401 without `Authorization: Bearer token-123` |

## What the user sees

| Status | Message | Code behaviour |
| --- | --- | --- |
| 400/422 | "Please check the highlighted fields." | no retry; map `errors` to inputs |
| 401 | "Your session expired — please sign in again." | redirect to /login with `state.from` |
| 403 | "Your account does not have access." | no retry |
| 404 | "We could not find that record." | render the not-found state |
| 429 | "Too many requests — try again in a moment." | honour `Retry-After` |
| 5xx | "Something broke on our side — retrying…" | retry with backoff (file 10), then apologise |

## Proof that the sad paths work

(three curl commands with their real output — see sections 5 and 9)

## CORS

If the browser reports a CORS error but `curl` succeeds, the server answered and the **browser** refused to share it. First check the response's `Access-Control-Allow-Origin` (and, for a POST with JSON, whether the `OPTIONS` preflight answered with `Access-Control-Allow-Methods`/`-Headers`). The API is not broken; the *permission slip* is missing.

## Setup gotchas seen in this project

1. `npm i json-server` installs a `1.0.0-beta` with a different CLI → pin `json-server@0.17.4`.
2. `server/middlewares.js` fails with "ReferenceError: module is not defined in ES module scope" because the project is `"type": "module"` → rename it `.cjs`.
```

---

## 16. Summary

- **HTTP is one request, one response, no memory.** Authentication therefore travels on every request.
- A request = **method + path + query + headers + optional body**; a response = **status + headers + body**.
- **Methods carry intent**; `GET/HEAD/OPTIONS` are safe, `POST` is neither safe nor idempotent, `PUT/PATCH/DELETE` are idempotent — which decides what may be retried.
- **Status families decide UX**: 4xx is the caller's problem (show why, do not retry), 5xx is the server's (retry with backoff), 401 means "sign in", 403 means "not allowed", 404 means "gone".
- **`Content-Type` matters on both sides**, and **errors are not always JSON** (verified: malformed JSON → `400 text/html`).
- **CORS is a browser rule enforced with response headers**, including a preflight `OPTIONS` for JSON POSTs (verified `204` with `Allow-Methods`/`Allow-Headers`). A dev proxy removes it from your development life.
- Custom headers like **`X-Total-Count`** carry information the body does not — and need `Access-Control-Expose-Headers` to be readable cross-origin.
- **`curl` and the Network tab** are the two instruments that separate "the API is wrong" from "my code is wrong".

---

**What's next →** [`02-fetch.md`](./02-fetch.md): the browser's own HTTP client. What `fetch` resolves and what it rejects (verified: a `404` resolves with `ok=false`, a dead port throws `TypeError: fetch failed`), how to read a body exactly once (and what *"Body is unusable: Body has already been read"* means), cancellation with `AbortController` and `AbortSignal.timeout` (verified error names), the `Request` options you will actually use, and one small typed wrapper that turns all of it into a predictable function.
