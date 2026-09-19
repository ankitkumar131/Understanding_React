# 03 — Axios: A Client With Opinions (and When Those Opinions Help)

> **Part 7 · API Integration · File 3 of 11**
> Why this file exists: `fetch` gives you a response object and leaves the policy to you. `axios` bakes the policy in — it throws on `4xx`/`5xx`, parses JSON for you, serialises query parameters, supports a real `timeout`, and adds **interceptors** that see every request and every response. That last feature is why large codebases keep it: one place to attach auth tokens, one place to refresh them, one place to log failures. This file teaches the library properly, measures the trade-offs (66.71 kB minified / **21.45 kB gzip** versus 0.17 kB for a fetch wrapper, both built locally), and gives you a fair basis to choose — because there is no universal winner.

---

## 1. What `axios` is

`axios` is a **promise-based HTTP client** you install as a dependency. It works in the browser (verified default adapters: `xhr, http, fetch` — it picks an appropriate transport per environment) and in Node, so the same client code runs on both sides.

```ts
import axios from 'axios';

const response = await axios.get('/api/products');       // one call, JSON already parsed
const products = response.data;                          // ← the parsed body
```

Its defining choices, each of which answers a `fetch` wart from file 02:

| `fetch` behaviour | `axios` behaviour |
| --- | --- |
| resolves on `404`/`500`; you must check `ok` | **rejects** on any status outside `2xx` (unless you say otherwise) |
| body must be read with `.json()` (once) | `response.data` is already parsed according to `responseType` |
| no timeout option (you assemble `AbortSignal.timeout`) | `timeout: 5000` is a first-class option |
| object bodies throw; you `JSON.stringify` | plain objects are serialised and `Content-Type` is set automatically |
| query params are your string | `params: { … }` object, URL-encoded for you |
| no lifecycle hooks | **interceptors** for requests and responses |
| `error.status` does not exist; you inspect `response.status` | `error.response.status`, `error.code`, `error.config`, `error.request` |

## 2. Install and a first request

```text
npm install axios
npm list axios
```

```text
shop-admin@0.0.0 /tmp/shop-admin
└── axios@1.20.0
```

```ts
// File: src/dev/axios-probe.ts (excerpt A) — the basics
import axios from 'axios';

const API = 'http://127.0.0.1:3001';

const list = await axios.get(`${API}/products`, { params: { category: 'audio', _limit: 1 } });
console.log(list.status, list.data.length, list.data[0].name);
console.log(list.headers['content-type']);
```

Verified output:

```text
GET /products?category=audio&_limit=1 → status=200 · items=1 · first="Studio Headphones"
   headers are an AxiosHeaders object: content-type=application/json; charset=utf-8
```

Notice `params` produced `?category=audio&_limit=1` — no `encodeURIComponent`, no `&`, no template string.

---

## 3. The methods and the config object

Two equivalent styles; pick one and be consistent:

```ts
// Style 1 — named methods (readable, most common)
axios.get(url, config?)
axios.post(url, data?, config?)
axios.put(url, data?, config?)
axios.patch(url, data?, config?)
axios.delete(url, config?)
axios.head(url, config?)
axios.options(url, config?)

// Style 2 — one function, a config object (useful for dynamic methods)
axios({
  url: '/api/products',
  method: 'post',
  data: { name: 'Webcam Cover' },
  headers: { Authorization: `Bearer ${token}` },
  timeout: 5000,
});
```

Note the third-versus-second argument difference: `axios.post(url, data, config)` while `axios.get(url, config)`. That asymmetry catches everyone once.

The config keys you will actually use:

| Key | Type | Purpose |
| --- | --- | --- |
| `baseURL` | string | prefix for every relative `url` (`axios.create({ baseURL: '/api' })`) |
| `params` | object | serialised into the query string |
| `headers` | object | merged with defaults |
| `data` | any | request body (objects are JSON-encoded) |
| `timeout` | ms | abort if no response within N ms (`ECONNABORTED`) |
| `signal` | `AbortSignal` | cancellation that composes with `AbortController` |
| `responseType` | `'json'` (default) / `'text'` / `'blob'` / `'arraybuffer'` | how to parse `response.data` |
| `validateStatus` | `(status) => boolean` | which statuses count as success (section 7) |
| `withCredentials` | boolean | send cookies cross-origin (the `credentials: 'include'` equivalent) |
| `paramsSerializer` | object | controlling the exact query format (`tag[]=a`) |
| `transformRequest` / `transformResponse` | arrays of functions | reshape payloads on the way out/in |
| `maxRedirects`, `httpAgent`, `proxy` | — | Node-side networking details |

### The response object

```ts
const response = await axios.get('/api/products/p-mouse');

response.data;        // the parsed body  ← what you almost always want
response.status;      // 200
response.statusText;  // "OK"
response.headers;     // an AxiosHeaders instance: response.headers['content-type']
response.config;      // the merged config that produced this request (url, method, headers…)
response.request;     // the underlying XHR / http.ClientRequest
```

`response.data` being pre-parsed is the single biggest day-to-day difference from `fetch` — verified with `responseType`:

```text
responseType: 'text' → typeof data = string · starts "[\n  {\n    \"id\": \"p-k…"
responseType default is 'json': data was already an array without calling .json()
```

---

## 4. HTTP errors reject — and the error object is rich

Verified, all three shapes:

```text
missing product → threw · isAxiosError=true code=ERR_BAD_REQUEST
   error.response.status=404 data={} url=http://127.0.0.1:3001/products/does-not-exist
simulated 500 → threw · status=500 message="Something exploded on the server."
nothing listening on 3009 → code=ECONNREFUSED response=undefined
```

An `AxiosError` carries everything you need to make a decision:

| Property | Meaning | `404` example | network failure example |
| --- | --- | --- | --- |
| `error.message` | human text | `Request failed with status code 404` | `connect ECONNREFUSED 127.0.0.1:3009` |
| `error.code` | machine code | `ERR_BAD_REQUEST` | `ECONNREFUSED` |
| `error.response` | the response, **if there was one** | `{ status: 404, data: {}, headers, config }` | `undefined` |
| `error.request` | the transport object | set | set |
| `error.config` | the request config | `url`, `method`, `headers` | same |
| `error.status` | convenience in axios ≥1.7 | `404` | `undefined` |
| `axios.isAxiosError(error)` | guard | `true` | `true` |
| `error instanceof AxiosError` | class check (verified `true`) | — | — |

The code table worth keeping:

| `error.code` | When | `error.response` |
| --- | --- | --- |
| `ERR_BAD_REQUEST` | `4xx` | present |
| `ERR_BAD_RESPONSE` | `5xx` | present |
| `ECONNABORTED` | axios's own `timeout` elapsed | absent |
| `ERR_CANCELED` | `signal` aborted (or the deprecated `CancelToken`) | absent |
| `ERR_NETWORK` | transport failure in the browser | absent |
| `ECONNREFUSED` / `ENOTFOUND` | Node-only connection failures (verified) | absent |

```ts
// The shape every axios consumer ends up writing
try {
  await api.post('/products', draft);
} catch (error) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 401) redirectToSignIn();
    else if (status === 422) setFieldErrors(error.response?.data);
    else if (status === undefined && error.code === 'ERR_NETWORK') setOfflineMessage();
    else if (error.code === 'ERR_CANCELED') return;               // the user navigated away
    else setMessage(`Request failed (${status ?? error.code})`);
  } else {
    throw error;                                                  // a bug in our own code, not a request failure
  }
}
```

⚠️ **`error.response?.status` is optional-chained for a reason.** For timeouts, cancellations, and network failures there *is no response* — the most common axios crash in junior code is `error.response.status` on a `ECONNABORTED`.

---

## 5. Timeouts and cancellation

```ts
// 1. axios-managed timeout — verified
try {
  await axios.get(`${API}/products`, { params: { delay: 800 }, timeout: 200 });
} catch (error) {
  const axiosError = error as AxiosError;
  console.log(axiosError.code, axiosError.message);
}
```

```text
timeout after 200 ms → code=ECONNABORTED message="timeout of 200ms exceeded"
```

```ts
// 2. caller-managed cancellation with AbortController — the React-friendly one
const controller = new AbortController();
axios.get('/api/products', { signal: controller.signal, params: { delay: 800 } });
setTimeout(() => controller.abort(), 100);
```

```text
aborted after 100 ms → code=ERR_CANCELED message="canceled"
```

And the nuance that surprises people:

```text
an already-aborted signal → code=ERR_CANCELED name=CanceledError
AbortSignal.timeout(200) with axios → code=ERR_CANCELED message="canceled"
```

`AbortSignal.timeout` becomes an ordinary cancellation to axios: you get `ERR_CANCELED`, **not** a distinguishable timeout. If you need to tell "the user left" from "it was too slow", use axios's own `timeout` option (which gives you `ECONNABORTED`) for the timing, and `signal` for the user-driven cancellation. That way the codes are unambiguous:

| Situation | Option | `error.code` | Should the UI apologise? |
| --- | --- | --- | --- |
| server too slow | `timeout: 5000` | `ECONNABORTED` | yes — "this is taking too long" |
| user navigated / typed again | `signal` + `AbortController` | `ERR_CANCELED` | no — silently ignore |
| offline | — | `ERR_NETWORK` | yes — "you appear to be offline" |

⚠️ **`CancelToken` is deprecated.** Older tutorials use `axios.CancelToken.source()` and `axios.isCancel()`. Use `AbortController`; both axios and `fetch` understand it, and it is a web standard.

---

## 6. Instances: one configured client per API

```ts
// File: src/api/client.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',              // relative — the Vite proxy forwards it in dev (file 01)
  timeout: 10_000,
  headers: { Accept: 'application/json' },
});
```

`axios.create(config)` returns a **new axios instance** with its own defaults and its own interceptors. The global `axios` object is itself just an instance — which is why `axios.defaults.baseURL = …` "works" and is a bad idea: any library in your dependency tree that touches the same global changes your app's behaviour.

Rules that keep this sane:

1. **One instance per API** (rarely more than two: your API and a third-party one).
2. **Never mutate the global `axios` object**; create an instance instead.
3. Put `baseURL` in the instance, so call sites read `api.get('products')` rather than repeating a URL prefix 40 times.
4. Configure `timeout` in the instance so no request can hang forever.

```ts
// Call sites afterwards are short and uniform.
const { data: products } = await api.get<Product[]>('products', { params: { _limit: 20 } });
const { data: created } = await api.post<Product>('products', draft);
await api.delete(`products/${created.id}`);
```

💡 axios applies `baseURL` only to relative URLs, so `api.get('products')` hits `/api/products` and `api.get('https://other.test/x')` goes where you said. Note the missing leading slash: `'/products'` with `baseURL: '/api'` still resolves correctly here, but the convention `'products'` avoids being surprised by the rule.

---

## 7. Interceptors: the feature that keeps people on axios

An interceptor is a function that runs **on every request before it is sent** or **on every response before your `await` sees it**. Verified behaviour, including the ordering nobody guesses correctly:

```text
   [request interceptor] GET profile
   [response interceptor] 200 in profile
GET profile → 200 · email=admin@megashop.test
   [request interceptor] GET products
   [response interceptor] failed with ERR_BAD_RESPONSE
   (the interceptor saw the failure before it reached this catch)
```

```text
interceptor order: request-2 (registered last) → request-1 → response-1 (registered first) → response-2
```

So: **request interceptors run in reverse registration order (LIFO), response interceptors run in registration order (FIFO).** The tidy analogy is layers of an onion — the last request interceptor added is the outermost layer on the way out, and the first response interceptor added is the outermost on the way back in.

```ts
// File: src/api/client.ts — a realistic instance
import axios, { AxiosError } from 'axios';

export const api = axios.create({ baseURL: '/api', timeout: 10_000 });

// 1. Attach the token, read from wherever the app keeps it.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// 2. Normalise every failure into one error type the UI can switch on.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.code === 'ERR_CANCELED') return Promise.reject(error);     // let callers ignore it
    if (error.response?.status === 401) window.dispatchEvent(new Event('auth:expired'));
    return Promise.reject(toAppError(error));
  },
);

function toAppError(error: AxiosError) {
  const status = error.response?.status;
  const message =
    (error.response?.data as { message?: string } | undefined)?.message ??
    (status ? `Request failed with ${status}` : error.message);
  return Object.assign(new Error(message), { status, code: error.code });
}
```

Three real use cases where interceptors earn their bundle size:

1. **Auth tokens in one place.** No component knows the header exists; swapping from `sessionStorage` to a cookie or a token-refresh flow is a one-file change.
2. **Refreshing an expired token.** On a `401`, call the refresh endpoint, replay the original request with the new token (`return api(error.config)`), and queue the concurrent failures behind it. This is the canonical axios pattern and it is genuinely painful with raw `fetch`.
3. **Uniform error shape and logging.** Every failure arrives as one type with a message worth showing a user.

And the costs, honestly:

- **Invisible control flow.** A request now passes through code the call site cannot see; debugging "why is my request 401-ing?" means remembering the interceptor exists.
- **`Promise.reject` mistakes** inside an interceptor turn into unhandled rejections that look like unrelated bugs.
- **Redux/Toast side effects in interceptors** couple the network layer to the UI layer. Prefer emitting an event (as above) or setting a store, not importing components.
- **Double registration** in StrictMode-adjacent code (hot reload can run module code twice) silently stacks interceptors. Guard with a module-level boolean if you register inside a function.

To remove one, keep the id:

```ts
const id = api.interceptors.request.use(fn);
api.interceptors.request.eject(id);
```

---

## 8. `validateStatus`: opting out of throwing

Sometimes a non-`2xx` status is a legitimate answer. `validateStatus` decides which statuses count as success:

```ts
// Verified: the 404 arrives as a normal response instead of an exception.
const notFound = await axios.get(`${API}/products/nope`, { validateStatus: () => true });
console.log(notFound.status, notFound.data);
```

```text
GET missing with validateStatus:() => true → status=404 data={}
```

Useful cases: a HEAD-style existence check, a `304 Not Modified` you intend to handle, or a "check if this email is taken" endpoint that answers `409` on purpose. Use it narrowly — a global `validateStatus: () => true` throwing away every rejection is how "we never notice 500s" happens.

---

## 9. Query parameters and the serialisation trap

```ts
const built = axios.getUri({ url: `${API}/products`, params: { category: 'audio', tag: ['a', 'b'], q: 'a b' } });
```

```text
axios.getUri(...) → http://127.0.0.1:3001/products?category=audio&tag%5B%5D=a&tag%5B%5D=b&q=a+b
fetch users build the same string themselves: category=audio&q=a+b
```

Decoded, axios sent `tag[]=a&tag[]=b` (bracket notation, the PHP/Rails convention) where `URLSearchParams` would send `tag=a&tag=b`. Both are legitimate; servers differ about which they understand. If your backend rejects `tag[]`, override it:

```ts
const api = axios.create({
  baseURL: '/api',
  paramsSerializer: {
    indexes: null,                                   // repeat the key: tag=a&tag=b
  },
});
```

`?q=a b` became `q=a+b` in both clients — that is `x-www-form-urlencoded` space encoding, and every server parses it back to a space. The lesson is not "one is right"; it is **know which format your API expects and assert it in a test** (the lab transcript exists precisely so you can compare).

---

## 10. axios versus fetch: measured trade-offs

Both bundles were built locally with Vite 8.3 in production mode (`minify: true`, ES module output), one importing `axios`, the other containing a hand-written typed wrapper:

```text
dist/fetch.js   0.17 kB │ gzip:  0.15 kB
dist/axios.js  66.71 kB │ gzip: 21.45 kB
```

| Dimension | `fetch` | `axios` |
| --- | --- | --- |
| Install | none — built in | one dependency (`axios@1.20.0`) |
| Bundle cost (measured) | **0.15 kB gzip** for a small wrapper | **21.45 kB gzip** |
| Throws on 4xx/5xx | ❌ you check `response.ok` | ✅ automatic |
| JSON parse | manual (`await response.json()`) | automatic (`response.data`) |
| Query params | you build the string (`URLSearchParams` is fine) | `params: {}`, with a serialiser option |
| Timeout | `AbortSignal.timeout(ms)` | `timeout: ms` (distinct `ECONNABORTED` code) |
| Cancellation | `AbortController` | `AbortController` (+ legacy `CancelToken`) |
| Interceptors | ❌ (write your own wrapper) | ✅ request + response |
| Progress events | upload progress via `ReadableStream` only | `onUploadProgress` / `onDownloadProgress` |
| Automatic retries / refresh | ❌ | ❌ (there are `axios-retry` plugins) |
| Browser + Node parity | ✅ (Node 18+) | ✅ (adapters verified: `xhr, http, fetch`) |
| Transforms, serialisers, `withCredentials` | manual | built in |
| Debug print of the request | DevTools shows the real request | same; plus `error.config` |
| TypeScript | DOM types (`Response`, `RequestInit`) | own types (`AxiosResponse<T>`, `AxiosError<T>`) |

**When axios pays for itself:** many endpoints sharing an auth/refresh/error policy; a team that wants one error type; `onUploadProgress` for file uploads; a codebase where "check `response.ok`" has already been forgotten in three places.

**When `fetch` is the better call:** a small app with a handful of requests; a bundle budget where 21 kB gzip matters (still shipping to slow mobile networks); a codebase that wants zero HTTP dependencies; or when you have already written the 30-line wrapper in file 02's section 11 — which is, in effect, a mini-axios that you fully understand.

**Neither is "better".** The honest default in 2026 for a *teaching* codebase: learn `fetch` (it is the platform), add a typed wrapper, and reach for axios when features — not habit — justify it. This part uses a fetch-based `api` module for files 04–08 and shows the axios equivalents alongside, so you can read both fluently.

---

## 11. The axios version of the `api` module

```ts
// File: src/api/axios-client.ts — the same seam as http.ts, in axios
import axios, { AxiosError } from 'axios';
import type { Product, ProductDraft } from '../data/products';

export const api = axios.create({
  baseURL: '/api',
  timeout: 10_000,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; errors?: unknown }>) => {
    if (error.code === 'ERR_CANCELED') return Promise.reject(error);      // callers ignore this
    const status = error.response?.status;
    const message = error.response?.data?.message ?? (status ? `Request failed with ${status}` : error.message);
    return Promise.reject(new ApiError(message, { status, code: error.code, details: error.response?.data?.errors }));
  },
);

// Thin, typed helpers so components never touch axios directly.
export const productsApi = {
  list: (params?: Record<string, string | number>) => api.get<Product[]>('products', { params }).then((r) => r.data),
  byId: (id: string) => api.get<Product>(`products/${id}`).then((r) => r.data),
  create: (draft: ProductDraft) => api.post<Product>('products', draft).then((r) => r.data),
  replace: (id: string, product: Product) => api.put<Product>(`products/${id}`, product).then((r) => r.data),
  update: (id: string, changes: Partial<ProductDraft>) => api.patch<Product>(`products/${id}`, changes).then((r) => r.data),
  remove: (id: string) => api.delete(`products/${id}`).then(() => undefined),
};
```

Line by line, why this is better than `axios.get` in forty components:

| Line | Reason |
| --- | --- |
| `axios.create({...})` | one place for base URL, timeout, and default headers |
| request interceptor | the token is attached centrally; no component knows the header |
| `ERR_CANCELED` re-thrown untouched | cancellations are control flow, not errors to display |
| one `ApiError` shape | the UI switches on `status`, `code`, and `details` instead of axios internals |
| `productsApi.list` returning `r.data` | components receive **domain data**, never transport objects — the layering that makes file 11's mapping painless |

---

## 12. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `error.response.status` without a guard | `Cannot read properties of undefined` on timeouts/offline | `error.response?.status`, and branch on `error.code` first |
| 2 | treating every axios rejection as an HTTP error | cancelled requests show error toasts | check `ERR_CANCELED` and return |
| 3 | `axios.defaults.baseURL = …` at import time | another library's requests silently change | `axios.create()` per API |
| 4 | missing `Content-Type` when sending a string body | server sees the wrong media type | let axios serialise objects, or set the header explicitly |
| 5 | `axios.post(url, config)` | the config object is sent as the body, rules ignored | `axios.post(url, data, config)` |
| 6 | assuming `axios.get` returns your data | `response.map is not a function` | it returns an `AxiosResponse`; use `response.data` |
| 7 | `validateStatus: () => true` everywhere | `500`s never surface | keep the default; override per request |
| 8 | registering interceptors inside a component | interceptors stack on every render | register once in `src/api/client.ts` |
| 9 | side effects (socket, store, DOM) in interceptors | circular imports, actions firing during tests | emit an event, or keep interceptors pure |
| 10 | relaying `CancelToken` tutorials | deprecation warnings, no TypeScript help | `AbortController` |
| 11 | expecting `params` to match `URLSearchParams` exactly | the API rejects `tag[]=` | `paramsSerializer.indexes: null` |
| 12 | adding axios "just in case" to a 3-request app | +21.45 kB gzip for features you do not use | measure first (section 10) |

---

## 13. Best practices

1. **Create an instance** with `baseURL`, `timeout`, and default headers; export it from `src/api/client.ts`.
2. **Keep interceptors in that one file**, idempotent, and free of UI concerns.
3. **Convert axios errors into your own error type** at the boundary, so components never import axios.
4. **Set `timeout` on every instance.** A request with no timeout can hang until the tab closes.
5. **Prefer `AbortController`** over `CancelToken`, and treat `ERR_CANCELED` as silent control flow.
6. **Use `error.code` for transport-level failures and `error.response?.status` for HTTP ones** — they answer different questions.
7. **Return `response.data`** from your helper functions, not the whole response, unless the caller genuinely needs headers.
8. **Use one error toast/notification path** fed by the interceptor, so 40 screens do not each invent a message.
9. **Measure the cost** before adding the dependency: 21.45 kB gzip is real money on a slow connection.
10. **Do not mix styles** — pick axios or `fetch` per project (or per client module) and be consistent, because two error types in one app is two sets of bugs.

---

## 14. Practice

### Beginner — the same three calls, twice

1. Install axios in your project and run these four requests against the lab API, printing `status` and a summary of the body:

```ts
await axios.get('http://127.0.0.1:3001/products?_limit=2');
await axios.get('http://127.0.0.1:3001/products/nope');
await axios.get('http://127.0.0.1:3001/products', { params: { fail: 500 } });
await axios.get('http://127.0.0.1:3009/products');
```

2. Which of the four threw? For each one that did, print `error.code`, `error.response?.status`, and `error.response === undefined`.
3. Rewrite all four with `fetch` and explain, in two sentences, the single structural difference (what counts as an exception).
4. Print `response.headers['content-type']` for the first one and compare with `fetch`'s `response.headers.get('content-type')`.

### Intermediate — an instance with interceptors

1. Create `axios.create({ baseURL: 'http://127.0.0.1:3001', timeout: 5000 })` and give it a request interceptor that sets `Authorization: Bearer token-123` and logs `METHOD url`.
2. Give it a response interceptor that logs `status url`, and an error interceptor that logs `code`. Call `/profile` (works), then `/products?fail=500` (fails), then `/products?delay=800` with a timeout of 200 ms.
3. Register **two of each** interceptor and print the runtime order. Confirm you observe request LIFO and response FIFO, and write one sentence explaining why the outermost layer is the last request interceptor added.
4. Then call the same endpoint with `validateStatus: () => true` and show that a `404` now arrives as a normal response whose `status` you can read.

### Challenge — swap the transport without touching the UI

You have a working app built on file 02's `getJson`/`sendJson` (fetch). Replace the **transport** with axios while keeping every component unchanged.

1. Keep the exported function names and signatures identical: `getJson<T>(url, init?)` and `sendJson<T>(url, method, payload?)`.
2. Map axios errors onto your existing `HttpError` so components' `error.status` checks keep working.
3. Ensure cancellations still surface as `AbortError` (components rely on `error.name === 'AbortError'` to stay silent).
4. Ensure a `204 No Content` still resolves to `undefined`.
5. Prove it: run the same screens against both implementations and compare the transcripts. Then write a short note answering — *"What did the transport swap cost, and what would it have cost if components had imported `axios` directly?"*

---

## 15. Solutions

### Beginner

1. `GET /products?_limit=2` → `status 200`, two products in `response.data`. `GET /products/nope` → throws. `GET /products?fail=500` → throws. `GET :3009` → throws.
2. Three threw. The `404` was `code: 'ERR_BAD_REQUEST'`, `response?.status === 404`, `response` defined. The `500` was `code: 'ERR_BAD_RESPONSE'`, `status 500`, `message` came from the JSON body (`"Something exploded on the server."` if you read `error.response.data.message`). The dead port was `code: 'ECONNREFUSED'` (Node) or `ERR_NETWORK` (browser) with **`error.response === undefined`**.
3. **The structural difference: axios treats a non-2xx status as an exception, `fetch` treats it as a normal, resolvable response.** Everything else (JSON parsing, timeouts, params) is convenience built on top of that one decision.
4. Both print `application/json; charset=utf-8`; axios exposes headers as an object with the exact case the server sent (and is case-insensitive for lookups via `AxiosHeaders`), while `Headers.get` normalises.

### Intermediate

```ts
import axios from 'axios';

const api = axios.create({ baseURL: 'http://127.0.0.1:3001', timeout: 5000 });

api.interceptors.request.use((config) => {
  config.headers.set('Authorization', 'Bearer token-123');
  console.log(`→ ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log(`← ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.log(`✗ ${error.code} ${error.config?.url}`);
    return Promise.reject(error);
  },
);
```

1–3. `/profile` logs `→ GET profile`, `← 200 profile`, and returns `{ email: 'admin@megashop.test', … }`. `?fail=500` logs `→ GET products`, then the error interceptor's `✗ ERR_BAD_RESPONSE products` before the `await` rejects. `?delay=800` with `timeout: 200` logs `✗ ECONNABORTED products`. With two of each registered, the order is **request-2, request-1, response-1, response-2** (verified). The outermost layer is the last request interceptor added because each new interceptor wraps everything registered before it — like putting a new envelope around a letter *after* the previous ones are sealed.
4. `validateStatus: () => true` makes the `404` resolve; `response.status === 404` and `response.data` is `{}` (verified).

### Challenge

```ts
// File: src/api/http.ts — same public API, new transport
import axios, { AxiosError } from 'axios';

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

const transport = axios.create({ baseURL: '', timeout: 10_000 });

function rethrow(error: unknown): never {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ERR_CANCELED') {
      // Components check `error.name === 'AbortError'` — keep that contract.
      const aborted = new Error(error.message);
      aborted.name = 'AbortError';
      throw aborted;
    }
    const status = error.response?.status ?? 0;
    throw new HttpError(status, error.message, error.response?.data ?? null);
  }
  throw error;
}

export async function getJson<T>(url: string, init?: { signal?: AbortSignal }): Promise<T> {
  try {
    const response = await transport.get<T>(url, { signal: init?.signal });
    return response.data;
  } catch (error) {
    rethrow(error);
  }
}

export async function sendJson<T>(url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', payload?: unknown): Promise<T> {
  try {
    const response = await transport.request<T>({ url, method, data: payload });
    return response.status === 204 ? (undefined as T) : response.data;
  } catch (error) {
    rethrow(error);
  }
}
```

Notes on the five requirements: (1) signatures unchanged; (2) `HttpError` carries `status` and `body` from `error.response`; (3) cancellations are re-labelled `AbortError` so the components' existing guard keeps working — a good example of a boundary deliberately preserving a contract; (4) `204` returns `undefined` without parsing (axios sets `data` to `''` for empty bodies, so an explicit check is still the honest thing to do); (5) the transcripts should be identical except for timing.

The reflective answer: the swap cost one file, and the only genuinely fiddly part was translating two error vocabularies into one. Had components imported axios directly, the cost would have been **every screen** — 40 imports, 40 places checking `error.response?.status`, 40 places to update again when the team switches back or adds a retry policy. That is the entire argument for the seam.

---

## 16. Summary

- **axios is a policy layer**: it rejects on non-2xx, parses JSON into `response.data`, serialises `params`, supports `timeout`, and offers interceptors.
- **Errors are `AxiosError`** with `code` (`ERR_BAD_REQUEST`, `ERR_BAD_RESPONSE`, `ECONNABORTED`, `ERR_CANCELED`, `ERR_NETWORK`, `ECONNREFUSED`), an **optional** `response`, `config`, and `request`. Guard with `error.response?.status`.
- **Cancellation is `AbortController`** (`ERR_CANCELED`); axios's own `timeout` gives the distinguishable `ECONNABORTED`. `CancelToken` is deprecated.
- **Instances** (`axios.create`) keep `baseURL`, timeouts, and defaults out of components, and avoid mutating a shared global.
- **Interceptors** run **request LIFO / response FIFO** (verified), and are the right home for tokens, refresh, and error normalisation — and the wrong home for UI side effects.
- **`validateStatus`** opts a request out of throwing (verified `404` as a normal response).
- **Measured cost: 66.71 kB minified / 21.45 kB gzip** versus 0.15 kB gzip for a fetch wrapper. Choose with the numbers, not with fashion.

---

**What's next →** [`04-get-api.md`](./04-get-api.md): your first real data screens. Reading lists and single records, filters, sorting and pagination driven by URL search params (Part 6's `useSearchParams` plus Part 7's `getJson`), the `loading | ready | notFound | error` state machine, refetching, and the fetch-versus-axios versions of every example side by side.
