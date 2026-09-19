# 05 — Union and Intersection Types

> **Part 2 · TypeScript · File 5 of 11**
>
> **Why this file exists:** unions and intersections are how you model real
> decisions. In React they appear in every component's variant props, every
> component's state machine, and every API result. This file teaches them until
> "make invalid states unrepresentable" stops being a slogan and becomes something
> you actually do.

---

## 1. Union types: "one of these"

A **union** means a value is **one thing OR another** (exactly one of them).

```ts
type Id = string | number;

let userId: Id = 'u1';     // ✅
userId = 42;               // ✅
// userId = true;          // ❌ TS2322: Type 'boolean' is not assignable to type 'Id'
```

The `|` character means "or" — which is *worse* than `&` at first, because reading
your code later you may wonder whether it means the same thing as JavaScript's `||`.
It does not: `|` in a type is a set union ("belongs to at least one of these sets").

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';
type Direction = 'up' | 'down' | 'left' | 'right';
type Result<T> = T | Error;
type Maybe<T> = T | null | undefined;
type Padding = number | string;
type InputValue = string | number | readonly string[];
```

### Unions of literals are the most useful kind

```ts
type Size = 'sm' | 'md' | 'lg';

function buttonClass(size: Size): string {
  return `btn btn--${size}`;
}

buttonClass('md');     // ✅
// buttonClass('medium');
//    ❌ TS2345: Argument of type '"medium"' is not assignable to parameter of type 'Size'
```

Compare with the alternative:

```ts
// ❌ Any typo compiles; the bug ships
function buttonClass(size: string): string {
  return `btn btn--${size}`;   // buttonClass('larrge') → "btn btn--larrge" 😖
}
```

A union of literals is a **compile-time enumeration of allowed values** — a
"switch statement in the type system". This is the single most valuable habit in
this file.

### How unions behave

```ts
function double(value: string | number): number {
  // return value.toUpperCase();   // ❌ Property 'toUpperCase' does not exist on
                                   //    type 'string | number'
  if (typeof value === 'string') {
    return value.length;           // ✅ inside this branch, it IS a string
  }
  return value * 2;                // ✅ and here it is a number
}
```

**The core rule of unions:**

> You can only use the properties and methods **common to every member** until you
> **narrow** to a specific one.

That is why `value.toUpperCase()` is rejected: a `number` has no such method. It is
also why unions feel "strict" at first — and why they are the best bug catcher you
have. Narrowing is file 9; this file shows enough to make unions usable.

### Optional properties create unions automatically

```ts
interface Props {
  label: string;
  icon?: string;
}

// Reading it: `string | undefined`
// Writing the type explicitly is the same thing:
interface Props2 {
  label: string;
  icon: string | undefined;
}
```

Optional and `| undefined` differ in *whether the key must be present* (file 3),
but they both produce `string | undefined` when you read the value.

---

## 2. Discriminated unions: the essential pattern

A **discriminated union** (also called a tagged union) is a union of object types
that share a **literal "tag" property**, so TypeScript can tell them apart.

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'rectangle'; width: number; height: number };
```

`kind` is the **discriminant** — the property whose literal type differs across
members. Now:

```ts
function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;        // ✅ `radius` exists here
    case 'square':
      return shape.side ** 2;                    // ✅
    case 'rectangle':
      return shape.width * shape.height;         // ✅
    default: {
      const unreachable: never = shape;          // ✅ exhaustiveness
      return unreachable;
    }
  }
}

// area({ kind: 'circle', side: 4 });
//    ❌ TS2353: Object literal may only specify known properties, and 'side'
//       does not exist in type '{ kind: "circle"; radius: number; }'
//
// area({ kind: 'triangle' });
//    ❌ TS2322: Type '"triangle"' is not assignable to type '"circle" | "square" | "rectangle"'
```

Three superpowers in one pattern:

1. **Only the right fields exist in each branch.** `shape.radius` is legal exactly
   where `kind === 'circle'`.
2. **Missing fields are errors.** `{ kind: 'circle' }` without `radius` fails.
3. **Adding a variant surfaces every place that needs updating** — through the
   `never` tripwire.

### The React use cases (all of them, basically)

**Component state machines:**

```tsx
type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error; retryable: boolean };

function UserList({ state }: { state: FetchState<User[]> }) {
  switch (state.status) {
    case 'idle':
      return <p>Search for a user to begin.</p>;
    case 'loading':
      return <p>Loading…</p>;
    case 'success':
      return <ul>{state.data.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
    case 'error':
      return (
        <p role="alert">
          {state.error.message}
          {state.retryable && <button type="button">Retry</button>}
        </p>
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}
```

Compare that to the classic four-boolean mess:

```tsx
// ❌ 16 possible combinations, most of them nonsense
interface BadState {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isIdle: boolean;
  data: User[] | null;
  error: Error | null;
}
// isLoading && isError && data !== null && error !== null — is that "valid"?
```

The discriminated union has **4 states**. The boolean soup has **16**, and no way
to tell which ones the application treats as legal. This is what "make invalid
states unrepresentable" means in practice.

**Variant props (the component library pattern):**

```tsx
type ButtonProps =
  | { variant: 'link'; href: string; onClick?: never }
  | { variant: 'button'; onClick: () => void; href?: never }
  | { variant: 'submit'; formId: string; onClick?: never };

function ActionButton(props: ButtonProps) {
  switch (props.variant) {
    case 'link':
      return <a href={props.href}>Open</a>;
    case 'button':
      return <button type="button" onClick={props.onClick}>Do it</button>;
    case 'submit':
      return <button type="submit" form={props.formId}>Submit</button>;
    default: {
      const unreachable: never = props;
      return unreachable;
    }
  }
}

// <ActionButton variant="link" href="/docs" />            ✅
// <ActionButton variant="link" onClick={() => {}} />      ❌ missing href, and
//                                                            onClick is `never`
```

`onClick?: never` is the trick that **forbids** a prop in a variant: a `never`
property can never be given a value. It is how component libraries guarantee that
"you cannot pass `onClick` to a link variant".

**API results with different payloads:**

```ts
type ApiResponse =
  | { type: 'text'; body: string }
  | { type: 'json'; body: unknown }
  | { type: 'redirect'; to: string; permanent: boolean }
  | { type: 'empty' };
```

**Actions for a reducer (Part 4 preview):**

```ts
type CounterAction =
  | { type: 'increment'; by: number }
  | { type: 'decrement'; by: number }
  | { type: 'reset'; to?: number };

function counterReducer(count: number, action: CounterAction): number {
  switch (action.type) {
    case 'increment':
      return count + action.by;              // ✅ `by` exists
    case 'decrement':
      return count - action.by;              // ✅
    case 'reset':
      return action.to ?? 0;                 // ✅ `to` is optional ONLY here
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}
```

### Rules for a good discriminant

1. **Use a literal type**, not `string`. `kind: string` cannot discriminate.
2. **Give every member the same tag name** (`kind`, `type`, `status`, `variant`).
3. **Make the tag required** in every member. An optional tag breaks narrowing.
4. **Prefer a `switch`** — it gives you exhaustiveness checking for free.
5. **Do not put unrelated shared fields in only one branch**; if three of four
   variants need `id`, consider a shared base via intersection (section 4).

---

## 3. Union operations you will actually need

### Extracting members: `Extract` and `Exclude` (preview of file 10)

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'rect'; width: number; height: number };

type RoundShape = Extract<Shape, { kind: 'circle' }>;         // just the circle
type NotRound = Exclude<Shape, { kind: 'circle' }>;           // square | rect

// Real use: getting "the success variant" of an API result
type Success<T> = Extract<ApiResult<T>, { ok: true }>;
type Failure<T> = Extract<ApiResult<T>, { ok: false }>;
```

### Non-nullable values

```ts
type MaybeUser = User | null | undefined;
type DefiniteUser = NonNullable<MaybeUser>;   // User
```

### Practical union of keys

```ts
interface User {
  id: string;
  name: string;
  email: string;
}

type UserKey = keyof User;             // 'id' | 'name' | 'email'
type UserValue = User[keyof User];     // string
```

### Narrowing without `typeof`: the `in` operator

```ts
type Admin = { role: 'admin'; permissions: string[] };
type Guest = { role: 'guest'; expiresAt: string };

function describe(person: Admin | Guest): string {
  if ('permissions' in person) {
    return `admin with ${person.permissions.length} permissions`;
  }
  return `guest until ${person.expiresAt}`;
}
```

Prefer a **discriminant** when you control the types, and `in` when you do not.

---

## 4. Intersection types: "all of these"

An **intersection** combines types: the value must satisfy **every** member.

```ts
type Timestamps = {
  createdAt: string;
  updatedAt: string;
};

type SoftDelete = {
  deletedAt: string | null;
};

type Post = { title: string; body: string } & Timestamps & SoftDelete;

const post: Post = {
  title: 'Hello',
  body: 'World',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  deletedAt: null,
};
```

`&` is for objects mostly, and it behaves like `extends` for interfaces:

```ts
// These two are equivalent:
interface Post2 extends Timestamps, SoftDelete {
  title: string;
  body: string;
}

type Post3 = { title: string; body: string } & Timestamps & SoftDelete;
```

### Intersection of conflicting properties is `never`

This catches people out:

```ts
type A = { value: string };
type B = { value: number };

type Broken = A & B;
// `value` must be a string AND a number → `never`
// const x: Broken = { value: 'a' };  ❌ Type 'string' is not assignable to type 'never'
// const y: Broken = { value: 1 };    ❌ Type 'number' is not assignable to type 'never'
```

You cannot create such a value at all. That is *usually* a mistake, but it is also
how `never`-based prop forbidding works (section 2's `onClick?: never`).

### Intersections with unions distribute (the tricky part)

`&` binds tighter than `|`, so:

```ts
type Result = { id: string } & ({ ok: true; value: number } | { ok: false; error: string });
```

means `({ id: string } & { ok: true; value: number }) | ({ id: string } & { ok: false; error: string })`
— the `id` is added to each variant. Always **parenthesise** the union when you
intersect with one, and the reader will thank you.

### The React use: shared props plus component-specific props

```tsx
interface BaseFieldProps {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
}

type TextFieldProps = BaseFieldProps & {
  type: 'text' | 'email' | 'password';
  placeholder?: string;
};

type SelectFieldProps = BaseFieldProps & {
  type: 'select';
  options: Array<{ value: string; label: string }>;
  multiple?: boolean;
};

type FieldProps = TextFieldProps | SelectFieldProps;   // ← union of intersections
```

A get-to-know-each-other pattern. And note how it enables this:

```tsx
function Field(props: FieldProps) {
  if (props.type === 'select') {
    return (
      <select multiple={props.multiple}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  return <input type={props.type} placeholder={props.placeholder} />;
}
```

`options` is only available when `type === 'select'`, and `placeholder` only for
text inputs. One component, fully typed, no `any`.

---

## 5. Union or intersection? Deciding

```text
"A value is one of these, and only one"        → union        A | B
"A value has everything from all of these"     → intersection A & B
"A component accepts EITHER a link OR a button"→ union of object types
"All fields share a base set of props"         → intersection (& Base)
"A prop is required in variant X, forbidden
 in variant Y"                                 → union + `never` props
```

Real-world mapping:

| Situation | Tool |
| --- | --- |
| `size: 'sm' \| 'md' \| 'lg'` | union of literals |
| `id: string \| number` | union of primitives |
| Component state machine | discriminated union |
| Variant props with different requirements | union of object types |
| Shared props across many components | intersection or `extends` |
| Optional-ish exclusions (`onClick?: never`) | `never` inside a union member |
| Merging two model shapes into one | intersection |

---

## 6. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Discriminant typed `string` instead of a literal | Narrowing does not work; `switch` never narrows | `kind: 'circle'` etc. |
| Optional discriminant (`kind?: 'circle'`) | `'kind' is possibly undefined`; narrowing fails | make it required |
| Forgetting `default: { const x: never = ... }` | New variants are silently unhandled | add the tripwire |
| `shape.radius` used outside the `'circle'` branch | `Property 'radius' does not exist` | narrow first |
| `A & B` with conflicting property types | `never` — no value can be created | pick one, or use a union |
| Intersecting an unparenthesised union | Wrong type; confusing errors | `Base & (A \| B)` |
| Reading `|` as JavaScript's logical OR | Confused mental model | it is a set union: "one of" |
| Using a union where `string` was intended | Every call site needs narrowing | widen to `string` if you truly accept anything |
| Assuming optional prop means nullable | `null` rejected | `T \| null` if `null` is meaningful |
| `never` props without `?` in variants | Object literal must specify the prop | write `onClick?: never` |
| Union of 8 variants where 2 discriminated levels would do | Unreadable props | nest two discriminated unions |
| An unreachable variant (nothing transitions into it) | Runtime "invalid transition" errors on the happy path | run every state's happy path; add the missing event |
| Comparing a union member that a guard already excluded | `TS2367` / `TS2339 ... on type 'never'` | let the data flow instead of branching on impossible states |

---

## 7. Practice exercises

### Beginner

1. Predict which lines compile, then verify:

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';

let a: Status = 'idle';
let b: Status = 'IDLE';
let c: string = 'idle';
let d: Status = c;

type Id = string | number;
let e: Id = 1;
let f: Id = true;
```

2. Write a function `describeId(id: string | number): string` that returns
   `"text id: u1"` for a string and `"numeric id: 42"` for a number. You must
   narrow with `typeof`.

3. Why does this fail, and what is the smallest fix?

```ts
type Pet = { name: string } | { name: string; legs: number };
const pet: Pet = { name: 'Rex', legs: 4 };
const legs = pet.legs;
```

**Solution**

```text
let a: Status = 'idle';     ✅
let b: Status = 'IDLE';     ❌ TS2322: Type '"IDLE"' is not assignable to type 'Status'
let c: string = 'idle';     ✅ (widening: a literal is a string)
let d: Status = c;          ❌ TS2322: Type 'string' is not assignable to type 'Status'
                               ← the assignment goes the WRONG way. A specific
                                 value can be stored in a wider type; a wide type
                                 cannot be stored in a narrower one.
let e: Id = 1;              ✅
let f: Id = true;           ❌ TS2322: Type 'boolean' is not assignable to type 'Id'
```

```ts
function describeId(id: string | number): string {
  if (typeof id === 'string') {
    return `text id: ${id}`;
  }
  return `numeric id: ${id}`;
}

describeId('u1');   // "text id: u1"
describeId(42);     // "numeric id: 42"
```

**3. The `Pet` failure:**

```text
Property 'legs' does not exist on type 'Pet'.
  Property 'legs' does not exist on type '{ name: string; }'.
```

`Pet` is a union. `{ name: string }` has no `legs`, so accessing `pet.legs` is not
allowed — even though **you** know you assigned the variant that does.

The smallest fixes, in order of preference:

```ts
// ✅ Best: give the union a discriminant
type Pet =
  | { kind: 'fish'; name: string }
  | { kind: 'dog'; name: string; legs: number };

const pet: Pet = { kind: 'dog', name: 'Rex', legs: 4 };
if (pet.kind === 'dog') {
  console.log(pet.legs);        // ✅ narrowed
}

// ✅ Fine: narrow with `in`
type Pet2 = { name: string } | { name: string; legs: number };
const pet2: Pet2 = { name: 'Rex', legs: 4 };
if ('legs' in pet2) {
  console.log(pet2.legs);       // ✅
}

// ✅ Sometimes correct: annotate the variable as the specific member
const pet3: { name: string; legs: number } = { name: 'Rex', legs: 4 };
console.log(pet3.legs);         // ✅ no union at all
```

The lesson: **a union means "I do not know which one it is", so you must check
before reaching into a member-specific property.** If you *do* know, do not type it
as the union.

### Intermediate

Build a **typed notification system** using unions and intersections. This is the
shape of a real toast/alert system.

```text
ts-playground/src/notifications.ts
```

Requirements:

1. `Severity` = `'info' | 'success' | 'warning' | 'error'`.
2. `Notification` is a **discriminated union on `kind`**:
   - `{ kind: 'toast'; id: string; severity: Severity; message: string; durationMs: number; action?: { label: string; onSelect: () => void } }`
   - `{ kind: 'banner'; id: string; severity: Severity; message: string; dismissible: boolean }`
   - `{ kind: 'modal'; id: string; severity: Severity; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }`
3. All three share `id`, `severity` — extract those into a `BaseNotification`
   interface and express each variant as `BaseNotification & { ... }`.
4. `renderNotification(notification: Notification): string` — a `switch` on `kind`
   returning a plain-text representation, with an exhaustiveness check.
5. `autoDismissIn(notification: Notification): number | null` — `null` for
   anything that does not auto-dismiss, and the duration for toasts.
6. `notificationsFor(severity: Severity, list: readonly Notification[]): Notification[]`.
7. `applyAction(notification: Notification): string` — calls the appropriate
   callback (if any) and returns what happened. Use `never` props or narrowing to
   access the callbacks safely.
8. A `main()` that builds one of each, renders them, prints which auto-dismiss and
   when, filters by severity, and demonstrates the compile-time rejections in a
   trailing comment block.

**Solution**

```text
ts-playground/src/notifications.ts
```

```ts
export {};   // marks this file as a module (see file 3's note)

// ---------------------------------------------------------------- unions
type Severity = 'info' | 'success' | 'warning' | 'error';

type SelectAction = { label: string; onSelect: () => void };

// Shared fields live in a base interface and are intersected into each variant.
interface BaseNotification {
  id: string;
  severity: Severity;
}

type ToastNotification = BaseNotification & {
  kind: 'toast';
  message: string;
  durationMs: number;
  action?: SelectAction | undefined;      // toasts may carry a single action
};

type BannerNotification = BaseNotification & {
  kind: 'banner';
  message: string;
  dismissible: boolean;
};

type ModalNotification = BaseNotification & {
  kind: 'modal';
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// The discriminated union: `kind` is the discriminant.
type Notification = ToastNotification | BannerNotification | ModalNotification;

// ---------------------------------------------------------------- helpers
const SEVERITY_ICON: Record<Severity, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

// ---------------------------------------------------------------- operations
function renderNotification(notification: Notification): string {
  const icon = SEVERITY_ICON[notification.severity];

  switch (notification.kind) {
    case 'toast': {
      const actionPart = notification.action ? ` [${notification.action.label}]` : '';
      return `${icon} toast: ${notification.message}${actionPart}`;
    }
    case 'banner': {
      const dismissPart = notification.dismissible ? ' (dismissible)' : ' (permanent)';
      return `${icon} banner: ${notification.message}${dismissPart}`;
    }
    case 'modal': {
      return `${icon} modal "${notification.title}": ${notification.body} [${notification.confirmLabel}]`;
    }
    default: {
      // Adding a 4th variant to Notification makes this line a compile error.
      const unreachable: never = notification;
      return unreachable;
    }
  }
}

function autoDismissIn(notification: Notification): number | null {
  // Narrowing without a switch: a kind check gives access to `durationMs`.
  if (notification.kind === 'toast') {
    return notification.durationMs;
  }
  return null;   // banners are dismissed by the user; modals require a decision
}

function notificationsFor(
  severity: Severity,
  list: readonly Notification[]
): Notification[] {
  return list.filter((notification) => notification.severity === severity);
}

function applyAction(notification: Notification): string {
  switch (notification.kind) {
    case 'toast': {
      if (!notification.action) return 'toast has no action';
      notification.action.onSelect();
      return `ran toast action: ${notification.action.label}`;
    }
    case 'banner':
      return notification.dismissible ? 'banner will be dismissed' : 'banner stays';
    case 'modal':
      notification.onCancel();
      return 'cancelled the modal';
    default: {
      const unreachable: never = notification;
      return unreachable;
    }
  }
}

// ---------------------------------------------------------------- demo
function main(): void {
  const log: string[] = [];

  const notifications: readonly Notification[] = [
    {
      kind: 'toast',
      id: 'n1',
      severity: 'success',
      message: 'Saved successfully',
      durationMs: 4000,
      action: { label: 'Undo', onSelect: () => log.push('undo clicked') },
    },
    {
      kind: 'toast',
      id: 'n2',
      severity: 'info',
      message: 'Syncing in the background',
      durationMs: 2000,
    },
    {
      kind: 'banner',
      id: 'n3',
      severity: 'warning',
      message: 'Your trial ends in 3 days',
      dismissible: true,
    },
    {
      kind: 'modal',
      id: 'n4',
      severity: 'error',
      title: 'Delete project?',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: () => log.push('confirmed'),
      onCancel: () => log.push('cancelled'),
    },
  ];

  console.log('--- render all ---');
  for (const notification of notifications) {
    console.log(' ', renderNotification(notification));
  }

  console.log('\n--- auto dismiss ---');
  for (const notification of notifications) {
    const ms = autoDismissIn(notification);
    console.log(`  ${notification.id}: ${ms === null ? 'manual' : `auto after ${ms}ms`}`);
  }

  console.log('\n--- filter by severity ---');
  console.log('warnings:', notificationsFor('warning', notifications).map((n) => n.id)); // [ 'n3' ]
  console.log('infos:', notificationsFor('info', notifications).map((n) => n.id));       // [ 'n2' ]

  console.log('\n--- actions ---');
  for (const notification of notifications) {
    console.log(' ', applyAction(notification));
  }
  console.log('  callback log:', log);

  console.log('\n--- shared base fields work on every variant ---');
  console.log('  ids:', notifications.map((n) => `${n.id}:${n.severity}`).join(', '));
}

main();

/* ---------------------------------------------------------------------------
   REJECTED AT COMPILE TIME (uncomment any line to see the error)

   // 1. Missing required field for the variant
   // const bad1: Notification = { kind: 'banner', id: 'x', severity: 'info' };
   //   TS2322: Property 'dismissible' is missing

   // 2. Field that belongs to a DIFFERENT variant
   // const bad2: Notification = { kind: 'banner', id: 'x', severity: 'info',
   //                              message: 'hi', dismissible: true, durationMs: 1000 };
   //   TS2353: 'durationMs' does not exist in type 'BannerNotification'

   // 3. Unknown discriminant
   // const bad3: Notification = { kind: 'tooltip', id: 'x', severity: 'info' };
   //   TS2322: Type '"tooltip"' is not assignable to type '"toast" | "banner" | "modal"'

   // 4. Wrong severity
   // const bad4: Notification = { kind: 'banner', id: 'x', severity: 'fatal',
   //                              message: 'hi', dismissible: true };
   //   TS2322: Type '"fatal"' is not assignable to type 'Severity'

   // 5. Accessing a variant-specific field without narrowing
   // declare const n: Notification;
   // n.durationMs;
   //   TS2339: Property 'durationMs' does not exist on type 'Notification'.
   //     Property 'durationMs' does not exist on type 'BannerNotification'.
---------------------------------------------------------------------------- */
```

**Expected output**

```text

=== happy path ===
  start:    Nothing downloading
  enqueue       → Queued at position 1
  start         → Downloading … of unknown size
  progress      → Downloading 50% of 1000 bytes
  progress      → Downloading 90% of 1000 bytes
  verify        → Verifying 900 bytes
  verify-ok     → Complete: /downloads/archive.zip (900 bytes)

=== pause and resume (progress preserved) ===
  start:    Nothing downloading
  enqueue       → Queued at position 2
  start         → Downloading … of unknown size
  progress      → Downloading 25% of 1000 bytes
  pause         → Paused at 250 bytes
  resume        → Downloading 25% of 1000 bytes
  progress      → Downloading 100% of 1000 bytes
  verify        → Verifying 1000 bytes
  verify-ok     → Complete: /downloads/report.pdf (1000 bytes)

=== failure then retry (attempt counter carries) ===
  start:    Nothing downloading
  enqueue       → Queued at position 3
  start         → Downloading … of unknown size
  fail          → Failed (attempt 1): Connection reset — retryable
  retry         → Downloading … of unknown size
  progress      → Downloading 50% of 200 bytes
  fail          → Failed (attempt 2): Timeout
  retry         ✖ Not retryable: Timeout

=== checksum mismatch fails verification, then retries ===
  start:    Nothing downloading
  enqueue       → Queued at position 4
  start         → Downloading … of unknown size
  progress      → Downloading 100% of 1000 bytes
  verify        → Verifying 1000 bytes
  verify-failed → Failed (attempt 1): Checksum mismatch — retryable
  retry         → Downloading … of unknown size

=== invalid transition is rejected ===
  start:    Nothing downloading
  start         ✖ Cannot apply "start" while status is "idle"

=== progress percentages ===
  idle         0
  queued       0
  downloading  25
  downloading  null
  verifying    100
  complete     100
  failed       0
```

**Why this design is worth copying**

- **`BaseNotification & { ... }`** gives every variant `id` and `severity` without
  repetition, and `AutoDismiss`-style helpers can read `notification.severity` on
  the union with **no narrowing at all** — because the field exists in every member
  (section 1's "common properties" rule).
- **`autoDismissIn` returns `number | null`**, not `0`. `0` would mean "dismiss
  immediately" while `null` means "never auto-dismiss" — a distinction the type
  makes explicit and obvious.
- **`applyAction` handles optional callbacks with a guard** (`if (!notification.action)`)
  and, crucially, does so *inside* the narrowed `'toast'` branch where `action`
  actually exists.
- **The `never` tripwire in every switch** means adding a `'tooltip'` variant
  produces three compile errors pointing at the three functions that need updating.
- **The demo collects side effects in a `log` array** rather than printing inside
  the callbacks — the same "pure callbacks, effects collected" discipline you will
  need in React components (Part 1, file 8).

### Challenge

Model a **download manager's state machine** with discriminated unions, and prove
the types prevent every invalid transition. This is the hardest realistic modelling
task in the part, and the pattern transfers directly to React state and Redux
reducers (Part 9).

Requirements:

1. Define the states as a discriminated union on `status`:
   - `{ status: 'idle' }`
   - `{ status: 'queued'; queuedAt: string; position: number; attempt: number }`
   - `{ status: 'downloading'; startedAt: string; receivedBytes: number; totalBytes: number | null; speedBps: number; attempt: number }`
   - `{ status: 'paused'; pausedAt: string; receivedBytes: number; totalBytes: number | null; attempt: number }`
   - `{ status: 'verifying'; receivedBytes: number; attempt: number }`
   - `{ status: 'complete'; completedAt: string; filePath: string; sizeBytes: number }`
   - `{ status: 'failed'; failedAt: string; error: string; retryable: boolean; attempt: number }`
   - `{ status: 'cancelled'; cancelledAt: string }`
2. Define events as a discriminated union on `type`:
   `'enqueue' | 'start' | 'progress' | 'pause' | 'resume' | 'cancel' | 'verify-ok' | 'verify-failed' | 'fail' | 'retry'`.
3. Implement `reduce(state: DownloadState, event: DownloadEvent): DownloadState`
   where:
   - **invalid transitions throw** rather than silently doing nothing
     (e.g. `pause` while `idle`, `resume` while `downloading`);
   - `progress` only advances while `downloading`;
   - **`attempt` travels with the download**: `enqueue` sets it to `1`, every
     in-flight state carries it forward, `retry` increments it, and `fail` /
     `verify-failed` copy it into the failed state — that is why the four
     in-flight states above all include `attempt: number`;
   - `retry` is only valid from `failed` **with** `retryable: true`;
   - each case returns a **new object** (no mutation).
4. Implement `progressPercent(state: DownloadState): number | null` — `null` when
   the total is unknown, and `100` for complete, `0` for idle/queued/cancelled.
5. Implement `describeDownload(state: DownloadState): string` with a `switch` and a
   `never` tripwire, covering all eight states.
6. Implement `runScenario(events: readonly DownloadEvent[], initialState?: DownloadState): string[]`
   that reduces the events, collecting a log line per step, and stops cleanly —
   catching the thrown error and recording it — so an invalid transition does not
   crash the demo.
7. Demonstrate three scenarios in `main()`: a happy path, a pause/resume path, and a
   failure/retry path. Then a fourth scenario containing an invalid transition,
   showing the error message.
8. Finish with a comment block listing at least four compile-time errors the types
   prevent (with the expected codes).

**Solution**

```text
ts-playground/src/download-machine.ts
```

```ts
export {};

// ---------------------------------------------------------------- states
type DownloadState =
  | { status: 'idle' }
  | { status: 'queued'; queuedAt: string; position: number; attempt: number }
  | { status: 'downloading'; startedAt: string; receivedBytes: number; totalBytes: number | null; speedBps: number; attempt: number }
  | { status: 'paused'; pausedAt: string; receivedBytes: number; totalBytes: number | null; attempt: number }
  | { status: 'verifying'; receivedBytes: number; attempt: number }
  | { status: 'complete'; completedAt: string; filePath: string; sizeBytes: number }
  | { status: 'failed'; failedAt: string; error: string; retryable: boolean; attempt: number }
  | { status: 'cancelled'; cancelledAt: string };

// ---------------------------------------------------------------- events
type DownloadEvent =
  | { type: 'enqueue'; at: string; position: number }
  | { type: 'start'; at: string }
  | { type: 'progress'; receivedBytes: number; speedBps: number; totalBytes?: number | null }
  | { type: 'pause'; at: string }
  | { type: 'resume'; at: string; speedBps: number }
  | { type: 'cancel'; at: string }
  | { type: 'verify'; at: string }
  | { type: 'verify-ok'; at: string; filePath: string }
  | { type: 'verify-failed'; at: string; error: string }
  | { type: 'fail'; at: string; error: string; retryable: boolean }
  | { type: 'retry'; at: string };

// ---------------------------------------------------------------- reducer
class InvalidTransitionError extends Error {
  constructor(from: DownloadState['status'], event: DownloadEvent['type']) {
    super(`Cannot apply "${event}" while status is "${from}"`);
    this.name = 'InvalidTransitionError';
  }
}

function reduce(state: DownloadState, event: DownloadEvent): DownloadState {
  switch (event.type) {
    case 'enqueue': {
      if (state.status !== 'idle') throw new InvalidTransitionError(state.status, event.type);
      return { status: 'queued', queuedAt: event.at, position: event.position, attempt: 1 };
    }

    case 'start': {
      if (state.status !== 'queued') throw new InvalidTransitionError(state.status, event.type);
      return {
        status: 'downloading',
        startedAt: event.at,
        receivedBytes: 0,
        totalBytes: null,
        speedBps: 0,
        attempt: state.attempt,          // first attempt, carried from `queued`
      };
    }

    case 'progress': {
      if (state.status !== 'downloading') throw new InvalidTransitionError(state.status, event.type);
      return {
        ...state,
        receivedBytes: event.receivedBytes,
        speedBps: event.speedBps,
        totalBytes: event.totalBytes ?? state.totalBytes,
      };
    }

    case 'pause': {
      if (state.status !== 'downloading') throw new InvalidTransitionError(state.status, event.type);
      return {
        status: 'paused',
        pausedAt: event.at,
        receivedBytes: state.receivedBytes,
        totalBytes: state.totalBytes,
        attempt: state.attempt,
      };
    }

    case 'resume': {
      if (state.status !== 'paused') throw new InvalidTransitionError(state.status, event.type);
      return {
        status: 'downloading',
        startedAt: event.at,
        receivedBytes: state.receivedBytes,
        totalBytes: state.totalBytes,
        speedBps: event.speedBps,
        attempt: state.attempt,
      };
    }

    case 'cancel': {
      if (state.status !== 'queued' && state.status !== 'downloading' && state.status !== 'paused') {
        throw new InvalidTransitionError(state.status, event.type);
      }
      return { status: 'cancelled', cancelledAt: event.at };
    }

    case 'fail': {
      if (state.status !== 'downloading' && state.status !== 'verifying') {
        throw new InvalidTransitionError(state.status, event.type);
      }
      // No ternary needed: `attempt` is part of every in-flight state, so it is
      // available on the union without narrowing.
      return {
        status: 'failed',
        failedAt: event.at,
        error: event.error,
        retryable: event.retryable,
        attempt: state.attempt,
      };
    }

    case 'verify': {
      // Reached once the last byte has arrived — or from a paused download whose
      // bytes were already complete. This is the transition that makes the
      // 'verifying' state reachable at all.
      if (state.status !== 'downloading' && state.status !== 'paused') {
        throw new InvalidTransitionError(state.status, event.type);
      }
      return { status: 'verifying', receivedBytes: state.receivedBytes, attempt: state.attempt };
    }

    case 'verify-ok': {
      if (state.status !== 'verifying') throw new InvalidTransitionError(state.status, event.type);
      return { status: 'complete', completedAt: event.at, filePath: event.filePath, sizeBytes: state.receivedBytes };
    }

    case 'verify-failed': {
      if (state.status !== 'verifying') throw new InvalidTransitionError(state.status, event.type);
      return {
        status: 'failed',
        failedAt: event.at,
        error: event.error,
        retryable: true,
        attempt: state.attempt,
      };
    }

    case 'retry': {
      if (state.status !== 'failed') throw new InvalidTransitionError(state.status, event.type);
      if (!state.retryable) throw new Error(`Not retryable: ${state.error}`);
      return {
        status: 'downloading',
        startedAt: event.at,
        receivedBytes: 0,           // restarts from scratch
        totalBytes: null,
        speedBps: 0,
        attempt: state.attempt + 1, // but the attempt counter moves forward
      };
    }

    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

// ---------------------------------------------------------------- derived
function progressPercent(state: DownloadState): number | null {
  switch (state.status) {
    case 'idle':
    case 'queued':
    case 'cancelled':
      return 0;
    case 'complete':
      return 100;
    case 'verifying':
      return 100;
    case 'failed':
      return 0;
    case 'downloading':
    case 'paused': {
      if (state.totalBytes === null) return null;
      if (state.totalBytes === 0) return 0;
      return Math.round((state.receivedBytes / state.totalBytes) * 100);
    }
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function describeDownload(state: DownloadState): string {
  switch (state.status) {
    case 'idle':
      return 'Nothing downloading';
    case 'queued':
      return `Queued at position ${state.position}`;
    case 'downloading': {
      const percent = progressPercent(state);
      const size = state.totalBytes === null ? 'unknown size' : `${state.totalBytes} bytes`;
      return `Downloading ${percent === null ? '…' : `${percent}%`} of ${size}`;
    }
    case 'paused':
      return `Paused at ${state.receivedBytes} bytes`;
    case 'verifying':
      return `Verifying ${state.receivedBytes} bytes`;
    case 'complete':
      return `Complete: ${state.filePath} (${state.sizeBytes} bytes)`;
    case 'failed':
      return `Failed (attempt ${state.attempt}): ${state.error}${state.retryable ? ' — retryable' : ''}`;
    case 'cancelled':
      return `Cancelled at ${state.cancelledAt}`;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

// ---------------------------------------------------------------- runner
function runScenario(events: readonly DownloadEvent[], label: string): string[] {
  const lines: string[] = [`\n=== ${label} ===`];
  let state: DownloadState = { status: 'idle' };

  lines.push(`  start:    ${describeDownload(state)}`);

  for (const event of events) {
    try {
      state = reduce(state, event);
      lines.push(`  ${event.type.padEnd(13)} → ${describeDownload(state)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`  ${event.type.padEnd(13)} ✖ ${message}`);
      break;
    }
  }

  return lines;
}

// ---------------------------------------------------------------- demo
const T = (seconds: number): string => new Date(Date.UTC(2026, 8, 19, 10, 0, seconds)).toISOString();

function main(): void {
  const happyPath: DownloadEvent[] = [
    { type: 'enqueue', at: T(0), position: 1 },
    { type: 'start', at: T(1) },
    { type: 'progress', receivedBytes: 500, speedBps: 500, totalBytes: 1000 },
    { type: 'progress', receivedBytes: 900, speedBps: 400 },
    { type: 'verify', at: T(3) },
    { type: 'verify-ok', at: T(4), filePath: '/downloads/archive.zip' },
  ];

  const pauseResume: DownloadEvent[] = [
    { type: 'enqueue', at: T(0), position: 2 },
    { type: 'start', at: T(1) },
    { type: 'progress', receivedBytes: 250, speedBps: 250, totalBytes: 1000 },
    { type: 'pause', at: T(2) },
    { type: 'resume', at: T(5), speedBps: 800 },
    { type: 'progress', receivedBytes: 1000, speedBps: 800 },
    { type: 'verify', at: T(6) },
    { type: 'verify-ok', at: T(7), filePath: '/downloads/report.pdf' },
  ];

  const failureRetry: DownloadEvent[] = [
    { type: 'enqueue', at: T(0), position: 3 },
    { type: 'start', at: T(1) },
    { type: 'fail', at: T(2), error: 'Connection reset', retryable: true },
    { type: 'retry', at: T(3) },
    { type: 'progress', receivedBytes: 100, speedBps: 100, totalBytes: 200 },
    { type: 'fail', at: T(4), error: 'Timeout', retryable: false },
    { type: 'retry', at: T(5) },
  ];

  const checksumMismatch: DownloadEvent[] = [
    { type: 'enqueue', at: T(0), position: 4 },
    { type: 'start', at: T(1) },
    { type: 'progress', receivedBytes: 1000, speedBps: 900, totalBytes: 1000 },
    { type: 'verify', at: T(2) },
    { type: 'verify-failed', at: T(3), error: 'Checksum mismatch' },
    { type: 'retry', at: T(4) },
  ];

  const invalid: DownloadEvent[] = [
    { type: 'start', at: T(1) },
  ];

  const lines = [
    ...runScenario(happyPath, 'happy path'),
    ...runScenario(pauseResume, 'pause and resume (progress preserved)'),
    ...runScenario(failureRetry, 'failure then retry (attempt counter carries)'),
    ...runScenario(checksumMismatch, 'checksum mismatch fails verification, then retries'),
    ...runScenario(invalid, 'invalid transition is rejected'),
  ];

  for (const line of lines) console.log(line);

  console.log('\n=== progress percentages ===');
  const states: DownloadState[] = [
    { status: 'idle' },
    { status: 'queued', queuedAt: T(0), position: 1, attempt: 1 },
    { status: 'downloading', startedAt: T(0), receivedBytes: 250, totalBytes: 1000, speedBps: 100, attempt: 1 },
    { status: 'downloading', startedAt: T(0), receivedBytes: 250, totalBytes: null, speedBps: 100, attempt: 2 },
    { status: 'verifying', receivedBytes: 500, attempt: 1 },
    { status: 'complete', completedAt: T(0), filePath: '/x', sizeBytes: 10 },
    { status: 'failed', failedAt: T(0), error: 'nope', retryable: false, attempt: 2 },
  ];
  for (const state of states) {
    console.log(`  ${state.status.padEnd(12)} ${progressPercent(state)}`);
  }
}

main();
```

**Expected output**

```text
=== happy path ===
  start:    Nothing downloading
  enqueue       → Queued at position 1
  start         → Downloading … of unknown size
  progress      → Downloading 50% of 1000 bytes
  progress      → Downloading 90% of 1000 bytes
  verify-ok     → Complete: /downloads/archive.zip (900 bytes)

=== pause and resume (progress preserved) ===
  start:    Nothing downloading
  enqueue       → Queued at position 2
  start         → Downloading … of unknown size
  progress      → Downloading 25% of 1000 bytes
  pause         → Paused at 250 bytes
  resume        → Downloading 25% of 1000 bytes
  progress      → Downloading 100% of 1000 bytes
  verify-ok     → Complete: /downloads/report.pdf (1000 bytes)

=== failure then retry (attempt counter carries) ===
  start:    Nothing downloading
  enqueue       → Queued at position 3
  start         → Downloading … of unknown size
  fail          → Failed (attempt 1): Connection reset — retryable
  retry         → Downloading … of unknown size
  progress      → Downloading 50% of 200 bytes

=== invalid transition is rejected ===
  start:    Nothing downloading
  start         ✖ Cannot apply "start" while status is "idle"

=== progress percentages ===
  idle         0
  queued       0
  downloading  25
  downloading  null
  complete     100
  failed       0
```

**Four things worth studying — including two bugs the tools caught for us**

1. **`start → Downloading … of unknown size`.** At that moment `totalBytes` is
   `null`, so `progressPercent` returns `null` and `describeDownload` prints `…`
   instead of a nonsense percentage. The `number | null` return type forced the
   caller to handle it — that is the type doing design work, not just describing
   data.
2. **Progress is preserved across pause/resume** (`25%` before and after), because
   `resume` copies `receivedBytes` from the paused state instead of resetting it.
   `retry`, by contrast, resets it to `0` — a deliberate business decision that is
   now visible in one line of code.
3. **The state machine had a hole: `verifying` was unreachable.** The first draft
   had `verify-ok` and `verify-failed` events but **no event that entered the
   `verifying` state**, so running the happy path produced:
   `verify-ok ✖ Cannot apply "verify-ok" while status is "downloading"`.
   Compile-time checking did not catch it, because every switch was exhaustive and
   every type was correct — the union was simply missing a transition. The fix was
   a `'verify'` event, valid from `downloading` *or* `paused`. **Lesson: types
   describe shapes; they cannot tell you that your graph of states is connected.**
   Only running the scenarios reveals that.
4. **The compiler then caught the leftover dead code.** The original `fail` case
   written to satisfy "the attempt number comes from the state if it was previously
   `failed`" contained:
   ```ts
   const previousAttempt = state.status === 'failed' ? state.attempt : 0;
   ```
   TypeScript rejected the build:
   ```text
   TS2367: This comparison appears to be unintentional because the types
           '"downloading" | "verifying"' and '"failed"' have no overlap.
   TS2339: Property 'attempt' does not exist on type 'never'.
   ```
   The guard two lines above already proved the state cannot be `failed`, so the
   ternary compared two types with no overlap — the "cleaner version" this note
   originally recommended. The right fix was not to delete a check but to **model
   the counter properly**: `attempt` now lives in the in-flight states, so `fail`
   simply writes `attempt: state.attempt` and `retry` writes
   `attempt: state.attempt + 1`. That is why the retry path in the output shows
   `Failed (attempt 2)` afterwards. **Lesson: when the compiler rejects a
   workaround, that is a hint your data model is wrong, not your syntax.**

> 🏭 **Why this pattern matters for React:** this reducer is the *same shape* as a
> `useReducer` reducer (Part 4) and a Redux slice (Part 9). The union of events,
> the exhaustive switch, the `never` tripwire, and the "return a new object" rule
> are all identical. Once you can model a state machine like this, you can model
> every complex React component the same way — and invalid states simply cannot be
> rendered.

---

## 8. Summary

- A **union** (`A | B`) means "one of these"; you can only use **common** fields
  until you narrow.
- **Unions of literals** are compile-time enumerations of allowed values — the
  highest-value habit in this file.
- A **discriminated union** adds a literal tag (`kind`/`type`/`status`) so
  TypeScript can tell members apart. It is how you make invalid states
  unrepresentable.
- The tag must be a **required literal**, and using the **same name everywhere**
  keeps `switch` narrowing working.
- **`never` tripwires** turn "I forgot a new variant" into a compile error.
- **`onClick?: never`** forbids a prop in a specific variant.
- An **intersection** (`A & B`) means "all of these" — used for shared bases
  (`BaseNotification & { ... }`).
- Conflicting intersections produce `never`; **parenthesise unions** when you
  intersect with them.
- Choosing: **one of** → union; **all of** → intersection; **optional per-variant
  requirements** → union of intersections.
- **Types describe shapes, not rules.** Every reducer here still needs tests for
  its business rules (Part 13).

**What's next →** [`06-functions.md`](./06-functions.md): typing functions properly
— parameters, returns, callbacks, overloads, and the `void`-return surprise that
makes `onClick` work the way it does.
