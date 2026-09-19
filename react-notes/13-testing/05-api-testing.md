# 05 — Testing the API Layer: MSW, Async Flows and Data Libraries

> **Part 13 · Testing · File 5 of 5**

Why this file exists: most component bugs in a real app are not logic bugs — they are *boundary* bugs: the request that failed with 500, the response shape that changed, the retry that never stopped, the optimistic row that never rolled back. Testing them requires controlling the network, and the tool that does it at the right level is **Mock Service Worker (MSW)**: it intercepts `fetch`/`XHR` at the network layer, so your components, your HTTP client and your data library all run their real code. This file covers the handlers this book's lab uses (measured: `ProductList`'s success, failure and callback tests all pass against MSW), per-test overrides, delays, testing the typed client from Part 7, testing TanStack Query with a fresh client, and the honest question of what to test against a real server instead.

---

## 1. Why mock at the network, not in the component

| Approach | What runs | What it misses |
| --- | --- | --- |
| Mock the component's data hook | only the JSX | your client, your error mapping, your cache |
| Mock the HTTP client module (`vi.mock('../api')`) | the component + the mock | URL construction, response parsing, status handling |
| **Mock the network (MSW)** | everything except the server | only server-side bugs |
| Hit a real server | everything | speed, determinism, cost, flakiness |

MSW's position — intercept the actual request and return a real `Response` — means the code *under* test includes the fetch call, the `response.ok` check, the JSON parsing, the error mapping and the library's caching, which is exactly where the Part 7 and Part 9 bugs lived. The cost is one library and a setup file.

```bash
npm i -D msw
```

```ts
// src/test/handlers.ts
import { http, HttpResponse } from 'msw';

export const sampleProducts = [
  { id: 'p1', name: 'Desk Lamp', priceMinor: 129950 },
  { id: 'p2', name: 'Wireless Mouse', priceMinor: 249900 },
];

export const handlers = [
  http.get('/api/products', () => HttpResponse.json(sampleProducts)),
];
```

```ts
// src/test/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

```ts
// src/test/setup.ts — the lifecycle that makes it work
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); cleanup(); });
afterAll(() => { server.close(); });
```

⚠️ `onUnhandledRequest: 'error'` is the most valuable line in that setup: any request your tests did not anticipate fails loudly instead of hanging or silently returning a real network error. The alternative (`'warn'`) is how a suite ends up depending on a dev server being up.

💡 **Relative URLs matter.** `http.get('/api/products', …)` matches requests to `/api/products` on the test origin, which is what your app code uses (`fetch('/api/products')`) — no absolute URLs in tests, no environment-specific hosts. If your app resolves an API base URL from `import.meta.env`, set it in the test config so both sides agree (Part 15, file 01).

---

## 2. The measured tests

```tsx
// src/components/ProductList.test.tsx (this lab, all three pass)
it('shows a loading state, then the products the API returned', async () => {
  render(<ProductList />);

  expect(screen.getByText(/Loading products/)).toBeInTheDocument();          // sync: it exists now

  const list = await screen.findByRole('list', { name: 'products' });        // waits for arrival
  expect(list).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByText(/Desk Lamp/)).toHaveTextContent('1299.50');        // ← formatting, end to end
});

it('renders an alert when the API fails', async () => {
  server.use(http.get('/api/products', () => HttpResponse.json({ message: 'boom' }, { status: 500 })));
  render(<ProductList />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Request failed with 500');                // ← our error mapping
  expect(screen.queryByRole('list')).not.toBeInTheDocument();               // ← the list is gone
});

it('calls onLoad once with the parsed products', async () => {
  const onLoad = vi.fn();
  render(<ProductList onLoad={onLoad} />);

  await screen.findByRole('list', { name: 'products' });
  expect(onLoad).toHaveBeenCalledTimes(1);
  expect(onLoad).toHaveBeenCalledWith(sampleProducts);                      // ← exact shape
});
```

What each test buys, in one line:

| Test | The bug it would catch |
| --- | --- |
| loading → data | a spinner that never disappears, or data rendered as `undefined` |
| failure → alert | an unhandled rejection, a blank screen, a generic message instead of the mapped one |
| `onLoad` once, with parsed data | double-fetching (StrictMode, effect dependency — Part 4), or a callback receiving the raw `Response` |

**Three techniques worth extracting from that file:**

1. **`server.use(...)` overrides a handler for one test only** — `afterEach(resetHandlers)` restores the defaults, so a failure test cannot leak into the next test. This is why overrides belong *inside* the test, not in the shared handlers file.
2. **`expect(onLoad).toHaveBeenCalledTimes(1)`** is a real assertion in this app: React StrictMode double-invokes effects in development, and a missing dependency or cleanup would show up here as 2.
3. **Assert the formatting, not just the data**: `toHaveTextContent('1299.50')` covers `priceMinor / 100` and `toFixed(2)` — the money bug class from Part 1.

---

## 3. Delays, retries and time

```tsx
it('shows the pending state while the request is slow', async () => {
  server.use(
    http.get('/api/products', async () => {
      await delay(50);                                   // MSW's delay helper
      return HttpResponse.json(sampleProducts);
    }),
  );

  render(<ProductList />);
  expect(screen.getByText(/Loading products/)).toBeInTheDocument();
  await screen.findByRole('list', { name: 'products' });
});
```

| Need | Tool | Note |
| --- | --- | --- |
| A slow response | `await delay(ms)` in the handler | keeps the pending state observable |
| A one-off network error | `HttpResponse.error()` | simulates a connection failure, not an HTTP error |
| An HTTP error with a body | `HttpResponse.json({…}, { status: 422 })` | the shape your client's error mapper expects |
| A sequence of responses | a counter in the handler closure, or `server.use` between renders | Part 7's `?fail=firstN` idea, in memory |
| Retry/backoff tests | fake timers + `vi.advanceTimersByTime` | with a Query client configured for tests (section 5) |
| Request assertions | `vi.fn()` inside the handler | `expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))` |

```tsx
// Assert what the client actually sent — headers, body, method
it('posts the product as JSON with the auth header', async () => {
  const seen: Request[] = [];
  server.use(
    http.post('/api/products', async ({ request }) => {
      seen.push(request);
      return HttpResponse.json({ id: 'p9' }, { status: 201 });
    }),
  );

  render(<ProductForm token="token-123" />);
  await user.type(screen.getByLabelText('Name'), 'Desk Lamp');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText(/Saved/);
  expect(seen).toHaveLength(1);
  expect(seen[0]?.headers.get('content-type')).toContain('application/json');
  expect(await seen[0]?.json()).toEqual({ name: 'Desk Lamp' });
});
```

💡 This test is the cheapest possible regression test for the Part 7 HTTP client: it proves the URL, method, headers and body without a server, and it breaks loudly if someone changes the client's wire format.

---

## 4. Testing the typed HTTP client itself

The client from Part 7 (`src/api/http.ts`) is ordinary code and deserves its own tests — it is where error mapping, timeouts and auth live:

```tsx
describe('http client', () => {
  it('maps a 404 to an ApiError with the server message', async () => {
    server.use(http.get('/api/products/missing', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));
    await expect(fetchProduct('missing')).rejects.toMatchObject({ status: 404, message: 'Not found' });
  });

  it('rejects with a network error when the connection fails', async () => {
    server.use(http.get('/api/products', () => HttpResponse.error()));
    await expect(fetchProducts()).rejects.toThrow(/network/i);
  });

  it('sends the bearer token when one is provided', async () => {
    const seen = vi.fn();
    server.use(http.get('/api/profile', ({ request }) => { seen(request.headers.get('authorization')); return HttpResponse.json({}); }));
    await fetchProfile('token-123');
    expect(seen).toHaveBeenCalledWith('Bearer token-123');
  });
});
```

Note the shape of the assertions: **status, message, header** — the contract the rest of the app depends on. Not the internal implementation (no assertions about which helper was called, or how many times `fetch` was invoked).

⚠️ **Timeouts are hard to test honestly.** A client with a 5 s abort timeout will make a test wait 5 s unless you use fake timers. Either (a) make the timeout configurable and pass a small value in tests, or (b) use fake timers and advance them; do not skip the timeout test entirely — Part 7's measurements showed how easy it is to have a timeout that never fires.

---

## 5. TanStack Query (and other data libraries) in tests

Query's behaviour *is* cache behaviour, so a test needs a fresh client with test-friendly defaults:

```tsx
// src/test/renderWithQuery.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },   // ← no backoff, no lingering cache
      mutations: { retry: false },
    },
  });
}

export function renderWithQuery(ui: ReactElement, client = makeQueryClient()) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper }), client };
}
```

| What to test | How |
| --- | --- |
| Loading → data | delay the handler, assert the skeleton, then `findByRole` |
| Error → retry | fail once, then succeed; assert the retry UI and that the second request happened |
| Retry policy | `retry: false` for most tests; a dedicated test with `retry: 1` and fake timers |
| Cache reuse | render two components that share a key and assert the handler was called once |
| Invalidation after a mutation | mutate, assert a refetch of the invalidated key |
| Optimistic updates | resolve the mutation late and assert the optimistic state, then the final state |

```tsx
it('does not refetch within staleTime', async () => {
  const requests = vi.fn();
  server.use(http.get('/api/products', () => { requests(); return HttpResponse.json(sampleProducts); }));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  const { unmount } = renderWithQuery(<ProductsPanel />, client);
  await screen.findByRole('list', { name: 'products' });
  unmount();

  renderWithQuery(<ProductsPanel />, client);           // the same client ⇒ the same cache
  await screen.findByRole('list', { name: 'products' });
  expect(requests).toHaveBeenCalledTimes(1);            // served from cache
});
```

⚠️ **Timers are the main source of flaky Query tests**: `gcTime`, retry backoff and `staleTime` all use timers. `gcTime: 0` and `retry: false` in test defaults remove most of it; and remember to unmount trees between tests (`cleanup()` in setup) so pending queries do not fire into a torn-down environment.

---

## 6. What to test against a real server

MSW tests your *client* code — it cannot tell you that your API returns a field you spelled differently. So the split:

| Layer | Tested with | Why |
| --- | --- | --- |
| Component + client + cache | MSW (this file) | fast, deterministic, catches your bugs |
| Wire contract (fields, statuses, shapes) | a **contract test** against the real API or a generated type from OpenAPI/GraphQL | mocks happily lie; generated types do not |
| Server logic | the server's own test suite | it is not your React app's job |
| Deployment/wiring | a few end-to-end tests (Part 13, file 01) | config and auth bugs are invisible to unit tests |

💡 The practical version of a contract test in a React codebase: one test file that calls the real API (a test environment, seeded data) and validates each response against the Zod schema you already wrote for the client (Part 8). Run it nightly or on demand, not on every PR — but *have it*, because that is the only thing standing between you and "our mocks say this field is called `priceMinor`".

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Absolute URLs in handlers | handlers never match in tests | relative paths, matching app code |
| 2 | No `onUnhandledRequest: 'error'` | unexpected requests silently hit the network | error in setup |
| 3 | Overrides not reset | a failure test leaks into the next | `afterEach(server.resetHandlers())` |
| 4 | Mocking the client module instead of the network | misses URL/header/parse bugs | MSW |
| 5 | Asserting "the request happened" without its shape | a broken wire format passes | assert method, headers, body |
| 6 | Retries enabled in test Query clients | slow, timing-dependent tests | `retry: false` |
| 7 | Sharing one QueryClient across tests | cache leaks between tests | fresh client per test (or intentionally shared — say which) |
| 8 | Fixed sleeps to wait for requests | flaky on CI | `findBy*`, `waitFor` |
| 9 | Testing only the 200 path | error mapping untested | 4xx/5xx/network-error tests |
| 10 | `HttpResponse.json({}, { status: 500 })` when the client expects a message | assertions about messages fail for the wrong reason | return the shape the API really returns |
| 11 | No test for abort/unmount | leaked requests and state updates | unmount mid-flight and assert |
| 12 | Believing MSW tests the server | contract drift ships | one contract test against the real API |

---

## 8. Best practices

1. **Mock at the network with MSW**, and keep components, clients and caches real.
2. **Default handlers describe the happy path**; per-test overrides describe failures.
3. **Fail loudly on unhandled requests** so missing mocks are visible.
4. **Always cover the four states**: loading, empty, error, success.
5. **Assert the wire format** (method, headers, body) at least once per endpoint the app writes to.
6. **Test the client's error mapping** (status → error type → message) — that is where user-facing messages come from.
7. **Use a fresh Query client per test** with `retry: false` and `gcTime: 0`.
8. **Test retries explicitly** with fake timers and a deliberate failure sequence, not implicitly.
9. **Test the retry/abort/focus paths** — they are the ones users meet under bad conditions.
10. **Add one contract test against the real API** so your mocks cannot lie forever.

---

## 9. Practice

### Beginner

1. Set up MSW in a Vite React project (handlers, server, setup lifecycle) and make one component test pass against a mocked `GET /api/products`.
2. Write a test that asserts the loading text synchronously and the data with `findBy`.
3. Add a failure test with a 500 response and assert the alert text.

### Intermediate

1. Add a delay to the handler and write the pending-state test (assert the disabled button or the loading text while the request is in flight).
2. Add per-test overrides for 404 and 422 and assert the messages your client maps them to.
3. Write a test proving the app does not double-fetch on mount (assert the handler ran once), and explain what it protects against (StrictMode, effect dependencies, remounts).

### Challenge

1. Write the Query test from section 5 (no refetch within `staleTime`, one fetch for two components sharing a key) and then test an optimistic mutation with a delayed response: assert the optimistic state, then the final state, then a rollback on failure.
2. Build a contract test that hits a real API (or a `json-server` instance from an earlier part) and validates the response against your Zod schema. Wire it to run nightly, and document what it protects against that MSW cannot.
3. Write a "network conditions" suite for a data-heavy screen: slow (2 s), flaky (fails once then succeeds), offline (`HttpResponse.error()`), and unauthorised (401). For each, assert what the user sees and what the app does next — then fix whatever the suite exposes.

---

## 10. Solutions

### Beginner

1. Files exactly as in section 1; the test is the measured loading→data test. If the request never matches, check the URL is relative and that the setup's `beforeAll(server.listen)` runs (a missing lifecycle is the usual cause).
2. `expect(screen.getByText(/Loading products/)).toBeInTheDocument();` immediately after `render`, then `expect(await screen.findByRole('list', { name: 'products' })).toBeInTheDocument();`.
3. `server.use(http.get('/api/products', () => HttpResponse.json({ message: 'boom' }, { status: 500 })));` inside the test, then assert the alert with the client's mapped message (measured: `Request failed with 500`).

### Intermediate

1. `server.use(http.get('/api/products', async () => { await delay(50); return HttpResponse.json(sampleProducts); }))` — then assert the loading state (or a disabled button), and `await screen.findByRole('list', …)` afterwards. Without the delay the test races the response, which is the flakiness lesson.
2. 404 → your client throws an `ApiError` with the server's message; assert the message the UI shows, and (in a separate client test) `expect(error).toMatchObject({ status: 404 })`. 422 → field errors, asserted next to the field (`getByRole('alert')` inside the field's container).
3. A counter inside the handler (`const calls = vi.fn()`) asserted as `toHaveBeenCalledTimes(1)`. It protects against the double-invoke class of bugs: an effect without cleanup, a query key that changes identity every render (Part 9, file 06), or a StrictMode-sensitive side effect that only shows up in development — plus remounts caused by a `key` that changes unexpectedly (Part 10, file 02).

### Challenge

1. The stale-time test as written in section 5; the optimistic mutation test needs the mutation handler delayed (`await delay(60)`), an assertion mid-flight (the row is present), then the final state after resolution, and a second test where the handler returns 500 and the row disappears with a message.
2. A contract test that fetches each endpoint and runs `Schema.parse(response)` (Zod) against the result; failures name the exact field that drifted. It protects against everything MSW cannot know: field renames, type changes, required-vs-optional, and server-side validation rules changing.
3. Expect the suite to expose at least one real problem — usually "offline shows a generic error with no retry" or "401 does not redirect to sign-in". Test expectations should be stated per state: slow → skeleton stays until data; flaky → one retry then success (assert the requests); offline → a distinct message plus a retry action; 401 → sign-in redirect or a session-expired banner, never a blank screen.

---

## 11. Summary

- **Mock at the network, not the component**: MSW intercepts `fetch`/XHR so your client, error mapping and cache all run — exactly the code where Part 7 and Part 9's bugs lived.
- **The setup is four pieces**: shared handlers, `setupServer`, the lifecycle (`listen`/`resetHandlers`/`close`) and `onUnhandledRequest: 'error'` so missing mocks fail loudly.
- **Measured tests here**: loading→data (`getAllByRole('listitem')` length 2 and `toHaveTextContent('1299.50')` for the money formatting), failure→alert (`Request failed with 500` with no list), and `onLoad` called **once** with the parsed products.
- **Per-test overrides (`server.use`) belong inside the test**, with `resetHandlers` in `afterEach`; delays (`await delay(ms)`) make pending states observable.
- **Assert the wire format** — method, headers, JSON body — at least once per written endpoint: it is the cheapest regression test for the HTTP client.
- **Data libraries need test-friendly defaults**: a fresh `QueryClient` per test with `retry: false` and `gcTime: 0`; test retries deliberately with fake timers, and test cache reuse by sharing a client on purpose.
- **MSW cannot test the server**: add one contract test against the real API (validated with the same Zod schemas the client uses) so your mocks cannot lie indefinitely.

---

**What's next →** [`../14-authentication/01-authentication-basics.md`](../14-authentication/01-authentication-basics.md) opens Part 14: how authentication actually works (sessions versus tokens), what "logged in" means on the client, the flow from credentials to a protected request, and the security reality check that frontend guards are UX, not security.
