# 03 — Folder Structure: Every Folder, Every Convention

> **Part 15 · Production · File 3 of 8**

Why this file exists: file 02 chose an architecture; this file makes it concrete. Every
folder below is justified by a rule, and every rule exists to answer a question someone
will actually ask: "where does this new file go?" If you can answer that in five seconds
for every kind of file, the structure is doing its job. This is the structure used by
Project 6 in Part 17, so you can read the two together.

---

## 1. The whole tree, with reasons

```text
taskboard/
├── public/                     # copied to dist/ untouched, never hashed
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── app/                    # wiring: the only place that knows everything
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── routes/             # route → page mapping, lazy-loaded
│   │       ├── index.tsx
│   │       ├── tasks.tsx
│   │       └── settings.tsx
│   ├── features/               # business capabilities, one folder each
│   │   ├── auth/
│   │   ├── tasks/
│   │   └── settings/
│   ├── shared/                 # business-agnostic code
│   │   ├── ui/                 # Button, Input, Modal, Spinner, EmptyState
│   │   ├── lib/                # httpClient, date/format, storage
│   │   ├── hooks/              # useDebounce, useMediaQuery, useLocalStorage
│   │   └── test/               # test utilities (renderWithProviders, msw handlers)
│   ├── config.ts               # the ONLY file reading import.meta.env
│   └── vite-env.d.ts           # env types
├── .env / .env.development / .env.production
├── .gitignore
├── index.html                  # the single HTML entry — Vite's root
├── package.json
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts            # (or a `test` key inside vite.config.ts)
└── README.md
```

**Line by line, for the folders that cause questions**

- **`public/`** — files served at the site root *as-is*. Use it for things that must have
  a fixed URL (`favicon.ico`, `robots.txt`, a PDF you link to). Never `import` from here:
  anything you `import` belongs in `src/` so Vite can hash and optimize it.
- **`src/app/`** — composition root. If you deleted every feature folder, `app/` is what
  would fail to compile. That is the correct direction of dependency.
- **`src/app/routes/`** — one file per route group, each `lazy()`-loaded (Part 10). Route
  files are thin: they pick a page component and its loader/guard, nothing more.
- **`src/features/*/`** — see file 02. Each has `components/ hooks/ api/ types.ts index.ts`.
- **`src/shared/ui/`** — presentational primitives. Test them once, hard; everything else
  inherits their correctness.
- **`src/shared/lib/`** — plain TypeScript modules. `httpClient.ts` (interceptors, auth
  header, error normalisation) is the most important file in the app after `router.tsx`.
- **`src/shared/test/`** — test helpers that are *not* shipped. Keeping them in `src/`
  means they can import app types; keeping them out of `features/` means no feature owns
  the test setup.
- **`index.html` at the root** — this surprises everyone coming from CRA. Vite treats it as
  the entry point of the dependency graph: `main.tsx` is discovered *from* the HTML, not
  the other way round.

⚠️ **`index.html` must not be moved.** If it is, Vite serves a directory listing at
`/` instead of your app, and the error message says nothing about `index.html`.

---

## 2. Naming conventions (the boring part that prevents arguments)

| Thing | Convention | Example | Why |
| --- | --- | --- | --- |
| Component file | `PascalCase.tsx` | `TaskList.tsx` | Matches the component name in the file |
| Hook file | `camelCase.ts`, starts with `use` | `useTasks.ts` | Matches the hook name; lint rules can find hooks by filename |
| Non-component module | `camelCase.ts` | `httpClient.ts` | Distinguishes from components at a glance |
| Types-only file | `types.ts` (feature) | `features/tasks/types.ts` | Predictable location |
| Test file | co-located, `*.test.tsx` | `TaskList.test.tsx` | Test next to code = you find both, and you notice when one is missing |
| Folder | `kebab-case` or `camelCase`, one style | `features/auth/` | Consistency beats preference |
| Constant | `SCREAMING_SNAKE` only for true constants | `const MAX_TITLE = 120` | |

🏭 **Co-located tests, not a top-level `tests/` folder.** A separate `tests/` tree drifts:
files get deleted from `src/` and their tests survive, testing ghosts. Co-location makes
"this component has no test" visible in a file listing.

⚠️ **Pick one folder case and enforce it.** Mixed `Features/` and `features/` is a real
bug on case-insensitive filesystems (macOS, Windows): `import './Features/auth'` compiles
on your laptop and fails in CI on Linux with `Cannot find module`.

---

## 3. Inside a feature — the full contract

```text
src/features/tasks/
├── components/
│   ├── TaskList.tsx            # presentation only
│   ├── TaskItem.tsx
│   ├── TaskForm.tsx
│   └── TaskList.test.tsx
├── hooks/
│   ├── useTasks.ts             # TanStack Query: list
│   ├── useTask.ts              # single task
│   └── useTaskMutations.ts     # create/update/delete + invalidation
├── api/
│   ├── tasksApi.ts             # fetch calls + request/response types
│   └── tasksApi.test.ts
├── types.ts                    # Task, TaskStatus, CreateTaskInput
└── index.ts                    # public exports
```

**The contract**

1. `components/` imports from `hooks/`, `types.ts`, and `shared/`. **Never from `api/`.**
2. `hooks/` imports from `api/` and `types.ts`. This is where loading/error/data lives.
3. `api/` imports from `shared/lib/httpClient` and `types.ts`. **No React imports at all.**
4. Nothing outside the feature imports past `index.ts`.

```ts
// src/features/tasks/types.ts
export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;      // ISO 8601 — the API's wire format, parsed at the edge
  assigneeId: string | null;
}

export type CreateTaskInput = Pick<Task, 'title' | 'status'> & { dueDate?: string };
```

💡 **Keep the API's shape in `types.ts` and translate at the boundary.** If the API returns
`due_date` in snake_case, convert it in `tasksApi.ts` — so the rest of the app only ever
sees `dueDate`. One translation point, not fifty.

---

## 4. Where things go when you are unsure

| You are adding… | Put it in | Test |
| --- | --- | --- |
| A `<Spinner>` | `shared/ui/` | Does it mention a domain word? If yes, it is not shared |
| `formatRelativeDate` | `shared/lib/format.ts` | No business knowledge → shared |
| `useTasks` | `features/tasks/hooks/` | Knows the domain → feature |
| A new page | `features/<domain>/components/…Page.tsx` + a route in `app/routes/` | Route file stays 10 lines |
| A fetch call | `features/<domain>/api/` | Components never fetch |
| An axios/fetch wrapper | `shared/lib/httpClient.ts` | One place for auth headers and errors |
| An env var | `.env*` + `src/config.ts` | `grep import.meta.env src` → 1 file |
| A test helper | `shared/test/` | Used by 2+ features? → shared |
| A static asset you `import` | `src/features/…/assets/` or `src/shared/assets/` | Imported → hashed by Vite |
| A favicon | `public/` | Fixed URL, never imported |
| A one-off script | `scripts/` at the root, outside `src/` | Never bundled |

⚠️ **When in doubt: start it in the feature.** Promoting to `shared/` later is a two-line
change. Demoting from `shared/` means chasing imports across the codebase. Feature-local
first, shared when a second consumer appears — the "rule of two".

---

## 5. The README that explains your structure

New developers ask the same five questions. Answer them in the repo:

```markdown
## Where does code go?

- **New UI for an existing feature** → `src/features/<feature>/components/`
- **New data call** → `src/features/<feature>/api/` (components never call fetch)
- **New hook that combines data + state** → `src/features/<feature>/hooks/`
- **Reusable button/input/modal** → `src/shared/ui/` (must know nothing about our domain)
- **New page** → a page component in the feature + a lazy route in `src/app/routes/`
- **Config value** → `.env.*` then `src/config.ts` (the only reader of `import.meta.env`)

## Rules

1. `shared/` may not import from `features/` or `app/` (enforced by lint).
2. Cross-feature imports go through the feature's `index.ts`.
3. Tests live next to the file they test.
```

That is the whole document. Anything longer than a screen does not get read.

---

## 6. Anti-patterns

```text
❌ src/utils/                       → a junk drawer with no owner
❌ src/common/ + src/helpers/       → four names for one idea
❌ src/components/ (80 files)       → the layer architecture creeping back
❌ src/pages/dashboard/…            → named after a screen, not a capability
❌ src/types/ + features/x/types.ts → two Users that drift
❌ tests/ at the root               → orphaned tests for deleted components
❌ src/constants.ts (600 lines)     → constants belong next to their feature
```

The unifying failure: **a folder whose name describes a file *kind* rather than a
responsibility** becomes a dumping ground, because nothing is ever obviously *not* a util.

---

## 7. Practice

### Beginner
1. Create the empty structure above (`mkdir -p`) in your playground and add a one-line
   `README.md` inside each folder stating its rule.
2. Move one component you already wrote into the correct folder and fix its imports.

### Intermediate
1. Write `shared/lib/httpClient.ts` with auth-header injection and error normalisation,
   and make one feature's `api/` use it.
2. Add a lazy route file in `app/routes/` for that feature.

### Challenge
1. Add the lint rule from file 02 that blocks `shared/ → features/` imports, and verify
   `npm run lint` fails on a deliberate violation.
2. Write the "Where does code go?" README for a real project of yours and have a colleague
   place five hypothetical files using only that document. Any disagreement is a gap in
   the document, not in the colleague.

---

## 8. Solutions

### Beginner
1. `mkdir -p src/{app/routes,features,shared/{ui,lib,hooks,test}}` — the folders are cheap;
   the READMEs are the deliverable, because a folder without a stated rule is a folder
   anyone will dump anything into.
2. The tell: after moving, `npx tsc --noEmit` lists every import you must fix. If it lists
   nothing, the component was not imported anywhere — which is its own finding.

### Intermediate
1. `httpClient.ts` exports one `request<T>()` that adds the `Authorization` header from the
   auth store, throws a typed `ApiError` on non-2xx, and returns `T` on success. Every
   `api/` file becomes a three-line function, and error handling exists in exactly one place.
2. `const TasksPage = lazy(() => import('@/features/tasks'));` inside
   `app/routes/tasks.tsx`, wrapped by the Suspense boundary from Part 10. The route file
   should stay under 20 lines — if it grows, logic is leaking into routing.

### Challenge
1. As in file 02, section 4. The CI proof matters more than the rule: an unenforced rule is
   documentation, and documentation rots.
2. This is the real test of a structure. Typical gaps found: nobody knows where a *new
   feature's first* file goes (answer: `features/<name>/index.ts` plus one component), and
   nobody knows whether a page belongs to a feature (answer: yes — pages are feature
   components; `app/routes/` only references them).

---

## 9. Summary

- **Every folder exists to answer "where does this go".** If it cannot, delete it.
- **`public/` is copied verbatim; `src/` is bundled and hashed.** `import` your assets;
  only `public/` for fixed URLs.
- **`index.html` is Vite's entry point** and lives at the project root.
- **`app/` composes, `features/` implement, `shared/` provides.** Dependencies point
  downward only.
- **Components render, hooks orchestrate, api talks.** Components never `fetch`; `api/`
  never imports React.
- **Co-locate tests**, name files predictably, and keep folder casing consistent — mixed
  case breaks on Linux CI.
- **Start feature-local, promote to `shared/` on the second consumer.**
- **Document the structure in one screen** and let a colleague test it.

---

**What's next →** [`04-error-handling.md`](./04-error-handling.md): what happens when
things break. Error boundaries for render crashes, typed API errors, user-facing messages
that do not leak internals, and the difference between an error you recover from and one
you report.
