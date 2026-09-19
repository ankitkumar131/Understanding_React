# 02 — JavaScript Interview Questions (with React Context)

> **Part 18 · Interview Preparation · File 2 of 4**

Why this file exists: every React interview is partly a JavaScript interview. The questions below are the ones that come up *because of* React — a stale closure in a `useEffect`, the event loop behind a "state didn't update", `this` in a class component you will be asked to read, and array methods used inside render. Each answer has the same four parts:

```text
Question
Short interview answer      ← say this first
Detailed explanation        ← the mechanism, and the React consequence
Example                     ← runnable code (Node or the browser console)
```

Run every example. Several of them only land when you watch the output order.

---

## 1. Closures

### Q1.1 — What is a closure?

**Short answer:** A function together with the variables it captured from where it was defined. The function keeps those variables alive even after the outer function has returned.

**Detailed explanation:** Every function in JavaScript carries an invisible reference to its surrounding scope. That is why a counter factory works, why callbacks can remember values, and why React's "stale closure" bugs exist: a function captured a variable's *value* at the time it ran, and later renders create new variables with new values while the old function still points at the old one. React adds one twist — every render creates fresh variables, so a callback from render 1 and a callback from render 2 close over *different* `count` variables.

**Example:**

```js
function makeCounter() {
  let count = 0;                       // captured, not copied
  return () => { count += 1; return count; };
}

const next = makeCounter();
console.log(next(), next(), next());   // 1 2 3 — the closure keeps `count` alive
const other = makeCounter();           // a second closure has its own `count`
console.log(other());                  // 1
```

### Q1.2 — What is a "stale closure" in React, and how do you fix it?

**Short answer:** A callback (an effect, a timer, a subscription handler) captured an old value; when it later runs, it reads that old value. Fixes: add the value to the dependency array, use the functional updater form, or read from a ref.

**Detailed explanation:** Three fixes, three different situations. (1) The value is reactive state the effect depends on → list it in the dependency array so a new effect (with a fresh closure) is created. (2) You are updating state from a previous value → `setCount((c) => c + 1)` does not need the captured value at all. (3) You deliberately want the latest value without re-subscribing (a socket handler, an interval) → keep it in a ref that you update, and read `ref.current` inside the callback. Choosing wrongly is what produces "my interval always logs 0" or "the listener re-subscribes on every render".

**Example:**

```jsx
function Ticker() {
  const [count, setCount] = useState(0);

  // ❌ Stale: the closure captured count = 0 forever
  useEffect(() => {
    const id = setInterval(() => setCount(count + 1), 1000);     // always 0 + 1
    return () => clearInterval(id);
  }, []);

  // ✅ Functional updater: no captured value needed
  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return <output>{count}</output>;
}
```

### Q1.3 — Why does a loop with `var` print the same number, and how does `let` fix it?

**Short answer:** `var` is function-scoped, so every iteration shares one variable; `let` creates a new binding per iteration, so each callback closes over its own value.

**Detailed explanation:** The classic interview loop is not trivia — it is the same mechanism as React's list rendering and event handlers. In React, the equivalent bug is creating handlers or effects inside a loop and expecting them to capture the right index; using `let`, `for (const item of items)`, or `items.map(...)` (which creates a scope per callback invocation) fixes it.

**Example:**

```js
for (var i = 0; i < 3; i += 1) setTimeout(() => console.log('var', i));     // 3 3 3
for (let j = 0; j < 3; j += 1) setTimeout(() => console.log('let', j));     // 0 1 2

// The React-shaped version: each row's handler closes over its own item.
items.map((item) => <button key={item.id} onClick={() => select(item.id)}>{item.title}</button>);
```

---

## 2. The event loop, promises and async/await

### Q2.1 — Explain the event loop in one paragraph.

**Short answer:** JavaScript runs one function at a time on a single thread. Long-running tasks (timers, I/O, network) are handed to the environment; when they finish, their callbacks are queued, and the loop runs the queue when the current call stack is empty — **microtasks (promises) before macrotasks (timers, events)**.

**Detailed explanation:** The consequence that matters in React: `await` does not block; it yields the thread and resumes in a microtask. So code after an `await` sees the world as it is *then*, not as it was when the function started — the root of "state didn't update after await". Also: microtasks run to completion before the browser paints, so a chain of `await`s can delay rendering; and a long synchronous loop blocks everything, including React's rendering.

**Example:**

```js
console.log('1 script start');
setTimeout(() => console.log('5 timeout'), 0);
Promise.resolve().then(() => console.log('3 microtask'));
queueMicrotask(() => console.log('4 microtask'));
console.log('2 script end');
// Output: 1, 2, 3, 4, 5 — synchronous first, then promises, then timers.
```

### Q2.2 — Callbacks vs promises vs async/await?

**Short answer:** They describe the same asynchronous work at different levels: callbacks are the raw form; a promise is a value representing a future result with `.then`/`.catch`; `async/await` is syntax over promises that makes sequential code read sequentially.

**Detailed explanation:** `async` functions always return a promise, `await` unwraps one (and throws if it rejects), and `try/catch` handles rejections like synchronous errors. Two rules that show up in real React code: an `async` function passed to `useEffect` is not allowed directly (return a cleanup function or call it inside a non-async wrapper), and `await` in a loop serialises the requests — sometimes correct, sometimes a performance bug (use `Promise.all`).

**Example:**

```js
// Callback → promise → async/await, same behaviour
function loadWithCallback(url, done) { fetch(url).then((r) => r.json()).then(done).catch(done); }

function loadWithPromise(url) { return fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))); }

async function load(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}
```

### Q2.3 — Why does `await` inside a `useEffect` need a wrapper?

**Short answer:** Because an `async` function returns a promise, and `useEffect` expects its callback to return either nothing or a cleanup function — a promise is neither, so React warns.

**Detailed explanation:** React needs to know how to clean up; a promise tells it nothing. The idiomatic answers are: define the async function inside the effect and call it (optionally with an `ignore`/`AbortController` guard), or move the fetching into a query library where cancellation and races are handled for you. The cleanup guard matters because the response may arrive after the component unmounted or after a newer request started.

**Example:**

```jsx
useEffect(() => {
  const controller = new AbortController();

  async function run() {
    try {
      const report = await fetchWeather(city, controller.signal);
      if (!controller.signal.aborted) setReport(report);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Request failed');
    }
  }

  void run();
  return () => controller.abort();          // ✅ cleanup, not a promise
}, [city]);
```

### Q2.4 — `Promise.all` vs `Promise.allSettled` vs `Promise.race` vs `Promise.any`?

**Short answer:** `all` fails fast if any promise rejects; `allSettled` always resolves with every outcome; `race` settles with the first to finish (success *or* failure); `any` resolves with the first success and rejects only if all fail.

**Detailed explanation:** Choosing wrong produces silent bugs. `Promise.all` for "all three panels must load" is right; for "show whatever loaded" it is wrong (one failure hides two successes) — that is `allSettled`. `Promise.race` is the tool for a timeout (race the request against a rejecting timer). `Promise.any` is for "any mirror will do".

**Example:**

```js
const [users, tasks] = await Promise.all([loadUsers(), loadTasks()]);            // both or nothing

const results = await Promise.allSettled([loadUsers(), loadTasks()]);           // per-panel states
results.forEach((result) => result.status === 'fulfilled' ? console.log(result.value) : console.error(result.reason));

const withTimeout = Promise.race([
  loadTasks(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out after 5s')), 5000)),
]);

const mirror = await Promise.any([loadFrom('https://a.example'), loadFrom('https://b.example')]);   // first success
```

### Q2.5 — What is the difference between `async` errors caught by `try/catch` and unhandled rejections?

**Short answer:** `try/catch` around an `await` catches that rejection; a rejection nobody awaits (a floating promise) becomes an unhandled rejection, which by default logs and can crash Node.

**Detailed explanation:** React applications create floating promises constantly (`onClick={() => save()}`), which is why the answer is "handle it where it happens" — a `.catch`, a `try/catch`, or a state update that renders an error. In `onClick`, an `async` handler returns a promise that React ignores; if it rejects, nothing catches it. Libraries solve this with an error callback (`mutate(data, { onError })`); hand-written code should not leave rejections unhandled.

**Example:**

```jsx
// ❌ Rejections vanish (and console noise in tests)
<button onClick={() => { removeTask(id); }}>Delete</button>

// ✅ Explicit handling in the component that knows what to show
<button onClick={() => {
  void removeTask(id).catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : 'Delete failed'));
}}>Delete</button>
```

---

## 3. `this`, scope and modern syntax

### Q3.1 — What is `this` in JavaScript?

**Short answer:** `this` is decided by *how a function is called*, not where it was defined: `obj.method()` → `obj`; a plain call `fn()` → `undefined` (strict) or `window` (sloppy); `new Fn()` → the new object; an arrow function → the `this` of the surrounding scope.

**Detailed explanation:** React interviews raise `this` for two reasons. First, class components: `onClick={this.handleClick}` loses `this`, which is why class code used `bind` or arrow-function class fields. Second, the *lesson*: function components avoid the entire category, because there is no instance and no `this` — closures replace it. Being able to explain that is a strong answer.

**Example:**

```js
const counter = {
  count: 0,
  increment() { this.count += 1; return this.count; },        // `this` = counter when called as counter.increment()
  delayedBroken() { setTimeout(function () { this.count += 1; }, 0); },   // `this` is not counter
  delayedFixed() { setTimeout(() => { this.count += 1; }, 0); },          // arrow captures the method's `this`
};

console.log(counter.increment());     // 1
const detached = counter.increment;
console.log(detached());              // NaN/TypeError: `this` is undefined
```

### Q3.2 — Real-world React example: `this` in a class component

**Short answer:** The handler must be bound (or defined as an arrow class field) so that `this` refers to the component instance when React calls it.

**Detailed explanation:** React calls your handler as a plain function, so an unbound method loses `this`. Class fields with arrow functions capture the instance at construction. This is historical knowledge — the modern answer is "function components made this problem disappear" — but you will be asked to read old code, and understanding it prevents cargo-cult `bind(this)` in code that does not need it.

**Example:**

```jsx
// Historical (class) — note the arrow class field
class LegacyCounter extends React.Component {
  state = { count: 0 };
  handleClick = () => this.setState((s) => ({ count: s.count + 1 }));   // arrow field → bound to the instance
  render() { return <button onClick={this.handleClick}>{this.state.count}</button>; }
}

// Modern equivalent — no `this` anywhere
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

### Q3.3 — `var`, `let`, `const` — what are the differences that matter?

**Short answer:** `var` is function-scoped and hoisted as `undefined`; `let`/`const` are block-scoped and hoisted but unusable before initialisation (temporal dead zone); `const` prevents reassignment of the binding, not mutation of the value.

**Detailed explanation:** React code uses `const` for almost everything, `let` for loop counters and values that truly change, and `var` never. The mutable-`const` subtlety matters: `const todos = []` then `todos.push(x)` is legal and is *exactly* the state mutation React cannot see — the fix is a new array, not a different keyword.

**Example:**

```js
const todos = [];
todos.push('write notes');           // legal: the array is mutated, the binding is unchanged
console.log(todos);                  // ['write notes']

// React: mutating state is invisible; create a new value instead
setTodos((current) => [...current, 'write notes']);
```

### Q3.4 — What do destructuring and spread/rest actually do?

**Short answer:** Destructuring extracts values from arrays/objects into variables (with defaults and renaming); the spread operator copies enumerable properties into a new array/object; the rest parameter collects "the remaining" items. They are syntax over the same operations you could write by hand.

**Detailed explanation:** React code is built on them: `const { data, error, isPending } = useQuery(...)`, `({ id, title }) => ...` in components, `setState((s) => ({ ...s, open: true }))` for immutable updates, `const [first, ...rest] = list` for head/tail. The important distinction: **spread is one level deep** — nested objects are shared by reference, which is why "deep" state updates need spread at each level (or Immer via Redux Toolkit). Also note the array-destructuring-with-a-rename pattern (`const { 0: a, 1: b } = arr`, rarely useful) and default values that only apply for `undefined`, not `null`.

**Example:**

```js
// Destructuring with defaults and renaming
const { title = 'Untitled', author: writer, tags: [primary] = [] } = { title: 'Dune', author: 'FH', tags: ['scifi'] };

// Immutable nested update (one level at a time)
const state = { user: { name: 'Asha', prefs: { theme: 'light' } }, open: true };
const next = { ...state, user: { ...state.user, prefs: { ...state.user.prefs, theme: 'dark' } } };
console.log(next.user.prefs.theme, state.user.prefs.theme);   // dark light — the original is untouched

// Rest
const [head, ...tail] = [1, 2, 3];
function sum(...numbers) { return numbers.reduce((total, n) => total + n, 0); }
```

### Q3.5 — Optional chaining and nullish coalescing?

**Short answer:** `?.` stops evaluation when the value is `null`/`undefined` instead of throwing; `??` supplies a default only for `null`/`undefined` (unlike `||`, which also replaces `0`, `''` and `false`).

**Detailed explanation:** React data is often optional (`session?.user.name`), and this is where `??` versus `||` produces real bugs: `points || 1` turns a legitimate `0` into `1`, while `points ?? 1` keeps `0`. The other rule: optional chaining does not protect the *left* operand when the expression is used as a call — `obj?.fn()` is safe, but `obj.fn?.()` and `obj?.fn?.()` mean different things.

**Example:**

```ts
interface Session { user?: { name?: string }; roles: string[] }

const session: Session = { roles: [] };
console.log(session.user?.name ?? 'guest');          // 'guest'
console.log(session.roles?.[0] ?? 'none');           // 'none'

const points = 0;
console.log(points || 1);                            // 1  ❌ a real value was replaced
console.log(points ?? 1);                            // 0  ✅
```

---

## 4. Array methods (the ones you use inside render)

### Q4.1 — `map` vs `forEach`?

**Short answer:** `map` returns a new array of the same length (use it to render); `forEach` returns `undefined` and is for side effects only.

**Detailed explanation:** The React-specific reason: JSX needs an array, so `items.forEach(...)` inside render produces nothing visible — a very common beginner error that TypeScript cannot always catch. `map` also gives you the natural place for a `key`.

**Example:**

```jsx
// ❌ renders nothing
{items.forEach((item) => <li key={item.id}>{item.title}</li>)}

// ✅ returns the array React renders
<ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
```

### Q4.2 — `filter` and `find`?

**Short answer:** `filter` returns *all* matching items as a new array; `find` returns the *first* match (or `undefined`).

**Detailed explanation:** `find` + `undefined` is the source of "cannot read properties of undefined"; the safe pattern is to check the result or to use a default (`tasks.find(...) ?? emptyTask`). For rendering a detail page from a list, remember that a server-authoritative detail often needs its own request (the item may not be in the loaded page).

**Example:**

```ts
const open = tasks.filter((task) => task.status !== 'done');
const first = tasks.find((task) => task.id === id);
const safe = tasks.find((task) => task.id === id) ?? { id, title: 'New task', status: 'todo' as const };
```

### Q4.3 — `reduce`, and when is it the wrong tool?

**Short answer:** `reduce` folds an array into one value (sum, map, group). It is the wrong tool when a simpler method says what you mean — `filter`, `map`, `some`, `every`, `find` — or when it makes the reader decode an accumulator.

**Detailed explanation:** `reduce` is the right answer for totals and grouping; it is the wrong answer for "does any item match" (`some`) or "are all items valid" (`every`). Interviewers like the grouping example because it shows you understand the accumulator's type — and in React, derived values like these belong in render (or a `useMemo`) rather than in state.

**Example:**

```ts
const byStatus = tasks.reduce<Record<string, Task[]>>((groups, task) => {
  (groups[task.status] ??= []).push(task);
  return groups;
}, {});

const totalPoints = tasks.reduce((sum, task) => sum + task.points, 0);
const hasOverdue = tasks.some((task) => task.dueAt < Date.now());
const allEstimated = tasks.every((task) => task.points > 0);
```

### Q4.4 — `sort` mutates. How does that break React?

**Short answer:** `Array.prototype.sort` sorts in place and returns the same array. Sorting state directly mutates it, so React sees no change; always sort a copy.

**Detailed explanation:** The same rule applies to `reverse`, `push`, `pop`, `splice` and `shift`. The React consequence is a UI that does not update after the "sort" button, or a cache entry silently reordered. The fix is `[...items].sort(...)` or `items.toSorted(...)` (a non-mutating copy, available in modern browsers and Node 20+).

**Example:**

```ts
setTasks((current) => [...current].sort((a, b) => a.title.localeCompare(b.title)));   // ✅ new array
// setTasks((current) => current.sort(...));                                          // ❌ same array, same reference
```

### Q4.5 — Why is mutating an object `const`-legal but React-illegal?

**Short answer:** JavaScript has no immutability by default — `const` only freezes the binding. React compares references (`Object.is`) to decide whether something changed, so mutation is invisible.

**Detailed explanation:** This is the single most important JavaScript fact for React: *new reference = change; same reference = no change*. It is why state updates use spread/map/filter, why `useMemo`/`memo` dependencies are compared with `Object.is`, and why `useEffect` does not re-run when you mutate an object in its dependency array. `Object.freeze` in development catches some of it, but the discipline is what prevents the bugs.

**Example:**

```tsx
function Todos() {
  const [todos, setTodos] = useState([{ id: '1', title: 'Write', done: false }]);

  const toggleBroken = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (todo !== undefined) { todo.done = !todo.done; setTodos(todos); }      // ❌ same array → no re-render
  };

  const toggle = (id: string) => {
    setTodos((current) => current.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));   // ✅ new objects
  };

  return <button type="button" onClick={() => toggle('1')}>Toggle</button>;
}
```

---

## 5. Modules, equality and the things people get wrong in reviews

### Q5.1 — What is the difference between `==` and `===`?

**Short answer:** `===` compares type and value with no coercion; `==` coerces types first, producing surprising results. Use `===` (or `Object.is`) everywhere, with the one exception `value == null`, which tests for both `null` and `undefined`.

**Detailed explanation:** In React code the visible cases are: comparing ids (both strings — fine either way, but be consistent), comparing numbers from inputs (a `string` from `value` versus a `number` in state is a real bug source), and `NaN` (`Object.is(NaN, NaN)` is true; `NaN === NaN` is false). State and props comparisons use `Object.is`, so knowing it is what a senior answer adds.

**Example:**

```js
console.log('5' == 5);            // true
console.log('5' === 5);           // false
console.log(NaN === NaN);         // false
console.log(Object.is(NaN, NaN)); // true
console.log(value == null);       // true for both null and undefined — the idiomatic null check
```

### Q5.2 — How do ES modules differ from CommonJS?

**Short answer:** ESM (`import`/`export`) is static — the graph is known before execution, which enables tree shaking and live bindings; CommonJS (`require`) is dynamic and synchronous. React tooling is ESM-first today.

**Detailed explanation:** Static analysis is what lets Vite/Rollup remove unused exports; default versus named exports affect how libraries are imported and how easy refactoring is; and mixing the two (a CJS-only dependency in an ESM app) produces the interop warnings you will see in a Vite dev server. In React files, the practical rules are: one component per file with a named export, `import type` for types so they never become runtime imports, and no side effects at module scope that depend on the browser (they run before React mounts).

**Example:**

```ts
// named exports: better for treeshaking and refactors
export function TaskList() { /* … */ }
export interface Task { id: string }

// import type is erased at build time
import type { Task } from './types';
import { TaskList } from './TaskList';
```

### Q5.3 — Shallow vs deep equality (and why React uses shallow)?

**Short answer:** Shallow equality compares top-level values/references; deep equality walks the whole structure. React uses `Object.is` per element (shallow) because it is fast and predictable — which is exactly why you create new references when something changes.

**Detailed explanation:** Every memoisation comparison (`memo`, `useMemo`, `useEffect` deps) is shallow. So `{ a: 1 }` recreated each render is a *new* object and defeats memoisation, even though it is "equal". This is also the reason `setState({ ...state })` always re-renders: a new reference is a change by definition.

**Example:**

```tsx
// ❌ A new object every render → memo(Row) never bails out
<Row key={task.id} item={task} options={{ showPoints: true }} />

// ✅ Stable reference (hoisted, or useMemo if it depends on props)
const OPTIONS = { showPoints: true };
<Row key={task.id} item={task} options={OPTIONS} />
```

### Q5.4 — What is a "truthy/falsy" trap in JSX?

**Short answer:** `0`, `''` and `NaN` are falsy but render as visible text in JSX when used with `&&`, so `{count && <Badge />}` prints `0`. Use a comparison (`count > 0 && …`) or a ternary.

**Detailed explanation:** JSX renders strings and numbers, and skips `null`, `undefined`, `false` and `true`. So `{0 && <X />}` renders `0`, while `{false && <X />}` renders nothing. The same trap appears in `||` defaults (use `??`) and in `value || ''` with numeric inputs.

**Example:**

```jsx
{count && <Badge label="new" />}        {/* renders "0" when count is 0 ❌ */}
{count > 0 && <Badge label="new" />}    {/* ✅ */}
{count > 0 ? <Badge label="new" /> : null}
```

### Q5.5 — Which array/object copies are shallow, and when does that bite?

**Short answer:** Spread, `Object.assign`, `slice`, `map`, `filter` and destructuring all copy one level. Nested objects/arrays are shared, so changing them changes the original — which is why "immutable update" must be applied at each level you touch.

**Detailed explanation:** The React consequence is a bug where updating a nested field appears not to work (same top-level reference for the *other* branch) or a stale cache entry that changes when you mutate something unrelated. If this happens often in a codebase, that is the signal to adopt Immer (Redux Toolkit includes it) rather than to write five levels of spread.

**Example:**

```ts
const original = { user: { name: 'Asha' }, tags: ['a'] };
const shallow = { ...original };
shallow.user.name = 'Vik';                  // also changes original.user.name (shared reference)
console.log(original.user.name);            // 'Vik'

// Correct immutable update of a nested field:
const next = { ...original, user: { ...original.user, name: 'Vik' } };
console.log(original.user.name);            // 'Asha'
```

---

## 6. Rapid-fire round

| # | Question | One-line answer |
| --- | --- | --- |
| 1 | Is JavaScript single-threaded? | Yes for execution; workers and the platform (I/O, timers) provide concurrency |
| 2 | What is a microtask? | A promise/`queueMicrotask` callback — runs before timers and before paint |
| 3 | `setTimeout(fn, 0)` vs `Promise.resolve().then(fn)`? | The promise callback runs first |
| 4 | What does `async` return? | Always a promise (`return 1` → `Promise<1>`) |
| 5 | Does `await` block the thread? | No — it suspends the function and frees the thread |
| 6 | `??=`? | Assign only when the target is `null`/`undefined` |
| 7 | What is `structuredClone` for? | Deep-copying data without references (not functions) |
| 8 | `Object.freeze`? | Prevents adding/removing/mutating properties (shallow) |
| 9 | `Array.from({ length: 3 }, (_, i) => i)`? | `[0, 1, 2]` — the idiom for generating placeholder rows |
| 10 | `at(-1)`? | The last element, without `length - 1` |
| 11 | `toSorted`, `toReversed`, `toSpliced`? | Non-mutating versions (Node 20+, modern browsers) |
| 12 | What is a temporal dead zone? | The period between hoisting and initialisation where `let`/`const` throw |
| 13 | Is `NaN === NaN`? | No — use `Number.isNaN` / `Object.is` |
| 14 | `0.1 + 0.2 === 0.3`? | No (floating point) — compare with a tolerance or work in integers (paise/cents) |
| 15 | What is a debounce? | Run once after the calls stop (search-as-you-type) |
| 16 | Throttle? | Run at most once per interval (scroll handlers) |
| 17 | `JSON.parse(JSON.stringify(x))`? | A quick deep clone that loses `Date`s, `Map`s and `undefined` |
| 18 | What is a generator? | A function that yields lazily (`function*`) — rare in React app code |
| 19 | `WeakMap` use case? | Caches keyed by objects without preventing garbage collection |
| 20 | What is a Symbol? | A unique, non-string property key (React uses one internally) |

---

## 7. Summary — how to answer JavaScript questions in a React interview

- **Connect every answer to React.** Closures power hooks; the event loop explains "after await the state is old"; immutability explains why `map`/spread are everywhere; `this` explains why class components needed `bind` and why function components do not.
- **Give the mechanism, then the consequence.** "Microtasks before macrotasks" is a fact; "so a chain of `await`s can delay paint" is understanding.
- **Say the version.** `toSorted`/`at` need modern runtimes; `??` and optional chaining are ES2020; React 19's action APIs are the newest moving part.
- **Quote your own bugs.** "Our search box fired a request per keystroke until we debounced it and aborted the previous fetch" is worth more than a definition.
- **Do not pretend to know trivia.** "I would check `Object.is` semantics" is a better answer than a confident wrong one — and the interviewer is usually testing how you reason, not whether you memorised `Array.prototype.keys`.

---

**What's next →** [`03-typescript-interview.md`](./typescript-interview.md) covers the TypeScript questions that come up in React interviews: `interface` versus `type`, generics in components and hooks, unions and discriminated states, narrowing, utility types, and the errors you will actually see (`TS2322`, `TS2339`, `TS7053`, `TS18048`).
