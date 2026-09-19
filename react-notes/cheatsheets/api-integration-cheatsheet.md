# API Integration Cheatsheet — fetch, Queries, Mutations

> **Reference · Cheatsheet 6 of 9**
> Everything below assumes one rule: **one module knows the URL, one hook per operation, components never see `fetch`.**

---

## 1. The API module (the only place `fetch` appears)

```ts
// features/tasks/api.ts
const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {                                   // fetch does NOT throw on 404/500
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(body.message ?? `Request failed with ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;    // DELETE: no body to parse
  return (await response.json()) as T;                   // then parse at the boundary (see §7)
}

export const tasksApi = {
  list: (signal?: AbortSignal) => request<Task[]>('/tasks', { signal }),
  get: (id: string, signal?: AbortSignal) => request<Task>(`/tasks/${id}`, { signal }),
  create: (draft: TaskDraft) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(draft) }),
  update: (id: string, draft: TaskDraft) => request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(draft) }),
  setStatus: (id: string, status: TaskStatus) => request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};
```

| Rule | Why |
| --- | --- |
| Check `response.ok` | a 500 body parsed as data is the most common bug |
| Throw a typed error with `status` | the UI maps statuses to messages, not numbers |
| Handle `204` | `response.json()` on an empty body throws |
| `AbortSignal` on reads | cancellation on unmount and on new requests |
| Relative URLs (`/api/...`) | the dev server proxies them, so there is no CORS in development |
| Encode user input | `encodeURIComponent(city)` — "São Paulo", "Washington, D.C." |

---

## 2. Plain `fetch` in an effect (the version-agnostic baseline)

```tsx
function useTask(id: string) {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    tasksApi.get(id, controller.signal)
      .then((task) => { if (!controller.signal.aborted) setState({ status: 'success', task }); })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;                        // an abort is not an error to show
        setState({ status: 'error', message: cause instanceof Error ? cause.message : 'Failed' });
      });

    return () => controller.abort();
  }, [id]);

  return state;
}
```

Four states, always: `idle` · `loading` · `success` · `error`. Model them as a union so impossible combinations cannot be rendered.

---

## 3. TanStack Query (the default in an app)

```bash
npm i @tanstack/react-query
npm i -D @tanstack/react-query-devtools
```

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,                                        // fresh for 30s → no refetch on mount
      gcTime: 5 * 60_000,
      retry: import.meta.env.MODE === 'test' ? false : 1,        // retries poison tests
      refetchOnWindowFocus: import.meta.env.PROD,                 // noisy in dev
    },
  },
});

<QueryClientProvider client={queryClient}><App /></QueryClientProvider>
```

### Query keys (one factory, no typos)

```ts
export const taskKeys = {
  all: ['tasks'] as const,
  list: (filters: Filters) => [...taskKeys.all, 'list', filters] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};
```

### Queries

```tsx
const { data, error, isPending, isFetching, refetch } = useQuery({
  queryKey: taskKeys.list({ status }),
  queryFn: ({ signal }) => tasksApi.list({ status }, signal),   // signal → cancellation for free
  enabled: id !== '',                                            // do not fetch until it makes sense
  placeholderData: keepPreviousData,                              // pagination without flicker
  select: (tasks) => tasks.filter((t) => !t.archived),            // transform + cache the raw data
});
```

| Field | Meaning |
| --- | --- |
| `isPending` | no data yet (first load) |
| `isFetching` | a request is in flight (including background refetches) |
| `isError` / `error` | the query failed after retries |
| `isSuccess` / `data` | resolved; `data` is typed as `T` |
| `staleTime` | how long data is considered fresh |
| `refetchOnMount` / `refetchOnWindowFocus` | when to revalidate |
| `enabled` | conditional fetching without an `if` in a hook |

### Mutations (including optimistic updates with rollback)

```tsx
const queryClient = useQueryClient();

const setStatus = useMutation({
  mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => tasksApi.setStatus(id, status),

  onMutate: async ({ id, status }) => {
    await queryClient.cancelQueries({ queryKey: taskKeys.all });     // stop a refetch overwriting us
    const previous = queryClient.getQueryData<Task[]>(taskKeys.list({}));
    queryClient.setQueryData<Task[]>(taskKeys.list({}), (current = []) =>
      current.map((task) => (task.id === id ? { ...task, status } : task)),
    );
    return { previous };                                             // context → given to onError
  },
  onError: (_error, _vars, context) => {
    if (context?.previous !== undefined) queryClient.setQueryData(taskKeys.list({}), context.previous);
  },
  onSettled: () => { void queryClient.invalidateQueries({ queryKey: taskKeys.all }); },
});

// In a component
setStatus.mutate({ id: task.id, status: 'done' }, { onError: () => setMessage('Could not update that task') });
```

| Callback | Runs | Use for |
| --- | --- | --- |
| `onMutate` | before the request | cancel + snapshot + optimistic write; return the context |
| `onSuccess` | after success | `setQueryData` with the server's answer, invalidate affected keys |
| `onError` | after failure | roll back, show an inline message |
| `onSettled` | either way | invalidate — the server's version becomes the truth |

Cache operations: `invalidateQueries`, `setQueryData`, `getQueryData`, `removeQueries`, `cancelQueries`, `prefetchQuery`, `ensureQueryData`, `queryClient.clear()` (on logout).

---

## 4. Choose your data tool

| Situation | Tool |
| --- | --- |
| One screen, one request, no cache | `fetch` + a four-state union in a custom hook |
| Many screens sharing server data | TanStack Query (or SWR) |
| Data needed before render (SSR/SEO) | React Router `loader`, Next.js server components |
| Real-time | WebSocket/SSE + `setQueryData` on messages (or the library's subscription API) |
| Infinite scroll | `useInfiniteQuery` + `getNextPageParam` |
| GraphQL | Apollo/urql (cache normalisation) or TanStack Query + a GraphQL client |

---

## 5. Error handling: map statuses to sentences

```ts
function messageFor(error: unknown): { text: string; retryable: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 401) return { text: 'Your session expired — please sign in again.', retryable: false };
    if (error.status === 403) return { text: 'You do not have permission to do that.', retryable: false };
    if (error.status === 404) return { text: 'We could not find that item.', retryable: false };
    if (error.status === 409) return { text: 'That already exists.', retryable: false };
    if (error.status === 422) return { text: 'Some values were rejected. Check the form.', retryable: false };
    if (error.status === 429) return { text: 'Too many requests — try again in a moment.', retryable: true };
    if (error.status >= 500) return { text: 'The service is having trouble. Try again.', retryable: true };
  }
  return { text: 'We could not reach the service. Check your connection.', retryable: true };
}
```

Show **retry** only when retrying can help; a 404 will never become a 200.

---

## 6. Requests that must not race

```tsx
// Cancel the previous request when a new search starts
const controllerRef = useRef<AbortController | null>(null);

const search = async (city: string) => {
  controllerRef.current?.abort();
  const controller = new AbortController();
  controllerRef.current = controller;

  try {
    const result = await api.search(city, controller.signal);
    if (controller.signal.aborted) return;              // a newer search won
    setResult(result);
  } catch (cause) {
    if (controller.signal.aborted) return;              // the abort is intentional, not an error
    setError(messageFor(cause));
  }
};

useEffect(() => () => controllerRef.current?.abort(), []);
```

With TanStack Query this is automatic: two search terms are two query keys, and each entry cancels when it is no longer needed. Debounce typing with `useDebouncedValue(query, 300)`.

---

## 7. Parse, never cast

```ts
// ❌ compiles, crashes later
const data = (await response.json()) as WeatherReport;

// ✅ validate at the boundary
const parsed = WeatherSchema.safeParse(await response.json());
if (!parsed.success) throw new ApiError('Malformed response', 502);
return parsed.data;
```

Validation library options: Zod (schema drives the type), Valibot (smaller), io-ts, ArkType. Whichever you choose, the value of the work is the *failure mode*: a clear error at the boundary instead of `undefined°` in the UI.

---

## 8. Testing the network (MSW)

```ts
// src/test/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';

export const server = setupServer(
  http.get('/api/tasks', () => HttpResponse.json([{ id: 't1', title: 'Write', status: 'todo', assignee: 'Asha', points: 3 }])),
);
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));   // fail on unmocked requests
afterEach(() => { server.resetHandlers(); cleanup(); localStorage.clear(); });
afterAll(() => server.close());
```

```tsx
it('shows a retryable message when the list fails, and recovers', async () => {
  let calls = 0;
  server.use(http.get('/api/tasks', () => {
    calls += 1;
    return calls === 1 ? HttpResponse.json({ message: 'boom' }, { status: 500 }) : HttpResponse.json([]);
  }));

  render(<TaskList />);
  expect(await screen.findByRole('alert')).toHaveTextContent('having trouble');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByTestId('empty')).toBeInTheDocument();
});
```

| Handler | Simulates |
| --- | --- |
| `HttpResponse.json(body, { status: 500 })` | server error |
| `new HttpResponse(null, { status: 204 })` | DELETE with no body |
| `HttpResponse.json({}, { status: 401 })` | expired session |
| `await delay(80)` inside the resolver | a slow network (and races with two delays) |
| `HttpResponse.error()` | a network failure (fetch rejects) |
| `onUnhandledRequest: 'error'` | catches a wrong URL immediately |

**Keep the base URL consistent**: if the app reads `VITE_API_URL=/api`, write handlers as `/api/...`; an absolute URL in one place and a relative one in the other fails every test with a "network error".

---

## 9. Patterns worth copying

| Pattern | Shape |
| --- | --- |
| Debounced search | `useDebouncedValue(query, 300)` → query key that includes the debounced value |
| Pagination | query key includes `page`; `placeholderData: keepPreviousData` |
| Infinite scroll | `useInfiniteQuery` + an `IntersectionObserver` sentinel |
| Optimistic write | `onMutate` snapshot → `onError` rollback → `onSettled` invalidate |
| Dependent queries | second `useQuery` with `enabled: first.data !== undefined` |
| Polling | `refetchInterval: 5000` (and stop it when the tab is hidden: `refetchIntervalInBackground: false`) |
| Logout | `queryClient.clear()` so the next user sees nothing of the previous one |
| Upload progress | `XMLHttpRequest` (fetch has no upload progress) or a dedicated library |
| Retry policy | `retry: (count, error) => error.status >= 500 && count < 2` |
| Offline | `networkMode: 'offlineFirst'` + a mutation queue, or a service worker |

---

## 10. Security reminders

- **The client is not a trust boundary.** Every request must be authorised on the server; hiding a button is UX.
- **Avoid tokens in `localStorage` when XSS is a concern** — an `HttpOnly`, `SameSite` cookie is the alternative, with CSRF protection as its trade-off.
- **Never log the body** of an auth request; redact tokens and passwords in the logger.
- **CORS is not security** — it protects the browser's user, not your API; an attacker calling with `curl` ignores it.
- **Cache headers matter**: a shared cache that ignores `Authorization` can serve one user's data to another. Use `Cache-Control: private` (or `Vary: Authorization`) for authenticated responses.
- **`dangerouslySetInnerHTML` + API text is an XSS hole** unless sanitised.

---

## 11. Quick reference

| Need | Code |
| --- | --- |
| Typed GET | `useQuery({ queryKey, queryFn: ({ signal }) => api.get(id, signal) })` |
| Typed POST/PUT/PATCH/DELETE | `useMutation({ mutationFn })` then `.mutate(args)` |
| Manual refetch | `refetch()` / `queryClient.invalidateQueries({ queryKey })` |
| Read cache imperatively | `queryClient.getQueryData(key)` |
| Write cache imperatively | `queryClient.setQueryData(key, updater)` |
| Drop cache | `queryClient.removeQueries({ queryKey })` |
| Cancel in-flight | `queryClient.cancelQueries({ queryKey })` |
| Prefetch on hover | `queryClient.prefetchQuery({ queryKey, queryFn })` |
| Logout | `queryClient.clear()` |
| Global error hook | `new QueryCache({ onError })`, `new MutationCache({ onError })` |
