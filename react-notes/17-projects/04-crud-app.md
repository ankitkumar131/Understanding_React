# Project 4 — CRUD App: Routing, Forms, Validation and a Real REST API

> **Part 17 · Projects · Project 4 of 6**

Why this project exists: this is the shape of most paid React work. A list, a detail view, a
create form, an edit form, a delete with confirmation — all backed by a REST API, all routed by
URL, all validated before it reaches the server. Projects 1–3 taught the pieces; this one
assembles them into something you could hand to a client.

**Concepts used:** React Router (nested routes, params, navigation), a typed API client,
TanStack Query for server state, React Hook Form + Zod for validation, optimistic updates,
error and loading states, environment configuration.

**Time:** 4–6 hours.

---

## 1. The goal

```text
/notes                → list of notes, "New note" button
/notes/new            → create form
/notes/:id            → detail view with Edit / Delete
/notes/:id/edit       → edit form
```

Requirements: full CRUD against a real HTTP API; validation on every form; optimistic delete
with rollback; a not-found route; query-string search; loading and error states everywhere.

---

## 2. Set up

```bash
npm create vite@latest notes-crud -- --template react-ts
cd notes-crud
npm install react-router @tanstack/react-query react-hook-form zod @hookform/resolvers
npm install -D json-server
npm run dev
```

⚠️ **The package is `react-router` (v7), not `react-router-dom`.** In v7 the DOM package is a
re-export kept for compatibility; new projects install `react-router` (Part 6 file 02).

**The API:** `json-server` gives you a real REST API from a JSON file — no backend required.

```json
// db.json  (project root)
{
  "notes": [
    { "id": "1", "title": "Learn React Router", "body": "Nested routes and params.", "tags": ["react"], "updatedAt": "2026-09-01T10:00:00.000Z" },
    { "id": "2", "title": "Learn TanStack Query", "body": "Server state is not client state.", "tags": ["react", "data"], "updatedAt": "2026-09-05T09:30:00.000Z" }
  ]
}
```

```json
// package.json — add a script
{ "scripts": { "api": "json-server --watch db.json --port 8000" } }
```

```bash
npm run api      # terminal 1 → http://localhost:8000/notes
npm run dev      # terminal 2 → http://localhost:5173
```

```bash
curl http://localhost:8000/notes          # GET all
curl http://localhost:8000/notes/1        # GET one
curl -X POST http://localhost:8000/notes -H 'content-type: application/json' \
     -d '{"title":"Test","body":"x","tags":[],"updatedAt":"2026-09-19T00:00:00.000Z"}'
```

---

## 3. Project shape

```text
src/
├── main.tsx
├── config.ts
├── app/
│   ├── router.tsx
│   └── providers.tsx
├── features/notes/
│   ├── types.ts
│   ├── api/notesApi.ts
│   ├── hooks/useNotes.ts
│   ├── components/
│   │   ├── NoteList.tsx  NoteCard.tsx  NoteDetail.tsx
│   │   ├── NoteForm.tsx  DeleteNote.tsx  NoteSearch.tsx
│   └── index.ts
└── shared/
    ├── lib/http.ts  apiError.ts
    └── ui/{Spinner,ErrorPanel,EmptyState}.tsx
```

This is the feature architecture from Part 15 files 02–03, applied for real.

---

## 4. Step 1 — Types, config and the HTTP client

```ts
// src/features/notes/types.ts
export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;        // ISO 8601
}

/** What the form produces — no id yet, no timestamp yet. */
export type NoteInput = Omit<Note, 'id' | 'updatedAt'>;
```

```ts
// src/config.ts
export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
} as const;
```

```ts
// src/shared/lib/apiError.ts
export type ApiErrorKind = 'network' | 'notFound' | 'validation' | 'server' | 'unknown';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

```ts
// src/shared/lib/http.ts
import { config } from '@/config';
import { ApiError, type ApiErrorKind } from './apiError';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError('network', 'Cannot reach the server.');
  }

  if (!response.ok) {
    const kind: ApiErrorKind =
      response.status === 404 ? 'notFound'
      : response.status === 422 ? 'validation'
      : response.status >= 500 ? 'server' : 'unknown';
    throw new ApiError(kind, `Request failed (${response.status})`, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
```

---

## 5. Step 2 — The API module

```ts
// src/features/notes/api/notesApi.ts
import { request } from '@/shared/lib/http';
import type { Note, NoteInput } from '../types';

export const notesApi = {
  list: (search?: string): Promise<Note[]> =>
    request<Note[]>(search ? `/notes?title_like=${encodeURIComponent(search)}` : '/notes'),

  get: (id: string): Promise<Note> => request<Note>(`/notes/${id}`),

  create: (input: NoteInput): Promise<Note> =>
    request<Note>('/notes', {
      method: 'POST',
      body: JSON.stringify({ ...input, updatedAt: new Date().toISOString() }),
    }),

  update: (id: string, input: NoteInput): Promise<Note> =>
    request<Note>(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...input, updatedAt: new Date().toISOString() }),
    }),

  remove: (id: string): Promise<void> => request<void>(`/notes/${id}`, { method: 'DELETE' }),
};
```

**Note what is *not* here:** no React, no hooks, no JSX. This module is plain TypeScript that
returns promises — so it can be unit-tested with a mocked `fetch` and reused anywhere (Part 15
file 03).

⚠️ **`PUT` vs `PATCH`:** `PUT` replaces the whole resource, `PATCH` updates the fields you
send. `json-server` supports both; using `PUT` here means we always send the complete note,
which avoids the "I PATCHed and lost a field" class of bug.

---

## 6. Step 3 — Server state with TanStack Query

```ts
// src/features/notes/hooks/useNotes.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '../api/notesApi';
import type { Note, NoteInput } from '../types';

export const noteKeys = {
  all: ['notes'] as const,
  list: (search?: string) => [...noteKeys.all, { search: search ?? '' }] as const,
  detail: (id: string) => [...noteKeys.all, 'detail', id] as const,
};

export function useNotes(search?: string) {
  return useQuery({
    queryKey: noteKeys.list(search),
    queryFn: () => notesApi.list(search),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => notesApi.get(id),
    enabled: id.length > 0,                    // do not run with an empty id
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteInput) => notesApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

export function useUpdateNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteInput) => notesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

/** Delete with an optimistic update and rollback on failure. */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notesApi.remove(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.all });
      const previous = queryClient.getQueryData<Note[]>(noteKeys.list());
      queryClient.setQueryData<Note[]>(noteKeys.list(), (old) => old?.filter((n) => n.id !== id));
      return { previous };                     // the snapshot, for rollback
    },

    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(noteKeys.list(), context.previous);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}
```

**Line by line**

- `noteKeys` — a **query key factory**. Keys are the cache's identity; centralising them
  means invalidation cannot typo its way into a stale cache (Part 9 file 06).
- `invalidateQueries` — "this data may have changed, refetch it". Not a manual `setState`.
- **Optimistic delete:** `onMutate` snapshots the cache and removes the row *before* the
  request; `onError` restores the snapshot; `onSettled` refetches so the truth wins either
  way. The user sees instant feedback, and a failure visibly undoes itself.
- `cancelQueries` before mutating — stops an in-flight refetch from overwriting the
  optimistic write.

---

## 7. Step 4 — The router

```tsx
// src/app/router.tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { Spinner } from '@/shared/ui/Spinner';

const NoteList = lazy(() => import('@/features/notes/NoteListPage'));
const NoteDetail = lazy(() => import('@/features/notes/NoteDetailPage'));
const NoteNew = lazy(() => import('@/features/notes/NoteNewPage'));
const NoteEdit = lazy(() => import('@/features/notes/NoteEditPage'));

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/notes" replace /> },
  {
    path: '/notes',
    element: <Suspense fallback={<Spinner label="Loading notes" />}><NoteList /></Suspense>,
  },
  { path: '/notes/new', element: <Suspense fallback={<Spinner />}><NoteNew /></Suspense> },
  { path: '/notes/:id', element: <Suspense fallback={<Spinner />}><NoteDetail /></Suspense> },
  { path: '/notes/:id/edit', element: <Suspense fallback={<Spinner />}><NoteEdit /></Suspense> },
  { path: '*', element: <NotFound /> },
]);

function NotFound() {
  return <main style={{ padding: '2rem', textAlign: 'center' }}>
    <h1>Page not found</h1>
    <a href="/notes">Back to your notes</a>
  </main>;
}
```

⚠️ **Route order matters with static segments.** `/notes/new` must be declared before
`/notes/:id`, or `new` matches as an `id` and your detail page tries to fetch a note called
"new". React Router v7 ranks static segments above dynamic ones, so it handles this — but
declaring them in that order keeps the file readable for the next person.

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Providers } from './app/providers';
import { router } from './app/router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
```

```tsx
// src/app/providers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

---

## 8. Step 5 — The list page with search

```tsx
// src/features/notes/NoteListPage.tsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { NoteCard } from './components/NoteCard';
import { useNotes } from './hooks/useNotes';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';

export default function NoteListPage() {
  // The search term lives in the URL, so it is shareable and survives a refresh
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const { data, isPending, isError, error, refetch } = useNotes(search || undefined);

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Notes</h1>
        <Link to="/notes/new">New note</Link>
      </header>

      <label>
        Search
        <input
          value={search}
          onChange={(event) => {
            const next = new URLSearchParams(searchParams);
            if (event.target.value) next.set('q', event.target.value);
            else next.delete('q');
            setSearchParams(next, { replace: true });   // replace: do not spam history
          }}
          placeholder="Filter by title"
        />
      </label>

      {isPending && <Spinner label="Loading notes" />}
      {isError && <ErrorPanel message="Could not load notes" onRetry={() => refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          title={search ? `No notes matching "${search}"` : 'No notes yet'}
          hint={search ? 'Try a different search.' : 'Create your first note.'}
        />
      )}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
        {data?.map((note) => <NoteCard key={note.id} note={note} />)}
      </ul>
    </main>
  );
}
```

**Line by line**

- `useSearchParams()` — the query string as state. `/notes?q=react` is a URL you can send to
  a colleague (Part 6 file 05).
- `{ replace: true }` — typing 5 characters otherwise creates 5 history entries, so the Back
  button needs five presses. `replace` rewrites the current entry instead.
- `next.delete('q')` when empty — keeps the URL clean rather than leaving `?q=`.
- The four states again: pending, error, empty, success.

```tsx
// src/features/notes/components/NoteCard.tsx
import { Link } from 'react-router';
import type { Note } from '../types';

export function NoteCard({ note }: { note: Note }) {
  return (
    <li style={{ border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem 1rem' }}>
      <Link to={`/notes/${note.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>
        {note.title}
      </Link>
      <p style={{ margin: '0.25rem 0 0', color: '#555' }}>
        {note.body.length > 120 ? `${note.body.slice(0, 120)}…` : note.body}
      </p>
      {note.tags.length > 0 && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#777' }}>
          {note.tags.map((tag) => `#${tag}`).join(' ')}
        </p>
      )}
    </li>
  );
}
```

---

## 9. Step 6 — The validated form (create and edit)

```tsx
// src/features/notes/components/NoteForm.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { NoteInput } from '../types';

const schema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120, 'Title is too long'),
  body: z.string().trim().min(1, 'Write something, or delete the note'),
  tags: z.array(z.string().trim().min(1)).max(5, 'At most 5 tags'),
});

type FormValues = z.infer<typeof schema>;      // the form type comes FROM the schema

interface NoteFormProps {
  defaultValues?: Partial<FormValues>;
  submitLabel: string;
  onSubmit: (values: NoteInput) => Promise<unknown> | void;
  serverError?: string | null;
  isSubmitting?: boolean;
}

export function NoteForm({ defaultValues, submitLabel, onSubmit, serverError, isSubmitting }: NoteFormProps) {
  const {
    register, handleSubmit, control,
    formState: { errors, isSubmitSuccessful },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', body: '', tags: [], ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit((values) => void onSubmit(values))} noValidate>
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" {...register('title')} aria-invalid={!!errors.title} />
        {errors.title && <p role="alert">{errors.title.message}</p>}
      </div>

      <div>
        <label htmlFor="body">Body</label>
        <textarea id="body" rows={6} {...register('body')} aria-invalid={!!errors.body} />
        {errors.body && <p role="alert">{errors.body.message}</p>}
      </div>

      <div>
        <label htmlFor="tags">Tags (comma separated)</label>
        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <input
              id="tags"
              value={field.value.join(', ')}
              onChange={(event) =>
                field.onChange(event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))
              }
              onBlur={field.onBlur}
            />
          )}
        />
        {errors.tags && <p role="alert">{errors.tags.message}</p>}
      </div>

      {serverError && <p role="alert">{serverError}</p>}

      <button type="submit" disabled={isSubmitting ?? isSubmitSuccessful}>
        {isSubmitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
```

**Line by line**

- `z.infer<typeof schema>` — the TypeScript type is *derived from* the validation rules, so
  they cannot drift apart (Part 8 file 05).
- `resolver: zodResolver(schema)` — RHF runs Zod on submit. One schema, both client
  validation and the form's type.
- `{...register('title')}` — spreads `name`, `onChange`, `onBlur` and `ref` onto the input.
  This is an **uncontrolled** input: RHF reads it via the ref instead of re-rendering on every
  keystroke, which is why large forms stay fast (Part 8 file 04).
- `aria-invalid` + `role="alert"` — the error is announced, not just coloured red.
- `noValidate` — disables the browser's native validation bubbles so *your* messages show
  instead of two competing systems.
- `<Controller>` — needed for inputs that are not a plain `register` target (a controlled
  array-as-string here, a date picker or select in real life).
- `isSubmitSuccessful` disabling the button prevents double-submit.

```tsx
// src/features/notes/NoteNewPage.tsx
import { useNavigate } from 'react-router';
import { NoteForm } from './components/NoteForm';
import { useCreateNote } from './hooks/useNotes';
import { ApiError } from '@/shared/lib/apiError';

export default function NoteNewPage() {
  const navigate = useNavigate();
  const create = useCreateNote();

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>New note</h1>
      <NoteForm
        submitLabel="Create note"
        isSubmitting={create.isPending}
        serverError={create.isError ? messageFor(create.error) : null}
        onSubmit={async (values) => {
          const note = await create.mutateAsync(values);
          navigate(`/notes/${note.id}`);            // go to the thing you just made
        }}
      />
    </main>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'network') return 'Cannot reach the server.';
  return 'Could not save the note. Please try again.';
}
```

```tsx
// src/features/notes/NoteEditPage.tsx
import { useNavigate, useParams } from 'react-router';
import { NoteForm } from './components/NoteForm';
import { useNote, useUpdateNote } from './hooks/useNotes';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';

export default function NoteEditPage() {
  const { id = '' } = useParams();                 // params are string | undefined
  const navigate = useNavigate();
  const { data: note, isPending, isError } = useNote(id);
  const update = useUpdateNote(id);

  if (isPending) return <Spinner label="Loading note" />;
  if (isError || !note) return <ErrorPanel message="That note does not exist" />;

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>Edit note</h1>
      <NoteForm
        key={note.id}                              // remount when the note changes, so defaults apply
        defaultValues={{ title: note.title, body: note.body, tags: note.tags }}
        submitLabel="Save changes"
        isSubmitting={update.isPending}
        onSubmit={async (values) => {
          await update.mutateAsync(values);
          navigate(`/notes/${note.id}`);
        }}
      />
    </main>
  );
}
```

⚠️ **`key={note.id}` on the form** is not decoration. `defaultValues` are read **once**, when
the form mounts. Without the key, navigating from editing note A to editing note B keeps A's
values on screen. The key forces a remount, which re-reads the defaults.

---

## 10. Step 7 — Detail page and delete

```tsx
// src/features/notes/NoteDetailPage.tsx
import { Link, useNavigate, useParams } from 'react-router';
import { DeleteNote } from './components/DeleteNote';
import { useNote } from './hooks/useNotes';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';

export default function NoteDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: note, isPending, isError, error, refetch } = useNote(id);

  if (isPending) return <Spinner label="Loading note" />;
  if (isError) return <ErrorPanel message="Could not load that note" onRetry={() => refetch()} />;
  if (!note) return <ErrorPanel message="That note does not exist" />;

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <Link to="/notes">← All notes</Link>
      <h1>{note.title}</h1>
      <p style={{ whiteSpace: 'pre-wrap' }}>{note.body}</p>
      <p style={{ color: '#777', fontSize: '0.85rem' }}>
        Updated {new Date(note.updatedAt).toLocaleString()}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <Link to={`/notes/${note.id}/edit`}>Edit</Link>
        <DeleteNote id={note.id} onDeleted={() => navigate('/notes')} />
      </div>
    </main>
  );
}
```

```tsx
// src/features/notes/components/DeleteNote.tsx
import { useState } from 'react';
import { useDeleteNote } from '../hooks/useNotes';

interface DeleteNoteProps {
  id: string;
  onDeleted: () => void;
}

export function DeleteNote({ id, onDeleted }: DeleteNoteProps) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteNote();

  if (!confirming) return <button onClick={() => setConfirming(true)}>Delete</button>;

  return (
    <span role="group" aria-label="Confirm delete">
      <span>Are you sure?</span>
      <button
        disabled={remove.isPending}
        onClick={() => remove.mutate(id, { onSuccess: onDeleted })}
      >
        {remove.isPending ? 'Deleting…' : 'Yes, delete'}
      </button>
      <button onClick={() => setConfirming(false)} disabled={remove.isPending}>Cancel</button>
      {remove.isError && <p role="alert">Could not delete. Please try again.</p>}
    </span>
  );
}
```

💡 **Why not `window.confirm`?** It blocks the main thread, cannot be styled, cannot show a
spinner, and is invisible to your tests. An inline confirmation is more code and much better
UX — and it is testable.

---

## 11. Run it

```bash
npm run api      # terminal 1
npm run dev      # terminal 2
```

**Expected result:**

```text
/notes              → two notes; typing in Search updates the URL to /notes?q=react
/notes/new          → submit empty: three validation messages, no request sent
                      fill it in: POST, redirect to /notes/3, the list shows it
/notes/1            → detail; Edit prefills the form
/notes/1/edit       → change the title, save: PUT, redirect, list updated
Delete → confirm    → row disappears instantly; check db.json — it is really gone
/notes/999          → "That note does not exist"
/nope               → the 404 page
Refresh on /notes/1 → still works (with json-server; see the SPA rewrite note below)
```

```bash
npx tsc -b --noEmit && npm run lint
```

**Break it on purpose**

```text
1. Stop json-server, then load the list → network error panel with a working retry.
2. Delete a note with the server stopped → the row disappears, then reappears (rollback works).
3. Remove `key={note.id}` from the edit form, edit note 1, then note 2 → note 2 shows note 1's text.
4. Change the schema's min(3) to min(30) → the type error and the validation message both follow.
```

---

## 12. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Storing server data in `useState` | Stale lists after a mutation | TanStack Query (Part 9 file 06) |
| Hand-written `useEffect` fetches | Races, no cache, no retry | `useQuery` |
| Manual `setState` after a mutation | Other screens stay stale | `invalidateQueries` |
| `defaultValues` expected to update | Edit form shows the previous record | `key={entity.id}` |
| Validating in the component and typing separately | Rules drift from types | `z.infer<typeof schema>` |
| `window.confirm` | Untestable, ugly, blocking | Inline confirm |
| Delete without confirmation | Data loss on a mis-click | Confirm step |
| Search in component state only | Not shareable, lost on refresh | `useSearchParams` |
| `/notes/new` after `/notes/:id` | "new" treated as an id | Declare static routes first |
| No `enabled` guard on an id-based query | Request to `/notes/undefined` | `enabled: id.length > 0` |

---

## 13. Exercises

### Beginner
1. Add a `pinned` boolean to the schema, form and card, with a "Pin" toggle.
2. Sort the list by `updatedAt` and add a sort control in the URL (`?sort=old`).

### Intermediate
1. Add pagination: `?page=2`, using `json-server`'s `_page` and `_per_page` parameters, and
   keep the page in the cache key.
2. Add an optimistic *update* (not just delete): the card shows the new title immediately and
   rolls back on failure.

### Challenge
1. Replace `json-server` with a real backend (or MSW — Part 13 file 05) and add a 422 path:
   the server rejects the title, and the field-level error appears under the input.
2. Add unsaved-changes protection: navigating away from a dirty form asks for confirmation,
   using React Router's blocker API.

---

## 14. Solutions

### Beginner
1. Add `pinned: z.boolean().default(false)` to the schema, `register('pinned')` as a checkbox,
   and sort pinned first in the list. One schema change propagates to the type, the form and
   the API payload automatically.
2. `const sort = searchParams.get('sort') ?? 'new';` then sort in the component, and include
   `sort` in the query key only if it affects the request (it does not here, so it must *not*
   be in the key — otherwise you refetch needlessly).

### Intermediate
1. ```ts
   list: (search?: string, page = 1) =>
     request<Note[]>(`/notes?_page=${page}&_per_page=10${search ? `&title_like=${encodeURIComponent(search)}` : ''}`)
   ```
   and `noteKeys.list(search, page)`. The page in the key is what makes "back to page 1"
   instant — it is already cached.
2. Mirror `useDeleteNote`: `onMutate` snapshots and writes the new title into the cache;
   `onError` restores it; `onSettled` invalidates. The user sees their change immediately, and
   a failure visibly reverts — which is the whole point of optimistic UI.

### Challenge
1. On a 422, map the server's `errors` object into RHF with
   `setError('title', { message: body.errors.title })`. Now client and server validation share
   one display path — and the server remains authoritative (Part 15 file 06).
2. ```tsx
   const blocker = useBlocker(({ currentLocation, nextLocation }) =>
     formState.isDirty && currentLocation.pathname !== nextLocation.pathname);
   useEffect(() => { if (blocker.state === 'blocked') {
     if (window.confirm('Discard changes?')) blocker.proceed(); else blocker.reset();
   } }, [blocker]);
   ```
   Requires the data router (`createBrowserRouter`), which this project already uses.

---

## 15. What you proved you can do

- [ ] Structure a feature with `api/`, `hooks/` and `components/`.
- [ ] Build a typed HTTP client that checks `response.ok` and throws typed errors.
- [ ] Model server state with TanStack Query, including a query key factory.
- [ ] Do optimistic updates with rollback.
- [ ] Route with params, a 404, lazy pages and Suspense fallbacks.
- [ ] Keep UI state (search) in the URL.
- [ ] Validate with one Zod schema that also produces the TypeScript type.
- [ ] Build create/edit/delete flows with confirmation and no double-submits.

---

**What's next →** [`05-authentication-app.md`](./05-authentication-app.md) adds the missing
half: who is allowed to see any of this. Register, login, JWT storage, refresh, protected
routes with return-to redirects, and role-gated UI.
