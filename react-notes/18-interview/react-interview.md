# React Interview Questions: Short Answer, Then the Real One

> **Part 18 · Interview Preparation · File 1 of 4**

Why this file exists: knowing React and *explaining* React are different skills, and the second
one is what an interview measures. Every question here has two answers: a **30-second version**
(what you say first) and a **deep version** (what you say when they ask "can you go deeper?" —
which is where the job is decided). Use it as revision, but revise by *speaking the answers
out loud*, not by reading them.

Each answer links back to the part of these notes that explains it properly. If an answer feels
memorised rather than understood, go read that file.

---

## 1. The fundamentals

### What is React?

**30 seconds.** A JavaScript library for building user interfaces from components. Its core
idea is that you describe *what the UI should look like* for a given state, and React works out
what to change in the DOM. You write `f(state) → UI` instead of imperative DOM manipulation.

**Deep.** Three ideas make it work. (1) **Declarative rendering** — you return a description
of the UI (JSX → `createElement` calls → a tree of plain objects called elements), never DOM
commands. (2) **Reconciliation** — when state changes, React builds a new element tree, diffs
it against the previous one, and applies the minimum set of DOM mutations. `key` is how it
matches list items across renders. (3) **Composition** — the unit is a function that takes
props and returns elements, so UI is built by nesting functions, not by extending classes.
React is deliberately *not* a framework: no router, no data layer, no state management. That
is why the ecosystem exists, and why "which library should I use" is a real question rather
than a settled one.

### JSX: what is it actually doing?

**30 seconds.** JSX is syntax, not JavaScript. A build step (esbuild, Babel, SWC) compiles it
into function calls that return plain objects describing the UI. `{}` escapes into JavaScript;
everything rendered inside it is escaped as text.

**Deep.** `<Card title="x" />` compiles to `jsx(Card, { title: 'x' })` (the automatic runtime;
the classic runtime produced `React.createElement(...)`). The result is an **element**: an
immutable object `{ type, props, key }`. Two consequences worth saying out loud: (a) an element
is *data*, so you can store it, pass it, conditionally build it — `<Modal>{children}</Modal>`
is just an object until React renders it; (b) because it is a function call, JSX cannot
contain statements — hence `cond ? <A/> : <B/>` and `list.map(...)`, never `if`/`for`. And
since values are inserted as text, JSX is XSS-safe by default; the escape hatches are
`dangerouslySetInnerHTML` and user-controlled URLs (Part 15 file 06).

### Why does React need `key`?

**30 seconds.** Keys give React a stable identity for each item in a list so it can tell which
items were added, removed or reordered, instead of assuming position equals identity.

**Deep.** Without a key, React matches children by index. If you delete item 0, React sees
"item 0 changed, item 2 disappeared" and *reuses* the DOM node that used to be item 1 — with
its internal state and its uncontrolled DOM state (input values, focus, animation) attached to
the wrong data. That is the "I deleted a row and another row lost its text" bug. A good key is
stable, unique within the list, and comes from the data (a database id). The index is only
acceptable for a list that never reorders, never filters, and has no per-item state — which is
rare. Keys do not need to be globally unique, only unique among siblings, and they are not
passed to the component (Part 3 file 11).

### Virtual DOM — is it what makes React fast?

**30 seconds.** No. It is what makes React *predictable*. Diffing a tree of plain objects is
cheaper than reading and writing the real DOM, but a hand-written imperative update can always
beat it. The win is developer experience and correctness.

**Deep.** Say this and you will stand out: the virtual DOM is a **compilation target**, not a
performance trick. It lets React batch updates, defer work, and (in concurrent mode) interrupt
and restart rendering — none of which is possible if you mutate the DOM as you go. Real
performance in React comes from shipping less code, rendering less often, and rendering fewer
nodes (virtualisation), not from the diffing algorithm. Frameworks like Solid and Svelte skip
the virtual DOM entirely and are faster on some benchmarks — which proves the point (Part 10
files 01, 04).

---

## 2. State and hooks

### What is the difference between state and props?

**30 seconds.** Props are inputs from a parent — read-only, they flow down. State is data a
component owns and can change over time. Changing state re-renders the component; changing a
prop re-renders it because the parent re-rendered.

**Deep.** The distinction that matters in practice is *ownership*, not mutability. Ask "who
should decide this value?" — if the answer is another component, it is a prop (and the state
lives there); if it is this component, it is state. Derived values should be **neither**:
compute them during render. The most common bug in beginner code is storing a derived value in
state and then trying to keep it in sync with an effect, which creates two sources of truth
that can disagree. Rule: if you can compute it from props and state you already have, do not
store it (Part 4 files 01, 02; Part 5 file 02).

### Why can't you call hooks conditionally?

**30 seconds.** React stores hook values in an ordered list per component instance and matches
them by call position. A conditional call shifts the positions, so state gets attached to the
wrong hook.

**Deep.** On each render React walks the hook list in order: first `useState` → slot 0, second
→ slot 1, and so on. It has no names to match on — only position. If render 1 calls
`useState, useEffect` and render 2 calls `useState, useState, useEffect` (because a condition
changed), the third call reads the effect's slot as if it were state. React detects the
mismatch and throws "Rendered more hooks than during the previous render" — but the rule
exists to prevent silent corruption, and the error only catches the cases it can see. This is
also why Fast Refresh remounts a component when you add a hook during development: the hook
list changed, so the old state cannot be reused (Part 4 file 10).

### Explain `useEffect` and its dependency array.

**30 seconds.** `useEffect` runs code that synchronises your component with something outside
React — a subscription, a timer, the DOM, a network. The dependency array says *when* to
re-run: `[]` once after mount, `[a, b]` when `a` or `b` change, no array on every render. The
returned function is cleanup, run before the next execution and on unmount.

**Deep.** The mental model is **synchronisation, not lifecycle**. `componentDidMount` thinking
("run once") leads to bugs; the question is "which external system am I keeping in sync, and
what changes require me to re-sync?". Three consequences: (1) the cleanup is not optional —
without it, a re-run leaves the old subscription alive, so you get double events and leaks;
(2) dependencies must be *every* reactive value the effect reads, which is what
`exhaustive-deps` enforces — omitting one gives a stale closure, the single most common React
bug; (3) effects run **after** the browser paints, so they are wrong for work that must happen
before paint (that is `useLayoutEffect`) and wrong for data fetching in a modern app (that is a
data library with caching, deduplication and cancellation). The best effect is often no
effect: derived state, event handlers, or a data library usually replaces it (Part 4 file 03).

### `useState` vs `useReducer` — when?

**30 seconds.** `useState` for independent values. `useReducer` when several values change
together, when the next state depends on the previous one in non-trivial ways, or when you want
the update logic testable in isolation.

**Deep.** A reducer gives you three things: a single place where transitions are defined (so
illegal states are unrepresentable), a pure function you can unit-test without rendering, and
stable dispatch identity, which removes a whole category of dependency-array churn. The
signature `dispatch({ type: 'added', payload })` also self-documents. Use it for a multi-step
form, a finite state machine (`idle → loading → ready → error`), or undo/redo. Do not use it
for a single boolean — that is ceremony (Part 4 file 06).

### What is a stale closure? Give an example.

**30 seconds.** It is a function that captured an old value from a previous render, because the
function was created then and never re-created.

**Deep.** ```tsx
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);
  return () => clearInterval(id);
}, []);   // ← captures count = 0 forever; the interval sets 1 every second
```
The callback closes over the `count` from the render in which the effect ran. Because the
dependency array is empty, that callback is never replaced. Three fixes, in order of
preference: the functional updater `setCount(c => c + 1)` (no dependency on `count` at all);
adding `count` to the deps (correct, but restarts the interval every second); or a ref holding
the latest value (`countRef.current`) for cases where you truly need a stable callback. The
general lesson: **anything created inside a component closes over that render's values.** This
applies to event handlers passed to `setTimeout`, WebSocket callbacks, and `useCallback` with
missing deps (Part 4 files 03, 08).

### `useMemo` / `useCallback` / `React.memo` — when do you reach for them?

**30 seconds.** After measuring. `React.memo` skips re-rendering a component when its props are
shallow-equal; `useMemo` caches an expensive computation; `useCallback` caches a function
identity so it stays stable across renders. None of them is free, and premature use makes code
slower and harder to read.

**Deep.** The mechanism matters: `React.memo` does a **shallow** prop comparison, so it only
helps if the props are primitives or stable references — which is exactly why `useCallback`
and `useMemo` exist (to keep those references stable). So the three usually come as a set, and
the set has a cost: extra comparisons, extra memory, extra code. Reach for them when (a) the
Profiler shows a component re-rendering expensively, or (b) you are passing a callback to a
memoised child, or (c) a computation is genuinely expensive (sorting thousands of rows). And
note the modern answer: **React Compiler** automates much of this at build time, so new code
often does not need manual memoisation at all. Never memoise to "prevent re-renders" — a
re-render that takes 2 ms is not a problem; a 900 kB bundle is (Part 10 files 03, 04; Part 11
file 08).

### What is `useRef` for?

**30 seconds.** Two things: a mutable box that persists across renders without causing
re-renders, and a handle to a DOM node.

**Deep.** The defining property is that **writing to a ref does not trigger a render.** That
makes it right for values that are not part of the UI: a timer id, the previous value of a prop,
an `AbortController`, a map of measurements, the last-sent request id. It makes it wrong for
anything the user should see change. The DOM use case (`ref={inputRef}` then
`inputRef.current.focus()`) is for imperative browser APIs React does not model: focus, scroll,
selection, canvas, third-party libraries. Rules: never read or write `ref.current` *during*
render (it is a side effect and breaks with concurrent rendering), and always null-check —
`current` is `null` before mount and after unmount (Part 4 file 04).

---

## 3. Rendering and performance

### What causes a component to re-render?

**30 seconds.** Three things: its own state changes, its parent re-renders, or a context it
consumes changes. A prop changing is not itself a cause — it is a consequence of the parent
re-rendering.

**Deep.** Add the part that shows depth: **a re-render is not a DOM update.** React calls your
function, diffs the result, and touches the DOM only where the output differs. So "it
re-rendered" is often harmless, and the Profiler — not intuition — decides whether it matters.
Also worth saying: React 18+ **batches** state updates in event handlers, promises and
timeouts, so three `setState` calls usually produce one render. And `useTransition` lets you
mark an update as interruptible so urgent input stays responsive (Part 10 files 02, 09; Part 11
file 05).

### Your app is slow. How do you find out why?

**30 seconds.** Measure before changing anything: Lighthouse for load, the React Profiler for
interaction, and real-user metrics for the truth. Then fix the biggest item, and measure again.

**Deep.** Give the ordered list — this is what a senior answer looks like:
1. **Is it load or interaction?** LCP vs INP are different problems with different fixes.
2. **Load:** bundle size first (`npm run build`, visualizer). The fix is usually shipping less
   — code splitting, a lighter dependency, optimised images — not memoisation.
3. **Interaction:** the Profiler's "why did this render" and flamegraph. Look for components
   rendering often *and* expensively, and for long synchronous work in an event handler.
4. **Fix in order:** virtualise long lists, defer with `useDeferredValue`/`useTransition`,
   memoise the specific expensive thing, then consider the compiler.
5. **Verify with field data**, because your laptop is not your user's phone.
Then say the sentence that closes it: "I would not add `React.memo` anywhere until the Profiler
showed me a specific component costing a specific number of milliseconds." (Part 10 file 04;
Part 15 file 07.)

### What are keys, memoisation and virtualisation each good for?

**30 seconds.** Keys are for correctness in lists. Memoisation is for skipping work you have
already done. Virtualisation is for not doing the work at all — rendering only the rows on
screen.

**Deep.** They are often confused because all three are "performance". Virtualisation is the
only one that changes the algorithmic cost: 10,000 rows rendered as 20 DOM nodes beats any
amount of memoising 10,000 nodes. So the order is: render fewer things → render them less often
→ make each render cheaper. Reaching for `React.memo` when the problem is 10,000 DOM nodes is
optimising the wrong term (Part 10 files 03, 04).

---

## 4. Data, forms and architecture

### How do you fetch data in React?

**30 seconds.** In a modern app, with a server-state library — TanStack Query or a framework
loader. Hand-rolled `useEffect` + `fetch` works for a prototype but you end up re-implementing
caching, deduplication, retries, cancellation and race handling yourself.

**Deep.** Enumerate what the library gives you, because that is the actual argument: caching
and `staleTime`, request deduplication, automatic retries, refetch on reconnect/focus,
pagination and infinite queries, optimistic updates with rollback, and **cancellation** — which
is where hand-rolled versions break. Then show you know the underlying problem: ```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/users/${id}`, { signal: controller.signal })
    .then(r => r.json()).then(setUser).catch(() => {});
  return () => controller.abort();
}, [id]);
```
Without the abort, typing quickly in a search box can resolve out of order and show stale
results — a race condition, not a React quirk. Also mention the distinction that decides the
architecture: **server state is not client state.** It lives on someone else's machine, can
change without you, and should be cached and invalidated, not copied into `useState` (Part 7;
Part 9 file 06; Part 17 project 3).

### Controlled vs uncontrolled inputs?

**30 seconds.** Controlled: React owns the value (`value` + `onChange`). Uncontrolled: the DOM
owns it and you read it through a ref. Controlled is the default; uncontrolled is right for
file inputs, integrating with non-React libraries, and very large forms where per-keystroke
re-renders hurt.

**Deep.** React Hook Form deliberately uses uncontrolled inputs with refs, which is why a
20-field form does not re-render on every keystroke — a real, measurable difference. The
trade-off: with uncontrolled inputs you cannot derive UI from the value without subscribing, so
`watch()` exists. And the classic bug to mention: switching an input from uncontrolled to
controlled mid-life (`value={maybeUndefined}`) produces React's warning "A component is
changing an uncontrolled input to be controlled" — fix it with `value={x ?? ''}` (Part 5 files
03, 04; Part 8 file 04).

### How do components share state?

**30 seconds.** In order of preference: lift the state to the nearest common parent and pass it
down; composition and `children` to avoid prop drilling; context for cross-cutting concerns like
theme, auth and locale; a store (Zustand, Redux Toolkit) for genuinely global, frequently-read
client state; and a server-state library for anything that came from an API.

**Deep.** The insight is that **prop drilling is usually a composition problem, not a
propblem.** If you pass `user` through four components that do not use it, those components
probably should not be in the middle — pass `<Avatar user={user} />` as a child instead. Context
then becomes the tool for values that *are* cross-cutting, and its known cost is that every
consumer re-renders when the value changes, which you manage by splitting contexts and
memoising the provider value. Redux Toolkit earns its place when you need devtools time-travel,
middleware, or many slices with complex interactions — not because "global state needs Redux"
(Part 5 files 01, 02; Part 9 files 01–06).

### How do you handle errors in a React app?

**30 seconds.** Three layers: error boundaries for render crashes, `try/catch` (or a query
library's error state) for async failures, and one function that maps errors to user-facing
messages. Every data screen has pending, error, empty and success states.

**Deep.** Add the specifics that prove you have shipped something: error boundaries must be
**class components** and do **not** catch event handlers, promises or timeouts — that is the
most-cited React surprise. Place them to *contain* failure (app root, per route, per widget),
never around auth or the router. `fetch` resolves on HTTP errors, so a single `request()`
wrapper that checks `response.ok` and throws a typed `ApiError` with a `kind` is what turns
"Unexpected token <" into a friendly retry. Never render a raw `err.message` to a user; log the
original with release, commit and breadcrumbs. And distinguish recoverable (retry, refresh
token) from reportable (500s, render crashes) (Part 15 files 04, 05).

---

## 5. The questions that separate levels

### What is the difference between `React.memo` and the React Compiler?

`React.memo` is a manual, per-component runtime check you maintain by hand, and it only works
if every prop is shallow-stable. The Compiler is a **build-time** transform that analyses your
component and inserts memoisation automatically where it can prove it is safe. Practical
consequence: with the compiler you write ordinary code and delete most manual memoisation;
without it, you measure and memoise deliberately. Also worth saying: the compiler cannot fix an
algorithmic problem — 10,000 DOM nodes is still 10,000 DOM nodes (Part 11 file 08).

### Server Components — what do they change?

Components that run **only on the server**, whose output is serialised and sent to the client.
They can read a database or the filesystem directly, and their code (plus its dependencies)
never ships to the browser — which is a bundle-size win, not just a convenience. The cost: they
cannot use state, effects or event handlers, so the mental model becomes a tree where server and
client components interleave, and `'use client'` marks the boundary. If you have not used them,
say what you understand and what you have not built — a confident wrong answer is worse than an
honest boundary (Part 11 file 01).

### How would you test a React component?

**30 seconds.** With Vitest and React Testing Library: render it, query by role and accessible
name, interact with `userEvent`, assert on what the user can see. Test behaviour, not
implementation.

**Deep.** The principle is **test the contract, not the internals**: `getByRole('button', { name: /save/i })`
survives a CSS refactor and a rename of your internal handler; `wrapper.instance().handleClick()`
does not. Cover the four states (pending, error, empty, success) — the error and empty states
are where bugs live. Mock the network at the boundary with MSW so an unhandled request fails
the test. Put pure logic in modules and unit-test those without a DOM — they are faster and
more thorough. And know the pyramid's economics: many logic tests, some component tests, a few
end-to-end tests (Part 13).

### Why should authentication not rely on client-side route guards?

Because the client is entirely under the attacker's control. A guard changes what React
*renders*; it does not change what the API *allows*. Anyone can call your endpoint directly,
edit the bundle, or replay a token. So: guards are a UX feature (send the user to login,
remember where they were going, explain what permission they lack), and every endpoint must
authenticate and authorise again on the server. The same logic applies to validation — client
validation is for instant feedback, server validation is the control (Part 14; Part 15 file 06).

---

## 6. Scenario questions (the ones that feel like real work)

**"The user clicks a button twice and gets two records."** The handler is async and the button
stays enabled. Fix: disable while pending (`isPending` from your mutation, or local state), and
make the server idempotent (a client-side idempotency key) because a double-submit can also
come from a retried network request.

**"The list shows the previous search's results."** A race: two requests in flight, the slower
one resolving last. Fix: cancel with `AbortController` and ignore superseded responses, or use
a data library that does it for you. Add debouncing to reduce, not replace, the fix.

**"My `useEffect` runs twice in development."** `StrictMode` deliberately double-invokes
effects to surface missing cleanup. It does not happen in production. The correct response is to
make the effect idempotent — add the cleanup — not to remove `StrictMode`.

**"The input loses focus after every keystroke."** The component is being **remounted**, which
means its identity changed: a component defined inside another component's body, a `key` that
changes, or a conditional that swaps the element type. Fix the identity, not the input.

**"State resets when I only changed the CSS."** Same cause: something changed the component's
position or key in the tree. Check for a component defined inside `render`, and for
`key={someChangingValue}`.

**"The app is blank after a deploy until I hard-refresh."** `index.html` is being cached, so
users request chunk filenames that no longer exist. Fix the cache headers (HTML `no-cache`,
hashed assets immutable), not the app.

**"It works in dev but not in production."** Different programs. Check: `npm run preview` (not
dev), env vars actually present at build time, `base` path, minification-sensitive code, and
source maps to read the real error (Part 16 files 01, 03).

---

## 7. Questions to ask them

Interviews are two-way, and good questions signal seniority:

- "What does your deployment pipeline look like, and how often do you ship?"
- "How do you decide between client and server state? Do you use a data library?"
- "What does your error monitoring look like — do you know your current error rate?"
- "How is the codebase structured, and how do you enforce those boundaries?"
- "What is the oldest part of the codebase, and what would you change about it?"
- "How do you handle performance regressions — budgets in CI, or after the fact?"

---

## 8. How to revise with this file

1. **Speak the 30-second answers out loud**, without reading. If you stumble, you do not know
   it yet.
2. **For each question, name a time it bit you.** "Stale closure — I had an interval that never
   updated because the deps array was empty" is worth more than a textbook definition.
3. **Draw the diagrams**: the render/commit phases, the data-down/events-up map, the auth
   refresh sequence, the four UI states.
4. **Re-read the parts you cannot summarise.** If you cannot explain `useEffect` as
   synchronisation in three sentences, go back to Part 4 file 03.
5. **Build something small with the notes closed.** That is the only test that cannot be gamed.

---

**What's next →** [`javascript-interview.md`](./javascript-interview.md) — the JavaScript
questions that come up in React interviews: closures, `this`, the event loop, promises,
equality, and immutability, each tied back to the React bug it causes.
