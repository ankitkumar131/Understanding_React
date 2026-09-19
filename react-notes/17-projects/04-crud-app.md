# 04 — Project: Library CRUD App (Routing, Forms, Server State)

> **Part 17 · Projects · File 4 of 7**

Why this project: create / read / update / delete is the shape of most business software, and it is where three chapters finally meet — routing (Part 6), forms (Part 8) and server state (Part 9). The interesting questions are all about *agreement*: after a create, does the list show the new item? After an edit, is the detail page fresh? If a validation rule lives in the form, does the API layer respect it too? This project answers them with a small library app — books, five endpoints, four screens — and eight tests that walk the lifecycle.

Measured: the finished project's tests run in **817 ms** (8 tests) in this lab's suite — [`react-lab/evidence/part17-projects.txt`](../../react-lab/evidence/part17-projects.txt).

---

## 1. Requirements

| # | Requirement | The skill |
| --- | --- | --- |
| 1 | List all books in a table | server state + a table with headers |
| 2 | Show an empty state when there are none | the third state (Part 17, file 03's four states, minus idle) |
| 3 | Open a book's detail page | route parameters |
| 4 | Create a book and land on its detail page | mutation + navigation after success |
| 5 | Edit a book with prefilled values | the same form, initialised differently |
| 6 | Validate before the network is touched | one validation function, shared |
| 7 | Delete a book and see the list update | cache invalidation |
| 8 | Show a readable message for a missing book | 404 handling that is not an alert-shaped shrug |
| 9 | Unknown paths render a not-found screen | a `*` route |
| 10 | All of it is tested with a fake API | MSW as an in-memory server |

---

## 2. The file tree

```text
src/projects/library/
├── types.ts            # Book, BookDraft, validateDraft()
├── api.ts              # five endpoints + ApiError
├── hooks.ts            # query keys, useBooks/useBook/useCreateBook/…
├── pages.tsx           # BookListPage, BookDetailPage, BookCreatePage, BookEditPage, BookForm
├── router.tsx          # the route table (shared by the app and the tests)
└── library.test.tsx    # 8 tests: the whole lifecycle
```

`router.tsx` exporting a plain `RouteObject[]` is the detail that makes testing pleasant: the app turns it into a `createBrowserRouter`, the tests into a `createMemoryRouter`, and both render the same components with the same paths.

---

## 3. Types and one validation rule

```ts
// src/projects/library/types.ts
export type BookStatus = 'available' | 'borrowed';

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  status: BookStatus;
}

export type BookDraft = Omit<Book, 'id'>;

export const emptyDraft: BookDraft = { title: '', author: '', year: new Date().getFullYear(), status: 'available' };

export interface ValidationErrors { title?: string; author?: string; year?: string; form?: string }

/** One validation function, used by the form (client) and testable on its own. */
export function validateDraft(draft: BookDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  if (draft.title.trim().length < 2) errors.title = 'Give the book a title of at least 2 characters.';
  if (draft.author.trim().length < 2) errors.author = 'Who wrote it? At least 2 characters.';
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(draft.year) || draft.year < 1400 || draft.year > currentYear + 1) {
    errors.year = `Enter a year between 1400 and ${currentYear + 1}.`;
  }
  return errors;
}
```

⚠️ **Client validation is a courtesy, not a security control** (the rule from Part 15, file 06, applied here): the API must validate too, because anybody can `curl` the endpoint. The reason to have it *in the client at all* is UX — the user learns about the problem instantly, and the network is not troubled with data that cannot be accepted.

---

## 4. The API layer

```ts
// src/projects/library/api.ts
const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;                      // kept as a field: `erasableSyntaxOnly` forbids parameter properties
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(body.message ?? `Request failed with ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;         // DELETE returns no body
  return (await response.json()) as T;
}

export const booksApi = {
  list: (signal?: AbortSignal) => request<Book[]>('/books', { signal }),
  get: (id: string, signal?: AbortSignal) => request<Book>(`/books/${id}`, { signal }),
  create: (draft: BookDraft) => request<Book>('/books', { method: 'POST', body: JSON.stringify(draft) }),
  update: (id: string, draft: BookDraft) => request<Book>(`/books/${id}`, { method: 'PUT', body: JSON.stringify(draft) }),
  remove: (id: string) => request<void>(`/books/${id}`, { method: 'DELETE' }),
};
```

Five endpoints, one error shape, one place that knows the URL and the JSON headers. The `204` case is worth noticing: a `DELETE` with no body cannot be parsed as JSON, and `response.json()` on it throws — a bug that only appears on the one endpoint nobody tests.

---

## 5. Server state: keys, queries, mutations

```ts
// src/projects/library/hooks.ts
export const bookKeys = {
  all: ['books'] as const,
  list: () => [...bookKeys.all, 'list'] as const,
  detail: (id: string) => [...bookKeys.all, 'detail', id] as const,
};

export function useBooks() {
  return useQuery({ queryKey: bookKeys.list(), queryFn: ({ signal }) => booksApi.list(signal) });
}

export function useBook(id: string) {
  return useQuery({ queryKey: bookKeys.detail(id), queryFn: ({ signal }) => booksApi.get(id, signal) });
}

export function useCreateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: BookDraft) => booksApi.create(draft),
    onSuccess: (created: Book) => {
      queryClient.setQueryData<Book[]>(bookKeys.list(), (current = []) => [...current, created]);   // instant
      void queryClient.invalidateQueries({ queryKey: bookKeys.list() });                            // authoritative
    },
  });
}

export function useUpdateBook(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: BookDraft) => booksApi.update(id, draft),
    onSuccess: (updated: Book) => {
      queryClient.setQueryData(bookKeys.detail(id), updated);          // the detail page is immediately correct
      void queryClient.invalidateQueries({ queryKey: bookKeys.list() });  // the list refetches
    },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => booksApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: bookKeys.detail(id) });    // drop the deleted book from the cache
      void queryClient.invalidateQueries({ queryKey: bookKeys.list() });
    },
  });
}
```

| Idea | Why it is written this way |
| --- | --- |
| A **key factory** | every cache operation uses one source of truth for keys; a typo becomes impossible to hide |
| `list` and `detail` as separate keys | two different cache entries with different lifetimes |
| `signal` passed to `queryFn` | TanStack Query cancels in-flight requests when a key is no longer needed (file 03's lesson, handled by the library) |
| `setQueryData` **and** `invalidateQueries` | the first makes the UI correct immediately; the second makes it correct *according to the server* (a form of optimistic update with a safety net) |
| `removeQueries` on delete | the deleted book's detail entry must not linger for a back-navigation |
| `void` before promises | the callback is fire-and-forget; `void` makes the intent explicit and satisfies the lint rule against floating promises |

💡 **Why both `setQueryData` and `invalidateQueries`?** Because they answer different questions. `setQueryData` answers "what should the user see *right now*?" (no flicker, no waiting). `invalidateQueries` answers "is what the user sees still true?" (the server recomputes the list, and a stale entry is corrected on the next render). Using only the first leaves you trusting the client's guess; using only the second makes the UI wait for a round trip after every write.

---

## 6. Pages: list, detail, form

```tsx
// src/projects/library/pages.tsx (the list page, trimmed of styling)
export function BookListPage() {
  const { data: books, error, isPending } = useBooks();
  const deleteBook = useDeleteBook();

  if (isPending) return <p role="status">Loading books…</p>;
  if (error !== null && error !== undefined) return <div role="alert"><p>{(error as Error).message}</p></div>;
  if (books === undefined || books.length === 0) {
    return (
      <section>
        <h2>Library</h2>
        <p>No books yet.</p>
        <Link to="/books/new">Add the first book</Link>
      </section>
    );
  }

  return (
    <section>
      <h2>Library</h2>
      <p><Link to="/books/new">Add a book</Link></p>
      {deleteBook.isError && <p role="alert">Could not delete: {(deleteBook.error as Error).message}</p>}
      <table>
        <caption>{books.length} books</caption>
        <thead>
          <tr><th scope="col">Title</th><th scope="col">Author</th><th scope="col">Year</th><th scope="col">Status</th><th scope="col">Actions</th></tr>
        </thead>
        <tbody>
          {books.map((book) => <Row key={book.id} book={book} onDelete={(id) => deleteBook.mutate(id)} />)}
        </tbody>
      </table>
    </section>
  );
}
```

```tsx
// src/projects/library/pages.tsx (the shared form, trimmed)
function BookForm({ initial = emptyDraft, submitLabel, onSubmit, serverError = null, isSubmitting }: BookFormProps) {
  const [draft, setDraft] = useState<BookDraft>(initial);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;                  // the API is not called with invalid data
    await onSubmit(draft);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2>{submitLabel}</h2>
      {serverError !== null && <p role="alert">{serverError}</p>}
      <label htmlFor="title">Title</label>
      <input id="title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}
             aria-invalid={errors.title !== undefined} aria-describedby={errors.title !== undefined ? 'title-error' : undefined} />
      {errors.title !== undefined && <p id="title-error" role="alert">{errors.title}</p>}
      {/* …author, year, status… */}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : submitLabel}</button>
      <button type="button" onClick={() => void navigate(-1)}>Cancel</button>
    </form>
  );
}
```

Three decisions buried in that form, all of them transferable:

1. **One component, two pages.** `BookCreatePage` and `BookEditPage` differ only in the initial values, the mutation and where they navigate afterwards. Duplicating the form would mean fixing every future bug twice.
2. **Validation runs before the mutation**, and `noValidate` suppresses the browser's own messages so the app owns the error presentation (`aria-invalid` + `aria-describedby` + `role="alert"` — the accessible pattern from Part 11).
3. **Navigation happens in the page, not the form**: `onSubmit` is a prop, so the form stays reusable and the pages own the "where next" decision (`navigate('/books/' + created.id)` after a create, `navigate('/books/' + id)` after an edit).

---

## 7. The route table

```tsx
// src/projects/library/router.tsx
export const libraryRoutes: RouteObject[] = [
  { path: '/', element: <BookListPage /> },
  { path: '/books', element: <BookListPage /> },
  { path: '/books/new', element: <BookCreatePage /> },
  { path: '/books/:id', element: <BookDetailPage /> },
  { path: '/books/:id/edit', element: <BookEditPage /> },
  { path: '*', element: <p role="alert">Page not found.</p> },
];
```

⚠️ **Order matters in spirit, not in syntax**: `/books/new` must be able to win over `/books/:id`. React Router ranks static segments above dynamic ones, so this table works as written — but it is a good habit to keep specific routes near the top when you read the file, because that ranking is easy to forget when a path uses a wildcard.

---

## 8. Run it

```bash
npm install
npm run dev      # render <RouterProvider router={createBrowserRouter(libraryRoutes)} />
npm test -- --run src/projects/library
```

---

## 9. The tests: a fake API, a real router

```tsx
function renderApp(initialPath = '/books') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  const router = createMemoryRouter(libraryRoutes, { initialEntries: [initialPath] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
```

```tsx
/** A tiny in-memory API: exactly how the real endpoints behave, including status codes. */
function useInMemoryApi(startWith: Book[] = seed) {
  let books = [...startWith];
  server.use(
    http.get('/api/books', () => HttpResponse.json(books)),
    http.get('/api/books/:id', ({ params }) => {
      const book = books.find((candidate) => candidate.id === params.id);
      return book === undefined ? HttpResponse.json({ message: 'Book not found' }, { status: 404 }) : HttpResponse.json(book);
    }),
    http.post('/api/books', async ({ request }) => { /* append, return 201 */ }),
    http.put('/api/books/:id', async ({ params, request }) => { /* replace, return the book */ }),
    http.delete('/api/books/:id', ({ params }) => { /* remove, return 204 */ }),
  );
}
```

| Test | What it proves |
| --- | --- |
| lists the books from the API | query + table rendering |
| shows an empty state when there are no books | the third state |
| creates a book and lands on its detail page | mutation + cache update + navigation (`router.state.location.pathname === '/books/3'`) |
| blocks submission with validation errors | validation runs **before** the network (`api.current()` still has 2 books) |
| prefills the edit form and saves changes | the shared form with `initial` values, and cache correctness after an update |
| deletes a book from the list | mutation + invalidation reflected in the table |
| explains a missing book and offers a way back | 404 mapped to a clear message and a route back |
| renders the not-found route | the `*` route |

```text
 ✓ src/projects/library/library.test.tsx (8 tests) 817ms
   ✓ library app (8)
     ✓ creates a book through the form and lands on its detail page 318ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

💡 Two techniques make this suite reliable. First, **the fake API is stateful**: `let books = [...startWith]` lives in the test, so a POST genuinely changes what the next GET returns — that is how a real server behaves, and it is what makes "the list updates after a create" a meaningful assertion. Second, **assertions use the router's own state** (`router.state.location.pathname`) for navigation, so a redirect bug is caught precisely instead of being inferred from a heading.

---

## 10. Common mistakes in this project

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Storing the fetched list in `useState` as well as the cache | two copies, one stale | the query cache is the single source (Part 9) |
| 2 | Mutating and *not* invalidating | the list shows yesterday's data after a create | `setQueryData` + `invalidateQueries` |
| 3 | Invalidating the whole cache | unnecessary refetches, flicker | invalidate the affected keys |
| 4 | Reading `params.id!` | a crash when the route has no id | default (`const { id = '' } = useParams()`) and handle it |
| 5 | Two forms for create and edit | every fix applied twice | one form with `initial` and `onSubmit` props |
| 6 | Validating only in the form | the API accepts garbage | validate on both sides |
| 7 | Showing `error.status` to the user | "404" is not a message | map statuses to sentences |
| 8 | Optimistic updates without rollback | the UI lies after a failure | `onMutate` + `onError` restore (the taskboard project shows it) |
| 9 | Relying on `navigate(-1)` after a create | the user lands somewhere unrelated | navigate to the created resource |
| 10 | Tests that share state between cases | order-dependent failures | fresh `QueryClient` and fresh MSW handlers per test |
| 11 | `retry: true` defaults in tests | seconds of backoff and timeouts | `retry: false` in the test client |
| 12 | No `*` route | a blank screen for a typo'd URL | an explicit not-found element |

---

## 11. Practice (extend the project)

### Beginner

1. Add a search field that filters the table by title (client-side) and show the count of matches.
2. Add a "borrowed" badge with a different colour, and a test for each status.
3. Disable the Delete button while the deletion is in flight (`deleteBook.isPending`).

### Intermediate

1. Add a confirmation step before deleting (a dialog with the book's title), and test both cancel and confirm.
2. Add optimistic deletion: remove the row immediately, restore it with a message if the server refuses.
3. Add sorting and pagination controlled by the URL (`?sort=title&page=2`) with `useSearchParams`, and test that the URL is the source of truth and that back/forward work.

### Challenge

1. Add a second entity (authors) with a relationship (each book has an author id) and design the cache strategy: what is invalidated when an author's name changes? What does the book detail page show while the author query is loading?
2. Implement an "unsaved changes" guard on the edit form (`useBlocker`), including the browser-refresh case, and test the in-app navigation case.
3. Replace `createMemoryRouter` in the tests with a Playwright end-to-end test for one journey (create → edit → delete) against a running preview build, and write down what the unit tests still catch that the end-to-end test does not.

---

## 12. Solutions

### Beginner

1. `const [query, setQuery] = useState('')` and `books.filter((book) => book.title.toLowerCase().includes(query.toLowerCase()))`; display `{matches.length} of {books.length}`.
2. A small `<StatusBadge status={book.status} />` with `aria-label` for screen readers; two tests assert the text and the class (prefer text/role over class in assertions — Part 13).
3. `disabled={deleteBook.isPending}` — and note the subtlety: one mutation instance covers all rows, so **all** delete buttons disable while one is pending; if that matters, track the pending id (`deleteBook.variables`).

### Intermediate

1. A `useState<string | null>(null)` holding the id to delete; render a `<dialog>` (or an accessible modal) with the title; confirm calls `deleteBook.mutate(id)` and clears the state.
2. In `onMutate`, `setQueryData` without the deleted book and return the previous list; in `onError`, restore it and show a message; in `onSettled`, invalidate. The test asserts the row disappears immediately, then reappears with an error when the server returns 500.
3. `const [params, setParams] = useSearchParams()`, read `sort`/`page` with defaults, and write updates with `setParams(next)`. Because the URL is the state, the browser's back button already works — the test simply navigates back and asserts the previous page.

### Challenge

1. Keys: `['books', 'list']`, `['books','detail',id]`, `['authors','detail',id]`, `['authors','list']`. Renaming an author invalidates `['authors', 'detail', id]` **and** `['books', 'list']` (because the list renders author names) — the honest answer is "whatever renders the changed data". For the loading case, render the book with the author id and a placeholder name, or use `useQueries` to load both in parallel and show a skeleton until both are ready.
2. `useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname)` and a confirmation UI; for the refresh case, a `beforeunload` listener (inside an effect with cleanup). The test covers in-app navigation (click a link, assert the dialog, cancel, stay).
3. Playwright covers the real stack (browser, real network calls to a test API, real routing and history) and catches integration bugs the unit tests cannot see — missing CORS headers, a bad production build, a route that only works with a hash. The unit tests remain valuable because they run in seconds, isolate failures precisely, and can fake impossible states (a 500 on the third request) that are painful to produce in a real environment.

---

## 13. Summary

- **CRUD is four screens and five endpoints**, and the hard part is *agreement*: after every write, the UI must show what the server considers true.
- **One key factory, one API module, one error shape** — the three things that keep server state from becoming a tangle.
- **`setQueryData` for immediacy, `invalidateQueries` for truth** (and `removeQueries` when a resource is gone); optimistic updates always need a rollback path (section 5 and the practice section).
- **One form serves create and edit** via `initial` + `onSubmit` props; pages own navigation, forms own input.
- **Validation protects the user experience, not the data** — the API must validate too, because the client is not a boundary (Part 15, file 06).
- **The route table is data** (`RouteObject[]`), so the same definition drives the browser router in the app and a memory router in tests.
- **A stateful fake API (MSW) plus a fresh `QueryClient` per test** makes eight lifecycle tests fast and order-independent — measured at 817 ms for the whole suite, including create, edit, delete, validation, 404 and not-found paths.

---

**What's next →** [`05-authentication-app.md`](./05-authentication-app.md) adds identity: registration with `useActionState`, session adoption, protected routes with a remembered destination, role-gated admin screens, sign-out that clears everything, and the four failure modes (wrong password, duplicate email, expired session, forbidden) each with their own test.
