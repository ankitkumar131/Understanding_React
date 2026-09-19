# 01 — React 19: What Changed and What It Means for Your Code

> **Part 11 · Modern React · File 1 of 8**

Why this file exists: every version of React adds APIs, and a beginner cannot tell which additions are *the new way to do things* and which are extras for specific problems. So this file is a tour of React 19 with a filter on it: **what changed in a way that changes the code you write**, measured on the version this book's lab runs (React 19.3.0, jsdom 30.1.0). Four changes matter for everyday code — `<Context>` as a provider, `ref` as an ordinary prop with cleanup functions, document metadata written from components, and two new APIs (`<Activity>`, `useEffectEvent`). Everything else in Part 11 (actions, `useActionState`, `useFormStatus`, `useOptimistic`, `use()`, the compiler) gets its own file, because each of them is a real change to *how* you write forms, async code and data loading.

The measured claims in this file come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-react19-probe.tsx`; the API list comes from `node -e "import('react').then(r => console.log(Object.keys(r).sort().join(' ')))"` on the installed version.

---

## 1. The one-line summary of React 19

React 19 is the release in which **async work becomes a first-class part of the rendering model**. Before it, every async interaction had to be hand-modelled: an `isSubmitting` boolean, a `try/catch`, an error state, a `finally` that turned the flag off, and a pile of `setState` calls — the "three state variables per button" problem that Part 8's forms and Part 7's mutations both ran into. React 19 lets you hand React an async function and says: *I will track the pending state, I will keep the UI responsive while it runs, I will make the newest one win, and I will give you hooks to read all of that.*

The new vocabulary, which the rest of this part covers file by file:

| API | One-line purpose | File |
| --- | --- | --- |
| **Action** | any function passed to `startTransition` / `<form action>`; may be async | 02 |
| `<form action={fn}>` | a form that submits through an action, with automatic reset | 03 |
| `useFormStatus()` | pending + data from inside a form's child | 03 |
| `useActionState()` | state, pending and a wrapped action, for form/action flows | 04 |
| `useTransition()` | `isPending` for non-blocking updates (now accepts async functions) | 05 |
| `useOptimistic()` | show the expected result before the server answers, roll back on failure | 06 |
| `use(promise \| context)` | read a promise or a context anywhere, including conditionally | 07 |
| React Compiler | automatic memoisation at build time | 08 |

Three further changes are *removals of ceremony* rather than new features, and they are the ones you will notice in ordinary component code — sections 3, 4 and 5 measure all three.

---

## 2. First, confirm what you are running

⚠️ Version-sensitive writing starts with knowing the version. Two commands, run in your project:

```bash
npm ls react react-dom          # what is installed
node -e "console.log(require('react/package.json').version)"
```

```text
react@19.3.0
```

And for the API surface of the installed version — this is the honest way to answer "does this build actually have `useEffectEvent`?":

```bash
node -e "import('react').then(r => console.log(Object.keys(r).sort().join(' ')))"
```

```text
Activity Children Component Fragment Profiler PureComponent StrictMode Suspense ViewTransition
cache cacheSignal createContext createElement createRef forwardRef lazy memo startTransition
unstable_useCacheRefresh use useActionState useCallback useContext useDebugValue useDeferredValue
useEffect useEffectEvent useId useImperativeHandle useInsertionEffect useLayoutEffect useMemo
useOptimistic useReducer useRef useState useSyncExternalStore useTransition version …
```

💡 `forwardRef` is still exported (nothing was deleted that would break imports), but it is **no longer needed** — that is the difference between "removed" and "still available for compatibility", and it matters when you read older tutorials.

---

## 3. `<Context>` is the provider now

**Before React 19:**

```tsx
<ThemeContext.Provider value="dark">
  <ThemeReader />
</ThemeContext.Provider>
```

**React 19 onward:**

```tsx
<ThemeContext value="dark">
  <ThemeReader />
</ThemeContext>
```

```text
=== A. <Context value> replaces <Context.Provider value> ===
   rendered: dark
   no deprecation warning was logged: React 19 accepts the context as the provider
```

`ThemeContext.Provider` still works, so this is not a migration emergency. The reason to switch is noise: the provider was the only place where a context object itself was used as a component, which read like a quirk. Prefer `<ThemeContext value={…}>` in new code; if a file already uses `.Provider` consistently, changing it is a pure readability edit and can wait.

💡 Everything Part 9 taught about context still applies — the value is compared by identity, split contexts when the value changes for unrelated reasons, and put the actions in a context of their own. The rewrite is syntactic; the semantics did not move.

---

## 4. `ref` is an ordinary prop, and ref callbacks can clean up

Two changes, both measured.

**Change 1 — you no longer wrap a component in `forwardRef` to accept a ref:**

```tsx
// Before: a wrapper whose only purpose was to forward a ref
const Input = forwardRef<HTMLInputElement, Props>(function Input(props, ref) {
  return <input ref={ref} {...props} />;
});

// React 19: ref arrives as a normal prop, typed like any other
function Input({ ref, ...props }: Props & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}
```

**Change 2 — a ref callback may return a cleanup function**, which React calls when the node is detached (instead of the old, awkward `ref={node => … ; ref={null} => …}` dance):

```text
=== B. ref callbacks can return a cleanup function ===
   after mount: attach INPUT
   after unmount: attach INPUT | cleanup
```

```tsx
// src/dev/react19-probe.tsx
<input
  aria-label="focused"
  ref={(node) => {
    refLog.push(`attach ${node === null ? 'null' : node.tagName}`);
    return () => {
      refLog.push('cleanup');   // ← React calls this when the node is removed
    };
  }}
/>
```

⚠️ The trap in the new API is TypeScript's arrow-function shorthand: `ref={node => (node.dataset['x'] = '1')}` **returns** the assignment's value, and React 19 treats a non-function return as an error-ish value (it warns, and the old implicit-return pattern is no longer silently ignored). Use a block body: `ref={(node) => { node.dataset['x'] = '1'; }}`. The same rule applies to `useImperativeHandle`, where the returned object is now explicitly the cleanup-shaped API.

💡 Where this pays off: imperative libraries. A chart that needs `new Chart(node)` on attach and `chart.destroy()` on detach now expresses both in one place instead of splitting them across a ref callback and an effect.

---

## 5. Document metadata written from a component

`<title>`, `<meta>` and `<link>` rendered anywhere in your component tree are hoisted into `<head>`:

```text
=== E. Document metadata written from a component is hoisted to <head> ===
   document.title: "Product page — React Lab"
   meta in <head>: true
   article body: body
   after unmount, document.title: ""
```

```tsx
// src/dev/react19-probe.tsx
function MetadataCase() {
  return (
    <article>
      <title>Product page — React Lab</title>
      <meta name="description" content="Written from inside a component" />
      <p>body</p>
    </article>
  );
}
```

Four facts worth knowing, all from the transcript:

1. **`document.title` changed** — the `<title>` element did not stay inside `<article>`; React moved it into `<head>`.
2. **The meta tag is in `<head>` too** (`meta in <head>: true`).
3. **The body still rendered normally** (`article body: body`) — the metadata elements are hoisted, not cloned.
4. **Unmounting removes it**: `document.title` became `""` after unmount. Metadata is *rendered state*, not a permanent mutation, which is exactly the difference from the `useEffect(() => { document.title = … })` pattern that Part 4 taught as the manual approach. If two components render a `<title>`, React picks one (the last one that rendered in the tree) — the same "one value wins" rule as any other duplicated key.

💡 The old pattern still has a place: when the title depends on data (a fetched product name) or must be computed with side effects, an effect is fine. For static or prop-derived metadata, the element is shorter, works during SSR, and cleans itself up.

⚠️ **What this does not do:** it does not give you SEO magic client-side, and it does not deduplicate arbitrary `<link rel="stylesheet">` semantics by itself — stylesheet handling is what the `precedence` prop (below) is for.

---

## 6. Stylesheets, scripts and resource hints

React 19 added supported props and functions for resources that used to require a manual `<head>` manipulator:

| Tool | What it does | Where |
| --- | --- | --- |
| `<link rel="stylesheet" precedence="default" href="…">` | deduplicates stylesheets and orders them by `precedence`; Suspense waits for the sheet before showing content | a component |
| `<script async src="…">` | deduplicated by `src`; async scripts render into `<head>` | a component |
| `preload(href, options)` / `preloadModule` | emit `<link rel="preload">` for a resource or preload an ES module | `react-dom` |
| `preinit(href, options)` | fetch **and** execute a stylesheet or script immediately | `react-dom` |
| `prefetchDNS(domain)` / `preconnect(domain)` | warm up DNS/TLS for a domain you know you will call | `react-dom` |

These are the working tools behind "load the font before the first paint" and "start the API domain handshake early" advice in Part 15. Two rules keep them honest: call `preconnect` only for origins you are *about to* use (each one costs a socket), and let `precedence` do the ordering instead of fighting CSS specificity with `!important`.

---

## 7. `<Activity>` — hide a subtree without losing its state

`<Activity mode="visible" | "hidden">` is the newest of the changes and the one most likely to change how you build tabs, modals and router transitions. In `hidden` mode React:

- keeps the subtree's **state**,
- **cleans up its effects** (so timers, subscriptions and intervals stop),
- leaves the DOM in place but hides it with `display: none !important`,
- deprioritises its updates and pre-renders it in the background.

Measured:

```text
=== C. <Activity mode="hidden"> preserves state and detaches effects ===
   visible value: "kept while hidden"
   hidden: wrapper style="display: none !important;", DOM nodes still present: true
   effects: Heavy:effect=1 Heavy:cleanup=1
   after showing again: value="kept while hidden" effects=Heavy:effect=2 Heavy:cleanup=1
```

Read the numbers carefully, because they are the whole idea: while hidden, the effect **cleaned up** (`Heavy:cleanup=1`) but the typed value survived (`value="kept while hidden"`), and when it became visible again the effect **re-ran** (`Heavy:effect=2`) while the value was still there.

```tsx
// src/dev/react19-probe.tsx
<Activity mode={visible ? 'visible' : 'hidden'}>
  <Heavy />
</Activity>
```

Compare the alternatives you now have for "keep it around but do not show it":

| Approach | State kept? | Effects while hidden? | DOM kept? | Use when |
| --- | --- | --- | --- | --- |
| `{visible && <Heavy />}` | ❌ lost | n/a | ❌ removed | a fresh start is what you want |
| `display: none` via CSS | ✅ | ✅ **still running** | ✅ | you want it fully alive (rare) |
| **`<Activity mode="hidden">`** | ✅ | ❌ cleaned up | ✅ (hidden) | tabs, side panels, back/forward navigation |
| `key` change | ❌ lost | re-run | ❌ recreated | deliberate reset (Part 10, file 02) |

⚠️ Two caveats: `<Activity>` is recent, so check the version and the docs before adopting it in a codebase that must support older React; and hidden content is still *rendered*, so an expensive hidden subtree costs render time (that is why React deprioritises it — but do not hide 5,000 rows and expect a free lunch).

---

## 8. `useEffectEvent` — the end of "stale closure" workarounds in effects

The classic effect bug from Part 4: an effect subscribes once (empty dependency array) but its callback needs the *latest* props. Adding the prop to the dependency array re-subscribes on every change; leaving it out freezes the first value. The old workarounds were a ref mirror or an eslint-disable.

`useEffectEvent` solves it directly: wrap the non-reactive logic in an Effect Event, call it from the effect, and it always sees the latest values **without** re-running the effect.

```text
=== D. useEffectEvent: one effect run, always-fresh values ===
   effect event fired with "first"
   effect event fired with "first"
   effect event fired with "second"
   effects: Echo:effect=1
   effect event fired with "second"
   effect event fired with "second"
```

```tsx
// src/dev/react19-probe.tsx
function Echo({ message }: { message: string }) {
  const onTick = useEffectEvent(() => {
    say(`effect event fired with "${message}"`);   // always the latest message
  });
  useEffect(() => {
    const id = setInterval(onTick, 10);            // subscribed once
    return () => clearInterval(id);
  }, []);                                          // ✅ no dependency on message
  return <p>{message}</p>;
}
```

`Echo:effect=1` — one subscription across the whole life of the component — while the ticks printed `first` before the prop changed and `second` after. That is the combination that used to be impossible without a ref.

⚠️ **Rules:** Effect Events are for *effects and other Effect Events only* — React forbids calling them during render or passing them to child components as event handlers (lint will tell you). If a value is used only inside the event, it belongs in the Effect Event, not the dependency array. If you are on React 18, keep using the ref mirror pattern from Part 4 until you upgrade.

---

## 9. Hydration, error messages and owner stacks

Three developer-facing improvements worth knowing when you hit them, none of which change your code:

1. **Better hydration error diffs.** Part 6's "server HTML did not match" messages are now a single, readable diff with the mismatching element highlighted instead of a wall of text.
2. **Owner stacks in development.** When a component throws, the error includes *which component rendered it* (`at ProductRow`, `at ProductsPage`) rather than only the internal React frames — much closer to what you actually needed.
3. **`captureOwnerStack()`** — a `react` export for logging the component stack yourself, used by error tooling.

---

## 10. What React 19 removed or deprecated

⚠️ This is the section that keeps you from copying a 2021 tutorial. All of the following are gone or removed from function components; if you see them, you are reading old code:

| Removed / deprecated | Replacement | Notes |
| --- | --- | --- |
| `propTypes` | TypeScript | types are checked at build time, no runtime cost |
| `defaultProps` on function components | default parameter values | `function Card({ size = 'md' }: Props)` |
| String refs (`ref="input"`, `this.refs`) | `useRef` / ref callbacks | class-era API, never teach it |
| Legacy context (`contextTypes`) | `createContext` + `useContext` | — |
| `ReactDOM.render`, `hydrate` | `createRoot`, `hydrateRoot` | since 18 |
| `unmountComponentAtNode` | `root.unmount()` | — |
| `findDOMNode` | refs | — |
| `react-test-renderer` | Testing Library (Part 13) | deprecated; do not start with it |
| `forwardRef` | `ref` as a prop | still exported for compatibility |
| `<Context.Provider>` | `<Context>` | still works |

Deprecated-but-present in 19.3: `useFormState` (renamed to `useActionState`), `unstable_useCacheRefresh`, and the `useFormStatus`/`useActionState` pairing notes you will see in file 03.

---

## 11. The 19.x timeline, as facts rather than rumours

| Version | Main additions (as relevant to this book) |
| --- | --- |
| **19.0** | actions, `useActionState`, `useFormStatus`, `useOptimistic`, `use()`, `ref` as a prop, ref cleanup functions, document metadata, stylesheet/script/preload support, `<Context>` as provider, hydration diffs, `propTypes`/`defaultProps` removal |
| **19.1** | owner stacks for better debugging, small Suspense and error-message improvements |
| **19.2** | `<Activity>`, `useEffectEvent`, `cacheSignal`, Performance Tracks in DevTools, partial pre-rendering (framework-level) |
| **19.3** | the version this book's lab runs; the API list quoted in section 2 is the source of truth for what your install has |

💡 **How to keep this current without reading release notes every week:** (1) check the version you actually installed (section 2), (2) when a tutorial uses an API you have never seen, `node -e "import('react')…"` the exports — if it is exported, it exists; if not, the tutorial is from an unreleased branch or an older/newer version, and (3) prefer the official documentation, which is versioned alongside the release.

---

## 12. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Using `forwardRef` in new code | unnecessary ceremony; the ref API moved on | accept `ref` as a prop (section 4) |
| 2 | `ref={node => (node.id = 'x')}` | an implicit return of the assignment; React expects a cleanup function or nothing | use a block body |
| 3 | Assuming `defaultProps` still works on a function component | they are removed; your defaults silently do nothing | default parameters |
| 4 | Setting `document.title` in an effect *and* rendering `<title>` | two sources of truth for one value | pick one; prefer the element for static text |
| 5 | Hiding a subtree with CSS and being surprised by a running timer | `display: none` does not stop effects | `<Activity mode="hidden">` or conditional rendering |
| 6 | Hiding a component to "keep it fast" | hidden subtrees still render (deprioritised, not free) | measure; unmount what you do not need |
| 7 | Adding a dependency to "fix" a stale effect | the subscription tears down and rebuilds constantly | `useEffectEvent`, or move the value out of the effect |
| 8 | Calling an Effect Event during render or passing it to a child as a handler | it is not a normal function; React forbids it | keep it inside effects |
| 9 | Reading a React 18 tutorial's `ReactDOM.render` | the app does not start in React 19 | `createRoot` (Part 3) |
| 10 | Adopting `<Activity>`/`<ViewTransition>` without checking the version | they do not exist in older React | check `package.json` and the exports list |
| 11 | Believing "React 19 removes class components" | they still work; they are just not what this book teaches | keep learning hooks |
| 12 | Treating the compiler as "React 19 required" | it is a separate, opt-in build plugin | file 08 |

---

## 13. Best practices

1. **Know your version** and verify APIs against it rather than against memory.
2. **Prefer the shorter form when it is equivalent**: `<Context value>`, `ref` as a prop, default parameters, `<title>` in the component.
3. **Adopt incrementally.** None of React 19's changes require a rewrite; each can land as a small PR.
4. **Use `Activity` for tab/panel/navigation state preservation**, and measure the hidden subtree's cost before shipping.
5. **Reach for `useEffectEvent` the moment an effect needs "the latest value but a stable subscription".**
6. **Let metadata be rendered state**, not a side effect, whenever it is static or prop-derived.
7. **Preload deliberately**: `preconnect` for a domain you will call, `preinit` for a blocking stylesheet, `preload` for a font or hero image.
8. **Do not chase every release.** Upgrading `react` and `react-dom` together, running your tests (Part 13), and reading the deprecation list is the whole job for most apps.
9. **Keep a note of the deprecations that apply to your codebase** so a search for `forwardRef`, `defaultProps`, `ReactDOM.render` can be a checklist item.
10. **Write down what the upgrade bought you** (a smaller submit handler, one fewer state variable, a smoother tab switch) — it is the only way to justify the next one.

---

## 14. Practice

### Beginner

1. Run the two version commands in your own project and write down the React version and whether `useEffectEvent`, `Activity` and `use` are exported.
2. Rewrite these three snippets in React 19 style: `<ThemeContext.Provider value={theme}>`, a `forwardRef` input, and `Card.defaultProps = { size: 'md' }`.
3. For each item, say whether it still works in React 19 and whether you should use it: `propTypes`, string refs, `<Context.Provider>`, `ReactDOM.render`, `useFormState`, `forwardRef`.

### Intermediate

1. Take the `MetadataCase` and make the title dynamic (`/products/:id` style) in two ways: a rendered `<title>` and an effect. Compare them on: what happens during SSR, what happens on unmount, and how easy it is to test.
2. Convert a tab component of yours (or the one from Part 4) to `<Activity>`, and write down what changed for the tab's internal state, its timers and the DOM. Then measure a hidden heavy tab and decide whether it is worth it.
3. Write a small `useInterval(callback, delayMs)` hook using `useEffectEvent` so that changing the callback's captured values never restarts the interval, and compare it with the Part 4 ref-based version.

### Challenge

1. Build a "React 19 feature audit" script for a repository: it greps for `forwardRef`, `defaultProps`, `propTypes`, `ReactDOM.render`, `.Provider value`, string refs and `findDOMNode`, and prints a file-by-file report with the suggested replacement. Run it on a real project (or the shop-admin app from the earlier parts) and prioritise the findings.
2. Design a loading strategy for the product detail page using `preconnect`, `preload` and `preinit`: list every resource (API origin, hero image, font, stylesheet), which API applies, and where in the tree it should be called. Then explain what happens on a slow connection if you get one of them wrong.
3. The `<Activity>` demo keeps state but drops effects. Write a component with a WebSocket-like subscription (a `setInterval` is fine) and prove with measurements that (a) the hidden state caused no background work, (b) showing it again resumed the work, and (c) an unmount would have lost the state. Then write the one-paragraph rule you would give a teammate for choosing between `Activity`, CSS hiding and conditional rendering.

---

## 15. Solutions

### Beginner

1. `npm ls react react-dom` prints the installed tree (`react@19.3.0` in this book's lab) and `node -e "import('react').then(r => …)"` prints the exports — `useEffectEvent`, `Activity`, `ViewTransition`, `cacheSignal` and `use` are all present in 19.3.
2. `<ThemeContext value={theme}>…</ThemeContext>`; `function Input({ ref, ...props }: Props) { return <input ref={ref} {...props} /> }`; `function Card({ size = 'md', ...rest }: Props)`. The first two are drop-in; the third removes a runtime mechanism in favour of JavaScript's own default parameters, which also type-checks.
3. Working in 19.3: `<Context.Provider>`, `forwardRef`, `useFormState` (deprecated alias of `useActionState`) — all should be replaced in *new* code. Not working: `propTypes` and `defaultProps` on function components, string refs, `ReactDOM.render`. "Still works" and "should use" are different questions: the compatibility path exists so that upgrades are gradual, not so that new files follow it.

### Intermediate

1. **Rendered `<title>`**: works during SSR, removed on unmount (measured: `document.title: ""`), testable by asserting `document.title` after a render, and no effect needed. **Effect**: does not run during SSR (so the server-rendered HTML has the wrong title — a real problem for crawlers and the first paint), must be undone on unmount by hand, and is testable only by running the effect. For a data-dependent title, do the fetch (Part 9) and render `<title>{product.name}</title>` when the data arrives — the element still wins.
2. Expect: the tab's internal state (scroll, typed text, selected sub-tab) survives switching; its timers stop while hidden (measured: `Heavy:cleanup=1` on hide, `Heavy:effect=2` on show) where CSS hiding would have kept them running; and the DOM stays in the tree with `display: none !important`. A heavy hidden tab costs render time, so for a chart with 10,000 points the honest answer may be to unmount it and rebuild on show.
3. ```tsx
   function useInterval(callback: () => void, delayMs: number | null) {
     const onTick = useEffectEvent(callback);
     useEffect(() => {
       if (delayMs === null) return;
       const id = setInterval(onTick, delayMs);
       return () => clearInterval(id);
     }, [delayMs]);            // the *schedule* is the dependency, not the callback
   }
   ```
   The ref-based version from Part 4 stores the callback in a ref (`callbackRef.current = callback` during render or in an effect) and calls `callbackRef.current()` — the same behaviour with an extra mutable box, an extra effect, and no lint support. `useEffectEvent` expresses the intent ("this is effect logic that may read fresh values") and forbids using it as a normal handler, which is what prevents the misuse that the ref pattern permits.

### Challenge

1. A script in the spirit of: for each pattern, `grep -rn` and count hits, then print the mapping (`forwardRef` → ref-as-prop, `defaultProps` → default parameters, `propTypes` → TS types, `ReactDOM.render` → `createRoot`, `.Provider value` → `<Context value>`, `findDOMNode` → refs). Prioritise by risk: `ReactDOM.render` and string refs are *broken*, `defaultProps`/`propTypes` are *silently inert*, `forwardRef`/`.Provider` are merely verbose. The last category is where you should spend the least time.
2. A reasonable plan: `preconnect('https://api.shop.example')` in the app shell (the origin you always call); `preload('/fonts/inter-var.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })` in the root; `preinit('/css/product.css', { as: 'style' })` where the product route is known; and the hero image as a normal `<img fetchPriority="high">` rather than `preload` (so the browser's own prioritisation and `srcset` still apply). Failure mode: preloading a font you do not use wastes the single most contended resource on a slow connection and delays the API call — preloads are promises you must keep.
3. The subscription logs every tick; hiding it stops the ticks (`cleanup` fires, no further logs) while the state (a counter kept in `useState`) is still there when it returns, and an unmount would reset the counter to its initial value. The rule: **`Activity` when the user will come back and expects to find things as they left them (tabs, panels, back/forward); conditional rendering when a fresh start is the intent (a new form, a different record); CSS hiding almost never, because it leaves background work running and hides that fact from the reader.**

---

## 16. Summary

- **React 19's headline is async-as-a-first-class-citizen**: actions, `<form action>`, `useFormStatus`, `useActionState`, `useOptimistic`, `use()`, and async functions inside `useTransition`. Files 02–07 cover them in order.
- **The small conveniences are real**: `<Context value>` replaces `<Context.Provider value>` (measured: renders correctly, no warning); `ref` is a normal prop, so `forwardRef` is no longer needed; and **ref callbacks can return a cleanup function** (measured: `attach INPUT` on mount, then `cleanup` on unmount).
- **Document metadata is rendered state**: a `<title>`/`<meta>` inside a component is hoisted to `<head>`, sets `document.title`, and is removed on unmount (measured: `"Product page — React Lab"` → `""`).
- **`<Activity mode="hidden">` is a new option in the hide/unmount table**: measured, the subtree kept its typed value, its effects were cleaned up on hide and re-run on show, and the DOM stayed present with `display: none !important`. That is the tabs-and-panels case that neither `{flag && …}` nor CSS hiding handled well.
- **`useEffectEvent` removes the stale-closure workaround**: measured, one `Echo:effect=1` subscription while the handler always saw the latest prop (`first` … `second`). It may only be used inside effects, which is what keeps it honest.
- **`propTypes`, `defaultProps` on function components, string refs, legacy context, `ReactDOM.render`, `findDOMNode` and `react-test-renderer` are gone or deprecated** — replace them with TypeScript, default parameters, refs, `createRoot` and Testing Library.
- **`forwardRef`, `<Context.Provider>` and `useFormState` still exist** for compatibility, which is exactly why new code should stop using them while upgrades stay gradual.
- **Version-sensitivity is a habit, not a paragraph**: check `package.json` and the `react` exports list before trusting an API from a tutorial, because "React 19" spans several builds with different surfaces.

---

**What's next →** [`02-actions.md`](./02-actions.md) takes the biggest idea in the release — an *Action* — and builds it up from the "three state variables per submit" mess: what an async transition is, what `isPending` does and does not promise, how ordering works when a user clicks twice, where errors go, and the reusable pattern that replaces `isSubmitting`/`error`/`try`/`finally` in every mutation in your app.
