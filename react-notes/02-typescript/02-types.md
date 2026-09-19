# 02 — Types: the Vocabulary

> **Part 2 · TypeScript · File 2 of 11**
>
> **Why this file exists:** file 1 explained *what* TypeScript is. This file gives
> you the actual **vocabulary** — the types you will write thousands of times in
> React: primitives, arrays, tuples, objects, functions, and the three special
> types (`any`, `unknown`, `never`) that decide whether your types help you or
> hurt you.
>
> Every inference result in this file was produced by running `tsc` (TypeScript
> 5.9) with `--declaration --emitDeclarationOnly --strict` and reading the
> generated `.d.ts`. Nothing here is guessed.

---

## 1. Primitives

TypeScript has seven primitive types that mirror JavaScript's.

```ts
const title: string = 'Clean Code';
const pages: number = 464;
const inStock: boolean = true;
const rating: null = null;
const discount: undefined = undefined;
const id: symbol = Symbol('book');
const bigId: bigint = 9007199254740993n;
```

**Lowercase, always.** These are *types*:

| Type | Values | Notes |
| --- | --- | --- |
| `string` | `'a'`, `"b"`, `` `c` `` | template literals too |
| `number` | `1`, `2.5`, `NaN`, `Infinity` | there is no separate `int` or `float` |
| `boolean` | `true`, `false` | not `0`/`1` |
| `null` | `null` | only assignable when `strictNullChecks` is on as part of `null` |
| `undefined` | `undefined` | same |
| `symbol` | `Symbol('x')` | unique keys |
| `bigint` | `10n` | integers beyond `Number.MAX_SAFE_INTEGER` |

> ⚠️ **The wrapper-object mistake.** Never use these:
> ```ts
> const a: String = 'x';    // ❌ the boxed String object type
> const b: Number = 1;      // ❌
> const c: Boolean = true;  // ❌
> ```
> They are *not* the same as `string`/`number`/`boolean`, they behave confusingly
> in comparisons, and no React codebase uses them. ESLint's
> `@typescript-eslint/ban-types` rule flags them for this reason.

### `null` and `undefined` are types you must handle

With `strict: true`, `null` is **not** assignable to `string`:

```ts
let name: string = 'Ada';
// name = null;   // ❌ TS2322: Type 'null' is not assignable to type 'string'
name = null as unknown as string;   // you have to fight it, which is the point
```

To allow "no value yet", say so explicitly:

```ts
let name: string | null = null;   // ✅ explicit
name = 'Ada';
name = null;

let nickname: string | undefined;
nickname = 'Ada';
nickname = undefined;
```

The difference between them matters in React: `undefined` often means "not passed
at all" (an optional prop), while `null` often means "explicitly empty"
(not logged in). File 5 covers unions properly, and Part 4 uses this distinction
for state that is "not loaded yet".

---

## 2. Literal types and widening (the thing that confuses everyone)

A **literal type** is a single value used as a type.

```ts
let status: 'idle' = 'idle';
// status = 'loading';   // ❌ TS2322: Type '"loading"' is not assignable to type '"idle"'

const level: 3 = 3;      // the type is literally 3
const yes: true = true;
```

Literal types look useless alone; they become powerful when combined into unions
(file 5): `'idle' | 'loading' | 'error'`.

### Widening: what inference actually does

Here is the real compiler output for common declarations:

```ts
let letNum = 5;                          // → number          (widened)
const constNum = 5;                      // → 5               (literal kept!)
let letStr = 'idle';                     // → string          (widened)
const constStr = 'idle';                 // → "idle"          (literal kept)
const arr = [1, 2, 3];                   // → number[]        (NOT (1|2|3)[])
const mixed = [1, 'a', true];            // → (string | number | boolean)[]
const obj = { a: 1, b: 'x', c: true };   // → { a: number; b: string; c: boolean }
```

**The rules behind those results:**

1. **`const` with a primitive keeps the literal type.** `const constStr = 'idle'`
   is typed `"idle"`, so it is assignable to `'idle' | 'loading'` but not to
   `'error'`. This is why `const status = 'idle'` in a component is more precise
   than `let status = 'idle'`.
2. **`let` widens** to the general type, because it might be reassigned.
3. **Arrays and objects widen their contents.** `[1, 2, 3]` is `number[]`, not a
   tuple of literals, because arrays are mutable — you could `push(4)`.
4. **Object properties widen.** `{ a: 1 }` becomes `{ a: number }` for the same
   reason. This catches people out when they expect `{ status: 'idle' }` to be
   assignable to `{ status: 'idle' | 'error' }` — the property is `string`, which
   is too wide.

### `as const` stops widening

```ts
const asConstObj = { a: 1, b: 'x' } as const;
// → { readonly a: 1; readonly b: "x" }

const asConstArr = [1, 2, 3] as const;
// → readonly [1, 2, 3]        ← a readonly TUPLE of literals, not readonly number[]

const nested = { user: { name: 'Ada' }, tags: ['x'] } as const;
// → { readonly user: { readonly name: "Ada" }; readonly tags: readonly ["x"] }
```

Note how `as const` makes **every level** `readonly`, and turns arrays into
**tuples**. Compare with `Object.freeze`, which is shallower:

```ts
const frozen = Object.freeze({ a: 1, b: 'x' });
// → Readonly<{ a: 1; b: "x" }>          ← literals kept, top level readonly

const deepFrozen = Object.freeze({ outer: { inner: 1 } });
// → Readonly<{ outer: { inner: number } }>   ⚠️ `inner` is NOT readonly
```

So `Object.freeze` gives you top-level readonly (and it actually freezes at runtime
for that level), while `as const` gives compile-time deep readonly — but **`as const`
does not freeze anything at runtime**.

> 🏭 **Practical uses of `as const`** you will see in real React code:
> ```ts
> // 1. A stable list of options whose values are also valid types
> const TABS = ['overview', 'activity', 'settings'] as const;
> type Tab = (typeof TABS)[number];        // 'overview' | 'activity' | 'settings'
>
> // 2. Theme tokens
> const SIZES = { sm: 4, md: 8, lg: 16 } as const;
> type Size = keyof typeof SIZES;          // 'sm' | 'md' | 'lg'
>
> // 3. Deriving a union from a lookup object (an alternative to enums — file 8)
> const STATUS = { idle: 'idle', loading: 'loading', error: 'error' } as const;
> type Status = (typeof STATUS)[keyof typeof STATUS];
> ```
> `(typeof TABS)[number]` — "the type of indexing TABS with a number" — is the
> standard idiom for turning an array into a union. You will use it constantly.

---

## 3. Arrays

```ts
const names: string[] = ['Ada', 'Grace'];          // preferred (shorter)
const names2: Array<string> = ['Ada', 'Grace'];    // identical meaning
const ids: number[] = [1, 2, 3];
const matrix: number[][] = [[1, 2], [3, 4]];       // array of arrays
const users: { id: number; name: string }[] = [];  // array of objects
const anything: unknown[] = [1, 'a', null];
```

`T[]` and `Array<T>` are exactly equivalent. Use `T[]` for simple element types and
`Array<T>` when the element type is itself complex enough that the brackets get
lost:

```ts
// Both of these are the same type:
const a: (string | number)[] = [1, 'a'];
const b: Array<string | number> = [1, 'a'];   // ← reads more clearly for unions
```

### Readonly arrays

```ts
const fixed: readonly number[] = [1, 2, 3];
// fixed.push(4);        // ❌ TS2339: Property 'push' does not exist on type 'readonly number[]'
// fixed[0] = 9;         // ❌ TS2542: Index signature in type 'readonly number[]'
                          //           only permits reading

const alsoFixed: ReadonlyArray<number> = [1, 2, 3];   // identical
const frozenTuple = [1, 2] as const;                  // readonly [1, 2]
```

Readonly arrays are the type-level way to say "I will not mutate this". They are
excellent for props, because they stop a child component from accidentally
modifying the parent's data:

```tsx
interface ListProps {
  items: readonly string[];   // the component promises not to mutate
}
```

Note: `readonly number[]` and `number[]` are **not** mutually assignable in one
direction — a mutable array can be passed where a readonly array is expected, but
not the reverse. That is the safe direction: you can always promise *less*.

### `arr[0]` and the honesty setting

This is a genuine trap, and the compiler output proves it. Given
`const arr = [1, 2, 3]`:

| Expression | Without `noUncheckedIndexedAccess` | With it enabled |
| --- | --- | --- |
| `arr[0]` | `number` ⚠️ (a lie — the array might be empty) | `number \| undefined` ✅ |
| `record['missing']` | `number` ⚠️ | `number \| undefined` ✅ |
| `arr.at(0)` | `number \| undefined` ✅ | `number \| undefined` ✅ |

```ts
const arr = [1, 2, 3];
const rec: Record<string, number> = {};

const first = arr[0];        // number  (or number | undefined with the flag)
const missing = rec['nope']; // number  ← compiles, and is `undefined` at runtime 😖
const safe = arr.at(0);      // number | undefined  ← honest either way
```

> 💡 **Why `noUncheckedIndexedAccess` is worth turning on** (it is in the config
> from file 1): it makes `arr[0]` and `obj[key]` admit they can be `undefined`,
> which forces the check that prevents `Cannot read properties of undefined`. The
> cost is a bit more code. The benefit is that `arr[0].toUpperCase()` stops being a
> silent production crash.
>
> `arr.at(-1)` is a neat middle ground: it is always honest, and it handles
> negative indices (last item) which `arr[arr.length - 1]` cannot.

---

## 4. Tuples

A **tuple** is a fixed-length array where each position has its own type.

```ts
let point: [number, number] = [10, 20];
let entry: [string, number] = ['age', 36];
let pair: [string, boolean] = ['isAdmin', true];

// Wrong length or order is caught:
// point = [10, 20, 30];          // ❌ TS2322: Source has 3 element(s), but target allows only 2
// entry = [36, 'age'];           // ❌ TS2322: Type 'number' is not assignable to type 'string'
```

Tuples are how you type things that are "a fixed sequence of different types":

```ts
// React's useState returns a tuple — which is why destructuring gives the right types
const [count, setCount] = useState(0);
//     ↑ number    ↑ Dispatch<SetStateAction<number>>
```

That is the second reason `useState` returns an array rather than an object
(file 5 of Part 1 gave the API-design reason; the tuple is why the types work
positionally).

More tuple forms:

```ts
// Optional element (must come last)
type Range = [min: number, max?: number];
const r1: Range = [0];
const r2: Range = [0, 100];

// Rest elements
type FirstAndRest = [head: string, ...tail: number[]];
const f: FirstAndRest = ['a', 1, 2, 3];

// Named elements (purely documentation — hover shows the names)
type Point3D = [x: number, y: number, z: number];
const p: Point3D = [1, 2, 3];

// Readonly tuple
const config: readonly [string, number] = ['timeout', 5000];
```

> 💡 **When to reach for a tuple:** short, fixed, positional data — coordinates,
> key/value pairs, `Object.entries` results, and hook return values. If it could
> reasonably grow or shrink, use an array. If the positions have no meaning, use an
> object.

---

## 5. Objects

TypeScript is **structural**: a type describes a *shape*, and anything with that
shape matches. There is no "nominal" matching by class name (unlike Java/C#).

```ts
const user: { id: number; name: string; email: string } = {
  id: 1,
  name: 'Ada',
  email: 'ada@example.com',
};
```

That inline object type gets unreadable fast, so we name shapes with **interfaces**
and **type aliases** — those are file 3 and file 4. Here is the vocabulary they use:

```ts
interface User {
  id: number;             // required
  name: string;           // required
  email?: string;         // optional: may be missing entirely
  readonly createdAt: string;  // cannot be reassigned

  // A method (function property)
  greet(greeting: string): string;
}
```

| Syntax | Meaning | Notes |
| --- | --- | --- |
| `name: string` | required property | must be present when creating the object |
| `name?: string` | optional | type is `string \| undefined` when read |
| `readonly name: string` | cannot be reassigned after creation | compile-time only; read-only *reference*, not deep |
| `[key: string]: number` | index signature | any string key → number (see below) |
| `greet(x: string): string` | method | same as `greet: (x: string) => string` |

### Optional properties vs `undefined`

```ts
interface A {
  name?: string;                 // may be absent
}

interface B {
  name: string | undefined;      // must be present, may be undefined
}

const a: A = {};                   // ✅
const b: B = {};                   // ❌ TS2741: Property 'name' is missing
const b2: B = { name: undefined }; // ✅ explicitly present
```

With `exactOptionalPropertyTypes` enabled (file 1's config), the difference is
enforced strictly: `A` does not accept `{ name: undefined }`. This distinction
matters for React props, because "prop not passed" and "prop passed as undefined"
behave differently for default parameters (Part 1 file 4).

### Index signatures and `Record`

```ts
// An object with any number of string keys, all numbers
interface Scores {
  [studentName: string]: number;
}

const scores: Scores = { ada: 95, grace: 98 };
scores['alan'] = 91;                 // ✅
// scores['x'] = 'nope';             // ❌ Type 'string' is not assignable to type 'number'

// Record<K, V> is the cleaner, shorter form of the same idea
type Scores2 = Record<string, number>;
type ById = Record<string, { id: string; title: string }>;
type StatusCounts = Record<'idle' | 'loading' | 'error', number>;
//   ↑ the keys can be a union, which gives you exhaustiveness:
const counts: StatusCounts = { idle: 0, loading: 0, error: 0 };
// Missing a key → TS2741; an unknown key → TS2353.
```

`Record` is a **mapped type** — one of the utility types file 10 covers in full.
For now: `Record<K, V>` means "an object whose keys are `K` and values are `V`".

> ⚠️ **Index signatures weaken type safety.** With `[key: string]: number`, every
> unknown key is assumed to exist:
> ```ts
> const s: Scores = { ada: 95 };
> const x = s['nobody'];   // typed `number`, actually `undefined` at runtime 😖
> ```
> Prefer a `Map` for dynamic keys, a typed `Record` with a known key union, or turn
> on `noUncheckedIndexedAccess`. React code that does
> `itemsById[id].title` is exactly this bug waiting to happen.

### Structural typing in practice

```ts
interface Point {
  x: number;
  y: number;
}

function printPoint(point: Point) {
  console.log(point.x, point.y);
}

printPoint({ x: 1, y: 2 });          // ✅ a literal with the right shape
printPoint({ x: 1, y: 2, z: 3 });    // ❌ TS2353: 'z' does not exist in type 'Point'
                                     //    (excess property check on fresh literals)

const p3 = { x: 1, y: 2, z: 3 };
printPoint(p3);                      // ✅ extra properties are fine via a variable
```

**Read that carefully** — it explains a behaviour that confuses everyone:

- A **fresh object literal** gets an **excess property check**: extra keys are an
  error, because you probably made a typo.
- A **variable** with extra properties is accepted, as long as it has at least the
  required shape. This is structural typing doing its job: `p3` genuinely *is* a
  `Point` (it has `x` and `y`).

That is why `printPoint({ x: 1, y: 2, z: 3 })` fails but `printPoint(p3)` works.
In React, this is exactly why passing an extra prop to `<UserCard {...user} />`
can be fine while writing it inline can error.

### Property access and `this` in object types

```ts
const counter = {
  count: 0,
  increment() {
    this.count += 1;      // inference knows `this` here
    return this.count;
  },
};

// You can type `this` explicitly (rarely needed)
function describe(this: { name: string }) {
  return this.name;
}
```

---

## 6. Functions as types

```ts
// A function type: parameters → return type
type Formatter = (value: number) => string;

const formatPrice: Formatter = (value) => `₹${value}`;

// Full function declaration
function add(a: number, b: number): number {
  return a + b;
}

// Property style vs method style (they differ subtly in strict mode)
interface WithProperty {
  onChange: (value: string) => void;    // property
}

interface WithMethod {
  onChange(value: string): void;        // method
}
```

**Prefer the property style** in interfaces for callbacks. The difference is
variance-related and shows up as `strictFunctionTypes` errors: method syntax is
bivariant (more lenient, less safe), property syntax is contravariant (stricter,
safer). For React props, always the property style.

### Parameter and return vocabulary

```ts
function withOptional(a: number, b?: number): number {     // b may be omitted
  return a + (b ?? 0);
}

function withDefault(a: number, b = 10): number {          // inferred: b is number
  return a + b;
}

function withRest(first: string, ...rest: number[]): string {
  return `${first}: ${rest.reduce((sum, n) => sum + n, 0)}`;
}

function returnsVoid(message: string): void {               // returns nothing useful
  console.log(message);
}

function returnsNever(): never {                            // never returns at all
  throw new Error('always fails');
}

async function returnsPromise(): Promise<number> {          // async always returns a promise
  return 1;
}
```

Real compiler output for the last one:

```ts
const asyncFn = async (): Promise<number> => 1;
// → () => Promise<number>      ← NOT Promise<Promise<number>>; TS unwraps it
```

That is worth remembering: when you `return somePromise` from an `async` function,
TypeScript **awaits** it in the type, so the declared return type is the resolved
value.

### Function type inference at call sites

```ts
const numbers = [1, 2, 3];

// The parameter type is INFERRED from the array — no annotation needed
numbers.map((n) => n * 2);
//           ↑ n is number

const users = [{ id: 1, name: 'Ada' }];
users.find((u) => u.name === 'Ada');
//           ↑ u is { id: number; name: string }
```

This "contextual typing" is why React code is not drowning in annotations:
`onClick={(event) => ...}` knows `event` is a `React.MouseEvent`.

---

## 7. `any`, `unknown`, `never` and `void`

These four cause the most confusion, so take them slowly.

### `void` — "no useful value"

```ts
function log(message: string): void {
  console.log(message);
  // no return
}
```

`void` means "the return value is not meant to be used". It is what React expects
from event handlers: `onClick: () => void`. A function that *does* return
something is still assignable where `void` is expected — the value is just ignored.

### `any` — "turn the type checker off"

```ts
let anything: any = 1;
anything = 'now a string';
anything = { nested: true };
anything.nonExistent.property.deeper();   // ✅ no error! crashes at runtime
```

`any` is **contagious**: everything it touches becomes `any` too.

```ts
const data: any = await response.json();
const name = data.user.name;      // `name` is `any`
const upper = name.toUpperCase(); // no error even if `name` is a number
processUser(name);                 // no error, whatever processUser expects
```

> ⚠️ **When you write `any`, you delete the type system for that variable and
> everything downstream.** It is not "a flexible type"; it is "no checking here".
> Under `strict`, the compiler does not hand out `any` by accident — every `any`
> in your code was written by someone (possibly you, at 6pm, under deadline).

**Legitimate uses of `any` (rare):**

```ts
// 1. Migrating a large JS file: an explicit, temporary escape hatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacy: any = window.someOldLibrary();

// 2. A genuinely heterogeneous third-party API with no types available
// 3. Writing type-level machinery (advanced generics)
```

Everything else has a better answer — `unknown`, generics (file 7), or an
interface.

### `unknown` — "I don't know yet, and I will check"

`unknown` is the **safe** counterpart of `any`. You can assign anything *to* an
`unknown`, but you can do almost nothing *with* it until you narrow.

```ts
let value: unknown = 'hello';

// value.toUpperCase();     // ❌ TS2571: 'value' is of type 'unknown'
// value + 1;               // ❌
// value.length;            // ❌

// You must check first:
if (typeof value === 'string') {
  value.toUpperCase();       // ✅ inside the guard, it is a string
}
```

Compare the two on the same code:

```ts
// ⚠️ any: compiles, crashes at runtime
function processAny(data: any) {
  return data.user.name.toUpperCase();
}

// ✅ unknown: forces the checks that prevent the crash
function processUnknown(data: unknown) {
  if (
    typeof data === 'object' &&
    data !== null &&
    'user' in data &&
    typeof (data as { user: unknown }).user === 'object'
  ) {
    // ...and further checks for `name`
  }
  return '';
}
```

`unknown` is the **correct type for anything arriving from outside your program**:

```ts
async function loadJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();          // runtime data is unverified — say so!
}
```

File 9 covers narrowing in full, and file 1's challenge already used
`Record<string, unknown>` plus `isRecord` guards to turn `unknown` into a checked
type.

**The rule:**

```text
Data from outside your app  →  unknown, then validate
Data you created yourself   →  the real type, always
any                         →  almost never
```

### `never` — "this can never happen"

`never` is the type with **no values**. It appears in two places:

```ts
// 1. A function that never returns normally
function fail(message: string): never {
  throw new Error(message);
}

function infinite(): never {
  while (true) {
    // never exits
  }
}
```

```ts
// 2. The exhaustiveness check — the most useful place
type Status = 'idle' | 'loading' | 'success' | 'error';

function messageFor(status: Status): string {
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'loading':
      return 'Loading…';
    case 'success':
      return 'Done';
    case 'error':
      return 'Something went wrong';
    default: {
      // If every case is handled, `status` here is `never`.
      // Adding a new variant to Status makes this line a compile error.
      const unreachable: never = status;
      return unreachable;
    }
  }
}
```

That `const unreachable: never = status` is a **compile-time tripwire**: add
`'cancelled'` to `Status` and the compiler points at this exact line. File 9
builds on it; it is one of the most valuable patterns in typed code.

### Comparison table

| Type | Accepts | You can use it as | Use for |
| --- | --- | --- | --- |
| `any` | anything | anything (no checks) | last-resort escape hatch |
| `unknown` | anything | nothing until narrowed | external/untrusted data |
| `never` | nothing | everywhere (it is a subtype of all) | unreachable code, exhaustiveness |
| `void` | `undefined` (+ ignored returns) | not as a value | functions called for side effects |

```ts
const a: any = 1;         // anything goes
const u: unknown = 1;     // assigned fine, unusable until narrowed
// const n: never = 1;    // ❌ TS2322: Type 'number' is not assignable to type 'never'
```

---

## 8. Special object types you will meet in React

```ts
// Maps and Sets (typed key and value)
const byId = new Map<string, User>();
const selected = new Set<string>();

// Promises
const promise: Promise<User> = fetchUser(1);
// → Promise<User>

// Dates
const when: Date = new Date();

// DOM and browser types
const input: HTMLInputElement | null = document.querySelector('#email');
const clickHandler: (event: MouseEvent) => void = () => {};
const timer: ReturnType<typeof setTimeout> = setTimeout(() => {}, 1000);

// Functions that take functions
type Callback = () => void;
type Predicate<T> = (value: T) => boolean;
type Mapper<T, U> = (value: T) => U;
```

`ReturnType<typeof setTimeout>` is a **utility type** (file 10). It is the correct
way to type a timer id, because the id is a number in browsers and an object in
Node — and `ReturnType` adapts to whichever environment you are compiling for.
Typing it as `number` breaks Node builds; typing it as `any` throws away safety.

---

## 9. Choosing the right type: a decision list

```text
A single text value?                        → string
A count, price, or measurement?             → number   (money: integer minor units)
A yes/no flag?                              → boolean
"Not loaded yet"?                           → T | null  (or T | undefined)
"A list of X"?                              → X[]
"A fixed sequence of X, Y"?                 → [X, Y]
"A key-value bag you build at runtime"?     → Map<K, V>
"An object with known keys"?                → interface / type alias (files 3-4)
"An object with dynamic string keys"?       → Record<string, V>  (mind the caveat)
"One of a few known strings"?               → 'a' | 'b' | 'c'     (file 5)
"Data from an API/JSON/localStorage"?       → unknown, then validate (file 9)
"A function taking X returning Y"?          → (x: X) => Y
"Whatever this third-party thing returns"?  → typeof thatThing      (file 10)
```

---

## 10. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `String`/`Number`/`Boolean` (capitalised) | Weird incompatibilities with primitives | lowercase `string`/`number`/`boolean` |
| Expecting `{ status: 'idle' }` to match `'idle' \| 'error'` | TS2322: `string` not assignable | annotate, or use `as const` |
| Using `let` when `const` is enough | Types are wider than you want | `const` keeps literal types |
| `arr[0]` assumed to exist | Runtime `undefined` | enable `noUncheckedIndexedAccess`, or use `.at()` + a check |
| Indexing an object with an unknown key | Type says `number`, runtime says `undefined` | `Record` with a key union, a `Map`, or a guard |
| `any` to silence an error | The error moves to runtime, and spreads | `unknown` + narrowing, or the real type |
| Using `any` in a function signature | Everything it touches is unchecked | generics (file 7) or a proper interface |
| Forgetting the `default: never` check | New union members are silently unhandled | add the exhaustiveness tripwire |
| `objectType.prop` typed `object` | `Property 'x' does not exist on type 'object'` | `object` means "any non-primitive" — use a real shape |
| `{}` as a type | Accepts almost anything (any non-null value) | `Record<string, never>` for "truly empty", or a real interface |
| Mutating a `readonly` array | TS2339: `Property 'push' does not exist` | copy first: `[...arr, item]` |
| Typing a timer as `number` | Breaks in Node type-checking | `ReturnType<typeof setTimeout>` |
| Using a tuple where an object is clearer | Positional code is unreadable | use named properties |

> 💡 The `{}` case is worth remembering because it looks harmless:
> ```ts
> function log(value: {}) { /* ... */ }
> log('a string');    // ✅ compiles! `{}` only means "not null/undefined"
> log(42);            // ✅
> ```
> Use `Record<string, never>` if you truly want "an object with no properties",
> and `object` if you want "any non-primitive".

---

## 11. Practice exercises

### Beginner

For each declaration, write down the inferred type **before** checking with
`tsc`. Then verify using the `.d.ts` trick below.

```ts
const a = 'loading';
let b = 'loading';
const c = [1, 2, 3];
const d = { id: 1, tags: ['a'] };
const e = { id: 1, tags: ['a'] } as const;
const f = [1, 'two'];
const g = true;
let h = true;
const i = { nested: { deep: 1 } };
const j: [string, number] = ['a', 1];
const k = Object.freeze({ id: 1 });
```

**The `.d.ts` trick** — how to see inferred types for real:

```bash
npx tsc --declaration --emitDeclarationOnly --strict --target es2022 \
  --module esnext --moduleResolution bundler --outDir types-out src/infer.ts
cat types-out/infer.d.ts
```

**Solution**

```ts
const a = 'loading';                                    // "loading"
let b = 'loading';                                      // string
const c = [1, 2, 3];                                    // number[]
const d = { id: 1, tags: ['a'] };                       // { id: number; tags: string[] }
const e = { id: 1, tags: ['a'] } as const;              // { readonly id: 1; readonly tags: readonly ["a"] }
const f = [1, 'two'];                                   // (string | number)[]
const g = true;                                         // true
let h = true;                                           // boolean
const i = { nested: { deep: 1 } };                      // { nested: { deep: number } }
const j: [string, number] = ['a', 1];                   // [string, number]
const k = Object.freeze({ id: 1 });                     // Readonly<{ id: 1 }>
```

**Why each answer is what it is:**

- `a` is `const` with a primitive → **literal kept** (`"loading"`), not `string`.
- `b` is `let` → **widened** to `string`, because it can be reassigned.
- `c` is an array → `number[]`. Note `const` did **not** make the elements literal;
  `push(4)` is still allowed.
- `d` → properties widened to `number`/`string[]`, for the same mutability reason.
- `e` with `as const` → deep readonly with literals, and the array became a tuple.
- `f` → an array literal with mixed types infers the union of element types.
- `g`/`h` show the `const`/`let` difference for booleans: `true` vs `boolean`.
- `k` → `Object.freeze` keeps literals at the top level and adds readonly there,
  but only at the top level.

**The practical takeaway:** if you want a precise literal type, use `const` (or
`as const`). If you want a broad type, `let` gives it to you — usually not what
you want.

### Intermediate

Build a **typed data model** for a shop, then write functions whose signatures
enforce real business rules. This is the shape of the `types/` folder you will
create in Part 15.

```text
ts-playground/src/shop.ts
```

Requirements — use only the type vocabulary from this file (primitives, literals,
arrays, tuples, objects, `unknown`, never, readonly; interfaces come in file 3):

1. Define these types:

```ts
type CurrencyCode = 'INR' | 'USD';
type ProductCategory = 'input' | 'display' | 'audio';
type Rating = 1 | 2 | 3 | 4 | 5;

interface Money { readonly amountInMinorUnits: number; readonly currency: CurrencyCode }

interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  readonly category: ProductCategory;
  readonly rating: Rating;
  readonly tags: readonly string[];
  readonly stockByWarehouse: Readonly<Record<string, number>>;
}

type CartLine = readonly [productId: string, quantity: number];
```

2. Write these functions with **precise** signatures:
   - `makeMoney(amountInMinorUnits: number, currency: CurrencyCode): Money` — throws on non-integer or negative.
   - `totalStock(product: Product): number` — sums `stockByWarehouse` values.
   - `isAvailable(product: Product, warehouse: string, quantity: number): boolean`.
   - `averageRating(products: readonly Product[]): number | null` — `null` for an empty list (this is the "no rating yet" case, which is **not** the same as `0`).
   - `validateCartLine(raw: unknown): { ok: true; line: CartLine } | { ok: false; error: string }` — validates an `unknown` tuple.
   - `cheapestOf(products: readonly Product[]): Product | undefined`.
   - `formatMoney(money: Money): string`.
   - `assertNever(value: never): never` — the exhaustiveness helper from section 7.
   - `describeProduct(product: Product): string` using a `switch` over `category` with a `default: return assertNever(product.category)`.
3. Prove that the compiler stops you in these cases (write the lines as comments
   with the expected error code):
   - assigning `'bluetooth'` to `category`;
   - assigning `6` to `rating`;
   - pushing to `product.tags`;
   - assigning to `product.id`;
   - passing a `Product` with the wrong currency to `formatMoney`.

**Solution**

```text
ts-playground/src/shop.ts
```

```ts
// ---------------------------------------------------------------- types
type CurrencyCode = 'INR' | 'USD';
type ProductCategory = 'input' | 'display' | 'audio';
type Rating = 1 | 2 | 3 | 4 | 5;

interface Money {
  /** Smallest unit: paise for INR, cents for USD. */
  readonly amountInMinorUnits: number;
  readonly currency: CurrencyCode;
}

interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  readonly category: ProductCategory;
  readonly rating: Rating;
  readonly tags: readonly string[];
  readonly stockByWarehouse: Readonly<Record<string, number>>;
}

/** A cart entry is a fixed pair: [productId, quantity]. */
type CartLine = readonly [productId: string, quantity: number];

// ---------------------------------------------------------------- money
const LOCALES: Record<CurrencyCode, string> = { INR: 'en-IN', USD: 'en-US' };

function makeMoney(amountInMinorUnits: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amountInMinorUnits)) {
    throw new Error(`Amount must be an integer in minor units, received ${amountInMinorUnits}`);
  }
  if (amountInMinorUnits < 0) {
    throw new Error(`Amount cannot be negative, received ${amountInMinorUnits}`);
  }
  return { amountInMinorUnits, currency };
}

function formatMoney(money: Money): string {
  return new Intl.NumberFormat(LOCALES[money.currency], {
    style: 'currency',
    currency: money.currency,
  }).format(money.amountInMinorUnits / 100);
}

// ---------------------------------------------------------------- products
function totalStock(product: Product): number {
  return Object.values(product.stockByWarehouse).reduce((sum, quantity) => sum + quantity, 0);
}

function isAvailable(product: Product, warehouse: string, quantity: number): boolean {
  const available = product.stockByWarehouse[warehouse] ?? 0; // ?? because the key may be missing
  return available >= quantity;
}

function averageRating(products: readonly Product[]): number | null {
  if (products.length === 0) return null; // "no data" is not the same as 0

  const total = products.reduce((sum, product) => sum + product.rating, 0);
  return Math.round((total / products.length) * 100) / 100;
}

function cheapestOf(products: readonly Product[]): Product | undefined {
  let cheapest: Product | undefined;

  for (const product of products) {
    if (cheapest === undefined || product.price.amountInMinorUnits < cheapest.price.amountInMinorUnits) {
      cheapest = product;
    }
  }

  return cheapest;
}

// ---------------------------------------------------------------- validation of unknown data
function validateCartLine(raw: unknown): { ok: true; line: CartLine } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Cart line must be an array' };
  }
  if (raw.length !== 2) {
    return { ok: false, error: `Cart line must have exactly 2 entries, received ${raw.length}` };
  }

  const [productId, quantity] = raw as [unknown, unknown];

  if (typeof productId !== 'string' || productId.trim() === '') {
    return { ok: false, error: 'Cart line productId must be a non-empty string' };
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: `Cart line quantity must be a positive integer, received ${String(quantity)}` };
  }

  return { ok: true, line: [productId, quantity] };
}

// ---------------------------------------------------------------- exhaustiveness
function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

function describeProduct(product: Product): string {
  const price = formatMoney(product.price);

  switch (product.category) {
    case 'input':
      return `${product.name} (${price}) — a keyboard or mouse`;
    case 'display':
      return `${product.name} (${price}) — a screen`;
    case 'audio':
      return `${product.name} (${price}) — speakers or headphones`;
    default:
      // If a new category is added to ProductCategory, this line becomes a
      // compile error: Argument of type 'string' is not assignable to 'never'.
      return assertNever(product.category);
  }
}

// ---------------------------------------------------------------- demo
const keyboard: Product = {
  id: 'p1',
  name: 'Mechanical Keyboard',
  price: makeMoney(499900, 'INR'),
  category: 'input',
  rating: 5,
  tags: ['mechanical', 'rgb'],
  stockByWarehouse: { pune: 4, mumbai: 2 },
};

const monitor: Product = {
  id: 'p2',
  name: '27" Monitor',
  price: makeMoney(1899900, 'INR'),
  category: 'display',
  rating: 4,
  tags: ['4k'],
  stockByWarehouse: { pune: 0 },
};

function main(): void {
  const products: readonly Product[] = [keyboard, monitor];

  console.log(describeProduct(keyboard));         // Mechanical Keyboard (₹4,999.00) — a keyboard or mouse
  console.log(describeProduct(monitor));          // 27" Monitor (₹18,999.00) — a screen
  console.log('total stock (keyboard):', totalStock(keyboard));       // 6
  console.log('available in pune?', isAvailable(keyboard, 'pune', 3)); // true
  console.log('available in mumbai?', isAvailable(keyboard, 'mumbai', 3)); // false
  console.log('available in delhi?', isAvailable(keyboard, 'delhi', 1));   // false (missing key)
  console.log('avg rating:', averageRating(products));  // 4.5
  console.log('avg rating (empty):', averageRating([])); // null
  console.log('cheapest:', cheapestOf(products)?.name);  // Mechanical Keyboard
  console.log('cheapest (empty):', cheapestOf([]));      // undefined

  console.log(validateCartLine(['p1', 2]));         // { ok: true, line: [ 'p1', 2 ] }
  console.log(validateCartLine(['p1', 0]));         // { ok: false, error: '...positive integer...' }
  console.log(validateCartLine(['p1']));            // { ok: false, error: '...exactly 2 entries...' }
  console.log(validateCartLine('nope'));            // { ok: false, error: 'Cart line must be an array' }
}

main();

/* ---------------------------------------------------------------------------
   THINGS THE COMPILER NOW STOPS (each line would be an error if uncommented):

   const bad1: ProductCategory = 'bluetooth';
   //    TS2322: Type '"bluetooth"' is not assignable to type 'ProductCategory'

   const bad2: Rating = 6;
   //    TS2322: Type '6' is not assignable to type 'Rating'

   // keyboard.tags.push('new');
   //    TS2339: Property 'push' does not exist on type 'readonly string[]'

   // keyboard.id = 'p9';
   //    TS2540: Cannot assign to 'id' because it is a read-only property

   // keyboard.stockByWarehouse['pune'] = 99;
   //    TS2542: Index signature in type 'Readonly<Record<string, number>>'
   //            only permits reading

   // formatMoney({ amountInMinorUnits: 100, currency: 'EUR' });
   //    TS2322: Type '"EUR"' is not assignable to type 'CurrencyCode'
---------------------------------------------------------------------------- */
```

**Expected output**

```text
Mechanical Keyboard (₹4,999.00) — a keyboard or mouse
27" Monitor (₹18,999.00) — a screen
total stock (keyboard): 6
available in pune? true
available in mumbai? false
available in delhi? false (missing key)
avg rating: 4.5
avg rating (empty): null
cheapest: Mechanical Keyboard
cheapest (empty): undefined
{ ok: true, line: [ 'p1', 2 ] }
{
  ok: false,
  error: 'Cart line quantity must be a positive integer, received 0'
}
{
  ok: false,
  error: 'Cart line must have exactly 2 entries, received 1'
}
{ ok: false, error: 'Cart line must be an array' }
```

> The short objects print on one line and the longer ones wrap — Node's
> `console.log` breaks objects across lines once they pass ~72 characters. The
> values are identical either way.

**What this exercise teaches**

- **`readonly` everywhere on the model.** The data is immutable by design, so
  every consumer is protected from accidentally mutating shared state — which is
  exactly what React requires.
- **`averageRating` returns `number | null`**, not `number`. `null` means "no
  ratings yet" and is different from `0`, which means "rated zero". Getting this
  distinction wrong produces a UI that shows a fake 0-star rating.
- **`isAvailable` uses `?? 0`** because a warehouse key that does not exist is a
  legitimate "no stock here", and with `noUncheckedIndexedAccess` the compiler
  insists you handle it.
- **`validateCartLine` takes `unknown` and returns a union.** The `ok: true` /
  `ok: false` shape means the caller cannot use `line` without checking `ok` first
  — the type system enforces the runtime check.
- **`assertNever` is the tripwire.** It makes "I forgot to handle a new variant" a
  compile error rather than a silent fallthrough.
- **`CartLine` is a tuple**, so destructuring `const [productId, quantity] = line`
  gives you the right types in the right order — the same mechanism `useState`
  relies on.

### Challenge

Write `ts-playground/src/type-zoo.ts`: a **deliberate tour of type pitfalls**.
The purpose is to build the instinct for what to write and what to avoid. For each
item, write the code, then add a comment describing what the compiler says.

Requirements:

1. Demonstrate the difference between `any` and `unknown` by writing **the same
   function twice** (`parseUserFromApi`), once with `any` and once with `unknown`.
   Show that the `any` version compiles and crashes, and the `unknown` version
   requires narrowing. Use a small `getRawUser()` helper that returns
   `Promise<unknown>` with a deliberately wrong shape at runtime (e.g. `{ user_name: 'Ada' }`).
2. Show three ways to derive a union from a value:
   - from an array with `as const` and `(typeof X)[number]`;
   - from an object with `keyof typeof`;
   - from an object with `(typeof X)[keyof typeof]`.
3. Demonstrate the three effects of `as const` (literals kept, readonly added,
   arrays become tuples) by comparing a plain object with its `as const` twin.
4. Show the "fresh object literal excess property check" behaviour: a literal with
   an extra property fails, a variable with the same extra property does not.
5. Show the `{}` trap: a function typed `(value: {})` accepting a string and a
   number, and the corrected version using a real shape.
6. Show the index-signature lie: a `Record<string, number>` returning `undefined`
   at runtime while the type claims `number`, and how `?? 0` and
   `noUncheckedIndexedAccess` change the story.
7. Finish with a table (as a console output or comments) listing every type you
   demonstrated and the one-line rule for when to use it.

**Solution**

```text
ts-playground/src/type-zoo.ts
```

```ts
// ============================================================ 1. any vs unknown

/** Pretends to be an API that returns an unexpected shape. */
async function getRawUser(): Promise<unknown> {
  return { user_name: 'Ada' }; // ⚠️ NOT { name: 'Ada' } — the type says one thing,
                               //    the data says another
}

interface User {
  id: number;
  name: string;
}

// ---- ⚠️ the `any` version: compiles, crashes
async function parseUserFromApiWithAny(): Promise<string> {
  const data: any = await getRawUser();
  // Nothing here is checked. TypeScript is happy.
  return data.name.toUpperCase();          // runtime: TypeError: Cannot read properties of undefined
}

// ---- ✅ the `unknown` version: the compiler forces the checks
async function parseUserFromApiUnknown(): Promise<User | null> {
  const data: unknown = await getRawUser();

  if (typeof data !== 'object' || data === null) return null;

  const record = data as Record<string, unknown>;
  const rawName = record['name'] ?? record['user_name'];   // tolerate the legacy field

  if (typeof rawName !== 'string' || rawName.trim() === '') return null;

  const id = typeof record['id'] === 'number' ? record['id'] : 0;

  return { id, name: rawName.trim() };
}

// ============================================================ 2. deriving unions

// (a) array → union via (typeof X)[number]
const ROLES = ['admin', 'editor', 'viewer'] as const;
type Role = (typeof ROLES)[number];          // 'admin' | 'editor' | 'viewer'

// (b) object → union of its KEYS via keyof typeof
const SIZES = { sm: 4, md: 8, lg: 16 } as const;
type SizeKey = keyof typeof SIZES;           // 'sm' | 'md' | 'lg'

// (c) object → union of its VALUES via (typeof X)[keyof typeof X]
const STATUS = { idle: 'IDLE', loading: 'LOADING', error: 'ERROR' } as const;
type StatusValue = (typeof STATUS)[keyof typeof STATUS];  // 'IDLE' | 'LOADING' | 'ERROR'

// Both derived unions are genuinely useful, not just demonstrations:
const sizeKey: SizeKey = 'md';        // ✅ 'sm' | 'md' | 'lg' — 'xl' would be an error
const status: StatusValue = 'IDLE';   // ✅ 'IDLE' | 'LOADING' | 'ERROR'

// Note the difference: (b) is the keys, (c) is the values. Confusing them is a
// classic mistake — the error message usually mentions the wrong union entirely.

function roleBadge(role: Role): string {
  switch (role) {
    case 'admin':
      return '🛡️ Admin';
    case 'editor':
      return '✏️ Editor';
    case 'viewer':
      return '👀 Viewer';
    default: {
      const unreachable: never = role;
      return unreachable;
    }
  }
}

// ============================================================ 3. as const effects

const looseTheme = { name: 'dark', levels: [1, 2] };
// → { name: string; levels: number[] }

const strictTheme = { name: 'dark', levels: [1, 2] } as const;
// → { readonly name: "dark"; readonly levels: readonly [1, 2] }

// Effect A: literals are kept        → name: "dark" instead of string
// Effect B: readonly is added        → cannot reassign or push
// Effect C: arrays become tuples     → readonly [1, 2] instead of number[]

// ============================================================ 4. excess property check

interface Point {
  x: number;
  y: number;
}

function printPoint(point: Point): string {
  return `(${point.x}, ${point.y})`;
}

const pointWithExtra = { x: 1, y: 2, z: 3 };   // a variable: extra props allowed

// printPoint({ x: 1, y: 2, z: 3 });
//    ❌ TS2353: Object literal may only specify known properties, and 'z' does not
//       exist in type 'Point'.        ← FRESH LITERAL: extra props are an error
//
// printPoint(pointWithExtra);
//    ✅ OK — structural typing: it HAS x and y, so it IS a Point

// ============================================================ 5. the `{}` trap

function logAnything(value: {}) {
  return `received: ${typeof value}`;
}

logAnything('a string');   // ✅ compiles — `{}` accepts any non-null value
logAnything(42);           // ✅ compiles
logAnything(true);         // ✅ compiles
// logAnything(null);      // ❌ only null/undefined are rejected

// ✅ Say what you actually mean:
function logObject(value: Record<string, unknown>) {
  return `object with ${Object.keys(value).length} keys`;
}

function logNonPrimitive(value: object) {
  return `non-primitive: ${Object.keys(value).length}`;
}

// logNonPrimitive('nope');  // ❌ TS2345: Argument of type 'string' is not assignable
//                           //    to parameter of type 'object'

// ============================================================ 6. index signature lie

const stockByWarehouse: Record<string, number> = { pune: 4, mumbai: 2 };

// With noUncheckedIndexedAccess OFF, this type is a promise TypeScript cannot keep:
const delhiStock = stockByWarehouse['delhi'];
console.log('typed as number, actually:', delhiStock);            // undefined 😖
console.log('attempting maths on it:', delhiStock + 1);           // NaN 😖

// With noUncheckedIndexedAccess ON, `delhiStock` becomes `number | undefined`
// and the line above is a compile error until you handle it:
const safeDelhiStock = stockByWarehouse['delhi'] ?? 0;
console.log('with the guard:', safeDelhiStock + 1);                // 1 ✅

// For dynamic keys, a Map is often the honest choice:
const stockMap = new Map<string, number>([['pune', 4], ['mumbai', 2]]);
console.log('map lookup:', stockMap.get('delhi'));                 // undefined (honest type!)

// ============================================================ 7. demo + cheat table

async function main(): Promise<void> {
  console.log('--- any version (will crash) ---');
  try {
    console.log(await parseUserFromApiWithAny());
  } catch (error) {
    console.log('crashed:', error instanceof Error ? error.message : error);
  }

  console.log('\n--- unknown version (safe) ---');
  console.log(await parseUserFromApiUnknown());   // { id: 0, name: 'Ada' }

  console.log('\n--- derived unions ---');
  console.log(roleBadge('admin'));                // 🛡️ Admin
  console.log('roles:', ROLES.join(', '));        // admin, editor, viewer
  console.log('statuses:', Object.values(STATUS).join(', ')); // IDLE, LOADING, ERROR
  console.log('size key:', sizeKey, '=', SIZES[sizeKey]);      // md = 8
  console.log('status value:', status);                       // IDLE

  console.log('\n--- as const ---');
  console.log(strictTheme.name, strictTheme.levels);

  console.log('\n--- structural vs fresh literal ---');
  console.log(printPoint({ x: 1, y: 2 }));        // (1, 2)
  console.log(printPoint(pointWithExtra));        // (1, 2)

  console.log('\n--- {} trap ---');
  console.log(logAnything('a string'), '|', logAnything(42));
  console.log(logObject({ a: 1, b: 2 }));
  console.log(logNonPrimitive({ a: 1 }));         // non-primitive: 1

  console.log('\n--- index signature ---');
  console.log('delhiStock:', delhiStock, '| safe:', safeDelhiStock);
  console.log('map lookup:', stockMap.get('delhi'));

  console.log('\n===== WHEN TO USE WHAT =====');
  const table: Array<[string, string]> = [
    ['string / number / boolean', 'primitive values — lowercase only'],
    ['T | null', 'a value that may genuinely be absent'],
    ['T[]', 'a list of unknown length'],
    ['[A, B]', 'a fixed, positional pair — like useState'],
    ['{ a: A; b: B }', 'a known object shape (name it with interface/type)'],
    ['Record<string, V>', 'dynamic keys — but remember the `undefined` lie'],
    ['Map<K, V>', 'dynamic keys where existence matters'],
    ['readonly T[]', 'you promise not to mutate'],
    ['as const', 'you want literals, readonly and tuples'],
    ['unknown', 'anything from outside your program'],
    ['never', 'unreachable code and exhaustiveness checks'],
    ['void', 'a function called for its side effects'],
    ['any', 'almost never — it disables checking'],
  ];
  for (const [type, rule] of table) {
    console.log(`${type.padEnd(28)} ${rule}`);
  }
}

main().catch((error) => console.error('unexpected:', error));
```

**Expected output**

```text
--- any version (will crash) ---
crashed: Cannot read properties of undefined (reading 'toUpperCase')

--- unknown version (safe) ---
{ id: 0, name: 'Ada' }

--- derived unions ---
🛡️ Admin
roles: admin, editor, viewer
statuses: IDLE, LOADING, ERROR
size key: md = 8
status value: IDLE

--- as const ---
dark [ 1, 2 ]

--- structural vs fresh literal ---
(1, 2)
(1, 2)

--- {} trap ---
received: string | received: number
object with 2 keys
non-primitive: 1

--- index signature ---
delhiStock: undefined | safe: 0
map lookup: undefined

===== WHEN TO USE WHAT =====
string / number / boolean    primitive values — lowercase only
T | null                     a value that may genuinely be absent
T[]                          a list of unknown length
[A, B]                       a fixed, positional pair — like useState
{ a: A; b: B }               a known object shape (name it with interface/type)
Record<string, V>            dynamic keys — but remember the `undefined` lie
Map<K, V>                    dynamic keys where existence matters
readonly T[]                 you promise not to mutate
as const                     you want literals, readonly and tuples
unknown                      anything from outside your program
never                        unreachable code and exhaustiveness checks
void                         a function called for its side effects
any                          almost never — it disables checking
```

> Note the crash message: `Cannot read properties of undefined (reading 'toUpperCase')`.
> The **`any` version compiled perfectly** — that is the whole lesson. TypeScript
> did not fail you; the `any` annotation did.

---

## 12. Summary

- Seven **primitives**, all lowercase: `string`, `number`, `boolean`, `null`,
  `undefined`, `symbol`, `bigint`. Never the capitalised wrapper types.
- **`const` keeps literal types; `let` widens.** Arrays and object properties widen
  their contents because they are mutable.
- **`as const`** stops widening, adds **deep readonly**, and turns arrays into
  **tuples**. `Object.freeze` is shallower (top level only).
- **Arrays**: `T[]` or `Array<T>`. Turn on `noUncheckedIndexedAccess` so `arr[0]`
  admits it can be `undefined`; `.at()` is honest either way.
- **Tuples** type fixed positional data — which is why `const [count, setCount] =
  useState(0)` is typed correctly.
- **Objects** are matched **structurally**. Fresh literals get an excess property
  check; variables with extra properties do not.
- **Optional (`?`)** and **`| undefined`** are different: absent vs present-but-empty.
- **`Record<K, V>`** and index signatures type dynamic keys — and lie unless you
  enable `noUncheckedIndexedAccess`.
- **Function types**: `(a: A) => B`, `void` for side-effect functions, `Promise<T>`
  for async (TypeScript unwraps nested promises).
- **`any` disables checking and spreads.** **`unknown`** is the safe version and
  forces narrowing. **`never`** marks unreachable code and powers exhaustiveness
  checks via `assertNever`.
- `{}` accepts any non-null value — a real trap. Use `Record<string, never>` or a
  named shape.

**What's next →** [`03-interfaces.md`](./03-interfaces.md): naming those object
shapes properly — optional and readonly properties, extending interfaces, and the
interface you will write first in every React component: its **props**.
