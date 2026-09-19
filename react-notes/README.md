# React + TypeScript (TSX) — Complete Notes for Absolute Beginners

> **You know some HTML, CSS and JavaScript. You have never touched React.**
> By the end of these notes you will build, test, secure, optimize and deploy real
> React + TypeScript applications — and you will *understand* why every line exists.

This is not an API reference and it is not a cheat sheet. It is a **teacher-style
textbook + lab manual + project guide + interview workbook**. Every concept is
explained from zero, with runnable code, line-by-line explanations, common
mistakes, exercises and solutions.

---

## Table of contents

- [What these notes are](#what-these-notes-are)
- [Who they are for](#who-they-are-for)
- [How to use these notes](#how-to-use-these-notes)
- [The 16 questions every chapter answers](#the-16-questions-every-chapter-answers)
- [Conventions used in every chapter](#conventions-used-in-every-chapter)
- [The learning path (short version)](#the-learning-path-short-version)
- [Full table of contents](#full-table-of-contents)
- [Progress tracker](#progress-tracker)
- [Getting your computer ready](#getting-your-computer-ready)
- [Version assumptions](#version-assumptions)
- [Official references](#official-references)

---

## What these notes are

- **Deep, not shallow.** A concept is never "mentioned". It is explained: what it
  is, why it exists, what problem it solves, how it works internally, when to use
  it, when *not* to use it, what mistakes beginners make, and how to practice it.
- **Progressive.** Every file assumes only what earlier files taught. Nothing is
  used before it is explained.
- **Runnable.** Every piece of code comes with a file name, the full file
  contents, the command to run it, and the exact result you should see.
- **TypeScript-first.** Everything is `.tsx` / `.ts` with correct types. You will
  learn *why* a type is written that way, not just copy it.
- **Modern.** React 19, function components, hooks, Vite, React Router 7,
  TanStack Query, Redux Toolkit, Zustand, Vitest + React Testing Library.
  Deprecated approaches (Create React App, class components as the default,
  legacy lifecycle methods) are explained as history, never taught as current
  best practice.

---

## Who they are for

You should already be able to read a basic web page's source and write a small
script. Specifically:

| You should know | You do NOT need to know |
| --- | --- |
| Basic HTML tags and attributes | React, JSX, TSX |
| Basic CSS selectors and properties | Hooks, props, state, context |
| JavaScript variables, functions, arrays, objects | TypeScript |
| How to open a terminal and run a command | Build tools, bundlers, npm internals |

If any of the left column feels shaky, **Part 1 (Prerequisites)** and **Part 2
(TypeScript)** exist exactly for that. Read them anyway — they are written as
React preparation, not as generic language tutorials.

---

## How to use these notes

**1. Read in order, for the first pass.**
The parts are numbered and the numbered files inside each part are numbered too.
`03-react-fundamentals/06-tsx.md` assumes you read `05-jsx.md`. Skipping breaks
the "nothing unexplained" promise.

**2. Type the code out. Do not copy-paste it.**
Typing forces you to notice the syntax: where `{}` goes, where `return` is
needed, why `type` vs `interface` was chosen. Copy-pasting teaches your fingers
nothing.

**3. Break the code on purpose.**
Delete a dependency from a `useEffect` array, remove a `key`, pass a wrong prop
type. Read the error message. Reading errors fluently is 50% of being a
developer.

**4. Do the exercises before reading the solution.**
Each chapter ends with Beginner / Intermediate / Challenge exercises and a
solution section. Struggle for 10 minutes first — the struggle is where the
learning happens.

**5. Keep one real project running the whole time.**
Create the playground project below and add every example to it. Reading code
passively feels productive but does not build skill. Building does.

**6. Use the later parts as references.**
Parts 1–4 are read once, in order. Parts 5–17 you will re-open constantly.
Part 18 and the cheat sheets are for interview revision.

**7. Keep a `questions.md` file.**
Any time a sentence does not make sense, write the question down and keep going.
Answer it later; most "unclear" moments resolve themselves two chapters later.

---

## The 16 questions every chapter answers

For every important concept, these notes answer:

1. **What** is it? (plain-language definition, no jargon in the definition)
2. **Why** does it exist?
3. **What problem** does it solve?
4. **How** does it work — what really happens when the code runs?
5. What is the **syntax**?
6. **How do we use** it, step by step?
7. What **happens when it runs** — the mental model, not just the output?
8. **Line-by-line explanation** of the example code.
9. A **simple example** (a toy, so nothing distracts you).
10. A **real-world example** (what a job would actually ask you to build).
11. **When to use** it.
12. **When NOT to use** it.
13. **Common mistakes** beginners make (with the error message you will see).
14. **Best practices** (and why they are best practices).
15. A **practice task**.
16. The **solution** to that task.

---

## Conventions used in every chapter

Every code example in these notes follows the same shape so you are never lost:

````markdown
## Step 1 — Create the file

```text
src/components/UserCard.tsx
```

```tsx
// complete, runnable code — no "..." placeholders that hide important logic
```

**Line by line**
- `line 3` — what it does and why it is needed.
- `line 4` — what it does and why it is needed.

**Run it**

```bash
npm run dev
```

**Expected result**
Open <http://localhost:5173> and you will see …
````

Additional conventions:

| Convention | Meaning |
| --- | --- |
| ```text blocks | File trees, terminal output, error messages — not code to type |
| ```bash blocks | Commands to run in your terminal |
| ```tsx / ```ts blocks | Code to type into a file |
| ⚠️ | A mistake that will cause a real bug or a real error message |
| 💡 | A mental model or memory aid |
| 🔍 | "Look under the hood" — what React/JS actually does |
| 🏭 | Production/job-level advice |
| ✅ / ❌ | Correct vs incorrect example |
| `$` prefix | Never written in commands; run commands exactly as shown, without it |

All terminal commands are run **from the root of the project** (the folder that
contains `package.json`) unless the text says otherwise.

---

## The learning path (short version)

The full version with time estimates, project checkpoints and "what you can
build after this stage" lives in [`react-roadmap.md`](./react-roadmap.md).

```text
PART 1  Prerequisites        HTML, CSS, JavaScript the React way
   ↓
PART 2  TypeScript           types, interfaces, generics — enough to be dangerous
   ↓
PART 3  React Fundamentals   what React is, JSX, TSX, components, props
   ↓
PART 4  State & Hooks        useState, useEffect, and every core hook
   ↓
PART 5  React Concepts       lift state up, forms, refs, composition, context
   ↓
PART 6  Routing              SPA routing with React Router
   ↓
PART 7  API Integration      fetch, axios, CRUD, loading/error states
   ↓
PART 8  Forms & Validation   React Hook Form + Zod
   ↓
PART 9  State Management     Context, Redux Toolkit, Zustand, server state
   ↓
PART 10 Advanced React       re-rendering, memoization, lazy, Suspense, errors
   ↓
PART 11 Modern React         React 19, actions, useActionState, compiler
   ↓
PART 12 Styling              CSS, Modules, SCSS, Tailwind, trade-offs
   ↓
PART 13 Testing              Vitest + React Testing Library
   ↓
PART 14 Authentication       JWT, tokens, protected routes, roles
   ↓
PART 15 Production           env vars, architecture, logging, security
   ↓
PART 16 Build Tools          Vite in depth
   ↓
PART 17 Projects             6 projects, from counter to production app
   ↓
PART 18 Interview            React, JS, TS, scenario questions
```

---

## Full table of contents

Legend: ✅ written · 🚧 being written · ⬜ planned

### [Part 1 — Prerequisites](./01-prerequisites/)

| File | Topic | Status |
| --- | --- | --- |
| `01-html-basics.md` | HTML the React reader must know | ✅ |
| `02-css-basics.md` | CSS, the box model, class-based styling | ✅ |
| `03-javascript-basics.md` | Variables, types, objects, arrays, scope | ✅ |
| `04-modern-javascript.md` | Arrow functions, template literals, optional chaining | ✅ |
| `05-destructuring.md` | Object and array destructuring | ✅ |
| `06-spread-rest.md` | Spread and rest operators, immutability | ✅ |
| `07-array-methods.md` | `map`, `filter`, `find`, `reduce`, `forEach` | ✅ |
| `08-functions.md` | Functions, callbacks, closures, `this` | ✅ |
| `09-modules.md` | `import` / `export`, default vs named | ✅ |
| `10-promises.md` | Promises, the event loop, error handling | ✅ |
| `11-async-await.md` | `async`/`await`, `fetch`, parallel requests | ✅ |

### [Part 2 — TypeScript](./02-typescript/)

| File | Topic | Status |
| --- | --- | --- |
| `01-typescript-introduction.md` | What TS is, why, and how it runs | ✅ |
| `02-types.md` | Primitives, arrays, objects, tuples, inference | ✅ |
| `03-interfaces.md` | Interfaces, optional/readonly properties | ✅ |
| `04-type-aliases.md` | Type aliases vs interfaces | ✅ |
| `05-union-intersection.md` | Unions, intersections, literal types | ✅ |
| `06-functions.md` | Typed parameters, returns, overloads, callbacks | ✅ |
| `07-generics.md` | Generics, constraints, generic functions | ✅ |
| `08-enums.md` | Enums, `as const` objects, when not to use enums | ✅ |
| `09-narrowing.md` | `typeof`, `in`, discriminated unions, never | ✅ |
| `10-utility-types.md` | `Partial`, `Pick`, `Omit`, `Record`, `ReturnType` | ✅ |
| `11-typescript-react.md` | `.ts` vs `.tsx`, how TS works inside Vite | ✅ |

### [Part 3 — React Fundamentals](./03-react-fundamentals/)

| File | Topic | Status |
| --- | --- | --- |
| `01-what-is-react.md` | React, components, the DOM, Virtual DOM | ✅ |
| `02-why-react.md` | React vs vanilla JS vs Angular vs Vue | ✅ |
| `03-project-setup.md` | Node, Vite, `npm create vite`, every generated file | ✅ |
| `04-project-structure.md` | `src/`, `public/`, `index.html`, configs | ✅ |
| `05-jsx.md` | JSX from zero: expressions, attributes, fragments | ✅ |
| `06-tsx.md` | TypeScript + JSX, typing components | ✅ |
| `07-components.md` | Function components, composition, the component tree | ✅ |
| `08-props.md` | Passing data down, destructuring, defaults, `children` | ✅ |
| `09-rendering-data.md` | `{}` expressions, rendering values safely | ✅ |
| `10-conditional-rendering.md` | `if`, ternary, `&&`, early return, loading/error UI | ✅ |
| `11-rendering-lists.md` | `map`, keys, why index keys break | ✅ |
| `12-events.md` | `onClick`, `onChange`, `onSubmit`, typed events | ✅ |

### [Part 4 — State and Hooks](./04-state-and-hooks/)

| File | Topic | Status |
| --- | --- | --- |
| `01-state.md` | What state is, why variables fail, immutability | ✅ |
| `02-usestate.md` | `useState` in extreme detail | ✅ |
| `03-useeffect.md` | Effects, dependencies, cleanup, loops | ✅ |
| `04-useref.md` | DOM refs, mutable values, previous values | ✅ |
| `05-usecontext.md` | Context, prop drilling, providers | ✅ |
| `06-usereducer.md` | Reducers, actions, dispatch, complex state | ✅ |
| `07-usememo.md` | Expensive computation, referential equality | ✅ |
| `08-usecallback.md` | Stable function identities | ✅ |
| `09-custom-hooks.md` | Extracting logic, `use` naming rule | ✅ |
| `10-hooks-rules.md` | Rules of hooks and why they exist | ✅ |

### [Part 5 — React Concepts](./05-react-concepts/)

| File | Topic | Status |
| --- | --- | --- |
| `01-component-communication.md` | Parent→child, child→parent, siblings | ✅ |
| `02-lifting-state.md` | Lifting state up, single source of truth | ✅ |
| `03-controlled-components.md` | React as the source of truth for inputs | ✅ |
| `04-uncontrolled-components.md` | Letting the DOM own the value | ✅ |
| `05-forms.md` | Inputs, select, checkbox, radio, textarea, reset | ✅ |
| `06-refs.md` | Refs vs state, `forwardRef`, `useImperativeHandle` | ✅ |
| `07-composition.md` | Composition over inheritance, slots, layouts | ✅ |
| `08-children.md` | `React.ReactNode`, rendering children | ✅ |
| `09-context.md` | Deep dive: theme, auth, avoiding misuse | ✅ |

### [Part 6 — Routing](./06-routing/)

| File | Topic | Status |
| --- | --- | --- |
| `01-routing-basics.md` | URLs, SPAs, why a router is needed | ⬜ |
| `02-react-router.md` | Install, `BrowserRouter`, first routes | ⬜ |
| `03-routes.md` | `Routes`, `Route`, layouts, 404 | ⬜ |
| `04-route-parameters.md` | `:id`, `useParams`, typed params | ⬜ |
| `05-query-parameters.md` | `useSearchParams` | ⬜ |
| `06-nested-routes.md` | `Outlet`, nested layouts | ⬜ |
| `07-protected-routes.md` | Auth guards and redirects | ⬜ |
| `08-navigation.md` | `Link`, `NavLink`, `useNavigate`, lazy routes | ⬜ |

### [Part 7 — API Integration](./07-api-integration/)

| File | Topic | Status |
| --- | --- | --- |
| `01-http-basics.md` | HTTP, requests, responses, status codes | ⬜ |
| `02-fetch.md` | `fetch` with TypeScript | ⬜ |
| `03-axios.md` | Axios, instances, interceptors | ⬜ |
| `04-get-api.md` | GET requests, query strings, lists | ⬜ |
| `05-post-api.md` | POST, bodies, headers, validation errors | ⬜ |
| `06-put-api.md` | PUT, full replacement updates | ⬜ |
| `07-patch-api.md` | PATCH, partial updates | ⬜ |
| `08-delete-api.md` | DELETE, optimistic removal | ⬜ |
| `09-loading-states.md` | Loading UX, skeletons, races | ⬜ |
| `10-error-handling.md` | Try/catch, error types, retries, cancellation | ⬜ |
| `11-typescript-api-types.md` | Typed requests, responses, DTOs, mapping | ⬜ |

### [Part 8 — Forms and Validation](./08-forms-validation/)

| File | Topic | Status |
| --- | --- | --- |
| `01-forms.md` | How HTML forms actually submit | ⬜ |
| `02-controlled-forms.md` | Multi-field form state, generic handlers | ⬜ |
| `03-form-validation.md` | Hand-rolled validation, error display | ⬜ |
| `04-react-hook-form.md` | RHF: register, errors, performance | ⬜ |
| `05-zod.md` | Schemas, `z.infer`, resolver integration | ⬜ |

### [Part 9 — State Management](./09-state-management/)

| File | Topic | Status |
| --- | --- | --- |
| `01-state-management.md` | The progression: useState → lift → context → reducer → store | ⬜ |
| `02-context-api.md` | Context as a state tool, pitfalls | ⬜ |
| `03-redux.md` | Store, actions, reducers, dispatch, middleware | ⬜ |
| `04-redux-toolkit.md` | `createSlice`, typed hooks, async thunks | ⬜ |
| `05-zustand.md` | Minimal global store, selectors | ⬜ |
| `06-server-state.md` | Client vs server state, TanStack Query | ⬜ |

### [Part 10 — Advanced React](./10-advanced-react/)

| File | Topic | Status |
| --- | --- | --- |
| `01-rendering.md` | Render phase, commit phase, reconciliation | ⬜ |
| `02-re-rendering.md` | What causes a re-render, render ≠ DOM update | ⬜ |
| `03-memoization.md` | `React.memo`, `useMemo`, `useCallback` correctly | ⬜ |
| `04-performance.md` | Profiling, DevTools, virtualization, images | ⬜ |
| `05-lazy-loading.md` | `lazy`, dynamic `import()` | ⬜ |
| `06-code-splitting.md` | Route-level and component-level splitting | ⬜ |
| `07-suspense.md` | Suspense boundaries, fallbacks, streaming | ⬜ |
| `08-error-boundaries.md` | Catching render errors | ⬜ |
| `09-concurrent-features.md` | `useTransition`, `useDeferredValue`, scheduling | ⬜ |

### [Part 11 — Modern React](./11-modern-react/)

| File | Topic | Status |
| --- | --- | --- |
| `01-react-19.md` | What changed in React 19 | ⬜ |
| `02-actions.md` | Actions and async transitions | ⬜ |
| `03-forms-actions.md` | `<form action>`, `useFormStatus` | ⬜ |
| `04-useactionstate.md` | Pending + error state for actions | ⬜ |
| `05-usetransition.md` | Non-blocking updates, `startTransition` | ⬜ |
| `06-useoptimistic.md` | Optimistic UI with rollback | ⬜ |
| `07-use.md` | `use()`, promises and context | ⬜ |
| `08-react-compiler.md` | What it optimizes, what it does not | ⬜ |

### [Part 12 — Styling](./12-styling/)

| File | Topic | Status |
| --- | --- | --- |
| `01-css.md` | Global CSS, imports, inline styles | ⬜ |
| `02-css-modules.md` | Scoped class names | ⬜ |
| `03-scss.md` | Nesting, variables, mixins | ⬜ |
| `04-tailwind.md` | Utility-first with Vite | ⬜ |
| `05-component-styling.md` | Choosing a strategy, trade-offs | ⬜ |

### [Part 13 — Testing](./13-testing/)

| File | Topic | Status |
| --- | --- | --- |
| `01-testing-basics.md` | Why, unit vs component vs integration | ⬜ |
| `02-vitest.md` | Setup, config, matchers | ⬜ |
| `03-react-testing-library.md` | Queries, `userEvent`, `render` | ⬜ |
| `04-component-testing.md` | Testing props, state, forms, a11y | ⬜ |
| `05-api-testing.md` | Mock Service Worker, async tests | ⬜ |

### [Part 14 — Authentication](./14-authentication/)

| File | Topic | Status |
| --- | --- | --- |
| `01-authentication-basics.md` | Sessions vs tokens, the flow | ⬜ |
| `02-login.md` | Building login and register | ⬜ |
| `03-jwt.md` | Access/refresh tokens, expiry | ⬜ |
| `04-protected-routes.md` | Guards, redirects, return-to | ⬜ |
| `05-token-management.md` | localStorage vs cookies — trade-offs | ⬜ |
| `06-role-based-ui.md` | Roles, permissions, guarded UI | ⬜ |

### [Part 15 — Production](./15-production/)

| File | Topic | Status |
| --- | --- | --- |
| `01-environment-variables.md` | `.env`, modes, `import.meta.env`, secrets | ⬜ |
| `02-project-architecture.md` | Layer vs feature architecture | ⬜ |
| `03-folder-structure.md` | Every folder, every convention | ⬜ |
| `04-error-handling.md` | Boundaries, API errors, user messages | ⬜ |
| `05-logging.md` | Client logging, monitoring, breadcrumbs | ⬜ |
| `06-security.md` | XSS, CSRF, CORS, CSP, dependencies | ⬜ |
| `07-performance.md` | Budgets, Core Web Vitals, real optimization | ⬜ |
| `08-production-checklist.md` | The pre-deploy checklist | ⬜ |

### [Part 16 — Build Tools](./16-build-tools/)

| File | Topic | Status |
| --- | --- | --- |
| `01-vite.md` | What Vite is, dev server, HMR, why so fast | ⬜ |
| `02-vite-configuration.md` | `vite.config.ts`, aliases, plugins, proxy | ⬜ |
| `03-build.md` | `npm run build`, output, preview, analysis | ⬜ |
| `04-environment-config.md` | Modes, env files, per-environment config | ⬜ |

### [Part 17 — Projects](./17-projects/)

| File | Topic | Status |
| --- | --- | --- |
| `01-counter.md` | Component + state + events | ⬜ |
| `02-todo-app.md` | State, forms, lists, props | ⬜ |
| `03-weather-app.md` | API, async, loading, errors, TS types | ⬜ |
| `04-crud-app.md` | Routing, forms, CRUD, validation | ⬜ |
| `05-authentication-app.md` | Register, login, JWT, protected routes | ⬜ |
| `06-production-react-app.md` | Everything together | ⬜ |

### [Part 18 — Interview Preparation](./18-interview/)

| File | Topic | Status |
| --- | --- | --- |
| `react-interview.md` | React Q&A with short + deep answers | ⬜ |
| `javascript-interview.md` | JS fundamentals asked in React interviews | ⬜ |
| `typescript-interview.md` | TS questions with React context | ⬜ |
| `scenario-based-questions.md` | "Why is my component…" debugging scenarios | ⬜ |

### Reference & cheat sheets

| File | Topic | Status |
| --- | --- | --- |
| [`react-roadmap.md`](./react-roadmap.md) | Stage-by-stage learning roadmap | ✅ |
| [`cheatsheets/react-cheatsheet.md`](./cheatsheets/react-cheatsheet.md) | Core React syntax | ⬜ |
| [`cheatsheets/tsx-cheatsheet.md`](./cheatsheets/tsx-cheatsheet.md) | JSX/TSX syntax rules | ⬜ |
| [`cheatsheets/typescript-react-cheatsheet.md`](./cheatsheets/typescript-react-cheatsheet.md) | Typing React code | ⬜ |
| [`cheatsheets/hooks-cheatsheet.md`](./cheatsheets/hooks-cheatsheet.md) | Every hook, one page | ⬜ |
| [`cheatsheets/react-router-cheatsheet.md`](./cheatsheets/react-router-cheatsheet.md) | Router API | ⬜ |
| [`cheatsheets/api-integration-cheatsheet.md`](./cheatsheets/api-integration-cheatsheet.md) | fetch/axios patterns | ⬜ |
| [`cheatsheets/redux-cheatsheet.md`](./cheatsheets/redux-cheatsheet.md) | Redux Toolkit patterns | ⬜ |
| [`cheatsheets/vite-cheatsheet.md`](./cheatsheets/vite-cheatsheet.md) | Vite commands and config | ⬜ |
| [`cheatsheets/react-interview-cheatsheet.md`](./cheatsheets/react-interview-cheatsheet.md) | Interview rapid revision | ⬜ |
| [`common-errors.md`](./common-errors.md) | Every common error, decoded | ⬜ |

---

## Progress tracker

Use this to know where you are. Tick the boxes as you finish each part.

- [x] **Part 1 — Prerequisites** (11 files) ✅
- [x] **Part 2 — TypeScript** (11 files) ✅
- [x] **Part 3 — React Fundamentals** (12 files) ✅
- [x] **Part 4 — State and Hooks** (10 files) ✅
- [x] **Part 5 — React Concepts** (9 files) ✅
- [ ] **Part 6 — Routing** (8 files)
- [ ] **Part 7 — API Integration** (11 files)
- [ ] **Part 8 — Forms and Validation** (5 files)
- [ ] **Part 9 — State Management** (6 files)
- [ ] **Part 10 — Advanced React** (9 files)
- [ ] **Part 11 — Modern React** (8 files)
- [ ] **Part 12 — Styling** (5 files)
- [ ] **Part 13 — Testing** (5 files)
- [ ] **Part 14 — Authentication** (6 files)
- [ ] **Part 15 — Production** (8 files)
- [ ] **Part 16 — Build Tools** (4 files)
- [ ] **Part 17 — Projects** (6 files)
- [ ] **Part 18 — Interview** (4 files)

**Milestones** — you are on track if you can do these:

| After part | You can build |
| --- | --- |
| 3 | A static multi-component page with props |
| 4 | A counter, a timer, a form that feels alive |
| 5 | A form-heavy app with shared state and theming |
| 6 | A multi-page SPA with URL parameters |
| 7 | A CRUD app talking to a real REST API |
| 9 | An app with global state you did not have to prop-drill |
| 10 | An app you can profile and optimize with evidence |
| 13 | A tested, trustworthy app |
| 14 | An app with real login, roles and protected pages |
| 17 | A deployable portfolio project |

---

## Getting your computer ready

You will use these tools throughout the notes.

### 1. Node.js and npm

React projects are built with Node.js tooling. Node 20.19+ or 22.12+ is required
by current Vite versions — use an LTS release.

```bash
node -v
npm -v
```

Expected output (your exact numbers may be newer):

```text
v22.22.0
10.9.8
```

If `node -v` prints "command not found", install Node from
<https://nodejs.org> (choose LTS), then close and reopen your terminal.

### 2. A code editor

Use **VS Code** (<https://code.visualstudio.com>). Install these extensions —
they are used in every chapter:

| Extension | Why you need it |
| --- | --- |
| Oxc (`oxlint`) | Shows mistakes as you type — it is the linter the Vite template uses (Part 3). Install the ESLint extension as well only if a project you join uses ESLint |
| Prettier | Formats code consistently |
| TypeScript / JS Snippets built-ins | Come with VS Code already |

### 3. One playground project for the whole book

```bash
npm create vite@latest react-playground -- --template react-ts
cd react-playground
npm install
npm run dev
```

Expected output:

```text
  VITE v7.x.x  ready in 300 ms
  ➜  Local:   http://localhost:5173/
```

Open <http://localhost:5173> — you should see the Vite + React welcome page.
**Every example in these notes can be pasted into this project** unless a
chapter says to create a new project.

> 💡 Why `--template react-ts`? Because it creates a React project that already
> has TypeScript and `.tsx` files configured. Part 3 explains every generated
> file in detail.

### 4. A browser with React DevTools

Install the **React Developer Tools** extension for Chrome/Edge/Firefox
(<https://react.dev/learn/react-developer-tools>). You will use the *Components*
and *Profiler* tabs starting in Part 10.

---

## Version assumptions

Version-sensitive information in these notes is checked against the current
official documentation. These notes target:

| Tool | Version used in the notes | Notes |
| --- | --- | --- |
| React | 19.x (current release line) | Function components + hooks only |
| React DOM | 19.x | `createRoot` from `react-dom/client` |
| TypeScript | 6.x | `strict` is **on by default** in TS 6; the template also sets `noUnusedLocals/Parameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax` |
| Vite | 8.x | `react-ts` template (`npm create vite@latest`) |
| React Router | 7.x | Data-router APIs available; classic JSX routes shown first |
| TanStack Query | 5.x | Part 9 and 17 |
| Redux Toolkit | 2.x | Part 9 |
| Zustand | 5.x | Part 9 |
| Vitest | 3.x | Part 13 |
| React Testing Library | 16.x | Part 13 |
| oxlint | 1.x | The linter that ships with the Vite template (`npm run lint`) — no ESLint needed |
| Node.js | 20.19+ / 22.12+ | Required by Vite 8 |

**Before using a version-sensitive API in a real job**, check
<https://react.dev/reference/react> — that page is the source of truth for the
installed version, and these notes say so wherever it matters.

### Deprecated things these notes do *not* teach as current practice

| Deprecated | What we teach instead | Where it is explained |
| --- | --- | --- |
| Create React App (`create-react-app`) | Vite `react-ts` | Part 3 |
| Class components as default | Function components + hooks | Part 1/3 (explained as history) |
| `componentDidMount` / `componentDidUpdate` as the mental model for effects | The synchronization mental model of `useEffect` | Part 4 |
| String refs and legacy `contextType` | `useRef`, `createContext` + `useContext` | Parts 4/5 |
| `defaultProps` on function components | Default parameter values | Part 3 |
| `React.FC` as the default way to type components | Typing props directly on the parameter | Part 3/30 |
| Manual `React.memo`/`useMemo` everywhere | Measure first; React Compiler where available | Parts 10/11 |

---

## Official references

Keep these open while working. The notes cross-check version-sensitive details
against them:

- React — Learn: <https://react.dev/learn>
- React — Reference (Hooks, components, APIs, directives): <https://react.dev/reference/react>
- React — TypeScript guide: <https://react.dev/learn/typescript>
- React — Developer Tools: <https://react.dev/learn/react-developer-tools>
- TypeScript Handbook: <https://www.typescriptlang.org/docs/handbook/intro.html>
- TypeScript `tsconfig` reference: <https://www.typescriptlang.org/tsconfig>
- Vite guide: <https://vite.dev/guide/>
- Vite env variables and modes: <https://vite.dev/guide/env-and-mode>
- React Router: <https://reactrouter.com/>
- TanStack Query: <https://tanstack.com/query/latest>
- Redux Toolkit: <https://redux-toolkit.js.org/>
- Zustand: <https://zustand.docs.pmnd.rs/>
- Vitest: <https://vitest.dev/>
- React Testing Library: <https://testing-library.com/docs/react-testing-library/intro/>
- React Hook Form: <https://react-hook-form.com/>
- Zod: <https://zod.dev/>
- Tailwind CSS + Vite: <https://tailwindcss.com/docs/installation/using-vite>
- Node.js downloads: <https://nodejs.org>

---

## Start here

1. Read [`react-roadmap.md`](./react-roadmap.md) to see the whole journey and
   what you will be able to build at each stage.
2. Then open [`01-prerequisites/01-html-basics.md`](./01-prerequisites/01-html-basics.md)
   and begin Part 1.

> **One last thing.** These notes are long on purpose. Depth beats speed:
> a concept you truly understand takes minutes to use; a concept you memorised
> takes hours to debug. Go slowly, type everything, break everything, and ask
> "what does React actually do here?" in every chapter. That question is the
> whole skill.
