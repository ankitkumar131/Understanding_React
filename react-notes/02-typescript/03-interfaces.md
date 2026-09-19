# 03 — Interfaces

> **Part 2 · TypeScript · File 3 of 11**
>
> **Why this file exists:** in React, almost every object you write is either
> **props** or a **data model**, and almost every one of them is declared as an
> `interface`. This file teaches interfaces properly — including the parts that
> are specific to React: optional props, readonly props, extending a native
> element's props, and function props.

---

## 1. What an interface is

An **interface** names an object's shape.

```ts
interface User {
  id: number;
  name: string;
  email: string;
}
```

Read it as: "a `User` is an object with these three properties, with these types."

```ts
const user: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

// Every one of these is an error:
// const missing: User = { id: 1, name: 'Ada' };
//    TS2741: Property 'email' is missing in type '{ id: number; name: string; }'
//           but required in type 'User'.

// const wrongType: User = { id: '1', name: 'Ada', email: 'a@b.c' };
//    TS2322: Type 'string' is not assignable to type 'number'.

// const extra: User = { id: 1, name: 'Ada', email: 'a@b.c', age: 36 };
//    TS2353: Object literal may only specify known properties, and 'age' does
//           not exist in type 'User'.
```

Three things to notice immediately:

1. **Interfaces exist only in the type system** — they are erased at runtime
   (file 1). You cannot `console.log(User)`.
2. **They are open to extension** (section 5) — which is what makes them good for
   props.
3. **They describe shapes, not identities** — TypeScript is structural (file 2),
   so any object with the right shape satisfies the interface, whatever it was
   *called* when created.

---

## 2. The interface you will write most: props

In React, a component receives a **single object** called `props`. Typing a
component means typing that object — and the convention is to name it
`<ComponentName>Props`.

```text
src/components/UserCard.tsx
```

```tsx
interface UserCardProps {
  user: {
    id: number;
    name: string;
    email: string;
  };
}

function UserCard({ user }: UserCardProps) {
  return (
    <article>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </article>
  );
}
```

**Line by line**

- `interface UserCardProps` — the shape of everything the component accepts. Any
  prop the caller passes that is not declared here is an error.
- `function UserCard({ user }: UserCardProps)` — destructured parameter typed with
  the interface (Part 1 file 5). Without the annotation, `user` would be an
  implicit `any` and `strict` would reject it.
- `{user.name}` — now autocompletes, and a typo like `user.nmae` is a compile
  error.

Naming the nested type is usually better than nesting it inline, because other
files will need it:

```tsx
export interface User {
  id: number;
  name: string;
  email: string;
}

export interface UserCardProps {
  user: User;
}
```

> 💡 **Where should the interface live?** Three common choices, all valid:
> 1. **Same file as the component** (what React's docs do) — good default, keeps
>    the contract next to the implementation, and `export` it if others need it.
> 2. **A shared `types/` folder** — for models used by many components and the API
>    layer (Part 15).
> 3. **A `ComponentName.types.ts` file next to the component** — for large props
>    with several helper types.
>
> Pick one and be consistent. The rule that matters: **a component's props type
> should be discoverable from the component.**

---

## 3. Optional properties

```ts
interface ButtonProps {
  label: string;           // required
  variant?: 'primary' | 'secondary';   // optional
  disabled?: boolean;      // optional
  onClick?: () => void;    // optional
}
```

- `?` means the property may be **absent entirely**.
- When read, its type includes `undefined`: inside the component,
  `variant` is `'primary' | 'secondary' | undefined`.
- **That is why you must handle it** — with a default value, a fallback, or a
  conditional render.

```tsx
function Button({ label, variant = 'primary', disabled = false, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// All valid:
<Button label="Save" />
<Button label="Save" variant="secondary" />
<Button label="Save" disabled onClick={() => save()} />
```

Default values in the parameter list (Part 1 file 4) are how you turn
"optional" into "always defined" *inside* the component. This replaced the old
`defaultProps` API.

### `?` vs `| undefined` — a real difference

```ts
interface A {
  name?: string;              // may be absent
}

interface B {
  name: string | undefined;   // must be present; value may be undefined
}

const a: A = {};                 // ✅
const b: B = {};                 // ❌ TS2741: Property 'name' is missing
const b2: B = { name: undefined }; // ✅ present, but empty
```

Why care in React? Because a **required prop that may be `undefined`** is a
different contract from an **optional prop**. Use `?` when omitting the prop is
normal (`variant`), and `string | undefined` when the caller must think about it
(a `userId` that might not be loaded yet).

With `exactOptionalPropertyTypes` (file 1's config), the distinction is enforced
exactly as written above. Without it, TypeScript is slightly looser and lets
`{ name: undefined }` satisfy `A` too.

---

## 4. `readonly` properties

```ts
interface Config {
  readonly apiUrl: string;
  readonly retries: number;
  readonly headers: Record<string, string>;
}

const config: Config = { apiUrl: '/api', retries: 3, headers: {} };

// config.retries = 5;    // ❌ TS2540: Cannot assign to 'retries' because it is
                          //           a read-only property
// config.headers = {};   // ❌ same
config.headers['X-Token'] = 'abc';   // ⚠️ allowed! `readonly` is SHALLOW
```

`readonly` is:

- **compile-time only** — nothing is frozen at runtime;
- **shallow** — it stops reassigning the *property*, not mutating the object it
  points to. Use `Readonly<T>` (file 10) for a shallow mapped version, or
  `readonly string[]` / `Readonly<Record<...>>` to protect the nested levels you
  care about.

**Why React code uses it:**

```tsx
interface Props {
  readonly items: readonly string[];   // "I will not mutate your data"
}
```

Props are read-only by design — a component must never modify what it receives.
Types can help you enforce that discipline rather than relying on willpower.

---

## 5. Extending interfaces

`extends` composes interfaces. This is the pattern behind reusable component
libraries.

```ts
interface BaseEntity {
  id: string;
  createdAt: string;
}

interface User extends BaseEntity {
  name: string;
  email: string;
}

interface Order extends BaseEntity {
  total: number;
  status: 'pending' | 'paid' | 'shipped';
}

// A User must now have id, createdAt, name and email
const user: User = {
  id: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  name: 'Ada',
  email: 'ada@example.com',
};
```

Multiple bases:

```ts
interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

interface SoftDeletable {
  deletedAt: string | null;
}

interface Post extends Timestamps, SoftDeletable {
  title: string;
  body: string;
}

const post: Post = {
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  deletedAt: null,
  title: 'Hello',
  body: 'World',
};
```

### Overriding a base property (only in a compatible direction)

```ts
interface Animal {
  name: string;
  legs: number;
}

// Narrowing the type is allowed — 'dog' is still a string
interface Dog extends Animal {
  legs: 4;
}

// Widening is not:
// interface Broken extends Animal {
//   legs: number | 'many';   // ❌ TS2430: Interface 'Broken' incorrectly extends
// }                          //           'Animal'. Types of property 'legs' are
//                            //           incompatible.
```

> 💡 A subtype may be **more specific** than its base, never more general. That is
> the same rule that makes `Dog` usable where `Animal` is expected — and it is
> exactly how React props inheritance works in section 6.

---

## 6. Extending native element props (the React essential)

Sooner or later you build a component that *is* a styled `<button>`, `<input>` or
`<a>`. You want all the native props to keep working, plus your extras.

```tsx
interface IconButtonProps {
  icon: string;
  label: string;   // accessible name
  size?: 'sm' | 'md';
}
```

If you write only that, callers cannot pass `onClick`, `disabled`, `type`,
`aria-*` … and they will try. The fix is to extend the element's prop type:

```tsx
// import type { ComponentPropsWithoutRef } from 'react';

interface IconButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  icon: string;
  size?: 'sm' | 'md';
}

export function IconButton({ icon, size = 'md', className, ...buttonProps }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${size} ${className ?? ''}`.trim()}
      {...buttonProps}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
```

Now every native button prop works, and **your** props are added on top:

```tsx
<IconButton icon="🗑️" size="sm" onClick={remove} disabled={isSaving} aria-label="Delete" />
```

### The React element prop helpers

React's types ship several helpers. Knowing which to use saves real time:

| Helper | Gives you | Use when |
| --- | --- | --- |
| `React.ComponentProps<'button'>` | all props of `<button>`, including `ref` | you forward a ref (React 19: `ref` is a normal prop) |
| `React.ComponentPropsWithoutRef<'button'>` | the same **without** `ref` | the usual case for a wrapper |
| `React.ComponentPropsWithRef<'button'>` | the same **with** `ref` | explicit about ref forwarding |
| `React.HTMLAttributes<HTMLDivElement>` | only the HTML attributes (no `ref`, no `key`) for a `div` | non-interactive containers |
| `React.ButtonHTMLAttributes<HTMLButtonElement>` | props of a `button` | when you want the DOM element type spelled out |
| `React.InputHTMLAttributes<HTMLInputElement>` | props of an `input` | form fields |
| `React.PropsWithChildren<T>` | your props plus `children` | you accept children |

```tsx
// A generic wrapper div
interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  padded?: boolean;
}

export function Panel({ title, padded = true, children, className, ...rest }: PanelProps) {
  return (
    <section className={`panel ${padded ? 'panel--padded' : ''} ${className ?? ''}`.trim()} {...rest}>
      <h2 className="panel__title">{title}</h2>
      {children}
    </section>
  );
}

// <Panel title="Settings" onClick={handleClick} data-testid="settings" aria-label="Settings panel" />
```

```tsx
// PropsWithChildren in practice
interface CardProps extends React.PropsWithChildren {
  title: string;
}
// equivalent to:
interface CardProps2 {
  title: string;
  children?: React.ReactNode;
}
```

> ⚠️ **The `className` clash.** `React.ComponentPropsWithoutRef<'button'>` already
> declares `className?: string`. If you redeclare it as required
> (`className: string`), `extends` fails with TS2430 because a required property
> cannot override an optional one. Destructure it and default it instead
> (`className = ''`), exactly as `IconButton` does above.

> 💡 **Do not extend the wrong element.** `ComponentPropsWithoutRef<'input'>` has
> `value`, `type`, `onChange` typed for an input. Extending `'div'` gives you no
> form props at all. Pick the element you actually render.

---

## 7. Function properties (callbacks as props)

```tsx
interface SearchBoxProps {
  onSearch: (query: string) => void;             // a callback prop
  onClear?: () => void;                          // optional callback
  validate?: (query: string) => string | null;   // returns an error message or null
  format?: (results: string[]) => string;        // transforms a value
}
```

**Property style vs method style** (file 2 mentioned this; it matters most here):

```ts
interface WithProperty {
  onChange: (value: string) => void;    // ✅ prefer this
}

interface WithMethod {
  onChange(value: string): void;        // ⚠️ more lenient than you want
}
```

Method syntax is *bivariant* — TypeScript allows unsound assignments through it.
Property syntax is *contravariant* under `strictFunctionTypes`, which catches
callbacks that accept the wrong types. For React props, **always use the property
style**.

### Typing the return value correctly

```ts
type Handler = () => void;

interface Props {
  onClick: () => void;             // ✅ React ignores the return value
  onSubmit: () => Promise<void>;   // ✅ async handler: caller may await it
  onDelete: () => Promise<void>;   // ✅
}
```

`() => void` is **not** an error for a function that returns something — TypeScript
allows any return value to be ignored when the expected type is `void`. That is
deliberate: `onClick={async () => { await save(); }}` is legal even though it
returns a promise.

### Passing arguments back up

```tsx
interface TodoItemProps {
  todo: { id: string; title: string; done: boolean };
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  const { id, title, done } = todo;

  return (
    <li>
      <label>
        <input type="checkbox" checked={done} onChange={() => onToggle(id)} />
        <span>{title}</span>
      </label>
      <button type="button" onClick={() => onDelete(id)}>Delete</button>
    </li>
  );
}
```

Note `onChange={() => onToggle(id)}` — the arrow is required, or the handler fires
during render (Part 1 file 8). The type system will *not* catch this mistake,
because `onChange={() => onToggle(id)}` and `onChange={onToggle(id)}` are both
"functions" as far as types go. That is a good reminder: **types catch shapes, not
logic.**

---

## 8. Index signatures and methods

```ts
// A bag of arbitrary keys (rare in props; common in state maps)
interface Theme {
  colors: Record<string, string>;
  spacing: { [key: string]: number };
}

// Methods on an interface
interface Calculator {
  value: number;
  add(n: number): number;
  reset(): void;
}
```

Careful with index signatures + known keys — they must be compatible:

```ts
interface Mixed {
  id: string;                   // known key
  [key: string]: string;        // every key is a string → fine
}

interface Mixed2 {
  id: string;
  count: number;                // ❌ TS2411: Property 'count' of type 'number' is not
  [key: string]: string;        //    assignable to 'string' index type 'string'
}
```

If you need both, widen the index type:

```ts
interface Mixed3 {
  id: string;
  count: number;
  [key: string]: string | number;
}
```

---

## 9. Interfaces vs type aliases (a preview)

Type aliases are file 4. Here is the short comparison so you can decide while
writing:

| | `interface` | `type` alias |
| --- | --- | --- |
| Object shapes | ✅ | ✅ |
| Unions (`A \| B`) | ❌ | ✅ |
| Primitives/tuples/arrays | ❌ | ✅ |
| `extends` / `implements` | ✅ | ✅ (intersection instead) |
| Declaration merging | ✅ (same-name interfaces merge) | ❌ |
| Error messages | Usually simpler names | Can be verbose for complex types |
| React docs style | mostly `interface` for props | `type` for unions/utility results |

**Practical rule used by most React teams:**

```text
Object/props shapes          → interface
Unions, tuples, primitives,
mapped/conditional types     → type
When unsure, either works    → be consistent
```

---

## 10. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Using `?` and then reading the value unguarded | `'x' is possibly 'undefined'` (TS18048) | default it, `??`, or check before use |
| Expecting `?` to allow `null` | Passing `null` errors | use `T \| null` when `null` is meaningful |
| Redeclaring `className` as required when extending element props | TS2430: incorrectly extends | destructure it with a default instead |
| Extending the wrong element's props | Form props missing or wrongly typed | extend the element you render |
| Method-syntax callbacks | Unsound assignments slip through | property syntax `onChange: (v: string) => void` |
| Assuming `readonly` freezes deeply | Nested objects still mutate | protect each level you care about |
| `readonly` expected at runtime | Nothing is actually frozen | `Object.freeze` if you need runtime immutability |
| Defining props interfaces that mirror data models | Duplication drift | reuse the model type: `user: User` |
| `interface Props { props: ... }` | Confusing double nesting | props **are** the top-level object |
| Interfaces for unions | "An interface cannot extend a union" / confusing errors | use a `type` alias for unions |
| Merging interfaces accidentally | Two same-named interfaces silently combine | avoid duplicate names outside declaration merging use cases |
| Typing `children` as `string` | JSX children error | `React.ReactNode` (file 11) |
| `prop?: T` while passing computed `T \| undefined` values | TS2375 under `exactOptionalPropertyTypes` | declare `prop?: T \| undefined`, or leave the flag off |
| A `.ts` file with no `import`/`export` | `TS2393: Duplicate function implementation` across files | add `export {}` to make it a module |

---

## 11. Practice exercises

### Beginner

Given this component, answer the questions, then rewrite it with a proper props
interface:

```tsx
function Badge(props) {
  return (
    <span className={props.color}>
      {props.label}
      {props.count && ` (${props.count})`}
    </span>
  );
}
```

1. What is the type of `props` under `strict` mode, and what error appears?
2. Add an interface so that `label` is required, `color` is optional with three
   allowed values, and `count` is optional.
3. What exactly does `{props.count && ...}` render when `count` is `0`? (Be
   precise — the answer surprises people.)
4. Write three valid usages and two invalid ones (with the expected error code).

**Solution**

**1. The error:** with `noImplicitAny` (part of `strict`), an untyped parameter is
an error:

```text
TS7006: Parameter 'props' implicitly has an 'any' type.
```

The fix is an annotation. (In a `.tsx` file, React also cannot infer props — there
is nothing to infer from.)

**2 & 3. The typed version:**

```tsx
interface BadgeProps {
  label: string;
  color?: 'gray' | 'green' | 'red';
  count?: number;
}

function Badge({ label, color = 'gray', count }: BadgeProps) {
  return (
    <span className={`badge badge--${color}`}>
      {label}
      {/* Only show the count when it is a positive number. */}
      {count !== undefined && count > 0 ? ` (${count})` : null}
    </span>
  );
}
```

**3. The precise answer: `{count && ...}` renders a literal `0`.**

For `count = 0`, the expression `0 && ' (0)'` evaluates to `0` — `&&` returns the
first falsy operand. React renders the number `0` as text, so the badge reads
`New0` instead of `New`. The `&&` idiom only "renders nothing" when the left side
is `null` or `undefined`; `0` and ` '' ` are falsy **and** renderable. (Part 1,
file 3, section 7 has the full falsy list — this is the single most common React
rendering bug.)

The fix is to make the condition a genuine boolean, so the result is either the
string or `null`:

```tsx
{count > 0 ? ` (${count})` : null}
```

or, if you would rather keep the short-circuit style, add an explicit boolean:

```tsx
{count !== undefined && count > 0 && ` (${count})`}
//                          ↑ this makes the left side false, not 0
```

Note that with the fixed version a `count` of `0` renders **nothing after the
label** — which is the sensible product behaviour for a badge. If you *did* want
to show `(0)`, use `count !== undefined ? ` (${count})` : null`.

**4. Valid usages:**

```tsx
<Badge label="New" />
<Badge label="Active" color="green" count={3} />
<Badge label="Archived" color="red" count={0} />   {/* shows "Archived" — no count */}
```

**Invalid usages:**

```tsx
// <Badge />
//    TS2741: Property 'label' is missing in type '{}' but required in type 'BadgeProps'

// <Badge label="New" color="blue" />
//    TS2322: Type '"blue"' is not assignable to type '"gray" | "green" | "red"'
```

**The lesson:** the union `'gray' | 'green' | 'red'` is the whole point. A typo in
a colour is now a compile error instead of a silently unstyled badge.

### Intermediate

Build a small **typed component library** of three components, each demonstrating
a different interface technique. This is the shape of a real `ui/` folder.

```text
src/components/
├── Button.tsx      ← a variant component with optional props and defaults
├── TextField.tsx   ← extends native input props, has an error state
└── Alert.tsx       ← extends a div, supports children, dismissible
```

Requirements:

1. **`Button`** — `variant: 'primary' | 'secondary' | 'danger'` (optional, default
   `'primary'`), `size: 'sm' | 'md' | 'lg'` (optional, default `'md'`),
   `isLoading?: boolean`, plus an optional `onClick`. Native button props should
   work. While loading, the button must be disabled and show a spinner.
2. **`TextField`** — extends `React.ComponentPropsWithoutRef<'input'>`, adds
   `label: string` (required), `error?: string`, `hint?: string`. It must:
   - derive the input `id` from the `name` prop when `id` is not given;
   - link the label to the input;
   - set `aria-invalid` and `aria-describedby` when there is an error;
   - render the error with `role="alert"`.
3. **`Alert`** — extends `React.HTMLAttributes<HTMLDivElement>`, has
   `tone: 'info' | 'success' | 'warning' | 'error'`, `title?: string`,
   `onDismiss?: () => void`, and `children` (typed via `React.PropsWithChildren`).
   When `onDismiss` is provided, render a dismiss button with an accessible label.
4. Write a `Demo.tsx` that renders every component in all interesting states and
   is fully typed.
5. Note in comments, for each component, which props are required, optional and
   inherited.

**Solution**

```text
src/components/Button.tsx
```

```tsx
interface ButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  /** Visual style. Defaults to 'primary'. */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Size. Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg';
  /** Shows a spinner and disables the button. */
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      // `type="button"` first, so a caller can still override it with type="submit"
      type="button"
      {...buttonProps}
      // effectiveDisabled combines the caller's `disabled` with our loading state
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`btn btn--${variant} btn--${size} ${className}`.trim()}
    >
      {isLoading && <span className="btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* Props summary
   required :  none (children is optional for an icon-only button — but you would
               normally make it required in an app-specific button)
   optional :  variant, size, isLoading
   inherited:  every native <button> prop: onClick, disabled, type, name, title,
               aria-*, data-*, form, autoFocus, … (minus `ref`)
*/
```

```text
src/components/TextField.tsx
```

```tsx
interface TextFieldProps extends React.ComponentPropsWithoutRef<'input'> {
  /** Visible label. Required — an unlabelled input is an accessibility bug. */
  label: string;
  /**
   * Validation message. Its presence switches the field into the error style.
   *
   * Note the explicit `| undefined`. See the box below: with
   * `exactOptionalPropertyTypes`, `error?: string` would REJECT the very common
   * `<TextField error={maybeUndefined} />` usage.
   */
  error?: string | undefined;
  /** Helper text shown when there is no error. */
  hint?: string | undefined;
}

export function TextField({ label, error, hint, id, className = '', ...inputProps }: TextFieldProps) {
  // Prefer an explicit id; fall back to `name`; last resort, generate from label.
  const inputId = id ?? inputProps.name ?? label.toLowerCase().replace(/\s+/g, '-');
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  // Screen readers should hear the error, and the hint only if it is shown.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>

      <input
        id={inputId}
        {...inputProps}
        className={`field__input ${error ? 'field__input--error' : ''} ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />

      {hint && !error && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}

      {error && (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* Props summary
   required :  label
   optional :  error, hint
   inherited:  everything from <input>: type, name, value, onChange, placeholder,
               required, disabled, autoComplete, inputMode, min, max, step, …
*/
```

```text
src/components/Alert.tsx
```

```tsx
interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, React.PropsWithChildren {
  /** Semantic tone — drives both colour and the ARIA role below. */
  tone: 'info' | 'success' | 'warning' | 'error';
  /** Optional heading. */
  title?: string;
  /** When provided, a dismiss button is rendered. */
  onDismiss?: () => void;
}

export function Alert({
  tone,
  title,
  onDismiss,
  children,
  className = '',
  ...divProps
}: AlertProps) {
  // Errors and warnings are announced assertively; info/success politely.
  const role = tone === 'error' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div role={role} className={`alert alert--${tone} ${className}`.trim()} {...divProps}>
      {title && <strong className="alert__title">{title}</strong>}
      <div className="alert__body">{children}</div>

      {onDismiss && (
        <button type="button" className="alert__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

/* Props summary
   required :  tone
   optional :  title, onDismiss, children
   inherited:  every HTML attribute of <div>: onClick, style, id, aria-*,
               data-*, role (overridden here), hidden, …
*/
```

```text
src/components/Demo.tsx
```

```tsx
import { useState } from 'react';
import { Button } from './Button';
import { TextField } from './TextField';
import { Alert } from './Alert';

export function Demo() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const emailError =
    email.length > 0 && !email.includes('@') ? 'Enter a valid email address' : undefined;

  function handleSubmit() {
    setSubmitting(true);
    // Simulate a request; a real app would await an API call (Part 7)
    setTimeout(() => setSubmitting(false), 1200);
  }

  return (
    <main className="stack">
      {/* ---- Buttons: every variant, size and state ---- */}
      <section>
        <h2>Buttons</h2>
        <div className="row">
          <Button>Primary (default)</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger" size="sm">Delete</Button>
          <Button size="lg" onClick={handleSubmit} isLoading={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
          <Button disabled>Disabled</Button>
          {/* native props still work, and override ours */}
          <Button type="submit" form="my-form" title="Submits the form" data-testid="submit">
            Submit a form
          </Button>
        </div>
      </section>

      {/* ---- Text fields: happy path, hint, error, disabled ---- */}
      <section>
        <h2>Text fields</h2>
        <TextField
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
          hint="We will never share your email"
          autoComplete="email"
          required
        />
        <TextField label="Password" name="password" type="password" minLength={8} />
        <TextField label="Referral code" name="referral" disabled value="LOCKED" readOnly />
      </section>

      {/* ---- Alerts ---- */}
      <section>
        <h2>Alerts</h2>
        {!dismissed && (
          <Alert
            tone="warning"
            title="Your session expires soon"
            onDismiss={() => setDismissed(true)}
            data-testid="session-warning"
          >
            Save your work to avoid losing changes.
          </Alert>
        )}
        <Alert tone="success" title="Saved">Your changes are live.</Alert>
        <Alert tone="error">Payment failed. Try another card.</Alert>
        <Alert tone="info">Tip: press ⌘K to open the command palette.</Alert>
      </section>
    </main>
  );
}
```

#### ⚠️ An error you will hit (and why it is there)

When I type-checked this exact component library against React 19's types with
`exactOptionalPropertyTypes: true`, the `Demo.tsx` call site failed:

```text
src/components/Demo.tsx(38,10): error TS2375: Type '{ …; error: string | undefined; … }'
is not assignable to type 'TextFieldProps' with 'exactOptionalPropertyTypes: true'.
  Types of property 'error' are incompatible.
    Type 'string | undefined' is not assignable to type 'string'.
```

The cause is one line in `Demo.tsx`:

```tsx
const emailError = email.length > 0 && !email.includes('@')
  ? 'Enter a valid email address'
  : undefined;                     // ← the type is `string | undefined`

<TextField error={emailError} />   // ← JSX passes { error: string | undefined }
```

`error?: string` means "**either the key is absent, or it is a string**". It does
*not* mean "the key may be present with the value `undefined`". With
`exactOptionalPropertyTypes` on, those are different types — and passing a
computed `string | undefined` value hits the difference.

**You have two honest options**, and you should choose deliberately:

```tsx
// Option A (used above): allow explicitly-undefined values
interface TextFieldProps {
  error?: string | undefined;   // "absent, or a string, or explicitly undefined"
}
```

```jsonc
// Option B: turn the flag off in tsconfig.json
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": false   // ← React code often does this
  }
}
```

```tsx
// Option C: keep the strict flag AND the strict interface, and pass conditionally
<TextField {...(emailError !== undefined ? { error: emailError } : {})} />
// ❌ do not do this — it is unreadable, and readers of your code will hate it
```

> 🏭 **What real teams do:** most React projects leave
> `exactOptionalPropertyTypes` **off**, because components constantly receive
> computed `T | undefined` values (`error={errors.email}`,
> `icon={user?.avatar}`). If you turn it on — and it does catch real bugs — then
> write optional props as `prop?: T | undefined` for anything you might pass a
> computed value to. Being explicit about which convention your codebase uses is
> worth more than the flag itself.
>
> Note this also explains a subtlety in `React.ComponentPropsWithoutRef<'input'>`:
> the library's own optional props are declared in the way that keeps them
> usable, which is why the inherited props never caused this error — only your
> hand-written `error` and `hint` did.

**Also worth knowing: a `.ts` file with no `import`/`export` is a global script.**
While verifying this chapter, two of my scratch files both defined a top-level
`main()` and the compiler complained:

```text
src/shop.ts(57,10):    error TS2393: Duplicate function implementation.
src/type-zoo.ts(50,16): error TS2393: Duplicate function implementation.
```

A TypeScript file becomes a **module** only when it contains an `import` or an
`export` statement. Without either, its top-level declarations live in the
**global scope**, shared with every other script file — so two files with the same
function name collide, even though they are separate files. Adding a single
`export {}` fixes it:

```ts
export {};                    // ← marks the file as a module; nothing is exported
function main() { /* ... */ }
```

In React work you will almost always have imports, so this rarely bites — but it
is exactly why small `.ts` utility files sometimes behave surprisingly, and it is
the same mechanism that makes `import`/`export` meaningful in the first place
(Part 1, file 9).

**Run it**

```bash
npm run dev
```

**Expected result:** a page with three sections — buttons in every variant, size
and state (including a spinner while "Saving…"); text fields where the email field
shows a hint until you type something invalid, at which point the border turns red
and an error message appears with `role="alert"`; and four alerts, the warning one
dismissible.

**What to check in the browser's accessibility tree** (Elements → Accessibility
panel): the error text is announced as an alert, `aria-describedby` points at the
right element, and the dismiss button is announced as "Dismiss, button".

---

## 12. Summary

- An **interface** names an object's shape and is **erased at runtime**.
- React props are **one object**, conventionally typed as `<Component>Props`.
- `?` makes a property **optional** and adds `undefined` to its read type — handle
  it with a default, `??`, or a conditional.
- `?` (absent allowed) differs from `| undefined` (present but empty); with
  `exactOptionalPropertyTypes`, the compiler enforces the difference.
- **`readonly` is shallow and compile-time only.** Use it on props to signal "I
  will not mutate this".
- **`extends`** composes interfaces, and a subtype may only be **more specific**
  than its base.
- Extend **native element props** with `React.ComponentPropsWithoutRef<'button'>`
  (and friends) so your component behaves like the real element.
- Use **property syntax** for callback props: `onChange: (v: string) => void`.
- Index signatures type dynamic keys; known keys must be compatible with the index
  type.
- Interfaces for **object shapes**; `type` aliases for **unions, tuples and
  utility types** (file 4).

**What's next →** [`04-type-aliases.md`](./04-type-aliases.md): when an interface is
the wrong tool — unions, tuples, function types, and how to choose between the two
without agonising over it.
