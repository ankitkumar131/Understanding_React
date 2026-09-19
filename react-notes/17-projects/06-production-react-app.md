# Project 6 — Production React Application: Everything Together

> **Part 17 · Projects · Project 6 of 6**

Why this project exists: this is the portfolio piece. Not a tutorial app — a codebase you could
hand to a team. It combines everything from Parts 1–16: feature architecture, typed API layer,
authentication, routing, server state, validated forms, error handling, logging, testing,
environment configuration, performance budgets and a deployment. The point is not the feature
set (a task board); the point is that **every decision in it has a reason you can defend in an
interview**.

**Time:** 20–30 hours over a week or two. Build it in the order given — each step leaves the
app working.

---

## 1. The application

**Taskboard** — a team task board.

```text
Public:      /            landing
             /login       /register
Protected:   /tasks                list, filter, search, create
             /tasks/:id            detail, edit, comments, delete
             /tasks/new            create form
             /settings             profile
Admin:       /admin/users          user list + role management
Everywhere:  error boundary, offline banner, toasts, theme toggle
```

Non-functional requirements — these are the part that makes it "production":

- Feature-based architecture with enforced boundaries
- Typed API layer; components never call `fetch`
- Server state via TanStack Query; client state via Zustand
- Auth with JWT, refresh, protected routes, role-gated UI
- Zod-validated forms with server-error mapping
- Error boundaries at app, route and widget level
- Structured logging with breadcrumbs, release and commit
- Core Web Vitals reporting; bundle budget enforced in CI
- Vitest + RTL tests for logic, components and API
- `.env.[mode]` per environment; `npm run preview` verified
- Deployed, with SPA rewrites and correct cache headers
- A README that explains the architecture in one screen

---

## 2. Set up

```bash
npm create vite@latest taskboard -- --template react-ts
cd taskboard
npm install react-router @tanstack/react-query zustand react-hook-form zod @hookform/resolvers dompurify web-vitals
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  jsdom msw rollup-plugin-visualizer size-limit @size-limit/file
npm run dev
```

```bash
mkdir -p src/{app/routes,shared/{ui,lib,hooks,test},features/{auth,tasks,users,settings}}
mkdir -p src/features/tasks/{api,hooks,components} src/features/auth/{api,components,routes}
mkdir -p src/features/users/{api,components} src/features/settings/components
```

---

## 3. The architecture (and the rules that hold it)

```text
taskboard/
├── public/{favicon.svg, robots.txt}
├── src/
│   ├── app/
│   │   ├── main.tsx            # entry: providers, router, logging, vitals
│   │   ├── AppLayout.tsx       # header, nav, outlet, global banners
│   │   ├── router.tsx          # every route, lazy
│   │   ├── providers.tsx       # QueryClient, AuthProvider, ToastProvider, ErrorBoundary
│   │   └── routes/             # thin route modules
│   ├── features/
│   │   ├── auth/               # session, login, guards, permissions
│   │   ├── tasks/              # api/ hooks/ components/ types.ts index.ts
│   │   ├── users/              # admin user management
│   │   └── settings/           # profile, theme
│   ├── shared/
│   │   ├── ui/                 # Button, Input, Modal, Spinner, ErrorPanel, EmptyState, Toast
│   │   ├── lib/                # http.ts, apiError.ts, logger.ts, errorMessages.ts, format.ts
│   │   ├── hooks/              # useDebounce, useMediaQuery, useOnlineStatus
│   │   └── test/               # setup.ts, renderWithProviders.tsx, handlers.ts
│   ├── config.ts               # the ONLY reader of import.meta.env
│   └── vite-env.d.ts
├── .env  .env.development  .env.staging  .env.production  .env.local (git-ignored)
├── index.html  vite.config.ts  vitest.config.ts  tsconfig*.json
├── .size-limit.json  budgets.json
├── .github/workflows/ci.yml
├── netlify.toml
├── DEPLOY_CHECKLIST.md
└── README.md
```

**The three rules** (Part 15 file 02) — enforced by lint, not by memory:

```text
app/      → may import features/ and shared/
features/ → may import shared/, and other features ONLY through their index.ts
shared/   → may import shared/ only
```

```js
// eslint.config.js — boundary rule
{
  files: ['src/shared/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['@/features/*', '@/app/*'], message: 'shared/ must not import from features/ or app/' }],
    }],
  },
},
{
  files: ['src/features/*/components/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['**/api/*'], message: 'Components must not call the API directly — use a hook' }],
    }],
  },
}
```

---

## 4. Configuration and build

```ts
// src/config.ts — the only file that reads import.meta.env
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  appName: import.meta.env.VITE_APP_NAME ?? 'Taskboard',
  apiUrl: required('VITE_API_URL', import.meta.env.VITE_API_URL),
  mode: import.meta.env.MODE,
  isProd: import.meta.env.PROD,
  release: `${import.meta.env.VITE_APP_NAME ?? 'taskboard'}@${__APP_VERSION__}`,
  commit: __APP_COMMIT__,
  minLogLevel: (import.meta.env.VITE_LOG_LEVEL ?? (import.meta.env.PROD ? 'warn' : 'debug')) as LogLevel,
  logSampleRate: Number(import.meta.env.VITE_LOG_SAMPLE_RATE ?? 1),
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,          // public by design
} as const;
```

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_API_URL: string;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_LOG_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_DSN?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
```

```ts
// vite.config.ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';

  return {
    plugins: [
      react(),
      isProd && visualizer({ filename: 'dist/stats.html', gzipSize: true }),
    ].filter(Boolean),
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify(execSync('git rev-parse --short HEAD').toString().trim()),
    },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: env.BACKEND_ORIGIN ?? 'http://localhost:8000', changeOrigin: true } },
    },
    build: {
      sourcemap: isProd ? 'hidden' : true,
      chunkSizeWarningLimit: 250,
      target: 'es2022',
      rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router'] } } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/shared/test/setup.ts',
      coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['src/**/*.{ts,tsx}'] },
    },
  };
});
```

```bash
# .env
VITE_APP_NAME=Taskboard
VITE_API_URL=https://api.taskboard.example.com

# .env.development
VITE_API_URL=http://localhost:8000

# .env.staging
VITE_API_URL=https://staging-api.taskboard.example.com
```

```json
// package.json — scripts
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:staging": "tsc -b && vite build --mode staging",
    "preview": "vite preview",
    "lint": "oxlint . && eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage",
    "size": "size-limit",
    "typecheck": "tsc -b --noEmit"
  },
  "size-limit": [{ "path": "dist/assets/index-*.js", "limit": "180 kB", "gzip": true }]
}
```

---

## 5. The HTTP layer and logging

`src/shared/lib/apiError.ts`, `http.ts`, `logger.ts` and `errorMessages.ts` are exactly the
implementations from Part 15 files 04 and 05 — copy them in, then wire them here:

```ts
// src/shared/lib/http.ts — the additions on top of Part 15's version
import { addBreadcrumb } from './logger';
import { reportError } from './reportError';
import { getSessionToken, onAuthExpired } from '@/features/auth';

let refreshing: Promise<void> | null = null;      // dedupe concurrent refreshes

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const started = performance.now();
  const first = await send<T>(path, init);
  addBreadcrumb({ category: 'http', message: `${init.method ?? 'GET'} ${path} → ${first.status} (${Math.round(performance.now() - started)}ms)` });

  if (first.status !== 401) {
    if (!first.ok) throw toApiError(first.status, await first.response.text());
    return (await first.response.json()) as T;
  }

  // ONE refresh, shared by every request that 401s at the same moment
  refreshing ??= refreshSession().finally(() => { refreshing = null; });
  try {
    await refreshing;
  } catch {
    onAuthExpired();
    throw new ApiError('auth', 'Your session has ended. Please sign in again.', 401);
  }

  const retry = await send<T>(path, init);
  if (!retry.ok) throw toApiError(retry.status, await retry.response.text());
  return (await retry.response.json()) as T;
}
```

⚠️ **`refreshing ??=` is the important line.** Without it, ten parallel requests that all get
a 401 fire ten refresh calls, and if your server rotates refresh tokens, nine of them fail and
the user is logged out for no reason. Dedupe the refresh.

```ts
// src/app/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { onCLS, onINP, onLCP } from 'web-vitals';
import { Providers } from './providers';
import { router } from './router';
import { config } from '@/config';
import { logger } from '@/shared/lib/logger';
import { reportError } from '@/shared/lib/reportError';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

// The last line of defence: anything no try/catch handled
window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});
window.addEventListener('error', (event) => reportError(event.error ?? new Error(event.message)));

for (const report of [onLCP, onINP, onCLS]) {
  report(({ name, value, rating }) => logger.info('web-vital', { metric: name, value: Math.round(value), rating }));
}

logger.info('app:boot', { release: config.release, commit: config.commit });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={<AppCrashed />} onError={(error, info) => reportError(error, { componentStack: info.componentStack })}>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);

function AppCrashed() {
  return (
    <main style={{ padding: '3rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1>Something went wrong</h1>
      <p>We have logged the error. Reloading usually fixes it.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </main>
  );
}
```

```tsx
// src/app/providers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth';
import { ToastProvider } from '@/shared/ui/Toast';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {/* A per-route boundary lives in AppLayout, around <Outlet /> */}
          <ErrorBoundary fallback={<p>This page failed to load. <a href="/">Go home</a></p>}>
            {children}
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

---

## 6. A complete feature, end to end

```ts
// src/features/tasks/types.ts
export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
  authorId: string;
  updatedAt: string;
}

export type TaskInput = Omit<Task, 'id' | 'authorId' | 'updatedAt'>;

export interface TaskQuery { search?: string; status?: TaskStatus; assigneeId?: string; page?: number }
```

```ts
// src/features/tasks/api/tasksApi.ts
import { request } from '@/shared/lib/http';
import type { Task, TaskInput, TaskQuery } from '../types';

function queryString(query: TaskQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('q', query.search);
  if (query.status) params.set('status', query.status);
  if (query.assigneeId) params.set('assigneeId', query.assigneeId);
  params.set('page', String(query.page ?? 1));
  return params.toString();
}

export const tasksApi = {
  list: (query: TaskQuery = {}) => request<{ items: Task[]; total: number }>(`/tasks?${queryString(query)}`),
  get: (id: string) => request<Task>(`/tasks/${id}`),
  create: (input: TaskInput) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<TaskInput>) => request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};
```

```ts
// src/features/tasks/hooks/useTasks.ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../api/tasksApi';
import type { Task, TaskInput, TaskQuery } from '../types';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (query: TaskQuery) => [...taskKeys.all, 'list', query] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

export function useTasks(query: TaskQuery = {}) {
  return useQuery({ queryKey: taskKeys.list(query), queryFn: () => tasksApi.list(query) });
}

export function useTask(id: string) {
  return useQuery({ queryKey: taskKeys.detail(id), queryFn: () => tasksApi.get(id), enabled: id.length > 0 });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => tasksApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/** Optimistic status change — the board feels instant, and rolls back on failure. */
export function useUpdateTaskStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: Task['status']) => tasksApi.update(id, { status }),

    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) });
      const previous = queryClient.getQueryData<Task>(taskKeys.detail(id));
      if (previous) queryClient.setQueryData<Task>(taskKeys.detail(id), { ...previous, status });
      return { previous };
    },

    onError: (_e, _s, context) => {
      if (context?.previous) queryClient.setQueryData(taskKeys.detail(id), context.previous);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
```

```tsx
// src/features/tasks/components/TaskBoard.tsx
import { useTasks, useUpdateTaskStatus } from '../hooks/useTasks';
import type { Task, TaskStatus } from '../types';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Skeleton } from '@/shared/ui/Skeleton';
import { userMessage } from '@/shared/lib/errorMessages';

const COLUMNS: TaskStatus[] = ['todo', 'doing', 'done'];

export function TaskBoard({ search }: { search: string }) {
  const { data, isPending, isError, error, refetch } = useTasks({ search: search || undefined });

  if (isPending) return <Skeleton rows={6} />;
  if (isError) return <ErrorPanel title="Could not load tasks" detail={userMessage(error)} onRetry={() => refetch()} />;
  if (!data || data.items.length === 0) {
    return <EmptyState title={search ? `No tasks matching "${search}"` : 'No tasks yet'}
                       hint={search ? 'Try a different search.' : 'Create your first task.'} />;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
      {COLUMNS.map((status) => (
        <Column key={status} status={status} tasks={data.items.filter((task) => task.status === status)} />
      ))}
    </div>
  );
}

function Column({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  return (
    <section aria-labelledby={`col-${status}`}>
      <h2 id={`col-${status}`}>{status} ({tasks.length})</h2>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.5rem' }}>
        {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </ul>
    </section>
  );
}

function TaskCard({ task }: { task: Task }) {
  const updateStatus = useUpdateTaskStatus(task.id);
  const next: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' };

  return (
    <li style={{ border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
      <strong>{task.title}</strong>
      {task.description && <p style={{ margin: '0.25rem 0 0', color: '#555' }}>{task.description}</p>}
      <button
        onClick={() => updateStatus.mutate(next[task.status])}
        disabled={updateStatus.isPending}
        aria-label={`Move ${task.title} to ${next[task.status]}`}
      >
        Move to {next[task.status]}
      </button>
      {updateStatus.isError && <p role="alert">{userMessage(updateStatus.error)}</p>}
    </li>
  );
}
```

```ts
// src/features/tasks/index.ts — the public API of the feature
export { TaskBoard } from './components/TaskBoard';
export { TaskForm } from './components/TaskForm';
export { TaskDetail } from './components/TaskDetail';
export { useTasks, useTask, useCreateTask, useDeleteTask, taskKeys } from './hooks/useTasks';
export type { Task, TaskInput, TaskStatus, TaskQuery } from './types';
// Deliberately NOT exported: tasksApi, TaskCard, Column — internals
```

---

## 7. Tests that matter

```ts
// src/shared/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));   // an unmocked request is a test bug
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
```

```tsx
// src/shared/test/renderWithProviders.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement, ReactNode } from 'react';
import { AuthProvider } from '@/features/auth';

export function renderWithProviders(ui: ReactElement, options: RenderOptions & { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[options.route ?? '/']}>{children}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}
```

```tsx
// src/features/tasks/components/TaskBoard.test.tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/shared/test/server';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { TaskBoard } from './TaskBoard';

describe('TaskBoard', () => {
  it('shows a skeleton, then the tasks', async () => {
    renderWithProviders(<TaskBoard search="" />);
    expect(screen.getByRole('status')).toBeInTheDocument();          // pending state
    expect(await screen.findByText('Write the docs')).toBeInTheDocument();
  });

  it('shows a friendly error and a working retry when the API fails', async () => {
    server.use(http.get('*/tasks', () => HttpResponse.json({ message: 'boom' }, { status: 500 })));
    const user = userEvent.setup();
    renderWithProviders(<TaskBoard search="" />);

    expect(await screen.findByText(/something went wrong on our side/i)).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();      // never leak internals

    server.restoreHandlers();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Write the docs')).toBeInTheDocument();
  });

  it('explains an empty result differently from an empty board', async () => {
    server.use(http.get('*/tasks', () => HttpResponse.json({ items: [], total: 0 })));
    renderWithProviders(<TaskBoard search="zzz" />);
    expect(await screen.findByText(/no tasks matching "zzz"/i)).toBeInTheDocument();
  });

  it('updates the status optimistically', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskBoard search="" />);
    await user.click(await screen.findByRole('button', { name: /move write the docs to doing/i }));
    await waitFor(() => expect(screen.getByText('doing (1)')).toBeInTheDocument());
  });
});
```

```ts
// src/features/tasks/api/tasksApi.test.ts — logic tests, no DOM
import { describe, expect, it } from 'vitest';
import { tasksApi } from './tasksApi';

describe('tasksApi.list', () => {
  it('encodes the search term', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await tasksApi.list({ search: 'a & b' });
    expect(String(spy.mock.calls[0][0])).toContain('q=a+%26+b');     // not "q=a & b"
  });
});
```

**What the suite must cover**

| Layer | Tests |
| --- | --- |
| Pure logic (`lib/`, `permissions.ts`) | Fast, no DOM: every branch, every edge case |
| API modules | URL building, error mapping — mock `fetch` or MSW |
| Components | The four states, interactions, accessible names |
| Hooks | Mutations, optimistic rollback, cache invalidation |
| Route guards | Anonymous → login with `returnTo`; wrong role → explanation |

---

## 8. CI, budgets and deployment

```yaml
# .github/workflows/ci.yml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run coverage
      - run: npm run build -- --mode ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
      - run: npm run size
      - run: |
          if grep -rEiq "sk-[a-z0-9]{20}|BEGIN.*PRIVATE KEY" dist/assets/*.js; then
            echo "::error::Secret-looking string found in the bundle"; exit 1; fi
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist }
```

```json
// .size-limit.json
[{ "path": "dist/assets/index-*.js", "limit": "180 kB", "gzip": true },
 { "path": "dist/assets/*.css", "limit": "60 kB", "gzip": true }]
```

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]                      # the SPA rule — without this, deep links 404
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache"
    Content-Security-Policy = "default-src 'self'; script-src 'self'; connect-src 'self' https://api.taskboard.example.com; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

Then run the checklist from Part 15 file 08 — including `npm run preview` and a deep-link
refresh — and copy `DEPLOY_CHECKLIST.md` into the repo.

---

## 9. The README (write this, it is graded)

```markdown
# Taskboard

A production-shaped React 19 + TypeScript task board.

## Run it
    npm ci
    npm run dev            # http://localhost:5173 (proxies /api → localhost:8000)
    npm test               # vitest
    npm run build && npm run preview

## Architecture
- `src/app/` — composition root: router, providers, layout. The only place that imports everything.
- `src/features/<name>/` — one folder per capability (`api/`, `hooks/`, `components/`, `types.ts`, `index.ts`).
  Cross-feature imports go through `index.ts`.
- `src/shared/` — business-agnostic code. May not import from `features/` (enforced by lint).
- Components never call `fetch`; `api/` never imports React; `hooks/` is the seam.

## Decisions worth knowing
- Server state lives in TanStack Query, client state in Zustand. Nothing server-derived is
  duplicated into `useState`.
- The access token is kept in memory; the refresh token is an HttpOnly cookie. Rationale and
  trade-offs: notes Part 14, file 05.
- Every env value is read in `src/config.ts` and validated at startup.
- `sourcemap: 'hidden'` — maps are uploaded to the error tracker and excluded from the deploy.
- Bundle budget: 180 kB gzip for the entry chunk, enforced by size-limit in CI.

## Testing
Logic (`lib/`, `permissions`) is unit-tested without a DOM. Components are tested through
their accessible roles. The network is mocked with MSW; an unhandled request fails the test.
```

---

## 10. Build order (each step leaves the app working)

```text
 1. Scaffold, aliases, env files, config.ts, lint boundary rules
 2. shared/lib: apiError, http, logger, errorMessages  + tests
 3. shared/ui: Button, Input, Spinner, Skeleton, ErrorPanel, EmptyState, Toast  + tests
 4. ErrorBoundary + AppLayout + router with a public home page
 5. features/auth: types, tokenStore, api, AuthProvider, permissions  + tests
 6. Login + register pages, RequireAuth, RequireRole, UserMenu
 7. features/tasks: types, api, hooks  + api tests
 8. TaskBoard (four states) + TaskForm (Zod) + create page
 9. Task detail, edit, delete with confirmation, optimistic status
10. features/users admin page behind 'admin:view'
11. Search in the URL, filters, pagination
12. Settings + theme (Zustand + localStorage)
13. Logging wired everywhere, web-vitals, release/commit injection
14. Performance pass: lazy routes, image dimensions, budget
15. CI: typecheck, lint, coverage, build, size-limit, secret grep
16. Deploy, SPA rewrites, cache headers, CSP in Report-Only
17. README, DEPLOY_CHECKLIST.md, and a walkthrough you can narrate in 5 minutes
```

---

## 11. The interview walkthrough (prepare this out loud)

You will be asked "walk me through your project". Have these answers ready:

1. **"Why this folder structure?"** — Locality and deletability. A feature is a folder;
   cross-feature imports go through a barrel, so refactors do not ripple. `shared/` may not
   import `features/`, enforced by lint.
2. **"Where is state?"** — Server state in TanStack Query (cache, retries, invalidation),
   client state in Zustand (theme, UI), local state in components (drafts). Nothing derived is
   stored.
3. **"How does auth work?"** — Access token in memory, refresh in an `HttpOnly` cookie,
   `/auth/me` on boot to verify, one deduped refresh on 401, guards with `returnTo`, and a
   typed permission map. Client guards are UX; the API re-checks everything.
4. **"How do you handle errors?"** — Boundaries at app/route/widget level, a typed `ApiError`
   from one `request()` wrapper, one `userMessage()` mapping, four UI states everywhere, and
   reporting with release, commit and breadcrumbs.
5. **"How do you know it is fast?"** — Lab (Lighthouse median of 5) plus field (web-vitals to
   our own endpoint). Budgets fail CI. The biggest wins were code splitting and images, not
   memoisation.
6. **"What would you do differently?"** — Have an honest answer. Good ones: "start with MSW so
   tests never needed a live API", "put the search term in the URL from day one", "add the
   error boundary before the first crash, not after".

🏭 **A project you can explain beats a project with more features.** Interviewers are testing
whether you made decisions, not whether you installed libraries.

---

## 12. Exercises

### Beginner
1. Add a `dueDate` picker to the form with validation ("cannot be in the past").
2. Add keyboard shortcuts: `n` for new task, `/` to focus search.

### Intermediate
1. Add pagination or infinite scroll, keeping the page in the URL and in the query key.
2. Add an offline banner using `navigator.onLine` + the `online`/`offline` events, and pause
   mutations while offline.

### Challenge
1. Add real-time updates: a WebSocket (or SSE) that pushes task changes, applied to the query
   cache without a full refetch.
2. Add end-to-end tests with Playwright covering login → create → edit → delete, and run them
   in CI against a preview deployment.

---

## 13. Solutions

### Beginner
1. `dueDate: z.string().nullable().refine((v) => !v || new Date(v) >= startOfToday(), 'Due date cannot be in the past')`
   — and mirror the rule server-side, because the client is not a security boundary.
2. ```tsx
   useEffect(() => {
     const onKey = (e: KeyboardEvent) => {
       const target = e.target as HTMLElement;
       if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;   // don't hijack typing
       if (e.key === 'n') navigate('/tasks/new');
       if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
     };
     window.addEventListener('keydown', onKey);
     return () => window.removeEventListener('keydown', onKey);
   }, [navigate]);
   ```

### Intermediate
1. `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor`, plus
   `useSearchParams` so page 3 is a shareable URL.
2. ```tsx
   const online = useOnlineStatus();
   if (!online) return <Banner>Offline — changes are paused until you reconnect.</Banner>;
   ```
   With `useMutation({ ... })` gated on `online`, or better: queue mutations and flush on
   `online`, which is what TanStack Query's `mutationQueue` patterns do.

### Challenge
1. On a `task:updated` event, `queryClient.setQueryData(taskKeys.detail(id), (old) => old ? { ...old, ...patch } : old)`
   and invalidate the list. Apply the patch only if its `updatedAt` is newer than the cached
   one, or an out-of-order message will resurrect stale data.
2. Playwright gives you the one thing unit tests cannot: proof that the deployed app works.
   Run it against the preview URL in CI, with a seeded database and a deterministic user.

---

## 14. What you proved you can do

- [ ] Structure a real application with enforced architectural boundaries.
- [ ] Build a typed, single-point HTTP layer with auth, refresh and error mapping.
- [ ] Separate server state, client state and local state correctly.
- [ ] Implement authentication with refresh, guards, permissions and cross-tab logout.
- [ ] Validate forms with one schema that also produces the types.
- [ ] Handle every failure mode: render, async, empty, offline.
- [ ] Log with enough context to debug someone else's session.
- [ ] Measure performance in the lab and the field, and enforce a budget.
- [ ] Test at four levels, with a mocked network.
- [ ] Configure, build, deploy and verify an SPA — and roll it back.
- [ ] Explain every one of those decisions out loud.

**That is the finish line of these notes.** Everything after this is depth, not breadth:
frameworks (Next.js, React Router framework mode), server rendering, end-to-end testing, and
the internals of the tools you now use deliberately.

---

**What's next →** [`../18-interview/react-interview.md`](../18-interview/react-interview.md)
opens Part 18: turning everything you built into answers. React questions with a short answer
and a deep one, then JavaScript, TypeScript, and the "why is my component doing this"
debugging scenarios that separate candidates who have shipped from candidates who have read.
