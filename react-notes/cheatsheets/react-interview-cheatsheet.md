# React Interview Cheatsheet — Rapid Revision

> **Reference · Cheatsheet 9 of 9**
> The night-before page. Every line is a complete answer for the first thirty seconds; the chapters behind each answer are in [Part 18](../18-interview/react-interview.md).

---

## 1. The five-sentence self-introduction

```text
"I build React + TypeScript front ends. I work mostly with Vite, React Router and a query cache
(TanStack Query) rather than hand-rolled effects. My last project was a task board with optimistic
updates, rollback, role-gated routes and a test suite (Vitest + Testing Library + MSW) that runs in
under a minute. I care about two things: where state lives, and what happens when the network fails.
I am happy in either a design-system-heavy app or a data-heavy one."
```

Adjust with your own numbers. Naming your decisions and their trade-offs beats listing technologies.

---

## 2. React core in 30 lines

| Question | Answer |
| --- | --- |
| Component | a function returning UI; capitalised; pure; returns JSX, `null`, or a string/number |
| Props | read-only inputs from the parent; defaults in the signature; `children` is just a prop |
| State | internal, changed only through the setter; a snapshot per render |
| Re-render triggers | state change, parent render, context change, forced update |
| Re-render ≠ DOM update | React diffs and touches only what changed |
| `key` | stable identity between renders; from data, never the index (unless static) |
| Controlled input | value + onChange from state — React is the source of truth |
| Uncontrolled input | the DOM owns the value; read via `FormData`/ref |
| Lifting state | move shared state to the closest common parent |
| Composition | `children` and slots beat prop soup |
| Side effect | anything outside React: subscriptions, timers, DOM APIs |
| Purity | same props/state → same output; no mutation during render |

---

## 3. Hooks in one table

| Hook | One-liner | Gotcha |
| --- | --- | --- |
| `useState` | state that re-renders | use the updater form when updates queue |
| `useEffect` | synchronise with the outside world | list all reactive deps; return a cleanup |
| `useRef` | value that survives without re-rendering | never render from `ref.current` |
| `useContext` | read an ancestor value | memoise the provider's `value` |
| `useReducer` | named state transitions | best when values change together |
| `useMemo` | cache a value | shallow compare; pointless if inputs change every render |
| `useCallback` | cache a function | needed for effect deps and `memo`ed children |
| `useId` | stable accessibility ids | do not use as a list key |
| `useLayoutEffect` | before paint | blocks painting — measure first |
| `useTransition` | keep the UI responsive | `isPending` for the slow part |
| `useDeferredValue` | lagging copy of a value | for values you do not own |
| `useOptimistic` | show the result before confirmation | scoped to the action's lifetime |
| `useActionState` | form action + pending + errors | works with uncontrolled inputs |
| `useFormStatus` | pending for a child of a form | must be inside the `<form>` |
| `use` | read a promise/context conditionally | wrap in Suspense + error boundary |
| `useSyncExternalStore` | subscribe to an external store | library authors mostly |

**Rules:** top level only · from components or hooks · effects clean up · dependencies complete.

---

## 4. Rendering and performance

| Question | Answer |
| --- | --- |
| Why did my component render twice? | StrictMode in dev (expected); or an effect setting state; or an unmount/remount |
| Why does the parent's render re-render the child? | nothing stops it — `memo`/compiler can |
| Do you need `useMemo` everywhere? | no; measure; with React Compiler it is usually unnecessary |
| How do you optimise a long list? | window/paginate first, then state placement, then memoisation |
| What does React Compiler change? | automatic memoisation at build time; requires the Rules of React; effects can fire differently |
| How do you measure? | React DevTools Profiler + render counters; bundle visualiser for size |
| What is reconciliation? | diffing the new element tree to compute the minimal DOM update |
| Suspense? | render a fallback while something async is pending (lazy routes, `use(promise)`) |
| Error boundary? | class component catching render errors in its subtree; not event/async errors |
| Code splitting? | `lazy`/dynamic `import()` so a route's JS loads on demand |

---

## 5. State, context, stores

| Question | Answer |
| --- | --- |
| Context vs props | context for deep, low-frequency, app-wide values; props everywhere else |
| Context vs Redux | context: rare changes (theme, session). Redux/Zustand: many writers, complex updates, selectors, DevTools |
| Is Redux required for large apps? | no — one trade-off among several |
| Where does server data live? | a query cache (TanStack Query / RTK Query / loaders), not in your store |
| Where does form state live? | React Hook Form, or `useActionState` + uncontrolled inputs |
| Where does UI state live? | closest component that needs it; URL for shareable state |
| Derived state? | compute during render (or `useMemo`); never store a second copy |
| Impossible states? | make them unrepresentable with a discriminated union |

---

## 6. Data fetching

| Question | Answer |
| --- | --- |
| Why not fetch in `useEffect`? | no cache, no deduplication, no cancellation, duplicated loading/error code |
| Four states? | idle / loading / success / error — as a union |
| Does `fetch` throw on 404? | no — check `response.ok` |
| How do you cancel? | `AbortController` + `signal`; ignore `AbortError` |
| Stale response wins? | abort the previous request; guard with `signal.aborted` |
| Retry a 404? | never; retry 5xx/network, often with backoff and a cap |
| Optimistic update? | snapshot → write → rollback on error → invalidate on settle |
| Typing responses? | `unknown` + parse/validate (Zod); never `as` |
| Testing? | MSW: fake the network, keep the base URL consistent with the app |

---

## 7. Routing, auth, forms

| Question | Answer |
| --- | --- |
| Client routing | `history.pushState` + re-render; the server needs an SPA fallback |
| When to use the URL | shareable/back-button state: filters, tabs, pagination, ids |
| `useParams` vs `useSearchParams` | path = which resource; query = how it is displayed |
| Guard a route? | `loading`/`anonymous`/`authenticated` + redirect with `state.from` + role check |
| Is a guard security? | no — the API must enforce authorization |
| Lazy route warning? | `HydrateFallback` must be on a non-lazy route |
| Actions vs controlled forms? | actions for submit-driven forms (pending + errors for free); controlled for live input |
| Client validation? | a courtesy for UX; the server validates too |
| 401 vs 403? | not authenticated vs authenticated but not allowed — different screens |

---

## 8. TypeScript in React

| Question | Answer |
| --- | --- |
| Props typing | an exported `interface`/`type` + destructured parameter; avoid `React.FC` |
| `children` type | `ReactNode` (or `ReactElement` for exactly one) |
| Event types | `ChangeEvent<HTMLInputElement>`, `FormEvent<HTMLFormElement>`, … or infer inline |
| Ref type | `useRef<HTMLInputElement \| null>(null)` (React 19 requires the argument) |
| State type | `useState<User \| null>(null)`, unions for modes/statuses |
| Context type | explicit interface, `null` default, a `useX()` hook that throws if unset |
| Generic component | `function List<T>({ items, renderItem }: ListProps<T>)` |
| Utility types | `Pick`, `Omit`, `Partial`, `Record`, `ReturnType`, `Awaited`, `NonNullable` |
| Narrows | `typeof`, `in`, `instanceof`, discriminant checks, `value is T` predicates |
| `any` vs `unknown` | `any` disables checking and spreads; `unknown` forces narrowing at the boundary |
| TS2322 | a value of the wrong type (often `string` where `number` is expected) |
| TS18048 | “possibly undefined” — handle it (`?.`, `??`, early return) |

---

## 9. Scenario answers (the shape to say out loud)

```text
1. Reproduce: what exactly happens, for whom, since which release?
2. Isolate: which component/query/route? (Profiler, logs, render counters, network tab)
3. Explain: name the mechanism — new identity, stale closure, missing cleanup, race, cache key.
4. Fix: the smallest change that addresses the cause (not the symptom).
5. Prevent: the test, lint rule, type, or checklist item that stops it from returning.
```

| Symptom | First suspicion |
| --- | --- |
| Renders twice | StrictMode (dev); effect setting state; remount via key/inline component |
| Infinite loop | state set during render; effect with an unstable dependency |
| State does not update | mutated array/object; read before the re-render |
| API called repeatedly | unstable dep; fetch in render; several components fetching independently |
| Old result overwrites new | no cancellation (race) |
| Input loses focus | remount: inline component or changing `key` |
| Wrong row changes | index as key |
| List is slow | render fewer rows (windowing), then state placement |
| Bundle too big | heavy dependency in the entry; no route splitting |
| Data leaks between users | cache not cleared/segmented on logout; server authorization |

---

## 10. Security and production, in six lines

1. Frontend validation and route guards are **UX**; authorization belongs on the server.
2. React escapes text — XSS comes from `dangerouslySetInnerHTML`, unsanitised URLs, and injected scripts.
3. Tokens in `localStorage` are XSS-readable; `HttpOnly` cookies need CSRF protection. Pick and document the trade-off.
4. Anything with a `VITE_` prefix is public — no secrets in the bundle.
5. Env-specific config is validated at startup (`zod` schema), never defaulted silently.
6. Deploys: hashed assets + `no-cache` HTML + SPA fallback + source maps in the tracker + a rollback path.

---

## 11. Testing in one table

| Level | Tool | What to test |
| --- | --- | --- |
| Unit (pure) | Vitest | reducers, formatters, validation, parse functions |
| Component | Testing Library + user-event | behaviour through roles/labels/text; all four states |
| Integration | Testing Library + MSW | routes, guards, query cache, optimistic rollback |
| End-to-end | Playwright | a few critical journeys against a real build |
| Accessibility | roles + axe | names, focus, keyboard, announcements |

**Query order:** role → label → text → `data-testid` (last resort). **Assert behaviour, not internals.**

---

## 12. Version facts worth quoting (2026)

| Fact | Detail |
| --- | --- |
| React 19 | `ref` as a prop (no `forwardRef`), `<Context value>` (no `.Provider`), actions, `useActionState`, `useOptimistic`, `useFormStatus`, `use`, `useRef` requires an argument |
| React Compiler 1.0 | stable since Oct 2025; build-time memoisation; `"use no memo"` to opt out; leave existing `useMemo`/`useCallback` in place while adopting |
| Create React App | deprecated — Vite (`react-ts`) or a framework |
| React Router v8 | `react-router` only (no `react-router-dom`); DOM APIs from `react-router/dom`; three modes (declarative, data, framework) |
| Vite 8 | Rolldown + Oxc; `esbuild`/`babel` options ignored; no type-checking in `build` |
| TanStack Query v5 | `isPending` (not `isLoading`) for the first load; `gcTime` (was `cacheTime`) |
| Node | 22 LTS baseline for current tooling |

---

## 13. Ten answers that get you hired

1. **“Where does this state live?”** — asked before every `useState`; the answer is local, parent, URL, context, cache or store — with a reason.
2. **“What happens when it fails?”** — every data path has loading, empty, error and permission states.
3. **“How would you test that?”** — name the test before the implementation: behaviour, roles, fakes at the network boundary.
4. **“Measure it.”** — Profiler/render counts/bundle visualiser, not opinions.
5. **“Trade-off, not winner.”** — Context vs Redux, controlled vs uncontrolled, SPA vs SSR, memo vs compiler.
6. **“The client is not a trust boundary.”** — authorization is server-side.
7. **“Accessibility is part of done.”** — labels, roles, focus, `aria-live`, keyboard.
8. **“Do not memorise — reason.”** — walk the mechanism, then name the consequence.
9. **“Here is a bug I shipped.”** — a real story with the cause and the test you added afterwards.
10. **“I would read the docs.”** — React's own reference for version-sensitive behaviour, not a five-year-old blog post.

---

## The last page: use your own project

Interview answers are far more convincing when they come from something you built. The six apps in
[`../../react-lab/`](../../react-lab/README.md) are exactly that material — the optimistic update
with rollback, the stale-response race, the 403 that the guard could not stop, the 62 tests that run
in half a minute. Read the code, change it, break it, then explain what happened.

- Full question banks: [`../18-interview/react-interview.md`](../18-interview/react-interview.md),
  [`../18-interview/javascript-interview.md`](../18-interview/javascript-interview.md),
  [`../18-interview/typescript-interview.md`](../18-interview/typescript-interview.md),
  [`../18-interview/scenario-based-questions.md`](../18-interview/scenario-based-questions.md).
- The error decoder: [`../common-errors.md`](../common-errors.md).
