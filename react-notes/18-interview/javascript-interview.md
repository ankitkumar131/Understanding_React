# JavaScript Interview Questions (the ones React interviews actually ask)

> **Part 18 · Interview Preparation · File 2 of 4**

Why this file exists: React interviews are JavaScript interviews wearing a React badge. The
questions below are not trivia — each one is the underlying mechanism of a React bug you have
probably already met. Every answer ends with **"…and in React this matters because"**, which is
the part that turns a language question into a signal that you understand the framework.

---

## 1. `let` / `const` / `var`, and block scope

**Answer.** `var` is function-scoped and hoisted (initialised as `undefined`); `let` and
`const` are block-scoped and hoisted into a *temporal dead zone* — accessing them before the
declaration throws `ReferenceError` rather than giving `undefined`. `const` binds the
*variable*, not the value: `const obj = {}` still allows `obj.x = 1`.

**And in React this matters because** the classic loop-closure bug comes from `var`:

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i));   // 3, 3, 3
for (let i = 0; i < 3; i++) setTimeout(() => console.log(i));   // 0, 1, 2
```

`let` creates a fresh binding per iteration, so each closure captures its own `i`. The same
mechanism explains why a component's render captures *that render's* values — see closures
below (Part 1 files 03, 08).

---

## 2. Closures

**Answer.** A closure is a function plus the variables it captured from the scope where it was
created. Those variables stay alive as long as the function does — which is how you get private
state, and how you get memory that outlives its usefulness.

```js
function createCounter() {
  let count = 0;                        // captured, private, persists
  return { inc: () => ++count, get: () => count };
}
const counter = createCounter();
counter.inc(); counter.inc();
counter.get();                          // 2 — with no way to touch `count` directly
```

**And in React this matters because** every function you define inside a component closes over
*that render's* props and state. That is the entire mechanism of a stale closure:

```tsx
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);   // captures count from THIS render
  return () => clearInterval(id);
}, []);                                                       // never re-created → stuck at 0
```

The fixes follow directly from the mechanism: the functional updater (`setCount(c => c + 1)`)
does not need the captured value; adding the dependency re-creates the closure with fresh
values; a ref holds a mutable box the closure reads at call time (Part 1 file 08; Part 4
files 03, 08).

---

## 3. `this`

**Answer.** `this` is decided by *how a function is called*, not where it is defined:
`obj.fn()` → `obj`; bare `fn()` → `undefined` in strict mode; `new Fn()` → the new instance;
`fn.call(ctx)` → `ctx`. **Arrow functions have no `this`** — they inherit it lexically from the
enclosing scope, and `bind` cannot change it.

**And in React this matters because** it explains a piece of history: class components needed
`this.handleClick = this.handleClick.bind(this)` in the constructor, because passing
`onClick={this.handleClick}` detached the method from its instance. Function components have no
`this` at all, which is a large part of why they are easier to reason about. The remaining
place you will meet it is event handlers: `event.currentTarget` is the element the handler is
attached to, and it is `null` if you read it asynchronously — capture the value first (Part 1
file 08; Part 3 file 07).

---

## 4. The event loop, microtasks and macrotasks

**Answer.** JavaScript runs one thing at a time on a single thread. The **call stack** executes
synchronously; when it empties, the runtime drains the **microtask queue** (promise callbacks,
`queueMicrotask`) completely, then takes one **macrotask** (timers, I/O, UI events), then drains
microtasks again, and so on. Microtasks always run before the next macrotask.

```js
console.log('1');
setTimeout(() => console.log('2'), 0);       // macrotask
Promise.resolve().then(() => console.log('3')); // microtask
console.log('4');
// → 1, 4, 3, 2      (not 1, 4, 2, 3 — setTimeout 0 does not mean "now")
```

**And in React this matters because** it explains when your state update becomes visible. React
18 batches updates across event handlers, promises and timeouts, then renders. A `setState`
inside a promise callback does not update the DOM synchronously — the render is scheduled, and
the microtask/macrotask ordering decides when it lands. It also explains why a test needs
`await`/`findBy*` rather than an immediate assertion after a click, and why
`flushSync` exists for the rare case where you need the DOM updated before the browser paints
(Part 1 file 10; Part 13 file 03).

---

## 5. Promises, `async`/`await` and error handling

**Answer.** A promise is a value that will exist later, in one of three states: pending,
fulfilled, rejected. `await` pauses the *async function* (not the thread) until it settles. Two
rules people get wrong: `await` in a loop serialises, and a rejection that nothing handles
becomes an `unhandledrejection` event.

```js
// ❌ Serial: 3 seconds
for (const id of ids) results.push(await fetchUser(id));

// ✅ Parallel: ~1 second
const results = await Promise.all(ids.map(fetchUser));

// ✅ Parallel, tolerant of individual failures
const settled = await Promise.allSettled(ids.map(fetchUser));
const ok = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
```

```js
try {
  const user = await fetchUser(id);
} catch (error) {
  // `catch` catches EVERYTHING in the try block, including bugs in your own code.
  // Narrow it, or you will hide a TypeError behind "network error".
}
```

**And in React this matters because** three of the most common data bugs are promise bugs: a
`for`-`await` loop that makes a page load take six seconds instead of one; a missing `.catch()`
that becomes a silent failure; and — the big one — `fetch` **resolving** on a 404 or 500, so
your `catch` never runs and the error surfaces three lines later as a JSON parse failure. That
is why every API layer checks `response.ok` explicitly (Part 1 file 11; Part 7 file 02; Part 15
file 04).

---

## 6. Equality: `==`, `===`, `Object.is` and why props look unchanged

**Answer.** `==` coerces types (`0 == '' == false` is true; `null == undefined` is true); `===`
compares type then value; `Object.is` is like `===` except `Object.is(NaN, NaN)` is true and
`Object.is(+0, -0)` is false. For objects, all three compare **references**, not contents:

```js
{ a: 1 } === { a: 1 }            // false — two different objects
[1, 2] === [1, 2]                // false
NaN === NaN                      // false
Object.is(NaN, NaN)              // true
```

**And in React this matters because** reference equality is the mechanism behind three everyday
problems:

```tsx
// 1. Why state updates are missed: mutating keeps the same reference
todo.done = true;  setTodos(todos);           // ❌ same array → React sees no change
setTodos(todos.map(t => t.id === id ? { ...t, done: true } : t));   // ✅ new array

// 2. Why useEffect re-runs: a new object literal every render
useEffect(() => { … }, [{ id: 1 }]);          // ❌ new reference each render → runs forever
const query = useMemo(() => ({ id: 1 }), []); // ✅ stable reference

// 3. Why React.memo does nothing: shallow comparison of props that are new objects
<MemoChild style={{ color: 'red' }} />        // new object every render → memo never hits
```

React uses `Object.is` for its state bailout check, which is why `setCount(0)` when count is
already `0` skips a re-render, but `setUser({ ...user })` always re-renders (Part 1 files 06,
07; Part 4 file 02; Part 10 file 03).

---

## 7. Immutability, spread and the copy that is not deep

**Answer.** Spread and `Object.assign` produce a **shallow** copy: the top level is new, nested
objects are shared references.

```js
const state = { user: { name: 'Ada' }, tags: ['a'] };
const copy = { ...state };
copy.user.name = 'Grace';           // ⚠️ also mutates state.user — same object!
```

```js
// Deep-ish copy, one level at a time — the pattern React state updates use
const next = { ...state, user: { ...state.user, name: 'Grace' } };

// Or, for a genuinely deep copy of JSON-safe data:
const deep = structuredClone(state);        // built into modern browsers and Node 17+
```

**And in React this matters because** shallow copies are the whole game of state updates, and
the nested case is the classic bug:

```tsx
// ❌ The row updates, but the array reference is unchanged → no re-render
setRows(rows.map(r => { if (r.id === id) r.done = true; return r; }));

// ✅ New array AND new object for the changed row
setRows(rows.map(r => r.id === id ? { ...r, done: true } : r));
```

And note the nested version: updating `state.user.name` requires copying `state` **and**
`state.user`. Forgetting the inner copy silently mutates the old state, which produces the
maddening symptom "the UI updates when I do something else" (Part 1 files 06, 07).

---

## 8. Array methods: `map`, `filter`, `reduce`, `forEach`, `find`

**Answer.** `map` transforms every element into a new array; `filter` keeps elements matching a
predicate; `find` returns the first match or `undefined`; `reduce` folds an array into one
value; `forEach` runs a side effect and returns `undefined`. `map`/`filter`/`reduce` do not
mutate; `sort`, `reverse`, `splice`, `push` **do**.

```js
// The three you will write every day in React
const visible = tasks.filter(t => !t.done).map(t => t.title);
const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
const byId = new Map(users.map(u => [u.id, u]));   // O(1) lookup instead of find-in-a-loop
```

⚠️ **`sort` mutates in place** — `tasks.sort(...)` reorders your state array. Always copy
first: `[...tasks].sort(...)`.

**And in React this matters because** rendering lists *is* `map`, deriving views *is*
`filter` + `map`, and the "must return a value" rule of `map` is why a `forEach` inside JSX
renders nothing. Also: `map` gives you `(item, index)`, and using `index` as a `key` is the bug
from question 9 (Part 1 file 07; Part 3 file 11).

---

## 9. Destructuring, defaults and the `undefined` vs `null` distinction

**Answer.** Destructuring pulls values out by name (objects) or position (arrays), with
defaults that apply **only when the value is `undefined`** — not when it is `null`.

```js
const { name = 'Anonymous' } = { name: undefined };   // 'Anonymous'
const { name = 'Anonymous' } = { name: null };        // null  ← default NOT applied
const [first, second = 'fallback'] = ['a'];           // 'a', 'fallback'

// Renaming, nesting and rest — all in one
const { user: { id: userId }, ...rest } = response;

// Optional chaining and nullish coalescing
const city = user?.address?.city ?? 'Unknown';        // ?? only falls back on null/undefined
const count = value || 0;                             // ⚠️ also replaces 0, '' and false
```

⚠️ **`??` vs `||` is a real bug source.** `const limit = userLimit || 10` turns a legitimate
`0` into `10`. Use `??` when `0`, `''` or `false` are valid values — which, for numbers and
toggles, they usually are.

**And in React this matters because** destructuring props with defaults is how you write
components, and the `undefined`/`null` distinction shows up in controlled inputs:
`<input value={user.name} />` where `name` is `undefined` makes the input **uncontrolled**,
producing React's warning; `value={user.name ?? ''}` fixes it. It is also why
`const { id = '' } = useParams()` is the safe pattern — router params are `string | undefined`
(Part 1 file 05; Part 3 file 08; Part 5 file 03).

---

## 10. Modules, imports and tree-shaking

**Answer.** ES modules are **static** — the import graph is known before the code runs — and
**live**: imported bindings reflect the exporter's current value. Named exports are
tree-shakeable; a default export of an object is not, because the bundler cannot know which
properties you use. Dynamic `import()` returns a promise and creates a separate chunk.

```js
import { format } from 'date-fns';        // ✅ ships one function
import _ from 'lodash';                    // ⚠️ likely ships the whole library
const module = await import('./heavy');    // ✅ a separate chunk, loaded on demand
```

**And in React this matters because** dynamic `import()` is the entire mechanism of code
splitting: `const Page = lazy(() => import('./Page'))` tells the bundler to cut a boundary
there, so the browser downloads that code only when the route is visited. It also explains why
`import _ from 'lodash'` costs you 70 kB and why a circular import between two modules can give
you `undefined` at just the wrong moment (Part 1 file 09; Part 10 files 05, 06; Part 16 file 03).

---

## 11. The `typeof` / `instanceof` traps

**Answer.**

```js
typeof null                 // 'object'      ← a 30-year-old bug, standardised
typeof undefined            // 'undefined'
typeof []                   // 'object'      ← arrays are objects
typeof function f(){}       // 'function'
Array.isArray([])           // true          ← the correct array check

[] instanceof Array         // true, but FALSE across iframes/realms
null instanceof Object      // false         ← instanceof walks the prototype chain
```

**And in React this matters because** error handling depends on it. `error instanceof ApiError`
is how you distinguish "our API failed in a known way" from "a TypeError escaped somewhere" —
and it can fail if the class is duplicated across module boundaries, which is why a
discriminant field (`if ('kind' in error)`) is the more robust check. Also: `typeof x ===
'object'` is not enough to prove `x` is a non-null object, which is why guards are written
`x !== null && typeof x === 'object'` (Part 2 file 09; Part 15 file 04).

---

## 12. Hoisting and the temporal dead zone

**Answer.** Declarations are processed before execution. `var` is hoisted *and initialised* to
`undefined`; `let`/`const` are hoisted but uninitialised until their line (the temporal dead
zone); function declarations are fully hoisted; function expressions and classes are not.

```js
console.log(a);  var a = 1;        // undefined
console.log(b);  let b = 2;        // ReferenceError: Cannot access 'b' before initialization
sayHi();         function sayHi() {}          // works — hoisted
sayBye();        const sayBye = () => {};     // ReferenceError
```

**And in React this matters because** it decides whether you can write
`export default function Page()` at the bottom of a file and reference it at the top (yes), or
whether an arrow-function component must be defined before use (yes, it must). It is also why a
helper function declared with `const` *below* its use inside a component body throws at runtime
even though the code "looks fine" (Part 1 file 08).

---

## 13. Quick-fire round

| Question | Answer |
| --- | --- |
| `0.1 + 0.2 === 0.3`? | `false` — IEEE 754 floats. Compare with an epsilon, or use integer cents for money |
| Is `NaN === NaN`? | No. Use `Number.isNaN(x)` (not the global `isNaN`, which coerces) |
| What does `[] + []` give? | `''` — both convert to strings. `[] + {}` gives `'[object Object]'` |
| `for...in` vs `for...of`? | `in` iterates **keys** (including inherited, enumerable ones); `of` iterates **values** of an iterable |
| Is `arguments` available in arrow functions? | No — it inherits the enclosing function's, or is undefined |
| What is a `Proxy`? | An object that intercepts operations on another object. It is how Vue's reactivity works, and how some form libraries track field access |
| What is `structuredClone`? | A built-in deep clone (browser + Node 17+). Handles Dates, Maps, Sets; throws on functions |
| `JSON.parse(JSON.stringify(x))` for deep copy? | Works for plain JSON data; silently drops `undefined`, functions, Dates become strings, and throws on cycles |
| What is optional chaining short-circuiting? | `a?.b.c` evaluates to `undefined` without touching `.c` if `a` is nullish |
| `Map` vs object for lookup? | `Map` keeps insertion order, allows any key type, has `.size`, and does not inherit `Object.prototype` keys |

---

## 14. How to answer a JavaScript question in a React interview

1. **Answer the language question correctly and briefly.** They are checking the foundation.
2. **Connect it to React immediately.** "…and that is exactly why a stale closure happens in a
   `useEffect` with an empty dependency array."
3. **Name the bug it causes and the fix.** This is what turns a trivia answer into evidence you
   have shipped code.

The candidates who stand out are not the ones who know the most JavaScript; they are the ones
who can say *"that language behaviour is why this React pattern exists."*

---

**What's next →** [`typescript-interview.md`](./typescript-interview.md) — the TypeScript
questions with React context: `interface` vs `type`, generics, narrowing, utility types, and
how to type props, refs, events and children.
