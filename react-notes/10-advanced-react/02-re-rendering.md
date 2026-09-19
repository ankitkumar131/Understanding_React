# 02 — Re-rendering: What Causes It, What Does Not, and Why It Is Usually Fine

> **Part 10 · Advanced React · File 2 of 9**

Why this file exists: "it re-renders too much" is the most common performance complaint in React, and it is usually diagnosed wrong. This file answers the question precisely — **what causes a component's function to run again?** — with a measured list of every cause: its own state, a parent's render, a context value change, a store notification, a key change, StrictMode. It also measures the cases that surprise people in the other direction: setting state to the value it already has renders *nothing*, two `setState` calls in a handler render *once*, refs render *never*, and a child's own state leaves the parent completely untouched. Once the causes are known, the important judgement is next: which re-renders are **unavoidable**, which are **cheap enough to ignore**, and which are worth the complexity of files 03 and 04. The short version, and the one this file will earn: *a re-render is not a bug; a re-render that does expensive work is.*

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-rerender-probe.tsx` and `.../run-render-probe.tsx`.

---

## 1. The definition, restated exactly

**A component re-renders when React calls its function again.** That is the whole definition. It says nothing about the DOM (file 01 measured a re-render that produced two DOM mutations for four component renders), and nothing about props changing (a child with no props re-renders when its parent does).

There are exactly **six** things that put a component into the render phase:

| # | Cause | Can you avoid it? |
| --- | --- | --- |
| 1 | Its own `useState`/`useReducer` update | yes — do not update |
| 2 | Its parent rendered and returned a new element for it | yes — `memo` + stable props, `children`, or move the state down |
| 3 | A **context** value it consumes changed identity | yes — split contexts, stabilise the value (Part 9, file 02) |
| 4 | A **store** it subscribes to notified and its selector's result changed | yes — narrower selectors, `useShallow` (Part 9, files 04–05) |
| 5 | It was **remounted** (key changed, type changed, a different branch rendered) | yes — stable keys and types |
| 6 | React is **StrictMode** double-invoking in development | no (and you should not want to) |

Everything else — a ref changing, a variable reassigned, a promise resolving, a timer firing, the DOM being edited by hand — does **not** cause a re-render by itself. Data must reach React through one of those six doors.

```text
        state  ─┐
       parent  ─┤
      context  ─┼──►  render phase (your function runs)  ──►  commit (only real changes)
        store  ─┤
          key  ─┤
   StrictMode  ─┘
```

---

## 2. Cause 1: its own state

```text
=== A. State in the parent: the parent re-renders, and so does the child ===
   one click → ParentStateCase:render=2 ChildOfParentState:render=2

=== B. State in the child: the parent is untouched ===
   one click → ChildStateCase:render=1 ChildWithState:render=2
   ChildStateCase did not re-render: state lives where it is declared
```

The pair is the first important lesson of state placement (Part 9, file 01, arriving again as a performance fact):

- **When the state lives in the parent, updating it re-renders the parent *and every child in its JSX*.** That is cause 2 arriving immediately: the parent returned new elements for its children, so React calls them again. `ChildOfParentState` has one prop that did change here, but that is not why it rendered — file 03 measures the version where the props are identical and the child renders anyway.
- **When the state lives in the child, only the child re-renders.** `ChildStateCase` stayed at one render while its child ticked up.

💡 **Moving state down is the cheapest optimisation in React.** A counter, a modal flag, a hover state or a form's field values placed in the component that uses them cannot wake anybody else. It costs nothing to implement, needs no memoisation, and is invisible in the code. Reach for it before `memo`.

---

## 3. Cause 2: a parent re-rendered

This is the cause that surprises people, so it is worth stating formally:

> When a component renders, React compares the elements it returned with the previous ones. For a child element of the same type and key, React will render that child — **regardless of whether its props changed** — because the element is new and its props may have changed.

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <section>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <Sibling /> {/* no props at all, and it still re-renders on every click */}
    </section>
  );
}
```

Measured in file 01, section 7: `Sibling:render=1` after a parent bump, with no props to speak of. The work is: call `Sibling()`, build an element, diff it, find nothing to change, move on. For a `<p>` that is nanoseconds; for a component that filters 10,000 rows in its body, it is a dropped frame.

Three legitimate ways to stop it, in order of preference:

| Technique | What it does | Cost |
| --- | --- | --- |
| **Move the state down** | the parent no longer renders at all | restructure only |
| **Pass the expensive subtree as `children`** (or as a prop) | the element is created by the *grandparent*, so the re-rendering parent does not create a new element for it | restructure only |
| **`React.memo`** | the child compares props and skips rendering when they are equal | one shallow comparison per render, plus the discipline of stable props (file 03) |

The `children` technique deserves its own measurement, because it is the one people do not know:

```text
=== G. Children created by the parent are not re-rendered by a sibling state change ===
   3 wrapper bumps → ChildrenCase:render=1 Wrapper:render=4 ExpensiveChild:render=1
   the element was created by ChildrenCase, so Wrapper re-rendering does not
   re-render it: this is composition beating memoization
```

```tsx
// src/part10/MemoLab.tsx
export function Wrapper({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0); // state that changes often
  return (
    <div>
      <Bump label={`wrapper ${tick}`} onBump={() => setTick((current) => current + 1)} />
      {children}   {/* ← the same element object, render after render */}
    </div>
  );
}

export function ChildrenCase() {
  return (
    <Wrapper>
      <ExpensiveChild />   {/* created here, once per ChildrenCase render */}
    </Wrapper>
  );
}
```

`Wrapper` rendered four times, `ExpensiveChild` exactly once. The reason is subtle and worth repeating: **the element `<ExpensiveChild />` is created by `ChildrenCase`, not by `Wrapper`.** When `Wrapper` re-renders, it re-uses the `children` prop it was handed — the *same object* — and React sees `prevChildren === nextChildren` (identical reference), so it skips the subtree entirely. No `memo`, no comparison function, no stable-props discipline.

⚠️ Do not turn this into a rule ("always pass children") — it forces you to hoist state into the right place, which is usually what you wanted anyway, but it can make a component's API awkward. It is a tool for the case where a rapidly-changing state and an expensive subtree live in the same component (a chart library wrapping a form, an editor toolbar wrapping a canvas).

---

## 4. Cause 3: a context value changed identity

Context re-renders its consumers when the value's identity changes, whatever they read from it — measured in Part 9, file 02: a coupon change re-rendered a cart badge that only reads `items`, and a theme toggle re-rendered the cart UI. The causes are the same as ever: the provider re-rendered and produced a new value object, or the state it publishes genuinely changed.

The fixes are architectural rather than contextual, and they were measured in that file:

| Fix | Measured effect |
| --- | --- |
| Split state from dispatch into two contexts | a dispatch-only button went from 1 render per change to **0** |
| Split by concern (items, coupon, dispatch) | a coupon change rendered **only** the coupon reader |
| `useMemo` on the value | stops re-renders caused by *the provider re-rendering*, not by real changes |
| Publish primitives | `value={count}` cannot change identity without changing |

💡 The rule: **a context is only as noisy as the value you publish.** If a consumer re-renders "for no reason", the reason is always "the value it consumes is a new object".

---

## 5. Cause 4: a store subscription

A store (Zustand, Redux, `useSyncExternalStore`) notifies every subscriber after a change; each subscriber re-runs its **selector**, compares the result with the previous one, and re-renders only if it differs. Part 9 measured all of it:

- `RtkAddButton: 0 renders` — the component only dispatches, so it never subscribes to state.
- `coupon applied → RtkCartTotal=1` while the badge and list were absent from the transcript — their selected values did not change.
- A change in the `products` slice produced `(no renders)` in the cart components.
- In Zustand, a selector returning a **new object** on every call crashed React (`Maximum update depth exceeded`, after 55 renders) — the same "identity, not contents" rule as everything else in this file.
- A new array with identical contents re-rendered the list (`ZustandItemsList=1`) but not a component selecting primitives.

So a store gives you what context cannot: **subscriptions scoped to a projection**. The cost is the comparison discipline (select primitives; `useShallow` for objects; memoised selectors in Redux).

---

## 6. Cause 5: a remount (not a re-render)

A remount is a different event with a different cost profile: the old component is unmounted (state, effects and DOM nodes are destroyed) and a new one is mounted (state initialised, effects run, DOM created). React does it when:

- the element's **`type`** changes (`<div>` → `<section>`, `<ProductCard>` → `<ProductRow>`, or a conditional rendering a different component in the same position),
- the element's **`key`** changes (including `key={index}` during a reorder — file 01, section 8),
- a conditional returns a different subtree in that position (`{isEditing ? <EditForm /> : <ReadView />}` swaps everything below).

| | Re-render | Remount |
| --- | --- | --- |
| What runs | the function | the function + all mount effects |
| State | kept | **lost** |
| DOM nodes | updated in place | destroyed and recreated |
| Focus, scroll position, input values | kept | **lost** |
| Cost | proportional to the work in the function | proportionally higher, plus layout |

⚠️ Two ways this bites in practice: `{isEditing ? <EditForm /> : <ReadView />}` looks symmetric but remounts from scratch every toggle (which is usually the *intent* — a fresh form — but is a surprise when it is not), and any wrapper component added in the middle of a tree changes the type at that position, unmounting everything below it. The deliberate version is a feature: `<EditForm key={product.id} … />` is how you ask for a fresh form per product.

---

## 7. What does **not** cause a re-render

### Setting the same value

```text
=== C. Setting the same value: React bails out ===
   setN(0) when n is already 0 → SameValueCase:render=1
   setObj(same reference) → SameValueCase:render=1
   setObj(new object with the same contents) → SameValueCase:render=2
   identical primitives and identical references bail out; a new object does not,
   which is why "same data" and "same reference" are different questions
```

The counts start at 1 (the mount), so: same number → **no render**; same object reference → **no render**; new object with identical contents → **one render**. That last line is the whole reason immutability matters (Part 9, file 03) and the reason `useMemo` exists (file 03 of this part): React compares with `Object.is`, so a fresh object/array is a change *by definition*.

```tsx
setItems([...items]);          // new array → re-render, even if the contents are identical
setItems(items);               // same reference → no render
setCount(count);               // same number  → no render
```

⚠️ The React docs add a caveat worth knowing: React *may* still render the component whose state was set once more before bailing out (it allows this to avoid keeping too much information about distant children). Do not build logic that depends on the bail-out, and do not worry about the extra render when it happens: it is invisible in the DOM.

### Refs, variables and timers

```text
=== E. Refs are not reactive ===
   two ref bumps → RefCase:render=1
   DOM: ref=2
```

Two clicks on the ref button produced **no renders at all** (the count stayed at the mount) while the DOM showed `ref=2`. Refs are the right tool for values that React does not need to render — an interval id, a previous value, a DOM node, a "has this run already?" flag. The moment such a value must appear on screen, it has to be state.

Same for ordinary variables (`let total = 0` inside the function resets every render — Part 4), module variables (not reactive at all), and timers/promises (delivery mechanisms, not triggers: they must call `setState`, `dispatch` or `store.setState` to be seen).

---

## 8. Batching: many updates, one render

```text
=== D. Batching: many updates, one render ===
   two setState in one handler → BatchCase:render=2
   two setState inside a setTimeout → BatchCase:render=3
   automatic batching applies outside events too (React 18+)
   two setState after an await → BatchCase:render=4
   five functional updates in a loop → BatchCase:render=5
   final values: a=8 b=3
   the updater form accumulates correctly in one render pass
```

Each line is one click and one render (counts increment by 1 each time). The lesson in four parts:

1. **Two `setState`s in one event handler → one render.** React collects the updates and renders once with the final values.
2. **Two `setState`s inside `setTimeout` → still one render.** Before React 18 this produced two; automatic batching now applies to timeouts, promises, native event handlers and any other callback.
3. **After an `await`, still one render** — the classic "did I just cause an extra render?" worry in an `async` handler: no.
4. **Five functional updates in a loop → one render, and the arithmetic is correct** (`a` went from 3 to 8, `b` stayed 3). The updater form (`setA((current) => current + 1)`) accumulates because each updater receives the result of the previous one; the replacement form (`setA(a + 1)` five times) would set the same value five times and lose four increments.

⚠️ The one place batching does not happen is inside `flushSync`, or when an update comes from a different task boundary *and* React is forced to flush (`flushSync`, or reading the DOM immediately after a state update in an event handler — React flushes before you can observe a stale DOM). If you find yourself needing "two renders, in order", you almost certainly need one render with a well-modelled state instead — the reducer pattern from Part 9.

---

## 9. Sorting re-renders into three buckets

Now the judgement. For each re-render you observe, decide which bucket it is in — and only the third one deserves work.

| Bucket | Example | What to do |
| --- | --- | --- |
| **Necessary and cheap** | a parent re-renders, and its children render a handful of elements | nothing. Measure before touching it |
| **Necessary but expensive** | a parent re-renders and the child filters 10,000 rows, or renders 2,000 nodes | memoise the work (`useMemo`), memoise the child (`memo`), virtualise (file 04) |
| **Unnecessary** | a component re-renders when nothing it displays has changed | move state down, split context, narrow the selector, pass `children`, or `memo` as a last resort |

How to tell which bucket you are in without guessing:

1. **React DevTools → Profiler → record an interaction.** The flamegraph shows which components rendered, how long each took, and (with "Record why each component rendered") the reason: *"props changed"*, *"state changed"*, *"parent re-rendered"*, *"context changed"*, *"hooks changed"*. That reason list is this file's six causes, named by the tool.
2. **Rank the renders by duration, not by count.** A component rendering 200 times at 0.1 ms is 20 ms spread across an interaction; one component rendering once at 40 ms is a dropped frame on a keystroke. The ranked view exists precisely because the flamegraph makes frequent-but-cheap look worse than slow-but-rare.
3. **Check the commit number too** (file 01, section 9). If renders are fast and the commit is slow, the problem is DOM nodes and CSS, and no amount of `memo` will help.

The worked example in file 04 does all three on a deliberately slow app; the numbers that come out ("5,000 rows, 12,000 DOM nodes, 380 ms per keystroke → 40 rows, 200 nodes, 6 ms") are the shape of a real optimisation report.

---

## 10. When NOT to optimise re-renders

Four situations where the cure is worse than the disease:

1. **The component renders a few elements.** `memo` costs a props comparison on every parent render and buys you nothing measurable; it also silently stops working the moment someone passes an inline object. The measured case (file 03, section 3) shows a memo defeated by a fresh function — the code *looks* optimised and does nothing.
2. **The re-render is caused by state the user just changed.** A controlled input re-rendering because the user typed is not a bug; the alternative is an uncontrolled input (Part 8, file 02) and that is a UX decision, not a performance one.
3. **You are in development mode and comparing numbers to production.** StrictMode doubles renders, dev builds are ~2–3× slower than production builds, and DevTools recording adds overhead. Profile a production build (`npm run build && npm run preview`) before drawing conclusions — and after, when a fix has landed.
4. **The real cost is elsewhere.** A component that re-renders 100 times per second is a problem only if each render is expensive; the same component wrapped in `memo` while its parent fetches data on every render is a rearranged deck chair. The measured list in file 04 (network waterfalls, images, bundle size, layout thrash) is where SLOW apps usually lose their time.

---

## 11. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Assuming props are what cause a child to re-render | you add `memo` to a child whose parent re-renders for an unrelated reason and it still re-renders (props are new objects) | fix the props, or move the state down, or pass `children` |
| 2 | Putting UI state in a high component | every keystroke re-renders the whole page | colocate the state (Part 9, file 01) |
| 3 | Reading a re-render count in development and panicking | StrictMode doubles everything, dev builds are slower | measure in a production build with the Profiler |
| 4 | Wrapping everything in `React.memo` | comparison cost everywhere, no wins, and a false sense of safety | memo only measured hotspots, with stable props |
| 5 | Optimising a component that renders 3 nodes | complexity for nothing | measure first |
| 6 | Expecting `setState` with the same value to be free | it *is* free for primitives and identical references, but a new object always renders | use stable references, or `useMemo` for computed props |
| 7 | Assuming two `setState`s produce two renders | they are batched into one (measured: in handlers, timeouts and after `await`) | model one render with the final state; use a reducer for complex transitions |
| 8 | Using `setA(a + 1)` repeatedly in one handler | four increments are lost; only the last call's value survives | use the updater form `setA((current) => current + 1)` |
| 9 | Expecting a ref change to update the UI | refs are not reactive (measured: 0 renders, DOM changed) | state for anything displayed |
| 10 | Recreating an object/array prop inline | the child's memo never hits, and effects that depend on it re-run | `useMemo`/`useCallback`, or pass the primitive |
| 11 | Blaming re-renders for a slow *commit* | the time is in DOM nodes/layout, not in the renders | profile the commit; reduce nodes; virtualise |
| 12 | Adding `key={index}` to "fix" a performance warning | reorders rewrite every row (measured: 16 mutations) and typed state moves to the wrong row | stable ids |

---

## 12. Best practices

1. **Know the six causes** and name the reason before changing code (the Profiler names it for you).
2. **Move state down first**, then split contexts, then narrow store selectors, and only then reach for `React.memo`.
3. **Prefer `children`/element props** when a component holds fast-changing state next to an expensive subtree.
4. **Keep props referentially stable** where a memoised child depends on them — that is what `useMemo`/`useCallback` are for (file 03).
5. **Model state so one interaction is one update**; batching then does the right thing automatically.
6. **Never rely on the bail-out** for logic, but do use it: `setItems(items)` is a legitimate way to say "nothing changed".
7. **Measure in a production build** with the Profiler's ranked view and reasons, and write the before/after numbers down.
8. **Check the commit** as well as the renders; the two problems have different fixes.
9. **Keep remounts deliberate**: stable keys and types by default, `key={id}` when you *want* a reset.
10. **Do not optimise what the user cannot feel.** One extra millisecond is not worth an opaque `memo` that the next person will remove.

---

## 13. Practice

### Beginner

1. List the six causes of a re-render and, for each, give one situation in this app (`/products`, `/orders`, the cart, the search box) where it is unavoidable.
2. For each change, say which components re-render and why: (a) typing in a controlled search input whose state lives in `ProductsPage`; (b) toggling a modal whose state lives in the modal component itself; (c) adding a product to the Zustand cart store; (d) navigating to `/orders`; (e) setting `document.title` in an effect.
3. Explain in one sentence each why a ref change and a timer callback do not, by themselves, re-render anything.

### Intermediate

1. Take `ParentStateCase` and rewrite the child so it does not re-render when the parent's counter changes — three different ways (move state, `children`, `memo` + stable props). For each, write one sentence on what it cost you.
2. `SameValueCase` shows that `setObj({ tag: 'stable' })` renders while `setObj(sameRef.current)` does not. Give three realistic codebases-level examples where this distinction causes a bug or an unnecessary render, and the fix for each.
3. A teammate reports "the product table re-renders 60 times while I type in the filter box". Write the three measurements you would take before changing anything, and what each outcome would tell you to do.

### Challenge

1. Build a `useRenderReason` development hook: it records, for the current component, whether props changed (shallow compare against the previous props), whether state changed (compare `useState` values), and whether it is the first render. Print the verdict on every render and use it to confirm the six causes in the lab. Where does the implementation have to cheat (what can a component not know about why it rendered)?
2. Design an experiment that separates **render cost** from **commit cost** using only the Profiler and a `MutationObserver`, on the lab's 5,000-row table (file 04). State the hypothesis, the measurement, and the conclusion for each of: adding the filter box, moving the filter state down, memoising the rows, and virtualising the list.
3. Write a short "re-render budget" document for a team: which contexts/stores exist, which components are allowed to re-render often, which must not, and how a reviewer can check. Include the one rule that keeps it enforceable (for example: "no inline object/array/callback props to a memoised component").

---

## 14. Solutions

### Beginner

1. Six causes: own state (`useState` in the filter box); parent render (the `<Table>` inside `ProductsPage`); context change (the cart badge reading `useCart`); store notification (the RTK cart widget with a selector); remount (switching `isEditing` swaps `<EditForm/>` for `<ReadView/>`); StrictMode (dev only, avoidable by writing pure components). The filter box is the clearest "unavoidable" case: the user typed, the value is displayed, so the component must render.
2. (a) The input renders (its own state changed) and everything in `ProductsPage` below it that is not isolated — because the parent re-rendered. (b) Only the modal component re-renders; its parent is untouched. (c) Every component whose Zustand selector returns a changed value: the badge and total, not the "Add" buttons (they select the stable action). (d) The router renders the new route's components; sibling route content unmounts. (e) Nothing re-renders — setting `document.title` touches the DOM outside React's tree and is not state.
3. A ref is a box React reads during render but does not watch for changes (no comparison, no notification), and a timer callback is just a function that runs later: to be visible, it must write through one of the six doors — normally `setState`, `dispatch` or a store action.

### Intermediate

1. **Move state down**: put the counter in a small child (`CounterButton`) so the parent never renders again — costs a new component and a props interface if the parent needs the value. **`children`**: keep the counter in the parent and render the expensive child as `children` — costs a slightly awkward API (the parent no longer owns the child's JSX directly). **`memo` + stable props**: keep everything and wrap the child in `memo`, passing only primitives or `useCallback`'d handlers — costs a comparison per render plus the discipline of never passing an inline object, which is the fragile part.
2. (a) A parent passing `data={{ rows }}` to a memoised table: renders every time because the object is new — fix by passing `rows` (or `useMemo` the object). (b) An effect dependency on an inline `options` array: the effect re-runs every render (measured in file 03, section F, for a callback) — fix with `useMemo` or by moving the array out of the component. (c) Selecting a computed object from a store: re-renders on every notification — fix with primitive selectors or `useShallow`. In all three the bug's *symptom* is an unnecessary render, and the *cause* is a reference that changes while the data does not.
3. (a) Profiler with "why did this render" on the interaction: if the reason is "state changed" in the filter box and "parent re-rendered" everywhere else, it is a state-placement problem, not a table problem. (b) Count the table's renders and measure their duration: 60 renders at 0.2 ms is 12 ms (fine); 60 renders at 5 ms is 300 ms (must fix). (c) Check the commit: if the mutations per render are small, moves are already cheap and the win must come from rendering fewer rows (virtualisation) rather than from fewer renders.

### Challenge

1. Keep the previous props and state in refs; on each render, shallow-compare and classify: `first render`, `props changed (list the keys)`, `state changed`, `parent re-rendered (props and state identical)`, `context/store change (cannot be distinguished from a parent render here)`. The cheating is inherent: a component cannot tell *why* it was rendered — it only knows what it observes — so context/store causes remain a guess, and the Profiler's reason column (which uses internal bookkeeping) is the only reliable source for them. The hook is still useful for distinguishing "my props changed" from "my parent just re-rendered", which is the most common confusion.
2. **Hypothesis 1** (filter box in the page): every keystroke re-renders the table; measure renders and `actualDuration` → both large. **Hypothesis 2** (state moved down): the page no longer renders; the table's props are unchanged, so with `memo` it skips → renders for the table drop to 0. **Hypothesis 3** (memoised rows): the table still renders each keystroke but rows do not; `MemoRow:render` stays flat (measured in file 03, section H) → render cost down, commit cost unchanged. **Hypothesis 4** (virtualisation): rows rendered drop from 5,000 to ~40, `MutationObserver` mutations drop from thousands to dozens → both costs down. The conclusion in each case is a number, not an opinion.
3. The budget lists: contexts (theme, auth, cart-dispatch) and their frequency; stores and their slices; which components may re-render per keystroke (form fields), per second (only a clock, if any), and never (the table rows while typing). The enforceable rule: **no inline object, array or function props to a memoised component**, checked in review and (better) by a lint rule such as `react/jsx-no-bind` plus a code convention that handlers come from `useCallback` or are module constants. The reason it must be a rule rather than a guideline is measured in file 03: a memo with unstable props silently does nothing, so the "optimisation" is invisible in the diff.

---

## 15. Summary

- **A re-render is React calling your function again.** It has six causes: own state, a parent's render, a context value change, a store notification with a changed selector result, a remount (key/type), and StrictMode in development. Nothing else triggers one.
- **Own state re-renders only that component; state in a parent re-renders the whole subtree.** Measured: `ChildStateCase` stayed at 1 render while its child ticked to 2; `ParentStateCase` and its child both moved to 2.
- **A parent re-render reaches children with unchanged props**, unless the child is `memo`ised with stable props, is passed as `children`, or its state was moved down. Measured: a `Wrapper` rendered 4 times while the `children` it was handed rendered once.
- **Context is the noisy one** (measured in Part 9: a coupon change re-rendered a badge that never read the coupon), and **a store can be precise** (measured: 0 renders for a dispatch-only button, no cart renders for a products-slice change).
- **Setting the same value bails out**: same primitive, same object reference → no render; a new object with identical contents → one render. That is why immutability and `useMemo` matter.
- **Batching collapses updates**: two `setState`s in a handler, in a `setTimeout`, or after an `await` all produced **one** render each, and five functional updates in a loop produced one render with the correct total.
- **Refs and timers do not re-render anything** (measured: 0 renders for two ref updates that changed the DOM).
- **Sort the re-renders into three buckets** — necessary-and-cheap (ignore), necessary-and-expensive (memoise/virtualise), unnecessary (restructure) — and decide with the Profiler's ranked view and reason column, in a production build.
- **A remount is not a re-render**: state, focus and DOM are recreated, which is a feature when a `key` is used deliberately and a bug when it happens by accident.
- The three cheapest wins, in order: **move state down**, **split contexts / narrow selectors**, **pass expensive subtrees as `children`**. File 03 covers the fourth — `memo`, `useMemo` and `useCallback` — and, more usefully, when they do nothing at all.

---

**What's next →** [`03-memoization.md`](./03-memoization.md) measures `React.memo`, `useMemo` and `useCallback`: the defeated memo that silently does nothing, the fixed one that skipped three inline props' worth of renders, the custom comparator that trades correctness for skipping, `useMemo` as a *call-count* reducer, `useCallback` as a correctness tool for effect dependencies, and the rule for when each one is worth writing.
