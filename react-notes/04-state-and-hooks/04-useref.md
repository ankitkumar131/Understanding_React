# 04 — `useRef`: The Value That Does Not Render

> **Part 4 · State and Hooks · File 4 of 10**
> Why this file exists: not every piece of data in a component belongs on screen. A timer id, a DOM node, an `AbortController`, "the value from the previous render", "the newest value seen by a listener" — React's state API is the *wrong* tool for all of them, because changing them must **not** cause a render. `useRef` is the hook for exactly that, and it is also the hook people most often use for the wrong thing (storing data that the UI displays). This chapter draws the line precisely, with two measured experiments: one proving that ref changes never render, and one proving that a listener can read a **fresh** value through a ref while state inside the same closure is stale forever.

---

## 1. State vs ref, in one question

> **Does the user see it change?**
> Yes → **state** (`useState`). No → **ref** (`useRef`).

A counter that the screen displays is state. The id of the interval behind that counter is a ref. The search box's DOM element is a ref. The list of products is state; the fact that "a request is currently in flight" matters only when it changes what is drawn — if it drives a spinner, it is state; if it only prevents a duplicate request, it is a ref.

React's own documentation says it in one line:

> `useRef` is a React Hook that lets you reference a value that's **not needed for rendering**.

| | State (`useState`) | Ref (`useRef`) |
| --- | --- | --- |
| Survives re-renders | ✅ | ✅ |
| Changing it re-renders the component | ✅ (that is the point) | ❌ never |
| Read during render | ✅ expected | ❌ only for initialisation |
| Written during render | via the setter (as a *request*) | ❌ never |
| Value readable immediately after writing | ❌ (snapshot) | ✅ (plain object mutation) |
| Belongs to a specific component instance | ✅ | ✅ |
| Survives unmount + remount | ❌ (state is destroyed) | ❌ (the ref object is recreated) |
| Typical contents | `query`, `lines`, `status` | timer ids, DOM nodes, controllers, "latest value" |

The row that surprises people is the last one: **a ref does not survive a remount.** A ref lives in the same "slot" as state — the component instance's hook list (file 10) — so unmounting throws it away too. If a value must outlive components, it needs module scope, `localStorage`, a server, or a store (Part 5+).

---

## 2. Signature and shape

```ts
const ref = useRef(initialValue);   // ref: { current: T }
```

`useRef` returns an object with **one mutable property**, `current`. The official docs are precise about it:

- "`initialValue`: The value you want the ref object's `current` property to be initially… **This argument is ignored after the initial render.**"
- "On the next renders, `useRef` will return the same object."
- "You can mutate the `ref.current` property. Unlike state, it is mutable."
- "When you change the `ref.current` property, React does not re-render your component."

Compare that with `useState`: same lifetime, same "initial value only once" rule, opposite reaction to being changed.

```tsx
const inputRef = useRef<HTMLInputElement>(null); // a DOM node, filled in by React
const timerRef = useRef<number | null>(null);    // a timer id, written in an effect
const countRef = useRef(0);                      // a number the user never sees
```

---

## 3. Measured: ref changes do not render

**File: `src/dev/ref-memo-probe.tsx`** (temporary lab harness; the same file produced the numbers for files 05–09)

```tsx
function RefCounter() {
  const [tick, setTick] = useState(0);
  const ref = useRef({ clicks: 0, identity: 'first render' });
  refRenders += 1;
  return (
    <div>
      <span className="ref-value">{ref.current.clicks}</span>
      <button className="bump-ref" onClick={() => { ref.current.clicks += 1; }}>
        ref.current.clicks += 1
      </button>
      <button className="force" onClick={() => setTick(tick + 1)}>
        update state
      </button>
    </div>
  );
}
```

**Verified output** (`/tmp/part4-refmemo.txt`):

```text
1. useRef holds a value across renders and does NOT trigger a render
   start                     : span shows "0"
   after 3 ref bumps         : span shows "0"   (the screen never re-rendered)
   renders so far            : 1   (mount; ref changes cause none)
   after forcing a state update: span shows "3"   (the value was there all along)
   renders so far            : 2
```

Three facts in five lines:

1. **The ref survived.** `0 → 3` across three clicks, with no re-render in between. A plain `let` would have been reset by any render; a state variable would have re-rendered the screen three times.
2. **The screen did not change.** `ref.current.clicks += 1` is invisible to React.
3. **The value was never lost.** The moment *any* render happened (because of unrelated state), the fresh value appeared. The data was there; the notification was not.

This is exactly why "my value updated but the screen didn't" is always the same conversation: if the screen must show it, it is state.

---

## 4. The two rules about *when* you may touch a ref

React's documentation is unusually blunt here:

> **"Do not write _or read_ `ref.current` during rendering, except for initialisation. This makes your component's behavior unpredictable."**

Read that twice, because both halves matter and both are broken constantly in tutorials.

```tsx
// ❌ writing during render — the render is no longer pure
function Bad() {
  const countRef = useRef(0);
  countRef.current += 1;              // StrictMode double-invokes render: this counts twice
  return <span>{countRef.current}</span>; // ❌ reading during render — invisible to React anyway
}

// ✅ write in an event handler
function Good() {
  const countRef = useRef(0);
  const handleClick = () => {
    countRef.current += 1;            // ✅ runs after render, on a user action
  };
  return <button onClick={handleClick}>count me</button>;
}

// ✅ write in an effect (after the commit)
useEffect(() => {
  latest.current = count;
}, [count]);
```

Why the rule exists:

- **Render must be pure** (Part 3, file 07). A component that writes to the outside world during render behaves differently when React calls it twice (StrictMode — documented: "Each ref object will be created twice, but one of the versions will be discarded"), or when the render is interrupted and replayed.
- **Reading during render is unreliable** — React does not track ref changes, so the value you read may not be the value the DOM was built from.

The practical guideline that follows: **refs are for event handlers, effects, and callbacks — not for the render path.** If a ref's value influences the JSX in a way that must be correct, that value should be state.

---

## 5. DOM refs: giving React a handle to a real element

The most common use of `useRef`: getting the actual DOM node.

```tsx
const searchRef = useRef<HTMLInputElement>(null);

return (
  <>
    <input ref={searchRef} id="product-search" type="search" />
    <button type="button" onClick={() => searchRef.current?.focus()}>
      Focus search
    </button>
  </>
);
```

The lifecycle of `searchRef.current` is worth knowing exactly:

| Moment | `searchRef.current` |
| --- | --- |
| During the first render | `null` — the DOM does not exist yet |
| After React commits the DOM | the `<input>` element |
| Between renders (no DOM change) | the same element |
| After the element is removed / the component unmounts | `null` again (React clears it) |

That timing explains why `searchRef.current.focus()` in the render body would throw (`TS18047: 'searchRef.current' is possibly 'null'` at compile time, `TypeError` at runtime) while the same call inside a click handler or an effect is safe. The `?.` in `searchRef.current?.focus()` is not decoration; it is the honest expression of "this may not exist yet".

The lab uses this for a real feature — pressing `/` focuses the search box, implemented with a ref and a document-level listener:

```tsx
const searchRef = useRef<HTMLInputElement>(null);
const focusSearch = useCallback(() => searchRef.current?.focus(), []);
useKeyDown('/', focusSearch, { ignoreInInputs: true });
// …
<SearchBar ref={searchRef} onSearch={setQuery} />
```

**Verified end-to-end** in the app trace (`/tmp/part4-app.txt`):

```text
8. pressed the "/" key on the page
   activeElement : product-search (INPUT)
```

💡 **Focus is the canonical DOM-ref use case** because it is genuinely imperative: there is no JSX attribute meaning "make this focused". The same is true for `scrollIntoView()`, measuring an element, selecting text, and calling an imperative API of a canvas or a video element.

---

## 6. React 19: `ref` is an ordinary prop

Before React 19 you had to wrap a function component in `forwardRef` to let a parent attach a ref to something inside it:

```tsx
// Legacy (React 18 and earlier) — you will still see this in older code
const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(props, ref) {
  return <input ref={ref} {...props} />;
});
```

In React 19 you simply declare `ref` as a prop and forward it to the element you want. This is the lab's real component, and it compiles cleanly with `@types/react@19`:

```tsx
import { useState, type ChangeEvent, type FormEvent, type Ref } from 'react';

export interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialQuery?: string;
  /**
   * React 19: `ref` is an ordinary prop, so the parent can focus the input
   * without `forwardRef`. A ref is an escape hatch — it is used here only for
   * focus, which is a browser imperative.
   */
  ref?: Ref<HTMLInputElement>;
}

export function SearchBar({ onSearch, placeholder = 'Search products…', initialQuery = '', ref }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  // …
  return (
    <form className="search" onSubmit={handleSubmit} role="search">
      <label htmlFor="product-search">Search</label>
      <input ref={ref} id="product-search" type="search" value={query} onChange={handleChange} placeholder={placeholder} />
      {/* … */}
    </form>
  );
}
```

Call site — no different from passing a string:

```tsx
const searchRef = useRef<HTMLInputElement>(null);
<SearchBar ref={searchRef} onSearch={setQuery} />
```

`Ref<T>` accepts three things: a ref object (`useRef`), a **ref callback** (`(node) => …`), or `null`. That callback form is useful when you want to *do* something on attach/detach:

```tsx
<input
  ref={(node) => {
    // React calls this with the element on mount and with null on unmount.
    node?.focus();
  }}
/>
```

**When should a component expose a ref at all?** Only when the parent needs an *imperative* action the component cannot express as props: `focus()`, `scrollTo()`, `play()`, `reset()`. If the parent wants *data*, pass a callback prop (`onSearch`, `onChange`) instead. A ref that exists so the parent can read a child's state is a design smell — lift the state instead (file 02, section 11).

### `useImperativeHandle`: a deliberate, narrow API

When a component owns a DOM node but must expose a curated imperative API, `useImperativeHandle` shapes what `ref.current` looks like:

```tsx
import { useImperativeHandle, useRef, type Ref } from 'react';

interface SearchBarHandle {
  focus: () => void;
  selectAll: () => void;
}

export function SearchBar({ ref }: { ref?: Ref<SearchBarHandle> }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    selectAll: () => inputRef.current?.select(),
  }), []);

  return <input ref={inputRef} type="search" />;
}
```

The parent gets two honest methods instead of the whole DOM node. This is a real pattern for design-system components (a `<VideoPlayer>` exposing `play`/`pause`, a `<Table>` exposing `scrollToRow`), and it should stay rare: props and state cover almost everything.

---

## 7. The "latest value" pattern: a ref that keeps a listener fresh

This is the most valuable use of `useRef` in application code, and it solves the stale-closure problem from file 03 without re-subscribing.

**Verified** — a component with a `count` state, a ref that mirrors it, and a document listener registered **once** with `[]`:

```text
2. a listener registered once ([] deps) that wants the newest count
   button : count=4   listener said: state in closure says 0, ref says 4
```

The button says `4`. The listener's closure over `count` says `0` (it captured the first render). The listener's read of `latest.current` says `4`, because the ref object is shared with the render that wrote it.

The shape to memorise:

```tsx
export function useKeyDown(key: string, handler: KeyHandler, options: KeyDownOptions = {}): void {
  const handlerRef = useRef(handler);

  // Keep the ref pointing at the newest callback (never write refs during render).
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key) return;
      handlerRef.current(event);   // ← always the newest handler
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [key]);                        // ← the listener is attached once per key
}
```

Two effects, two jobs: one keeps the ref current, the other owns the subscription. The subscription never restarts because the caller passed a new function; the handler never goes stale because it is read through the ref at call time.

The hook also demonstrates an **options object** (so the call site reads `useKeyDown('/', handler, { ignoreInInputs: true })`), and the harness proves the option works:

```text
14. useKeyDown("/", handler, { ignoreInInputs: true })
   pressing "/" on the page        : handler calls -> 1
   pressing "/" inside the input   : handler calls -> 1   (ignored while typing)
```

**Where else this pattern is the right answer:**

| Situation | Why a ref, not state |
| --- | --- |
| A socket's message handler that needs current props | the callback is registered once; the props change per render |
| A `setInterval` tick that needs the newest state | re-creating the interval every tick is wasteful and lossy |
| A debounced/throttled callback | the timer must keep its identity while the payload changes |
| "The previous value" of a prop or state | comparing renders is bookkeeping, not display |

The last one is worth its own tiny hook, because it is a favourite interview question and a genuinely useful utility:

```ts
import { useEffect, useRef } from 'react';

/** Returns the value from the PREVIOUS render (undefined on the first render). */
export function usePrevious<T>(value: T): T | undefined {
  const previous = useRef<T | undefined>(undefined);

  useEffect(() => {
    previous.current = value; // runs after the render that produced `value`
  }, [value]);

  return previous.current;
}
```

---

## 8. Refs for non-DOM machinery

Anything with a lifecycle that is not visual is a ref:

```tsx
// 1. a timer id — needs to survive the render that created it, and never re-render
const timerRef = useRef<number | null>(null);
useEffect(() => {
  timerRef.current = window.setInterval(() => setNow(new Date()), 1000);
  return () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  };
}, []);

// 2. an AbortController — created per request, cancelled in cleanup
const controllerRef = useRef<AbortController | null>(null);

// 3. "has this ever rendered" — a one-way flag that should never cause a render
const hasMountedRef = useRef(false);
useEffect(() => {
  hasMountedRef.current = true;
}, []);

// 4. a counter of attempts that the UI does not show
const attemptsRef = useRef(0);
```

⚠️ **Do not confuse "does not re-render" with "hidden state".** Each of those four is legitimate because nothing on screen depends on it. The moment one of them *should* change the UI (a spinner for "in flight", a badge for "attempts"), it must be state — otherwise you get the bug from section 3: the value updates, the screen does not.

---

## 9. TypeScript and refs

The lab keeps a type-level test file (`src/dev/__ref-types.tsx`) that compiles under `npx tsc -b` with these claims. Three patterns cover almost every case:

```ts
// 1. DOM refs: initial value null → the type is nullable, and that is the point
const inputRef = useRef<HTMLInputElement>(null);
inputRef.current;                 // HTMLInputElement | null
// @ts-expect-error it can be null until React attaches the element
inputRef.current.focus();
if (inputRef.current !== null) inputRef.current.focus(); // ✅ narrowed
inputRef.current = null;          // assignment is allowed: it is a mutable box

// 2. Value refs: a real initial value → inferred, never null
const countRef = useRef(0);
countRef.current += 1;            // number
// @ts-expect-error a number ref only accepts numbers
countRef.current = 'one';

// 3. Nullable machinery: start unknown, set later
const timerRef = useRef<number | null>(null);
window.clearTimeout(timerRef.current ?? undefined);
```

And the type of the `ref` **prop** (React 19):

```ts
import type { Ref, RefObject } from 'react';

const searchRef: Ref<HTMLInputElement> = inputRef;                    // ✅ useRef fits Ref<T>
const alsoRefObject: RefObject<HTMLInputElement | null> = inputRef;   // ✅ the object shape
```

| You want | Type to write | Why |
| --- | --- | --- |
| A DOM element | `useRef<HTMLInputElement>(null)` | `null` communicates "not attached yet" |
| A number that starts at 0 | `useRef(0)` | inference gives `number`; no annotation needed |
| A timer id | `useRef<number \| null>(null)` | browsers return numbers; "not scheduled yet" is `null` |
| An `AbortController` | `useRef<AbortController \| null>(null)` | created lazily, cancelled in cleanup |
| A prop that accepts a ref | `ref?: Ref<HTMLInputElement>` | matches what JSX expects |
| A custom imperative API | `useImperativeHandle` + an interface | keeps the surface small (section 6) |

⚠️ **Never type a ref as `any` to silence the null check.** `inputRef.current?.focus()` (optional call) or an explicit `if` is the correct expression of "may not exist yet", and it is self-documenting.

---

## 10. StrictMode, refs and double rendering

React documents this precisely: in Strict Mode the component function is called twice, so **each ref object is created twice and one of the versions is discarded**. Consequences:

- `useRef` is safe under double rendering *as long as you obey section 4* — that is, you do not write to it during render. If you do (`countRef.current += 1` in the body), your value is incremented twice per commit in development, and your screen will disagree with production.
- "Has mounted" flags written in effects are called twice with cleanup in between (file 03, section 7). Design them so the second run is harmless.
- Focus-on-mount effects will simply focus twice. Harmless, and a useful reminder to keep the effect idempotent.

The general rule from Part 3 still holds and now has a second reason: **render must be pure**, refs included.

---

## 11. Three homes for data that must not cause a render

Refs are not the only option, and choosing well matters:

| Home | Scope | Survives unmount? | Shared between instances? | Use for |
| --- | --- | --- | --- | --- |
| Local variable in the component | one render | ❌ (recreated every render) | ❌ | a newly computed value you are about to use |
| `useRef` | one component instance | ❌ | ❌ | DOM nodes, timers, controllers, latest values |
| Module-level variable in the file | the whole app's lifetime | ✅ | ✅ (all instances share it) | app-wide singletons: a cache, an analytics queue, a `Map` of listeners |
| `localStorage` / `sessionStorage` | until cleared | ✅ | ✅ (across tabs for the former) | preferences the user expects to keep (file 09's `useLocalStorageState`) |

The middle two rows are the ones people mix up. A ref is **per instance**: two `<Clock />` components have two independent timer refs. A module variable is **global**: if you store "the current interval id" in module scope, the second `<Clock />` overwrites the first one's id and the first clock can never be cleared — the classic bug that makes "why does my counter keep running after I hide it?" happen. Refs exist precisely to keep that bookkeeping per instance.

---

## 12. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Storing display data in a ref | the value changes, the screen does not (measured: `0 → 0 → 3`) | use `useState` |
| 2 | Reading `ref.current` during render | unpredictable output; `TS18047` for DOM refs | read it in handlers/effects; use state if the JSX depends on it |
| 3 | Writing `ref.current` during render | wrong values under StrictMode's double render | write in handlers/effects |
| 4 | Expecting a ref change to re-render | "nothing happens" | state, or a deliberate re-render |
| 5 | `ref.current.focus()` without a null check | `TypeError` before the element mounts | `ref.current?.focus()` or an `if` |
| 6 | Using a ref where a module-level cache belongs | two component instances fight over one value | decide scope deliberately (section 11) |
| 7 | Putting `ref.current` in a dependency array | the effect does not re-run when the value changes — refs are not reactive | depend on the underlying value, or restructure |
| 8 | Using a ref to avoid "prop drilling" or to reach a child's state | the parent's copy goes stale; the UI and data disagree | lift state (file 02) or use context (file 05) |
| 9 | `forwardRef` in new code | extra ceremony, and it is unnecessary in React 19 | declare `ref?: Ref<T>` as a prop (section 6) |
| 10 | A ref inside a conditional | hook-order violation (file 10) | call `useRef` unconditionally at the top |
| 11 | Assuming a ref resets on re-render | it persists — that is usually desired, occasionally a bug | reset it explicitly in the right effect/handler |
| 12 | Assuming a ref survives unmount | it does not | module scope, storage, or a parent that owns the state |

---

## 13. Best practices

1. **Ask the render question first**: "does the user see it?" If yes → state; if no → ref.
2. **Keep refs out of the render path.** Read and write them in handlers, effects and callbacks.
3. **Name refs after what they hold**: `inputRef`, `timerRef`, `controllerRef`, `latestHandlerRef`. The suffix makes the escape hatch visible in review.
4. **Do not store state in a ref to "avoid re-renders"** — that is the bug, not the fix.
5. **Use the latest-value pattern** (ref + mirroring effect) instead of re-subscribing listeners, sockets and intervals.
6. **Prefer props over refs for data**, and refs only for imperative actions (`focus`, `scrollTo`, `play`).
7. **In React 19, declare `ref?: Ref<T>` as a prop** and drop `forwardRef` from new code.
8. **Type refs honestly** — `T | null` for DOM nodes and lazily initialised machinery, with explicit narrowing.
9. **Initialise lazily when the value is expensive**: `useRef<Map<string, number> | null>(null)` written once in an effect, rather than `useRef(new Map())` which rebuilds the argument on every render (the argument is discarded, but the work is not).
10. **Prefer `useEffect` for anything that must be undone** when the ref's lifetime ends — refs have no cleanup hook of their own.

---

## 14. Real-world example: the four refs in MegaShop

| Ref | Where | What it holds | Why it is a ref |
| --- | --- | --- | --- |
| `searchRef` | `App.tsx` | the `<input>` element of the search box | focus is imperative; the value itself lives in `SearchBar`'s state |
| `handlerRef` | `useKeyDown.ts` | the newest `keydown` handler | the document listener must be attached once but always call the current handler |
| `latest` | the effect harness (file 03) | the newest `count` for a `[]` interval | avoids both a stale closure and a restarting interval |
| `previous` | `usePrevious` (utility) | the value from the previous render | comparing renders is bookkeeping, not display |

And the things that are **state**, not refs, in the same app: the cart lines, the search query, the selected category, the toast message, the loading state of a request. The distinction is not "important vs unimportant" — it is "visible vs invisible".

The `/` shortcut ties several ideas from this chapter together in one feature: a DOM ref (focus), a stable callback (`useCallback`, file 08), an options object in a custom hook (file 09), a document listener with a cleanup (file 03), and a ref-based "latest handler" so the listener never restarts.

---

## 15. Practice

### Beginner — a focus button and a click counter that does not render

**File: `src/practice/FocusPanel.tsx`**

- An `<input>` and a "Focus the input" button — the button must place the cursor inside the input using a ref.
- A "Log a click (no re-render)" button that increments a ref-based counter and shows the count **only** inside an `alert()`-style status line printed by a *separate* "Show the recorded count" button that sets state.

Then answer: after three "Log a click" presses, what does the screen say? Why? And what does it say after "Show the recorded count"? (Your answer should match the measured `0 → 0 → 3` pattern from section 3.)

### Intermediate — `usePrevious` and a "changed" indicator

**File: `src/practice/usePrevious.ts`** (implement it from the sketch in section 7) and **`src/practice/PriceWatch.tsx`**:

- `PriceWatch` receives `priceMinor: number` as a prop and shows the current price plus an arrow (`▲` / `▼`) when it changed since the previous render.
- Use `usePrevious` — the component itself must have **no state**.
- Render it in a small harness with a "Change price" button that cycles through three prices, and check the arrow direction each time.
- Then explain why `usePrevious` needs an effect (and not a plain `useRef` assignment during render).

### Challenge — a scroll-spy hook with a ref and a listener

**File: `src/practice/useActiveSection.ts`** and **`src/practice/SectionNav.tsx`**.

Requirements:

- `useActiveSection(ids: string[]): string | null` — returns the id of the section currently closest to the top of the viewport.
- Implementation: **one** `scroll` listener attached once, reading the sections from the DOM by id (via `document.getElementById`), with a `passive: true` listener option and a `requestAnimationFrame` guard so the handler runs at most once per frame.
- The listener must see the **newest** `ids` array even though it is attached with `[]` — use the latest-value ref pattern (section 7). Explain why depending on `ids` directly is wrong here (`ids` is a new array on every render, so the listener would be removed and re-added constantly).
- `SectionNav` renders one `<a href="#id">` per section, marks the active one with `aria-current="true"`, and clicking scrolls smoothly (`element.scrollIntoView({ behavior: 'smooth' })` — an imperative DOM call, so use a ref or the element itself, not a router for now).
- Cleanup must remove the listener and cancel any pending animation frame.

Then answer: what happens if you forget `passive: true`, and what happens if you forget to cancel the animation frame in the cleanup?

---

## 16. Solutions

### Beginner

```tsx
import { useRef, useState } from 'react';

export function FocusPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const clicksRef = useRef(0);           // never rendered → ref
  const [reported, setReported] = useState<number | null>(null); // rendered → state

  return (
    <section>
      <label htmlFor="focus-panel-input">Name</label>
      <input id="focus-panel-input" ref={inputRef} />

      <button type="button" onClick={() => inputRef.current?.focus()}>
        Focus the input
      </button>

      <button
        type="button"
        onClick={() => {
          clicksRef.current += 1; // ✅ written in a handler, never during render
        }}
      >
        Log a click (no re-render)
      </button>

      <button type="button" onClick={() => setReported(clicksRef.current)}>
        Show the recorded count
      </button>

      <p>Recorded: {reported === null ? 'not asked yet' : reported}</p>
    </section>
  );
}
```

Answers: after three presses the screen still says `Recorded: not asked yet` — `clicksRef.current` changed from 0 to 3, but changing a ref does not re-render, so React never produced new output. After "Show the recorded count", `setReported(3)` re-renders and the paragraph reads `Recorded: 3`. This is the measured pattern from section 3, reproduced with your own hands. The lesson: the moment a value must appear on screen, it belongs in state — and if you want *both* (cheap bookkeeping now, displayed later), copy it from the ref into state when the user asks.

### Intermediate

**File: `src/practice/usePrevious.ts`**

```ts
import { useEffect, useRef } from 'react';

export function usePrevious<T>(value: T): T | undefined {
  const previous = useRef<T | undefined>(undefined);

  useEffect(() => {
    previous.current = value;
  }, [value]);

  return previous.current;
}
```

**File: `src/practice/PriceWatch.tsx`**

```tsx
import { formatMoney } from '../data/products';
import { usePrevious } from './usePrevious';

export function PriceWatch({ priceMinor }: { priceMinor: number }) {
  const previous = usePrevious(priceMinor);

  const direction = previous === undefined || priceMinor === previous ? 'flat' : priceMinor > previous ? 'up' : 'down';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•';

  return (
    <p>
      Price: <strong>{formatMoney(priceMinor)}</strong> <span aria-label={`direction: ${direction}`}>{arrow}</span>
      {previous === undefined ? null : <small> (was {formatMoney(previous)})</small>}
    </p>
  );
}
```

Why an effect, and not `previous.current = value` during render: the assignment must happen **after** the render that produced `value`, or the "previous" value would already be the current one. An effect runs after the commit, so during render `previous.current` still holds the value from the render before — which is exactly what is returned. Writing it in the render body would (a) break the purity rule from section 4, and (b) under StrictMode's double render, overwrite the history an extra time, so the arrow would sometimes disappear.

### Challenge

**File: `src/practice/useActiveSection.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  // The listener is attached once, so it must read the newest `ids` through a ref.
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0; // the frame has been served
      let best: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const id of idsRef.current) {
        const element = document.getElementById(id);
        if (element === null) continue;
        const distance = Math.abs(element.getBoundingClientRect().top);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = id;
        }
      }
      setActive(best);
    };

    const onScroll = () => {
      if (frame !== 0) return;                  // at most one measurement per frame
      frame = window.requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    measure(); // set the initial value without waiting for a scroll

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []); // attached once — the ref keeps it fresh

  return active;
}
```

**File: `src/practice/SectionNav.tsx`**

```tsx
import { useActiveSection } from './useActiveSection';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'specs', label: 'Specifications' },
  { id: 'reviews', label: 'Reviews' },
] as const;

export function SectionNav() {
  const active = useActiveSection(SECTIONS.map((section) => section.id));

  return (
    <nav aria-label="Sections">
      <ul>
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault(); // keep the URL clean; scroll imperatively
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Answers: **`passive: true`** tells the browser the handler will not call `preventDefault()`, so it can start scrolling immediately instead of waiting for JavaScript — without it, scroll handlers are a classic source of jank on mobile. Forgetting to `cancelAnimationFrame` in the cleanup leaves a scheduled frame alive after unmount; it will call `measure`, which calls `setActive` on a component that no longer exists (harmless in React 18+, but it keeps the whole closure — and the DOM lookups — alive for another frame, and it is exactly the kind of leak that scales badly). Note also why `ids` must not be a dependency: `SECTIONS.map(...)` produces a new array on every render, so the effect would tear down and re-attach the listener on every render — the ref keeps the listener stable *and* fresh, which is the whole argument for this pattern.

---

## 17. Summary

- A **ref is a mutable box** (`{ current }`) that survives renders and **never causes one**. Use it for values that are not part of the output.
- `useRef(initialValue)` ignores the argument after the first render, and returns **the same object** on later renders.
- **Never read or write `ref.current` during render** (except for initialisation). Handlers and effects are the places for refs.
- **DOM refs** (`useRef<HTMLInputElement>(null)`) start as `null`, are filled in after the commit, and are cleared on unmount — hence `ref.current?.focus()`.
- In **React 19**, `ref` is an ordinary prop: declare `ref?: Ref<T>` and drop `forwardRef`. Use `useImperativeHandle` to expose a deliberately small imperative API.
- The **latest-value pattern** (ref + mirroring effect) keeps listeners, sockets and intervals fresh without re-subscribing — measured: the closure saw `0`, the ref saw `4`.
- Refs are **per component instance**; module variables are shared. Choosing the wrong scope produces "the second component stole my interval id".
- Type refs honestly: `T | null` for DOM nodes and lazily created machinery, `Ref<T>` for props, and no `any`.
- If a ref's value should be visible, it must be **state** — the experiment in section 3 is the definition of the bug.

---

**What's next →** [`05-usecontext.md`](./05-usecontext.md): props flow down, but real screens need the same data in many places — a theme, a locale, the current user, a cart. Context is React's answer, and it comes with its own performance rules: which components re-render when a value changes, why a default value can hide a bug, and how to split a context so that actions do not re-render every consumer.
