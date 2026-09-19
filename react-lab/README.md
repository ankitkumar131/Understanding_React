# React Lab — the runnable code behind *Understanding React*

This is the project that every measurement in [`../react-notes/`](../react-notes/) comes from. It is a normal Vite + React 19 + TypeScript app, plus six finished project implementations, their tests, a performance measurement harness, and the raw transcripts of each experiment (`evidence/`).

```bash
npm install        # install dependencies
npm run dev        # http://localhost:5199 — the Taskboard capstone (no backend needed)
npm test -- --run  # 12 test files, 62 tests (npm run test:run is the same thing)
npm run build      # tsc -b && vite build (type-check + production build)
npm run preview    # serve dist/ and check the lazy chunk loads on demand
npm run verify     # THE GATE: lint → typecheck → test → build (what CI runs)
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5199 with HMR |
| `npm test` | Vitest in watch mode (`npm run test:run` for a single pass) |
| `npm run typecheck` | `tsc -b` — the step `vite build` does **not** perform |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run lint` | oxlint (0 warnings, 0 errors — see §5) |
| `npm run verify` | lint → typecheck → test → build, in that order |

Verified in this repository at the time of writing: **lint 0 warnings**, `tsc -b` clean, **12 test files / 62 tests passing**, production build green in ~310 ms (lazy `ReportsPage` chunk 2.09 kB, vendor 345.82 kB / 107.76 kB gzip).

---

## 1. What runs by default

`src/main.tsx` mounts the **capstone app** (`src/projects/taskboard/`) inside `<StrictMode>`, with a dev-only fake API installed first:

```tsx
installMockApi();                                   // patches window.fetch for /api/tasks (DEV only)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

So `npm run dev` gives you a working task board — create, move (optimistically, with rollback), delete, a lazily loaded Reports page, sign-in state and an error boundary — **without any backend**. `src/dev/mock-api.ts` is guarded by `import.meta.env.DEV`, so it cannot ship in a production build.

---

## 2. The six projects (Part 17 of the notes)

| Book chapter | Code | Tests | What it demonstrates |
| --- | --- | --- | --- |
| `17-projects/01-counter.md` | `src/projects/counter/Counter.tsx` | 7 | props with defaults, functional updates, bounds, `aria-live` |
| `17-projects/02-todo-app.md` | `src/projects/todo/` | 6 | controlled form, immutable list updates, filters, `localStorage` with defensive parsing |
| `17-projects/03-weather-app.md` | `src/projects/weather/` | 7 | four-state union, typed API layer, `AbortController`, stale-response cancellation, MSW |
| `17-projects/04-crud-app.md` | `src/projects/library/` | 8 | routing as data, TanStack Query keys, invalidation, shared create/edit form |
| `17-projects/05-authentication-app.md` | `src/projects/auth-app/` + `src/auth/` | 7 + 5 | session store with expiry, `useActionState`, nested guards, role gating, 403 handling |
| `17-projects/06-production-react-app.md` | `src/projects/taskboard/` | 8 | feature folders, optimistic updates with rollback, error boundary, lazy route, dev mock API |
| `17-projects/07-performance-lab.md` | `src/perf/renders.test.tsx` | 2 | mount vs update cost, React Compiler vs `"use no memo"` vs `memo`, windowing |

Run one project's tests at a time:

```bash
npx vitest run src/projects/counter
npx vitest run src/projects/taskboard
npx vitest run src/perf/renders --reporter=verbose   # prints the measurement table
```

---

## 3. Other code, and which chapter it belongs to

| Path | Purpose |
| --- | --- |
| `src/part11/` | React 19 probes: actions, `useActionState`, `useOptimistic`, the React Compiler case |
| `src/part12/` | styling demo (CSS Modules + Tailwind + tokens) reading `import.meta.env` |
| `src/lib/env.ts` | the single validated environment reader (`zod`) used by the app |
| `src/lib/renderTrace.ts` | the render-counting helper used by the performance chapters |
| `src/auth/` | session store, `AuthProvider`, `LoginPage`, `ProtectedRoute`, context tests |
| `src/components/` | the testing chapter's components (`Counter`, `ProductList`, `SearchBox`) and their tests |
| `src/hooks/` | `useDebouncedValue` (+ test) |
| `src/test/` | Vitest setup, MSW server and default handlers |
| `src/dev/` | measurement probes and the dev-only fake API (never shipped: `import.meta.env.DEV` guards) |
| `src/styles/` | global CSS, SCSS tokens, a CSS-module example |
| `evidence/` | raw transcripts of every measurement quoted in the notes (see §5) |

---

## 4. Configuration worth reading

```ts
// vite.config.ts (excerpt) — every line is explained in Part 16 of the notes
export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss()],   // React Compiler 1.0 enabled
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    host: true,                                          // listen on 0.0.0.0 (containers, previews)
    port: 5199,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8098', changeOrigin: true } },  // no CORS in dev
  },
  build: { rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom', 'react-router'] } } } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { VITE_API_URL: '/api', VITE_APP_NAME: 'React Lab (test)' },
  },
});
```

Environment files: `.env` (development), `.env.production`, `.env.staging` — used to measure the precedence order and the inlining behaviour in Part 16, file 04.

> ⚠️ `.env` intentionally contains `DB_PASSWORD=super-secret-do-not-ship`. It is a **fixture**, not a credential: Part 15/16 use it to prove that only `VITE_`-prefixed variables reach the bundle. Never commit a real secret.

---

## 5. Quality gates, and the two suppressions in this repo

`npm run verify` is the single command that means "this is correct": **lint → typecheck → test → build**.
It is what CI runs (`.github/workflows/ci.yml` at the repository root). CI also audits the book in
`../react-notes/`: `../scripts/check-notes.mjs` (links and chapter banners) and
`../scripts/check-snippets.mjs`, which type-checks the named imports of every code block against these
very `node_modules` — the audit whose findings fixed a stale `react-router-dom` import, a `src/dr/` typo
and three components the notes imported but never showed. Its report is kept as
`evidence/snippets-audit.txt`.

`npm run lint` reports **0 warnings and 0 errors**. Getting to zero was a decision, not a muffling —
each deviation is documented where it lives:

| Deviation | Why | Where it is declared |
| --- | --- | --- |
| `react/only-export-components`, `react/globals`, `react/immutability`, `react/rules-of-hooks` off in `src/dev/**` and `src/perf/**` | those files are **measurement probes**: counting renders by reassigning a module-level counter, or demonstrating in-place mutation, is the entire point of the code | `.oxlintrc.json` → `overrides` |
| `react/only-export-components` off in `src/part11/**` | chapter demos that export a helper next to the component they demonstrate | `.oxlintrc.json` → `overrides` |
| `react/set-state-in-effect` on the session restore in `src/auth/AuthContext.tsx` | the value lives in `localStorage`, so reading it during render would break server rendering; the `status: 'loading'` state is what makes the extra render safe (Part 14, file 01) | inline `oxlint-disable-next-line` **with a reason** |
| `react/only-export-components` on the route table in `src/projects/taskboard/App.tsx` | the shell and its routes are read together, and Part 17 file 06 quotes this file as a whole | inline `oxlint-disable-next-line` **with a reason** |

The teaching point: a lint rule may be relaxed, but the reason must sit next to the code — otherwise
the next person cannot tell a deliberate exception from an oversight.

---

## 6. Evidence

`evidence/*.txt` are the raw command outputs behind the numbers in the notes — for example:

```text
part16-vite.txt          Vite 8 dev server, dependency pre-bundling, proxy, alias, lazy chunk, build output
part16-env-modes.txt     MODE=test / DEV=true / PROD=false, test.env beating .env
part17-projects.txt      hydration-warning investigation + the final long-list measurement runs
part18-final.txt         the final verification: tsc -b, 62 tests, build 330 ms
snippets-audit.txt       the book's own code blocks: 2 313 blocks, 704 imports, 107 named imports type-checked
```

Regenerate any of them by running the command named at the top of the file.

---

## 7. Notes on the code

- **Type-checking is separate from bundling.** `vite build` does not type-check; `npm run build` runs `tsc -b` first. A deliberate type error will still produce a bundle — that is measured in `evidence/part16-vite.txt`.
- **`erasableSyntaxOnly` is on.** No `enum`, no `namespace`, and no constructor parameter properties — error classes use explicit `readonly` fields (this bit the lab twice; see `TS1294` in `react-notes/common-errors.md`).
- **React Compiler is enabled**, so the "naive" components are memoised by the build. The performance lab uses the `'use no memo'` directive to create the comparison.
- **Tests reset state.** `src/test/setup.ts` clears `localStorage` and resets MSW handlers between tests; query clients in tests use `retry: false` because real backoff turns a deterministic failure into a timeout.

---

## 8. Related files

- The book: [`../react-notes/README.md`](../react-notes/README.md) — start with the roadmap: [`../react-notes/react-roadmap.md`](../react-notes/react-roadmap.md).
- Error decoding for the things you are about to hit: [`../react-notes/common-errors.md`](../react-notes/common-errors.md).
- One-page references: [`../react-notes/cheatsheets/`](../react-notes/cheatsheets/).
