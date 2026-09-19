# 06 — Functions

> **Part 2 · TypeScript · File 6 of 11**
>
> **Why this file exists:** React is a library of functions that call other
> functions. `onClick`, `setState`, `useEffect`, `.map`, API wrappers, custom
> hooks — all of them are functions passed to functions. If you can type a
> function confidently, you can type half of React's API without looking it up.
> This file also covers the two rules that surprise everybody: **`void` in
> callback positions** and **arity/parameter compatibility**.

---

## 1. The four ways to write a function

```ts
// 1. Declaration — hoisted, has its own `this`, usable before its definition
function add(a: number, b: number): number {
  return a + b;
}

// 2. Function expression — not hoisted
const subtract = function (a: number, b: number): number {
  return a - b;
};

// 3. Arrow function — no own `this`, no `arguments`, shortest form
const multiply = (a: number, b: number): number => a * b;

// 4. Method — shorthand inside an object; has its own `this`
const calculator = {
  total: 0,
  addToTotal(this: { total: number }, n: number): void {
    this.total += n;
  },
};
```

**Which one, in TypeScript + React?**

| Form | Use it for | Why |
| --- | --- | --- |
| Declaration | top-level helpers, reducers, `async function` | hoisting; reads as "this is the algorithm" |
| Arrow | callbacks, event handlers, anything passed as a prop | no `this` surprises; shortest |
| Function expression | rare — when you want a *named* arrow-like function expression | avoid; arrows or declarations cover it |
| Method | objects and classes; the `this`-based API of a store | `this` is explicitly typed |

**The pragmatic default in React:** `function Component()` for components (readable
stack traces, hoisted), `const handler = () => {}` for handlers. Everything else in
this file applies to both.

### Return type annotations: when to write them

TypeScript infers return types. Writing them anyway is a choice — with clear
trade-offs (this is the same "explicit vs inferred" tension from file 2):

```ts
// Inferred: fine for a one-line function
const double = (n: number) => n * 2;      // inferred: (n: number) => number

// Explicit: valuable when the body is complex or the type is the contract
function parseOrder(raw: string): Result<Order> { /* ... */ }
```

Write the return type when:

- the function is **exported** from a module (the annotation becomes documentation
  and prevents accidental widening);
- it returns a **union** or a **discriminated union** (file 5) — inference often
  picks the wrong member;
- it returns `void`, `never`, a `Promise`, or an object literal you want shaped a
  particular way;
- you want the *body* to be checked against the contract (a common source of
  "that is not what I meant" bugs).

Skip it for tiny local callbacks. Do not skip it for library code.

---

## 2. Parameters: the full toolbox

### Required, optional, and default

```ts
function greet(name: string, title?: string, punctuation: string = '!'): string {
  return `${title ? `${title} ` : ''}${name}${punctuation}`;
}

greet('Ada');                                          // "Ada!"
greet('Ada', 'Dr.');                                   // "Dr. Ada!"
greet('Ada', 'Dr.', '?');                              // "Dr. Ada?"
greet('Ada', undefined, '?');                           // "Ada?"  ← undefined triggers the default
```

Two rules worth memorising:

1. **A required parameter cannot follow an optional one.**

   ```ts
   function bad(a?: string, b: number): string { return `${a}${b}`; }
   // TS1016: A required parameter cannot follow an optional parameter.
   ```

   This is not TypeScript being fussy: with an optional first parameter, `bad(1)`
   is ambiguous — is `1` the `a` or the `b`?

2. **An optional parameter accepts `undefined` but not `null`.**

   ```ts
   greet('Ada', undefined);   // ✅
   // greet('Ada', null);     // ❌ TS2345: Argument of type 'null' is not assignable to parameter of type 'string | undefined'
   ```

   (Under `exactOptionalPropertyTypes`, this is the *parameter* rule; the
   *property* rule from file 3 is stricter still.)

### Rest parameters

```ts
const sum = (...nums: number[]): number => nums.reduce((total, n) => total + n, 0);
sum(1, 2, 3);          // 6
sum();                 // 0
// sum('nope');        // ❌ TS2345: Argument of type 'string' is not assignable to parameter of type 'number'
```

A **tuple** rest parameter types a fixed-shape variadic call — this is how
`console.log`-style APIs and React's own overloads are described:

```ts
const pair = (...args: [string, number]): string => `${args[0]}=${args[1]}`;
pair('age', 30);       // "age=30"
// pair('age');        // ❌ TS2554: Expected 2 arguments, but got 1.
```

### Destructured parameters (the React workhorse)

```ts
interface Product { id: string; name: string; priceMinor: number; tags?: string[] }

function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  return compact ? product.name : `${product.name} — ${product.priceMinor}`;
}
```

Read this carefully, because it is **not** what beginners think it is:

- `({ product, compact = false })` is the **parameter pattern** — it destructures
  the first argument.
- `: { product: Product; compact?: boolean }` is the **type of that argument**.

The destructuring happens *after* the argument is received, so you must type the
**object**, not the individual variables. You cannot write `product: Product` in the
destructuring pattern of an untyped parameter — TS7031: *Binding element 'product'
implicitly has an 'any' type.*

```ts
// ❌ Wrong: this annotates the destructured *binding*, not the parameter
// function Bad({ product: Product }) {}   // "Product" is read as a rename!

// ✅ Right: annotate the argument (usually with a named interface)
interface CardProps { product: Product; compact?: boolean }
function Card({ product, compact = false }: CardProps) { /* ... */ }
```

> 💡 **Naming convention used throughout these notes:** the interface is `Props`
> for a component, `…Options` for a configuration object, `…Args` for a tuple.
> `function Card({ product }: CardProps)` — one interface per component, defined
> directly above it, exported only when a parent needs to type its own props.

### Parameter names are part of your API

For callbacks, parameter **names** are documentation in the editor:

```ts
type Sort = (a: string, b: string) => number;      // vague
type Compare = (left: string, right: string) => number;  // clearer intent
```

React's own types do this: `setState` is typed as
`(prevState: S) => S` — the name tells you it receives the previous state.

---

## 3. Return types: `void`, `undefined`, `never`, `Promise`

```ts
function log(message: string): void { console.log(message); }         // returns nothing
function fail(message: string): never { throw new Error(message); }   // never returns
async function load(id: string): Promise<Product> { /* ... */ }       // returns later
function maybe(): string | undefined { return undefined; }             // returns "nothing" as a value
```

| Type | Meaning | Caller may use the value? |
| --- | --- | --- |
| `void` | "I return nothing, ignore it" | no |
| `undefined` | "the value is `undefined`" | yes (it is `undefined`) |
| `never` | "this call never completes normally" | no — the line after is unreachable |
| `Promise<T>` | "a `T` arrives later" | not directly; `await` it |

`never` is how `assertNever` works (file 5) and how you type a function that
always throws — the compiler then knows the code after it is dead.

### `void` is special in *callback* positions

This is the rule that makes React's API pleasant, and it is genuinely surprising:

```ts
type Handler = () => void;
const h: Handler = () => 42;         // ✅ ALLOWED — the return value is ignored
```

Compare with the *value* type `undefined`:

```ts
type Cb = (n: number) => undefined;
const c2: Cb = (n) => n * 2;
// ❌ TS2322: Type 'number' is not assignable to type 'undefined'
```

**Why the difference?** `void` in a callback position means "I will not look at
your return value". That is deliberate and it is what lets you write:

```ts
[1, 2, 3].forEach((n) => products.push(n));   // push returns a number — ignored
<button onClick={() => setCount((c) => c + 1)}>+</button>   // setCount returns void
```

Without the `void` exception you would have to wrap every side-effecting callback
in braces. So when you write a callback prop, **use `void`**:

```ts
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;          // ✅ caller may write () => doSomething() or () => { ... }
  onConfirm: () => void;
  // onConfirm: () => undefined; // ❌ needlessly strict: rejects `() => save()` if save returns a value
}
```

> ⚠️ **Do not** type callback props as `() => undefined` or `() => any`. `undefined`
> rejects every useful inline handler; `any` throws away checking entirely. `void`
> is the one that means "I don't care what you return".

---

## 4. Function types: aliases, interfaces, and callable objects

```ts
// Type alias — the usual choice, and it composes well with unions
type Validator = (value: string) => string | null;

// Interface with a call signature — needed when the function also has properties
interface Throttled {
  (): void;
  cancel(): void;
}
```

Both describe "a function with these parameters and this return type". Prefer the
**type alias** for plain callbacks (it reads better in most positions and works
with `|`/`&`); use the **call-signature interface** when you also need properties:

```ts
interface Store<T> {
  getState(): T;                 // (generics are file 7 — this is the shape)
  subscribe(listener: (state: T) => void): () => void;
  dispatch: (action: unknown) => void;   // property form also works
}
```

### Method syntax vs property syntax (a subtle, real difference)

```ts
type WithMethod = { handle(e: ClickEvent): void };    // method shorthand
type WithProp = { handle: (e: ClickEvent) => void };  // property holding a function
```

Under `strictFunctionTypes`, **property syntax checks parameters contravariantly**
(you may widen a parameter, not narrow it), while **method syntax is bivariant**
(both directions are accepted). Verified in the lab:

```ts
type ClickEvent = { type: 'click'; x: number };
type AnyEvent = { type: string };

// Property form: WIDENING the parameter is fine…
const wide: (e: ClickEvent) => void = (e: AnyEvent) => console.log(e.type);   // ✅

// …but NARROWING it is an error
const narrow: (e: AnyEvent) => void = (e: ClickEvent) => console.log(e.x);
// ❌ TS2322: Type '(e: ClickEvent) => void' is not assignable to type '(e: AnyEvent) => void'.

// Method form: BOTH directions compile (bivariance)
const m1: { handle(e: AnyEvent): void } = { handle(e: ClickEvent) { console.log(e.x); } };    // ✅
const m2: { handle(e: ClickEvent): void } = { handle(e: AnyEvent) { console.log(e.type); } }; // ✅
```

**Practical takeaway:** for callback props, use **property syntax**
(`onSelect: (id: string) => void`), because you *want* the stricter contravariant
check that catches a handler expecting a narrower event than you will pass.
React's `MouseEventHandler` used to rely on method bivariance, which is exactly
why `(e: React.MouseEvent<HTMLButtonElement>) => …` handlers were so forgiving —
and sometimes accidentally wrong.

### Arity: how many parameters may a callback declare?

```ts
type One = (a: number) => void;

const fewer: One = () => {};                      // ✅ fewer parameters is fine
const exact: One = (a: number) => {};             // ✅
const more: One = (a: number, b: number) => {};    // ❌
// TS2322: Type '(a: number, b: number) => void' is not assignable to type 'One'.
//   Target signature provides too few arguments. Expected 2 or more, but got 1.
```

The rule mirrors JavaScript reality: a callback is called with a fixed set of
arguments, so it may **ignore** some (declare fewer) but must never **demand**
more than it will receive. This is why `[1,2,3].map(() => 'x')` is legal — the
callback ignores `(value, index, array)` and returns `'xxx'`.

---

## 5. `this`: mostly history, still worth knowing

TypeScript can type the `this` a function requires as a **fake first parameter**:

```ts
function tag(this: HTMLElement, suffix: string): string {
  return `${this.tagName}${suffix}`;
}

declare const el: HTMLElement;
tag.call(el, '!');   // ✅ "DIV!"  (well — whatever tagName el has)
tag('!');
// ❌ TS2684: The 'this' context of type 'void' is not assignable to method's 'this' of type 'HTMLElement'.
```

And **arrow functions have no `this` of their own** — the classic beginner mistake
(and the reason class components needed `.bind`):

```ts
const counter = {
  count: 0,
  inc: () => { this.count += 1; },
  // ❌ TS2532: Object is possibly 'undefined'.
  //    (in a module, top-level `this` is `undefined` under `noImplicitThis`)
};
```

The arrow's `this` refers to the enclosing scope (here, the module), **not** to
`counter`. The method form works instead:

```ts
const counter = {
  count: 0,
  inc(this: { count: number }): void { this.count += 1; },
  asArrowProperty(this: { count: number }): () => number { return () => this.count; },
};
```

> 🏭 **Why this matters in React today:** class components used `this.setState`,
> which required either `bind` in the constructor or arrow-function class
> properties — and getting it wrong produced `Cannot read properties of undefined
> (reading 'setState')`. Function components have **no `this` at all**, which
> removed an entire category of bugs. You will still meet class components in old
> codebases (Part 18 covers reading them), and you still see `this` in DOM
> methods — `Array.prototype.push.call(...)` — which is where the typed `this`
> parameter is genuinely useful.

---

## 6. Overloads

An **overload** lets one function have several call signatures with different
parameter *and* return types. Write the signatures first, then one implementation
signature that must be compatible with all of them:

```ts
function fmt(value: string): string;
function fmt(value: number): string;
function fmt(value: string | number): string {
  return typeof value === 'string' ? value.toUpperCase() : value.toFixed(2);
}

fmt('a');    // string
fmt(1);      // string
fmt(true);
// ❌ TS2769: No overload matches this call.
//   Overload 1 of 2, '(value: string): string', gave the following error.
//     Argument of type 'boolean' is not assignable to parameter of type 'string'.
```

Two facts that bite people:

1. **The implementation signature is invisible to callers.** Only the listed
   overloads are callable — so widening the *implementation* does not widen the API:

   ```ts
   function fmt(value: string): string;
   function fmt(value: number): string;
   function fmt(value: string | number | boolean): string { /* ... */ }
   fmt(true);   // ❌ TS2769: still no overload matches
   ```

2. **Order matters.** TypeScript picks the *first* matching overload, so put the
   most specific signatures first (a common cause of "why does it return `string |
   number` when I passed a string?").

### Overloads vs alternatives — pick deliberately

| Situation | Best tool | Why |
| --- | --- | --- |
| Return **type** depends on an argument's literal value | **overload** | unions cannot vary the return type per argument |
| Same return type, arguments differ only in count | **optional / default parameters** | one signature, no duplication |
| Arguments are a simple union (`string \| number`) | **union parameter** | callers get one clear error, not a list |
| Discriminated object argument (`{ kind: 'a', … } \| { kind: 'b', … }`) | **discriminated union** | better editor support, exhaustiveness checks |
| Many combinations of optional flags | **options object** | named arguments, extensible, no combinatorics |

```ts
// ❌ Overloads used where an optional parameter would do
function greet(name: string): string;
function greet(name: string, title: string): string;
function greet(name: string, title?: string): string {
  return title ? `${title} ${name}` : name;
}

// ✅ One signature says the same thing
function greet(name: string, title?: string): string {
  return title ? `${title} ${name}` : name;
}
```

The intermediate exercise below uses an overload for a case where it is genuinely
right: `pick(issues, 'first')` returns `ValidationIssue | null`, while
`pick(issues, 'all')` returns `ValidationIssue[]`. A single union return would
force every caller to narrow.

---

## 7. Higher-order functions and closures

A **higher-order function** takes or returns a function. The types are exactly what
you expect — one function type in, one function type out:

```ts
type Middleware = (request: Request, next: (r: Request) => Response) => Response;

function withAuth(token: string): Middleware {
  // `token` is captured by the closure; the returned function "remembers" it
  return (request, next) => {
    if (request.headers.Authorization !== `Bearer ${token}`) {
      return { status: 401, body: 'Unauthorized', headers: {} };
    }
    return next(request);
  };
}
```

Two things to notice:

- The **returned** function's type is inferred from the declared return type of
  `withAuth` (`Middleware`). Annotating the factory's return type is what makes the
  closure's parameters (`request`, `next`) infer correctly instead of needing
  annotations of their own.
- **The closure's captured values are not part of the function type.** `withAuth('a')`
  and `withAuth('b')` have the same type, `Middleware`. This is how React
  callbacks remember state — and how stale closures cause bugs (Part 4).

`compose` is the canonical example, and it shows why parameter ordering matters:

```ts
function compose(middlewares: readonly Middleware[], transport: Next): Next {
  return middlewares.reduceRight<Next>(
    (next, middleware) => (request) => middleware(request, next),
    transport
  );
}
```

`reduceRight` builds the chain from the **last** middleware inwards, so the last
element is closest to the network and runs **last** on the way out. Change the
array order and behaviour changes — verified in the challenge below.

---

## 8. Function utilities you will use before file 10

You can *extract* types from functions (file 10 covers the full set):

```ts
function makeClient(baseUrl: string, retries: number): Promise<Response> { /* ... */ }

type ClientArgs = Parameters<typeof makeClient>;   // [baseUrl: string, retries: number]
type ClientReturn = ReturnType<typeof makeClient>; // Promise<Response>
type Resolved = Awaited<ClientReturn>;             // Response

const args: ClientArgs = ['https://api.example.com', 2];
```

`typeof makeClient` is the *value* used in a *type* position — the bridge between
the two worlds. Keep these three in your back pocket; they remove a surprising
amount of duplicated typing (and file 11 uses them for event handlers).

---

## 9. Common mistakes

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Optional param before a required one | `TS1016: A required parameter cannot follow an optional parameter` | reorder, or make the trailing one optional too |
| Typing a callback prop as `() => undefined` | Inline handlers like `() => save()` rejected | use `() => void` |
| Assuming `void` forbids returning a value | Confusion when `() => 42` is accepted | `void` means "value ignored", not "no value" |
| Destructuring with a rename by accident (`{ product: Product }`) | `Property 'Product' does not exist` | annotate the **parameter**, not the binding |
| Object literal param untyped | `TS7031: Binding element implicitly has an 'any' type` | declare a `…Props` interface |
| Passing a handler that declares more parameters than it will get | `TS2322 … Target signature provides too few arguments` | declare only the parameters you use |
| Adding an overload whose implementation signature callers use | `TS2769: No overload matches this call` | list every public signature explicitly |
| Overload list ordered general-first | Wrong overload chosen; surprising return type | specific signatures first |
| Overloads for a problem an optional param solves | Duplicated signatures, no added safety | use `?`/defaults instead |
| Writing `function` and relying on `this` inside an arrow | `TS2532: Object is possibly 'undefined'` | use a method or capture `this` in a const |
| Forgetting `return` in a block-bodied arrow | Inferred `void`; caller gets `undefined` | use a concise body or add `return` |
| Unused parameter names | `TS6133: 'a' is declared but its value is never read` (with `noUnusedParameters`) | prefix with `_` |
| Annotating every parameter *and* every return in callbacks | Noise; inference already works | annotate the **function type**, let parameters infer |
| Factory return type not annotated | Closure params become implicitly `any` | annotate the factory: `(): Middleware =>` |

---

## 10. Practice exercises

### Beginner

1. Predict which calls compile, then check with `tsc`:

```ts
function join(parts: string[], separator: string = ', ', limit?: number): string {
  const slice = limit === undefined ? parts : parts.slice(0, limit);
  return slice.join(separator);
}

join(['a', 'b']);
join(['a', 'b'], '-');
join(['a', 'b'], '-', 1);
join(['a', 'b'], undefined, 1);
join(['a', 'b'], '-', undefined);
join(['a', 'b'], null);
```

2. Explain why `type Save = () => void` accepts `() => Promise<void>` — and why
   that is convenient for React handlers but *dangerous* for anything that needs
   to await the result.

3. Fix all three errors (there are three different codes):

```ts
type Click = (event: { type: string }) => void;
const h1: Click = (event: { type: 'click'; x: number }) => console.log(event.x);
const h2: Click = (event) => console.log(event.type, event.y);
const h3: Click = (event, extra: number) => console.log(event.type, extra);
```

**Solution**

```text
join(['a', 'b']);                    ✅ "a, b"
join(['a', 'b'], '-');               ✅ "a-b"
join(['a', 'b'], '-', 1);            ✅ "a"
join(['a', 'b'], undefined, 1);      ✅ "a"      ← undefined triggers the default
join(['a', 'b'], '-', undefined);    ✅ "a-b"    ← limit stays undefined → no slicing
join(['a', 'b'], null);              ❌ TS2345: Argument of type 'null' is not
                                        assignable to parameter of type 'string | undefined'
```

**2.** `() => Promise<void>` is assignable to `() => void` because the `void`
callback rule ignores return values. It is convenient because you can pass
`onClick={async () => { await save(); }}` without the prop having to promise
anything. It is dangerous because **the caller cannot await the handler**: React
will not wait, errors inside the async function become unhandled promise
rejections, and the UI updates before the save finishes. If the caller must know
when it is done, type the prop explicitly:

```ts
interface Props { onSave: () => Promise<void> }   // now callers must return a promise
```

**3. Fixes**

```ts
type Click = (event: { type: string }) => void;

// ❌ h1 narrows the parameter: (event: { type: 'click'; x: number }) is not
//    assignable to (event: { type: string }) — see section 4's contravariance rule.
//    TS2322: Type '(event: { type: "click"; x: number; }) => void' is not
//            assignable to type 'Click'.
const h1: Click = (event) => console.log(event.type);

// ❌ h2 reads `event.y`, which does not exist on { type: string }.
//    TS2339: Property 'y' does not exist on type '{ type: string; }'.
const h2: Click = (event) => console.log(event.type);

// ❌ h3 declares MORE parameters than the callback will receive.
//    TS2322: Type '(event: { type: string; }, extra: number) => void' is not
//            assignable to type 'Click'. Target signature provides too few
//            arguments. Expected 2 or more, but got 1.
const h3: Click = (event) => console.log(event.type);
```

The single lesson: **a callback must accept whatever the caller passes and may use
only what it is given.** Declare fewer parameters, never narrower ones.

### Intermediate

Build a **typed validation engine** for an order form. This is the pattern behind
form libraries like React Hook Form (Part 8) — rules as values, a factory, and
callbacks.

```text
ts-playground/src/validators.ts
```

Requirements:

1. `OrderForm` = `{ customerName: string; email: string; quantity: number; couponCode?: string | undefined }`.
2. `FieldName` = a union of the four field names.
3. `ValidationIssue` = `{ field: FieldName; message: string; severity: 'error' | 'warning' }`.
4. `type Rule = (form: OrderForm) => ValidationIssue | null` — a rule returns an
   issue or `null`.
5. Rule factories: `requiredText(field, message?, severity = 'error')`,
   `matches(field, pattern, message)`, `inRange(field, min, max, severity = 'error')`,
   and `custom(field, predicate, message, severity = 'error')` where `predicate` is
   typed as **returning `boolean`** (not `void`).
6. `runRules(form, rules, onEach?)` returns `ValidationIssue[]` and calls the
   **optional** `onEach(issue, index)` callback. `onEach` must be typed `=> void`.
7. `makeValidator(rules)` returns a function `(form) => { ok, issues }`, where
   `ok` is true when there are no `'error'`-severity issues.
8. `blockingErrors(issues)` and `formatIssues(issues, bullet = '•')` — both accept
   `readonly` arrays.
9. An **overloaded** `pick(issues, which)` where `'first'` returns
   `ValidationIssue | null` and `'all'` returns `ValidationIssue[]`.
10. Demo three forms (valid, multiple problems, empty name) printing `ok`, the
    formatted issues, the blocking-error count, and the first issue.

**Solution**

```text
ts-playground/src/validators.ts
```

```ts
export {};

// ---------------------------------------------------------------- domain
interface OrderForm {
  customerName: string;
  email: string;
  quantity: number;
  couponCode?: string | undefined;
}

type FieldName = 'customerName' | 'email' | 'quantity' | 'couponCode';

interface ValidationIssue {
  field: FieldName;
  message: string;
  severity: 'error' | 'warning';
}

// ---------------------------------------------------------------- the Rule type
// A rule is a function that takes the whole form and returns an issue, or null
// when the value is acceptable. Type aliases for function types read best here.
type Rule = (form: OrderForm) => ValidationIssue | null;

// ---------------------------------------------------------------- rule factories
// A factory returns a configured Rule. Optional parameters + defaults keep the
// call sites short without making the types loose.
function requiredText(
  field: 'customerName' | 'email',
  message?: string,
  severity: 'error' | 'warning' = 'error'
): Rule {
  return (form) => {
    const value = form[field];
    if (typeof value !== 'string' || value.trim() === '') {
      return { field, message: message ?? `${field} is required`, severity };
    }
    return null;
  };
}

function matches(field: 'email', pattern: RegExp, message: string): Rule {
  return (form) => {
    const value = form[field];
    if (value.trim() !== '' && !pattern.test(value)) {
      return { field, message, severity: 'error' };
    }
    return null;
  };
}

function inRange(field: 'quantity', min: number, max: number, severity: 'error' | 'warning' = 'error'): Rule {
  return (form) => {
    const value = form[field];
    if (value < min || value > max) {
      return { field, message: `${field} must be between ${min} and ${max} (got ${value})`, severity };
    }
    return null;
  };
}

// A rule built from a caller-supplied predicate — a callback parameter that
// RETURNS a value, so it must be typed as returning `boolean`, not `void`.
function custom(
  field: FieldName,
  predicate: (form: OrderForm) => boolean,
  message: string,
  severity: 'error' | 'warning' = 'error'
): Rule {
  return (form) => (predicate(form) ? null : { field, message, severity });
}

// ---------------------------------------------------------------- the engine
// Rest parameters: callers can pass as many rules as they like, comma-separated.
// `onEach` is a `void`-returning callback — returning a value where `void` is
// expected is allowed, which is why `issues.push` style callbacks work inline.
function runRules(
  form: OrderForm,
  rules: readonly Rule[],
  onEach?: (issue: ValidationIssue, index: number) => void
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    const issue = rule(form);
    if (issue !== null) {
      issues.push(issue);
      onEach?.(issue, issues.length - 1);
    }
  }
  return issues;
}

// Higher-order function: takes rules, returns a new function.
// The returned function's type is written explicitly so the intent is obvious.
function makeValidator(rules: readonly Rule[]): (form: OrderForm) => { ok: boolean; issues: ValidationIssue[] } {
  return (form) => {
    const issues = runRules(form, rules);
    return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
  };
}

function blockingErrors(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === 'error');
}

// Read-only array parameters accept both arrays and readonly arrays.
function formatIssues(issues: readonly ValidationIssue[], bullet = '•'): string {
  return issues.map((issue) => `${bullet} [${issue.severity}] ${issue.field}: ${issue.message}`).join('\n');
}

// ---------------------------------------------------------------- overloads
// The return TYPE depends on the first argument, so an overload is warranted:
// both branches cannot be expressed as one union without losing a caller-side
// guarantee (either "definitely an array" or "definitely an issue or null").
function pick(issues: readonly ValidationIssue[], which: 'first'): ValidationIssue | null;
function pick(issues: readonly ValidationIssue[], which: 'all'): ValidationIssue[];
function pick(issues: readonly ValidationIssue[], which: 'first' | 'all'): ValidationIssue | null | ValidationIssue[] {
  return which === 'first' ? issues[0] ?? null : [...issues];
}

// ---------------------------------------------------------------- demo
function main(): void {
  const rules: Rule[] = [
    requiredText('customerName'),
    requiredText('email', 'We need an email to send the receipt'),
    matches('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'That does not look like an email address'),
    inRange('quantity', 1, 10, 'warning'),
    custom(
      'couponCode',
      (form) => form.couponCode === undefined || form.couponCode.startsWith('SAVE'),
      'Coupon codes start with SAVE'
    ),
  ];

  const validate = makeValidator(rules);

  const forms: Array<{ label: string; form: OrderForm }> = [
    { label: 'valid', form: { customerName: 'Ada Lovelace', email: 'ada@example.com', quantity: 3 } },
    {
      label: 'invalid email + range + coupon',
      form: { customerName: 'Grace Hopper', email: 'grace@example', quantity: 25, couponCode: 'FREEBIE' },
    },
    { label: 'empty name', form: { customerName: '   ', email: '', quantity: 0 } },
  ];

  for (const { label, form } of forms) {
    const { ok, issues } = validate(form);
    console.log(`\n=== ${label} ===`);
    console.log(`ok: ${ok}`);

    // `onEach` is optional — omit it and the call still works
    const issuesWithTrace = runRules(form, rules, (issue, index) => {
      if (issue.severity === 'error' && index === 0) {
        console.log(`  first error found: ${issue.field}`);
      }
    });

    console.log(issuesWithTrace.length === 0 ? '  (no issues)' : formatIssues(issuesWithTrace, '  -'));
    console.log(`  blocking errors: ${blockingErrors(issuesWithTrace).length}`);
    console.log(`  validate() agrees with runRules(): ${issues.length === issuesWithTrace.length}`);

    // Overloads: `which` decides the return type
    const first = pick(issuesWithTrace, 'first');
    console.log(`  first issue: ${first === null ? 'none' : `${first.field} → ${first.message}`}`);
    const all = pick(issuesWithTrace, 'all');
    console.log(`  all issues: ${all.length}`);
  }

  console.log('\n=== reusing rules with a different engine ===');
  const strict = makeValidator([requiredText('customerName', undefined, 'warning')]);
  const result = strict({ customerName: '', email: 'x@y.z', quantity: 1 });
  console.log(`ok (warnings do not block): ${result.ok}`);
  console.log(formatIssues(result.issues, '  *'));
}

main();
```

**Run it**

```bash
npx tsx src/validators.ts
```

**Expected output**

```text

=== valid ===
ok: true
  (no issues)
  blocking errors: 0
  validate() agrees with runRules(): true
  first issue: none
  all issues: 0

=== invalid email + range + coupon ===
ok: false
  first error found: email
  - [error] email: That does not look like an email address
  - [warning] quantity: quantity must be between 1 and 10 (got 25)
  - [error] couponCode: Coupon codes start with SAVE
  blocking errors: 2
  validate() agrees with runRules(): true
  first issue: email → That does not look like an email address
  all issues: 3

=== empty name ===
ok: false
  first error found: customerName
  - [error] customerName: customerName is required
  - [error] email: We need an email to send the receipt
  - [warning] quantity: quantity must be between 1 and 10 (got 0)
  blocking errors: 2
  validate() agrees with runRules(): true
  first issue: customerName → customerName is required
  all issues: 3

=== reusing rules with a different engine ===
ok (warnings do not block): true
  * [warning] customerName: customerName is required
```

**Why each typing choice matters**

- **`Rule` is a type alias, not an interface** — rules get combined in arrays and
  occasionally unions, which aliases handle more naturally (file 4).
- **Factories return `Rule` and declare it explicitly** so the returned closure's
  parameters infer. Without the `: Rule` annotation, `return (form) => …` would
  leave `form` implicit.
- **`predicate: (form: OrderForm) => boolean`** — note this one is *not* `void`,
  because `custom` must use the returned value. Compare with `onEach: (…) => void`,
  which exists purely for its side effect. **Choose per parameter, based on whether
  you read the result.**
- **`message?: string` plus `message ?? \`${field} is required\``** — the optional
  parameter gives callers a default while still allowing an override, and
  `severity` uses a real default parameter so call sites stay short.
- **`onEach?.(issue, …)`** — optional call syntax; the type is `((…) => void) | undefined`,
  so the `?.` is required by the compiler.
- **`readonly ValidationIssue[]`** in the helpers means callers can pass a
  `readonly` array (as `makeValidator` does internally) without copying.
- **The overload on `pick`** is justified because the *return type* changes with the
  literal argument. Using one signature returning
  `ValidationIssue | null | ValidationIssue[]` would push a narrowing burden onto
  every caller for no benefit.

### Challenge

Build a **typed middleware pipeline** for an HTTP client. This is the same shape as
Express middleware, Redux middleware (Part 9), and `fetch` wrapper libraries — and
it is entirely an exercise in function types.

```text
ts-playground/src/api-pipeline.ts
```

Requirements:

1. `ApiRequest` = `{ method: 'GET' | 'POST'; path: string; headers: Record<string, string>; body?: string | undefined }`;
   `ApiResponse` = `{ status: number; body: string; headers: Record<string, string> }`.
2. `type Next = (request: ApiRequest) => ApiResponse` and
   `type Middleware = (request: ApiRequest, next: Next, options?: MiddlewareOptions) => ApiResponse`
   where `MiddlewareOptions = { label?: string | undefined; onNote?: (note: string) => void }`.
3. Middlewares:
   - `withLogging` — notes the request before and the response after calling `next`.
   - `withAuth(token)` — a **factory**; returns 401 without calling `next` when the
     `Authorization` header is wrong.
   - `withRetry({ maxAttempts?, shouldRetry?, onRetry? })` — calls `next` up to
     `maxAttempts` times while `shouldRetry(response)` is true.
   - `withTiming(onMeasured)` — measures and reports the duration.
   - `tap(effect)` — a factory taking a `void`-returning callback, for observation.
4. `compose(middlewares, transport, options?)` built with `reduceRight`, and
   `createClient(baseUrl, transport, ...middlewares)` returning a callable
   **interface** `Client` that accepts options.
5. An **overloaded** `summarise(response, 'line')` → `string` and
   `summarise(response, 'lines')` → `string[]`.
6. A `fakeTransport(failures)` that returns 503 for the first *N* calls of a given
   path, then 200 — keyed on the URL **pathname**.
7. Demo: an authenticated happy path, a blocked unauthenticated call, a flaky
   endpoint retried once, a POST retried twice, the **same middlewares in two
   different orders**, `tap`, the overload, and one method using a typed `this`.
8. Include a comment block listing the compile-time rejections (with error codes).

**Solution**

```text
ts-playground/src/api-pipeline.ts
```

```ts
export {};

// ---------------------------------------------------------------- types
interface ApiRequest {
  method: 'GET' | 'POST';
  path: string;
  headers: Record<string, string>;
  body?: string | undefined;
}

interface ApiResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

type Next = (request: ApiRequest) => ApiResponse;

interface MiddlewareOptions {
  label?: string | undefined;
  onNote?: (note: string) => void;
}

// A middleware is a higher-order function: it receives the rest of the chain as
// `next` and decides whether/when/how often to call it.
type Middleware = (request: ApiRequest, next: Next, options?: MiddlewareOptions) => ApiResponse;

// ---------------------------------------------------------------- middlewares
function withLogging(request: ApiRequest, next: Next, options: MiddlewareOptions = {}): ApiResponse {
  const tag = options.label ?? 'http';
  options.onNote?.(`→ ${request.method} ${request.path}`);
  const response = next(request);
  options.onNote?.(`← ${response.status} ${request.method} ${request.path} (${tag})`);
  return response;
}

function withAuth(token: string): Middleware {
  return (request, next) => {
    if (request.headers.Authorization !== `Bearer ${token}`) {
      return { status: 401, body: 'Unauthorized', headers: {} };
    }
    return next(request);
  };
}

// A void-returning callback (`onRetry`) is perfect here: the middleware only
// needs the side effect, never a value back.
function withRetry(
  options: { maxAttempts?: number; shouldRetry?: (response: ApiResponse) => boolean; onRetry?: (attempt: number, response: ApiResponse) => void } = {}
): Middleware {
  const maxAttempts = options.maxAttempts ?? 3;
  const shouldRetry = options.shouldRetry ?? ((response: ApiResponse) => response.status >= 500);
  const onRetry = options.onRetry;

  return (request, next) => {
    let response = next(request);
    let attempt = 1;
    while (attempt < maxAttempts && shouldRetry(response)) {
      onRetry?.(attempt, response);
      attempt += 1;
      response = next(request);
    }
    return response;
  };
}

function withTiming(onMeasured: (path: string, ms: number) => void): Middleware {
  return (request, next) => {
    const startedAt = Date.now();
    const response = next(request);
    onMeasured(request.path, Date.now() - startedAt);
    return response;
  };
}

function tap(effect: (request: ApiRequest) => void): Middleware {
  return (request, next) => {
    effect(request);
    return next(request);
  };
}

// ---------------------------------------------------------------- composition
// reduceRight builds the chain from the inside out: the LAST middleware in the
// array is the one closest to the transport, so it runs last on the way in.
function compose(middlewares: readonly Middleware[], transport: Next, options?: MiddlewareOptions): Next {
  // Each middleware needs the SAME options object, so compose takes it once and
  // hands it to every link. (Forgetting this is how the first draft of this file
  // lost every log line — see the notes after the output.)
  return middlewares.reduceRight<Next>(
    (next, middleware) => (request) => middleware(request, next, options),
    transport
  );
}

// A callable interface: the client is a function that also documents its options.
interface Client {
  (request: ApiRequest, options?: MiddlewareOptions): ApiResponse;
}

function createClient(baseUrl: string, transport: Next, ...middlewares: Middleware[]): Client {
  return (request, options) => {
    const withBaseUrl: ApiRequest = { ...request, path: `${baseUrl}${request.path}` };
    return compose(middlewares, transport, options)(withBaseUrl);
  };
}

// ---------------------------------------------------------------- overloads
// The overloads differ in the RETURN type, which is the case overloads exist for.
function summarise(response: ApiResponse, format: 'line'): string;
function summarise(response: ApiResponse, format: 'lines'): string[];
function summarise(response: ApiResponse, format: 'line' | 'lines'): string | string[] {
  const lines = [
    `status: ${response.status}`,
    `body: ${response.body}`,
    `headers: ${Object.keys(response.headers).join(', ') || '(none)'}`,
  ];
  return format === 'line' ? lines.join(' | ') : lines;
}

// ---------------------------------------------------------------- fake transport
function fakeTransport(failures: Record<string, number>): Next {
  const remaining = { ...failures };
  return (request) => {
    // createClient prefixes the base URL, so key on the pathname — otherwise a
    // lookup of "GET /v1/flaky" never matches "GET https://…/v1/flaky" and the
    // injected failures silently do nothing.
    const key = `${request.method} ${new URL(request.path).pathname}`;
    remaining[key] = remaining[key] ?? 0;
    if ((remaining[key] ?? 0) > 0) {
      remaining[key] = (remaining[key] ?? 0) - 1;
      return { status: 503, body: 'Service unavailable', headers: { 'retry-after': '1' } };
    }
    return { status: 200, body: `ok: ${request.method} ${request.path}`, headers: { 'content-type': 'text/plain' } };
  };
}

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------- demo
function main(): void {
  const notes: string[] = [];
  const note = (line: string): void => {
    notes.push(line);
  };

  const transport = fakeTransport({
    'GET /orders': 0,
    'GET /v1/flaky': 1,     // fails once, then succeeds
    'POST /v1/orders': 2,   // fails twice, then succeeds
  });

  const base = createClient(
    'https://api.example.com',
    transport,
    withLogging,
    withTiming((path, ms) => note(`  timed ${path} in ${ms}ms`)),
    withAuth('secret-token'),
    withRetry({ maxAttempts: 3, onRetry: (attempt, response) => note(`  retrying after ${response.status} (attempt ${attempt})`) })
  );

  const run = (label: string, request: ApiRequest): void => {
    notes.length = 0;
    const response = base(request, { label: 'orders-api', onNote: note });
    console.log(`\n=== ${label} ===`);
    console.log(summarise(response, 'line'));
    for (const line of notes) console.log(line);
  };

  run('happy path, authenticated', {
    method: 'GET',
    path: '/orders',
    headers: bearer('secret-token'),
  });

  run('missing token is blocked by auth', {
    method: 'GET',
    path: '/orders',
    headers: {},
  });

  run('flaky endpoint retried once', {
    method: 'GET',
    path: '/v1/flaky',
    headers: bearer('secret-token'),
  });

  run('POST retried twice', {
    method: 'POST',
    path: '/v1/orders',
    headers: { ...bearer('secret-token'), 'content-type': 'application/json' },
    body: '{"item":"kbd"}',
  });

  // ---------------------------------------------------------------- order matters
  const unauthenticated: ApiRequest = { method: 'GET', path: '/orders', headers: {} };
  const transportFor401 = fakeTransport({ 'GET /orders': 3 });

  let retriesOutsideAuth = 0;
  const retryAnything = (response: ApiResponse): boolean => response.status !== 200;
  const authOutside = createClient('https://api.example.com', transportFor401, withAuth('secret-token'),
    withRetry({ maxAttempts: 3, shouldRetry: retryAnything,
      onRetry: () => { retriesOutsideAuth += 1; } }));
  const responseAuthOutside = authOutside(unauthenticated);

  let retriesInsideAuth = 0;
  const retryOutside = createClient('https://api.example.com', transportFor401,
    withRetry({ maxAttempts: 3, shouldRetry: retryAnything,
      onRetry: () => { retriesInsideAuth += 1; } }),
    withAuth('secret-token'));
  const responseRetryOutside = retryOutside(unauthenticated);

  console.log('\n=== the same middlewares, two different orders ===');
  console.log('  auth → retry :', `status ${responseAuthOutside.status},`,
    `retry callback fired ${retriesOutsideAuth} times`);

  console.log('  retry → auth :', `status ${responseRetryOutside.status},`,
    `retry callback fired ${retriesInsideAuth} times`);

  // ---------------------------------------------------------------- extras
  console.log('\n=== tap() sees the request before the chain ===');
  const seen: string[] = [];
  const inspector = createClient(
    'https://api.example.com',
    fakeTransport({}),
    tap((request) => seen.push(`${request.method} ${request.path}`)),
    withAuth('secret-token')
  );
  inspector({ method: 'POST', path: '/v1/orders', headers: bearer('secret-token'), body: '{}' });
  console.log('  tapped:', seen);

  console.log('\n=== overloaded summarise: lines ===');
  for (const line of summarise({ status: 201, body: 'created', headers: { location: '/v1/orders/9' } }, 'lines')) {
    console.log(`  ${line}`);
  }

  console.log('\n=== `this` in a method (a pattern from class-based React) ===');
  const counter = {
    calls: 0,
    record(this: { calls: number }, path: string): string {
      this.calls += 1;
      return `${path} (call #${this.calls})`;
    },
  };
  console.log(' ', counter.record('/orders'), counter.record('/users'));
  console.log('  calls:', counter.calls);
}

main();
```

**Run it**

```bash
npx tsx src/api-pipeline.ts
```

**Expected output**

```text

=== happy path, authenticated ===
status: 200 | body: ok: GET https://api.example.com/orders | headers: content-type
→ GET https://api.example.com/orders
  timed https://api.example.com/orders in 0ms
← 200 GET https://api.example.com/orders (orders-api)

=== missing token is blocked by auth ===
status: 401 | body: Unauthorized | headers: (none)
→ GET https://api.example.com/orders
  timed https://api.example.com/orders in 0ms
← 401 GET https://api.example.com/orders (orders-api)

=== flaky endpoint retried once ===
status: 200 | body: ok: GET https://api.example.com/v1/flaky | headers: content-type
→ GET https://api.example.com/v1/flaky
  retrying after 503 (attempt 1)
  timed https://api.example.com/v1/flaky in 0ms
← 200 GET https://api.example.com/v1/flaky (orders-api)

=== POST retried twice ===
status: 200 | body: ok: POST https://api.example.com/v1/orders | headers: content-type
→ POST https://api.example.com/v1/orders
  retrying after 503 (attempt 1)
  retrying after 503 (attempt 2)
  timed https://api.example.com/v1/orders in 0ms
← 200 POST https://api.example.com/v1/orders (orders-api)

=== the same middlewares, two different orders ===
  auth → retry : status 401, retry callback fired 0 times
  retry → auth : status 401, retry callback fired 2 times

=== tap() sees the request before the chain ===
  tapped: [ 'POST https://api.example.com/v1/orders' ]

=== overloaded summarise: lines ===
  status: 201
  body: created
  headers: location

=== `this` in a method (a pattern from class-based React) ===
  /orders (call #1) /users (call #2)
  calls: 2
```

**Five things to study in this output**

1. **The onion order.** For the flaky request, the notes appear as
   `→ GET …`, `retrying after 503 (attempt 1)`, `timed … in 0ms`, `← 200 …`.
   `withLogging` is the outermost middleware (first in the array), so its
   "response" note is printed **last**. `compose`'s `reduceRight` guarantees it.
2. **A middleware may call `next` zero times (auth) or many times (retry).** That
   is the whole power of the pattern: a middleware receives the rest of the chain
   as a value and decides what to do with it. Functions that receive functions can
   *control* them.
3. **Order changes behaviour, and the difference is measurable.** With the same
   two middlewares:
   - `auth → retry`: `status 401, retry callback fired 0 times` — auth short-circuits
     before retry ever runs.
   - `retry → auth`: `status 401, retry callback fired 2 times` — retry wraps auth,
     sees a non-200, and blindly retries the authentication failure.

   Nothing about the *types* changed; only the array order did. **Wrapping order is
   behaviour, not style.**
4. **`void` callbacks in action.** `onNote`, `onRetry` and `tap`'s `effect` are all
   typed `=> void`, so callers can pass `notes.push`-style expressions or
   `() => { retriesOutsideAuth += 1; }` freely.
5. **The overload earns its keep** in `summarise`: `'line'` gives a `string` you can
   `console.log` directly, `'lines'` gives an array you can iterate. One union
   return type would have forced a check at both call sites.

> 🐞 **Three real bugs found by running this example — all worth reading.**
>
> 1. **`MiddlewareOptions` was declared but never passed through the chain.**
>    `compose` originally called `middleware(request, next)` with no third
>    argument, so every middleware received `options === undefined`, and **not one
>    log line appeared**. The types were perfectly happy — the parameter is
>    optional. Fix: `compose(middlewares, transport, options)` threads one options
>    object into every link, and `Client` accepts it from the caller.
>    *Lesson: an optional parameter that is never supplied is a silent feature, and
>    the compiler will not warn you.*
> 2. **`fakeTransport` keyed its failure map on `'GET /v1/flaky'`, but the client
>    had already prefixed the base URL.** Every lookup missed, so no failure was
>    ever injected and the "retry" scenarios quietly succeeded on the first
>    attempt. Fix: key on `new URL(request.path).pathname`.
>    *Lesson: tests and demos that "pass" can be testing nothing. The retry notes
>    in the expected output are the proof that a retry actually happened.*
> 3. **The first version of the order comparison printed hard-coded text**
>    ("attempts: 1", "should not happen") instead of measuring. Fix: counters
>    incremented inside `onRetry`, printed afterwards — which is how
>    `retry callback fired 2 times` became a real measurement.
>    *Lesson: a comment claiming a behaviour is not evidence; a counter is.*

---

## 11. Summary

- Four forms: **declaration** (hoisted, own `this`), **expression**, **arrow** (no
  `this`), **method** (typed `this`). React uses declarations for components and
  arrows for handlers.
- **Annotate exported/api returns**; skip annotations on tiny local callbacks.
- Parameters: **optional** (`?`, accepts `undefined` not `null`), **default**
  (`=`, optional at the call site), **rest** (`...nums: number[]`), and **tuple
  rest** (`...[string, number]`).
- A required parameter **cannot follow** an optional one (`TS1016`).
- **Destructured parameters must be typed as a whole object** — the `: Type`
  annotates the argument, never the individual bindings.
- `void` in a **callback position** means "your return value is ignored" and
  accepts `() => 42`; `undefined` does not. Use `() => void` for callback props.
- **Property syntax** on function types checks parameters contravariantly (widening
  allowed, narrowing rejected); **method syntax** is bivariant. Prefer property
  syntax for props.
- A callback may declare **fewer** parameters than it receives, never more
  (`TS2322 … too few arguments`).
- **Overloads** are for when the *return type* depends on the arguments; for
  argument *counts* use optional/default parameters; for simple unions use a union
  parameter; the implementation signature is not callable from outside.
- **Higher-order functions** capture values in closures; the captured values are
  invisible in the function type — which is both how React callbacks remember state
  and how stale-closure bugs happen.
- `Parameters<typeof f>`, `ReturnType<typeof f>` and `Awaited<T>` extract types
  from values and promises (file 10 formalises them).

**What's next →** [`07-generics.md`](./07-generics.md): writing functions and types
that work over **many** types without losing information — including the generics
behind `useState`, `Array.prototype.map`, and every API hook you will write.
