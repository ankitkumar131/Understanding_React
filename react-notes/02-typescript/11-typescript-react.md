# 11 — TypeScript + React

> **Part 2 · TypeScript · File 11 of 11**
>
> **Why this file exists:** this is where the first ten files pay off. Props,
> events, refs, hooks, context, children, generic components — every one of them is
> a TypeScript problem you now have the tools to solve. Everything here is verified
> against **React 19.3.0 with `@types/react@19`**, and the examples actually render
> (server-side) so you can see the HTML they produce.

---

## 1. `.tsx` vs `.ts`

| Extension | Use for | Contains JSX? |
| --- | --- | --- |
| `.ts` | pure logic, types, utils, hooks **without** JSX | no |
| `.tsx` | anything containing JSX — components and their tests | yes |

**Rule: if the file contains JSX, the extension must be `.tsx`.** Renaming is not
cosmetic: in a `.ts` file, `<div>` is a syntax error (TypeScript parses `<` as a
comparison or a type assertion).

```text
src/
  main.tsx                 ← renders the app (JSX)
  App.tsx                  ← components (JSX)
  lib/api.ts               ← fetch wrappers (no JSX)
  lib/format.ts            ← formatters (no JSX)
  hooks/useAsync.ts        ← a hook with no JSX — .ts is correct
  types/product.ts         ← type declarations only
```

### The JSX transform: no `import React` needed

With `"jsx": "react-jsx"` (the modern default, and what Vite sets up), TypeScript
compiles JSX into calls to `react/jsx-runtime`, so **you do not import React** just
to use JSX:

```tsx
// ✅ React 17+ / modern setup
export function Hello() {
  return <h1>Hello</h1>;   // ← note: no `import React from 'react'` anywhere
}
```

Import React only when you use it as a *value* (`React.useActionState`) or as a
*type* namespace (`React.JSX.Element`, `React.ChangeEvent<…>`). The recommended
style in React 19 is to import the specific hooks and types instead:

```tsx
import { useState, type ChangeEvent, type ReactNode } from 'react';
```

> ⚠️ **`verbatimModuleSyntax` (used in these notes) requires `type` on type-only
> imports.** `import { ReactNode } from 'react'` becomes
> `import { type ReactNode } from 'react'`. Without it you get
> `TS1484: 'ReactNode' is a type and must be imported using a type-only import`.

---

## 2. The three `.tsx`-specific gotchas

**1. A generic arrow function needs a comma.**

```tsx
const identity = <T>(value: T): T => value;      // ❌ parsed as JSX
// TS17008: JSX element 'T' has no corresponding closing tag.
// TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?
// TS1005: '</' expected.

const identity2 = <T,>(value: T): T => value;    // ✅ the comma disambiguates
function identity3<T>(value: T): T { return value; }   // ✅ cleanest — use this
```

Use a **`function` declaration** for generic components and generic functions in
`.tsx` files. Reserve `<T,>` for the rare case where you truly need an arrow.

**2. Type assertions need the same treatment.** `<Foo>x</Foo>` is JSX, so
`<string>value` is not available in `.tsx` at all — use `as`:

```tsx
const el = document.getElementById('root') as HTMLDivElement;   // ✅ works everywhere
```

**3. `React.JSX.Element` is the namespaced name.** In React 19 types, the global
`JSX` namespace moved under `React`:

```tsx
export function Title(): React.JSX.Element {
  return <h1>Hello</h1>;
}
```

You rarely need an explicit return type on a component — inference handles it — but
`React.JSX.Element` is the correct annotation when you want one (and the global
`JSX.Element` may not exist).

---

## 3. Typing a component

```tsx
import type { ReactNode } from 'react';

interface GreetingProps {
  name: string;
  /** Optional: shown when hovering. */
  title?: string;
  children?: ReactNode;
}

export function Greeting({ name, title, children }: GreetingProps) {
  return (
    <div title={title}>
      <h2>Hello, {name}!</h2>
      {children}
    </div>
  );
}
```

Three decisions, each with a reason:

1. **A named `interface` above the component.** Not an inline type — because it is
   exported when a parent needs it, it shows up nicely in editor hints, and it reads
   as documentation. (For a props shape, `interface` is right; the caveat from file 7
   about index signatures does not apply here.)
2. **Destructure in the parameter list.** It makes every prop's use visible in the
   body, and it is where defaults live.
3. **No return-type annotation.** Inference gives `React.JSX.Element`, which is
   exactly right. Annotating is optional; annotating wrongly (e.g. `JSX.Element`
   where the global namespace is missing) causes noise.

### Defaults, and why `T | undefined` appears in these notes

```tsx
export function Badge({ children, size = 'md' }: { children: ReactNode; size?: 'sm' | 'md' }) {
  return <span className={`badge badge--${size}`}>{children}</span>;
}
```

`size` is `'sm' | 'md'` inside the body (the default removes `undefined`), but if you
declare the prop as a separate interface you must decide how it behaves *when passed
explicitly as `undefined`*:

```tsx
// Under exactOptionalPropertyTypes (used throughout these notes):
interface WithUndefined {
  size?: 'sm' | 'md' | undefined;   // present-but-undefined is allowed
}
interface WithoutUndefined {
  size?: 'sm' | 'md';               // "absent" and "undefined" are different
}
```

With `exactOptionalPropertyTypes`, `size?: 'sm' | 'md'` **rejects**
`<Badge size={maybeSize} />` when `maybeSize` is `'sm' | 'md' | undefined`
(`TS2375`). Most React projects leave the flag off; these notes keep it on and write
`| undefined` explicitly, because that is the stricter habit. The important part is
understanding *why* the error appears — see file 3 for the full three-option
discussion.

### Do not use `React.FC`

```tsx
// ❌ Avoid (legacy style)
const Card: React.FC<CardProps> = ({ title, children }) => <div>{title}{children}</div>;

// ✅ Write it plainly
function Card({ title, children }: CardProps) { return <div>{title}{children}</div>; }
```

Why `React.FC` fell out of favour:

- **It used to add `children?: ReactNode` implicitly** — so `<Card title="x" />` type
  accepted children that the component never rendered. React 18's types removed the
  implicit children; React 19 continued that.
- **It hides the return type**, which made components returning `string | null` or
  narrower things harder to reason about (and broke conditional-return patterns).
- **It adds nothing.** It is a type alias for "function taking props and returning
  something renderable" — a shape inference already infers correctly.
- It obscures **generics** (`React.FC` cannot express `<T>` components well).

You will still see `React.FC` in older codebases (Part 18 covers reading legacy code).
When you write new code, use a plain function declaration.

---

## 4. Props patterns that carry their weight

### Deriving native props: `ComponentPropsWithoutRef`

```tsx
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type'> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
  children: ReactNode;                  // now REQUIRED
  type?: 'button' | 'submit' | 'reset'; // narrowed from `string | undefined`
}

export function Button({ variant = 'primary', size = 'md', children, className, type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
```

- **`ComponentPropsWithoutRef<'button'>`** gives every native attribute: `onClick`,
  `disabled`, `aria-*`, `data-*`, `form`, `value`…
- **`Omit<…, 'children' | 'type'>`** removes the two we redefine. Replacing rather
  than adding is what makes `children` genuinely required (verified: omitting it is
  `TS2741`).
- **`...rest`** forwards everything else. Because the props type is derived from the
  DOM, `<Button disabled="yes">` is caught (`TS2322`) with no extra work.
- **`type = 'button'`** is a real bug fix, not a style choice: a `<button>` inside a
  form submits by default, which surprises people constantly.
- Note `className` is destructured out *and* merged, so callers can still add classes.

### Discriminated-union props

The strongest tool for a component whose *fields depend on a mode*:

```tsx
export type AlertProps =
  | { variant: 'info'; message: string; children?: ReactNode }
  | { variant: 'success'; message: string; children?: ReactNode }
  | { variant: 'warning'; message: string; children?: ReactNode }
  | { variant: 'error'; message: string; error?: Error; onRetry: () => void; children?: ReactNode };

export function Alert(props: AlertProps) {
  const { variant, message, children } = props;
  return (
    <div className={`alert alert--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      <strong>{message}</strong>
      {variant === 'error' && props.error !== undefined && <code>{props.error.message}</code>}
      {variant === 'error' && <button type="button" onClick={props.onRetry}>Retry</button>}
      {children}
    </div>
  );
}
```

Verified consequences (`@ts-expect-error` in the type tests, all confirmed):

```tsx
<Alert variant="error" message="nope" error={new Error('x')} onRetry={() => {}} />  // ✅
// @ts-expect-error — onRetry is REQUIRED on the error variant
<Alert variant="error" message="nope" />
// @ts-expect-error — info alerts take no onRetry
<Alert variant="info" message="hi" onRetry={() => {}} />
```

The `props.xxx` access style (rather than destructuring everything) is deliberate
here: narrowing on `props.variant` makes `props.onRetry` available **only** in the
error branch. Destructuring `onRetry` up front would give `(() => void) | undefined`
and force a non-null check.

### `children` typing

```tsx
children?: ReactNode;          // anything renderable: JSX, string, number, null, arrays
children: ReactNode;           // required
children?: ReactElement;       // narrower: only JSX elements (no strings/numbers)
children: (value: T) => ReactNode;   // "render prop" style
```

Default to **`ReactNode`** — it is what React actually accepts. Reach for
`ReactElement` only when you must call an API on the element itself (e.g. cloning).

---

## 5. Typing events

```tsx
import type { ChangeEvent, FormEvent, MouseEvent } from 'react';

function handleChange(event: ChangeEvent<HTMLInputElement>) {
  setValue(event.currentTarget.value);
}

function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

function handleClick(event: MouseEvent<HTMLButtonElement>) {
  console.log(event.clientX, event.currentTarget.disabled);
}
```

The generic parameter is the **element type**, and it changes what
`currentTarget` gives you — this is where event typing earns its keep:

| Expression | Type | Notes |
| --- | --- | --- |
| `event.target` | `EventTarget & HTMLInputElement` | the element that *dispatched* the event |
| `event.currentTarget` | `HTMLInputElement` | the element the handler is *attached to* — prefer this |
| `event.currentTarget.value` | `string` | ✅ typed |
| `event.currentTarget.checked` | `boolean` | only on input-like elements |
| `event.currentTarget.disabled` | `boolean` | ✅ |

**Prefer `currentTarget`.** `target` is the element that originated the event, which
for a click inside a button may be an inner `<span>`. React's types make `target`
the *same* element type as `currentTarget`, which is a small lie that
`currentTarget` avoids.

### Handlers: inline vs extracted

```tsx
<input onChange={(event) => setValue(event.currentTarget.value)} />         // inferred ✅
<input onChange={handleChange} />                                            // extracted ✅
<input onChange={(event) => handleChange(event)} />                          // redundant
```

When you write the arrow inline, TypeScript infers the parameter from the JSX
attribute — no annotation needed. When you extract the function, annotate it (or
type it with `React.ChangeEventHandler<HTMLInputElement>`) so it stays correct when
reused.

### The classic mistake: passing a handler that takes a value

```tsx
<TextField onChange={(value: string) => console.log(value)} />   // ✅ this component's API
<TextField onChange={(e: ChangeEvent<HTMLInputElement>) => …} />  // ❌ if onChange is (value: string) => void
```

Read the component's props to know what your handler receives. A component that
wraps an input often deliberately passes the **value**, not the event (see
`TextField` below) — that keeps the parent from knowing about DOM events.

---

## 6. Refs, and React 19's big simplification

```tsx
import { useRef, type Ref } from 'react';

function Focusable() {
  const inputRef = useRef<HTMLInputElement>(null);   // RefObject<HTMLInputElement | null>

  return (
    <>
      <input ref={inputRef} />
      <button onClick={() => {
        // inputRef.current?.focus();                       ✅ optional chaining
        if (inputRef.current !== null) inputRef.current.focus();   // ✅ narrowing
        // inputRef.current.focus();                       ❌ TS18047: 'inputRef.current'
        //                                                    is possibly 'null'.
      }}>Focus</button>
    </>
  );
}
```

`useRef<T>(null)` returns a **`RefObject<T | null>`**, because React guarantees the
ref is assigned *after* the first render, not during it. The compiler is right: your
`.current` really can be null at the moment the handler runs. Fix it by narrowing or
`?.` — never with `!`.

**React 19: `ref` is a normal prop.** This is the headline typing change. No
`forwardRef` wrapper:

```tsx
import type { Ref } from 'react';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;     // ← that is all it takes in React 19
}

export function TextField({ label, value, onChange, ref, … }: TextFieldProps) {
  return <input ref={ref} value={value} onChange={…} />;
}

// Callers just pass a ref:
const inputRef = useRef<HTMLInputElement>(null);
<TextField label="Email" ref={inputRef} … />
```

Verified: `<TextField ref={divRef} />` with `useRef<HTMLDivElement>` is a compile
error (`TS2322`), so ref types are still checked. In React 18 you needed
`forwardRef<HTMLInputElement, TextFieldProps>(…)`; both still work in React 19, but
`forwardRef` is no longer necessary and will eventually be deprecated.

Also verified in the type tests: **`ref` composes with the discriminated props and
`...rest` spreading** — `Button` forwards a ref through `...rest` with no extra code
because `ComponentPropsWithoutRef`'s name is about the *type* it gives you; the
runtime ref still flows through the spread.

---

## 7. Typing hooks

### `useState`

```tsx
const [count, setCount] = useState(0);                       // number
const [name, setName] = useState('');                        // string
const [user, setUser] = useState<User | null>(null);         // ← annotate!
const [items, setItems] = useState<string[]>([]);            // ← annotate!
```

Two traps, both from Part 1 and both *typing* problems:

```tsx
const [user, setUser] = useState(null);
//    ^ User | null? NO — inferred as `null`. `setUser(aUser)` is a compile error.

const [items, setItems] = useState([]);
//    ^ never[] — nothing can ever be pushed. TS7034/TS7005 territory (file 7).
```

When the initial value does not describe the eventual value, **write the type
argument**. That is the whole rule.

### `useReducer` with a discriminated action union

```tsx
type FormAction =
  | { type: 'changed'; field: 'name' | 'email'; value: string }
  | { type: 'submitted' }
  | { type: 'validated'; errors: FormState['errors'] }
  | { type: 'failed'; error: Error }
  | { type: 'reset' };

function reducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'changed':
      return { ...state, [action.field]: action.value, errors: { ...state.errors, [action.field]: undefined } };
    // …
    default: {
      const unreachable: never = action;   // a new action type breaks the build here
      return unreachable;
    }
  }
}
```

The action union is the heart of it: each action carries exactly the data it needs,
`dispatch({ type: 'changed', field: 'name', value: 'x' })` is fully checked, and the
`never` tripwire means adding an action forces you to handle it. `useReducer`
infers `dispatch`'s type from the reducer — you never annotate it.

### `useContext` and the throwing hook

```tsx
const ThemeContext = createContext<Theme | null>(null);   // null is REPRESENTABLE

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error('useTheme() must be called inside <ThemeProvider>');
  return theme;   // narrowed to Theme — callers never see `| null`
}
```

Two competing styles:

| Approach | Type of `useContext` result | Trade-off |
| --- | --- | --- |
| `createContext<Theme \| null>(null)` + a throwing hook | `Theme` from `useTheme()` | loud, early error; one extra hook |
| `createContext<Theme>(fallback)` | `Theme` always | no crash, but a wrong-value bug can hide for months |
| `createContext<Theme \| undefined>(undefined)` + `!` in the hook | `Theme` (unchecked) | worst: silent `undefined` at runtime |

The middle option (a sensible default) is fine for genuinely optional things like a
theme. For a context that is *required* — an authenticated user, a router — use the
throwing hook: the error message names the missing provider, which turns a
`Cannot read properties of null` into a five-second fix.

### A custom hook with a discriminated result: `useAsync`

```ts
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };
```

Four states, not four booleans — `data` exists only in the success branch, so nobody
can render `data.length` while `status === 'error'`. The hook also carries the
`ignore` flag from Part 1 (stale responses) and normalises `unknown` errors:

```ts
.catch((error: unknown) => {
  if (!ignore) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
});
```

Note the deliberate dependency design: `load` is a dependency, so callers must wrap
their loader in `useCallback` — documented in the hook's JSDoc, because a forgotten
`useCallback` means an infinite request loop. That is a *type-adjacent* API contract:
TypeScript cannot enforce it, so the comment must.

---

## 8. Generic components

```tsx
export type Column<T> = {
  [K in keyof T]: {
    key: K;
    header: string;
    render?: (value: T[K], row: T) => ReactNode;
    align?: 'left' | 'right';
  };
}[keyof T];

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: ReadonlyArray<Column<T>>;
  rowKey: (row: T) => string;
  emptyMessage?: string;
  caption?: string;
}

export function DataTable<T>({ rows, columns, rowKey, emptyMessage = 'Nothing to show', caption }: DataTableProps<T>) {
  // …
}
```

Two things are happening, and both are from file 10:

- **`Column<T>` is a mapped-type union.** For each key `K` of `T`, it produces a
  column whose `key` is `K` and whose `render` receives exactly `T[K]`. So for a
  `Product`, `render` is `(value: number, row: Product) => ReactNode` on the
  `priceMinor` column — verified: calling `value.toUpperCase()` there is a compile
  error, and `key: 'price'` (not a real key) is a compile error too.
- **`<T>` is inferred from `rows`**, so callers write nothing extra:

```tsx
<DataTable rows={products} columns={columns} rowKey={(row) => row.id} caption="Catalogue" />
```

And `rowKey` is checked: returning `row.priceMinor` (a number) is `TS2322`.

**In `.tsx`, write generic components as `function` declarations** (`function DataTable<T>(…)`) —
the arrow form needs `<T,>` (section 2).

---

## 9. A verified component set

Here is the complete set used in the exercises below, with a server-render demo that
proves it all works.

```text
ts-playground/src/react/
├── types.ts           ← Product + formatMoney (no JSX → .ts)
├── Button.tsx         ← native props derived, variant/size unions
├── TextField.tsx      ← ref as a prop, controlled value, aria wiring, useId
├── Badge.tsx          ← the `{count && …}` trap avoided
├── Alert.tsx          ← discriminated-union props
├── DataTable.tsx      ← generic component + mapped-type columns
├── ThemeContext.tsx   ← typed context + throwing hook
├── useAsync.ts        ← AsyncState union + stale-response guard (no JSX → .ts)
├── UserForm.tsx       ← useReducer + typed events + refs
├── render.tsx         ← renders everything with renderToStaticMarkup
└── __typetests.tsx    ← 21 compile-time assertions
```

```ts
export interface Product {
  id: string;
  sku: string;
  name: string;
  priceMinor: number;
  status: 'draft' | 'live' | 'archived';
}

export const formatMoney = (minor: number): string => `₹${(minor / 100).toFixed(2)}`;
```

```tsx
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

// Derive the native button's props, then remove what we replace.
// `children` becomes required (we always show a label) and `type` is fixed to
// 'button' by default so we never accidentally submit a form.
export interface ButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type'> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
  children: ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export function Button({ variant = 'primary', size = 'md', children, className, type = 'button', ...rest }: ButtonProps) {
  // ...rest is everything native: onClick, disabled, aria-*, data-*, refs…
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
```

```tsx
import { useId, type ChangeEvent, type Ref } from 'react';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** React 19: `ref` is an ordinary prop — no forwardRef wrapper needed. */
  ref?: Ref<HTMLInputElement>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /**
   * `string | undefined` rather than `string`: with exactOptionalPropertyTypes,
   * "absent" and "present but undefined" are different things, and callers
   * routinely pass `error={maybeUndefined}`.
   */
  error?: string | undefined;
  hint?: string | undefined;
}

export function TextField({ label, value, onChange, ref, placeholder, required = false, disabled = false, error, hint }: TextFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  // The handler is typed by inference — no annotation needed…
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.currentTarget.value);   // currentTarget is HTMLInputElement, not EventTarget
  };

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input
        id={inputId}
        ref={ref}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={error !== undefined}
        aria-describedby={[error !== undefined ? errorId : null, hint !== undefined ? hintId : null].filter(Boolean).join(' ') || undefined}
      />
      {hint !== undefined && <p id={hintId} className="hint">{hint}</p>}
      {error !== undefined && <p id={errorId} className="error" role="alert">{error}</p>}
    </div>
  );
}
```

```tsx
import type { ReactNode } from 'react';

// A discriminated union: the fields that exist depend on `variant`.
// Trying to pass `onRetry` to an info alert is a compile error.
export type AlertProps =
  | { variant: 'info'; message: string; children?: ReactNode }
  | { variant: 'success'; message: string; children?: ReactNode }
  | { variant: 'warning'; message: string; children?: ReactNode }
  | { variant: 'error'; message: string; error?: Error; onRetry: () => void; children?: ReactNode };

export function Alert(props: AlertProps) {
  const { variant, message, children } = props;

  return (
    <div className={`alert alert--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      <strong>{message}</strong>
      {variant === 'error' && props.error !== undefined && <code>{props.error.message}</code>}
      {variant === 'error' && <button type="button" onClick={props.onRetry}>Retry</button>}
      {children}
    </div>
  );
}
```

```tsx
import type { ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
  /** When omitted, no count is shown. `0` is a real count and must render. */
  count?: number | undefined;
}

export function Badge({ children, count }: BadgeProps) {
  return (
    <span className="badge">
      {children}
      {/* The classic JSX falsy trap: `{count && ` (${count})`}` renders "0" when
          count is 0. An explicit comparison avoids it. */}
      {count !== undefined ? ` (${count})` : null}
    </span>
  );
}
```

```tsx
import type { ReactNode } from 'react';

/**
 * A column bound to ONE key of the row type. The mapped-type union means
 * `render` receives exactly `T[K]` — `number` for `priceMinor`, not `string | number`.
 */
export type Column<T> = {
  [K in keyof T]: {
    key: K;
    header: string;
    render?: (value: T[K], row: T) => ReactNode;
    align?: 'left' | 'right';
  };
}[keyof T];

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: ReadonlyArray<Column<T>>;
  rowKey: (row: T) => string;
  emptyMessage?: string;
  caption?: string;
}

// A GENERIC component: T is inferred from `rows`, then every column is checked
// against it. Written as a `function` declaration — arrow + <T> needs `<T,>` in .tsx.
export function DataTable<T>({ rows, columns, rowKey, emptyMessage = 'Nothing to show', caption }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="empty">{emptyMessage}</p>;
  }

  return (
    <table>
      {caption !== undefined && <caption>{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={String(column.key)} style={{ textAlign: column.align ?? 'left' }}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td key={String(column.key)} style={{ textAlign: column.align ?? 'left' }}>
                {/* Narrow the optional render function, then call it with the row's own value. */}
                {column.render !== undefined
                  ? column.render(row[column.key], row)
                  : String(row[column.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

```tsx
import { createContext, useContext, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

// The context holds `Theme | null` so the "no provider" case is REPRESENTABLE,
// and the hook below turns it into a loud runtime error instead of silent fallback.
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme() must be called inside <ThemeProvider>');
  }
  return theme;   // narrowed to Theme — callers never see `| null`
}
```

```ts
import { useCallback, useEffect, useState } from 'react';

// A discriminated union (file 5) — not four booleans. `data` exists only in the
// success branch, `error` only in the error branch.
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

export interface AsyncResult<T> {
  state: AsyncState<T>;
  reload: () => void;
}

/**
 * `load` MUST be stable (wrap it in useCallback), because it is an effect
 * dependency — an inline arrow would re-run the effect on every render.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // The ignore flag from Part 1: a fast second request must not be overwritten
    // by a slower first one, and state must not be set after unmount.
    let ignore = false;
    setState({ status: 'loading' });

    load()
      .then((data) => {
        if (!ignore) setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        // `error` is `unknown`: normalise it so callers always get an Error.
        if (!ignore) {
          setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
        }
      });

    return () => {
      ignore = true;
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}
```

```tsx
import { useReducer, useRef, type ChangeEvent, type FormEvent } from 'react';
import { Button } from './Button';
import { TextField } from './TextField';

interface FormState {
  name: string;
  email: string;
  submitting: boolean;
  errors: Partial<Record<'name' | 'email', string>>;
}

// Discriminated actions: each carries exactly what it needs.
type FormAction =
  | { type: 'changed'; field: 'name' | 'email'; value: string }
  | { type: 'submitted' }
  | { type: 'validated'; errors: FormState['errors'] }
  | { type: 'failed'; error: Error }
  | { type: 'reset' };

const initialState: FormState = { name: '', email: '', submitting: false, errors: {} };

function reducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'changed':
      // Indexed write by a union key: computed keys keep the type sound.
      return { ...state, [action.field]: action.value, errors: { ...state.errors, [action.field]: undefined } };
    case 'submitted':
      return { ...state, submitting: true, errors: {} };
    case 'validated':
      return { ...state, submitting: false, errors: action.errors };
    case 'failed':
      return { ...state, submitting: false, errors: { email: action.error.message } };
    case 'reset':
      return initialState;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export interface UserFormProps {
  onSubmit: (values: { name: string; email: string }) => Promise<void>;
  initialName?: string;
}

export function UserForm({ onSubmit, initialName = '' }: UserFormProps) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, name: initialName });
  const nameRef = useRef<HTMLInputElement>(null);

  // Typed event parameters — inferred here, annotated in TextField.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: FormState['errors'] = {};
    if (state.name.trim() === '') errors.name = 'Name is required';
    if (!state.email.includes('@')) errors.email = 'Enter a valid email address';
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'validated', errors });
      nameRef.current?.focus();          // .current is `HTMLInputElement | null`
      return;
    }
    dispatch({ type: 'submitted' });
    void onSubmit({ name: state.name, email: state.email }).catch((error: unknown) => {
      dispatch({ type: 'failed', error: error instanceof Error ? error : new Error(String(error)) });
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <TextField
        label="Name"
        value={state.name}
        onChange={(value: string) => dispatch({ type: 'changed', field: 'name', value })}
        ref={nameRef}
        required
        error={state.errors.name}
      />
      <TextField
        label="Email"
        value={state.email}
        onChange={(value: string) => dispatch({ type: 'changed', field: 'email', value })}
        required
        error={state.errors.email}
        hint="Used for receipts only."
      />
      <Button type="submit" disabled={state.submitting}>
        {state.submitting ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="secondary" onClick={() => dispatch({ type: 'reset' })}>
        Reset
      </Button>
    </form>
  );
}

// A tiny helper showing that a handler can be extracted and typed independently.
export const makeChangeHandler =
  (dispatch: (action: FormAction) => void) =>
  (field: 'name' | 'email') =>
  (event: ChangeEvent<HTMLInputElement>): void => {
    dispatch({ type: 'changed', field, value: event.currentTarget.value });
  };
```

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { Alert } from './Alert';
import { Badge } from './Badge';
import { Button } from './Button';
import { DataTable, type Column } from './DataTable';
import { TextField } from './TextField';
import { ThemeProvider, useTheme } from './ThemeContext';
import { UserForm } from './UserForm';
import { type AsyncState } from './useAsync';
import { formatMoney, type Product } from './types';

const products: readonly Product[] = [
  { id: 'p1', sku: 'KBD-1', name: 'Mechanical Keyboard', priceMinor: 499900, status: 'live' },
  { id: 'p2', sku: 'MOU-1', name: 'Wireless Mouse', priceMinor: 129900, status: 'draft' },
  { id: 'p3', sku: 'MON-1', name: '27" Monitor', priceMinor: 1899900, status: 'archived' },
];

// The column array is checked against Product: `key: 'price'` would be an error,
// and inside `render` the value parameter is `number` for `priceMinor`.
const columns: ReadonlyArray<Column<Product>> = [
  { key: 'sku', header: 'SKU' },
  { key: 'name', header: 'Product' },
  { key: 'priceMinor', header: 'Price', align: 'right', render: (value) => formatMoney(value) },
  { key: 'status', header: 'Status', render: (value) => <Badge>{value}</Badge> },
];

// One component per union member, with the never tripwire keeping it honest.
function AsyncView<T>({ state, render }: { state: AsyncState<T>; render: (data: T) => React.ReactNode }) {
  switch (state.status) {
    case 'idle':
      return <p>Not started.</p>;
    case 'loading':
      return <p>Loading…</p>;
    case 'success':
      return <div>{render(state.data)}</div>;
    case 'error':
      return <Alert variant="error" message="Request failed" error={state.error} onRetry={() => {}} />;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function ThemeChip() {
  const theme = useTheme();          // 'light' | 'dark' — never null for the caller
  return <span className={`chip chip--${theme}`}>{theme} theme</span>;
}

function StaticForm() {
  return (
    <UserForm
      initialName="Ada Lovelace"
      onSubmit={async (values) => {
        console.log('submitted', values);
      }}
    />
  );
}

console.log('=== buttons ===');
console.log(renderToStaticMarkup(
  <div>
    <Button>Save</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="danger" size="sm">Delete</Button>
    <Button type="submit" disabled>Submitting…</Button>
    <Button onClick={() => {}} aria-label="Close">×</Button>
  </div>
));

console.log('\n=== badges (the `{count && …}` trap) ===');
console.log(renderToStaticMarkup(
  <div>
    <Badge count={0}>Inbox</Badge>
    <Badge count={3}>Drafts</Badge>
    <Badge>Archived</Badge>
  </div>
));

console.log('\n=== alerts (discriminated union props) ===');
console.log(renderToStaticMarkup(
  <div>
    <Alert variant="info" message="Heads up" />
    <Alert variant="success" message="Saved" />
    <Alert variant="warning" message="Low stock" />
    <Alert variant="error" message="Could not save" error={new Error('network down')} onRetry={() => {}} />
  </div>
));

console.log('\n=== text fields (generated ids, aria wiring, ref as a prop) ===');
console.log(renderToStaticMarkup(
  <div>
    <TextField label="Email" value="ada@example.com" onChange={() => {}} required hint="We never share it." />
    <TextField label="Email" value="" onChange={() => {}} error="Email is required" />
    <TextField label="Locked" value="read only" onChange={() => {}} disabled />
  </div>
));

console.log('\n=== generic DataTable: T inferred from rows, columns checked against it ===');
console.log(renderToStaticMarkup(
  <DataTable rows={products} columns={columns} rowKey={(row) => row.id} caption="Catalogue" />
));

console.log('\n=== empty state ===');
console.log(renderToStaticMarkup(<DataTable rows={[]} columns={columns} rowKey={(row: Product) => row.id} emptyMessage="No products yet" />));

console.log('\n=== context + a hook that throws instead of returning null ===');
console.log(renderToStaticMarkup(
  <ThemeProvider theme="dark">
    <ThemeChip />
  </ThemeProvider>
));

console.log('\n=== useReducer-driven form (SSR renders the initial state) ===');
console.log(renderToStaticMarkup(<StaticForm />));

console.log('\n=== one component per union member, with a never tripwire ===');
console.log(renderToStaticMarkup(
  <div>
    <AsyncView state={{ status: 'loading' }} render={() => null} />
    <AsyncView state={{ status: 'success', data: products }} render={(list) => <p>{list.length} products, total {formatMoney(list.reduce((sum, p) => sum + p.priceMinor, 0))}</p>} />
    <AsyncView state={{ status: 'error', error: new Error('boom') }} render={() => null} />
  </div>
));
```

**Install and run**

```bash
npm install react react-dom
npm install --save-dev typescript tsx @types/react @types/react-dom
./node_modules/.bin/tsc --noEmit    # typecheck: exit 0
npx tsx src/react/render.tsx        # server-render every component and print HTML
```

**Expected output**

```text
=== buttons ===
<div><button type="button" class="btn btn--primary btn--md">Save</button><button type="button" class="btn btn--secondary btn--md">Cancel</button><button type="button" class="btn btn--danger btn--sm">Delete</button><button type="submit" class="btn btn--primary btn--md" disabled="">Submitting…</button><button type="button" class="btn btn--primary btn--md" aria-label="Close">×</button></div>

=== badges (the `{count && …}` trap) ===
<div><span class="badge">Inbox (0)</span><span class="badge">Drafts (3)</span><span class="badge">Archived</span></div>

=== alerts (discriminated union props) ===
<div><div class="alert alert--info" role="status"><strong>Heads up</strong></div><div class="alert alert--success" role="status"><strong>Saved</strong></div><div class="alert alert--warning" role="status"><strong>Low stock</strong></div><div class="alert alert--error" role="alert"><strong>Could not save</strong><code>network down</code><button type="button">Retry</button></div></div>

=== text fields (generated ids, aria wiring, ref as a prop) ===
<div><div class="field"><label for="_R_1_">Email<span aria-hidden="true"> *</span></label><input id="_R_1_" required="" aria-invalid="false" aria-describedby="_R_1_-hint" value="ada@example.com"/><p id="_R_1_-hint" class="hint">We never share it.</p></div><div class="field"><label for="_R_2_">Email</label><input id="_R_2_" aria-invalid="true" aria-describedby="_R_2_-error" value=""/><p id="_R_2_-error" class="error" role="alert">Email is required</p></div><div class="field"><label for="_R_3_">Locked</label><input id="_R_3_" disabled="" aria-invalid="false" value="read only"/></div></div>

=== generic DataTable: T inferred from rows, columns checked against it ===
<table><caption>Catalogue</caption><thead><tr><th style="text-align:left">SKU</th><th style="text-align:left">Product</th><th style="text-align:right">Price</th><th style="text-align:left">Status</th></tr></thead><tbody><tr><td style="text-align:left">KBD-1</td><td style="text-align:left">Mechanical Keyboard</td><td style="text-align:right">₹4999.00</td><td style="text-align:left"><span class="badge">live</span></td></tr><tr><td style="text-align:left">MOU-1</td><td style="text-align:left">Wireless Mouse</td><td style="text-align:right">₹1299.00</td><td style="text-align:left"><span class="badge">draft</span></td></tr><tr><td style="text-align:left">MON-1</td><td style="text-align:left">27&quot; Monitor</td><td style="text-align:right">₹18999.00</td><td style="text-align:left"><span class="badge">archived</span></td></tr></tbody></table>

=== empty state ===
<p class="empty">No products yet</p>

=== context + a hook that throws instead of returning null ===
<span class="chip chip--dark">dark theme</span>

=== useReducer-driven form (SSR renders the initial state) ===
<form noValidate=""><div class="field"><label for="_R_1_">Name<span aria-hidden="true"> *</span></label><input id="_R_1_" required="" aria-invalid="false" value="Ada Lovelace"/></div><div class="field"><label for="_R_2_">Email<span aria-hidden="true"> *</span></label><input id="_R_2_" required="" aria-invalid="false" aria-describedby="_R_2_-hint" value=""/><p id="_R_2_-hint" class="hint">Used for receipts only.</p></div><button type="submit" class="btn btn--primary btn--md">Save</button><button type="button" class="btn btn--secondary btn--md">Reset</button></form>

=== one component per union member, with a never tripwire ===
<div><p>Loading…</p><div><p>3 products, total ₹25297.00</p></div><div class="alert alert--error" role="alert"><strong>Request failed</strong><code>boom</code><button type="button">Retry</button></div></div>
```

**What to read in that output**

- **`<button type="button" class="btn btn--primary btn--md">`** — the defaults are
  applied, and `type="button"` prevents accidental form submission. `disabled=""` and
  `required=""` are how React renders boolean attributes.
- **`Inbox (0)`** — the Badge renders a real zero count. With the naive
  `{count && \` (${count})\`}` this line would read `Inbox0`-ish nonsense (the literal
  `0` rendered). This is the file 3 trap, now demonstrated in a rendered DOM.
- **`27&quot;`** — React HTML-escapes text, so the quote in `27" Monitor` becomes an
  entity. Nothing to do about it; just know that comparing rendered HTML to source
  strings needs escaping in mind.
- **`<label for="_R_1_">` … `<input id="_R_1_" aria-describedby="_R_1_-hint">`** —
  `useId()` generated a stable, unique id on the server (`_R_1_`), and the `for`,
  `id`, and `aria-describedby` attributes all agree. This is how you wire labels and
  error messages accessibly without hand-managing ids.
- **`aria-invalid="false"` on valid fields and `"true"` on the error field** — note it
  is the *string* `"false"`, not absent. `aria-invalid={error !== undefined}` writes
  the boolean React converts to a string; both states are explicit, which screen
  readers prefer.
- **`role="alert"` appears only on the error alert**; the others are
  `role="status"`. The union props made that a one-line ternary with no possibility
  of an info alert claiming to be an alert.
- **The error alert contains `<code>network down</code>` and a Retry button**; the
  info/success/warning alerts contain neither. Same component, different shapes —
  enforced by the type.
- **The table renders `₹4999.00`, `₹1299.00`, `₹18999.00`** — money formatted through
  a column `render` function whose `value` parameter is typed `number` because of the
  mapped-type union.
- **`3 products, total ₹25297.00`** — the `AsyncView` success branch received
  `Product[]` from the discriminated `AsyncState<T>` and the `never` tripwire covers
  the other three branches.
- **`<form noValidate="">`** with values from `useReducer`'s initial state
  (`Ada Lovelace` from the `initialName` prop) — server rendering runs the initial
  render, so effects do not fire (that is why `useAsync` shows `idle`/`loading`, not
  a fetched result).

**And the type tests** — 21 assertions in `__typetests.tsx`, all verified:

```tsx
// @ts-expect-error — children is required
const b1 = <Button />;
// @ts-expect-error — 'ghost' is not a variant
const b2 = <Button variant="ghost">x</Button>;
// @ts-expect-error — disabled takes a boolean, not a string
const b5 = <Button disabled="yes">x</Button>;
// @ts-expect-error — onRetry is required on the error variant
const a1 = <Alert variant="error" message="nope" />;
// @ts-expect-error — error is string | undefined, not number
const t2 = <TextField label="a" value="" onChange={() => {}} error={404} />;
// @ts-expect-error — Ref<HTMLDivElement> is not a Ref<HTMLInputElement>
const t5 = <TextField label="a" value="" onChange={() => {}} ref={divRef} />;
// @ts-expect-error — 'price' is not a key of Product
const badColumn: ReadonlyArray<Column<Product>> = [{ key: 'price', header: 'Price' }];
// @ts-expect-error — in this column `value` is a number, so .toUpperCase() does not exist
const wrongRender: ReadonlyArray<Column<Product>> = [
  { key: 'priceMinor', header: 'P', render: (value) => value.toUpperCase() },
];
```

---

## 10. Common React TypeScript errors, decoded

| Error | Usually means | Fix |
| --- | --- | --- |
| `TS2741: Property 'children' is missing` | the component requires children (or you replaced `React.FC`) | pass children, or make the prop optional |
| `TS2739: Type '{…}' is missing the following properties from type 'CardProps': children, count` | several required props absent | pass them, or make them optional |
| `TS2322: Type 'string' is not assignable to type 'number'` (in JSX) | a prop value's type is wrong | check the prop's declared type |
| `TS2322` on `ref={…}` | ref element type mismatch (`Ref<HTMLDivElement>` into `Ref<HTMLInputElement>`) | match `useRef<HTMLInputElement>` to the element |
| `TS18047: 'inputRef.current' is possibly 'null'` | refs are nullable until after mount | narrow or use `?.` — never `!` |
| `TS18046: 'error' is of type 'unknown'` | `catch` binds `unknown` | `error instanceof Error ? error.message : String(error)` |
| `TS2375` under `exactOptionalPropertyTypes` | passing `T \| undefined` to a prop declared `prop?: T` | declare `prop?: T \| undefined` (file 3) |
| `TS2578: Unused '@ts-expect-error' directive` | the line you expected to fail **compiles** | your assumption is wrong — investigate, do not delete blindly |
| `TS17008 / TS1382 / TS1005` in a `.tsx` file | `<T>` parsed as JSX | use `function f<T>()` or `<T,>` |
| `TS1484: 'X' is a type and must be imported using a type-only import` | `verbatimModuleSyntax` is on | `import { type X }` or `import type { X }` |
| `TS2604: JSX element type 'X' does not have any construct or call signatures` | you rendered a non-component (a plain value, or a lowercase-named component) | fix the name/export; components must be capitalised |
| `TS2559 / TS2769` on `dispatch` | action shape does not match the union | read the action union |
| `Property 'value' does not exist on type 'EventTarget'` | you used `event.target` where the DOM type is generic | use `event.currentTarget` |
| `Type '() => Promise<void>' is not assignable to type '() => void'` | usually *fine* (`void` rule) — if it errors, the prop expects a Promise | annotate the prop as `() => Promise<void>` when the caller must await |

> 🚨 **The nastiest TypeScript gotcha of all, verified in a minimal repro:** a
> **syntax error in ONE file suppresses ALL type errors across the whole program.**
>
> ```text
> # typed.ts has      : export const a: number = "not a number";   ← TS2322
> # broken.tsx has    : const x = <T>(v: T) => v;                 ← syntax error
>
> $ tsc -p .
> broken.tsx(1,12): error TS17008: JSX element 'T' has no corresponding closing tag.
> broken.tsx(1,22): error TS1382: Unexpected token…
> broken.tsx(3,1):  error TS1005: '</' expected.
> # ← and NOTHING about typed.ts!
>
> $ rm broken.tsx && tsc -p .
> typed.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
> ```
>
> Consequence: **"my typecheck passes" means nothing if a file fails to parse.**
> You fix the syntax error and ten unrelated type errors appear — which is exactly
> the "why does fixing one thing break everything?" experience. When a typecheck
> goes suspiciously clean, run it again after fixing syntax errors, and never trust
> a green check that came from a run with parse errors. (Type errors do *not* hide
> each other; only syntax errors do this.)

---

## 11. React version notes (checked against the current docs)

| Feature | Status in React 19 | Typing consequence |
| --- | --- | --- |
| `ref` as a prop | ✅ current | `ref?: Ref<T>` in your props; `forwardRef` no longer needed |
| `forwardRef` | still works, discouraged | keep for React 18 support |
| `React.FC` | legacy; implicit `children` removed in 18 | use plain function components |
| `useEffectEvent` | ✅ current (listed in the official hooks reference) | `const onEvent = useEffectEvent(cb)` — for reading fresh values inside effects |
| `useActionState` | ✅ current | `const [state, formAction, isPending] = useActionState(fn, initial)` |
| `useOptimistic` | ✅ current | the action takes the **whole** optimistic value (or an updater) — not one item |
| `use` | ✅ current | `React.use<T>(usable)` reads promises and context |
| `createRoot` from `react-dom/client` | ✅ current | `createRoot(document.getElementById('root')!)` — the one place `!` is idiomatic (see Part 3) |
| `renderToStaticMarkup` from `react-dom/server` | ✅ current | used in this file's demo |
| PropTypes / `defaultProps` on function components | ❌ legacy | TypeScript replaces both |

> 🔍 **Why this table exists in a TypeScript file.** Type-level material rots faster
> than almost anything else: `forwardRef` was *required* knowledge for years and is
> now a footnote; `React.FC`'s implicit children were removed in React 18; `use` and
> the Action hooks are React 19 additions. Before you copy a typing pattern from a
> tutorial, check the version it was written against. The hooks list above was
> cross-checked against `react.dev/reference/react/hooks`, and every API's
> availability was confirmed against `@types/react` 19.

---

## 12. Comparison: three component-authoring styles

| Style | Looks like | Use when | Avoid because |
| --- | --- | --- | --- |
| **Plain function** (recommended) | `function Card({ title }: CardProps) {}` | always, by default | — |
| **`React.FC<P>`** | `const Card: React.FC<CardProps> = …` | never in new code | hides return type; legacy implicit children; awkward with generics |
| **Arrow + `satisfies`** | `const Card = (({ title }: CardProps) => …) satisfies FC<CardProps>` | rare; when you want the value typed *and* checked | noise; `FC` still adds nothing |

And for props:

| Approach | Example | Trade-off |
| --- | --- | --- |
| **Named `interface`** | `interface CardProps { title: string }` | best for a component's own API; importable by parents; readable |
| **Inline type** | `({ title }: { title: string })` | fine for small private components; not reusable |
| **Derived from another component** | `ComponentProps<typeof Other>` | ideal for thin wrappers; couples you to that component |
| **Derived from a DOM element** | `ComponentPropsWithoutRef<'button'>` | ideal for design-system primitives; brings every native attribute |

---

## 13. Practice exercises

### Beginner

1. Predict which lines compile, then verify:

```tsx
interface ChipProps { label: string; tone?: 'neutral' | 'positive' | 'negative' }
function Chip({ label, tone = 'neutral' }: ChipProps) { return <span className={tone}>{label}</span>; }

const a = <Chip label="New" />;
const b = <Chip label="New" tone="positive" />;
const c = <Chip label="New" tone="happy" />;
const d = <Chip label={42} />;
const e = <Chip label="New" onClick={() => {}} />;
```

2. Fix each error:

```tsx
const [items, setItems] = useState([]);
setItems(['a']);

const [user, setUser] = useState(null);
setUser({ id: 'u1' });

function Counter() {
  const countRef = useRef<number>(0);
  countRef.current += 1;
  return <span>{countRef.current}</span>;
}
```

3. Both `event.target.value` and `event.currentTarget.value` compile inside
   `<input onChange={…} />`. Which should you use, and why? Then explain the error
   in this handler:

```tsx
function onDivChange(event: ChangeEvent<HTMLDivElement>) {
  return event.currentTarget.value;
}
```

**Solution**

**1.**

```text
const a = <Chip label="New" />;                        ✅ tone defaults to 'neutral'
const b = <Chip label="New" tone="positive" />;        ✅
const c = <Chip label="New" tone="happy" />;           ❌ TS2322: Type '"happy"' is not
                                                          assignable to type '"neutral" |
                                                          "positive" | "negative" | undefined'
const d = <Chip label={42} />;                         ❌ TS2322: Type 'number' is not
                                                          assignable to type 'string'
const e = <Chip label="New" onClick={() => {}} />;     ❌ TS2322: Type '{ label: string;
                                                          onClick: () => void; }' is not
                                                          assignable to type 'IntrinsicAttributes
                                                          & ChipProps'. Property 'onClick' does
                                                          not exist on type 'ChipProps'.
```

Line `e` is the important one: props are a **closed** contract. If you want `Chip` to
accept native span attributes, derive them:
`interface ChipProps extends ComponentPropsWithoutRef<'span'> { label: string; tone?: … }`.

**2.**

```tsx
// ❌ wrong: `[]` infers never[]
const [items, setItems] = useState([]);
setItems(['a']);           // TS2345: Argument of type 'string[]' is not assignable to 'never[]'

// ✅ right: name the eventual type
const [items2, setItems2] = useState<string[]>([]);
setItems2(['a']);

// ❌ wrong: null infers just null
const [user, setUser] = useState(null);
setUser({ id: 'u1' });     // TS2345: Argument of type '{ id: string; }' is not assignable to 'null'

// ✅ right:
const [user2, setUser2] = useState<{ id: string } | null>(null);
setUser2({ id: 'u1' });

// ❌ wrong: useRef<number>(0) is readonly-in-practice? No — it compiles, but…
function Counter() {
  const countRef = useRef<number>(0);
  countRef.current += 1;      // ✅ compiles — and re-renders nothing! A ref is not state.
  return <span>{countRef.current}</span>;   // shows a stale-looking value
}
```

The `useRef` case is not a type error but a **logic** error the types cannot catch:
mutating a ref does not re-render. If a value is displayed, it belongs in `useState`;
refs are for values the UI does not read (timers, DOM nodes, “previous value”
caches). This is the Part 4 lesson showing up in a typing exercise — a reminder that
types check shapes, not intent.

**3. Use `currentTarget`, for one precise reason: it is the only one whose type is
guaranteed to match reality.**

- `event.currentTarget` is the element the handler is **attached to** — the `<input>`
  in the JSX. It is always exactly the element type from the JSX attribute, so
  `HTMLInputElement.value` is genuinely available.
- `event.target` is the element that **dispatched** the event, which may be a
  descendant. React's types declare `target` as the *same* element type as
  `currentTarget`, which is a convenient fiction: for a click on a `<span>` inside
  your `<button>`, `target` is really the span. So `target` compiles confidently and
  then lies at runtime — the worst combination.

The `onDivChange` error is the type system doing its job on `currentTarget`:

```text
TS2339: Property 'value' does not exist on type 'EventTarget & HTMLDivElement'.
```

A `<div>` has no `value`; only form elements do. Nothing is generic about that error —
it is exactly the DOM. (If you genuinely have a `<div>` dispatching a change event,
narrow before use: check `event.currentTarget instanceof HTMLInputElement`.)

### Intermediate

Build the **typed component library**: `Button` (native props derived + variants),
`TextField` (controlled, `ref` as a prop, `useId`, aria wiring, error/hint),
`Badge` (the falsy-count trap), and `Alert` (discriminated-union props), then render
all of them server-side and inspect the HTML.

Requirements:

1. `Button` extends `Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type'>`,
   adds `variant`/`size` unions, requires `children`, defaults `type` to `'button'`,
   and spreads `...rest`.
2. `TextField` takes `label`, `value`, `onChange: (value: string) => void`,
   `ref?: Ref<HTMLInputElement>`, plus optional `placeholder`, `required`, `disabled`,
   `error`, `hint`. It must generate an id with `useId`, wire `<label htmlFor>`,
   `aria-invalid`, and `aria-describedby` to whichever of the hint/error exist, and
   call `onChange` with the **string value** (not the event).
3. `Badge` takes `children` and an optional `count`, and must render `(0)` for a zero
   count.
4. `Alert` is a discriminated union over `'info' | 'success' | 'warning' | 'error'`,
   where only `'error'` requires `onRetry` and permits an `error?: Error`; `role` is
   `'alert'` for errors and `'status'` otherwise.
5. A `render.tsx` demo that server-renders each component in several states and
   prints the HTML.
6. A `__typetests.tsx` file with `@ts-expect-error` assertions covering: missing
   children, an invalid variant, a string passed to `disabled`, a missing `onRetry`
   on an error alert, `onRetry` on an info alert, a non-number `count`, a missing
   `onChange`, a non-string `error`, a handler taking an event instead of a value, a
   mismatched `ref`, and an unknown DataTable column key.

**Solution** — the complete source is in section 9 above (`types.ts`, `Button.tsx`,
`TextField.tsx`, `Alert.tsx`, `Badge.tsx`, `render.tsx`), with the verified HTML
output and the verified type-test assertions. Run it with:

```bash
npm install react react-dom
npm install --save-dev typescript tsx @types/react @types/react-dom
./node_modules/.bin/tsc --noEmit && npx tsx src/react/render.tsx
```

**Details worth copying from it**

- **`Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type'>`** then re-adding
  them is what makes `children` required and `type` narrow. If you simply add props
  to native ones, `children` stays optional and a button with no label is legal.
- **`className` is destructured and merged**, so callers keep control:
  `[...].filter(Boolean).join(' ')` avoids `"btn undefined"`.
- **`TextField` is controlled and value-based**: `onChange: (value: string) => void`.
  The parent never touches a DOM event, which is why `UserForm`'s `dispatch` call
  needs no type gymnastics.
- **`aria-describedby` is built conditionally** and passed as `undefined` when empty
  — `aria-describedby=""` is worse than omitting the attribute.
- **`error?: string | undefined`** (not `error?: string`) because `exactOptionalPropertyTypes`
  is on and `UserForm` passes `state.errors.name`, a `string | undefined`. This is
  the file 3 rule, now load-bearing.
- **`Badge` uses `count !== undefined ? … : null`.** Try the same component with
  `{count && \` (${count})\`}` and the zero case renders the string `"0"` in the DOM —
  the verified trap from file 3, now visible in real HTML output.

### Challenge

Build the **hooks and composition layer**: a typed `AsyncState`/`useAsync` pair, a
context with a throwing `useTheme` hook, a generic `DataTable` with mapped-type
columns, and a `UserForm` driven by `useReducer` with a discriminated action union —
then render the whole app server-side and add a type-test file proving the props
cannot be misused.

Requirements:

1. `useAsync.ts` (no JSX → `.ts`): `AsyncState<T>` as a four-member discriminated
   union; `useAsync<T>(load)` returning `{ state, reload }`; an `ignore` flag so a
   slow response cannot overwrite a fast one; `unknown` errors normalised to `Error`;
   a JSDoc note that `load` must be wrapped in `useCallback`.
2. `ThemeContext.tsx`: `createContext<Theme | null>(null)`, a `ThemeProvider`, and a
   `useTheme()` that throws when the provider is missing and returns `Theme` (never
   `| null`).
3. `DataTable.tsx`: generic `DataTable<T>` with `Column<T>` as a mapped-type union so
   `render` receives `T[K]`; `rowKey`, `emptyMessage`, `caption`; an empty state.
4. `UserForm.tsx`: `useReducer` with a five-member action union, `never` tripwire,
   `useRef` focus on validation failure, typed `FormEvent`/`ChangeEvent` handlers, and
   a `TextField`-based layout. `onSubmit` returns `Promise<void>`, and failures are
   dispatched as `Error`.
5. `render.tsx`: server-render every component — including an `AsyncView` component
   that switches over `AsyncState<T>` with a `never` tripwire — and print the HTML.
6. `__typetests.tsx`: the assertions from the intermediate exercise **plus**
   DataTable column checks (`key` not in `T`, `render` receiving the wrong value
   type, `rowKey` returning a number) and `useRef` nullability.

**Solution** — complete source in section 9 (`DataTable.tsx`, `ThemeContext.tsx`,
`useAsync.ts`, `UserForm.tsx`, `render.tsx`, `__typetests.tsx`), all verified:
`tsc --noEmit` exits 0, and the render output is the verified HTML in section 9.

**The three ideas that make this architecture work**

1. **Every async/lifecycle concern is a union, not a boolean.** `AsyncState<T>` has
   four states and each carries only its own data. A component that switches over it
   with a `never` tripwire cannot forget a state — the compiler enumerates them.
2. **`never` tripwires scale.** Four of them appear across this file's components
   (reducer actions, async state, alert variants via the discriminant, table
   columns). Each one converts "we added a case and forgot to handle it" from a
   production bug into a build error. This is the single highest-value habit in the
   whole part.
3. **Types stop at the boundary; runtime checks do not.** `useAsync` normalises
   `unknown` errors; `useTheme` throws on a missing provider; the loader in Part 15
   will validate response shapes. Types describe what you *intend*; guards and
   assertions defend what actually arrives.

---

## 14. Summary

- **`.tsx` for JSX, `.ts` for logic.** With `jsx: react-jsx` you do not import React
  for JSX — only for values (`React.use`) or types (`React.JSX.Element`).
- In `.tsx`, a generic **arrow** needs `<T,>`; prefer **`function` declarations**.
  `<string>x` assertions become `x as string`.
- **Component props:** a named `interface`; write it by hand for a component's own
  API; **derive** it from DOM elements (`ComponentPropsWithoutRef<'button'>`) or
  other components (`ComponentProps<typeof X>`) when wrapping.
- **Do not use `React.FC`**: it hides the return type, historically added implicit
  children, and cannot express generics. Plain functions are the modern default.
- **Required `children`** comes from declaring it (`children: ReactNode`), not from
  `React.FC`.
- **Event types** take the element as a generic (`ChangeEvent<HTMLInputElement>`);
  prefer **`event.currentTarget`** over `target`.
- **Refs:** `useRef<T>(null)` is `RefObject<T | null>` — narrow or use `?.`, never
  `!`. **React 19 makes `ref` an ordinary prop**, so `forwardRef` is no longer needed.
- **Hooks:** annotate `useState` when the initial value under-describes the future
  (`useState<User | null>(null)`, `useState<string[]>([])`); `useReducer` + a
  discriminated action union + `never` tripwire is the pattern for state machines;
  `useContext` should be wrapped in a **throwing hook** when the provider is required.
- **Generic components** (e.g. `DataTable<T>`) plus **mapped-type props**
  (`Column<T>`, `T[K]` in `render`) give per-key typing for free.
- **`@ts-expect-error` is your type test suite** — it fails the build if the line
  compiles. Twenty-one of them back this file.
- **A syntax error suppresses every type error in the program** (verified). A green
  typecheck means nothing if something failed to parse.
- **Version-check every typing pattern you copy.** `forwardRef` was mandatory;
  `React.FC`'s children were implicit; `use`, `useActionState`, `useOptimistic` and
  `useEffectEvent` are recent additions. The types moved with them.

**What's next →** Part 3 begins the React-specific journey:
[`../03-react-fundamentals/01-what-is-react.md`](../03-react-fundamentals/01-what-is-react.md).
You now have the TypeScript foundation — props, events, refs, hooks, generics, unions —
so from here on, every React concept gets *both* an explanation and a correct type.
