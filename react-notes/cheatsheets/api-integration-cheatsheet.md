# API Integration Cheat Sheet — fetch, axios, TanStack Query

> The patterns, and the failure each one prevents. Deep version: [Part 7](../07-api-integration/) · [Part 9 · 06](../09-state-management/06-server-state.md)

## The one rule

**`fetch` resolves on 404 and 500.** It rejects only on a network failure or an abort. If you do
not check `response.ok`, a server error becomes a JSON parse error three lines later and the real
cause is lost.

```ts
const response = await fetch(url);
if (!response.ok) throw new Error(`Request failed (${response.status})`);   // ← never skip
const data = await response.json();
```

## The wrapper every app needs

```ts
// src/shared/lib/http.ts — the ONLY place that calls fetch
import { config } from '@/config';
import { ApiError, type ApiErrorKind } from './apiError';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('network', 'Cannot reach the server. Check your connection.', null, {}, true);
  }

  if (!response.ok) {
    const kind: ApiErrorKind =
      response.status === 401 || response.status === 403 ? 'auth'
      : response.status === 404 ? 'notFound'
      : response.status === 422 ? 'validation'
      : response.status === 429 ? 'rateLimit'
      : response.status >= 500 ? 'server' : 'unknown';

    let message = `Request failed (${response.status})`;
    let fields: Record<string, string> = {};
    try {
      const body = (await response.json()) as { message?: string; errors?: Record<string, string> };
      message = body.message ?? message;
      fields = body.errors ?? {};
    } catch { /* a 500 often returns HTML — keep the default message */ }

    throw new ApiError(kind, message, response.status, fields, kind === 'server' || kind === 'rateLimit');
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
```

Benefits: auth header in one place, error normalisation in one place, breadcrumbs in one place,
and `grep -rn "fetch(" src/features` returns nothing.
→ [Part 15 · 04](../15-production/04-error-handling.md)

## The five verbs

```ts
// GET
const tasks = await request<Task[]>('/tasks');
const task  = await request<Task>(`/tasks/${id}`);

// POST — create
const created = await request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) });

// PUT — replace the whole resource
const replaced = await request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(fullTask) });

// PATCH — update some fields
const patched = await request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });

// DELETE
await request<void>(`/tasks/${id}`, { method: 'DELETE' });
```

| Verb | Idempotent? | Body? | Response |
| --- | --- | --- | --- |
| GET | ✅ | ❌ never | The resource |
| POST | ❌ | ✅ | 201 + the created resource |
| PUT | ✅ | ✅ complete | The replaced resource |
| PATCH | ❌ (usually) | ✅ partial | The updated resource |
| DELETE | ✅ | ❌ | 204, or 200 with a body |

## Building URLs safely

```ts
// ✅ Query string
const params = new URLSearchParams({ q: search, page: String(page), status });
const url = `/tasks?${params}`;

// ✅ One optional param
if (search) params.set('q', search);

// ✅ A path segment from user input
`/tasks/${encodeURIComponent(id)}`

// ❌ Never concatenate raw user input — `&`, `#` and spaces change the request
`/tasks?q=${search}`
```

## Cancellation (the fix for stale results)

```tsx
useEffect(() => {
  const controller = new AbortController();

  fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: controller.signal })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(setResults)
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;  // ours — not an error
      setError(error);
    });

  return () => controller.abort();
}, [query]);
```

Without this, two searches can resolve out of order and the older one wins. Debounce *reduces*
the problem; cancellation *fixes* it.

```ts
// Timeouts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10_000);
try { return await request<T>(path, { signal: controller.signal }); }
finally { clearTimeout(timer); }
```

## The four UI states

```tsx
const { data, isPending, isError, error, refetch } = useTasks();

if (isPending) return <Skeleton rows={5} />;
if (isError)   return <ErrorPanel detail={userMessage(error)} onRetry={canRetry(error) ? () => refetch() : undefined} />;
if (!data?.length) return <EmptyState title="No tasks yet" hint="Create your first task." />;
return <TaskList tasks={data} />;
```

Pending, error, empty, success — **all four, on every screen that loads data.** The empty state
is the one everyone forgets, and it is the first thing a new user sees.

## Mapping errors to words

```ts
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':    return 'We could not reach the server. Check your connection and try again.';
      case 'auth':       return 'Your session has ended. Please sign in again.';
      case 'notFound':   return 'We could not find that item. It may have been deleted.';
      case 'validation': return error.message;              // the server's field messages are safe
      case 'rateLimit':  return 'Too many requests. Please wait a moment and try again.';
      case 'server':     return 'Something went wrong on our side. Your data is safe — please retry.';
      default:           return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';         // never a raw err.message
}
```

## TanStack Query

```bash
npm install @tanstack/react-query
```

```tsx
// Provider — once, at the root
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } },
});
<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
```

```ts
// Query key factory — invalidation cannot typo its way into a stale cache
export const taskKeys = {
  all: ['tasks'] as const,
  list: (query: TaskQuery) => [...taskKeys.all, 'list', query] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

// Read
const { data, isPending, isError, error, refetch, isFetching } = useQuery({
  queryKey: taskKeys.list({ status }),
  queryFn: () => tasksApi.list({ status }),
  enabled: status !== undefined,            // do not run until it can
});

// Infinite
useInfiniteQuery({
  queryKey: taskKeys.all,
  queryFn: ({ pageParam }) => tasksApi.list({ page: pageParam }),
  initialPageParam: 1,
  getNextPageParam: (last) => last.nextPage,
});

// Mutate
const create = useMutation({
  mutationFn: (input: TaskInput) => tasksApi.create(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
});
create.mutate(values);                       // fire and forget
await create.mutateAsync(values);            // when you need the result
create.isPending;  create.isError;  create.error;
```

### Optimistic update with rollback

```ts
useMutation({
  mutationFn: (status: TaskStatus) => tasksApi.update(id, { status }),

  onMutate: async (status) => {
    await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) });
    const previous = queryClient.getQueryData<Task>(taskKeys.detail(id));
    if (previous) queryClient.setQueryData<Task>(taskKeys.detail(id), { ...previous, status });
    return { previous };
  },

  onError: (_e, _s, context) => { if (context?.previous) queryClient.setQueryData(taskKeys.detail(id), context.previous); },
  onSettled: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
});
```

### Prefetch

```tsx
<Link to="/tasks" onMouseEnter={() => queryClient.prefetchQuery({ queryKey: taskKeys.list({}), queryFn: () => tasksApi.list({}) })} />
```

## axios (when you need it)

```ts
import axios from 'axios';

const api = axios.create({ baseURL: config.apiUrl, timeout: 10_000 });

api.interceptors.request.use((cfg) => {
  const token = getSessionToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) { /* refresh once, then retry */ }
    return Promise.reject(toApiError(error));     // normalise, so the app has ONE error shape
  },
);

const { data } = await api.get<Task[]>('/tasks', { params: { q: search } });
await api.post<Task>('/tasks', input);
await api.patch<Task>(`/tasks/${id}`, { status });
await api.delete(`/tasks/${id}`);
```

`fetch` is enough for most apps. Choose axios for interceptors, upload progress, request
cancellation ergonomics, or an existing team convention.

## CORS

CORS is a **server** setting. A CORS error is an API configuration issue, not a React bug.

```http
Access-Control-Allow-Origin: https://app.example.com     # never "*" with credentials
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: content-type, authorization
```

In development, avoid CORS entirely with the Vite proxy:

```ts
// vite.config.ts
server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } }
```

⚠️ The proxy exists **only in dev**. Production needs real CORS headers — which is why "CORS only
breaks in production" is such a common bug report.
→ [Part 15 · 06](../15-production/06-security.md)

## Testing API code

```ts
// MSW — intercept at the network layer, so your real code runs
server.use(http.get('*/tasks', () => HttpResponse.json([{ id: '1', title: 'x' }])));
server.use(http.get('*/tasks', () => HttpResponse.json({ message: 'boom' }, { status: 500 })));

// setup
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));   // an unmocked request is a test bug
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
```

→ [Part 13 · 05](../13-testing/05-api-testing.md)

## The mistakes that cost real time

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Not checking `response.ok` | `Unexpected token '<' in JSON` | The wrapper |
| String-concatenated query strings | Broken searches, injection | `URLSearchParams` |
| No cancellation | Stale results overwrite fresh ones | `AbortController` |
| Treating `AbortError` as a failure | Error flashes while typing | Check the error name |
| Storing server data in `useState` | Other screens stay stale | TanStack Query + `invalidateQueries` |
| Manual `setState` after a mutation | One screen updates, the rest do not | Invalidate by key |
| Typing optional API fields as required | Crash on an empty result set | `?` + `?? []`, or Zod |
| `err.message` shown to users | "undefined is not a function" | `userMessage()` |
| Retrying a 422 in a loop | Infinite requests | Retry only `retryable` errors |
| No timeout | A hung request spins forever | `AbortController` + `setTimeout` |
| Secrets in `VITE_` variables | They are in the public bundle | Proxy through your API |
