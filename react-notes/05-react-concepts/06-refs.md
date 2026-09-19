# 06 — Refs in Depth: Talking to the DOM and to Imperative Children

> **Part 5 · React Concepts · File 6 of 9**
> Why this file exists: React describes *what* the screen should look like, and the DOM does what it wants with focus, selection, scrolling, playback and canvas pixels. A ref is the bridge: a stable box whose contents survive renders **and whose changes do not cause one**. This chapter measures that (`renders=1` while a ref was mutated), shows React 19's new `ref`-as-a-prop rule (with `forwardRef` now marked *deprecated* in the official docs), verifies the ref-callback cleanup change, and shows `useImperativeHandle` exposing a hand-written API rather than a DOM node (`handle === DOM node? false`).

---

## 1. Refs versus state

| | `useState` | `useRef` |
| --- | --- | --- |
| Persists across renders | yes | yes |
| Changing it re-renders | **yes** | **no** |
| Read during render | yes (it is the value) | only for initialisation — never otherwise |
| Written during render | no (except initialisation) | no |
| Lifecycle | tied to the component instance | tied to the component instance |
| Typical use | anything the user sees | DOM nodes, timer ids, "latest value" mirrors, imperative handles |

**Verified** — a click handler that mutated a ref and called `focus()`:

```text
1. a plain DOM ref, before focusing: document.activeElement = BODY · renders=1
2. after calling inputRef.current.focus(): activeElement = dom-field · renders=1 (a ref change does not re-render)
```

The render count did not move (`1`), and the effect on the page was real (focus moved). That is the trade a ref makes: **it can change the world without React knowing.** Powerful, and dangerous in equal measure — the danger being that nothing on screen tells you the value changed.

⚠️ **The rule that keeps refs safe**: *do not read or write `ref.current` during rendering* (React's documentation says the only exception is initialisation). Reads and writes belong in **event handlers** and **effects**. A ref read during render makes the component's output depend on something React cannot track, and the UI will disagree with itself in ways that look random.

---

## 2. What refs are for

| Use case | Example from the lab |
| --- | --- |
| **Focus management** | `focusSearch` focuses the search box when the user presses `/` |
| **Selection / caret** | selecting the text in an OTP box after typing a digit |
| **Scrolling** | scrolling to the first invalid field in a long form |
| **Measurement** | reading `offsetHeight` to decide how many rows fit (Part 10's virtualisation) |
| **Media control** | `video.play()`, `video.currentTime = 0` |
| **Canvas / WebGL** | getting the drawing context once, on mount |
| **Third-party widgets** | handing a DOM node to a chart/editor/map library |
| **Values that must not render** | timer ids, previous values, an "is this the first render?" flag, an abort controller |
| **Imperative APIs for children** | `<SearchBox ref={…}>` exposing `focus()`, `setQuery()`, `clear()` |

And what refs are **not** for:

- storing data the UI depends on (that is state — the UI would not update),
- reading something during render to decide what to render (also state),
- synchronising two components (that is lifting state / deriving — file 02),
- replacing props and callbacks with imperative calls "because it is shorter" (it usually is not, and it couples the two components).

---

## 3. DOM refs, mechanically

```tsx
import { useRef } from 'react';

function SearchShortcut() {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input ref={inputRef} defaultValue="" />
      <button type="button" onClick={() => inputRef.current?.focus()}>Focus the field</button>
    </div>
  );
}
```

The lifecycle of `inputRef.current`, precisely:

| Moment | `current` |
| --- | --- |
| First render | `null` (the DOM node does not exist yet) |
| After React commits the DOM | the `<input>` element |
| Any later render | the same element (unless the element is replaced) |
| After the element is removed / the component unmounts | `null` again |

**Verified** — the ref holds the actual node:

```text
3. the ref holds the real DOM node: inputRef.current === the rendered <input>? true · defaultValue=typed by the user
```

Three consequences of that table:

1. **`useRef<HTMLInputElement>(null)` is the correct type** — the initial value is `null`, and TypeScript's `RefObject<HTMLInputElement | null>` requires the `?.` you see in every example. (In React 19 the `ref` *prop* accepts `Ref<T>` = `RefObject<T | null> | RefCallback<T> | null` — Part 4, file 04 verified the typing.)
2. **You cannot read the node during render.** It genuinely is not there yet.
3. **Effects run after the node exists**, so effects are where "once the node is ready" work goes:

```tsx
useEffect(() => {
  inputRef.current?.focus();          // safe here: the DOM is committed
  return () => {
    // cleanup if you registered anything on the node
  };
}, []);
```

💡 **Use a callback ref when the *arrival* of the node matters more than the node itself.** React calls a ref callback at the same moment it would set `current`:

```tsx
<input ref={(node) => { node?.focus(); }} />
```

This is the idiomatic way to focus an input as soon as it appears — for example when a "new row" form is added to a list — because the callback runs exactly when the element is attached, with no effect and no dependency array.

---

## 4. React 19: `ref` is a normal prop

Before React 19, a function component could not receive a `ref` at all: React treated `ref` specially and stripped it from props. The workaround was `forwardRef`. React 19 removed the special-casing.

```tsx
// React 19: `ref` is just a prop — no wrapper needed.
interface FieldProps {
  label: string;
  ref?: Ref<HTMLInputElement>;        // the type is `Ref<T>`, NOT `RefObject<T>`
}

function Field({ label, ref }: FieldProps) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
}

// The parent uses it exactly like any other ref:
const fieldRef = useRef<HTMLInputElement>(null);
<Field label="Email" ref={fieldRef} />
```

**Verified:**

```text
4. React 19: `ref` passed as a normal prop (no forwardRef): activeElement = prop-ref-field
```

The parent's ref landed on the `<input>` inside `Field`, and focusing it worked — with no `forwardRef` in sight.

### `forwardRef` still works, but it is deprecated

```text
5. the same with forwardRef (still supported): activeElement = forwarded-field
```

The official `forwardRef` reference page now opens with a deprecation notice:

> **Deprecated** — In React 19, `forwardRef` is no longer necessary. Pass `ref` as a prop instead. `forwardRef` will be deprecated in a future release.

Practical guidance for the code you will meet in the wild:

| Situation | What to do |
| --- | --- |
| New code on React 19+ | pass `ref` as a prop; no wrapper |
| Existing code using `forwardRef` | keep it until you upgrade; it still works and is not an error |
| A library that must support React 18 **and** 19 | `forwardRef` is the compatible choice (it works on both) |
| `useImperativeHandle` | still the documented way to expose a custom API; it needs a `ref` to attach to, which under React 19 can be a prop |
| TypeScript | use `Ref<T>` for props that accept a ref, `RefObject<T | null>` for the object you create |

⚠️ **Two refs, one node.** If a component needs a ref *internally* **and** must forward one from its parent, a single `ref={…}` cannot hold both. Two clean solutions:

```tsx
// Option A — a callback ref that hands the node to both.
function Field({ ref: forwarded }: { ref?: Ref<HTMLInputElement> }) {
  const localRef = useRef<HTMLInputElement>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    localRef.current = node;                       // keep our own handle
    if (typeof forwarded === 'function') forwarded(node);
    else if (forwarded != null) forwarded.current = node;   // RefObject
  };

  return <input ref={setRefs} />;
}

// Option B — expose only what is needed via useImperativeHandle (section 6).
```

---

## 5. Ref callbacks, and the React 19 cleanup

A ref can be a **function** instead of an object. React calls it with the node when it attaches, and (before React 19) with `null` when it detaches.

```tsx
<input
  ref={(node) => {
    if (node === null) return;      // detach (pre-19 style)
    // …use the node
  }}
/>
```

React 19 adds a better option: the callback may **return a cleanup function**, which React calls on detach — exactly like an effect's cleanup.

**Verified:**

```text
9. ref callback on mount: attach
10. ref callback on unmount: attach, cleanup
11. what React passed/returned: React called "attach", then the cleanup returned by the callback — no `null` call (React 19)
```

Two consequences:

1. **Cleanup symmetry is now expressible**: if you subscribed to something on the node (an observer, a listener), you can unsubscribe in the returned function instead of guessing in a `null` branch.
2. **Existing callbacks that return a value are a problem.** An arrow function written as `ref={(node) => doSomething(node)}` **returns** `doSomething(node)`'s value — if that happens to be a function, React 19 will treat it as a cleanup and call it at the wrong time. React warns about this; the fix is a braced body:

   ```tsx
   // ❌ returns whatever `register(node)` returns — React 19 may treat it as a cleanup
   <input ref={(node) => register(node)} />

   // ✅ a braced body returns undefined
   <input ref={(node) => { register(node); }} />
   ```

### A `Map` of refs: focusing one row among many

```tsx
function ListOfRefs() {
  const rowRefs = useRef(new Map<string, HTMLInputElement>());
  const ids = ['p1', 'p2', 'p3'];

  return (
    <div>
      {ids.map((id) => (
        <input
          key={id}
          ref={(node) => {
            if (node) rowRefs.current.set(id, node);
            else rowRefs.current.delete(id);
          }}
          defaultValue={id}
        />
      ))}
      <button type="button" onClick={() => rowRefs.current.get('p3')?.focus()}>focus row 3</button>
    </div>
  );
}
```

**Verified:**

```text
12. a Map of refs, focusing row 3: activeElement value = p3
```

Why a `Map` and not an array: the ids are stable and the focus target is chosen *by identity*, not by position — so reordering, filtering or inserting rows cannot make you focus the wrong one. And why not one `useRef` holding an array of nodes built during render? Because building it during render is exactly the "read/write refs while rendering" violation of section 1; the callbacks above run at the right time (attach/detach), not during render.

💡 **Ref callbacks and re-renders**: React calls the callback whenever the *function identity* changes, so an inline arrow in JSX means detach (`cleanup`) + attach on **every** render. For a `Map` that is harmless (a delete and a set). For an expensive callback (registering with a library), wrap it in `useCallback` (Part 4, file 08) or use a stable function defined outside the JSX.

---

## 6. `useImperativeHandle`: expose an API, not a DOM node

Sometimes a parent needs to *ask a child to do something* rather than tell it what to be. `useImperativeHandle` lets the child decide exactly what that "something" is.

```tsx
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

export interface SearchBoxHandle {
  focus: () => void;
  setQuery: (next: string) => void;
  clear: () => void;
}

const SearchBox = forwardRef<SearchBoxHandle, { initialQuery?: string }>(function SearchBox({ initialQuery = '' }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      setQuery: (next: string) => setQuery(next),
      clear: () => {
        setQuery('');
        inputRef.current?.focus();
      },
    }),
    [],
  );

  return <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} />;
});
```

**Verified** — the parent drives the child through the handle:

```text
6. useImperativeHandle, initial: value=monitor · handle === DOM node? false (it is our own object)
7. after boxRef.current.setQuery("keyboard"): value=keyboard (the parent set React state through the handle)
8. after boxRef.current.clear(): value= · activeElement=imperative-field
```

Note the two facts those lines establish:

- **`handle === DOM node? false`** — the parent did not receive the `<input>`; it received the object the child chose to publish. The child's internals (which element, how many, whether they change) are private.
- **`setQuery("keyboard")` updated React state** (`value=keyboard`) and re-rendered — an imperative handle is not a bypass around React, it is a *typed doorway* into the child's own logic.

Four rules that keep imperative handles honest:

1. **Expose verbs, not state**: `focus()`, `clear()`, `play()`, `reset()` — not `getValue()` for a value a prop could carry.
2. **Keep the handle small.** Every method is a public API you must maintain.
3. **Prefer props when a prop would do.** The docs are explicit that exposing a ref to a component's internals *"makes it harder to change your component's internals later"*, and recommends it for reusable low-level components (buttons, inputs, players), not application-level ones.
4. **Never use it to read state upward.** A parent that asks a child "what is your value?" is a parent that should own the value (file 02).

### Where imperative handles earn their place

| Component | Handle |
| --- | --- |
| a text field | `focus()`, `select()`, `scrollIntoView()` |
| a video/audio player | `play()`, `pause()`, `seek(seconds)`, `setVolume(level)` |
| a canvas/chart | `exportPng()`, `reset()`, `fitToScreen()` |
| a modal | `close()`, `focusFirst()` |
| a rich-text editor wrapper | whatever the third-party library needs |
| a form section in a wizard | `validate(): boolean` (so a parent can gate a "Next" button) |

Outside those cases, props and callbacks almost always express the intent better.

---

## 7. Refs, effects and cleanup

Refs and effects are partners: the effect is when the node exists, and the ref is how you reach it.

```tsx
// Focusing on mount, and restoring focus on unmount, with a ref.
useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  inputRef.current?.focus();
  return () => {
    previous?.focus();
  };
}, []);
```

Rules of thumb:

- **Attach in effects, detach in their cleanup** (listeners, observers, media).
- **StrictMode runs mount → cleanup → mount** in development (Part 4, file 03), so anything you attach must tolerate being attached twice and cleaned up once. Effects with symmetric cleanup survive it; effects with a one-way side effect do not.
- **Never touch `document`/`localStorage`/`window` during render or in module scope** in a way that assumes a browser: the lab's `useLocalStorageState` guards with `typeof localStorage === 'undefined'` (Part 4, file 09) for exactly this reason.
- **Refs are `null` on the server**: during server rendering there is no DOM, so no ref is ever populated. Code that reads refs must live in effects or handlers, which run only in the browser.

---

## 8. Anti-patterns and their fixes

| Anti-pattern | Why it hurts | Fix |
| --- | --- | --- |
| keeping UI data in a ref | the UI never updates (no re-render) | `useState` |
| reading `ref.current` during render | output depends on untracked data; StrictMode/SSR break it | read in effects/handlers, or use state |
| syncing two components with refs | invisible coupling, missed updates | lift the state (file 02) |
| an imperative API on an application-level component (`<ProductPage ref>` with `refresh()`) | brittle coupling to internals | pass props, or lift the data (file 01) |
| storing a "latest props" ref and reading it during render | stale UI | read props directly during render; keep the ref for *callbacks* (Part 4, file 09's `useKeyDown`) |
| forgetting to revoke/clean up what a ref enabled | leaks: object URLs, observers, listeners | cleanup in the effect (or the ref callback's returned function) |
| using refs instead of `FormData` for a whole form | many refs to keep in sync with field names | one `FormData` read (file 04) |
| an inline arrow ref callback on a `memo`-sensitive child | detach/attach every render | stable callback (`useCallback`) or a module-level function |

---

## 9. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `useRef<string>('')` for a value the UI shows | the screen never changes | `useState` |
| 2 | reading `ref.current` during render | `null` on first render, or a UI that disagrees with itself | read in effects/handlers |
| 3 | forgetting `?.` on `ref.current` | "cannot read properties of null" on the first render | `ref.current?.focus()` |
| 4 | typing the ref wrongly (`useRef<HTMLInputElement>()`) | `MutableRefObject<HTMLInputElement | undefined>` surprises | `useRef<HTMLInputElement>(null)` |
| 5 | `ref` on a function component without accepting it (pre-19 style) | warning: "Function components cannot be given refs" | accept `ref` as a prop (React 19) or use `forwardRef` |
| 6 | a ref callback that returns a value | React 19 may call the returned function as a cleanup | use a braced body |
| 7 | using one ref for many nodes | only the last node is reachable | a `Map`/array of refs with ref callbacks |
| 8 | an inline ref callback that registers with a library | re-registration every render | `useCallback` |
| 9 | `useImperativeHandle` exposing state getters | parents read stale values | expose verbs; keep values in props/state |
| 10 | assuming the DOM is available during render | SSR crashes ("document is not defined") | effects/handlers only, plus guards |
| 11 | ignoring cleanup for observers/listeners attached via a ref | leaks, duplicated handlers after StrictMode remount | symmetric cleanup |
| 12 | reaching for a ref when a prop would do | a component whose internals cannot change | props and callbacks first |

---

## 10. Best practices

1. **Default to props and state**; reach for a ref when the target is a *DOM behaviour* (focus, scroll, measure, play) or a *mutable non-rendering value*.
2. **Type refs precisely** (`useRef<HTMLInputElement>(null)`) and use `Ref<T>` for ref-accepting props.
3. **Keep ref reads in handlers and effects**, never in render.
4. **Prefer callback refs when the node's arrival is the event** (`ref={(node) => { node?.focus(); }}`).
5. **Use a `Map` for lists** and key it by identity, not index.
6. **Use React 19's cleanup-returning ref callbacks** for subscriptions, and braced bodies for everything else.
7. **Expose verbs through `useImperativeHandle`**, keep the handle tiny, and document it.
8. **Prefers `ref` as a prop in new code**, keep `forwardRef` where compatibility demands it.
9. **Clean up everything** a ref enabled, and remember StrictMode mounts twice in development.
10. **Say why in a comment**: "ref used to focus on `/`" tells the next reader this is deliberate and not a missed state.

---

## 11. Real-world example: refs in the lab

| Ref | Purpose | Why not state |
| --- | --- | --- |
| `searchRef` in `Shop` | focus the search box (the `/` shortcut, and after clearing) | focus is a DOM action; a re-render cannot perform it |
| `focusSearch` (`useCallback`) | the stable handler handed to `useKeyDown` | it closes over a ref, so its identity never needs to change (file 08 of Part 4) |
| `inputRef` prop on `SearchBar` | lets the parent own "focus the search box" while the component owns its markup | keeps the component reusable — the ref is a plain prop, exactly as React 19 supports |
| `handlerRef` inside `useKeyDown` | always calls the newest handler without re-attaching the listener | the current callback belongs in a ref; the *config* (key, options) drives the effect |
| `formRef` in `ReviewForm` | focus the first invalid field after a failed submit | a DOM query scoped to the form; no state change is wanted |
| `bodyRef` in `ReviewForm` | read the uncontrolled textarea's value at submit | the value must not re-render the form per keystroke (file 04) |
| array of refs (`boxes`) in `OtpInput` | move focus between six boxes | focus is DOM state; the *digits* are React state |

Read those seven rows as a checklist: each ref is attached to a **DOM behaviour** or a **value that must not render**, and in every case the component's *data* still lives in props or state. That is what "refs are an escape hatch" means in practice — they never become the source of truth, they only reach the parts of the browser React does not model.

---

## 12. Practice

### Beginner — focus, on purpose

1. Build a `SearchBox` that focuses itself **on mount** (when it appears) and when the user presses `/`. Use one ref and one handler.
2. Add a "clear" button that empties the field **and** keeps focus in it.
3. Add a `ref` prop so the *parent* can also focus the box, using React 19's `ref`-as-a-prop style.
4. Then explain: why can the focus calls not live in the component body (during render)?

### Intermediate — a media player handle

**File: `src/practice/AudioPlayer.tsx`** — wrap a `<audio>` element and expose an imperative API:

```ts
export interface AudioPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (level: number) => void;   // 0–1
}
```

Requirements: forward the handle from a parent; a parent component with Play/Pause/Restart buttons; the `<audio>` element's `src` comes from a prop; `play()` rejects if the browser blocks autoplay (explain how you surfaced that); the element's `onTimeUpdate` reports the current time **without** re-rendering the player on every event (hint: use a ref plus a throttled state update, and say when each is appropriate).

### Challenge — a "focus the invalid field" hook and a measured layout

1. **`src/practice/useFocusFirstInvalid.ts`** — a hook that takes the form's ref and returns `focusFirstInvalid(): boolean`, which queries `[aria-invalid="true"]` inside that form (in document order), focuses the first match, and reports whether it found one. Use it in the verified `ReviewForm`.
2. **`src/practice/SplitPane.tsx`** — a two-pane layout whose divider can be dragged: measure the container with a ref and a `ResizeObserver`, store the *ratio* in state (so it survives a resize) and the *pixel* measurements in a ref (so dragging at 60 fps does not re-render on every pointer move). Explain which of the two values must be state and why.
3. Add a `useImperativeHandle` to the split pane exposing `resetSplit()` and `focusDivider()`.

---

## 13. Solutions

### Beginner

```tsx
import { useCallback, useEffect, useRef, type Ref } from 'react';

interface SearchBoxProps {
  ref?: Ref<HTMLInputElement>;      // React 19: a plain prop
  onQuery: (query: string) => void;
}

export function SearchBox({ ref: forwarded, onQuery }: SearchBoxProps) {
  const localRef = useRef<HTMLInputElement>(null);

  // Both handles point at the same node: our own and the parent's.
  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded != null) forwarded.current = node;
    },
    [forwarded],
  );

  // Focus when the box APPEARS — a callback ref would do this too; the effect
  // version also runs when the component mounts inside an already-rendered page.
  useEffect(() => {
    localRef.current?.focus();
  }, []);

  // "/" focuses the box without typing a slash into it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (event.key === '/' && !typing) {
        event.preventDefault();
        localRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="search-box">
      <input ref={setRefs} type="search" onChange={(event) => onQuery(event.target.value)} />
      <button
        type="button"
        onClick={() => {
          if (localRef.current === null) return;
          localRef.current.value = '';      // the field is uncontrolled here, so clear the DOM…
          onQuery('');                      // …and tell the parent, which owns the filter
          localRef.current.focus();         // focus stays in the box after clearing
        }}
      >
        Clear
      </button>
    </div>
  );
}
```

**Why the focus calls cannot live in the component body**: during render the node does not exist yet — `ref.current` is `null` on the first render and only set after React commits. Calling `focus()` during render would either do nothing or (worse) mutate the DOM *while React is computing* what the DOM should be, which React is explicitly allowed to do more than once (StrictMode) or to throw away. Focus is a side effect, and side effects belong in effects or handlers — which is also why the shortcut handler lives in an effect with cleanup (it attaches to `document`).

### Intermediate

**File: `src/practice/AudioPlayer.tsx`**

```tsx
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

export interface AudioPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (level: number) => void;
}

export interface AudioPlayerProps {
  src: string;
  title: string;
}

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer({ src, title }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeRef = useRef(0);
  const [displayTime, setDisplayTime] = useState(0);       // throttled: for the label
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      play: async () => {
        const audio = audioRef.current;
        if (audio === null) return;
        try {
          await audio.play();                              // rejects when blocked (e.g. autoplay policy)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Playback was blocked.');
          throw reason;                                    // let the caller decide what to do
        }
      },
      pause: () => audioRef.current?.pause(),
      seek: (seconds) => {
        if (audioRef.current === null) return;
        audioRef.current.currentTime = seconds;
      },
      setVolume: (level) => {
        if (audioRef.current === null) return;
        audioRef.current.volume = Math.min(1, Math.max(0, level));
      },
    }),
    [],
  );

  return (
    <figure className="player">
      <figcaption>{title}</figcaption>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(event) => {
          timeRef.current = event.currentTarget.currentTime;       // the truth, at 4 Hz+
          // Update the LABEL at most ~4 times a second; state per event is wasted renders.
          const whole = Math.floor(timeRef.current);
          setDisplayTime((current) => (current === whole ? current : whole));
        }}
        onError={() => setError('That audio file could not be loaded.')}
      />
      <p className="player__time">{displayTime}s played</p>
      {error !== null && <p role="alert">{error}</p>}
    </figure>
  );
});
```

A parent can then drive it:

```tsx
function PlayerScreen() {
  const playerRef = useRef<AudioPlayerHandle>(null);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div>
      <AudioPlayer ref={playerRef} src="/audio/episode-1.mp3" title="Episode 1" />
      <button type="button" onClick={() => void playerRef.current?.play().catch(() => setProblem('Press play again — the browser blocked the first attempt.'))}>
        Play
      </button>
      <button type="button" onClick={() => playerRef.current?.pause()}>Pause</button>
      <button type="button" onClick={() => playerRef.current?.seek(0)}>Restart</button>
      <input type="range" min={0} max={1} step={0.05} onChange={(event) => playerRef.current?.setVolume(Number(event.target.value))} />
      {problem !== null && <p role="alert">{problem}</p>}
    </div>
  );
}
```

The two points worth taking away: **`play()` returns a promise and can reject** (autoplay policies, or a format the browser refuses), so the handle surfaces the failure instead of swallowing it; and **`onTimeUpdate` uses a ref for the raw value and state only for the displayed whole second** — a state update per event would re-render the player many times a second for a label that changes once a second.

### Challenge

**File: `src/practice/useFocusFirstInvalid.ts`**

```tsx
import type { RefObject } from 'react';

/** Focuses the first control marked `aria-invalid="true"` inside `formRef`. */
export function useFocusFirstInvalid(formRef: RefObject<HTMLFormElement | null>) {
  return function focusFirstInvalid(): boolean {
    const form = formRef.current;
    if (form === null) return false;
    // Document order inside the form: the first match is the first bad field on screen.
    const firstInvalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (firstInvalid === null) return false;
    firstInvalid.focus();
    return true;
  };
}
```

```tsx
// In ReviewForm's submit handler, replacing the `[name="…"]` query:
const focusFirstInvalid = useFocusFirstInvalid(formRef);
…
if (Object.keys(nextErrors).length > 0) {
  focusFirstInvalid();       // returns false when the summary (not a field) should be focused
  return;
}
```

**File: `src/practice/SplitPane.tsx`**

```tsx
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';

export interface SplitPaneHandle {
  resetSplit: () => void;
  focusDivider: () => void;
}

export interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  ref?: Ref<SplitPaneHandle>;
}

export function SplitPane({ left, right, ref }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [ratio, setRatio] = useState(0.5);      // STATE: the user sees it, and it must survive resizes

  useImperativeHandle(ref, () => ({
    resetSplit: () => setRatio(0.5),
    focusDivider: () => dividerRef.current?.focus(),
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const observer = new ResizeObserver(() => {
      // Measurements live in refs — nothing here needs a re-render, and the
      // ratio stays valid because it is relative, not a pixel width.
      const width = container.getBoundingClientRect().width;
      draggingRef.current = false;
      void width;
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const container = containerRef.current;
    if (container === null || !draggingRef.current) return;
    const { left: paneLeft, width } = container.getBoundingClientRect();
    if (width === 0) return;
    const next = Math.min(0.9, Math.max(0.1, (event.clientX - paneLeft) / width));
    setRatio(next);                              // state: the panes' widths derive from it
  }, []);

  useEffect(() => {
    const start = () => { draggingRef.current = true; };
    const stop = () => { draggingRef.current = false; };
    // window listeners during a drag: pointer events are not pointer-capture-aware by default
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stop);
    dividerRef.current?.addEventListener('pointerdown', start);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
      dividerRef.current?.removeEventListener('pointerdown', start);
    };
  }, [onPointerMove]);

  return (
    <div className="split" ref={containerRef} style={{ '--split': `${ratio * 100}%` } as CSSProperties}>
      <div className="split__pane split__pane--left">{left}</div>
      <div
        className="split__divider"
        ref={dividerRef}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setRatio((r) => Math.max(0.1, r - 0.02));
          if (event.key === 'ArrowRight') setRatio((r) => Math.min(0.9, r + 0.02));
        }}
      />
      <div className="split__pane split__pane--right">{right}</div>
    </div>
  );
}
```

**Which value must be state, and why**: the **ratio** is state, because the user sees it — both panes are sized from it, and it must survive a window resize (a pixel width would become wrong the moment the container changes). The **pixel measurements** (the container's width, the pointer's offset) are transient inputs to a calculation: they are read inside the event handler, used, and discarded, so they belong in refs (or plain locals). And `draggingRef` is a ref for the same reason — it changes on every pointerdown/up, nothing renders from it, and putting it in state would re-render the whole pane on every drag start and end.

---

## 14. Summary

- A **ref** is a stable box that survives renders **and does not cause them** — verified: a click that mutated a ref and called `focus()` left `renders=1`.
- Refs are for **DOM behaviour** (focus, scroll, measure, media, canvas), **values that must not render** (timer ids, previous values, flags) and **imperative handles**. Anything the user *sees* is state.
- `ref.current` is `null` during the first render and after detach; read and write it in **effects and handlers**, never during render.
- **React 19 lets `ref` be a normal prop** (verified: focusing through a `ref` prop worked with no wrapper) and the official docs now mark **`forwardRef` as deprecated** — it still works, and is what you use when you must support React 18 as well.
- **Ref callbacks can return a cleanup function** in React 19 (verified: `attach` then `cleanup`, with no `null` call) — and callbacks that return a value by accident will have that value treated as a cleanup, so use braced bodies.
- A **`Map` of refs** (verified: focusing row 3 by id) solves "one of many" without index fragility.
- **`useImperativeHandle` publishes a hand-written API, not a DOM node** (verified: `handle === DOM node? false`), and can drive React state through that API (`setQuery("keyboard")` updated the input). Keep handles small, verb-shaped and well-documented.
- Refs and effects are partners, and **cleanup is mandatory** — listeners, observers, media and object URLs. StrictMode mount/cleanup/mount makes sloppy attachment visible.
- Reach for a ref **when the browser is the right owner of the behaviour**; when in doubt, props and state express intent better and keep components changeable.

---

**What's next →** [`07-composition.md`](./07-composition.md): composition instead of configuration. We will measure the surprise that makes it click — a layout that re-rendered three times while a child passed as `children` rendered **once**, versus the same child built inside the layout and rendered **three** times — then build slots, layout components, compound components (`<Tabs>` sharing state through context), and render props, and see where each beats a growing pile of boolean props.
