# React + TypeScript Learning Roadmap

> **How to read this file.** This is the map of the whole journey, from "I know
> some JavaScript" to "I can build, test, secure, optimise and deploy a
> production React application". Each stage tells you *what to learn*, *why it
> comes at this point*, *what you must be able to build before moving on*, and
> *which files in these notes cover it*.
>
> A roadmap is not a schedule. Two people can take three months or twelve. Use
> the **checkpoints**, not the calendar, to decide when to move on.

---

## The journey at a glance

```text
 1. HTML            ─┐
 2. CSS              │  You can already write a static web page
 3. JavaScript       │  You can make a page interactive
 4. Modern JS       ─┘  You can write the JavaScript React is built from
         ↓
 5. TypeScript          You can describe data and catch mistakes before running
         ↓
 6. JSX                 You can describe UI inside JavaScript
 7. TSX                 You can describe typed UI
         ↓
 8. React Components    You can break a UI into reusable pieces
 9. Props               You can pass data between components
10. State               You can make a UI change over time
11. Events              You can respond to the user
12. Forms               You can collect and validate user input
13. Hooks               You can share and reuse logic
14. Routing             You can build multi-page single-page apps
15. API Integration     You can talk to a backend
16. Authentication      You can log users in and protect pages
17. State Management    You can manage complex shared state
18. Testing             You can prove your app works
19. Performance         You can make it fast, with evidence
20. Advanced React      You understand rendering deeply
21. Production          You can architecture and secure it
         ↓
    Deployment          You can ship it, monitor it, and roll it back
```

Below, each stage is expanded: **goal → topics → build this → checkpoint →
files**.

---

## Stage 1 — HTML

**Goal:** understand that React *produces* HTML; you cannot produce what you do
not understand.

**Topics**

- The document structure: `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`
- Semantic elements: `header`, `nav`, `main`, `section`, `article`, `footer`
- Elements, attributes, nesting, void elements (`<img>`, `<input>`, `<br>`)
- Text content vs attributes
- Links (`<a href>`), images (`<img src alt>`), lists (`ul`, `ol`, `li`)
- Forms at the HTML level: `<form>`, `<input>`, `<label>`, `<button>`, `<select>`,
  `<textarea>` and what `type="submit"` actually does
- Accessibility basics: labels, `alt` text, heading order
- The DOM: how the browser turns HTML text into a **tree of objects** you can
  manipulate from JavaScript

**Build:** a static page for a fictional product (header, hero, features, footer)
written by hand, no frameworks.

**Checkpoint — you can:**

- [ ] Explain the difference between HTML source and the DOM
- [ ] Explain what a form submit does by default (and why React has to stop it)
- [ ] Explain why `<label for="email">` matters

**Notes:** [`01-prerequisites/01-html-basics.md`](./01-prerequisites/01-html-basics.md)

---

## Stage 2 — CSS

**Goal:** style a UI, and understand how styles reach React components.

**Topics**

- Selectors, specificity, the cascade
- The box model: content → padding → border → margin
- `display`, `position`, `flexbox`, a little CSS grid
- Units: `px`, `%`, `rem`, `vh`/`vw`
- Colors, typography, spacing systems
- Responsive design, media queries, mobile-first
- Class-based styling conventions (why everything becomes `className` in JSX)

**Build:** make the Stage 1 page responsive and give it a consistent spacing and
color system.

**Checkpoint — you can:**

- [ ] Build a two-column layout with flexbox without guessing
- [ ] Explain why React uses `className` instead of `class`
- [ ] Style a component by giving it a class name and targeting it from CSS

**Notes:** [`01-prerequisites/02-css-basics.md`](./01-prerequisites/02-css-basics.md)
(then Part 12 for CSS Modules, SCSS, Tailwind)

---

## Stage 3 — JavaScript

**Goal:** write a program, not a script. React is JavaScript; a weak JS
foundation becomes a weak React foundation.

**Topics**

- Variables: `let`, `const`, and why `var` is avoided
- Data types: string, number, boolean, `null`, `undefined`, object, array
- Objects: creating, reading, updating, nesting
- Arrays: indexing, length, mutation vs non-mutation
- Functions: declaration, expression, parameters, `return`
- Scope and closures
- Conditionals, loops, logical operators
- Errors: `try` / `catch`, `Error` objects
- Truthiness and falsiness (this matters enormously for JSX conditionals)

**Build:** a command-line "expense tracker" in plain JavaScript: an array of
expense objects, functions to add/remove/total them, printed to the console.

**Checkpoint — you can:**

- [ ] Predict what `[]`, `{}`, `0`, `''` and `'0'` evaluate to as booleans
- [ ] Explain the difference between `==` and `===`
- [ ] Use a closure to keep private state in a function
- [ ] Explain why `count = count + 1` inside a function does not update a
      *different* variable outside it

**Notes:** [`01-prerequisites/03-javascript-basics.md`](./01-prerequisites/03-javascript-basics.md),
[`08-functions.md`](./01-prerequisites/08-functions.md)

---

## Stage 4 — Modern JavaScript (ES6+)

**Goal:** learn the exact syntax React code is written in. Most "React looks
weird" confusion is really "modern JavaScript looks weird" confusion.

**Topics**

- Arrow functions: `const add = (a, b) => a + b`
- Arrow functions and `this` (and why React components rarely need `this` now)
- Template literals: `` `Hello ${name}` ``
- Destructuring: `const { name, age } = user`, `const [first, second] = arr`
- Spread: `{ ...user, name: 'Sam' }`, `[...items, newItem]`
- Rest: `function sum(...numbers)`, `const { id, ...rest } = obj`
- Default parameters and optional chaining `user?.address?.city`
- Nullish coalescing `??` and its difference from `||`
- Array methods: `map`, `filter`, `find`, `findIndex`, `reduce`, `forEach`,
  `some`, `every`, `sort`, `includes`
- Modules: `import` / `export`, default vs named exports
- Promises, `async` / `await`, `fetch`
- Immutability as a habit (never mutate, always create new)

**Build:** rewrite the Stage 3 expense tracker using arrow functions,
destructuring, spread, `map`/`filter`/`reduce`, ES modules split across files,
and a simulated async API call wrapped in `async`/`await`.

**Checkpoint — you can:**

- [ ] Write `users.map(u => u.name)` and explain each token
- [ ] Clone an object and change one field without mutating the original
- [ ] Split code into `data.js`, `logic.js`, `index.js` with imports/exports
- [ ] `await` a promise inside an `async` function and catch its errors

**Notes:** [`04-modern-javascript.md`](./01-prerequisites/04-modern-javascript.md),
[`05-destructuring.md`](./01-prerequisites/05-destructuring.md),
[`06-spread-rest.md`](./01-prerequisites/06-spread-rest.md),
[`07-array-methods.md`](./01-prerequisites/07-array-methods.md),
[`09-modules.md`](./01-prerequisites/09-modules.md),
[`10-promises.md`](./01-prerequisites/10-promises.md),
[`11-async-await.md`](./01-prerequisites/11-async-await.md)

> ⛔ **Do not skip Stages 3–4.** Every React bug you will see in the first six
> months is either a JavaScript misunderstanding or a React mental-model
> misunderstanding. Killing the first kind early is the best investment you can
> make.

---

## Stage 5 — TypeScript

**Goal:** describe your data so the editor catches mistakes before the browser
does — the entire reason these notes are TSX and not JSX.

**Topics**

- What TypeScript is; compile-time types erased at runtime
- `tsc`, `tsconfig.json`, `strict` mode, `noImplicitAny`
- Primitive types, arrays, objects, tuples, `readonly`
- Type inference — when to annotate and when to let TS work
- `interface` vs `type`, and how to choose
- Optional (`?`) and readonly properties
- Union and intersection types; literal types
- Functions: parameter types, return types, `void`, callbacks, optional params
- Generics: `<T>`, constraints (`extends`), generic functions
- Enums vs `as const` objects
- Narrowing: `typeof`, `instanceof`, `in`, discriminated unions, `never`
- `unknown` vs `any` vs `never`
- Utility types: `Partial`, `Required`, `Pick`, `Omit`, `Record`, `Readonly`,
  `ReturnType`, `Awaited`
- Type assertions (`as`), and why they are a last resort
- `import type`

**Build:** a typed "library" module — typed `Book`, `Author`, a `Library` class,
generic `findBy<T>`, a discriminated union for `Result<T> = Success | Failure`.

**Checkpoint — you can:**

- [ ] Explain why `let name: string = 'Ada'` is redundant but sometimes useful
- [ ] Model an API response with an interface, including optional fields
- [ ] Write a discriminated union and narrow it in a `switch` exhaustively
- [ ] Use `Omit<User, 'password'>` for a public API type and say why

**Notes:** [`02-typescript/01-typescript-introduction.md`](./02-typescript/01-typescript-introduction.md)
through [`11-typescript-react.md`](./02-typescript/11-typescript-react.md)

---

## Stage 6 — JSX

**Goal:** describe UI as data inside JavaScript, comfortably.

**Topics**

- Why a UI needs a notation that can live inside JavaScript
- JSX syntax: expressions in `{}`, attributes, self-closing tags
- `className`, `htmlFor`, `style={{ }}`, camelCase props
- Fragments `<>...</>` — why one parent element is required
- Multi-line JSX and parentheses after `return`
- Comments in JSX
- Conditional JSX: ternary, `&&`, early return
- Rendering arrays with `.map()` and `key`
- What JSX compiles to, and why it is *not* literally HTML
- XSS: why React escapes `{}` content by default

**Build:** a static "profile page" made of 5 components, using props, conditionals
and a mapped list — no state yet.

**Checkpoint — you can:**

- [ ] Explain why `class` becomes `className`
- [ ] Explain the error "Adjacent JSX elements must be wrapped in an enclosing tag"
- [ ] Render a list without a console warning about keys
- [ ] Explain why `{0 && <X />}` prints `0`

**Notes:** [`03-react-fundamentals/05-jsx.md`](./03-react-fundamentals/05-jsx.md)

---

## Stage 7 — TSX

**Goal:** combine the two: typed components.

**Topics**

- `.ts` vs `.tsx` and why JSX requires `.tsx`
- Typing a component's props
- `React.ReactNode` for children
- Typing events (`React.ChangeEvent<HTMLInputElement>`)
- Typing `useState<T>` explicitly, and inference
- Typing refs (`useRef<HTMLInputElement | null>(null)`)
- Generic components
- Where types live: inline, co-located, or in `types/`

**Build:** the Stage 6 profile page, now fully typed: a `User` interface, a typed
`UserCard`, a typed list, a typed like button with a typed click handler.

**Checkpoint — you can:**

- [ ] Explain what `function UserCard({ user }: { user: User })` means
- [ ] Fix "Type 'X' is not assignable to type 'Y'" errors by reasoning
- [ ] Explain why you cannot put JSX in a `.ts` file

**Notes:** [`03-react-fundamentals/06-tsx.md`](./03-react-fundamentals/06-tsx.md),
[`02-typescript/11-typescript-react.md`](./02-typescript/11-typescript-react.md)

---

## Stage 8 — React Components

**Goal:** think in a component tree.

**Topics**

- What React is and the problem it solves
- React vs vanilla JS DOM manipulation
- Library vs framework; React vs Angular vs Vue
- Setting up a project with Vite (`react-ts` template)
- Every generated file explained: `index.html`, `main.tsx`, `App.tsx`,
  `package.json`, `tsconfig.json`, `vite.config.ts`
- Function components: naming, file naming, one component per file
- Component composition and the component tree
- Rendering: what `createRoot(...).render(<App />)` does
- Presentational vs container components

**Build:** a "dashboard" of nested components: `Header`, `Sidebar`, `StatsGrid`,
`StatCard`, `Footer` — no state, correct structure.

**Checkpoint — you can:**

- [ ] Draw the component tree of a page you visit
- [ ] Explain why component names must be capitalised
- [ ] Explain what `export default App` vs `export { App }` changes
- [ ] Create a project, run the dev server, and find the file that renders the
      page

**Notes:** [`03-react-fundamentals/01-what-is-react.md`](./03-react-fundamentals/01-what-is-react.md)
through [`07-components.md`](./03-react-fundamentals/07-components.md)

---

## Stage 9 — Props

**Goal:** pass data down the tree; make components reusable and configuration-driven.

**Topics**

- What props are; props are read-only
- Passing strings, numbers ({} braces), booleans, objects, arrays, functions
- Receiving and destructuring props
- Default values with default parameters
- Optional props
- `children`
- Props with TypeScript interfaces
- Passing callbacks as props (preview of child → parent)

**Build:** a reusable `Button` with variants and a `ProductCard` list driven
entirely by props.

**Checkpoint — you can:**

- [ ] Explain why `count={1}` and `count="1"` are different
- [ ] Type a props object and give one prop a default
- [ ] Explain "Props are read-only" and what happens if you try to assign to one

**Notes:** [`08-props.md`](./03-react-fundamentals/08-props.md),
[`05-react-concepts/08-children.md`](./05-react-concepts/08-children.md)

---

## Stage 10 — State

**Goal:** the single biggest mental shift in React — UI as a function of state.

**Topics**

- Why plain variables do not survive re-renders and do not trigger them
- `const [count, setCount] = useState(0)` dissected word by word
- Initial state (value vs lazy initialiser)
- Updating state: setter, functional updater `setCount(c => c + 1)`
- Why `count++` does not re-render, and why `setCount` is asynchronous-looking
- Batching and the snapshot model
- State with objects and arrays; immutability and spread
- Derived state vs redundant state (the #1 junior bug)
- Stale state in closures
- Lifting state up (preview)

**Build:** a counter with +1/-1/reset/step, then the same counter with
functional updates, then a "shopping cart" with an array of items and correct
immutable add/remove/quantity change.

**Checkpoint — you can:**

- [ ] Explain what happens, in order, when `setCount(count + 1)` is called
- [ ] Explain why `setCount(count + 1); setCount(count + 1);` adds 1 but
      `setCount(c => c + 1); setCount(c => c + 1);` adds 2
- [ ] Update a nested object in state without mutating it
- [ ] Say which of your values should be state and which should be computed

**Notes:** [`04-state-and-hooks/01-state.md`](./04-state-and-hooks/01-state.md),
[`02-usestate.md`](./04-state-and-hooks/02-usestate.md)

---

## Stage 11 — Events

**Goal:** respond to the user with correct, typed handlers.

**Topics**

- `onClick`, `onChange`, `onSubmit`, `onMouseEnter`, `onKeyDown`, `onFocus`,
  `onBlur`, `onDoubleClick`, `onScroll`
- Attaching handlers: reference vs call
- Passing arguments: `onClick={() => remove(id)}`
- Event object, `event.target.value`, `event.preventDefault()`
- `event.stopPropagation()` and bubbling
- Typed events: `React.ChangeEvent<HTMLInputElement>`,
  `React.FormEvent<HTMLFormElement>`, `React.MouseEvent<HTMLButtonElement>`,
  `React.KeyboardEvent<HTMLInputElement>`
- Why React uses synthetic-ish events and how React 17+ attaches them at the root

**Build:** an interactive "keyboard-friendly counter" plus a search box that
filters a list on every keystroke and clears on Escape.

**Checkpoint — you can:**

- [ ] Explain the difference between `onClick={handle}` and `onClick={handle()}`
- [ ] Pass an argument to a handler without causing an infinite render
- [ ] Type a form submit handler and stop the page reload
- [ ] Explain event bubbling with a nested `div`

**Notes:** [`03-react-fundamentals/12-events.md`](./03-react-fundamentals/12-events.md)

---

## Stage 12 — Forms

**Goal:** collect, validate and submit user input the React way.

**Topics**

- HTML form fundamentals and default submit behaviour
- Controlled inputs: `value` + `onChange`
- One state object vs one `useState` per field
- Text, number, checkbox, radio, select, multi-select, textarea, file
- Validation on submit, on blur, on change
- Error messages and accessibility (`aria-invalid`, `aria-describedby`)
- Disabling the submit button while submitting
- Resetting forms
- Uncontrolled inputs with refs and `FormData`
- When to move to React Hook Form
- React Hook Form: `register`, `handleSubmit`, `formState.errors`, `watch`
- Zod schemas + `zodResolver` + inferred types
- Server-side errors mapped back onto fields

**Build:** a registration form — email, password, confirm password, age, country
select, terms checkbox — with per-field validation, then the same form rebuilt
with React Hook Form + Zod.

**Checkpoint — you can:**

- [ ] Explain why `value` without `onChange` gives a read-only warning
- [ ] Validate a form and block submission when invalid
- [ ] Explain what `z.infer<typeof schema>` gives you
- [ ] Decide controlled vs uncontrolled for a given field

**Notes:** [`08-forms-validation/`](./08-forms-validation/) (all 5 files), plus
[`05-react-concepts/03-controlled-components.md`](./05-react-concepts/03-controlled-components.md)
and [`05-forms.md`](./05-react-concepts/05-forms.md)

---

## Stage 13 — Hooks

**Goal:** the tools React gives you for state, side effects, refs, context,
performance and reuse — plus the rules that make them work.

**Topics (in learning order)**

1. `useState` — state (already known by now)
2. `useEffect` — synchronising with things outside React: timers, subscriptions,
   network, DOM. Dependency array, cleanup, avoiding infinite loops
3. `useRef` — DOM nodes and mutable values that do not re-render
4. `useContext` — reading shared values without prop drilling
5. `useReducer` — complex state as actions
6. `useMemo` — caching expensive computations
7. `useCallback` — stable function identities
8. Custom hooks — extracting logic (`useFetch`, `useLocalStorage`,
   `useDebounce`, `useToggle`, `useForm`)
9. Rules of hooks — why they must be top-level and unconditional; `eslint-plugin-react-hooks`
10. The modern use cases: `useTransition`, `useDeferredValue`, `useOptimistic`,
    `useActionState` and `use()` (full treatment in Part 11)

**Build:** a custom-hook library: `useDebounce`, `useLocalStorage`,
`useFetch<T>`, `useToggle`, `useMediaQuery`, `useOnClickOutside`, plus a demo
page for each.

**Checkpoint — you can:**

- [ ] Write `useEffect` with correct dependencies and cleanup for a timer
- [ ] Explain the three dependency-array forms and their behaviour
- [ ] Explain why a hook's name must start with `use`
- [ ] Extract duplicated logic from two components into a custom hook
- [ ] State the two rules of hooks and what breaks when you violate them

**Notes:** [`04-state-and-hooks/`](./04-state-and-hooks/) (all 10 files), plus
Part 11

---

## Stage 14 — Routing

**Goal:** build multi-page apps without full page reloads, with real URLs.

**Topics**

- Why routers exist; URL, history, deep links, back button
- SPA vs MPA
- React Router install and setup (`BrowserRouter`, `Routes`, `Route`)
- `Link` vs `<a>`; `NavLink` and active styles
- Route parameters (`/users/:id`) with `useParams`
- Query parameters with `useSearchParams`
- Nested routes and layout routes with `<Outlet />`
- Index routes, `*` catch-all and 404 pages
- Programmatic navigation with `useNavigate`
- Protected routes (auth guard component)
- Lazy routes with `lazy` + `Suspense`
- Route-level data loading concepts (loaders, `useLoaderData`)
- Deploying an SPA: server rewrite rules for deep links

**Build:** a "Shop admin" SPA: `/`, `/products`, `/products/:id`, `/products/new`,
`/orders` (nested under a dashboard layout), `/login`, and a styled 404.

**Checkpoint — you can:**

- [ ] Explain why a deep link to `/products/7` 404s on some servers after deploy
- [ ] Read a route param, a query param and navigate programmatically
- [ ] Build a layout route with a shared sidebar
- [ ] Guard a route and redirect unauthenticated users to login

**Notes:** [`06-routing/`](./06-routing/) (all 8 files)

---

## Stage 15 — API Integration

**Goal:** talk to a backend correctly, with types, loading states, errors and
cancellation.

**Topics**

- HTTP: methods, status codes, headers, bodies, CORS, HTTPS
- JSON: parse/stringify, and validating what you receive
- `fetch` with TypeScript: the `.json()` type lie and how to handle it
- Axios: instances, base URL, interceptors, error shapes
- GET (lists + single + query params)
- POST/PUT/PATCH/DELETE with bodies and headers
- Typed request/response models; separating API shape from UI shape
- Loading, error and empty states as first-class UI
- Race conditions; `AbortController`; ignoring stale responses
- Retries, timeouts, toasts
- Server state caching with TanStack Query: `useQuery`, `useMutation`,
  invalidation, optimistic updates
- The `api/ + services/ + hooks/` layering pattern

**Build:** a typed CRUD app against a real public API (or a mock server) —
list, detail, create, edit, delete — with spinners, error banners, optimistic
delete, request cancellation, and a custom `useFetch`/query hook. This is
Project 4 in Part 17.

**Checkpoint — you can:**

- [ ] Explain why `const data = await res.json()` is typed as `any`
- [ ] Handle a 404 and a network failure differently in the UI
- [ ] Cancel a request when a component unmounts
- [ ] Say why a query string goes in the URL and the id goes in the path
- [ ] Invalidate a cache entry after a successful mutation

**Notes:** [`07-api-integration/`](./07-api-integration/) (all 11 files),
[`09-state-management/06-server-state.md`](./09-state-management/06-server-state.md)

---

## Stage 16 — Authentication (frontend)

**Goal:** the client half of login/logout, tokens, protected UI and roles — with
a clear understanding of the security trade-offs.

**Topics**

- Authentication vs authorization
- Sessions + cookies vs JWT
- Access token vs refresh token; expiry; silent refresh
- Where to store tokens: `localStorage` vs `sessionStorage` vs httpOnly cookies —
  XSS and CSRF trade-offs, in-memory tokens
- Login and register flows, error states
- Auth context/provider: `user`, `login()`, `logout()`, `isLoading`
- Booting: "am I logged in?" before rendering protected UI
- Protected routes and redirect-back-after-login
- Attaching the token to requests (interceptors), handling 401 globally
- Roles and permissions: role-based UI (and why the backend must still check)
- Logout everywhere, expired sessions, multi-tab sync

**Build:** Project 5 in Part 17 — a full auth flow against a mock API, with
protected routes, refresh-on-401, role-gated admin page, and a "session expired"
message.

**Checkpoint — you can:**

- [ ] Explain why frontend validation and frontend route guards are not security
- [ ] Describe the XSS risk of `localStorage` tokens and the CSRF risk of cookies
- [ ] Build an `AuthProvider` with typed context and a `useAuth` hook
- [ ] Handle a 401 by refreshing the token once and retrying the request

**Notes:** [`14-authentication/`](./14-authentication/) (all 6 files),
[`15-production/06-security.md`](./15-production/06-security.md)

---

## Stage 17 — State Management

**Goal:** choose the right tool for each kind of state — and stop reaching for
Redux for a modal's `isOpen` flag.

**Topics**

- The progression: `useState` → lift state up → Context → `useReducer` →
  external store
- Kinds of state: local UI state, shared client state, server state, URL state,
  form state
- Context API as a state tool: provider values, re-render cost, splitting
  contexts, context + reducer pattern
- Redux: store, action, reducer, dispatch, selector, middleware, immutability
- Redux Toolkit: `configureStore`, `createSlice`, `createAsyncThunk`, typed
  `useSelector`/`useDispatch`, RTK Query overview
- Zustand: minimal store, selectors, slices, persistence
- TanStack Query for server state (the one that replaces the most hand-written
  code)
- URL as state: search params
- How to choose, with a decision table

**Build:** a "Shopping cart + auth + product catalogue" app where: auth and cart
live in a store (Zustand or Redux Toolkit), catalogue is server state with
TanStack Query, filter/sort lives in the URL, and a modal is local `useState`.

**Checkpoint — you can:**

- [ ] Classify each piece of state in an app you have built
- [ ] Explain what problem Redux solves that Context does not, and vice versa
- [ ] Write a typed `createSlice` with a thunk and read it with a selector
- [ ] Explain why server data in Redux usually means hand-writing a cache

**Notes:** [`09-state-management/`](./09-state-management/) (all 6 files)

---

## Stage 18 — Testing

**Goal:** confidence to change code — tests that fail when behaviour breaks and
pass when it does not, without testing implementation details.

**Topics**

- Why test; what to test; the testing trophy (integration > unit)
- Vitest setup in a Vite project; `npm run test`; watch mode; coverage
- React Testing Library: `render`, `screen`, queries by role/label/text
- `userEvent` vs `fireEvent`
- Assertions: `toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`, etc.
- Testing props, conditional rendering, lists
- Testing forms: typing, selecting, submitting, validation errors
- Testing async UIs: `findBy*`, `waitFor`, loading and error states
- Mocking: `vi.fn()`, `vi.mock()`, module mocks, fake timers
- API mocking with Mock Service Worker (MSW): handlers, per-test overrides
- Testing custom hooks with `renderHook`
- Testing routing and auth-protected pages
- What not to test (snapshots of everything, internal state, styles)

**Build:** a test suite for Project 2 (todo app) and Project 3 (weather app):
add/complete/delete todos, filter, form validation, loading state, success,
error and empty states, plus one integration test of the whole flow.

**Checkpoint — you can:**

- [ ] Write a test that would catch a real regression
- [ ] Assert that a loading spinner disappears and data appears
- [ ] Mock an API error and assert the error UI
- [ ] Explain why querying by role and name beats querying by CSS class

**Notes:** [`13-testing/`](./13-testing/) (all 5 files)

---

## Stage 19 — Performance

**Goal:** measure before optimizing; understand what actually costs time.

**Topics**

- The render cycle: render phase (pure) and commit phase (DOM writes)
- Why a component re-renders; parent re-render propagates
- `React.memo` and shallow prop comparison
- `useMemo` / `useCallback` — for referential equality, not "speed"
- Key stability and list rendering costs
- React DevTools Profiler: flamegraph, ranked view, "why did this render?"
- Code splitting, `lazy`, dynamic import, route-level splitting
- Bundle analysis; tree shaking; dependency weight
- Images: formats, `srcset`, lazy loading, layout shift
- Lists: windowing/virtualization for 1000+ rows
- Network: caching, prefetching, waterfalls, debouncing
- Web Vitals: LCP, INP, CLS — and which React patterns hurt them
- When memoization adds more cost (and complexity) than it saves

**Build:** take a deliberately slow app (10k-row table, heavy computation on
every keystroke, huge bundle) and optimize it in measured steps, writing down the
before/after numbers.

**Checkpoint — you can:**

- [ ] Explain the difference between a re-render and a DOM update
- [ ] Use the Profiler to find the slowest component
- [ ] Justify each `memo`/`useMemo`/`useCallback` with a measurement
- [ ] Cut initial bundle size with route-level code splitting

**Notes:** [`10-advanced-react/`](./10-advanced-react/) (all 9 files),
[`15-production/07-performance.md`](./15-production/07-performance.md)

---

## Stage 20 — Advanced React & Modern React

**Goal:** understand the internals well enough to debug anything, and use
React 19's modern features where they belong.

**Topics**

- Reconciliation and the diffing algorithm; keys revisited
- React elements vs components vs instances
- Render purity, StrictMode double-invocation, why it is a feature
- Suspense boundaries and fallbacks; what "suspending" means
- Error boundaries (`react-error-boundary`, `componentDidCatch`) and why hooks
  cannot catch render errors
- Transitions: `useTransition`, `startTransition`, `useDeferredValue`
- React 19: Actions, `<form action={fn}>`, `useActionState`, `useFormStatus`,
  `useOptimistic`, `use()`, ref as a prop, document metadata, improved
  error handling
- React Compiler: what it optimizes, what it does not, how it changes the
  memoization conversation
- Server Components: what problem they solve (and why they are a framework
  feature, not a drop-in for a Vite SPA)

**Build:** an app with Suspense + lazy routes, an error boundary around a page, a
search box using `useDeferredValue`, a form using `useActionState` and
`useOptimistic` for an optimistic like button.

**Checkpoint — you can:**

- [ ] Explain reconciliation well enough to explain why index keys break
- [ ] Wrap a page in an error boundary and show a retry UI
- [ ] Explain the difference between `useMemo` and the React Compiler's job
- [ ] Explain when an optimistic update should roll back

**Notes:** [`10-advanced-react/`](./10-advanced-react/),
[`11-modern-react/`](./11-modern-react/) (all 8 files)

---

## Stage 21 — Production Architecture & Deployment

**Goal:** ship it — the part bootcamps often skip.

**Topics**

- Environment variables: `.env`, `.env.development`, `.env.production`,
  `import.meta.env.VITE_*`, and why frontend env vars are never secret
- Architecture: layered (`components/pages/services/hooks/...`) vs feature-based
- Folder structure and naming conventions that scale past ten developers
- Error handling strategy: boundaries + API layer + user-facing messages +
  telemetry
- Logging & monitoring: what to log, what never to log, breadcrumbs, source maps
- Security: XSS, CSRF, CORS, CSP, dependency auditing, auth token storage,
  safe input handling
- Performance budget, caching headers, CDN, code splitting, image pipeline
- Accessibility as a production requirement
- Build: `npm run build`, what ends up in `dist/`, hashing, `base` path
- Deployment: static hosting (Netlify/Vercel/GitHub Pages/S3+CloudFront),
  SPA rewrite rule for client routing, preview deployments, CI checks
- Post-deploy verification and rollback

**Build:** a production app (Project 6) with auth, routing, API layer, forms,
state management, error handling, loading states, responsive UI, tests, env
configuration, README, and a live deployment — plus a written architecture
document explaining every folder.

**Checkpoint — you can:**

- [ ] Explain why `VITE_API_KEY` is visible in the browser bundle
- [ ] Configure per-environment API URLs and build for both
- [ ] Deploy an SPA and make deep links work
- [ ] Explain your folder structure to another developer in five minutes

**Notes:** [`15-production/`](./15-production/) (all 8 files),
[`16-build-tools/`](./16-build-tools/) (all 4 files),
[`17-projects/06-production-react-app.md`](./17-projects/06-production-react-app.md)

---

## What you can build after each stage (one-line version)

| Stage | You can build |
| --- | --- |
| HTML | A static web page |
| CSS | A responsive, styled static web page |
| JavaScript | A program with data, functions and logic |
| Modern JS | Modular, idiomatic JS with async data |
| TypeScript | Type-safe data models and APIs |
| JSX | UI descriptions as data |
| TSX | Typed UI descriptions |
| Components | A composed, reusable static UI |
| Props | The same UI with many variations |
| State | Interactive UI that changes over time |
| Events | UI that responds to clicks, typing and keys |
| Forms | Apps that collect and validate user input |
| Hooks | Reusable shared logic and outside-world sync |
| Routing | Multi-page SPAs with real URLs |
| API Integration | CRUD apps backed by a real server |
| Authentication | Apps with login, roles and protected pages |
| State Management | Large apps with predictable shared state |
| Testing | Apps you can refactor without fear |
| Performance | Fast apps, optimized by measurement |
| Advanced React | Apps with Suspense, error boundaries, transitions |
| Production | Deployed, secure, monitored, documented apps |

---

## Suggested study rhythm

| Session type | Length | What to do |
| --- | --- | --- |
| Learn | 45–60 min | Read one notes file, typing every example |
| Practice | 45–60 min | Do the chapter's exercises without looking at solutions |
| Build | 60–120 min | Extend your playground project with the chapter's ideas |
| Review | 20 min | Re-explain the concept out loud (or in writing) in your own words |

**Rules of thumb**

- If you only *read*, you will forget. If you *type and break*, you will remember.
- If a bug takes more than 20 minutes, write down: what you expected, what
  happened, what you tried, what you learned. This file becomes your personal
  debugging manual (and a great interview story).
- Every 3 stages, rebuild something from scratch with the notes closed. This is
  the single most effective test of understanding.
- Teach it. Explaining `useEffect` dependencies to someone else exposes the gaps
  faster than any tutorial.

---

## Where to go after these notes

Once you finish Stage 21:

- **Frameworks:** Next.js or React Router framework mode — file-based routing,
  server rendering, Server Components, API routes
- **Forms at scale:** React Hook Form + Zod + server-driven validation
- **Data:** TanStack Query in depth, tRPC/GraphQL clients, websockets
- **Quality:** Playwright end-to-end tests, accessibility audits (axe), CI/CD
- **Deep internals:** React Fibre, the scheduler, the compiler's internals
- **Full stack:** Node/Postgres, auth providers, queues, observability

> **Remember:** the goal was never "finish the roadmap". The goal is that when
> something breaks at 5pm on a Friday, you know *how to find out why*. That is
> what these notes train.
