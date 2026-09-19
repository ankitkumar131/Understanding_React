# React Interview Cheat Sheet — Rapid Revision

> The night before. One line per idea, the answer that shows depth, and the mistake that gives
> you away. Full answers: [Part 18](../18-interview/)

## The 30-second definitions

| Term | One line |
| --- | --- |
| **React** | A library for building UIs by describing what they should look like for a given state |
| **JSX** | Syntax that compiles to function calls returning plain objects (elements) |
| **Element** | An immutable `{ type, props, key }` object — data, not a DOM node |
| **Component** | A function that takes props and returns elements |
| **Props** | Read-only inputs from a parent |
| **State** | Data a component owns; changing it schedules a re-render |
| **Reconciliation** | Diffing the new element tree against the old and applying minimal DOM changes |
| **Virtual DOM** | A compilation target that enables batching and interruption — not a speed trick |
| **Key** | A stable identity for a list item, so React matches nodes across renders |
| **Hook** | A `use*` function that gives a function component state or an outside-world connection |
| **Effect** | Synchronisation with something outside React, plus its cleanup |
| **Context** | A value provided high in the tree and read anywhere below, skipping props |
| **Suspense** | A boundary that shows a fallback while a child is not ready |
| **Error boundary** | A class component that catches render errors in its subtree |
| **Code splitting** | Cutting the bundle at dynamic `import()` boundaries so code loads on demand |
| **Hydration** | Attaching event handlers to server-rendered HTML (SSR frameworks) |

## The answers that separate levels

**"Why does React need keys?"** Position is not identity. Without a key, deleting row 0 makes
React reuse row 1's DOM node — with its input value and component state — for different data.

**"Is the virtual DOM what makes React fast?"** No. It makes React *predictable* and enables
batching and interruption. Real performance is shipping less code and rendering fewer nodes.

**"What is `useEffect` for?"** Synchronising with an external system — not lifecycle. That is why
the cleanup is mandatory and why derived state does not belong in one.

**"What causes a re-render?"** Own state change, parent re-render, or a consumed context value
changing identity. A prop changing is a consequence, not a cause. And a re-render is not a DOM
update.

**"Why can't hooks be conditional?"** React matches hooks by call position. A conditional shifts
the positions and state lands on the wrong hook.

**"When do you memoise?"** After the Profiler shows a specific cost. Memoisation is not free, and
React Compiler now automates much of it.

**"How do you fetch data?"** A server-state library — caching, deduplication, retries,
cancellation and race handling are the argument, not convenience.

**"How do you handle errors?"** Boundaries for render crashes (they do *not* catch handlers or
promises), `try/catch` for async, one `userMessage()` mapping, and four states on every data
screen.

**"Why isn't client-side validation enough?"** The client is the attacker's machine. Client
validation is UX; the server is the control.

## The ten sentences to be able to say

1. "State is immutable — I create a new object or array, because React compares references."
2. "If I can compute it from props and state, I do not store it in state."
3. "Dependencies list every reactive value the effect reads; that is what prevents stale closures."
4. "The cleanup function is what makes an effect idempotent — which `StrictMode` verifies for me."
5. "`fetch` resolves on HTTP errors, so my API layer checks `response.ok` and throws a typed error."
6. "Server state is not client state — it lives on someone else's machine and gets invalidated, not copied."
7. "Keys come from the data. The index is a bug waiting for a delete."
8. "I measure before optimising; most slow React apps ship too much JavaScript."
9. "Route guards are UX. Every endpoint authorises again on the server."
10. "`npm run dev` and the production build are different programs, so I test with `npm run preview`."

## Scenario → mechanism → fix

| Symptom | Mechanism | Fix |
| --- | --- | --- |
| Renders twice in dev | `StrictMode` double-invokes | Keep it; add the missing cleanup |
| Input loses focus per keystroke | The component remounts (new type/position/key) | Hoist the component; use a stable key |
| State resets unexpectedly | Remount, or an effect depending on a new object each render | Depend on `task.id`, or `key={task.id}` |
| Effect loops forever | A new object/function identity in the deps | Depend on primitives; `useMemo`/`useCallback` |
| Previous search's results shown | A race — the slower response resolved last | `AbortController` in the cleanup |
| Wrong row after a delete | Index keys | `key={item.id}` |
| Checkbox not updating | `value` instead of `checked` | `checked={done}` + `onChange` |
| Double-created record | Async handler, enabled button | Disable while pending + server idempotency |
| Works in dev, breaks in prod | Different programs | `npm run preview`; check env, `base`, minification |
| Context re-renders everything | A new value object every render | `useMemo` the value; split state and actions |
| Blank after deploy | `index.html` cached → stale chunk names | HTML `no-cache`, assets `immutable` |
| 404 on deep-link refresh | No SPA rewrite rule | Add the host rewrite |
| "undefined is not a function" shown to users | Raw `err.message` rendered | One `userMessage()` mapping |
| `useState([])` type error | Inferred as `never[]` | `useState<Item[]>([])` |
| Session expires, app silently breaks | Nothing handles 401 | Refresh once in the HTTP client, then log out |

## The four UI states (say this unprompted)

```text
pending  → skeleton or spinner, with role="status"
error    → a message a user can act on, plus retry when it is retryable
empty    → distinct from "no results": "Nothing here yet" vs "Nothing matches"
success  → the data
```

Every screen that loads data has all four. The empty state is the one people forget.

## Numbers worth knowing

| Metric | Good |
| --- | --- |
| LCP | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| FCP | < 1.8 s |
| TTFB | < 800 ms |

INP replaced FID in March 2024. If a dashboard still says FID, it is out of date.

## Trade-off questions (they are testing judgement, not facts)

| Question | The shape of a good answer |
| --- | --- |
| Context vs Redux vs Zustand | Depends on scope and read frequency: context for slow cross-cutting values, a store for global frequently-read client state, and neither for server data |
| Redux vs Zustand | Redux for devtools, middleware and large-team structure; Zustand for a global store without the ceremony |
| `useMemo` vs the compiler | Manual memoisation is measurable and targeted; the compiler automates it. Neither fixes an algorithmic problem |
| SSR vs SPA | SSR for first paint and SEO on content-heavy public pages; SPA for authenticated app-like tools. Both are fine answers with a reason |
| CSS Modules vs Tailwind | Scoping and familiarity vs consistency and density. Pick one and be consistent |
| `localStorage` vs cookies for tokens | `localStorage` risks XSS theft; cookies risk CSRF. Neither is free — and a strict CSP is what makes `localStorage` survivable |
| Unit vs component vs E2E | Many fast logic tests, some component tests through accessible roles, a few E2E. Test behaviour, not implementation |

## Questions to ask them

- "How often do you deploy, and what does the pipeline look like?"
- "How do you separate client and server state?"
- "Do you know your current error rate? What does monitoring look like?"
- "How is the codebase structured, and how is that enforced?"
- "What is the oldest part of the codebase, and what would you change about it?"

## The honest-answer rule

If you have not used something, say what you understand and what you have not built:
"I have not shipped Server Components; my understanding is that they run on the server and their
code never reaches the bundle, which is a bundle-size win, but I have not dealt with the
server/client boundary in practice."

A confident wrong answer costs you the offer. A precise boundary costs you nothing.

## Revision plan for the last day

```text
1. Speak the 30-second definitions out loud. Stumbling = not known.
2. For each, name a time it bit you. Stories beat definitions.
3. Draw: render/commit phases, data-down/events-up, the auth refresh flow, the four UI states.
4. Re-read the parts you cannot summarise in three sentences.
5. Build something small with the notes closed — the only test that cannot be gamed.
```
