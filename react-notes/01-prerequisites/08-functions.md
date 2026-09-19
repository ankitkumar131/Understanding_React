# 08 — Functions, Callbacks and Closures

> **Part 1 · Prerequisites · File 8 of 11**
>
> **Why this file exists:** every React component is a function. Every event
> handler is a callback. Every hook is a function. And the single most confusing
> React bug — "my state is stale inside `useEffect`" — is a *closure* problem.
> This file teaches functions deeply enough that closures and `this` stop being
> mysterious.

---

## 1. Ways to define a function

```js
// 1. Function declaration — hoisted, so you can call it before its definition
function add(a, b) {
  return a + b;
}

// 2. Function expression — assigned to a variable; NOT hoisted for use
const subtract = function (a, b) {
  return a - b;
};

// 3. Named function expression — the name is only visible inside itself
const multiply = function multiply(a, b) {
  return a * b;
};

// 4. Arrow function (file 4) — the modern default for callbacks
const divide = (a, b) => a / b;

// 5. Method shorthand — inside objects
const calculator = {
  power(base, exponent) {
    return base ** exponent;
  },
};

// 6. Immediately Invoked Function Expression (IIFE) — runs once, immediately
const config = (() => ({ retries: 3, timeout: 5000 }))();
```

All six are functions. The differences that actually matter:

| | Hoisted (callable before definition) | Has its own `this` | Can be a constructor (`new`) |
| --- | --- | --- | --- |
| `function` declaration | ✅ yes | ✅ yes | ✅ yes |
| function expression | ❌ no | ✅ yes | ✅ yes |
| arrow function | ❌ no | ❌ **no** (inherits) | ❌ no |

**Practical guidance for React:**

- Use **function declarations** for components and for top-level helper functions
  in a module: they read clearly and hoist, so order does not matter.
- Use **arrow functions** for callbacks, hooks, and small transformations.
- Avoid the IIFE form, except in module-level config where you want a computed
  constant.

```tsx
// Typical React file structure
import { useState } from 'react';

// A helper: hoisted, readable, no `this` concerns
function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

// A small presentational component: arrow with a concise body
const Price = ({ amount }: { amount: number }) => <span>{formatPrice(amount)}</span>;

// A stateful component: function declaration (the React docs' style)
export function Cart() {
  const [items, setItems] = useState<string[]>([]);
  const addItem = () => setItems((previous) => [...previous, `item-${previous.length + 1}`]);

  return (
    <div>
      <Price amount={4999} />
      <button type="button" onClick={addItem}>
        Add
      </button>
      <p>{items.length} items</p>
    </div>
  );
}
```

> 💡 Consistency beats dogma. Whichever style your team uses, keep it consistent.
> The default in most modern codebases and in React's own documentation is
> `function ComponentName() {}` for components.

---

## 2. Parameters, arguments, and return values

```js
function greet(name, greeting = 'Hello') {
  return `${greeting}, ${name}!`;
}

greet('Ada');                  // "Hello, Ada!"
greet('Ada', 'Hi');            // "Hi, Ada!"
greet('Ada', undefined);       // "Hello, Ada!"  ← undefined triggers the default
greet();                       // "Hello, undefined!" ⚠️ name has no default
```

- **Parameters** are the names in the definition; **arguments** are the values you
  pass. (People mix these up constantly; now you know the difference.)
- **Missing arguments become `undefined`**, which is why `greet()` prints
  `"Hello, undefined!"` — defaults are not automatic.

### `return` behaviour

```js
function noReturn() {
  // no return statement
}
console.log(noReturn());       // undefined

function earlyReturn(role) {
  if (role !== 'admin') return 'Access denied';  // stops here
  return 'Welcome, admin';                        // unreachable for non-admins
}

function returnsNothing(message) {
  console.log(message);   // side effect
  // implicitly returns undefined
}
```

`return` without a value returns `undefined`. A function that only logs or sets
DOM state "returns nothing" — in TypeScript that is written `void`.

### Optional and rest parameters

```js
// Optional in TS: `count?` — may be omitted
function repeat(text: string, count?: number) {
  return count ? text.repeat(count) : text;
}

// Rest: any number of arguments collected into an array
function sum(...values: number[]) {
  return values.reduce((total, n) => total + n, 0);
}
sum(1, 2, 3);      // 6
sum();             // 0

// Destructuring parameters (file 5)
function createUser({ name, role = 'user' }: { name: string; role?: string }) {
  return { name, role };
}
```

### The `arguments` object (legacy — avoid)

```js
function legacy() {
  console.log(arguments);      // array-LIKE object, not a real array
  // console.log(arguments.map(...)); // ❌ TypeError: arguments.map is not a function
}
legacy(1, 2, 3);
```

Use rest parameters (`...values`) instead: they give you a **real array**, work in
arrow functions, and are typed by TypeScript.

---

## 3. Functions are values

This is the sentence that unlocks React: **in JavaScript, functions are values**
like numbers and strings. You can store them, pass them, and return them.

```js
// Stored in a variable
const double = (n) => n * 2;

// Stored in an object
const math = { double, triple: (n) => n * 3 };

// Stored in an array
const operations = [double, math.triple];

// Passed to another function
function applyTwice(fn, value) {
  return fn(fn(value));
}
applyTwice(double, 3);   // 12

// Returned from another function
function makeMultiplier(factor) {
  return (value) => value * factor;
}
const triple = makeMultiplier(3);
triple(5);               // 15
```

A function that takes or returns a function is called a **higher-order
function**. `map`, `filter` and `reduce` are higher-order functions — that is all
that phrase means.

### The React connection, made explicit

```tsx
// A React component receives a function as a prop and calls it later
interface ButtonProps {
  label: string;
  onClick: () => void;     // ← a function type: takes nothing, returns nothing
}

function Button({ label, onClick }: ButtonProps) {
  return (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  );
}

// At the call site, we hand it a function
function App() {
  const handleSave = () => {
    console.log('saving…');
  };

  return <Button label="Save" onClick={handleSave} />;   // passing, NOT calling
}
```

Compare carefully:

```tsx
<Button onClick={handleSave} />          // ✅ pass the function
<Button onClick={handleSave()} />        // ❌ CALLS it during render
<Button onClick={() => handleSave()} />  // ✅ pass a new function that calls it later
```

The third form exists because sometimes you need to pass **arguments**:

```tsx
{items.map((item) => (
  <Button key={item.id} label={item.name} onClick={() => removeItem(item.id)} />
))}
```

Without the arrow, `removeItem(item.id)` would run immediately while rendering —
and worse, `map` would run it once per item, every render.

---

## 4. Callbacks

A **callback** is a function you give to someone else, to be called later.

```js
// A callback passed to an array method
[1, 2, 3].forEach((n) => console.log(n));

// A callback passed to a timer
setTimeout(() => console.log('later'), 1000);

// A callback passed to a listener (the browser calls it on every click)
document.querySelector('#save')?.addEventListener('click', () => console.log('clicked'));
```

**Callbacks run *later*, with arguments chosen by the caller.**

```js
function doLater(callback) {
  const result = 42;
  callback(result);       // the caller decides what to pass
}

doLater((value) => console.log(value)); // 42
```

### Callback style: named vs inline

```js
// Named: reusable, testable, easier to read in long components
function handleSubmit(event) {
  event.preventDefault();
  // ...
}
<form onSubmit={handleSubmit}>

// Inline: fine for one-liners
<button onClick={() => setOpen(true)}>

// Inline with a body: usually a sign to extract a named function
<button onClick={() => {
  const next = computeNext();
  setValue(next);
  log('clicked');
}}>
```

### Error-first callbacks (the old Node convention)

```js
fs.readFile('data.json', (error, data) => {
  if (error) {
    console.error(error);
    return;                  // guard clause
  }
  console.log(data);
});
```

You will see this shape in older libraries. Modern code uses promises and
`async`/`await` (files 10 and 11), which do the same job more readably.

### Calling back with typed arguments (TypeScript)

```ts
type OnSelect = (id: string, label: string) => void;

function List({ onSelect }: { onSelect: OnSelect }) {
  return <button onClick={() => onSelect('p1', 'Keyboard')}>Select</button>;
}
```

Typing the callback makes both sides agree: the component promises to call it with
`(string, string)`, and the caller must provide a function that accepts them.

---

## 5. Closures

> **Definition:** a closure is a function that *remembers* the variables from the
> scope in which it was created, even after that scope has finished executing.

This sounds abstract. It is the most concretely useful idea in JavaScript.

```js
function createCounter() {
  let count = 0;                 // local to createCounter

  return function increment() {  // captures `count`
    count += 1;
    return count;
  };
}

const counter = createCounter();
console.log(counter()); // 1
console.log(counter()); // 2
console.log(counter()); // 3
```

**Why does `count` survive?** Normally, local variables disappear when a function
returns. But `increment` still *references* `count`, so JavaScript keeps that
variable alive as long as the inner function exists. The function "closes over"
its environment.

`count` is now **private**: nothing outside `createCounter` can touch it.

```js
console.log(typeof count);      // "undefined" — no access from outside
console.log(counter.count);     // undefined
```

### Closures in loops — the classic bug

```js
// ❌ All three handlers print 3
for (var i = 1; i <= 3; i++) {
  setTimeout(() => console.log(i), 0);
}

// ✅ `let` creates a new binding per iteration
for (let i = 1; i <= 3; i++) {
  setTimeout(() => console.log(i), 0); // 1, 2, 3
}

// ✅ Or capture the value explicitly
for (var j = 1; j <= 3; j++) {
  ((captured) => setTimeout(() => console.log(captured), 0))(j);
}
```

With `var`, there is **one** variable `i` shared by every closure; by the time the
timers run, the loop has finished and `i` is `3`. With `let`, each iteration gets
its own `i`. (This is one of the reasons `let` exists.)

### Closures in React: why they matter

A React function component **is a closure**. Every render creates a new function
with its own captured values:

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  // This arrow function closes over THIS render's `count`
  const logCount = () => console.log(`Count is ${count}`);

  return (
    <>
      <button type="button" onClick={() => setCount(count + 1)}>+1</button>
      <button type="button" onClick={logCount}>Log</button>
    </>
  );
}
```

Each click on `+1` triggers a re-render → the component function runs again →
`count` has a new value → a **new** `logCount` closure is created holding that new
value. The old closure still holds the old value. Both exist; only one is
attached to the current rendered button.

**The bug this causes — stale state.** This is the pattern to recognise:

```tsx
function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // ⚠️ This closure captured `count` from the FIRST render — it is always 0.
      console.log(`count is ${count}`);
      setCount(count + 1);          // ⚠️ also stale: always sets 0 + 1 = 1
    }, 1000);

    return () => clearInterval(id);
  }, []);                            // empty deps → effect runs once → closure never updated

  return <p>{count}</p>;
}
```

The UI would jump to 1 and then stop. Why? The interval callback was created
during the first render, when `count` was `0`. Nothing ever recreates it, because
the effect's dependency array is empty.

**Two correct fixes:**

```tsx
// Fix 1: functional update — no need to read `count` at all
setCount((previous) => previous + 1);

// Bonus: reading the latest value without re-running the effect
// (useRef is explained in Part 4; this is a preview)
const countRef = useRef(count);
countRef.current = count;
```

```tsx
// Fix 2: list `count` as a dependency so the effect re-runs with a fresh closure
useEffect(() => {
  const id = setInterval(() => setCount((previous) => previous + 1), 1000);
  return () => clearInterval(id);
}, []);  // with the functional update, we genuinely need no dependencies
```

> 🔍 **The mental model to keep:** *every render has its own variables, and every
> function created during that render closes over those variables.* When React
> code behaves "one step behind", you are looking at a stale closure. The two
> antidotes are **functional updates** and **correct dependency arrays** — both
> covered properly in Part 4.

### Closures create private state (a pattern you will write yourself)

```js
function createIdGenerator(prefix = 'id') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const nextUserId = createIdGenerator('user');
nextUserId(); // 'user-1'
nextUserId(); // 'user-2'

const nextTodoId = createIdGenerator('todo');
nextTodoId(); // 'todo-1'  ← independent counter
```

```js
// A one-time function: runs its body only on the first call
function once(fn) {
  let called = false;
  let result;

  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}

const initialize = once(() => {
  console.log('initialising…');   // prints only once
  return { ready: true };
});

initialize(); // logs, returns { ready: true }
initialize(); // silent, returns the cached result
```

That is the same idea as `useMemo`/`useRef` (Part 4): remember something between
calls.

### Debounce — the closure pattern behind every search box

```js
function debounce(fn, delayMs = 300) {
  let timerId;                    // captured in the closure

  return (...args) => {
    clearTimeout(timerId);        // cancel the previous scheduled call
    timerId = setTimeout(() => fn(...args), delayMs);
  };
}

const search = debounce((query) => console.log(`searching ${query}`), 300);

search('r');
search('re');
search('rea');   // only this one runs, 300ms after typing stops
```

You will rebuild this as a `useDebounce` hook in Part 4 — and understanding that
`timerId` lives in a closure is exactly what makes the hook work.

---

## 6. `this` (the part that used to be everyone's nightmare)

`this` is a keyword whose value depends on **how a function is called**, not where
it is defined. Modern React rarely needs it, but you must recognise it in older
code.

```js
const user = {
  name: 'Ada',
  sayName() {
    console.log(this.name);
  },
};

user.sayName();               // "Ada"    ← called as a method → this = user

const detached = user.sayName;
detached();                   // undefined (or the global object in non-strict mode)
                              // ⚠️ called without an object → this is not user
```

The four rules, in priority order:

```js
// 1. `new` binding — a constructor call
function Person(name) { this.name = name; }
const p = new Person('Ada');       // this = the new object

// 2. Explicit binding — call / apply / bind
user.sayName.call({ name: 'Grace' });   // "Grace"
const bound = user.sayName.bind({ name: 'Alan' });
bound();                                 // "Alan"

// 3. Implicit binding — called as a method
user.sayName();                          // this = user

// 4. Default binding — a plain call
function whoAmI() { console.log(this); }
whoAmI();                                // undefined in modules/strict mode
```

**Arrow functions ignore all four rules** — they take `this` from the surrounding
scope:

```js
const timer = {
  seconds: 0,

  startBroken() {
    setInterval(function () {
      // ❌ this is NOT timer here
      // this.seconds++;
    }, 1000);
  },

  startWorking() {
    setInterval(() => {
      this.seconds++;   // ✅ arrow inherits `this` from startWorking → timer
    }, 1000);
  },
};
```

**React relevance:**

1. **Event handlers:** `this` inside a handler attached to a DOM element is the
   element (or `undefined` in strict mode), *not* your component. That is why
   class components needed `.bind(this)` — and one of the reasons hooks replaced
   them.
2. **Class components (legacy):**

```tsx
// Old class component — you may meet this in existing code
class Counter extends React.Component {
  state = { count: 0 };

  // Class fields with arrows avoid the binding problem entirely
  handleClick = () => {
    this.setState((previous) => ({ count: previous.count + 1 }));
  };

  render() {
    return <button onClick={this.handleClick}>{this.state.count}</button>;
  }
}
```

```tsx
// The modern equivalent — no `this` anywhere
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

> 🏭 **Rule for React work today:** do not use `this` in components. If you are
> reading legacy class code, the pattern to remember is "arrow class fields bind
> `this` automatically". Part 4's hooks replace all of it.

---

## 7. Pure functions (and why React insists on them)

> **A pure function:** given the same inputs, it always returns the same output,
> and it does not change anything outside itself.

```js
// ✅ Pure: output depends only on arguments, nothing outside is touched
const addTax = (price, rate) => Math.round(price * (1 + rate));

// ❌ Impure: depends on outside state (Date.now())
const makeId = () => `id-${Date.now()}`;

// ❌ Impure: mutates its argument
function addItem(cart, item) {
  cart.push(item);     // the caller's array changed!
  return cart;
}

// ✅ Pure: returns a new array
function addItemPure(cart, item) {
  return [...cart, item];
}
```

**Why React cares so much:** components are called **many times**, sometimes twice
in a row (StrictMode development, Part 10), sometimes with the same props. If a
component mutates state or does something irreversible during render (like sending
a request), the results are unpredictable. React's rule is:

```text
A component's render must be pure:
  same props + same state  →  same JSX
and it must not modify anything that already existed.
```

**Side effects belong in event handlers and effects:**

```tsx
// ❌ Wrong: a request fired during render (runs on every render, possibly twice)
function Profile({ userId }: { userId: string }) {
  fetch(`/api/users/${userId}`);   // side effect in render!
  return <div>{userId}</div>;
}

// ✅ Right: fetch inside an effect (Part 4)
function Profile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}`)
      .then((response) => response.json())
      .then((data: User) => {
        if (!cancelled) setUser(data);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <div>{user?.name ?? 'Loading…'}</div>;
}
```

```tsx
// ✅ Right: user-triggered side effect in an event handler
function SaveButton({ data }: { data: FormData }) {
  const handleClick = async () => {
    await fetch('/api/save', { method: 'POST', body: JSON.stringify(data) });
  };

  return <button type="button" onClick={handleClick}>Save</button>;
}
```

**Also avoid impure helpers inside render:**

```tsx
// ⚠️ A new value on every render — invisible in the UI, but breaks memoization
const id = Math.random().toString(36);

// ✅ Stable identity: create it once (Part 4 explains useRef/useState)
const [id] = useState(() => crypto.randomUUID());
```

---

## 8. Recursion (briefly — you will meet it in trees and JSON rendering)

```js
function factorial(n) {
  if (n <= 1) return 1;      // base case: stops the recursion
  return n * factorial(n - 1); // recursive case: smaller problem
}

factorial(5); // 120
```

Every recursive function needs a **base case**, or you get
`RangeError: Maximum call stack size exceeded`.

**Where React developers actually use recursion:** rendering tree data (a file
tree, a comment thread, a nested menu):

```tsx
interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

function Tree({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul>
      {nodes.map(({ id, label, children }) => (
        <li key={id}>
          {label}
          {children && children.length > 0 && <Tree nodes={children} />}
        </li>
      ))}
    </ul>
  );
}
```

A component that renders itself for each level of the data. That is the main use
of recursion in UI code.

---

## 9. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `onClick={handleClick()}` | Runs during render; often an infinite loop | `onClick={handleClick}` |
| `onClick={handleClick(id)}` in a loop | All items act immediately, on every render | `onClick={() => handleClick(id)}` |
| Forgetting `return` in a callback with braces | `undefined` results | concise body, or add `return` |
| Using `arguments` in an arrow function | `ReferenceError: arguments is not defined` | rest parameters `(...args)` |
| Stale closure in `setInterval`/`useEffect` | Value frozen at the first render | functional update / fix dependencies |
| `this` inside a callback passed to `setTimeout` | `undefined`, or the wrong object | use an arrow function |
| Mutating a parameter inside a "helper" | Caller's data changes unexpectedly; React does not re-render | return new data |
| Side effects (fetch, `Math.random`, DOM writes) during render | Double requests in StrictMode, unstable UI | move to an event handler or `useEffect` |
| `function` declaration inside a component when identity matters | New function every render → memoization fails | `useCallback`, or move it outside the component |
| Comparing function props with `===` | Always `false` for inline arrows; memoization never works | `useCallback` (Part 4/10) |

---

## 10. Practice exercises

### Beginner

Predict the outputs, then verify.

```js
function makeGreeter(greeting) {
  return (name) => `${greeting}, ${name}!`;
}

const greetHello = makeGreeter('Hello');
const greetHi = makeGreeter('Hi');
console.log(greetHello('Ada'));
console.log(greetHi('Grace'));

function outer() {
  let value = 0;
  return {
    increment: () => ++value,
    current: () => value,
  };
}

const counter = outer();
counter.increment();
counter.increment();
console.log(counter.current());
console.log(typeof value);

for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log('var:', i), 0);
}

for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log('let:', j), 0);
}

const obj = {
  name: 'Ada',
  arrow: () => console.log(this?.name),
  method() {
    console.log(this.name);
  },
};
obj.method();
```

**Solution**

```text
Hello, Ada!        greetHello remembered greeting = 'Hello'
Hi, Grace!         greetHi remembered greeting = 'Hi'
2                  value is private to the closure, shared by both functions
"undefined"        `value` is not visible outside outer()
var: 3
var: 3
var: 3             ⚠️ one shared `var i`; by the time timers run, the loop is done
let: 0
let: 1
let: 2             ✅ each iteration has its own `j`
"Ada"              `method()` is called as obj.method → this = obj
```

The `obj.arrow()` case is not printed because `arrow` is never called — but if it
were, `this` would be the *module* scope, not `obj`, because arrow functions do
not bind `this` by call site. That is the whole difference between the two
properties.

**The lesson:** closures remember values from creation time. When a function's
result "looks one render behind", that is not a JavaScript bug — it is a closure
doing exactly what closures do.

### Intermediate

Write `utilities.js` with these higher-order functions, all pure, each returning a
new function that uses a closure:

1. `createCounter(start = 0)` → `{ increment, decrement, reset, value }` where
   `value()` returns the current number.
2. `once(fn)` → a function that calls `fn` at most once and returns the cached
   result afterwards.
3. `debounce(fn, delay)` → as shown earlier. Also support a `.cancel()` method.
4. `throttle(fn, interval)` → calls `fn` at most once per `interval`, ignoring
   further calls until the interval passes.
5. `memoize(fn)` → caches results by a stringified key. Include a `.cache` getter
   for debugging and a `.clear()` method.
6. `withRetry(asyncFn, { attempts = 3, baseDelayMs = 100 })` → retries a failing
   async function with exponential backoff, and stops immediately if the error has
   `permanent === true`.

Then a `main()` demonstrating each (use small delays so it finishes quickly).

**Solution**

```text
js-playground/utilities.js
```

```js
// ---------------------------------------------------------------- 1. counter
function createCounter(start = 0) {
  let value = start;                       // private, closure-scoped

  return {
    increment(by = 1) {
      value += by;
      return value;
    },
    decrement(by = 1) {
      value -= by;
      return value;
    },
    reset() {
      value = start;
      return value;
    },
    value: () => value,                    // arrow: reads the same closure variable
  };
}

// ---------------------------------------------------------------- 2. once
function once(fn) {
  let called = false;
  let result;

  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}

// ---------------------------------------------------------------- 3. debounce
function debounce(fn, delay = 300) {
  let timerId = null;

  const debounced = (...args) => {
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return debounced;
}

// ---------------------------------------------------------------- 4. throttle
function throttle(fn, interval = 300) {
  let lastCallTime = 0;
  let timerId = null;
  let pendingArgs = null;      // the arguments of the LATEST skipped call

  const invoke = () => {
    lastCallTime = Date.now();
    timerId = null;

    const args = pendingArgs;
    pendingArgs = null;
    if (args) fn(...args);
  };

  return (...args) => {
    const elapsed = Date.now() - lastCallTime;

    // Nothing scheduled and the interval has passed → run immediately
    if (timerId === null && elapsed >= interval) {
      lastCallTime = Date.now();
      fn(...args);
      return;
    }

    // Otherwise remember the newest arguments and make sure a trailing call
    // is scheduled. Keeping only the latest args is what makes `t(1); t(2); t(3);`
    // log 1 immediately and 3 later, instead of 2.
    pendingArgs = args;
    if (timerId === null) {
      timerId = setTimeout(invoke, Math.max(interval - elapsed, 0));
    }
  };
}

// ---------------------------------------------------------------- 5. memoize
function memoize(fn) {
  const cache = new Map();                 // private state

  const memoized = (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };

  // Expose the cache for debugging, and a way to reset it
  Object.defineProperty(memoized, 'cache', { get: () => cache });
  memoized.clear = () => cache.clear();

  return memoized;
}

// ---------------------------------------------------------------- 6. withRetry
async function withRetry(asyncFn, { attempts = 3, baseDelayMs = 100 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await asyncFn(attempt);
    } catch (error) {
      lastError = error;

      // Do not retry errors that are explicitly permanent
      if (error?.permanent === true) throw error;

      const isLastAttempt = attempt === attempts;
      if (isLastAttempt) break;

      const delay = baseDelayMs * 2 ** (attempt - 1); // 100, 200, 400…
      console.log(`attempt ${attempt} failed (${error.message}); retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------- demo
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // 1
  const counter = createCounter(10);
  counter.increment();
  counter.increment(5);
  counter.decrement(3);
  console.log('counter:', counter.value());          // 13
  counter.reset();
  console.log('after reset:', counter.value());      // 10

  // 2
  let calls = 0;
  const init = once(() => {
    calls += 1;
    return 'initialised';
  });
  init();
  init();
  console.log('once calls:', calls);                 // 1

  // 3
  const debouncedLog = debounce((text) => console.log('debounced:', text), 50);
  debouncedLog('a');
  debouncedLog('b');
  debouncedLog('c');                                 // only "debounced: c"
  await wait(120);

  // 4
  const throttledLog = throttle((n) => console.log('throttled:', n), 60);
  throttledLog(1);
  throttledLog(2);
  throttledLog(3);                                   // "throttled: 1" now, "throttled: 3" later
  await wait(150);

  // 5
  let computations = 0;
  const slowSquare = memoize((n) => {
    computations += 1;
    return n * n;
  });
  slowSquare(4);
  slowSquare(4);
  slowSquare(5);
  console.log('computations:', computations);        // 2
  console.log('cache size:', slowSquare.cache.size); // 2

  // 6
  let attempts = 0;
  const flaky = async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('network hiccup');
    return 'succeeded';
  };
  console.log('retry result:', await withRetry(flaky, { attempts: 4, baseDelayMs: 20 }));
  // logs two retry messages, then "succeeded"

  try {
    await withRetry(async () => {
      const error = new Error('bad request');
      error.permanent = true;                        // no retry for this
      throw error;
    });
  } catch (error) {
    console.log('gave up immediately:', error.message); // "bad request"
  }
}

main();
```

**Expected output**

```text
counter: 13
after reset: 10
once calls: 1
debounced: c
throttled: 1
(≈60ms later) throttled: 3
computations: 2
cache size: 2
attempt 1 failed (network hiccup); retrying in 20ms
attempt 2 failed (network hiccup); retrying in 40ms
retry result: succeeded
gave up immediately: bad request
```

**Why this solution is good**

- **Every function keeps its state in a closure.** `value`, `called`, `timerId`,
  `lastCallTime`, `cache` — none of them are globals, so two counters (or two
  memoized functions) never interfere.
- **`debounce` and `throttle` are genuinely different.** Debounce waits for
  silence (good for search boxes, where you can skip the middle keystrokes);
  throttle allows one call per interval (good for scroll handlers, where you want
  steady updates).
- **`memoize` uses a `Map`, not an object.** Any key type works, there is no
  prototype pollution, and `cache.size` is available for debugging.
  `JSON.stringify(args)` handles multiple arguments — a simpler implementation
  with a single argument would break for `fn(a, b)`.
- **`withRetry` distinguishes permanent from transient failures.** Blindly
  retrying a 400 Bad Request wastes time and can make things worse — a real
  production concern (Part 7 returns to retries).
- **Exponential backoff** (`baseDelayMs * 2 ** (attempt - 1)`) is the standard
  strategy: 100ms, 200ms, 400ms… giving a struggling server room to recover.

### Challenge

Build `createStore.js` — a tiny **state container** implemented with closures,
which is essentially how Redux and Zustand work under the hood. Then use it to
build a todo store.

Requirements:

1. `createStore(reducer, initialState)` returns an object with:
   - `getState()` → the current state;
   - `dispatch(action)` → runs the reducer and updates the state;
   - `subscribe(listener)` → registers a listener, returns an `unsubscribe`
     function;
   - `select(selector)` → returns `selector(getState())` (a read-only view).
2. The state is **private** (not accessible except through the API), and the
   reducer must never be called with the same reference twice — dispatching an
   action that returns the identical state must still be allowed but must not
   notify listeners if the reference did not change.
3. Write a todo reducer handling `{ type: 'todo/added' }`,
   `{ type: 'todo/toggled' }`, `{ type: 'todo/removed' }` and
   `{ type: 'filter/changed' }`, all immutably.
4. Add three selectors: `selectVisibleTodos`, `selectStats`
   (`{ total, done, active }`) and `selectFilter`.
5. A `main()` that subscribes two listeners (one logging every action, one logging
   the stats), dispatches a sequence of actions, unsubscribes one, and shows the
   remaining listener still working.

This is a preview of `useReducer` and Redux (Parts 4 and 9) — the concepts are
identical, only the plumbing changes.

**Solution**

```text
js-playground/create-store.js
```

```js
// ---------------------------------------------------------------- the store
function createStore(reducer, initialState) {
  // Private state — inaccessible from outside
  let state = initialState;
  let listeners = [];

  const getState = () => state;

  const dispatch = (action) => {
    const previousState = state;
    state = reducer(state, action);

    // Notify only if the state actually changed (reference comparison)
    if (state !== previousState) {
      // Copy the listener array before iterating: a listener may unsubscribe
      // itself, which would otherwise mutate the array we are iterating.
      for (const listener of [...listeners]) {
        listener(action, state);
      }
    }

    return action;
  };

  const subscribe = (listener) => {
    listeners = [...listeners, listener];        // immutable update
    return () => {
      listeners = listeners.filter((current) => current !== listener);
    };
  };

  const select = (selector) => selector(state);

  // Dispatch once so the reducer can normalise the initial state
  dispatch({ type: '@@init' });

  return { getState, dispatch, subscribe, select };
}

// ---------------------------------------------------------------- reducer
const initialTodoState = {
  todos: [
    { id: 't1', title: 'Learn closures', done: true },
    { id: 't2', title: 'Build a store', done: false },
  ],
  filter: 'all', // 'all' | 'active' | 'done'
};

function todoReducer(state = initialTodoState, action) {
  switch (action.type) {
    case 'todo/added': {
      const { todo } = action.payload;
      return { ...state, todos: [...state.todos, todo] };
    }

    case 'todo/toggled': {
      const { id } = action.payload;
      return {
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, done: !todo.done } : todo
        ),
      };
    }

    case 'todo/removed': {
      const { id } = action.payload;
      return { ...state, todos: state.todos.filter((todo) => todo.id !== id) };
    }

    case 'filter/changed': {
      const { filter } = action.payload;
      return { ...state, filter };
    }

    default:
      return state;                    // unknown actions must not break the store
  }
}

// ---------------------------------------------------------------- selectors
const selectTodos = (state) => state.todos;
const selectFilter = (state) => state.filter;

const selectVisibleTodos = (state) => {
  const { filter } = state;
  if (filter === 'all') return state.todos;
  return state.todos.filter((todo) => (filter === 'done' ? todo.done : !todo.done));
};

const selectStats = (state) => {
  const done = state.todos.filter((todo) => todo.done).length;
  return { total: state.todos.length, done, active: state.todos.length - done };
};

// ---------------------------------------------------------------- demo
function main() {
  const store = createStore(todoReducer, initialTodoState);

  // Listener 1: log every action with the new state's shape
  const unsubscribeLogger = store.subscribe((action, state) => {
    console.log(`[log] ${action.type} → ${state.todos.length} todos, filter=${state.filter}`);
  });

  // Listener 2: log derived stats only
  const unsubscribeStats = store.subscribe((_action, state) => {
    const { total, done, active } = selectStats(state);
    console.log(`[stats] total=${total} done=${done} active=${active}`);
  });

  store.dispatch({ type: 'todo/added', payload: { todo: { id: 't3', title: 'Write tests', done: false } } });
  store.dispatch({ type: 'todo/toggled', payload: { id: 't2' } });
  store.dispatch({ type: 'filter/changed', payload: { filter: 'active' } });

  console.log('visible:', store.select(selectVisibleTodos).map(({ title }) => title));
  console.log('stats:', store.select(selectStats));

  // Unsubscribing stops only that listener
  unsubscribeStats();
  store.dispatch({ type: 'todo/removed', payload: { id: 't1' } });
  console.log('remaining listener still active (see the [log] line above)');

  // Dispatching an unknown action does not notify anyone
  store.dispatch({ type: 'unknown/action' });

  unsubscribeLogger();
  console.log('final state:', store.getState());
}

main();
```

**Expected output**

```text
[log] todo/added → 3 todos, filter=all
[stats] total=3 done=1 active=2
[log] todo/toggled → 3 todos, filter=all
[stats] total=3 done=2 active=1
[log] filter/changed → 3 todos, filter=active
[stats] total=3 done=2 active=1
visible: [ 'Write tests' ]
stats: { total: 3, done: 2, active: 1 }
[log] todo/removed → 2 todos, filter=active
remaining listener still active (see the [log] line above)
final state: {
  todos: [
    { id: 't2', title: 'Build a store', done: true },
    { id: 't3', title: 'Write tests', done: false }
  ],
  filter: 'active'
}
```

**Why this solution is good**

- **`state` and `listeners` are closure-private.** Nothing outside can reassign
  them. Compare this to a module-level `let` — same effect here, but closures make
  each store instance independent, and that is exactly the property `useReducer`
  needs.
- **The reducer is a pure function.** `(state, action) => newState`, no side
  effects. This is what makes state changes predictable and testable — Part 4
  (`useReducer`) and Part 9 (Redux) use this exact shape.
- **Reference comparison decides notification.** Returning the same state object
  means "nothing changed" — which is why every case returns a **new** object, and
  why `default: return state` correctly suppresses notifications.
- **`[...listeners]` before notifying** prevents a subtle bug: if a listener
  unsubscribes during dispatch, mutating the array mid-iteration would skip a
  listener.
- **`subscribe` returns an unsubscribe function** — the same cleanup idea as
  `useEffect`'s cleanup (Part 4).
- **Unknown actions fall through to `return state`**, so a typo in an action type
  cannot wipe your state.
- **Selectors are separate functions** taking state. This is how you keep derived
  data out of the state, which is the "derived state" rule you will meet next.

---

## 11. Summary

- Functions are **values**: they can be stored, passed and returned. Everything
  React does follows from that.
- Prefer **function declarations** for components and helpers, **arrow functions**
  for callbacks.
- Parameters vs arguments; defaults apply only for `undefined`; use **rest**
  rather than `arguments`.
- `onClick={handle}` passes the function; `onClick={handle()}` calls it during
  render — a classic React bug.
- **Callbacks** are functions you hand to someone else to call later with
  arguments they choose.
- A **closure** remembers the variables from where it was created. React
  components are closures; **stale state** in effects is a closure problem; the
  fixes are functional updates and correct dependencies.
- `this` depends on **how** a function is called. Arrow functions ignore this and
  inherit `this` — one reason modern React does not need it.
- **Pure functions** — same input, same output, no side effects — are the rule for
  component renders. Side effects belong in event handlers and effects.
- Higher-order functions (`map`, `filter`, `debounce`, `once`, `memoize`) are just
  functions that take or return functions; you will write several as custom hooks
  in Part 4.
- Recursion is mainly for tree-shaped data (nested comments, file trees, menus).

**What's next →** [`09-modules.md`](./09-modules.md): `import` and `export` — how
React projects are split across thousands of files without collisions.
