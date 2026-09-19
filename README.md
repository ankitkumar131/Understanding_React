# Understanding React — a complete React + TypeScript course, with the code it measured

This repository has two halves that belong together:

| | What it is |
| --- | --- |
| **[`react-notes/`](./react-notes/README.md)** | The course: **18 parts**, **151 markdown files**, 9 cheat sheets and an error-decoding reference — written teacher-style, from "what is a component?" to deploying, monitoring and interview preparation. |
| **[`react-lab/`](./react-lab/README.md)** | The working app every number in the course comes from: six finished projects with tests, a performance measurement harness, and the raw transcripts (`react-lab/evidence/`). |

The rule the course follows, and the lab enforces: **explain everything, then prove it.** Wherever a chapter says "this is faster", "this fails", or "the compiler changes this", there is a command in `react-lab/` that produced the number.

---

## Start here

```bash
# 1. The notes — open and read in order
open react-notes/README.md            # contents, conventions, the 16 questions every chapter answers
open react-notes/react-roadmap.md     # the 21-stage path, with checkpoints

# 2. The code — a real app, running in about a minute
cd react-lab
npm install
npm run dev                           # http://localhost:5199 (the Taskboard capstone, no backend needed)
npm test -- --run                     # 12 test files, 62 tests
npm run verify                        # the gate CI runs: lint -> typecheck -> test -> build
```

Nothing in the notes requires a paid service, a backend, or a specific editor. Node 22, npm and a browser are enough.

Both halves are checked automatically — `.github/workflows/ci.yml` runs the lab's gate
(`npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build`) and
`node scripts/check-notes.mjs`, which fails if any relative link between the 151 notes files is
broken or if a chapter's "File i of j" banner disagrees with its directory. Run it yourself with:

```bash
node scripts/check-notes.mjs      # ✓ notes OK — 151 files, 227 relative links, 139 banners
```

---

## What the course covers

| Part | Topic | Files |
| --- | --- | --- |
| 1 | Prerequisites (HTML, CSS, JavaScript, modern JS, async) | 11 |
| 2 | TypeScript for React | 11 |
| 3 | React fundamentals (JSX, TSX, components, props, lists, events) | 12 |
| 4 | State and hooks (`useState` … `useReducer`, rules of hooks) | 10 |
| 5 | React concepts (composition, lifting state, controlled inputs) | 9 |
| 6 | Routing (React Router v8, three modes) | 8 |
| 7 | API integration (`fetch`, errors, caching, query libraries) | 11 |
| 8 | Forms and validation (React Hook Form, Zod) | 5 |
| 9 | State management (Context, Redux Toolkit, Zustand, server state) | 6 |
| 10 | Advanced React (rendering, memoisation, Suspense, error boundaries, concurrency) | 9 |
| 11 | Modern React 19 (actions, `useActionState`, `useOptimistic`, `use`, compiler) | 8 |
| 12 | Styling (CSS, CSS Modules, SCSS, Tailwind, component patterns) | 5 |
| 13 | Testing (Vitest, Testing Library, MSW) | 5 |
| 14 | Authentication (sessions, JWTs, guards, roles, token storage) | 6 |
| 15 | Production (env vars, architecture, folders, errors, logging, security, performance, deploy checklist) | 8 |
| 16 | Build tools (Vite, configuration, build output, environment modes) | 4 |
| 17 | Projects (counter → todo → weather → CRUD → auth → capstone → performance lab) | 7 |
| 18 | Interview preparation (React, JavaScript, TypeScript, scenarios) | 4 |

Plus: [`react-notes/cheatsheets/`](./react-notes/cheatsheets/) (9 one-page references) and [`react-notes/common-errors.md`](./react-notes/common-errors.md).

---

## The projects in `react-lab/`

| Project | Chapter | Tests |
| --- | --- | --- |
| Counter | 17.1 | 7 |
| Todo app | 17.2 | 6 |
| Weather app (MSW, cancellation) | 17.3 | 7 |
| Library CRUD (router + TanStack Query) | 17.4 | 8 |
| Authentication app | 17.5 | 12 |
| **Taskboard capstone** (optimistic updates, error boundary, lazy route, dev mock API) | 17.6 | 8 |
| Performance lab (compiler vs `memo` vs windowing) | 17.7 | 2 |

Every project is implemented, type-checked, tested and built in this repository — see [`react-lab/evidence/part18-final.txt`](./react-lab/evidence/part18-final.txt) for the last full verification.

---

## Conventions used throughout the notes

- **16 questions per concept**: what, why, what problem, how, syntax, usage, runtime behaviour, line-by-line, simple example, real-world example, when to use, when not to, mistakes, best practices, practice task, solution.
- **Runnable examples**: file name → complete code → explanation → install → run → expected result → practice → solution.
- **Errors decoded as**: error → meaning → cause → debug → fix → correct code.
- **Versions are pinned and stated**: React 19, Vite 8, React Router 8, TypeScript 5, Vitest 5 — with version-sensitive behaviour cross-checked against the official docs, and deprecated approaches (Create React App, class lifecycle methods, `defaultProps`, `React.FC`, index keys) explained as history rather than recommended.

---

## Licence and use

Use these notes however helps you learn: read them in order, jump to a chapter, or use a cheat sheet the night before an interview. The lab is a normal project — break it, extend it, delete the mock API and point it at a real backend.
