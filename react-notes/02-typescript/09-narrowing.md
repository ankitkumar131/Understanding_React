# 09 — Narrowing

> **Part 2 · TypeScript · File 9 of 11**
>
> **Why this file exists:** every union you wrote in file 5 needs narrowing before
> you can use it, and every `unknown` you receive from an API needs narrowing before
> you can trust it. Narrowing is **the** daily skill of TypeScript: it is how the
> compiler follows your `if`s, and knowing its rules (and its four limits) is the
> difference between fighting the compiler and having it work for you.

---

## 1. What narrowing is

Narrowing is **control-flow analysis**: TypeScript re-computes the type of a
variable on every line, based on the checks you have performed.

```ts
function format(value: string | number): string {
  // here: value is string | number
  if (typeof value === 'string') {
    // here: value is string
    return value.toUpperCase();
  }
  // here: value is number  ← TypeScript subtracted the string case
  return value.toFixed(2);
}
```

The type is not fixed at declaration — it **evolves with the code path**, and it
narrows *and* widens back:

```ts
let width: string | number = '100px';

if (typeof width === 'number') {
  width.toFixed(1);          // number
} else {
  width.toUpperCase();       // string
}

width = 42;
width.toFixed(1);            // number — reassignment re-widened the type
```

Everything else in this file is a variation on that theme: *which checks does the
compiler understand, and where does its understanding stop?*

---

## 2. The narrowing toolkit

| Technique | Example | Narrows |
| --- | --- | --- |
| `typeof` | `typeof v === 'string'` | primitives, `function`; `'object'` keeps `null`! |
| Truthiness | `if (!v) return;` | removes `null`, `undefined`, `''`, `0`, `NaN`, `false` |
| Equality | `v === null`, `v === 'open'` | that literal/union member |
| `== null` | `v == null` | catches **both** `null` and `undefined` |
| `in` | `'name' in v` | union members that have that property |
| `instanceof` | `error instanceof HttpError` | class hierarchies |
| `Array.isArray` | `Array.isArray(v)` | `unknown` → `any[]`, unions → array member |
| Discriminant | `switch (state.status)` | the whole member, including its fields |
| Type predicate | `function isUser(v): v is User` | anything you claim |
| Assertion function | `assert(v): asserts v is User` | narrows by **throwing** |
| Exhaustiveness | `const x: never = state;` | proves all members are handled |

### `typeof` — and the `null` trap

```ts
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;

  switch (typeof value) {
    case 'string': return `string("${value}")`;
    case 'number': return `number(${value})`;
    case 'boolean': return `boolean(${value})`;
    case 'undefined': return 'undefined';
    case 'object': return `object(${Object.keys(value).length} keys)`;
    case 'function': return 'function';
    case 'symbol': return 'symbol';
    case 'bigint': return `bigint(${value})`;
    default:
      return `other(${String(value)})`;
  }
}
```

Two facts to take from this function:

1. **`typeof null === 'object'`.** So `typeof v === 'object'` narrows `unknown` to
   **`object | null`**, not `object`, and passing it onward fails:

   ```ts
   function takesObject(o: object): string { return Object.keys(o).join(','); }

   function t1(value: unknown): string {
     if (typeof value === 'object') return takesObject(value);
     //                                          ^ TS2345: Argument of type 'object | null'
     //                                                   is not assignable to parameter of type 'object'.
     return '';
   }
   ```

   Fix: check `value !== null` **first** (or combine both in one condition). The
   same applies to `Array.isArray`, which returns `false` for `null` — that is why
   it is a safer first check.

2. **An exhaustive `typeof` switch over `unknown` is not provably exhaustive.**
   The `default` branch above is real code, because TypeScript computes the
   remainder as `{}`, not `never`:

   ```ts
   default:
     return assertNever(value);
   // TS2345: Argument of type '{}' is not assignable to parameter of type 'never'.
   ```

   This is exactly the limit of `never` tripwires (file 5): they work for **unions
   you control** (a `'open' | 'paid'` string union, a discriminated union) and not
   for the open-ended result of `typeof` on `unknown`.

### Truthiness — and the React trap

```ts
function label(text: string | undefined): string {
  if (!text) return 'untitled';
  return text;                       // string
}
```

Truthiness removes `null`, `undefined`, `''`, `0`, `NaN` and `false` from the type.
That is usually what you want — but **truthiness does not remove `''` from a plain
`string` type**, because `string` is not a union of literals. So this compiles and
misbehaves:

```ts
function greet(name: string): string {
  if (name) return `Hello ${name}`;
  return 'Hello stranger';            // unreachable ONLY if name is ''
}
```

You already met the JSX version of this trap in file 3 — `{count && <Badge/>}`
renders a literal `0` when `count === 0`, because `0` is falsy and short-circuits to
itself. In JSX, prefer an explicit comparison:

```tsx
{count > 0 && <Badge count={count} />}
{count > 0 ? <Badge count={count} /> : null}
```

### Equality, including `== null`

```ts
function normalise(value: string | null | undefined): string {
  if (value == null) return '';       // ← catches BOTH null and undefined
  return value;                       // string
}
```

`== null` is the one place a loose comparison is idiomatic TypeScript: it is the
only way to remove `null` and `undefined` in one check. Everywhere else, use `===`.
Literal equality narrows too, which is what makes `switch (state.status)` work.

### `in`, `instanceof`, and `Array.isArray`

```ts
type A = { a: number };
type B = { b: string };

function pick(value: A | B): string {
  return 'a' in value ? String(value.a) : value.b;      // `in` narrows the union
}

function statusOf(error: unknown): number {
  if (error instanceof HttpError) return error.status;   // subclass first…
  if (error instanceof Error) return 500;                // …then the base class
  return 0;                                              // (not an Error at all)
}

function countItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;        // unknown → any[]
}
```

`instanceof` works on the **prototype chain**, so order matters: check subclasses
before base classes, or `HttpError` will be swallowed by the `Error` branch.

> ⚠️ **`instanceof` and `Array.isArray` are runtime checks with real limitations.**
> `instanceof` compares constructors across realms (an error created inside an
> iframe is not `instanceof Error` in the parent); `Array.isArray` handles that
> case correctly and is the one to prefer for arrays. For "is this an Error?", a
> more robust check combines both signals — see the mistakes table.

### Discriminants and exhaustiveness

The file 5 pattern, now seen as narrowing:

```ts
type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function message<T>(state: FetchState<T>): string {
  switch (state.status) {
    case 'idle': return 'Not started';
    case 'loading': return 'Loading…';
    case 'success': return `Loaded ${String(state.data)}`;   // `data` exists here
    case 'error': return state.error.message;                // `error` exists here
    default: {
      const unreachable: never = state;                      // ✅ valid: we control this union
      return unreachable;
    }
  }
}
```

---

## 3. Custom type predicates: `value is X`

When a check is too complex for one keyword, wrap it in a function whose return type
is a **type predicate**:

```ts
interface User { id: string; name: string }

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

function greet(value: unknown): string {
  return isUser(value) ? `Hello ${value.name}` : 'Hello stranger';
}
```

Generic predicates keep the input type in the output:

```ts
function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

const names: Array<string | null | undefined> = ['Ada', null, 'Grace', undefined];
const present = names.filter(isDefined);
// Verified with --declaration:
//   names.filter(Boolean)      → (string | undefined)[]   ← no narrowing!
//   names.filter(isDefined)    → string[]                 ← narrowing preserved
present.join(', ');   // ✅ "Ada, Grace" — safe with no casts
```

That single helper removes a category of `!` and `?? ''` littering from React code
bases. Note it must be a **type predicate**, not `Boolean`: `filter(Boolean)` has the
signature `filter(BooleanConstructor)` and loses the information.

> ⚠️ **A predicate is a claim the compiler takes on faith.** There is no
> verification whatsoever — only your runtime checks make it true:
>
> ```ts
> function isAdmin(value: unknown): value is { role: 'admin'; permissions: string[] } {
>   return typeof value === 'object' && value !== null;   // never checks `role`!
> }
>
> isAdmin({ nothing: true });          // → true at runtime
> const fake = { nothing: true } as { role: 'admin'; permissions: string[] };
> isAdmin(fake) && fake.permissions.join(',');
> // → TypeError: Cannot read properties of undefined (reading 'join')
> ```
>
> A wrong predicate is worse than no predicate, because it silences the compiler
> **and** misleads the reader. Test your guards with bad input (Part 13).

---

## 4. Assertion functions: narrowing by throwing

An **assertion function** narrows the rest of the current scope by throwing when the
value is wrong. The `asserts` annotation is mandatory:

```ts
class ValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ValidationError';
  }
}

function assertDefined<T>(value: T | null | undefined, path: string): asserts value is T {
  if (value === null || value === undefined) throw new ValidationError(path, 'is required');
}

function use(value: string | null): string {
  assertDefined(value, 'value');
  return value.toUpperCase();   // ✅ value is string from here on
}
```

Without the annotation, nothing narrows — and the error message points at the *use*,
not the assertion:

```ts
function assertString(value: unknown) {
  if (typeof value !== 'string') throw new Error('not a string');
}

function use2(value: unknown): string {
  assertString(value);
  return value.toUpperCase();
  //     ^ TS18046: 'value' is of type 'unknown'.
}
```

Assertion functions can also narrow to an **intersection**, which is how you express
"this must be production config":

```ts
function assertProduction(
  config: AppConfig
): asserts config is AppConfig & { environment: 'production' } {
  if (config.environment !== 'production') {
    throw new Error(`Expected production config, got "${config.environment}"`);
  }
}
```

Two honest notes:

- An assertion function is a **runtime check with a compile-time consequence**. It
  is the right tool for invariants at a boundary (config loading, test helpers,
  parsing entry points) and the wrong tool for control flow you could express with
  `if` — a plain `if` narrows just as well and does not hide a throw.
- There is a bare form too — `function assert(condition: unknown): asserts condition`
  — useful in tests (`assert(response.ok)`), which you will use in Part 13.

---

## 5. Where narrowing stops

These four limits explain almost every "why is TypeScript complaining?" moment.

**Limit 1 — narrowing does not survive reassignment.**

```ts
function broken(user: { name: string } | null): () => string {
  if (user === null) return () => '';
  user = null;                       // ← reassignment resets the narrowing
  return () => user.name;
  //            ^ TS18047: 'user' is possibly 'null'.
}
```

**Limit 2 — narrowing *does* survive inside closures, but only if the variable is
never reassigned afterwards.** (Introduced in TypeScript 5.4 and unchanged in 6.0.3 —
re-verified for this book against tsc 6.0.3:
[`react-lab/evidence/part02-narrowing.txt`](../../react-lab/evidence/part02-narrowing.txt).)

```ts
function ok(user: { name: string } | null): () => string {
  if (user === null) return () => '';
  return () => user.name;            // ✅ narrowed inside the closure
}

function ok2(items: string[]): () => string {
  const first: string | undefined = items[0];
  if (first === undefined) return () => '';
  return () => first.toUpperCase();  // ✅ `first` is const and never reassigned
}
```

This matters enormously in React: a value narrowed at the top of a component stays
narrowed inside the callbacks you hand to `onClick`, `useEffect`, or `.then()`, **as
long as you captured it in a `const`** (which is the same discipline that prevents
stale-closure bugs in Part 4).

**Limit 3 — a guard stored in a variable does not narrow.**

```ts
const isString = typeof value === 'string';   // boolean, not a narrowing fact
if (isString) {
  value.toUpperCase();   // ❌ still `unknown`
}
```

Keep guards **inline in the condition** (or use a type predicate function).

**Limit 4 — narrowing does not reach into object properties across function
boundaries.** TypeScript narrows *bindings*, not "the value that used to be at
`state.user`". Destructure to a `const` first when you need it to stick:

```ts
function render(state: { user: User | null }): string {
  const { user } = state;            // ← capture: now a binding, not a property
  if (user === null) return 'signed out';
  return useLater(() => user.name);  // ✅ narrowing is preserved
}
```

---

## 6. Common mistakes

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `typeof x === 'object'` without a null check | `TS2345: Argument of type 'object \| null' …` | check `x !== null` first |
| `never` tripwire on a `typeof unknown` switch | `TS2345: Argument of type '{}' is not assignable to 'never'` | real `default`, or switch on a union you control |
| Assertion function without `asserts` | `TS18046: 'value' is of type 'unknown'` | annotate: `asserts value is T` |
| Guard stored in a `const` then used | No narrowing inside the `if` | inline the guard, or make it a predicate |
| Narrowed `let`, then reassigned | `TS18047: 'x' is possibly 'null'` | use a `const`; do not reassign narrowed bindings |
| Narrowed a property, used it in a callback | Narrowing lost / stale value | destructure into a `const` |
| `.filter(Boolean)` to remove nulls | Result is `(T \| undefined)[]` | `.filter(isDefined)` with a type predicate |
| `xxx!` to silence the compiler | Compiles; crashes at runtime with the same bug | narrow properly, or validate at the boundary |
| `as SomeType` instead of narrowing | Silent wrong types | narrow, or validate with a schema (Part 7) |
| `instanceof Error` assumed to catch everything | Cross-realm errors and thrown strings slip through | check `typeof e === 'object' && e !== null && 'message' in e`, or normalise thrown values |
| Subclass check placed after the base class | Subclass branch is unreachable/dead | check subclasses first |
| Truthiness on `string` assumed to remove `''` | Empty string still possible in the type | compare explicitly, or use `isNonEmptyString` |
| Optional chaining as a substitute for narrowing | `user?.name` yields `string \| undefined` everywhere | narrow once, then use the value directly |

---

## 7. Practice exercises

### Beginner

1. What is the type of `value` in each marked line, and which lines fail to compile?

```ts
function f(value: string | number | null | undefined): string {
  if (value == null) return 'missing';       // A
  if (typeof value === 'number') {            // B
    return value.toFixed(2);
  }
  return value.toUpperCase();                 // C
}
```

2. Why does the second function not compile, and what is the minimal fix?

```ts
function a(value: string | undefined): string {
  if (value) return value.toUpperCase();      // fine
  return 'none';
}

function b(value: string | undefined): string {
  const hasValue = value !== undefined;
  if (hasValue) return value.toUpperCase();
  return 'none';
}
```

3. Rewrite this to preserve narrowing for `filter`:

```ts
const ids: Array<string | undefined> = ['a', undefined, 'b'];
const clean = ids.filter((id) => id !== undefined);   // what is the type of clean?
```

**Solution**

**1.** Verified against TypeScript 6.0.3 (tsc 6.0.3, `--strict`):

```text
Line A: after `value == null` returns, `value` is `string | number`
Line B: inside the typeof check, `value` is `number`
Line C: `value` is `string` — compiles ✅
```

So the function compiles. The key step is line A: `== null` removes **both** `null`
and `undefined` in one check, which is why `typeof value === 'number'` can then
leave exactly `string` as the remainder.

**2.** In `b`, the guard is stored in a `const hasValue` with type `boolean`.
TypeScript does not track "boolean variables that happen to carry narrowing
information" — only inline guard expressions. Hence:

```text
TS18048: 'value' is possibly 'undefined'.
```

Minimal fixes, in order of preference:

```ts
// 1. Inline the guard (simplest)
if (value !== undefined) return value.toUpperCase();

// 2. Use a type predicate, which IS tracked
function isDefined<T>(v: T | null | undefined): v is T { return v !== null && v !== undefined; }
if (isDefined(value)) return value.toUpperCase();

// 3. Early return, then use the value directly
if (value === undefined) return 'none';
return value.toUpperCase();
```

**3.** `clean` is `(string | undefined)[]` — **the arrow function does not carry the
narrowing through `filter`**, because its inferred type is
`(id: string | undefined) => boolean`, and a `boolean` says nothing about `id`.
Verified output types:

```text
ids.filter((id) => id !== undefined)   → (string | undefined)[]
ids.filter(Boolean)                    → (string | undefined)[]
ids.filter(isDefined)                  → string[]
```

The rewrite:

```ts
function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

const clean = ids.filter(isDefined);   // string[]
clean.join(', ');                      // ✅ no casts needed
```

### Intermediate

Build a **runtime parser** that turns `unknown` JSON into typed models, collecting
**every** problem with a path instead of throwing on the first one. This is the code
you write before a schema library (Part 7) — and the manual version teaches you what
those libraries actually do.

```text
ts-playground/src/narrowing.ts
```

Requirements:

1. Domain models: `User` (`id`, `name`, `email`, `role: 'admin' | 'user'`, `lastSeenAt: string | null`) and `Order` (`id`, `status: 'open' | 'paid' | 'cancelled'`, `totalMinor: number`, `items: OrderItem[]`), with `OrderItem = { sku: string; quantity: number }`.
2. `type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] }`.
3. Guards: `isRecord`, `isNonEmptyString`, `isFiniteNumber`, `isInteger`, `isOneOf<T extends string>`, and the generic `isDefined<T>`.
4. `describe(value: unknown): string` using `typeof` narrowing, handling `null` and arrays first — and **not** using a `never` tripwire (explain why in a comment).
5. `ValidationError extends Error` with a `path` field, and `assertDefined<T>(value, path): asserts value is T`.
6. A `Reader` class collecting errors for `string`, `nullableString`, `integer` (with `min`/`max`), `oneOf`, and `array`.
7. `parseUser` and `parseOrder` (with per-item paths like `items[0].sku`) returning `ParseResult`.
8. `renderResult(result, render)` producing a ✅/❌ line, exhausting the union.
9. Demo: valid and invalid users (wrong types, missing fields, array, `null`) and orders; `filter(isDefined)`; an assertion that throws, caught with `instanceof` narrowing.
10. A comment block with the verified compile-time facts (the `object | null` trap, the missing `asserts` annotation, closure narrowing, and the lying predicate).

**Solution**

```text
ts-playground/src/narrowing.ts
```

```ts
export {};

// ============================================================================
// Domain models — the shapes we HOPE runtime data has
// ============================================================================
type Role = 'admin' | 'user';
const ROLES: readonly Role[] = ['admin', 'user'];

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastSeenAt: string | null;
}

interface OrderItem {
  sku: string;
  quantity: number;
}

interface Order {
  id: string;
  status: 'open' | 'paid' | 'cancelled';
  totalMinor: number;
  items: OrderItem[];
}

// ============================================================================
// The result type from file 5: success or failure, never both
// ============================================================================
type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

// ============================================================================
// Type guards — the building blocks. Every one is `value is X`.
// ============================================================================
function isRecord(value: unknown): value is Record<string, unknown> {
  // NOTE: `typeof value === 'object'` alone is true for null, so always pair it
  // with a null check. Arrays pass the record test too, hence the third clause.
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

// A guard generic over the allowed values: T flows from the array to the result.
function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

// The most reusable guard in a React codebase: filters out null/undefined while
// KEEPING the non-null type (plain .filter() cannot do this).
function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// ============================================================================
// describe(): exhaustive typeof narrowing, including the null and array cases
// ============================================================================
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;

  switch (typeof value) {
    case 'string':
      return `string("${value}")`;
    case 'number':
      return `number(${value})`;
    case 'boolean':
      return `boolean(${value})`;
    case 'undefined':
      return 'undefined';
    case 'object':
      return `object(${Object.keys(value).length} keys)`;
    case 'function':
      return 'function';
    case 'symbol':
      return 'symbol';
    case 'bigint':
      return `bigint(${value})`;
    default:
      // NOTE: TypeScript cannot prove this is unreachable. `typeof` narrows
      // `unknown`, but the remainder it computes here is `{}`, not `never`, so a
      // `never` tripwire does not compile:
      //   TS2345: Argument of type '{}' is not assignable to parameter of type 'never'.
      // For `unknown` inputs, a real fallback is the honest option.
      return `other(${String(value)})`;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}

// Exhaustiveness over a union WE control: here a `never` tripwire works, because
// TypeScript can prove the switch covers every member of Order['status'].
function describeStatus(status: Order['status']): string {
  switch (status) {
    case 'open':
      return 'awaiting payment';
    case 'paid':
      return 'paid — preparing shipment';
    case 'cancelled':
      return 'cancelled';
    default:
      return assertNever(status);
  }
}

// ============================================================================
// An assertion function: narrows by THROWING. Note the `asserts` annotation —
// without it the compiler does not treat the call as a narrowing operation
// (TS18046: 'value' is of type 'unknown').
// ============================================================================
class ValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ValidationError';
  }
}

function assertDefined<T>(value: T | null | undefined, path: string): asserts value is T {
  if (value === null || value === undefined) throw new ValidationError(path, 'is required');
}

// ============================================================================
// A field reader that collects errors with paths instead of throwing on the
// first problem — the behaviour a form UI needs.
// ============================================================================
class Reader {
  readonly errors: string[] = [];

  constructor(private readonly source: Record<string, unknown>) {}

  string(key: string, options: { required?: boolean; fallback?: string } = {}): string | undefined {
    const value = this.source[key];
    if (value === undefined) {
      if (options.required === true) this.errors.push(`${key}: is required`);
      return options.fallback;
    }
    if (!isNonEmptyString(value)) {
      this.errors.push(`${key}: expected a non-empty string, got ${describe(value)}`);
      return options.fallback;
    }
    return value;
  }

  nullableString(key: string): string | null {
    const value = this.source[key];
    if (value === null) return null;
    return isNonEmptyString(value) ? value : null;
  }

  integer(
    key: string,
    options: { required?: boolean; min?: number; max?: number } = {}
  ): number | undefined {
    const value = this.source[key];
    if (value === undefined) {
      if (options.required === true) this.errors.push(`${key}: is required`);
      return undefined;
    }
    if (!isInteger(value)) {
      this.errors.push(`${key}: expected an integer, got ${describe(value)}`);
      return undefined;
    }
    if (options.min !== undefined && value < options.min) {
      this.errors.push(`${key}: must be at least ${options.min}, got ${value}`);
      return undefined;
    }
    if (options.max !== undefined && value > options.max) {
      this.errors.push(`${key}: must be at most ${options.max}, got ${value}`);
      return undefined;
    }
    return value;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[], fallback?: T): T | undefined {
    const value = this.source[key];
    if (value === undefined) return fallback;
    if (!isOneOf(value, allowed)) {
      this.errors.push(`${key}: expected one of ${allowed.join(' | ')}, got ${describe(value)}`);
      return fallback;
    }
    return value;
  }

  array(key: string): unknown[] | undefined {
    const value = this.source[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      this.errors.push(`${key}: expected an array, got ${describe(value)}`);
      return undefined;
    }
    return value;
  }
}

// ============================================================================
// Parsers
// ============================================================================
function parseUser(raw: unknown): ParseResult<User> {
  if (!isRecord(raw)) {
    return { ok: false, errors: [`expected an object, got ${describe(raw)}`] };
  }

  const reader = new Reader(raw);
  const id = reader.string('id', { required: true });
  const name = reader.string('name', { required: true });
  const email = reader.string('email', { required: true });
  const role = reader.oneOf('role', ROLES, 'user');       // sensible default
  const lastSeenAt = reader.nullableString('lastSeenAt');

  if (reader.errors.length > 0) {
    return { ok: false, errors: reader.errors };
  }

  // The reader returned `string | undefined` for each field, so the compiler still
  // sees a possible `undefined` here. The assertions convert that into `string`.
  // (Asserts are per-variable: looping over `[id, name, email]` would narrow the
  // ARRAY ELEMENT type, never the three separate variables.)
  assertDefined(id, 'id');
  assertDefined(name, 'name');
  assertDefined(email, 'email');

  return { ok: true, data: { id, name, email, role: role ?? 'user', lastSeenAt } };
}

function parseOrderItem(raw: unknown, path: string, errors: string[]): OrderItem | undefined {
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object, got ${describe(raw)}`);
    return undefined;
  }
  const sku = raw['sku'];
  const quantity = raw['quantity'];

  // The happy path FIRST, so the compiler narrows inside this block…
  if (isNonEmptyString(sku) && isInteger(quantity) && quantity >= 1) {
    return { sku, quantity };
  }

  // …and the reporting path SECOND, so we can still describe every problem.
  // (Storing the guard in a boolean first would break narrowing — `const ok =
  // isNonEmptyString(sku)` does not narrow `sku`. Keep guards inline.)
  if (!isNonEmptyString(sku)) {
    errors.push(`${path}.sku: expected a non-empty string, got ${describe(sku)}`);
  }
  if (!isInteger(quantity) || quantity < 1) {
    errors.push(`${path}.quantity: expected a positive integer, got ${describe(quantity)}`);
  }
  return undefined;
}

function parseOrder(raw: unknown): ParseResult<Order> {
  if (!isRecord(raw)) {
    return { ok: false, errors: [`expected an object, got ${describe(raw)}`] };
  }

  const reader = new Reader(raw);
  const id = reader.string('id', { required: true });
  const status = reader.oneOf('status', ['open', 'paid', 'cancelled'] as const);
  const totalMinor = reader.integer('totalMinor', { required: true, min: 0 });
  const rawItems = reader.array('items') ?? [];

  const errors = [...reader.errors];
  const items: OrderItem[] = [];
  rawItems.forEach((item, index) => {
    const parsed = parseOrderItem(item, `items[${index}]`, errors);
    if (parsed !== undefined) items.push(parsed);
  });

  if (items.length === 0 && rawItems.length > 0) {
    errors.push('items: none of the entries were valid');
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  assertDefined(id, 'order.id');
  assertDefined(status, 'order.status');
  assertDefined(totalMinor, 'order.totalMinor');
  return { ok: true, data: { id, status, totalMinor, items } };
}

// ============================================================================
// Exhaustive handling of the result — the never tripwire again
// ============================================================================
function renderResult<T>(result: ParseResult<T>, render: (data: T) => string): string {
  if (result.ok) {
    return `✅ ${render(result.data)}`;
  }
  return `❌ ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}:\n${result.errors.map((e) => `     • ${e}`).join('\n')}`;
}

// ============================================================================
// Demo
// ============================================================================
const payloads: unknown[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin', lastSeenAt: '2026-09-19T09:00:00Z' },
  { id: 'u2', name: 'Grace Hopper', email: 'grace@example.com' },
  { id: 'u3', name: '', email: 42, role: 'superadmin', lastSeenAt: null },
  ['not', 'an', 'object'],
  null,
];

const orderPayloads: unknown[] = [
  {
    id: 'o1',
    status: 'paid',
    totalMinor: 512850,
    items: [{ sku: 'KBD-1', quantity: 1 }, { sku: 'MON-1', quantity: 1 }],
  },
  { id: 'o2', status: 'shipped', totalMinor: 1000, items: [{ sku: 'MOU-1', quantity: 0 }] },
  { id: 'o3', totalMinor: -5, items: 'none' },
];

function main(): void {
  console.log('=== typeof narrowing via describe() ===');
  for (const value of ['hi', 42, true, null, undefined, [1, 2], { a: 1 }, () => 1]) {
    console.log(`  ${describe(value)}`);
  }

  console.log('\n=== parsing unknown values into User ===');
  payloads.forEach((payload, index) => {
    const result = parseUser(payload);
    console.log(`  #${index}: ${renderResult(result, (user) => `${user.name} <${user.email}> as ${user.role}`)}`);
  });

  console.log('\n=== parsing unknown values into Order (nested arrays + paths) ===');
  orderPayloads.forEach((payload, index) => {
    const result = parseOrder(payload);
    const rendered = renderResult(result, (order) =>
      `${order.id} ${order.status} (${describeStatus(order.status)}) — ` +
      `${order.items.length} item(s), ₹${(order.totalMinor / 100).toFixed(2)}`
    );
    console.log(`  #${index}: ${rendered}`);
  });

  console.log('\n=== isDefined(): filters and KEEPS the narrowed type ===');
  const names: Array<string | null | undefined> = ['Ada', null, 'Grace', undefined, 'Alan'];
  const present = names.filter(isDefined);
  // `present` is string[], not (string | null | undefined)[]
  console.log('  filter(isDefined):', present, '| joined:', present.join(', '));

  console.log('\n=== assertion functions narrow by throwing ===');
  const maybeEmail: string | null = null;
  try {
    assertDefined(maybeEmail, 'email');
    console.log('  unreachable: toUpperCase would be safe here');
  } catch (error) {
    // instanceof narrowing: `error` is `unknown`, so we must check first
    if (error instanceof ValidationError) {
      console.log(`  ValidationError at path "${error.path}": ${error.message}`);
    } else if (error instanceof Error) {
      console.log(`  Some other error: ${error.message}`);
    } else {
      console.log('  Thrown value was not an Error:', describe(error));
    }
  }
  const maybeEmail2: string | null = 'ada@example.com';
  assertDefined(maybeEmail2, 'email');
  // After a successful assertion the compiler treats it as `string`, so string
  // methods are available with no cast and no optional chaining:
  console.log('  after a successful assertion:', maybeEmail2.toUpperCase());

  console.log('\n=== `in` narrows, `Array.isArray` narrows, `== null` catches both ===');
  const shapes: Array<{ a: number } | { b: string }> = [{ a: 1 }, { b: 'two' }];
  for (const shape of shapes) {
    console.log(`  ${'a' in shape ? `a = ${shape.a}` : `b = ${shape.b}`}`);
  }
  console.log('  Array.isArray:', Array.isArray(orderPayloads), '| length:', orderPayloads.length);

  let loose: string | null | undefined;
  console.log('  `loose == null` is true for undefined too:', loose == null);
}

main();

/* ---------------------------------------------------------------------------
   COMPILE-TIME FACTS (each verified against TypeScript 6.0.3)

   // 1. `typeof x === 'object'` does NOT remove null:
   function takesObject(o: object): string { return Object.keys(o).join(','); }
   function t1(value: unknown) {
     if (typeof value === 'object') return takesObject(value);
     //                                        ^ TS2345: Argument of type 'object | null'
     //                                          is not assignable to parameter of type 'object'.
   }

   // 2. An assertion function WITHOUT the `asserts` annotation narrows nothing:
   function assertString(value: unknown) { if (typeof value !== 'string') throw new Error('nope'); }
   function use1(value: unknown) { assertString(value); return value.toUpperCase(); }
   //                                                       ^ TS18046: 'value' is of type 'unknown'.
   function assertString2(value: unknown): asserts value is string {
     if (typeof value !== 'string') throw new Error('nope');
   }
   function use2(value: unknown) { assertString2(value); return value.toUpperCase(); }   // ✅

   // 3. Narrowing IS preserved inside a closure, as long as the variable is not
   //    reassigned afterwards (TypeScript 5.4+ behaviour, unchanged in 6.0.3):
   function ok(user: { name: string } | null) {
     if (user === null) return () => '';
     return () => user.name;        // ✅ narrowed
   }

   // 4. …but reassigning the variable drops the narrowing:
   function broken(user: { name: string } | null) {
     if (user === null) return () => '';
     user = null;
     return () => user.name;
     //            ^ TS18047: 'user' is possibly 'null'.
   }

   // 5. A custom type predicate is TRUSTED without verification. This guard is a
   //    lie, and the compiler lets it through:
   function isAdmin(value: unknown): value is { role: 'admin'; permissions: string[] } {
     return typeof value === 'object' && value !== null;   // never checks `role`!
   }
   isAdmin({ nothing: true });                    // → true at runtime
   const bad = isAdmin({ nothing: true } as { role: 'admin'; permissions: string[] });
   bad.permissions.join(',');                     // → TypeError: Cannot read properties of undefined
   // The lesson: a predicate is a CLAIM. Only your runtime checks make it true.
---------------------------------------------------------------------------- */
```

**Run it**

```bash
npx tsx src/narrowing.ts
```

**Expected output**

```text
=== typeof narrowing via describe() ===
  string("hi")
  number(42)
  boolean(true)
  null
  undefined
  array(2)
  object(1 keys)
  function

=== parsing unknown values into User ===
  #0: ✅ Ada Lovelace <ada@example.com> as admin
  #1: ✅ Grace Hopper <grace@example.com> as user
  #2: ❌ 3 problems:
     • name: expected a non-empty string, got string("")
     • email: expected a non-empty string, got number(42)
     • role: expected one of admin | user, got string("superadmin")
  #3: ❌ 1 problem:
     • expected an object, got array(3)
  #4: ❌ 1 problem:
     • expected an object, got null

=== parsing unknown values into Order (nested arrays + paths) ===
  #0: ✅ o1 paid (paid — preparing shipment) — 2 item(s), ₹5128.50
  #1: ❌ 3 problems:
     • status: expected one of open | paid | cancelled, got string("shipped")
     • items[0].quantity: expected a positive integer, got number(0)
     • items: none of the entries were valid
  #2: ❌ 2 problems:
     • totalMinor: must be at least 0, got -5
     • items: expected an array, got string("none")

=== isDefined(): filters and KEEPS the narrowed type ===
  filter(isDefined): [ 'Ada', 'Grace', 'Alan' ] | joined: Ada, Grace, Alan

=== assertion functions narrow by throwing ===
  ValidationError at path "email": email: is required
  after a successful assertion: ADA@EXAMPLE.COM

=== `in` narrows, `Array.isArray` narrows, `== null` catches both ===
  a = 1
  b = two
  Array.isArray: true | length: 3
  `loose == null` is true for undefined too: true
```

**Why this structure is worth copying**

- **Errors are collected, not thrown.** A form with three mistakes should report
  three mistakes. Throwing on the first one forces the user to fix, resubmit, fix,
  resubmit — the single most common UX failure in hand-rolled validation.
- **`ParseResult<T>` is a discriminated union** (file 5), so `renderResult` handles
  both branches and the caller cannot forget the failure case.
- **Guards are separate, tested, reusable functions.** `isRecord` encodes the
  `typeof x === 'object' && x !== null && !Array.isArray(x)` triple once, correctly,
  instead of 12 times with three different bugs.
- **Assertions appear where the compiler cannot follow the logic** — after an early
  `if (errors.length > 0) return`, the individual field variables are still typed
  `string | undefined`, and `assertDefined` (one per variable, not in a loop)
  converts that into `string`. A loop over `[id, name, email]` would narrow only the
  *array element* type, never the three separate variables.
- **The parse of `items[0].quantity` demonstrates why happy-path-first matters**:
  the guards live inside the `if` that returns the value, so narrowing applies where
  the value is built; the reporting code below re-checks to produce readable
  messages. Storing a guard in a boolean first (`const ok = isString(sku)`) breaks
  narrowing — a limit documented in section 5.
- **`describe()` illustrates the one place a `never` tripwire is impossible**: over
  `typeof`, an open-ended `unknown` produces `{}` as the remainder, not `never`
  (`TS2345: Argument of type '{}' is not assignable to parameter of type 'never'`).
  `assertNever` is still used elsewhere in the file — for `Order['status']`, a union
  we control.

### Challenge

Write a **typed configuration loader** for environment variables. This is the code
every Vite/Next/Node app needs, `process.env` is `Record<string, string | undefined>`,
and every value must be narrowed and converted before use.

```text
ts-playground/src/config-loader.ts
```

Requirements:

1. `type Env = Record<string, string | undefined>`.
2. Unions `Environment = 'development' | 'test' | 'production'` and
   `LogLevel = 'debug' | 'info' | 'warn' | 'error'`, with arrays for runtime checks.
3. Guards `isOneOf<T extends string>`, `isEnvironment`, `isLogLevel`, `isDefined<T>`.
4. Parsers returning `T | undefined`: `parsePort` (integer, 1–65535),
   `parseBooleanish` (`1/true/yes/on` ↔ `0/false/no/off`), `parseList`, `normalizeUrl`
   (valid `http(s)` URL, trailing slash trimmed) — the last one using `try/catch`
   where the caught value is `unknown`.
5. `interface AppConfig` plus
   `type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: string[] }`.
6. `loadConfig(env): ConfigResult` collecting **all** problems, applying
   environment-aware defaults (`PORT` defaults to 5173 outside production;
   `SESSION_SECRET` is required and at least 16 characters **only** in production).
7. `assertProduction(config): asserts config is AppConfig & { environment: 'production' }`
   and `describeEnvironment` with a `never` tripwire.
8. Demo: a valid local env, a valid production env, and a badly broken production env
   (unknown environment, out-of-range port, non-URL, bad log level, bad boolean) —
   showing every problem at once; then the assertion rejecting dev and accepting production.
9. A comment block with verified compile-time facts (possibly-undefined reads,
   `catch` binding `unknown`, narrowing lost after reassignment).

**Solution**

```text
ts-playground/src/config-loader.ts
```

```ts
export {};

// ============================================================================
// The input shape: environment variables are ALL strings, and any key may be
// missing. That is why `Record<string, string | undefined>` is the honest type —
// it forces the reader to deal with `undefined` on every access.
// ============================================================================
type Env = Record<string, string | undefined>;

// ============================================================================
// Unions for the values that must be one of a fixed set
// ============================================================================
type Environment = 'development' | 'test' | 'production';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ENVIRONMENTS: readonly Environment[] = ['development', 'test', 'production'];
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

// ============================================================================
// Reusable type guards (each one is `value is X`)
// ============================================================================
function isOneOf<T extends string>(value: string | undefined, allowed: readonly T[]): value is T {
  return value !== undefined && (allowed as readonly string[]).includes(value);
}

function isEnvironment(value: string | undefined): value is Environment {
  return isOneOf(value, ENVIRONMENTS);
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return isOneOf(value, LOG_LEVELS);
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// ============================================================================
// Narrowing strings into numbers and lists.
// Note every parser returns `T | undefined` — "could not parse" is a VALUE here,
// not an exception, so the caller can collect every problem at once.
// ============================================================================
function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 1 && value <= 65_535 ? value : undefined;
}

function parseBooleanish(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  switch (raw.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      // A string that is neither: return undefined rather than guessing.
      return undefined;
  }
}

function parseList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeUrl(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().replace(/\/$/, '') : undefined;
  } catch {
    // `catch {}` gives you `unknown` — you cannot read `.message` without narrowing.
    return undefined;
  }
}

// ============================================================================
// The parsed config, and the result union
// ============================================================================
interface AppConfig {
  environment: Environment;
  port: number;
  apiBaseUrl: string;
  logLevel: LogLevel;
  featureFlags: string[];
  sessionSecret: string;
  verboseRequestLogging: boolean;
}

type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; problems: string[] };

// ============================================================================
// An assertion function that narrows to an INTERSECTION: after it returns, the
// caller's value is known to be production config specifically.
// ============================================================================
function assertProduction(
  config: AppConfig
): asserts config is AppConfig & { environment: 'production' } {
  if (config.environment !== 'production') {
    throw new Error(`Expected production config, got "${config.environment}"`);
  }
}

function describeEnvironment(environment: Environment): string {
  switch (environment) {
    case 'development':
      return 'local mode: verbose errors, hot reload';
    case 'test':
      return 'CI mode: deterministic, no network';
    case 'production':
      return 'live mode: minified, errors reported to the backend';
    default:
      return assertNever(environment);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}

// ============================================================================
// The loader: collect EVERY problem, then decide
// ============================================================================
function loadConfig(env: Env): ConfigResult {
  const problems: string[] = [];

  const rawEnvironment = env['NODE_ENV'];
  if (rawEnvironment === undefined) {
    problems.push('NODE_ENV: is required');
  } else if (!isEnvironment(rawEnvironment)) {
    problems.push(`NODE_ENV: expected one of ${ENVIRONMENTS.join(' | ')}, got "${rawEnvironment}"`);
  }
  // Default while still reporting: keeps the rest of the checks useful.
  const environment: Environment = isEnvironment(rawEnvironment) ? rawEnvironment : 'development';

  const rawPort = env['PORT'];
  const port = parsePort(rawPort) ?? (environment === 'production' ? undefined : 5173);
  if (rawPort !== undefined && parsePort(rawPort) === undefined) {
    problems.push(`PORT: expected an integer between 1 and 65535, got "${rawPort}"`);
  }
  if (port === undefined) {
    problems.push('PORT: is required in production');
  }

  const rawBase = env['API_BASE_URL'];
  const apiBaseUrl = rawBase === undefined ? undefined : normalizeUrl(rawBase);
  if (rawBase === undefined) {
    problems.push('API_BASE_URL: is required');
  } else if (apiBaseUrl === undefined) {
    problems.push(`API_BASE_URL: expected an http(s) URL, got "${rawBase}"`);
  }

  const rawLogLevel = env['LOG_LEVEL'];
  if (rawLogLevel !== undefined && !isLogLevel(rawLogLevel)) {
    problems.push(`LOG_LEVEL: expected one of ${LOG_LEVELS.join(' | ')}, got "${rawLogLevel}"`);
  }
  const logLevel: LogLevel = isLogLevel(rawLogLevel)
    ? rawLogLevel
    : environment === 'production'
      ? 'info'
      : 'debug';

  const sessionSecret = env['SESSION_SECRET'];
  if (environment === 'production') {
    if (sessionSecret === undefined) {
      problems.push('SESSION_SECRET: is required in production');
    } else if (sessionSecret.length < 16) {
      problems.push(`SESSION_SECRET: must be at least 16 characters, got ${sessionSecret.length}`);
    }
  }

  const verboseRaw = env['VERBOSE_REQUEST_LOGGING'];
  const verbose = parseBooleanish(verboseRaw);
  if (verboseRaw !== undefined && verbose === undefined) {
    problems.push(`VERBOSE_REQUEST_LOGGING: expected a boolean-ish value, got "${verboseRaw}"`);
  }

  if (problems.length > 0 || port === undefined || apiBaseUrl === undefined) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    config: {
      environment,
      port,
      apiBaseUrl,
      logLevel,
      featureFlags: parseList(env['FEATURE_FLAGS']),
      sessionSecret: sessionSecret ?? 'dev-only-secret',
      verboseRequestLogging: verbose ?? environment !== 'production',
    },
  };
}

// ============================================================================
// Demo
// ============================================================================
const environments: Array<{ label: string; env: Env }> = [
  {
    label: 'local development',
    env: {
      NODE_ENV: 'development',
      API_BASE_URL: 'http://localhost:4000/',
      FEATURE_FLAGS: 'new-checkout, dark-mode ,,',
      VERBOSE_REQUEST_LOGGING: 'yes',
    },
  },
  {
    label: 'production (valid)',
    env: {
      NODE_ENV: 'production',
      PORT: '8080',
      API_BASE_URL: 'https://api.example.com/',
      LOG_LEVEL: 'warn',
      SESSION_SECRET: 'a-very-long-random-secret',
      FEATURE_FLAGS: 'dark-mode',
    },
  },
  {
    label: 'production (broken)',
    env: {
      NODE_ENV: 'prod',
      PORT: '99999',
      API_BASE_URL: 'api.example.com',
      LOG_LEVEL: 'loud',
      SESSION_SECRET: 'short',
      VERBOSE_REQUEST_LOGGING: 'maybe',
    },
  },
];

function main(): void {
  for (const { label, env } of environments) {
    console.log(`\n=== ${label} ===`);
    const result = loadConfig(env);

    // Discriminated union narrowing: `result.ok` decides which branch exists.
    if (!result.ok) {
      console.log(`❌ ${result.problems.length} problem(s):`);
      for (const problem of result.problems) {
        console.log(`   • ${problem}`);
      }
      continue;
    }

    const { config } = result;
    console.log(`✅ ${describeEnvironment(config.environment)}`);
    console.log(`   port           : ${config.port}`);
    console.log(`   apiBaseUrl     : ${config.apiBaseUrl}`);
    console.log(`   logLevel       : ${config.logLevel}`);
    console.log(`   featureFlags   : [${config.featureFlags.join(', ')}]`);
    console.log(`   verbose logging: ${config.verboseRequestLogging}`);
    console.log(`   secret         : ${config.sessionSecret === 'dev-only-secret' ? '(development default)' : `${config.sessionSecret.length} chars`}`);
  }

  console.log('\n=== assertion functions narrow to an intersection ===');
  const devConfig = loadConfig(environments[0]!.env);
  const prodConfig = loadConfig(environments[1]!.env);

  if (devConfig.ok && prodConfig.ok) {
    try {
      assertProduction(devConfig.config);
      console.log('  unreachable');
    } catch (error) {
      // `error` is `unknown` — narrow it before touching .message
      console.log(`  dev config rejected: ${error instanceof Error ? error.message : String(error)}`);
    }

    assertProduction(prodConfig.config);
    // After the assertion, `environment` is narrowed to the literal 'production',
    // so this comparison is allowed and the branch is provably taken:
    if (prodConfig.config.environment === 'production') {
      console.log(`  production config accepted; verbose logging is ${prodConfig.config.verboseRequestLogging}`);
    }
  }

  console.log('\n=== narrowing helpers keep working on plain values ===');
  const mixed: Array<string | undefined> = ['a', undefined, 'b'];
  console.log('  filter(isDefined):', mixed.filter(isDefined));
  console.log('  parsePort("8080"):', parsePort('8080'), '| parsePort("80a0"):', parsePort('80a0'));
  console.log('  parseBooleanish("off"):', parseBooleanish('off'), '| parseBooleanish("maybe"):', parseBooleanish('maybe'));
}

main();

/* ---------------------------------------------------------------------------
   COMPILE-TIME FACTS VERIFIED AGAINST TYPESCRIPT 5.9

   // 1. `parsePort` returns `number | undefined`, so this is rejected:
   const p = parsePort(process.env['PORT']);
   p.toFixed();
   //  ^ TS18048: 'p' is possibly 'undefined'.

   // 2. `catch {}` binds `unknown`, so `.message` is not available without narrowing:
   try { JSON.parse('nope'); } catch (error) { error.message; }
   //                                       ^ TS18046: 'error' is of type 'unknown'.

   // 3. Reading a `Record<string, string | undefined>` is always `string | undefined`:
   const e: Env = {};
   e['PORT'].trim();
   //        ^ TS18048: 'e["PORT"]' is possibly 'undefined'.

   // 4. Narrowing is lost after reassignment (TypeScript drops it deliberately):
   function lost(env: Env) {
     const port = env['PORT'];
     if (port === undefined) return;
     env = {};                 // reassigning the SOURCE does not matter here…
     return port.trim();       // ✅ still narrowed: `port` was never reassigned
   }

   // 5. …but reassigning the narrowed VARIABLE does:
   function lost2(port: string | undefined) {
     if (port === undefined) return;
     port = undefined;
     return port.trim();
     //     ^ TS18048: 'port' is possibly 'undefined'.
   }

   // 6. A `never` tripwire works on unions you control, NOT on `typeof unknown`:
   //    describeEnvironment() compiles with `default: assertNever(environment)`,
   //    while an exhaustive `typeof` switch over `unknown` fails with
   //    TS2345: Argument of type '{}' is not assignable to parameter of type 'never'.
---------------------------------------------------------------------------- */
```

**Run it**

```bash
npx tsx src/config-loader.ts
```

**Expected output**

```text

=== local development ===
✅ local mode: verbose errors, hot reload
   port           : 5173
   apiBaseUrl     : http://localhost:4000
   logLevel       : debug
   featureFlags   : [new-checkout, dark-mode]
   verbose logging: true
   secret         : (development default)

=== production (valid) ===
✅ live mode: minified, errors reported to the backend
   port           : 8080
   apiBaseUrl     : https://api.example.com
   logLevel       : warn
   featureFlags   : [dark-mode]
   verbose logging: false
   secret         : 25 chars

=== production (broken) ===
❌ 5 problem(s):
   • NODE_ENV: expected one of development | test | production, got "prod"
   • PORT: expected an integer between 1 and 65535, got "99999"
   • API_BASE_URL: expected an http(s) URL, got "api.example.com"
   • LOG_LEVEL: expected one of debug | info | warn | error, got "loud"
   • VERBOSE_REQUEST_LOGGING: expected a boolean-ish value, got "maybe"

=== assertion functions narrow to an intersection ===
  dev config rejected: Expected production config, got "development"
  production config accepted; verbose logging is false

=== narrowing helpers keep working on plain values ===
  filter(isDefined): [ 'a', 'b' ]
  parsePort("8080"): 8080 | parsePort("80a0"): undefined
  parseBooleanish("off"): false | parseBooleanish("maybe"): undefined
```

**What to notice in the output**

- **The broken production env reports 5 problems in one pass** — and the list is
  ordered by field, not by discovery order, because each check is independent:
  environment, port, URL, log level, boolean. Fixing all five is one edit round-trip
  instead of five.
- **Subtle and worth studying: `SESSION_SECRET` is *not* in that list.** The broken
  env sets `NODE_ENV=prod`, which fails validation, so the loader falls back to
  `'development'` — and the "secret required in production" rule never fires. The
  6th problem is therefore *missing*, and it is a real behavioural consequence of
  the fallback, not a bug in the demo. A stricter design would use
  `const environment = isEnvironment(raw) ? raw : undefined` and report
  "cannot continue without a valid NODE_ENV". **Fallbacks silently change which
  downstream rules apply** — decide deliberately whether that is acceptable.
- **`apiBaseUrl` prints without the trailing slash** (`http://localhost:4000`, not
  `…/4000/`) because `normalizeUrl` trims it. Normalising at the boundary means the
  rest of the app can concatenate paths without double-slash bugs.
- **`parseBooleanish("maybe")` returning `undefined`** is what makes the "maybe"
  problem reportable while still allowing a default. A parser that threw an
  exception could not distinguish "absent" from "invalid" — and that distinction is
  exactly what a good config error message needs.
- **The production config accepted by `assertProduction`** shows intersection
  narrowing: after the assertion, `config.environment` is the literal
  `'production'` type, so the subsequent comparison is provably taken.
- **`filter(isDefined)`**, `parsePort("80a0") → undefined` and the `catch` handling
  all work on plain values, with no casts anywhere in the file.

> 🏭 **How this connects to React.** Vite exposes `import.meta.env`, Next exposes
> `process.env.NEXT_PUBLIC_*`, and both are `string | undefined`. A typed loader is
> the difference between a production incident caused by
> `VITE_API_URL` being undefined and a build-time error listing exactly what is
> missing. In Part 16 you will wire this pattern into the Vite project; in Part 15 it
> becomes the typed API base URL. Note the discipline it models: **validate at the
> boundary, then trust the types inside** — the same rule that governs props, API
> responses, and route params.

---

## 8. Summary

- **Narrowing is control-flow analysis**: the compiler recomputes a variable's type
  along each code path, and reassignment widens it back.
- The toolkit: `typeof`, **truthiness**, equality, **`== null`** (catches both
  `null` and `undefined`), **`in`**, **`instanceof`**, **`Array.isArray`**,
  **discriminants**, **type predicates**, and **assertion functions**.
- **`typeof x === 'object'` keeps `null`** — narrows to `object | null`
  (`TS2345`). Check `null` first, or use `Array.isArray` first.
- **`typeof` switches on `unknown` are not provably exhaustive** — the remainder is
  `{}`, so `assertNever` fails there (`TS2345`). `never` tripwires are for unions you
  control.
- **Type predicates (`value is T`) are trusted, not verified.** A wrong predicate
  compiles and silently breaks the program at runtime — test your guards.
- **Assertion functions (`asserts value is T`) narrow by throwing**, and require the
  explicit annotation; without it, the value stays `unknown` (`TS18046`). They can
  narrow to intersections.
- **Narrowing survives inside closures when the binding is never reassigned**
  (TypeScript 5.4+ behaviour, unchanged in 6.0.3), and is lost after reassignment (`TS18047`). In React,
  destructure into a `const` to keep narrowing in `onClick`/`useEffect` callbacks.
- **Guards stored in booleans do not narrow**; keep them inline or in a predicate
  function.
- **`.filter(Boolean)` does not narrow** (`(T | undefined)[]`); `.filter(isDefined)`
  does (`T[]`).
- **Fallbacks change downstream logic.** When a value fails validation and you
  substitute a default, every later rule that depends on it changes behaviour —
  choose deliberately, and say so in the error message.

**What's next →** [`10-utility-types.md`](./10-utility-types.md): TypeScript's
built-in type transformations — `Partial`, `Required`, `Pick`, `Omit`, `Record`,
`ReturnType`, `Parameters`, `Awaited`, `Exclude`, and the mapped-type ideas behind
them, all with the React cases that use them.
