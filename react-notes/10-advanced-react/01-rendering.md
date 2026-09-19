# 01 — Rendering: Elements, the Render Phase, the Commit Phase

> **Part 10 · Advanced React · File 1 of 9**

Why this file exists: for nine parts you have written components and let React do the rest. That is the right way to learn React, and it is also why "rendering" still sounds like one magic step. It is not: React does two very different things in sequence — the **render phase**, where your functions run and produce a description of the UI, and the **commit phase**, where React writes to the DOM, calls refs, runs layout effects, paints, and finally runs passive effects. Almost every advanced topic in this part (why a component re-rendered, what `useMemo` saves, when Suspense can show a fallback, why a transition can interrupt a render) is a statement about *which* of those two phases you are in. This file makes the boundary visible, with a component tree instrumented so you can read the order of events and count exactly what happened — and then it does the same for reconciliation, the algorithm that decides which DOM nodes to keep, move, or throw away.

Transcripts come from `npx tsx --tsconfig tsconfig.app.json src/dev/run-render-probe.tsx` (React 19.3.0, jsdom 30.1.0).

---

## 1. Three things people call "the component"

| Term | What it is | In code |
| --- | --- | --- |
| **Element** | a plain object describing what to render: `{ type, props, key }`. Cheap, immutable, created every render | `<Child label="hi" />` or `jsx(Child, { label: 'hi' })` |
| **Component** | a function (or class) that returns elements | `function Child({ label }) { … }` |
| **Instance** | React's internal record for a mounted component: its hooks, its state, its place in the tree. You never touch it | the thing React DevTools shows as a box in the tree |

Consequences worth internalising before anything else:

- **An element is not a component.** `<Child />` does not call `Child`. It builds an object; React calls `Child` later, during the render phase, and only if it decides that component needs to render.
- **An element is recreated on every render** of the component that returns it. That is not wasteful — it is a small object, and comparing the old and new element trees *is* how React decides what to do (section 8).
- **"Re-rendering" means calling your function again**, not touching the DOM. The DOM is only touched in the commit phase, and only where the comparison says something changed. The measured proof is section 6.

⚠️ The most common confusion in interviews: "does React re-render children when the parent re-renders?" — the answer is about *elements*. A parent that re-renders returns **new elements** for its children (unless it received them as `children`), so React has to call those child functions again, props equal or not. Section 5 of file 03 shows the exception.

---

## 2. The two phases, in one diagram

```text
        ┌────────────────────────── render phase ──────────────────────────┐
        │ calls your components, builds a new element tree, reconciles it   │
        │ with the previous tree …                                          │
        │  • PURE: no DOM, no subscriptions, no logging that matters        │
        │  • interruptible in concurrent rendering (a newer update can win) │
        └───────────────────────────────┬──────────────────────────────────┘
                                        │ React now knows exactly which
                                        │ DOM changes are needed
        ┌───────────────────────────────▼──────────────────────────────────┐
        │ commit phase                                                      │
        │  1. mutate the DOM (insert / move / update / delete nodes)        │
        │  2. attach refs                                                    │
        │  3. run useLayoutEffect (synchronously, before the browser paints) │
        │  4. browser paints                                                 │
        │  5. run useEffect (passive effects, after paint)                  │
        │  • NOT interruptible: once started, the commit finishes           │
        └───────────────────────────────────────────────────────────────────┘
```

The distinction has practical consequences, and each one appears later in this part:

| Because the render phase is pure and interruptible… | Because the commit phase is not… |
| --- | --- |
| React may call your component twice (StrictMode, section 11) | a `useLayoutEffect` can block the paint — keep it tiny |
| A render can be thrown away and retried (transitions, file 09) | `useEffect` runs after the paint, so it cannot cause a flicker |
| Side effects in render produce wrong results and are unsafe | DOM changes inside a commit are visible immediately |

---

## 3. The render phase is a function call

The instrumented tree the probe renders (`src/part10/Tree.tsx`, trimmed):

```tsx
// src/part10/Tree.tsx
export function StaticOutput() {
  trace('StaticOutput:render');
  return <p data-testid="static">never changes</p>;
}

export function Sibling() {
  trace('Sibling:render');
  return <p data-testid="sibling">no props at all</p>;
}

export function Child({ label }: { label: string }) {
  trace('Child:render');
  useLayoutEffect(() => {
    trace('Child:layout');
  });
  useEffect(() => {
    trace('Child:effect');
    return () => {
      trace('Child:cleanup');
    };
  });
  return <p data-testid="child">{label}</p>;
}

export function Tree() {
  trace('Tree:render');
  const [count, setCount] = useState(0);
  const marker = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    trace('Tree:layout');
  });
  useEffect(() => {
    trace('Tree:effect');
    return () => {
      trace('Tree:cleanup');
    };
  });

  return (
    <section>
      <button type="button" data-testid="bump" onClick={() => setCount((current) => current + 1)}>
        count {count}
      </button>
      <span data-testid="marker" ref={marker}>untouched</span>
      <Sibling />
      <Child label={`child sees ${count}`} />
      <StaticOutput />
    </section>
  );
}
```

(`trace()` is a probe helper: it increments a counter and appends the label to a phase log. Nothing in an app should do this.)

### Measured: the order on mount

```text
=== A. Mount order: renders, then layout effects, then effects ===
   Tree:render → Sibling:render → Child:render → StaticOutput:render → Child:layout → Tree:layout → Child:effect → Tree:effect
   every render runs before any effect; effects run child-first (Child before Tree)
   counts after mount: Tree:render=1 Sibling:render=1 Child:render=1 StaticOutput:render=1 Child:layout=1 Tree:layout=1 Child:effect=1 Tree:effect=1
```

Three rules are visible in that one line:

1. **Every render happens before every effect.** React cannot run effects for a tree it has not finished rendering — and in concurrent rendering it cannot even be sure the render will finish (it may be restarted), which is *why* the rule exists.
2. **Layout effects run child-first** (`Child:layout` before `Tree:layout`), and so do passive effects (`Child:effect` before `Tree:effect`). A parent's effect can therefore assume its children's effects have run — which is what makes "measure the child, then position the parent" patterns work.
3. **Everything is depth-first in tree order**, so the renders appear in the order the elements are written: `Tree`, `Sibling`, `Child`, `StaticOutput`.

---

## 4. Purity in the render phase, and why it is not a style preference

The render phase must have **no observable side effects**: it may not write to the DOM, subscribe to anything, start a request, mutate shared state, or log something a test depends on. React is allowed to:

- call your component twice (StrictMode in development, measured in section 11),
- start rendering, then abandon the work because a more urgent update arrived,
- render a component "speculatively" for a transition (file 09).

All three are invisible if the render is pure and *bugs* if it is not. The classic failure is a render that appends to a module-level array or a database:

```tsx
// ❌ impure render: runs twice in StrictMode, and again if the render is discarded
let analyticsCalls = 0;
function ProductPage({ product }: { product: ApiProduct }) {
  analyticsCalls += 1; // "product viewed" — but a discarded render never happened
  return <h1>{product.name}</h1>;
}
```

```tsx
// ✅ the effect is the correct place: it runs once per committed render
function ProductPage({ product }: { product: ApiProduct }) {
  useEffect(() => {
    trackProductView(product.id);
  }, [product.id]);
  return <h1>{product.name}</h1>;
}
```

The rule of thumb that keeps you out of trouble: **render may read and compute; anything that writes, subscribes, or measures belongs in an effect or an event handler.**

---

## 5. The commit phase, step by step

| Step | What happens | How you observe it |
| --- | --- | --- |
| 1. DOM mutation | React inserts, moves, updates and deletes the nodes the diff asked for | `MutationObserver`, or DevTools' "Flash on update" |
| 2. Refs | `ref` callbacks and ref objects are attached/updated | a ref is non-null in a layout effect |
| 3. Layout effects | `useLayoutEffect` runs synchronously — before the browser paints | ordering in the phase log |
| 4. Paint | the browser computes styles/layout and draws | not observable from React (jsdom cannot) |
| 5. Passive effects | `useEffect` runs after paint, in a macrotask | ordering, and that it is late |

Step 3 deserves emphasis because it is the answer to "why is my tooltip in the wrong place for one frame?": a layout effect runs **before** the paint, so a measurement plus a state update inside it finishes before the user sees anything. Step 5 is the answer to "why can a `useEffect` cause a flicker?": the browser has already painted the frame that did not include the effect's result.

The probe shows both the ordering and the flushing behaviour:

```text
=== E. Effects: layout before paint, effects after ===
   Updater:render → Updater:layout → Updater:render → Updater:layout
   the layout effect updated state, and React flushed that render before the
   passive effects of the same commit — that is the "before paint" guarantee
   counts: Updater:render=2 Updater:layout=2
```

`LayoutEffectUpdater` sets state inside `useLayoutEffect`; React re-renders **synchronously**, inside the same commit, instead of waiting for a second paint. In a browser that is what stops a visible jump. ⚠️ In jsdom there is no real paint, so a probe can prove the *ordering* of the phases and the *synchronous flush*, but not the pixels — that measurement needs a browser (DevTools' performance panel, or a Lighthouse trace).

### Where a DOM write by hand fits

```text
=== D. A DOM update is not a render ===
   renders: (none)
   marker text now: "written 125"
   React never learned about this change (that is what refs are for)
```

The probe's button wrote to `marker.current.textContent` directly. Zero components rendered, and the DOM changed. Two lessons:

1. **Refs are the sanctioned escape hatch** for imperative work (focus, measurement, scroll, a third-party widget's API, an animation). Part 5, file 06 covered the rules.
2. **The reverse is the more important half** — a render does not imply a DOM update (next section). Together they kill the model "state changes → React rewrites the page".

---

## 6. Measured: a re-render is not a DOM update

```text
=== C. A re-render is not a DOM update ===
   renders: Tree:render=1 Sibling:render=1 Child:render=1 StaticOutput:render=1 Child:layout=1 Tree:layout=1 Child:cleanup=1 Tree:cleanup=1 Child:effect=1 Tree:effect=1
   DOM mutations recorded: 2
   every component re-rendered, but only the button label actually changed
   StaticOutput re-rendered 1 time(s) with identical output and produced no DOM writes of its own
```

One click:
- **four component functions ran** (`Tree`, `Sibling`, `Child`, `StaticOutput`), plus effects;
- **two DOM mutations** were recorded by a `MutationObserver` on the whole subtree — the button's text node and nothing else;
- `StaticOutput` re-rendered and produced **no DOM writes at all**.

That gap is the whole reason "re-render" and "slow" are different problems. A component that renders and returns the same output costs *your function's* time and React's comparison time — nothing else. Optimising therefore has two independent targets:

| Target | Symptom | Tools |
| --- | --- | --- |
| **Render cost** (functions running) | the Profiler shows components rendering often; typing feels heavy | `memo`, `useMemo`/`useCallback` (file 03), splitting state, moving state down, transitions (file 09) |
| **Commit cost** (DOM writes + layout) | big lists and heavy CSS cost real frames | keys (section 8), virtualization (file 04), `content-visibility`, fewer nodes |

⚠️ A "re-render" that changes nothing is cheap but not free, and it is worth *measuring* rather than assuming: the DevTools Profiler's flamegraph shows both the render duration and which components re-rendered. File 04 covers the workflow.

---

## 7. The rules of effect ordering, measured

```text
=== B. A parent re-render re-renders its children (props unchanged or not) ===
   Tree:render=1 Sibling:render=1 Child:render=1 StaticOutput:render=1 Child:layout=1 Tree:layout=1 Child:cleanup=1 Tree:cleanup=1 Child:effect=1 Tree:effect=1
   Sibling got no props and still rendered: React re-renders the subtree
   layout effects and passive effects both re-ran, because neither has a
   dependency array — and the cleanup ran BEFORE the new effect:
   Tree:render → Sibling:render → Child:render → StaticOutput:render → Child:layout → Tree:layout → Child:cleanup → Tree:cleanup → Child:effect → Tree:effect
   adding `[]` to an effect is what makes it mount-only (and unmount-cleanup)
```

Read the phase log carefully, because it contains four separate rules:

1. **All renders first, then all layout effects, then all cleanups, then all effects.** React does not interleave per component.
2. **Effects without a dependency array run after every render** (both kinds — layout and passive), which is why the pattern `useEffect(() => { … })` with no second argument is almost always a bug.
3. **Cleanup runs before the next effect** for the same effect (`Child:cleanup` before `Child:effect`), so an effect can rely on having torn down its previous run.
4. **`Sibling` re-rendered although it has no props.** Props are not what causes a re-render here — the parent did. Files 02 and 03 are entirely about this.

---

## 8. Reconciliation: how React decides what the DOM should do

Reconciliation is the comparison between the element tree from the last render and the element tree from this one. It is O(n) — not a general tree-diff — because React uses two rules plus keys:

| Situation | What React does |
| --- | --- |
| Same element **type** at the same position | updates the existing instance: new props in, state and DOM node kept |
| **Different type** (`<div>` → `<span>`, `<Child>` → `<Other>`) | unmounts the old subtree (state is lost) and mounts a new one |
| A list of children | matches old and new children **by key**, then by position when no keys are given |
| `key` changed for an element | treated as a different element: remount, state lost |

Two consequences you have already met: changing a component's `type` or `key` is how you reset state (Part 4's `key` remount trick), and **keys are the only information React has about identity in a list**.

### Measured: index keys vs id keys

The probe renders the same three people twice, once with `key={index}` and once with `key={person.id}`, types a note into each uncontrolled input, reorders the array, and asks the DOM what happened.

```text
=== G. Keys decide which DOM nodes are reused ===
   index keys, after reordering to Chetan, Asha, Bela: c:note-0 | a:note-1 | b:note-2
   DOM nodes kept their identity: true
   the note typed for Asha is now attached to the row showing Chetan
   DOM mutations from the reorder: 15
   id keys, same reorder: c:note-2 | a:note-0 | b:note-1
   the first li still belongs to the same person: true
   the notes travelled with their people (node moved, state intact)
   DOM mutations from the reorder: 10
```

With **index keys**, React compares children by position: position 0 was Asha, now it is Chetan, and the rule "same type at the same position" says *update the existing node*. The `<li>` is reused, its text changes to "Chetan", and — because the `<input>` inside is uncontrolled and its DOM state is not part of React's tree — **the note Asha typed stays in position 0**. The reading `c:note-0` is the bug in one line: Chetan's row now carries Asha's note. Type into a form, reorder, submit, and the wrong person gets the wrong data.

With **id keys**, React matches `c` to `c` and moves that node: `c:note-2` — the note travels with its person.

And the cost:

```text
=== H. Prepending a row: index keys rewrite every row, id keys insert one ===
   index keys: 16 DOM mutations for one new row
   id keys: 7 DOM mutations for the same change
```

Prepending a row with index keys shifts every position, so React updates all three existing rows' text and inserts one — 16 mutations. With id keys React inserts one node and shifts the rest: 7 mutations (moves are still DOM work, but no content is rewritten). ⚠️ Both numbers are from jsdom, which has no layout or paint; in a browser the gap is larger, because rewritten text invalidates layout while a moved node often does not.

**The key rules, stated once:**

1. Keys must be **stable** (the same item keeps its key across renders), **unique** among siblings, and **predictable** (derived from the data, not from a random number or an index of a reorderable list).
2. `key={index}` is acceptable only for lists that never reorder, never insert or remove in the middle, never filter — an empty state of affairs for anything the user can edit.
3. `key={Math.random()}` (or `Date.now()`) remounts everything on every render: state loss, dropped focus, re-run effects, and animation restarts.
4. A `key` on a component is *not* passed in `props` — if a child needs the id, pass it explicitly too.
5. Changing the key (or the element type) is the intentional way to **reset** a subtree: `<EditForm key={product.id} … />` gives every product a fresh form with fresh state.

---

## 9. What a commit does to the browser (and why the Profiler has two numbers)

The React DevTools Profiler reports a render for each component *and* a total commit time. Those correspond to the phases:

```text
render phase (per component)                    commit phase (once per update)
├─ call the component function                  ├─ write DOM changes
├─ diff its element against the previous        ├─ run refs
├─ run useMemo/useCallback factories that miss  ├─ run useLayoutEffect
└─ decide: keep, update, remount                ├─ browser paints
                                                └─ run useEffect
```

Practical consequences:

- A component that renders quickly but commits slowly is a **DOM/layout problem** (too many nodes, expensive CSS, a large list).
- A component that renders slowly is a **JavaScript problem** (heavy computation in the body, huge object graphs, work that should be memoised or moved out of render).
- A commit cannot be interrupted. A long commit is a dropped frame, no matter how "concurrent" the app is — which is why file 04's advice for big lists is *render fewer nodes*, not *schedule better*.

---

## 10. StrictMode: the render phase's seatbelt

```text
=== F. StrictMode double-invokes renders and effects in development ===
   Tree:render=2 Sibling:render=2 Child:render=2 StaticOutput:render=2 Child:layout=2 Tree:layout=2 Child:effect=2 Tree:effect=2 Tree:cleanup=1 Child:cleanup=1
   each render and effect ran twice (cleanup is called between the two effect runs)
   production builds do not double-invoke; the point is to surface impure renders
```

`<StrictMode>` (in `main.tsx`, from Part 3) asks React to exercise the parts of the model that are otherwise invisible:

| StrictMode does | So that you notice |
| --- | --- |
| renders each component twice on mount and on every update | impure render code (a counter incremented in render, a `Math.random()`, a mutation of a prop) |
| mounts, unmounts and remounts effects (effect → cleanup → effect) | effects that do not clean up: subscriptions, timers, sockets, listeners |
| re-runs `useMemo`/`useCallback` factories | a memo you are using for *correctness* rather than performance |
| double-invokes state updater functions | updaters with side effects (they must be pure) |
| warns about `ref` misuse, legacy APIs, and other traps | the long tail of deprecated patterns |

⚠️ Three rules for reading StrictMode correctly:

1. **The double render is development-only.** The production build renders once. If a component is slow, StrictMode doubles the cost in dev — do not "fix" a dev number.
2. **If your app breaks under StrictMode, it is broken**, not StrictMode: the same interruption can happen in production when a transition discards a render, and the same remount happens whenever a key or type changes.
3. **Cleanup is not optional.** The measured `Child:cleanup` between the two effect runs is exactly what a real unmount does; an effect that leaks a timer will leak it twice as fast in a StrictMode session — which is the point.

---

## 11. Interruptible work: a one-paragraph preview

Everything above assumed a render runs to completion. In concurrent rendering React may **start** a render, be interrupted by a more urgent update, and **throw the work away** — or render it in the background and commit it later (files 07 and 09). Two things follow, and both are already true of the code you write:

- the render phase must be **pure and repeatable**, because it may run more than once for a single commit;
- a slow render is not "unavoidable work" — it is work React is allowed to postpone, which is what `useTransition` and `useDeferredValue` exploit.

---

## 12. Portals, and where a commit writes

`createPortal(children, container)` renders children into a **different DOM node** while keeping them in the same React tree — the standard way to escape `overflow: hidden` for a modal or a tooltip:

```tsx
import { createPortal } from 'react-dom';

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true">{children}</div>
    </div>,
    document.body, // ← the commit writes here, not inside the component's parent
  );
}
```

What stays true and what changes: **context still flows** (the React tree is unchanged), **events still bubble through the React tree** (a click inside the portal reaches handlers on its React parents), and **the CSS cascade and stacking context follow the DOM** (which is the whole point). `flushSync` is the other escape hatch — it forces a commit to happen synchronously, and it is a last resort: it disables batching and can defeat the concurrent features of file 09, so reach for it only when you need layout effects and the paint to be ordered around an imperative API.

---

## 13. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Side effects in the render body (logging analytics, mutating a module variable) | they run twice in StrictMode and again if a render is discarded | put them in an effect or a handler |
| 2 | Writing to the DOM in render | React's own writes overwrite yours, and the render is not repeatable | refs, in an effect |
| 3 | Measuring layout in `useEffect` | the user sees a jump for one frame | `useLayoutEffect` (then remove it if you do not need measurement) |
| 4 | Heavy work in a layout effect | it blocks the paint | keep it tiny; move logic to effects/handlers |
| 5 | `key={index}` on an editable or reorderable list | typed values attach to the wrong row (measured: `c:note-0`) | `key={item.id}` |
| 6 | `key={Math.random()}` | every render remounts everything: lost state, focus, animations | a stable id |
| 7 | Reading `props.key` | it is not passed through | pass the id as a separate prop |
| 8 | Expecting a state change to touch the DOM | a render that outputs the same tree writes nothing (measured: 2 mutations for 4 renders) | measure with the Profiler and a MutationObserver, not with impressions |
| 9 | Calling a component instead of rendering it (`{Child()}`) | hooks run in the parent's scope; the component is not a component any more | `<Child />` |
| 10 | Conditional hooks or early returns before hooks | the hook order changes between renders | hooks first, conditions after |
| 11 | Assuming effects run parent-first | a parent effect that uses a child's ref breaks | child effects run first (measured) |
| 12 | Treating StrictMode's double render as a bug to suppress | real impurity stays hidden until production | fix the impurity, keep StrictMode |

---

## 14. Best practices

1. **Keep render pure.** Read and compute; never write, subscribe or schedule.
2. **Put DOM measurement in `useLayoutEffect`**, everything else in `useEffect`.
3. **Write to the DOM only through refs**, and only for what React cannot express.
4. **Use stable ids as keys**, and treat any `key={index}` as a bug report waiting to happen.
5. **Use a `key` change deliberately** to reset state when an entity changes (a form per product).
6. **Read the Profiler in two numbers** — render time (JavaScript) and commit time (DOM) — and name the problem before optimising.
7. **Keep StrictMode on** in development, and never ship a `console.log` that exists only because StrictMode confused you.
8. **Trust the two-phase model when something looks impossible**: if the DOM is wrong for one frame, think "paint between commit and effect"; if state disappears, think "remount, not update".
9. **Do not micro-optimise renders before measuring** — file 03 shows what `memo` does and, more importantly, when it does nothing.
10. **Prefer fewer DOM nodes to cleverer React code** for commit-bound slowness (file 04).

---

## 15. Practice

### Beginner

1. Explain, in your own words and in three sentences, the difference between an element, a component and an instance.
2. For each piece of code, say which phase it belongs to and why: (a) `document.title = 'Products'`, (b) `items.filter(...)`, (c) `socket.on('message', handler)`, (d) `ref.current.scrollIntoView()`, (e) `localStorage.setItem(...)`, (f) `useMemo(() => compute(rows), [rows])`.
3. Predict the phase order for this tree on mount, then check it against the model in section 3: `<App><Header /><Main><List /></Main></App>` where `Main` and `List` both use a layout effect and an effect.

### Intermediate

1. The lab's `Tree` component logs on every render and every effect. Add `[]` dependency arrays to its effects and predict what changes in the transcript for (a) the mount, (b) a bump, (c) an unmount. Then run the probe and compare.
2. A colleague's list uses `key={index}` and a form that saves "the note for row i". Explain what the user sees when they reorder, what the saved data looks like, and how to fix it without touching the API.
3. Write a component that measures its own size with `useLayoutEffect` and reports it to the parent, and one that does the same with `useEffect`. Explain why the devtools "paint flashing" option shows one of them flickering and the other not — and say honestly which part of that jsdom cannot demonstrate.

### Challenge

1. Build a `MutationObserver`-based "DOM churn" counter as a development overlay: count mutations per commit, and log the components that rendered in the same commit (using a Profiler `onRender` callback). Use it on the lab's 5,000-row table (file 04) to prove where the cost is.
2. Write a reconciler intuition test: for each change, predict whether React will update, move, or remount, and how much state survives — inserting at the front of a keyed list; changing an element's `type`; changing its `key`; swapping two keyed siblings; wrapping children in a new `<div>`. Then answer: which of these could lose a user's typed input?
3. Sketch (in prose and pseudocode) how you would implement a minimal keyed diff: given old and new arrays of `{ key }` children, produce a list of operations (insert, move, remove). Say why React cannot do better than O(n) in general, and give one input where your algorithm emits unnecessary moves.

---

## 16. Solutions

### Beginner

1. An element is a plain object describing UI (`{ type, props, key }`) and is created fresh on every render; a component is the function (or class) React calls to produce elements; an instance is React's internal record of a mounted component — its hooks, state and position in the tree — which is why "the same" element can map to a new instance (after a key change) or reuse an old one (after a re-render).
2. (a) Effect or handler — it writes to the DOM outside React's knowledge, and it must not run during a discarded render. (b) Render — it is a pure computation from props/state. (c) Layout effect or effect (an effect with cleanup) — it subscribes. (d) Effect (usually `useLayoutEffect` before paint) or a handler — it touches the DOM. (e) Effect — it writes outside React; never in render. (f) Render — memoisation is a render-phase concern (its factory runs during render).
3. All four renders (`App`, `Header`, `Main`, `List`) first, then layout effects child-first — `Header:layout`? Only components with layout effects log, so: renders (`App → Header → Main → List`), then `List:layout → Main:layout`, then `List:effect → Main:effect`. Header has no effects.

### Intermediate

1. (a) Mount is unchanged (effects always run on mount). (b) A bump now only renders (`Tree:render → … → StaticOutput:render`); layout and passive effects no longer appear, because their dependencies did not change. (c) Unmount runs only the cleanups (`Child:cleanup → Tree:cleanup`), in child-first order.
2. On reorder, the DOM node at each position is reused, so the uncontrolled input's DOM value (and any local state) stays with the *position* while the name moves — the user sees Chetan's row holding Asha's note. Saving sends the note with whatever id now sits at that index: the data is silently corrupted, and it looks like a server bug. Fix: `key={person.id}` (state follows the row), and if the note is React state, keep it in a map keyed by id so the value is genuinely attached to the person rather than to the node.
3. The layout-effect version measures after the DOM change but before the paint, so the corrected size can be committed (via state) in the same frame; the effect version measures after the paint, so the first frame shows the wrong size and the *next* frame corrects it — a visible flicker. What jsdom cannot show is the paint itself: the probe can prove the ordering (layout effects are synchronous, passive effects are late) and that a state update from a layout effect is flushed synchronously, but "did the user see a flash" requires a real browser recording.

### Challenge

1. Wrap the tree in `<Profiler id="list" onRender={(id, phase, actualDuration, baseDuration, startTime, commitTime) => log({ id, phase, actualDuration, commitTime })}>` to get the commit's timing, and run the `MutationObserver` from `src/part10/renderTrace.ts` with `subtree: true`. Each commit then produces a row: `{ componentsRendered, mutations, renderMs, commitMs }`. On the 5,000-row table the first commit has ~5,000 mutations and a large `actualDuration`; after virtualization (file 04) both drop to a couple of dozen — the same app, measured twice.
2. Predictions: **insert at front (keyed)** → one insert, everything shifts (state survives everywhere); **change `type`** → remount, all state in that subtree is lost; **change `key`** → the same remount, deliberately; **swap two keyed siblings** → two moves, state travels with the keys; **wrap children in a new `<div>`** → the parent chain changed, so React unmounts the children and mounts new ones (state lost — a common accident when adding a wrapper component). The two that lose typed input are the last two: changing the element type/position in the hierarchy, and changing keys.
3. Keep a map from key → index for the old children, walk the new children, and for each: if the key exists in the map, emit a MOVE to the current position; otherwise emit an INSERT. Any old keys not consumed become REMOVEs. The cost is O(n) with a map (React's actual algorithm prefers moves to the right and uses the last-placed index as a heuristic). It cannot do better in general because a list of unique keys can be permuted in n! ways and any algorithm must at least inspect each child — there is no structure to exploit beyond the keys. Unnecessary-move example: reversing a list can be done with zero moves if React treats it as "move the whole run", but a naive algorithm emits n−1 moves; another is reordering where all items move but the *relative* order of a block is preserved (`[a,b,c] → [c,a,b]` needs one move, not two).

---

## 17. Summary

- **An element is an object, a component is a function, an instance is React's record.** `<Child />` does not call `Child`; React decides when to call it, during the render phase.
- **Rendering has two phases.** The **render phase** runs your functions and diffs element trees — pure, repeatable, interruptible. The **commit phase** writes the DOM, attaches refs, runs layout effects, paints, then runs passive effects — not interruptible, not repeatable.
- **Measured mount order:** `Tree:render → Sibling:render → Child:render → StaticOutput:render → Child:layout → Tree:layout → Child:effect → Tree:effect` — all renders first, effects child-first, cleanup before the next effect.
- **A re-render is not a DOM update.** Measured: four components rendered and only **2 DOM mutations** happened; a component with constant output rendered and wrote nothing.
- **A DOM update is not a render.** Measured: a ref-based write changed the DOM with **0 renders**.
- **A layout effect can flush a state update synchronously before the passive effects of the same commit** — the "before paint" guarantee (ordering proved in jsdom; pixels need a browser).
- **StrictMode double-invokes renders and effects in development** (measured: every render `=2`, effects `=2` with one cleanup between) to surface impurity and missing cleanup. Production does not double-invoke.
- **Reconciliation is type + position + keys**: same type updates, different type remounts, and keys are the only identity information in a list. Measured: with `key={index}` a reorder left the typed note on the wrong row (`c:note-0`) and prepending cost **16 DOM mutations**; with ids the notes travelled with their people and the prepend cost **7**.
- **Two numbers to optimise separately**: render cost (JavaScript, in your components) and commit cost (DOM nodes, layout, paint). Files 03 and 04 tackle them one at a time.

---

**What's next →** [`02-re-rendering.md`](./02-re-rendering.md) answers the question this file kept bumping into: *what exactly causes a re-render?* State, a parent, a context change, an external store, a key change — each measured, with the situations where a re-render is unavoidable, where it is avoidable, and where avoiding it is a waste of effort.
