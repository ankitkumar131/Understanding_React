# 02 — `useState` in Full

> **Part 4 · State and Hooks · File 2 of 10**
> Why this file exists: file 01 explained *why* state exists. This file explains the tool — the signature, the two return values, batching, functional updates, lazy initialisation, TypeScript typing, and the three bugs that beginners hit on day one. Every claim below is demonstrated by a harness we actually ran, and the printed output is quoted verbatim.

---

## 1. What `useState` is for

`useState` gives a function component a **memory slot** and a way to **ask React to render again** with a new value in that slot.

```tsx
const [value, setValue] = useState(initialValue);
```

That is the whole API surface: one function, two outputs, one argument. Everything in this chapter is a consequence of *how* React stores that value and *when* it applies an update.

---

## 2. Signature and return value

```ts
// Simplified from the real React types
function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];

type Dispatch<A> = (value: A) => void;
type SetStateAction<S> = S | ((prevState: S) => S);
```

Read it in three pieces:

| Piece | Meaning |
| --- | --- |
| `useState<S>(...)` | `S` is the type of the state. TypeScript usually infers it; you supply it when the initial value is not enough (`[]`, `null`). |
| `initialState: S \| (() => S)` | You may pass a **value**, or a **function that returns the value**. The function form is the *lazy initialiser* — section 7. |
| `: [S, Dispatch<SetStateAction<S>>]` | It returns a **tuple**: the current value and the setter. The setter accepts either a new value, **or a function that receives the previous value**. That second option is the *functional update* — section 6. |

**Why a tuple and not an object?** Because you name the parts yourself, every time:

```tsx
const [query, setQuery] = useState('');
const [lines, setLines] = useState<CartLine[]>([]);
const [isOpen, setIsOpen] = useState(false);
```

An object (`{ value, setValue }`) would force a name on you (`state.value`) or make you rename on destructuring anyway. The array's order is fixed by the API — value first, setter second — and it is the single most consistent convention in React.

⚠️ **The order is fixed.** `const [setValue, value] = useState(0)` compiles, runs, and produces chaos (you would be calling a number and rendering a function). There is no error message for this; there is only confusion. Read the line out loud when you write it: "value, then setter".

---

## 3. The counter, line by line

**File: `src/components/Counter.tsx`** (complete, runnable)

```tsx
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <p>
        Clicked <output className="counter__value">{count}</output> times
      </p>
      <button type="button" onClick={() => setCount(count + 1)}>
        Add one
      </button>
      <button type="button" onClick={() => setCount((current) => current + 1)}>
        Add one (updater)
      </button>
      <button type="button" onClick={() => setCount(0)}>
        Reset
      </button>
    </div>
  );
}
```

| Line | What happens |
| --- | --- |
| `import { useState } from 'react';` | Hooks are named exports of `react`, not of `react-dom`. This import must exist in every file that uses a hook. |
| `const [count, setCount] = useState(0);` | On the **first** render, React stores `0` in a slot for this component instance and returns it. On every later render, React **ignores the argument** and returns the stored value. |
| `{count}` | The JSX reads the snapshot of this render. When the value in the slot changes, a new render happens and this expression produces different text. |
| `setCount(count + 1)` | Computes `count + 1` from *this render's* snapshot and requests an update. |
| `setCount((current) => current + 1)` | Hands React a recipe instead of a value: "whatever the current value is when you process this, add one". |
| `setCount(0)` | A brand-new value; no arithmetic, so no snapshot problem. |

**Run it**

```bash
cd vite-lab
npm run dev
```

**Expected result:** click "Add one" three times — the line reads `Clicked 3 times`. Click "Reset" — `0`. The `output` element is there for two reasons: it is the semantically correct element for a computed value, and it gives the harness a stable class to query.

🔍 **Ignoring the initial value is documented behaviour, not an accident.** React identifies a state slot by *call order* within a component (file 10 explains why). It cannot re-read `useState(0)` on later renders without overwriting your changes, so it throws the argument away. This is why "change the initial value in the code" never updates a mounted component.

---

## 4. Batching: two setters, one render

Call two setters inside one event handler:

```tsx
<button
  className="plain"
  onClick={() => {
    setCount(count + 1);
    setCount(count + 1);
  }}
>
  count={count}
</button>
```

<details>
<summary>Before reading on: how many does the counter show after one click, and how many renders happened?</summary>

The counter shows **1**, and there was **one** re-render.

</details>

<details>
<summary>Why not 2?</summary>

Because both calls read the same snapshot. If `count` was `0` in this render, both calls ask for `0 + 1 = 1`. React receives "set to 1" twice, and after de-duplication the slot holds `1`.

</details>

**Verified output** (`src/dev/state-probe.tsx`, quoted from `/tmp/part4-state.txt`):

```text
1. two setCount(count + 1) calls in one click handler
   button text after 1 click : count=1   (0 + 1 twice -> 1, not 2)
   renders                   : 2   (mount + ONE batched re-render)
```

And with the updater form:

```text
2. two setCount(c => c + 1) calls in one click handler
   button text after 1 click : count=2   (the second call sees the first one's result)
   renders                   : 2   (still ONE re-render for the whole batch)
```

Two separate facts are on display:

1. **Updates are batched.** Multiple state updates in the same event produce **one** render. The harness counted `2` renders total for the whole session: mount, then one batched re-render. That is a performance feature you get for free.
2. **The updater form chains.** `(c) => c + 1` twice means `0 → 1 → 2`, because each recipe is applied to the result of the previous one.

**The rule that follows:** when the new value depends on the old one, use the updater form. When it does not (a reset, a value typed by the user, a selection from a list), pass the value directly.

```tsx
setCount(count + 1);            // ⚠️ fine once, wrong twice in the same handler
setCount((c) => c + 1);         // ✅ always correct, any number of times
setLines([...lines, line]);     // ⚠️ uses this render's `lines`
setLines((prev) => [...prev, line]); // ✅ always appends to the newest list
```

💡 **This is not a `useState` quirk — it is the snapshot rule with consequences.** The same reasoning explains why three dispatches in one handler (file 06) queue correctly and produce a single render.

---

## 5. Opting out of batching: `flushSync`

There is an escape hatch, and you should know it exists mostly so you can recognise it in other people's code:

```tsx
import { flushSync } from 'react-dom';

<button
  className="flush"
  onClick={() => {
    flushSync(() => setCount((c) => c + 1));
    flushSync(() => setCount((c) => c + 1));
  }}
>
  count={count}
</button>
```

**Verified output:**

```text
3. same two updates, each wrapped in flushSync()
   button text : count=2   renders: 3   (flushSync opts OUT of batching)
```

Two updates, three renders (mount + two). `flushSync` forces React to apply the queued work **before returning**, which is why the final value is still 2 — the updater form works through both flushes.

⚠️ **Use it for one thing only:** reading a value out of the DOM immediately after a state update, in a place where you cannot use an effect — for example, "focus the newly inserted element right now, before the browser scrolls". `flushSync` can defeat concurrent rendering optimisations and cause extra layout work. If you see it in a codebase, look for the comment that explains why; if there is none, it is probably a workaround for a design problem.

---

## 6. Functional updates in detail

The setter accepts a function. React calls that function **later**, with the value the slot holds at that moment, and stores the result.

```tsx
setCount((current) => current + 1);   // signature: (prevState: S) => S
```

Three rules, each with a reason:

| Rule | Reason |
| --- | --- |
| The function must be **pure** (no side effects, no reading of outside variables that may change) | React may call it more than once, and in development under StrictMode it *does* call updaters twice to check purity. |
| It receives only the previous value — nothing else | It must be usable no matter when the batch is processed. |
| Never mutate the previous value inside it | `(prev) => { prev.push(x); return prev; }` returns the same reference, so React may skip the render (section 10). |

**When it is mandatory:**

```tsx
// a "collect three things" handler
const handleAddAll = () => {
  setLines((prev) => [...prev, keyboard]);
  setLines((prev) => [...prev, mouse]);
  setLines((prev) => [...prev, monitor]);
};

// an interval, a promise callback, or any code that does not see the newest render
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000); // ✅ never stale
  return () => clearInterval(id);
}, []);
```

Compare the last one with `setCount(count + 1)` inside the same interval: the effect captures the `count` of the render in which it ran — for a `[]` effect, that is the mount render, so the counter would jump to `1` and stay there. We prove exactly that in file 03 (the stale-closure harness, output `stale closure sees count=0` while the button said `count=3`).

---

## 7. Lazy initialisation: `useState(() => expensive())`

If the initial value is expensive to compute, pass a **function**:

```tsx
// ⚠️ CALLS the function on every render — the result is discarded on all but the first
const [report] = useState(buildReport(products));

// ✅ passes the function; React calls it exactly once, on the first render
const [report] = useState(() => buildReport(products));
```

**Verified output** (four renders each; the initialiser increments a module counter):

```text
4. useState(expensiveInitial) vs useState(expensiveInitial())
   lazy  (function passed)  : initialiser ran 1x over 4 renders
   eager (function CALLED)  : initialiser ran 4x over 4 renders
   -> the eager version recomputes a value that is then thrown away
```

Four renders of `buildReport(products)` for one stored value. With a real report over thousands of rows, that is a visibly janky app for no reason.

| Form | Runs | Use when |
| --- | --- | --- |
| `useState(0)` | never (it is already a value) | constants, literals, props |
| `useState(someFunction)` | once, on mount | reading `localStorage`, parsing JSON, building an index, `new Map()` |
| `useState(() => someFunction())` | once, on mount | same, when you want to be explicit that it is lazy |
| `useState(someFunction())` | every render | **almost never** — only if the call is trivial *and* you want the side effect (you do not) |
| `useState(compute)` where `compute` takes arguments | — | use `() => compute(arg)`; do not pass an argument-taking function directly |

💡 **The one trap with the function form:** if your state *is* a function, the lazy form is ambiguous, so you need one extra wrapper.

```tsx
const [format, setFormat] = useState<() => string>(() => () => 'plain');
//                                 ^^^^^^^^^^^^^^^  the lazy initialiser
//                                 ^^^^^^^^^^^^^^   returns the value that is stored
```

In the lab the pattern appears in `useLocalStorageState` (file 09), where the initial value is read from `localStorage` inside a lazy initialiser — so a page reload reads storage once, and not on every keystroke:

```ts
const [value, setValue] = useState<T>(() => {
  if (typeof localStorage === 'undefined') return initialValue;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return initialValue;
    const parsed: unknown = JSON.parse(stored);
    return validate !== undefined && !validate(parsed) ? initialValue : (parsed as T);
  } catch {
    return initialValue;
  }
});
```

---

## 8. TypeScript with `useState`

TypeScript infers the type from the initial value in the common cases:

```ts
const [count, setCount] = useState(0);        // number
const [name, setName] = useState('MegaShop'); // string
const [open, setOpen] = useState(false);      // boolean
```

You must (or should) supply a type argument in four situations:

### 8.1 Empty arrays

```ts
const [lines, setLines] = useState([]);        // ❌ never[] — you can never add anything
const [lines, setLines] = useState<CartLine[]>([]); // ✅
```

### 8.2 Nullable state

```ts
const [selected, setSelected] = useState<Product | null>(null);

// TS18047-style error: 'selected' is possibly 'null'
const price = selected.priceMinor;

if (selected !== null) {
  const safe = selected.priceMinor; // ✅ narrowed
}
```

Two APIs in one line: **`| null` is the honest type** for "nothing selected yet", and the compiler forces you to handle that state in the JSX.

### 8.3 Discriminated unions instead of contradictory flags

❌ Three booleans can be true at once:

```ts
const [isLoading, setLoading] = useState(false);
const [isError, setError] = useState(false);
const [data, setData] = useState<Product[] | null>(null);
```

✅ One union makes invalid states unrepresentable:

```ts
export type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: readonly Product[] };

const [request, setRequest] = useState<RequestState>({ status: 'idle' });
```

Now `request.message` only type-checks when `request.status === 'error'`, and there is no state in which both a spinner and an error message are legitimate. (This is the same exhaustiveness idea as Part 2's unions and file 06's reducer actions.)

### 8.4 State with no initial value

```ts
const [value, setValue] = useState<number>();
// value: number | undefined
```

React's typings return `T | undefined` for this overload, and you must handle `undefined` in the JSX. Prefer an explicit initial value — `useState<number>(0)` or `useState<number | null>(null)` — so the state's shape is stated rather than implied.

### 8.5 Typing the setter, and the updater's parameter

```ts
setCount(5);                          // ✅
setCount((current) => current + 1);   // ✅ `current` is inferred as number

// @ts-expect-error setCount only accepts a number
setCount('five');
```

**The full type-level test file** lives at `src/dev/__usestate-types.ts` in the lab: 6 `@ts-expect-error` claims covering the cases above. Running `npx tsc -b` prints nothing and exits `0` — which is the proof that each "this should fail" line really does fail, and that every "this should work" line compiles.

⚠️ **`@ts-expect-error` is a claim, and TypeScript checks it.** If the line below it stops being an error, you get `TS2578: Unused '@ts-expect-error' directive`. That is why this technique is trustworthy: it fails loudly when your assumption changes. (Never replace it with `@ts-ignore`, which silences everything and proves nothing.)

---

## 9. Object and array state: immutability in practice

State can be any value. Objects and arrays are the ones that go wrong.

**File: `src/dev/state-probe.tsx`** (the harness that produced the output below; it is a temporary dev file, deleted after this part)

```tsx
function ObjectState() {
  const [user, setUser] = useState({ name: 'Asha', city: 'Pune' });
  const [tick, setTick] = useState(0);
  return (
    <div>
      <span className="name">{user.name}</span>
      <button className="mutate" onClick={() => { user.name = 'Bela'; setUser(user); }}>
        mutate + set
      </button>
      <button className="replace" onClick={() => setUser({ ...user, name: 'Chetan' })}>
        copy + set
      </button>
      <button className="unrelated" onClick={() => setTick(tick + 1)}>
        unrelated update
      </button>
    </div>
  );
}
```

**Verified output:**

```text
5. state that is an object
   after mutating user.name and calling setUser(user) : "Asha"   (renders: 1)
   after an UNRELATED state update                     : "Bela"   (the mutation leaks in later)
   after setUser({ ...user, name: 'Chetan' })          : "Chetan"   (new object -> new render)
```

Three observations, each worth a rule:

1. **`"Asha"` after `setUser(user)`** — the render count stayed at `1`, meaning React did not re-render at all. The setter was called with the **same reference** React already had, so it bailed out (section 10). The mutation happened in memory; the screen never asked for the new value.
2. **`"Bela"` after an unrelated update** — the mutated value was in the object all along, and the next render that happened for another reason displayed it. This is what makes mutation bugs so confusing: *the wrong value appears at the wrong time.*
3. **`"Chetan"` immediately** — a new object is a new value, so React performed a normal update.

### The update recipes

Learn these five lines; they cover almost every case in a React app.

```ts
// 1. change one field of an object
setUser((prev) => ({ ...prev, name: 'Bela' }));

// 2. add an item to an array (new array, appended copy)
setLines((prev) => [...prev, newLine]);

// 3. change one item of an array (map → new array, new object for the match)
setLines((prev) =>
  prev.map((line) => (line.productId === id ? { ...line, quantity: line.quantity + 1 } : line)),
);

// 4. remove one item (filter → new array)
setLines((prev) => prev.filter((line) => line.productId !== id));

// 5. sort/filter for display — never sort state in place
setProducts((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name)));
```

Note `[...prev].sort(...)`: `Array.prototype.sort` mutates the receiver, so you must copy first — a mistake that shows up once a month in code review.

⚠️ **`{ ...prev, name }` is a *shallow* copy.** Nested objects are still shared:

```ts
const next = { ...user, address: { ...user.address, city: 'Pune' } }; // ✅ new object at both levels
const wrong = { ...user }; wrong.address.city = 'Pune';              // ⚠️ mutates the shared address
```

For deeply nested state, either copy the levels you touch, or restructure your state to be flatter (often the better answer). Part 2 file 05's `Readonly<T>` is the type-level version of the same advice.

---

## 10. Bailouts: when React decides not to re-render

React compares the new state with the old one using `Object.is` — almost the same as `===`. If they are the same, React **may** skip rendering the component and its children.

```ts
setCount(3);        // count is already 3 -> no render
setUser(user);      // same reference -> no render (see section 9)
setLines([...lines]); // new array, same contents -> a render, because the reference differs
```

⚠️ Two consequences you should internalise:

- **"Nothing happened" is usually a bailout**, not a bug in React. The most common cause is mutation (same reference) — the harness above.
- **A new object with identical contents still re-renders.** `Object.is` is a reference check, not a deep comparison. That is why file 07 (identity in dependencies) and file 08 (`useCallback`) exist.

💡 **The pure-object test:** after writing an update, ask "would `Object.is(nextState, prevState)` be `false`?" If you cannot see a new object or array in your update expression, you have probably written a mutation.

---

## 11. State initialised from props (and the `key` trick)

A very common shape: a component takes an initial value as a prop.

```tsx
function PropCopy({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount); // read ONCE, on mount
  return (
    <button className="prop-copy" onClick={() => setCount((c) => c + 1)}>
      count={count} (prop says {initialCount})
    </button>
  );
}
```

**Verified output:**

```text
10. state copied from a prop
   after 2 clicks with initialCount=1 : count=3 (prop says 1)
   after the prop changed to 99       : count=3 (prop says 99)   (the prop was ignored)
   after changing key="reset"         : count=99 (prop says 99)   (a new key = a new component instance)
```

Three lines of output, three lessons:

| Output | Lesson |
| --- | --- |
| `count=3 (prop says 1)` | Both buttons work; the two numbers happen to agree because nothing changed the prop. |
| `count=3 (prop says 99)` | The prop changed, the state did not. **State initialised from a prop is seeded once, not kept in sync.** |
| `count=99` after `key="reset"` | Changing the `key` unmounts the old instance and mounts a new one, so the initialiser runs again with the new prop. |

So there are exactly two correct patterns, and one wrong one:

```tsx
// ✅ 1. Use the prop directly — the simplest answer when no local editing is needed
function Price({ priceMinor }: { priceMinor: number }) {
  return <span>{formatMoney(priceMinor)}</span>;
}

// ✅ 2. TRULY independent state, reset by identity (a different product, a different row)
<RatingEditor key={product.id} initialRating={product.rating} />
//                        ^^^^^^^^^^^^^^^^^ the key IS the reset mechanism

// ❌ 3. The tempting-but-wrong "sync it with an effect"
useEffect(() => setCount(initialCount), [initialCount]); // extra render, and it fights local edits
```

The third pattern is so common in tutorials that it is worth saying plainly: **it is on the "you might not need an effect" list** (file 03). It costs an extra render, it discards whatever the user had typed whenever the parent re-renders with a new object, and it hides the real design question ("is this state owned here, or by the parent?"). React's own docs call the `key` approach "resetting state with a key" — use it.

---

## 12. StrictMode, double invocation, and why your initialiser must be pure

In development, `<StrictMode>` intentionally calls component functions twice, and runs effects twice, to expose impure code. The lab harness measured the render side:

```text
11. under <StrictMode> in development
   component function ran 2x for ONE mount (double-invoked to expose impure renders)
```

The point is not to slow your app down; it is to make purity bugs *visible in development* instead of *random in production*. The kinds of code it catches:

| Impure code | What you will see in dev | Correct version |
| --- | --- | --- |
| `useState({ id: crypto.randomUUID() })` | two different ids (one is discarded) | `useState(() => ({ id: crypto.randomUUID() }))` — still runs twice in dev, so generate ids in an event/effect, or accept the documented behaviour |
| `useState(++moduleCounter)` | the counter jumps by two | read module state outside render, or not at all |
| `useState(computeReport(products))` | the report is computed twice per mount, and every render | `useState(() => computeReport(products))` |
| An updater with a side effect (`setCount((c) => { console.log(c); return c + 1; })`) | the log appears twice | keep log statements out of updaters |

🔍 **The practical test:** the argument to `useState`, and the function you pass to a setter, must be safe to call twice with the same inputs. If they are, StrictMode's double invocation changes nothing you can observe. If they are not, you have found the bug before your users did.

---

## 13. Real-world example: three `useState`s that run a shop

The lab's `App.tsx` keeps only two pieces of UI state, and the third (`category`) uses the persistence hook built in file 09:

```tsx
export default function App() {
  // This one survives a reload: state + an effect writing to localStorage.
  const [category, setCategory] = useLocalStorageState<CategoryChoice>('megashop:category', 'all', isCategoryChoice);
  // This one does not: a plain useState.
  const [query, setQuery] = useState('');

  const cart = useCart();
  // …
}
```

Everything else on the screen is **derived**, in two `useMemo` blocks:

```tsx
const visible = useMemo(() => {
  const needle = query.trim().toLowerCase();
  return products.filter((product) => {
    const matchesCategory = category === 'all' || product.category === category;
    const matchesQuery =
      needle === '' ||
      product.name.toLowerCase().includes(needle) ||
      product.sku.toLowerCase().includes(needle);
    return matchesCategory && matchesQuery;
  });
}, [category, query]);
```

Two pieces of state, one filtered list, one set of counts, a cart, a toast message and a badge count — all consistent by construction, because every other value is computed from these two. The trace from the Part 3 lab harness shows the derived list following the state exactly:

```text
8 of 8 → "ssd" 2 of 8 → + Audio 0 of 8 → All 2 of 8 → Clear 8 of 8 → two Add-to-cart → "🛒 2"
```

The keystroke path is worth tracing once:

```text
user types "m"        -> onChange -> setQuery('m')      -> App re-renders -> visible recomputed -> 4 cards
user types "o"        -> onChange -> setQuery('mo')     -> App re-renders -> visible recomputed -> 2 cards
user submits the form -> onSearch('monitor')            -> setQuery('monitor') -> same pipeline
user clicks "Clear"   -> setQuery('') + onSearch('')    -> 8 cards
```

One state slot, one writer (`setQuery`), one derived reader (`visible`). No effects, no synchronisation code, no possibility of a stale list.

---

## 14. When not to use `useState`

| Situation | Better tool |
| --- | --- |
| The value is computed from other state | a plain `const` during render (file 01) |
| Many related transitions with rules (add/remove/setQuantity/clear) | `useReducer` (file 06) |
| The value must change **without** a re-render (timer id, `AbortController`, DOM node, "latest value") | `useRef` (file 04) |
| The value is shared by many components at different depths | context (file 05) or a store (Part 5+) |
| The value is part of the URL (which page, which filter, which id) | the router (Part 6) — the URL is state the user can share and bookmark |
| The value comes from the server and is cached/shared | a data-fetching library (Part 7) |
| The value is form data you submit once | uncontrolled inputs + `FormData` (Part 8) or a form library |

That table is not a list of "advanced" things to postpone forever; it is the map for the rest of this part. Notice that `useState` remains the default for genuinely local UI state — the tool is not weak, it is simply *local*.

---

## 15. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `setCount(count + 1)` twice | only +1 | updater form (section 6) |
| 2 | Reading state right after setting it | old value in the log | snapshot rule; compute locally or use an effect |
| 3 | Mutating object/array state | screen shows the old value, then the new one at a random later moment | immutable updates (section 9) |
| 4 | `useState([])` | `never[]` in TypeScript, and `push` errors | `useState<CartLine[]>([])` |
| 5 | `useState(props.value)` then expecting it to follow the prop | the component ignores prop changes | use the prop, or `key` to reset (section 11) |
| 6 | `useState(expensiveCalculation())` | slow renders, work thrown away | lazy initialiser `useState(() => …)` |
| 7 | Storing derived data (`count` next to `lines`) | values drift apart | derive during render |
| 8 | Two booleans for one status | impossible combinations | one union type |
| 9 | `useState<CartLine[]>()` with no argument | `possibly undefined` everywhere | give an initial value or include `undefined` in the type |
| 10 | A side effect inside an updater | double logs in StrictMode, subtle bugs | keep updaters pure |
| 11 | Calling the setter during render (`if (x) setY(...)`) | infinite loop, warnings | derive, or move it to an event/effect |
| 12 | One giant state object for unrelated facts | unrelated updates re-render everything and every update copies the world | split it: `query`, `category`, `isOpen` as separate slots |

---

## 16. Best practices

1. **Name the pair after the concept:** `[cartLines, setCartLines]`, not `[data, setData]`.
2. **Keep state slots small and independent.** Small slots re-render narrowly and read clearly; one mega-object re-renders everything and tempts you into deep copies.
3. **Default to the updater form when the new value depends on the old one.** It costs two characters and removes a whole bug class.
4. **Initialize lazily for anything non-trivial** (storage reads, parsing, building an index).
5. **Make invalid states impossible** with unions instead of flag combinations.
6. **Copy, do not mutate** — spread for objects, `map`/`filter`/`concat` for arrays, and copy before `sort`/`reverse`.
7. **Do not copy props into state**; use the prop, or reset with `key`.
8. **Resist the urge to lift state early.** Local state keeps components independent; lift when a second consumer appears.
9. **Let React batch.** Only reach for `flushSync` when you must read the DOM immediately, and comment why.
10. **Keep initialisers and updaters pure** so StrictMode's double invocation is a no-op.

---

## 17. Practice

### Beginner — three setters, one render

Build `src/practice/MultiCounter.tsx` with a single `useState<number>` and three buttons: `-1`, `+1`, `+10`.

Totals to reach and check: after `+1`, `+1`, `+10`, `-1` the value is `11`; the component must re-render **once per click** (not more), and never show a value that is off by one.

Extra: add a "double" button that adds `2 * current` using the updater form, then explain in a comment why `setValue(value * 2)` would still work in this particular case but `setValue(value + 1)` twice would not.

### Intermediate — a task list with immutable updates

**File: `src/practice/TaskList.tsx`** · state: `useState<Task[]>([])` where `Task = { id: string; text: string; done: boolean }`.

Requirements:

- an input plus an "Add" button (trim, ignore empty strings, generate the id with `crypto.randomUUID()` **inside the event handler**),
- each row: a checkbox toggling `done`, the text, and a "Remove" button,
- a footer showing `3 of 5 done` computed during render (no state for the count),
- a "Clear completed" button (filter).

Run it, then break it on purpose: replace the toggle's `map` with `task.done = !task.done; setTasks(tasks)` and describe exactly what you see after clicking a checkbox, and after clicking "Add" afterwards.

### Challenge — a "step wizard" with a discriminated union

Design `src/practice/CheckoutWizard.tsx` so that impossible states cannot be typed:

```ts
type Step =
  | { name: 'cart' }
  | { name: 'address'; address: string }
  | { name: 'payment'; address: string; cardLast4: string }
  | { name: 'done'; orderId: string };
```

Requirements:

- One `useState<Step>` and one `useState<string>` for the current input draft.
- Buttons: "Back" and "Continue". `Continue` is disabled when the current step's input is empty.
- The screen shows a summary that only lists the fields the user has actually filled in — which means the summary must compile without `!` non-null assertions.
- No `any`, no optional chaining to hide the union (`step.address?.` is a smell here — if you need it, your union is wrong).

Then answer: which of the 16 possible combinations of "hasAddress/hasPayment/hasOrder" are now impossible by construction?

---

## 18. Solutions

### Beginner

```tsx
import { useState } from 'react';

export function MultiCounter() {
  const [value, setValue] = useState(0);

  return (
    <div>
      <output className="value">{value}</output>
      <button type="button" onClick={() => setValue((v) => v - 1)}>
        -1
      </button>
      <button type="button" onClick={() => setValue((v) => v + 1)}>
        +1
      </button>
      <button type="button" onClick={() => setValue((v) => v + 10)}>
        +10
      </button>
      <button type="button" onClick={() => setValue((v) => v * 2)}>
        double
      </button>
    </div>
  );
}
```

Answer to the closing question: `setValue(value * 2)` would work for *one* click per render (the snapshot is correct when only one update happens). It breaks when two updates land in the same batch — a double-click, or a second button clicked before React re-renders. Since "one click per render" is an accident of timing rather than a guarantee, the updater form is the correct default. Consistency beats case-by-case reasoning here.

### Intermediate

```tsx
import { useState, type FormEvent } from 'react';

interface Task {
  id: string;
  text: string;
  done: boolean;
}

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState('');

  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text === '') return;

    // The id is created in the EVENT, not during render: pure render, real id.
    const task: Task = { id: crypto.randomUUID(), text, done: false };
    setTasks((prev) => [...prev, task]);
    setDraft('');
  };

  const toggle = (id: string) =>
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));

  const remove = (id: string) => setTasks((prev) => prev.filter((task) => task.id !== id));

  const clearCompleted = () => setTasks((prev) => prev.filter((task) => !task.done));

  // Both derived during render — no state for either of them.
  const doneCount = tasks.filter((task) => task.done).length;

  return (
    <section>
      <form onSubmit={addTask}>
        <label htmlFor="task-draft">New task</label>
        <input id="task-draft" value={draft} onChange={(e) => setDraft(e.currentTarget.value)} />
        <button type="submit">Add</button>
      </form>

      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <label>
              <input type="checkbox" checked={task.done} onChange={() => toggle(task.id)} />
              <span style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.text}</span>
            </label>
            <button type="button" onClick={() => remove(task.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <p>
        {doneCount} of {tasks.length} done
      </p>
      <button type="button" onClick={clearCompleted} disabled={doneCount === 0}>
        Clear completed
      </button>
    </section>
  );
}
```

The broken version (`task.done = !task.done; setTasks(tasks)`) behaves exactly like the harness in section 9: the checkbox flips (the DOM owns *its* own checked state for that instant) but nothing else changes, because the array reference is unchanged and React bails out. Then the next unrelated update (adding a task) renders a list in which the previously clicked row is struck through — the mutation appears late. Two symptoms, one cause.

### Challenge

```tsx
import { useState } from 'react';

type Step =
  | { name: 'cart' }
  | { name: 'address'; address: string }
  | { name: 'payment'; address: string; cardLast4: string }
  | { name: 'done'; orderId: string };

export function CheckoutWizard() {
  const [step, setStep] = useState<Step>({ name: 'cart' });
  const [draft, setDraft] = useState('');

  const canContinue = draft.trim() !== '';

  const continueForward = () => {
    switch (step.name) {
      case 'cart':
        setStep({ name: 'address', address: '' });
        break;
      case 'address':
        // Narrowed: only the 'address' variant reaches here.
        setStep({ name: 'payment', address: draft.trim(), cardLast4: '4242' });
        break;
      case 'payment':
        setStep({ name: 'done', orderId: crypto.randomUUID().slice(0, 8) });
        break;
      case 'done':
        break;
      default: {
        const unhandled: never = step;
        throw new Error(`Unhandled step: ${JSON.stringify(unhandled)}`);
      }
    }
    setDraft('');
  };

  const back = () => {
    switch (step.name) {
      case 'address':
        setStep({ name: 'cart' });
        break;
      case 'payment':
        setStep({ name: 'address', address: step.address });
        break;
      case 'done':
        setStep({ name: 'payment', address: '', cardLast4: '4242' });
        break;
      case 'cart':
        break;
      default: {
        const unhandled: never = step;
        throw new Error(`Unhandled step: ${JSON.stringify(unhandled)}`);
      }
    }
  };

  return (
    <section>
      <h2>Checkout — {step.name}</h2>

      {/* The summary reads the fields the union actually carries. */}
      {step.name !== 'cart' && step.name !== 'done' ? <p>Address: {step.address || '(not set yet)'}</p> : null}
      {step.name === 'payment' || step.name === 'done' ? (
        <p>Card: {step.name === 'payment' ? `•••• ${step.cardLast4}` : 'paid'}</p>
      ) : null}
      {step.name === 'done' ? <p>Order {step.orderId} placed — thank you!</p> : null}

      {step.name !== 'done' ? (
        <input value={draft} onChange={(e) => setDraft(e.currentTarget.value)} placeholder="type here" />
      ) : null}

      <div>
        <button type="button" onClick={back} disabled={step.name === 'cart'}>
          Back
        </button>
        <button type="button" onClick={continueForward} disabled={step.name !== 'done' && !canContinue}>
          {step.name === 'done' ? 'Finish' : 'Continue'}
        </button>
      </div>
    </section>
  );
}
```

The answer to the closing question: with the union, there is no way to represent "payment exists but no address" or "done with no order id" — those combinations are not constructible. Each state you *can* construct is legitimate. That is what "make invalid states impossible" means in practice, and it is the same technique the cart reducer uses for its actions (file 06).

---

## 19. Summary

- `useState<S>(initial)` returns `[value, setValue]` — value first, setter second, identified by **call order**.
- The initial value is used **once**; later renders ignore it.
- Updates are **batched**: two setters in one handler produce one render.
- When the new value depends on the old, use the **updater form** `setValue((prev) => …)`.
- Pass a **function** for expensive initial values; pass a **value** otherwise.
- React compares with `Object.is`: same reference → possible bailout, which is why **mutation looks like nothing happening**.
- Objects and arrays must be replaced, not changed: spread, `map`, `filter`, `concat`, and copy before `sort`.
- State seeded from props is seeded **once** — use the prop directly, or remount with `key`.
- TypeScript needs help for `[]`, `null`, and "no initial value"; discriminated unions beat flag combinations.
- StrictMode double-invokes render functions and effects in development, so initialisers and updaters must be pure.
- `flushSync` exists, forces synchronous application, and is almost never the right answer.

---

**What's next →** [`03-useeffect.md`](./03-useeffect.md): the effect hook, and the timeline that explains it — render, commit, paint, then effect. We will measure how often each dependency-array form runs, watch a stale closure report `count=0` while the screen says `3`, cancel a timer on unmount, and race two requests to prove why the naive fetch has a bug before any user complains about it.
