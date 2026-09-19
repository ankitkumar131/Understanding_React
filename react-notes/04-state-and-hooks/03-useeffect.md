# 03 — `useEffect`: Synchronising With the World Outside React

> **Part 4 · State and Hooks · File 3 of 10**
> Why this file exists: `useEffect` is the hook that beginners use for everything and experienced developers use for very little. It is also the one that hides the most subtle bugs: stale values inside timers, fetch responses arriving out of order, subscriptions that never close, and effects that re-run forever because a dependency is rebuilt on every render. This file gives you the mental model first (an effect synchronises React with a system *outside* React), then the mechanics, and then runs six experiments in a real browser-like environment so that every claim about order, timing and cleanup is something you have watched happen.

---

## 1. What an effect is for

An effect says: **"after this render has been committed to the DOM, do this work that involves something outside React, and when the inputs change (or the component disappears), undo it."**

"Something outside React" is the part people miss. React's own business ends at producing DOM that matches your data. Everything else — timers, network requests, browser APIs, storage, analytics, subscriptions, focus management — lives outside that boundary, and effects are the documented bridge.

| What the component wants | Which tool | Why |
| --- | --- | --- |
| Show a filtered list | compute during render | React's own job |
| Change the title text | `useEffect` | `document.title` is outside React |
| Save the cart to `localStorage` | `useEffect` | storage is outside React |
| Count down 5 seconds then hide a banner | `useEffect` + timer | timers are outside React |
| Listen for the `/` key | `useEffect` | the document is outside React |
| Fetch a product when the id changes | `useEffect` (Part 7 adds a library) | the network is outside React |
| Track a page view | `useEffect` | analytics is outside React |
| Compute `subtotal` from lines | **not** an effect — derive | it is React's own job |
| Reset a form when the product changes | **not** an effect — `key` | it is React's own job |
| Update state because a prop changed | **not** an effect — usually a design smell | decide during render, or remount |

The last three rows are worth re-reading whenever you feel the urge to reach for `useEffect`.

---

## 2. The timeline: render, commit, paint, then effect

```text
1. RENDER     your component runs; JSX is produced; NO DOM changes yet
2. COMMIT     React writes the minimum set of changes into the DOM
3. PAINT      the browser draws the new pixels (this is when the user sees it)
4. EFFECT     your effect function runs — after the paint, not before
```

Two consequences follow immediately:

- **The user sees the new screen before your effect runs.** So an effect is the wrong place to compute something that must be *in* the first paint (that is `useLayoutEffect`, and you should almost never need it).
- **Effects run *after* every render in which their dependencies changed** — not "once", not "on mount", not "before paint". Every "when does my effect run?" question has the same answer: *whenever React commits a render and the dependency list differs from last time.*

Within one commit, React runs effects **bottom-up**: children before parents. Cleanups run before the next setup of the same effect, and all cleanups for a removed subtree run before that subtree's DOM is detached.

**Verified** in the lab harness (`src/dev/effect-probe.tsx` → `/tmp/part4-effect.txt`):

```text
1. order of effects and cleanups
   after mount      : child effect (first) -> parent effect
   after a re-render: child cleanup (first) -> child effect (second)
   after unmount    : parent cleanup -> child cleanup (second)
```

Read the three lines as three rules:

1. **Child effects run before parent effects** on mount (the child's world must be ready first).
2. **A cleanup runs before the following setup of the same effect** — "cleanup (first)" then "effect (second)" when the label prop changed.
3. **On unmount, cleanups run** (parent first here because teardown is top-down), which is the whole reason a timer or a socket does not outlive its component.

💡 **Multiple effects in one component run top-to-bottom**, in the order you wrote them, exactly like hook calls. That is another reason to keep them in one visible block (file 10).

---

## 3. The signature

```ts
useEffect(setup, dependencies?): void

type EffectCallback = () => void | Destructor; // "Destructor" = () => void
```

Three shapes you will write, all of them valid:

```tsx
// 1. setup only — runs after every render in which the dependencies changed
useEffect(() => {
  document.title = `${itemCount} items · MegaShop`;
});

// 2. setup + cleanup — the normal shape for anything you start
useEffect(() => {
  const timer = window.setTimeout(() => setVisible(false), 2500);
  return () => {
    window.clearTimeout(timer); // cleanup: undo the setup
  };
}, [visible]);

// 3. setup + a cleanup that returns nothing (a block body)
useEffect(() => {
  const onScroll = () => setScrolled(window.scrollY > 8);
  window.addEventListener('scroll', onScroll);
  return () => {
    window.removeEventListener('scroll', onScroll);
  };
}, []);
```

⚠️ **The one TypeScript trap.** `useEffect(() => window.clearTimeout(timer))` is an error:

```text
TS2345: Argument of type '() => number' is not assignable to parameter of type 'EffectCallback'.
  Type '() => number' is not assignable to type 'void | Destructor'.
```

`window.clearTimeout(...)` returns a number, so the arrow returns a number, so it is not a valid destructor. The fix is a block body — `return () => { window.clearTimeout(timer); };` — and it is a *good* error: React would have silently ignored that return value. We hit this in the lab and fixed two effects exactly this way.

---

## 4. The dependency array, measured

This is the table to internalise. The harness rendered one component three times and counted how many times each effect ran.

**Verified output:**

```text
2. how often does each effect run over 3 renders (1 mount + 2 updates)?
   no array           : 3 runs
   []                 : 1 run
   [value]            : 2 runs   (value changed once)
   [{ page: 1 }]      : 3 runs   (a fresh object !== last render's object)
```

| Form | Runs | Meaning | Use for |
| --- | --- | --- | --- |
| `useEffect(fn)` (no array) | after **every** render | "no dependency information at all" | almost nothing — measuring, debugging, or an effect that must mirror every render |
| `useEffect(fn, [])` | **once**, after mount (plus cleanup on unmount) | "this setup is independent of props/state" | global listeners, one-time subscriptions, "on mount" work |
| `useEffect(fn, [a, b])` | after mount, then whenever `a` or `b` changes (per `Object.is`) | "re-run when these inputs change" | fetching by id, timers that depend on a value, storage keys |
| `useEffect(fn, [obj])` where `obj` is rebuilt each render | after **every** render | the dependency is never "the same" | ❌ a bug — memoise the object or depend on its fields |

The last row is the most common performance bug in React code. `Object.is` compares references, so `[{ page: 1 }]` is a *new* array containing a *new* object on every render:

```tsx
// ❌ re-runs after every render
const options = { page: 1 };
useEffect(() => { load(options); }, [options]);

// ✅ depends on the primitives that actually matter
useEffect(() => { load({ page, pageSize }); }, [page, pageSize]);

// ✅ or memoise the object (file 07) when it is genuinely a unit
const options = useMemo(() => ({ page, pageSize }), [page, pageSize]);
useEffect(() => { load(options); }, [options]);
```

The linter describes both failure modes in plain language — **verified** with oxlint on the harness:

```text
react-hooks(exhaustive-deps): React hook useEffect depends on `options`, which changes every render
react-hooks(exhaustive-deps): React Hook useEffect has a missing dependency: 'count'
```

---

## 5. Cleanup: the part that makes effects safe

An effect's setup is allowed to return a function. That function is the **cleanup**, and React calls it:

- **before the effect runs again** (when dependencies changed), and
- **when the component unmounts** (or the branch containing it is removed).

```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/products/${id}`, { signal: controller.signal });
  return () => controller.abort();      // ← runs before the next run, and on unmount
}, [id]);
```

Why cleanup is not optional, in four sentences:

1. **Leaked work keeps running.** A timer that outlives its component will call a setter for something that no longer exists (harmless in React 18+, but wasteful) or, worse, hold a closure over stale data forever.
2. **Listeners accumulate.** `addEventListener` without `removeEventListener` adds one more listener per re-render; the handler then runs N times per event, and each run closes over that render's values.
3. **Connections stay open.** Sockets, polling loops and `IntersectionObserver`s consume memory and battery.
4. **StrictMode will show you.** In development React mounts, cleans up and re-mounts every effect, precisely so that a missing cleanup is visible immediately instead of becoming a production leak.

**Verified** — two nearly identical components with a 60 ms timer; the harness unmounted both after 10 ms and then waited 100 ms:

```text
4. cleanup on unmount
   <Toast> (has cleanup)     : onDismiss called 0x   (the timer was cancelled)
   same effect, no cleanup   : onDismiss called 1x AFTER the component was gone
```

The `<Toast>` component (real lab code) is worth reading as the canonical shape:

```tsx
export function Toast({ message, onDismiss, durationMs = 2500 }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    // Cleanup cancels the timer: on unmount, and before the effect re-runs when
    // any dependency (including the message) changes.
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
```

**Rules for cleanup:**

| Rule | Reason |
| --- | --- |
| Clean up **everything you started** in the setup | the cleanup should mirror the setup |
| Return a function that returns nothing | `TS2345` otherwise (section 3) |
| Use the same references: `addEventListener(name, handler)` ↔ `removeEventListener(name, handler)` | a new arrow function cannot remove the old listener |
| Do not set state in cleanup "to reset things" | unmounting already discards state |
| It is fine to return early *inside* the effect (`if (!isDirty) return;`) | the hook itself still ran — hook order is safe (file 10) |

---

## 6. The memory problem: stale closures

An effect "remembers" the values from the render in which it was created. If the effect has `[]` dependencies, it remembers the **first** render's values — forever.

**Verified** — an effect with `[]` dependencies creating two intervals: one that reads `count` directly, and one that reads a ref kept up to date by another effect. Meanwhile the button incremented `count` three times.

```text
3. an effect that captured `count` from the first render, vs a ref
   button text after 3 clicks : count=3
   interval #1: stale closure sees count=0
   interval #2: ref sees count=3
```

The screen says `3`. One interval still says `0` — permanently. This is *the* bug that makes people say "React state is weird"; it is not weird, it is JavaScript closures plus a deliberate snapshot model (file 01, section 5).

**Three ways to fix it, in order of preference:**

```tsx
// 1. List the value as a dependency — the effect re-subscribes with fresh values.
useEffect(() => {
  const id = setInterval(() => console.log(count), 1000);
  return () => clearInterval(id);
}, [count]); // ✅ always fresh … but it restarts the interval on every change

// 2. Use the updater form when you only need the newest value to compute one.
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000); // ✅ never stale, never restarts
  return () => clearInterval(id);
}, []);

// 3. Keep the newest value in a ref when you need it WITHOUT re-subscribing
const latest = useRef(count);
useEffect(() => {
  latest.current = count;
}, [count]);

useEffect(() => {
  const onKey = () => console.log(latest.current); // ✅ fresh value, listener attached once
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, []);
```

Pattern 3 is exactly how the lab's `useKeyDown` works (file 09): the document listener is attached once, and the handler still sees the newest props and state.

💡 **React 19.2 adds `useEffectEvent` for a related job** — reading the latest values inside an effect without listing them as dependencies. The installed React in this lab is 19.3.0 and does export it (`'useEffectEvent' in React === true`), but it is not needed to write correct code today: `useRef` (pattern 3) does the same job, and the updater form handles most of the rest. Know the name; keep the ref pattern in your tool belt.

---

## 7. StrictMode runs effects twice on purpose

In development, `<StrictMode>` mounts, runs your effect, runs its cleanup, then runs the effect again. **Verified:**

```text
6. under <StrictMode> in development, a `[]` effect on mount
   sequence : effect (subscription opened) -> cleanup (subscription closed) -> effect (subscription opened)
   requests : 2   (this is why a dev-mode fetch fires twice)
```

That double invocation is the single most common source of "why does my fetch appear twice in the network tab?" questions. It does not happen in production builds. The correct response is **not** to disable StrictMode; it is to write effects that survive being set up twice:

| Symptom in dev | Design problem | Fix |
| --- | --- | --- |
| Two network requests | the fetch has no cleanup | add an `AbortController` and abort in cleanup (a dev-only duplicate GET is harmless; a duplicate POST is not — so guard writes with an idempotency key or move them into an event) |
| Two subscriptions, events fired twice | missing `removeEventListener` in cleanup | return the removal |
| Two intervals, the counter increases twice as fast | missing `clearInterval` | return the clear |
| A toast that flickers | two timers, one cancelled | cleanup cancels the first, so the visible timer is single — check your dependencies |
| WebSocket connects twice | missing `.close()` | return `() => socket.close()` |

The mental test: **"if my effect ran twice and its cleanup ran in between, would the world be in the same state?"** If yes, the effect is written correctly. That property is also what makes Fast Refresh, Offscreen rendering and future React features safe.

---

## 8. Fetching in an effect: the race condition you must know about

Every application fetches data, and a naive fetch in an effect has a bug that appears only on slow networks: **responses can arrive out of order.**

The harness starts a slow request (`A`, 120 ms), then the user switches to `B` (10 ms). Both promises resolve; whichever finishes **last** wins the screen. Three modes were measured:

**Verified output** (`/tmp/part4-effect.txt`):

```text
7. race: slow request A (120ms) started, then fast request B (10ms) [mode: none]
   on screen after 250ms : "Product A"  <- STALE response overwrote the fresh one
7. race: slow request A (120ms) started, then fast request B (10ms) [mode: ignore]
   on screen after 250ms : "Product B"  <- the fresh response survived
7. race: slow request A (120ms) started, then fast request B (10ms) [mode: abort]
   on screen after 250ms : "Product B"  <- the fresh response survived
   abort mode log: request for A was aborted (nothing was set)
```

The user asked for **B**. With no protection, they see **A** — a real bug that appears in development only when someone clicks quickly, and in production whenever the network is slow.

**Mode 1 — no protection (❌):**

```tsx
useEffect(() => {
  fetchProduct(id, delay).then((product) => setResult(product.name));
}, [id]);
```

**Mode 2 — the `ignore` flag (✅, no network cost):**

```tsx
useEffect(() => {
  let ignore = false;                    // belongs to THIS effect run
  fetchProduct(id, delay).then((product) => {
    if (!ignore) setResult(product.name); // a previous run set ignore = true
  });
  return () => {
    ignore = true;                       // runs before the next run, and on unmount
  };
}, [id]);
```

**Mode 3 — `AbortController` (✅, also cancels the request):**

```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/products/${id}`, { signal: controller.signal })
    .then((response) => response.json() as Promise<Product>)
    .then((product) => setProduct(product))
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return; // expected
      setError(error instanceof Error ? error.message : 'Unknown error');
    });
  return () => controller.abort();
}, [id]);
```

Use **both**: `abort()` stops the request (saves bandwidth and server work), and the `AbortError` branch keeps the console clean. In real applications you will use a data-fetching library (Part 7) that implements this pattern — plus caching, deduplication and retries — so that you never write it by hand. But you must understand the pattern, because you will debug it.

### The rest of the honest fetching story

A fetch in an effect gives you: no cache, no deduplication, no retries, no revalidation, no sharing between components, and a waterfall every time a component mounts. For a small internal tool that is fine. For an application, that is Part 7's job (`TanStack Query` etc.) — and this is exactly why React's own documentation labels "fetching data in an effect" as a *fallback*: it works, it is correct, and it is rarely the final answer.

⚠️ **Never make an effect `async`.**

```tsx
// ❌ TypeScript error: an async function returns a Promise, not a cleanup function
useEffect(async () => {
  const data = await load();
  setData(data);
}, []);

// ✅ an inner async function, called from a synchronous effect
useEffect(() => {
  let ignore = false;
  const run = async () => {
    const data = await load();
    if (!ignore) setData(data);
  };
  void run();
  return () => {
    ignore = true;
  };
}, []);
```

---

## 9. Subscriptions and other "outside React" systems

The pattern is always the same three lines: **subscribe, return unsubscribe, list the dependencies.**

```tsx
// a DOM event on window
useEffect(() => {
  const onResize = () => setWidth(window.innerWidth);
  onResize(); // run once immediately so the first paint is correct
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, []);

// a browser API with a cleanup method
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
  if (ref.current !== null) observer.observe(ref.current);
  return () => observer.disconnect();
}, []);
```

**Verified with real code**: the lab's `useKeyDown` binds a `keydown` listener on `document` once (empty dependency list) and still sees fresh props and state, thanks to the ref pattern from section 6. The catalogue app proves it end-to-end — pressing `/` anywhere on the page focuses the search box:

```text
8. pressed the "/" key on the page
   activeElement : product-search (INPUT)
```

If the state you are subscribing to lives *outside* React entirely (a browser API, a third-party store, a module-level event bus), the more precise tool is `useSyncExternalStore`, which handles tearing and server rendering for you. It is covered in Part 10; the `addEventListener` pattern above is what you need today.

---

## 10. Timers: the case where stable callbacks matter

Timers are the most common effect in UI code, and they interact with the dependency array in a way that is easy to get wrong in *both* directions.

The lab has a real example — `useDebouncedValue` uses a timer that is restarted on every keystroke, and that is exactly what makes it a debounce:

```ts
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer); // cancel the pending update
  }, [value, delayMs]);

  return debounced;
}
```

Typing `a`, `ab`, `abc` within 60 ms each with a 120 ms delay — **verified**:

```text
13. useDebouncedValue(value, 120) while typing "a", "ab", "abc" in 60ms
   debounced value right after the last keystroke : ""
   debounced value 200ms later                    : "abc"
```

(The hook is dissected in file 09. The important part is visible in those two lines: right after the last keystroke the debounced value was still empty — the pending timer had not fired — and 200 ms later it was `"abc"`, the value of the *last* keystroke. Every keystroke cancelled the previous timer.)

The mirror image is when a **timer must not restart**. `Toast` starts a 2.5 s timer on mount; if any dependency of its effect changes identity on every render, the effect re-runs and the timer restarts — so a toast that should disappear after 2.5 seconds can stay on screen as long as the parent keeps re-rendering.

**Verified** — a parent that re-renders once at ~65 ms, with `durationMs = 100`:

```text
5. durationMs=100, parent re-rendered once at t=65ms, onDismiss is STABLE (useCallback)
   at t=130ms (past the original deadline)  : toast on screen? false
   at t=260ms (past a restarted deadline)   : toast on screen? false
5. durationMs=100, parent re-rendered once at t=65ms, onDismiss is a NEW arrow every render
   at t=130ms (past the original deadline)  : toast on screen? true
   at t=260ms (past a restarted deadline)   : toast on screen? false
```

With a stable callback, the toast was gone at 130 ms — the timer ran its course exactly as designed. With a fresh arrow function on every render, the toast was **still on screen at 130 ms**, because the re-render at 65 ms cancelled the original timer and started a new one. This is the concrete, measurable reason `useCallback` exists (file 08), and the reason the lab's `useCart` returns *stable* action creators.

---

## 11. When you do **not** need an effect

Most effects that beginners write should not exist. React's own documentation calls this list "you might not need an effect", and the lab's linter enforces part of it. **Verified** message from oxlint on a deliberate violation:

```text
react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders
  help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
```

| You want to… | Do **not** use an effect | Do this instead |
| --- | --- | --- |
| Compute a total / filtered list / count | an effect setting state | compute during render |
| React to a prop change by changing state | an effect that copies props to state | use the prop, or remount with `key` (file 02, section 11) |
| React to a user action (click, submit, change) | an effect watching a state flag | do the work **in the event handler** — that is where you already are |
| Reset a form when the selected item changes | an effect that resets fields | `<Form key={item.id} />` |
| Notify the parent that something changed | an effect calling a prop callback | call the callback in the event that caused the change |
| Do something "only once" at start-up | `useEffect(..., [])` in every component | do it at module scope, in `main.tsx`, or in a small provider |
| Adjust state based on previous state | an effect + state | the updater form, or a reducer (file 06) |
| Cache an expensive computation | an effect storing it in state | `useMemo` (file 07) |

Three real examples from the lab, all of which are good effects because the outside world is involved:

```tsx
// 1. document.title — the tab bar is outside React
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous; // restore on unmount / before the next title
    };
  }, [title]);
}

// 2. localStorage — storage is outside React, and this one is a SIDE EFFECT worth persisting
useEffect(() => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort: private mode and quotas can block it
  }
}, [key, value]);

// 3. a timer — time itself is outside React
useEffect(() => {
  const timer = window.setTimeout(() => setDebounced(value), delayMs);
  return () => window.clearTimeout(timer);
}, [value, delayMs]);
```

**Verified** end-to-end — a `useDocumentTitle` probe (file 09) produced:

```text
15. useDocumentTitle
   before mount      : ""
   while mounted     : "(2) MegaShop"
   after a change    : "(3) MegaShop"
   after unmount     : ""   (the cleanup restored the old title)
```

### The "reset state when a prop changes" trap, once more

This is the pattern that shows up in every second codebase, and it is worth seeing why the fix is not an effect:

```tsx
// ❌ an extra render, and it discards whatever the user typed
function Profile({ userId }: { userId: string }) {
  const [comment, setComment] = useState('');
  useEffect(() => setComment(''), [userId]); // "reset on user change"
  return <textarea value={comment} onChange={(e) => setComment(e.currentTarget.value)} />;
}

// ✅ remount the component when the identity changes — no effect, no extra render
function Profile({ userId }: { userId: string }) {
  return <CommentBox key={userId} />;     // a new key = a new component instance = fresh state
}
```

---

## 12. Choosing dependencies honestly

The dependency list is not a suggestion to React about when to run; it is a **declaration of what the effect reads**. The linter enforces the declaration exactly.

```tsx
// The effect reads `id` and `pageSize`, so both belong in the list.
useEffect(() => {
  load({ id, pageSize });
}, [id, pageSize]);
```

**Decision procedure when the linter complains:**

1. **Is the value a primitive?** Add it. Done.
2. **Is it a function or an object recreated every render?** Fix the *source*: wrap it in `useCallback`/`useMemo` (files 07–08), move it out of the component, or depend on its fields.
3. **Do you need the newest value without re-running the effect?** Use the ref pattern (section 6) or the updater form.
4. **Does the effect now re-run on every change of a value it does not really depend on?** The effect is probably doing two jobs — split it.
5. **Still fighting it?** Then the work probably belongs in an event handler or in render logic, not in an effect at all.

⚠️ **Never "fix" a dependency warning by disabling the rule.** A missing dependency means the effect is reading a value that may be stale; the warning is the bug report, not the bug.

---

## 13. Coming from class components: the lifecycle map

If you have seen `componentDidMount` / `componentDidUpdate` / `componentWillUnmount`, this table is your translation layer. (Class components are legacy — Part 1, file 11 — but you will read a lot of them.)

| Class method | Effect equivalent | Note |
| --- | --- | --- |
| `componentDidMount` | `useEffect(fn, [])` | runs after the first commit; also runs twice in dev under StrictMode |
| `componentDidUpdate(prevProps)` | `useEffect(fn, [dep1, dep2])` | you usually do not need `prev` — you have the current values and the comparison is the dependency check |
| `componentWillUnmount` | the cleanup function | runs on unmount *and* before each re-run |
| `shouldComponentUpdate` | `React.memo` / `useMemo` | different tool, same idea (Part 10) |
| one big lifecycle method | **several focused effects** | "one effect per concern" is the modern style, and it makes dependency lists small |

The idiom shift matters: class lifecycles are *time-based* ("now I have just mounted"), effects are *dependency-based* ("whenever these inputs change"). Dependency-based code stays correct when a value changes for a new reason; time-based code has to be revisited each time.

---

## 14. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Missing dependency array | effect runs after every render — often an infinite loop with `setState` inside | `[]` or a real dependency list |
| 2 | Object/array/function in the list, recreated each render | effect runs every render | memoise it, or depend on primitives (file 07–08) |
| 3 | Missing cleanup for a timer/listener | double subscriptions, events firing twice, dev-only counters that grow | return the cancelling/removing function |
| 4 | Reading state in a `[]` effect | the effect sees the first render's value forever (verified: `count=0` vs `count=3`) | updater form, ref, or add the dependency |
| 5 | `useEffect(async () => …)` | TS error, or a Promise where React expects a cleanup | inner async function + `ignore` flag |
| 6 | Fetching without abort/ignore | stale response overwrites the fresh one (verified: `"Product A"`) | `AbortController` + `ignore` flag |
| 7 | Setting state to derive another value | extra render per change, and the linter's `set-state-in-effect` warning | derive during render |
| 8 | Copying props into state "to react to changes" | the component ignores later prop changes | use the prop, or `key` to remount |
| 9 | Disabling `exhaustive-deps` to stop the warnings | stale closures and effects that do not re-run | fix the dependencies or restructure |
| 10 | One giant effect doing five unrelated things | the dependency list becomes a union, so everything re-runs when anything changes | split into focused effects |
| 11 | Using an effect to respond to a click | the response happens one render late, and the "state flag" needs clearing | do it in the handler |
| 12 | `useEffect` for formatting/derivation | needless renders, and the value can be briefly wrong | compute during render |
| 13 | Forgetting that effects run **after** paint | "my measurement is off by one frame" | `useLayoutEffect` (rare) or measure in the effect and store the result |
| 14 | Assuming an effect runs once in development | duplicate requests/subscriptions under StrictMode | idempotent setup + cleanup (section 7) |

---

## 15. Best practices

1. **One effect, one concern.** Small effects have short dependency lists and obvious cleanups.
2. **Always return the cleanup for anything that starts something.** If you cannot write the cleanup, you probably should not start it.
3. **Ask "does this touch the outside world?"** before writing an effect. If not, it is render logic or an event.
4. **Prefer the updater form over reading state** inside effects and timers.
5. **Keep the newest value in a ref** when you need it without re-subscribing (listeners, sockets, observers).
6. **Abort or ignore async work**; assume the user will click faster than the network.
7. **Make setup idempotent** so StrictMode's double invocation and Fast Refresh are non-events.
8. **Name effects by what they synchronise**: "keep `document.title` in sync", "subscribe to window resize". A vague effect is usually two effects.
9. **Never ignore `exhaustive-deps`.** Treat every warning as a design question you have to answer in code.
10. **Reach for a library** for server state (caching, retries, deduplication) rather than growing a hand-rolled fetch layer (Part 7).

---

## 16. Real-world example: the four effects that run MegaShop

The catalogue app in the lab has exactly four effects — and three of them live inside custom hooks:

| Effect | Where | Depends on | Cleanup | Why it is legitimate |
| --- | --- | --- | --- | --- |
| Keep `document.title` in sync with the cart count | `useDocumentTitle` (file 09) | `title` | restores the previous title | `document.title` is outside React |
| Auto-dismiss the "added to cart" toast | `Toast.tsx` (lab component) | `message`, `durationMs`, `onDismiss` | clears the timer | timers are outside React |
| Attach a `/` shortcut that focuses the search box | `useKeyDown` (file 09) | `key`, `ignoreInInputs` | removes the listener | the DOM document is outside React |
| Persist the chosen category to `localStorage` | `useLocalStorageState` (file 09) | `key`, `value` | none needed | storage is outside React; the write is the synchronisation |

And the things the app deliberately does **not** do with effects:

- Filtering the product list — computed during render (verified trace: `8 of 8 → "ssd" 2 of 8 → + Audio 0 of 8 → All 2 of 8 → Clear 8 of 8`).
- Recomputing category counts — `useMemo` (file 07).
- Reading the stored category at start-up — a lazy `useState` initialiser (file 02, section 7), because it is a *read once* operation, not a synchronisation.
- Focusing the search input after the shortcut fires — done inside the event handler (`searchRef.current?.focus()`), not in an effect watching a flag.

Four effects, four external systems. That ratio is what well-written React looks like.

---

## 17. Practice

### Beginner — a live clock with a proper cleanup

**File: `src/practice/Clock.tsx`**

Render the current time, updating once per second, in `HH:MM:SS` format (use `Intl.DateTimeFormat` with `timeStyle: 'medium'`). Requirements: a `useEffect` with a correct dependency list, a cleanup that clears the interval, and no stale values.

Extra: add a "Pause" button that stops the clock, and explain in a comment why the effect needs the `running` state in its dependency list.

### Intermediate — a `useWindowWidth` hook

**File: `src/practice/useWindowWidth.ts`**

Return the current `window.innerWidth`, keeping it in sync with resizes. Requirements:

- `useEffect` with an empty dependency list (the listener is attached once),
- the initial value read *before* the first paint is wrong unless you also set it once inside the effect — do that, and explain why `useState(window.innerWidth)` at the top would be a problem for server rendering (Part 14),
- cleanup removes the listener (verify by toggling the component off and on: if the width updates twice as fast after a remount, the listener leaked),
- then use it in a component that renders "Narrow" below 640 px and "Wide" otherwise.

### Challenge — a "search as you type" pipeline with no stale results

**File: `src/practice/useProductSearch.ts`** and its consumer `src/practice/SearchBox.tsx`.

Requirements:

- `query` state; the request is sent for the **debounced** query (`useDebouncedValue`, file 09) so typing does not fire one request per keystroke.
- A fake API in the same file: `searchProducts(query: string, signal: AbortSignal): Promise<Product[]>` that resolves after `150 + query.length * 120` ms (simulating variable latency) unless aborted.
- States: `{ status: 'idle' | 'loading' | 'error' | 'success', data?, message? }` — a discriminated union, not three booleans.
- **No stale results:** switch the query from `"key"` (slow) to `"mouse"` (fast) and prove that the final screen shows the `"mouse"` results. Use both an `AbortController` and an `ignore` flag.
- The component renders: idle → "Type to search"; loading → "Searching…"; error → the message + a Retry button that re-runs the same query; success → the product names, or "No matches" when the array is empty.
- Every hook call unconditional; `npx tsc -b` and `npm run lint` both clean.

Then answer: where exactly in the code does the stale response get prevented, and what would happen if you removed only the `ignore` flag but kept `abort()`?

---

## 18. Solutions

### Beginner

```tsx
import { useEffect, useState } from 'react';

const timeFormat = new Intl.DateTimeFormat('en-IN', { timeStyle: 'medium' });

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return; // ← an early return INSIDE the effect is fine
    // Tick immediately so the display does not lag by a second after resuming.
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [running]); // `running` is read here, so it belongs in the list

  return (
    <p>
      <time dateTime={now.toISOString()}>{timeFormat.format(now)}</time>
      <button type="button" onClick={() => setRunning((r) => !r)}>
        {running ? 'Pause' : 'Resume'}
      </button>
    </p>
  );
}
```

Why `running` is a dependency: the effect *reads* it to decide whether to start a timer. If you omitted it, pausing would flip the button label but the old interval would keep running (the effect would never re-run to clear it) — a perfect example of why the dependency list is a declaration, not a hint.

### Intermediate

```ts
import { useEffect, useState } from 'react';

export function useWindowWidth(): number {
  // A safe default for environments without a window (server rendering, tests).
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []); // the listener is attached exactly once

  return width;
}
```

Notes on the decisions: the lazy initialiser keeps the *first* render correct on the client without an effect, and gives the server a deterministic `0`. The effect attaches one listener for the component's whole life; the cleanup is what makes the hook safe to mount and unmount repeatedly. If you forgot the cleanup, each remount would add another listener and the component would re-render once per listener per resize event — the classic leak, and easy to feel once you have two mounts on screen.

### Challenge

**File: `src/practice/useProductSearch.ts`**

```ts
import { useEffect, useState } from 'react';
import type { Product } from '../data/products';
import { products } from '../data/products';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: readonly Product[] };

/** A fake API whose latency grows with the query length, so races are easy to create. */
export function searchProducts(query: string, signal: AbortSignal): Promise<Product[]> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => resolve(products.filter((product) => product.name.toLowerCase().includes(query.toLowerCase()))),
      150 + query.length * 120,
    );
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}

export function useProductSearch(query: string) {
  const debounced = useDebouncedValue(query, 300);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (debounced.trim() === '') {
      setState({ status: 'idle' });
      return; // an early return inside the effect — the hook itself already ran
    }

    const controller = new AbortController();
    let ignore = false;
    setState({ status: 'loading' });

    searchProducts(debounced, controller.signal)
      .then((data) => {
        if (!ignore) setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!ignore) {
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

    return () => {
      ignore = true;          // stop an in-flight response from touching state
      controller.abort();     // and cancel the request itself
    };
  }, [debounced, attempt]);

  return {
    state,
    retry: () => setAttempt((n) => n + 1),
  };
}
```

**File: `src/practice/SearchBox.tsx`**

```tsx
import { useState } from 'react';
import { useProductSearch } from './useProductSearch';

export function SearchBox() {
  const [query, setQuery] = useState('');
  const { state, retry } = useProductSearch(query);

  return (
    <section>
      <label htmlFor="search-box">Search products</label>
      <input id="search-box" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />

      {state.status === 'idle' ? <p>Type to search</p> : null}
      {state.status === 'loading' ? <p role="status">Searching…</p> : null}
      {state.status === 'error' ? (
        <div role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}
      {state.status === 'success' ? (
        state.data.length === 0 ? (
          <p>No matches</p>
        ) : (
          <ul>
            {state.data.map((product) => (
              <li key={product.id}>{product.name}</li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
```

Answer to the closing question: the stale response is prevented by the **cleanup**, which sets `ignore = true` before the next request starts. The `ignore` flag is what protects React state; `abort()` is a network optimisation (and it stops the server work). If you kept only `abort()`, the *fetch* would be cancelled but the promise chain would still resolve if the response had already arrived (or if the abort arrived after the response was parsed), and the late `.then` would still call `setState` with old data — the exact "Product A" bug from section 8. And if you kept only `ignore` without `abort()`, you would be correct but wasteful: every keystroke would still hit the network. Use both.

---

## 19. Summary

- An effect **synchronises React with something outside React**: timers, the network, storage, the DOM's own APIs, third-party libraries.
- The timeline is **render → commit → paint → effect**. Effects run after the user could already see the new screen.
- Effects run **bottom-up** (children before parents); cleanups run before the next setup and on unmount.
- The dependency array is a **declaration of what the effect reads**: no array = every render; `[]` = once; `[a, b]` = when those change. Objects/arrays/functions recreated each render make an effect run every render.
- **Cleanup mirrors setup.** Anything you start (timer, listener, socket, request) must be stopped, removed, closed or aborted.
- Effects capture the values of the render in which they were created — **stale closures** are the consequence. Fix with dependencies, the updater form, or a "latest value" ref.
- **StrictMode runs every effect twice** in development (mount → cleanup → mount). Write setups that survive it.
- Naive fetching **races**: a slow earlier response can overwrite a fast later one. Use `AbortController` *and* an `ignore` flag (or a data library, Part 7).
- Most effects that beginners write are unnecessary. Derive during render, respond in event handlers, reset with `key`, memoise with `useMemo`, fetch with a library.
- Treat `exhaustive-deps` warnings as bug reports, and never disable them to move on.

---

**What's next →** [`04-useref.md`](./04-useref.md): the escape hatch. `useRef` holds a value that survives renders **without** causing one — the precise tool for DOM nodes, timer ids, `AbortController`s and "latest value" holders. We will prove that changing a ref does not re-render the screen, watch a stale listener read `0` from state but `4` from a ref, and see how React 19 turned `ref` into an ordinary prop so that `forwardRef` is no longer needed.
