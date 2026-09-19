# 08 — The React Compiler: Automatic Memoisation, and Its Limits

> **Part 11 · Modern React · File 8 of 8**

Why this file exists: Part 10 spent three files teaching you to memoize by hand — `memo`, `useMemo`, `useCallback` — including the measured case where a memo silently does nothing because a prop changed identity. The React Compiler exists to make most of that work automatic: it analyses your components at build time and inserts the equivalent of memoisation for values, JSX and callbacks. This file shows it working on a real project (a Vite build where a component's `filter` and its inline callback were compiled into cache slots), states honestly what it requires from your code (purity — the rules of React you have been following since Part 3), what it cannot do (it does not make a slow algorithm fast, reduce the number of DOM nodes, or fix a slow network), and how to adopt it incrementally without breaking a codebase that breaks the rules.

Measured in this book's lab with React 19.3.0, Vite 8 and `@vitejs/plugin-react` 6.

---

## 1. What the compiler is

The React Compiler is a **build-time optimiser**. It runs as a Babel/oxc transform over your components and emits code with explicit cache slots — the same idea as `useMemo`/`useCallback`, but generated from the source instead of written by hand.

It is **not**:

- a runtime library you import (it inserts calls into a small runtime, but you do not write them),
- a new way to write components (your JSX and hooks are unchanged),
- a replacement for measuring (it removes *re-render* costs that are due to unstable values; it cannot fix a slow function),
- mandatory (React 19 works perfectly without it).

The mental model: **the compiler memoizes what `useMemo`/`useCallback` would have memoized, without you having to name the dependencies.** Its correctness depends on your code obeying the rules of React (pure render, no mutation of props/state, no side effects during render) — because only then is it safe to skip a recomputation. That is why Part 3's purity rules are not academic: they are the contract the optimiser relies on.

---

## 2. Measured: what the compiler actually emits

Turning it on in a Vite project (section 5 has the exact config) and building this component:

```tsx
// src/part11/CompilerCase.tsx
export function CompilerCase({ items }: { items: Item[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const visible = items.filter((item) => item.name.length > 0);      // recreated every render
  return (
    <div>
      <p>{picked ?? 'none'}</p>
      <ul>
        {visible.map((item) => (
          <ExpensiveRow key={item.id} item={item} onPick={setPicked} />   // inline callback
        ))}
      </ul>
    </div>
  );
}
```

produces (excerpt from the unminified build output):

```js
function CompilerCase(t0) {
	const $ = (0, import_compiler_runtime.c)(12);            // 12 cache slots
	const { items } = t0;
	const [picked, setPicked] = (0, import_react.useState)(null);
	let t1;
	let t2;
	if ($[0] !== items || $[1] !== picked) {                 // ← dependencies inferred by the compiler
		const visible = items.filter(_temp);
		const t3 = picked ?? "none";
		if ($[4] !== t3) {
			t2 = jsx("p", { children: t3 });                 // ← the <p> element is cached
			$[4] = t3;
			$[5] = t2;
		} else t2 = $[5];
		let t4;
		if ($[6] === Symbol.for("react.memo_cache_sentinel")) {
			t4 = (item_0) => jsx(ExpensiveRow, {            // ← the inline callback is hoisted once
				item: item_0,
				onPick: setPicked
			}, item_0.id);
			$[6] = t4;
		} else t4 = $[6];
		t1 = visible.map(t4);
		…
```

Read that carefully; it is the whole story of the compiler in twenty lines:

| Emitted code | What it replaces | Why it matters |
| --- | --- | --- |
| `const $ = c(12)` | — | a per-instance cache array; `c` is the compiler runtime's cache hook |
| `if ($[0] !== items \|\| $[1] !== picked)` | `useMemo(() => items.filter(…), [items, picked])` | the compiler worked out the dependencies itself |
| `items.filter(_temp)` | the inline `.filter` | now runs only when `items` changes, not on every render |
| `if ($[4] !== t3) { t2 = jsx("p", …) }` | a memoised JSX element | the `<p>` is reused when its child is unchanged, so its subtree is skipped |
| `if ($[6] === memo_cache_sentinel) { t4 = (item_0) => … }` | `useCallback((item) => …, [])` | the inline callback is created **once per instance**, so a memoised `ExpensiveRow` is not defeated by it |
| `t1 = visible.map(t4)` | the list | fewer new element objects, fewer child renders |

The last row is the one that connects back to Part 10: the "defeated memo" case — a memoised child receiving an inline arrow function — is exactly the bug the compiler removes automatically, because the arrow is hoisted into a cache slot instead of being recreated on each render.

💡 Note what the compiler did **not** do: `ExpensiveRow`'s own 5,000-iteration loop is still there, `items.filter` still runs when `items` changes, and nothing about the DOM node count changed. The compiler optimises *when work runs*, not *how much work there is*.

---

## 3. What it can and cannot do

| The compiler can | The compiler cannot |
| --- | --- |
| Memoise derived values (`useMemo`-style) | Make an expensive algorithm cheaper |
| Memoise JSX elements and subtrees | Reduce the number of DOM nodes (virtualisation still needed — Part 10, file 04) |
| Stabilise callbacks and objects (`useCallback`-style) | Prevent a re-render caused by state changes in the same component |
| Remove the need for most manual memoisation | Fix an unstable prop coming from a *parent* that violates the rules |
| Skip re-rendering children whose props are now stable* | Cancel or speed up network requests (Part 7/9) |
| Warn (via lint) about code it cannot safely optimise | Replace profiling: commits, layout and paints are still yours to measure |

\* With the compiled output, child components still render when their parent renders unless they are `memo`-wrapped or receive identical elements — the compiler makes the *props* stable, which is what makes `memo` and element reuse effective.

⚠️ **The rule-based precondition, stated plainly:** the compiler assumes your components are pure. If a component mutates a prop, writes to a module variable during render, or relies on a value created outside React changing, the compiler's "skip this because nothing changed" decision can produce stale UI. In practice:

- **Do not mutate props or state objects in place** (`items.sort()` in render is a bug even without the compiler).
- **Do not read mutable external state during render** (a random number, `Date.now()` in a memoised slot, a global `counter++`).
- **Keep effects for side effects** (Part 4) — the compiler will not move them for you.

The compiler is forgiving in one important way: it bails out of optimising a component it cannot prove safe (and the ESLint plugin tells you why), rather than silently producing wrong code.

---

## 4. Adopting it without breaking the codebase

| Step | Why |
| --- | --- |
| 1. Install the ESLint plugin (`eslint-plugin-react-hooks` with the compiler rules, or `react-compiler` lint rules) | it reports the rule violations that would make optimisation unsafe, per file |
| 2. Fix or annotate the flagged components | an unoptimised file still works; a *wrongly* optimised one does not |
| 3. Enable the compiler on one directory (`include`/`exclude`) | incremental adoption, easy rollback |
| 4. Build and diff the bundle | the compiler adds a small runtime and some bytes per component |
| 5. Profile before/after | confirm the renders dropped where you expected |
| 6. Remove the `useMemo`/`useCallback` calls it replaces — **or leave them** | they are harmless, but dead code confuses readers; remove them where the compiler is definitely enabled for that file |

💡 **Keep `React.memo`** where it exists: `memo` prevents a child from rendering, which the compiler's stable props make effective. What you can stop doing is writing new `useCallback`s purely to satisfy a `memo` — the compiler handles the identity.

⚠️ **Do not enable the compiler and delete all your measurements.** Optimisation is still empirical: compile, then look at the Profiler (Part 10, file 04). A codebase with the compiler and a 5,000-row non-virtualised table is still slow.

---

## 5. Turning it on (Vite, as used in this lab)

```bash
npm i -D babel-plugin-react-compiler oxc-transform-react
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // @vitejs/plugin-react 6.x: the compiler is wired through the plugin.
      // (Older setups used: babel: { plugins: [['babel-plugin-react-compiler', {}]] }.)
      compiler: true,
    }),
  ],
});
```

```text
$ npx vite build
transforming...
✓ 17 modules transformed.
dist/index.html                  0.38 kB │ gzip:  0.26 kB
dist/assets/index--l7Stv_d.js  220.78 kB │ gzip: 69.17 kB
✓ built in 179ms
```

The build succeeded, and the bundle contains the compiler's runtime markers plus the cache-slot code quoted in section 2 (`import_compiler_runtime.c(12)`, `memo_cache_sentinel`) — i.e. the components really were compiled. Three practical notes:

1. **The compiler is configured, not installed-and-forgotten.** In a framework (Next.js, React Router's framework mode), it is a config flag; in Vite it is the plugin option above. Check the plugin's version docs, because the option name has moved between releases (`reactCompiler` → `compiler` in this lab's version).
2. **Expect a small bundle increase** — the runtime helpers and the cache slots are real bytes. They are traded against less render work, and both numbers belong in your notes.
3. **Diagnostics matter more than the transform.** If the plugin exposes `logDiagnostics`, turn it on in development and read what it says about your components; the report is a map of where your code violates the rules.

---

## 6. Reading the output: how to tell it is working

| Signal | Where to look |
| --- | --- |
| `c(…)` cache-slot calls in the compiled module | unminified build output, or `--minify false` |
| `memo_cache_sentinel` | the same |
| The component's JSX is assigned to variables inside `if` blocks | the same |
| Fewer renders in the Profiler with the same interactions | DevTools, production build |
| Lint diagnostics reduced to zero for the optimised directories | the lint plugin's output |

⚠️ Do **not** judge the compiler by "the app feels faster" in development. Development builds are not compiled the same way (and StrictMode doubles renders), so the only honest comparison is a production build with the Profiler, before and after, on the same interaction.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Expecting it to fix algorithmic slowness | the slow loop is still slow | profile; fix the algorithm/nodes (Part 10, file 04) |
| 2 | Enabling it while the code mutates props/state | stale UI, hard-to-trace bugs | follow the rules; fix lint diagnostics first |
| 3 | Turning it on globally in a legacy codebase on day one | many components bail out; nobody knows which | incremental directories, with a report |
| 4 | Removing all manual memoisation immediately | some cases (and some files) are not compiled | remove per file, after confirming the transform |
| 5 | Assuming it removes the need for `memo` | children still render when the parent renders | keep `memo` for expensive children |
| 6 | Assuming it removes the need for virtualization | DOM node count is untouched | part 10, file 04 |
| 7 | Judging in development mode | dev is slower and StrictMode doubles renders | profile production builds |
| 8 | Ignoring the bundle-size cost | a few kB of runtime | measure gzip as usual |
| 9 | Believing the compiler needs React 19 features you have not adopted | it is a separate tool | adopt independently |
| 10 | Using it to justify impure code ("the compiler will handle it") | optimisation depends on purity, not on optimism | keep renders pure |
| 11 | Forgetting the lint plugin | you cannot see which components are skipped | install and read it |
| 12 | Expecting it to memoize across component boundaries | it works per component and on JSX you write | design data flow as before |

---

## 8. Best practices

1. **Treat the rules of React as the price of admission** — pure renders, no mutation, effects for side effects.
2. **Adopt incrementally** (a directory at a time), watching diagnostics.
3. **Measure before/after in a production build** and record the render counts you expected to drop.
4. **Keep your structural optimisations**: moving state down, splitting contexts, `children` composition (Part 10, files 02–03) — those reduce *work*, which the compiler cannot.
5. **Keep `memo` on measured hotspots**, and let the compiler handle prop stability for you.
6. **Remove replaced `useMemo`/`useCallback` per file**, and only after confirming the file is compiled.
7. **Watch the bundle budget** like any other dependency.
8. **Document the decision** in the repo (a line in the README or an ADR): compiler enabled, which directories, since which version, and what the measured effect was.
9. **Do not use it to skip understanding.** You still need to know why a re-render happens (Part 10, file 02) to debug the case the compiler cannot fix.
10. **Revisit after upgrades**: compiler behaviour and options change quickly; the config from last year may not be doing what you think.

---

## 9. Practice

### Beginner

1. In one sentence each: what the compiler does, what it requires from your code, and one thing it cannot do.
2. Name three code patterns from Part 10 that the compiler makes unnecessary, and one it does not.
3. Look at the compiled excerpt in section 2 and point out (a) the inferred dependency list, (b) the hoisted callback, (c) the cached JSX element.

### Intermediate

1. Enable the compiler in the lab project (section 5), build with `--minify false`, and find the cache-slot code for two of your own components. Write down how many slots each got and one value it memoised that you would not have thought to.
2. Take a component of yours with a manual `useMemo` and a manual `useCallback`: predict what the compiler emits, then verify in the build output, then decide whether to delete the manual versions.
3. Write the "rules of React" checklist a reviewer would use before enabling the compiler for a directory, with one concrete grep-able anti-pattern per rule.

### Challenge

1. Run a controlled experiment on a slow screen: build once without the compiler, once with it, and record (a) render counts per interaction, (b) interaction latency, (c) bundle size — using the Profiler and the build output. Report the numbers and state which improvement came from the compiler and which would still be needed without it.
2. Design an adoption plan for a 200-component codebase, including: which directory goes first, how you detect bail-outs, what happens if a team forgets the lint plugin, how you roll back, and what you tell the team about `useMemo` going forward.
3. The compiler makes props stable; `memo` decides whether to skip. Construct a case where the compiler alone still re-renders an expensive child, then fix it two ways (keep `memo`, restructure with `children`) and compare the two fixes in code size and clarity.

---

## 10. Solutions

### Beginner

1. It is a build-time optimiser that inserts memoisation (cached values, JSX, callbacks) into your components automatically; it requires pure components that follow the rules of React (no prop/state mutation, no side effects in render); it cannot make an expensive computation cheaper or reduce DOM nodes.
2. Made unnecessary: `useMemo` for derived values, `useCallback` purely to stabilise a prop, and hand-written JSX memoisation. Not replaced: `React.memo` (skipping a child's render), virtualization, `useTransition`/`useDeferredValue` (scheduling), and understanding *why* a render happens.
3. (a) `if ($[0] !== items || $[1] !== picked)`; (b) `t4 = (item_0) => jsx(ExpensiveRow, …, item_0.id)` guarded by the `memo_cache_sentinel`; (c) the `<p>` element cached as `$[5]` behind the `$[4] !== t3` check.

### Intermediate

1. A typical presentational component gets 5–15 slots. Surprises are usually the *element* caches (a `<ul>` subtree reused) and the hoisted inline callbacks — most people expect values to be memoised, not elements.
2. Prediction: the compile output moves the manual memo's dependency comparison into `$[n] !== …` checks, and the manual `useCallback` body into a `memo_cache_sentinel` guard. Verification: find the component in the unminified bundle. Decision: delete both manual hooks **if** the file is definitely compiled and the values are not used as effect dependencies with subtle semantics (an effect dependency array is *your* code, not the compiler's — a `useCallback` there is still meaningful to readers, so prefer keeping it or replacing it with a stable function from outside the component).
3. Checklist: (a) no mutation of props/state in render — grep for `props.`, `.sort(`, `.push(` in render bodies; (b) no side effects in render — grep for `localStorage`, `document.`, `fetch(`, `Math.random`, `Date.now` outside effects/handlers; (c) no reading of mutable module state during render — grep for module-level `let`; (d) hooks called unconditionally — the exhaustive-deps/hooks lint rules; (e) effects not used to synchronise derived state — a review question, not a grep.

### Challenge

1. Expect: with the compiler, the component's own derived-value and element work drops (fewer allocations, fewer child renders *if* children are memoised); interaction latency improves only when those allocations were a measurable share of the frame; bundle grows by a few kB gzip. Without the compiler you would still need memoisation for the child and virtualization for the list — the compiler does not touch either.
2. Plan: start with the leaf/shared UI directory (few effects, pure props), enable diagnostics, and require zero bail-outs there before moving on; detect bail-outs by comparing the build output for a file (no `c(` calls means no compilation) and by reading the diagnostic log; if the lint plugin is missing, bail-outs are invisible — make the plugin part of CI; rollback is a one-line config change back to the previous directory list; the message to the team is "keep writing normal React; we no longer require `useMemo` for identity reasons, and `memo` stays for measured hotspots".
3. Constructed case: the compiled parent builds stable props, but the expensive child is *not* `memo`-wrapped, so a parent state change still renders it (the compiled parent sends identical props, but React compares nothing without `memo`). Fix one: wrap the child in `memo` — one line, keeps the structure. Fix two: pass the child as `children` from above the state (Part 10, file 02) — no `memo`, but the element identity guarantees the skip. Verdict: `memo` is clearer for a leaf; `children` is better when the parent must own the state and the child is a subtree.

---

## 11. Summary

- **The React Compiler is a build-time optimiser** that inserts memoisation for values, JSX and callbacks, using dependencies it infers from your source.
- **Measured in this lab**: a Vite build with `react({ compiler: true })` transformed a component into `const $ = c(12)` cache slots, memoised `items.filter(...)` behind `$[0] !== items || $[1] !== picked`, cached a `<p>` element, and hoisted an inline callback — exactly the "defeated memo" case from Part 10, fixed automatically.
- **It requires pure components.** The rules of React (no mutation of props/state, no side effects in render, no reading mutable globals) are the contract that makes skipping a recomputation safe; the lint plugin reports the files it cannot optimise.
- **It cannot** make algorithms cheaper, reduce DOM nodes, cancel requests, or replace profiling. Virtualisation, `memo` for measured hotspots, and structural fixes (state placement, `children`) are still yours to do.
- **Adopt incrementally** with diagnostics on, measure a production build before and after, watch the bundle cost, and remove replaced `useMemo`/`useCallback` only in files you have confirmed are compiled.
- **Do not treat it as a substitute for understanding** — you still need Part 10's causes of re-renders to debug what the compiler did not fix.

---

**What's next →** [`../12-styling/01-css.md`](../12-styling/01-css.md) opens Part 12: styling. Global CSS and why it collides at scale, CSS Modules and what "scoped" really means, SCSS setup in Vite, Tailwind's utility-first model with real trade-offs (not a winner-takes-all comparison), and the decision framework for choosing a strategy for a real team.
