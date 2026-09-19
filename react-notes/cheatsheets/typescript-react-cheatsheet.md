# Typing React Cheat Sheet

> The types you need in a real app, with the failure each one prevents.
> Deep version: [Part 2 · 11](../02-typescript/11-typescript-react.md) · [Part 18 · 03](../18-interview/typescript-interview.md)

## Components and props

```tsx
// ✅ The default: an interface, typed on the parameter
interface UserCardProps {
  user: User;
  /** Omit for the compact variant. */
  compact?: boolean;
  onSelect?: (id: string) => void;
  children?: ReactNode;
}

export function UserCard({ user, compact = false, onSelect, children }: UserCardProps) { … }

// ❌ React.FC — implies children, complicates generics, adds nothing
export const UserCard: React.FC<UserCardProps> = ({ user }) => { … };
```

```tsx
// Wrap a native element: intersect with its attributes, spread the rest
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string };
function LabeledInput({ label, ...rest }: InputProps) { … }

// A polymorphic component
type PolymorphicProps<C extends ElementType, P = object> =
  P & { as?: C } & Omit<ComponentPropsWithoutRef<C>, keyof P | 'as'>;
```

## The React types you will actually use

| Type | Use for |
| --- | --- |
| `ReactNode` | `children`, anything renderable (elements, strings, numbers, `null`, fragments, arrays) |
| `ReactElement` | Exactly one element (an `icon` prop) |
| `ComponentProps<'input'>` | The props of a native element |
| `ComponentPropsWithoutRef<'div'>` | Same, excluding `ref` (for wrappers) |
| `ElementType` | A polymorphic `as` prop |
| `CSSProperties` | A `style` object in a variable |
| `FormEvent<HTMLFormElement>` | `onSubmit` |
| `ChangeEvent<HTMLInputElement>` | `onChange` on an input |
| `MouseEvent<HTMLButtonElement>` | `onClick` on a button |
| `KeyboardEvent<HTMLInputElement>` | `onKeyDown` |
| `RefObject<T>` | A ref you pass down |

```tsx
import { type CSSProperties, type ReactNode, useState } from 'react';   // `type` imports are erased
```

## Hooks

```tsx
// useState — annotate when the initial value does not imply the type
const [user, setUser] = useState<User | null>(null);
const [rows, setRows] = useState<Row[]>([]);          // ❌ useState([]) → never[]
const [status, setStatus] = useState<Status>('idle'); // a union needs the annotation or a literal

// useRef — three signatures; picking wrong is a compile error
const inputRef = useRef<HTMLInputElement>(null);        // DOM ref → RefObject, .current is T | null
const timerRef = useRef<number | undefined>(undefined); // mutable box
const countRef = useRef(0);                             // initialised → .current is number

// useEffect — returns void or a cleanup function
useEffect(() => {
  let cancelled = false;
  load().then((data) => { if (!cancelled) setData(data); });
  return () => { cancelled = true; };
}, [id]);
// ❌ useEffect(async () => { … }, []) — returns a Promise, not a cleanup function

// useMemo / useCallback — usually inferred
const sorted = useMemo(() => [...items].sort(byName), [items]);
const onSave = useCallback((task: Task) => api.update(task.id, task), []);

// useContext — type the context, not the call
const AuthContext = createContext<AuthValue | null>(null);
export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

// A custom hook returning a tuple: annotate the return type
function useToggle(initial = false): [boolean, () => void] { … }
```

## Events

```tsx
<form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); }}>
<input onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)} />
<button onClick={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()} />
<div onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Escape') close(); }}>
```

- `event.target.value` is **always a `string`** → `Number(...)` for numbers.
- `currentTarget` is the element the handler is attached to; `target` is the element that fired.
- `currentTarget` is `null` if read asynchronously — capture the value first.

## State shapes: make impossible states unrepresentable

```tsx
// ❌ Four booleans = 16 combinations, most of them nonsense
interface State { isLoading: boolean; isError: boolean; data: User[] | null; error: Error | null }

// ✅ One tag; `data` cannot be read unless status is 'ready'
type ViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: User[] }
  | { status: 'error'; error: Error };

function render(state: ViewState) {
  switch (state.status) {
    case 'idle':    return null;
    case 'loading': return <Spinner />;
    case 'ready':   return <List items={state.data} />;
    case 'error':   return <ErrorPanel error={state.error} />;
  }
}
```

## Deriving types (one source of truth)

```ts
export interface Task { id: string; title: string; status: TaskStatus; updatedAt: string }

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskInput  = Omit<Task, 'id' | 'updatedAt'>;   // create payload
export type TaskPatch  = Partial<TaskInput>;               // update payload
export type Columns    = Record<TaskStatus, Task[]>;       // exhaustive by construction

// From a Zod schema — validation rules and the type cannot drift
const schema = z.object({ title: z.string().min(3), status: z.enum(['todo', 'doing', 'done']) });
type FormValues = z.infer<typeof schema>;
```

## Errors

```ts
// `catch` gives you unknown under strict — and that is correct
function userMessage(error: unknown): string {
  if (error instanceof ApiError) return messageFor(error.kind);
  if (error instanceof Error) return 'Something went wrong. Please try again.';
  return 'Something went wrong. Please try again.';        // throw 'nope' is legal JS
}

// Exhaustiveness: a new union member becomes a build failure
function assertNever(value: never): never { throw new Error(`Unhandled: ${JSON.stringify(value)}`); }
```

## Environment

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_API_URL: string;
  readonly VITE_LOG_LEVEL?: string;      // every env value is a string, or undefined
}
interface ImportMeta { readonly env: ImportMetaEnv }

declare const __APP_VERSION__: string;   // values injected by `define` in vite.config.ts
declare const __APP_COMMIT__: string;
```

A typo in `import.meta.env.VITE_API_URl` is now a compile error.
→ [Part 15 · 01](../15-production/01-environment-variables.md)

## Escape hatches — and why to avoid them

| Escape hatch | What it costs |
| --- | --- |
| `any` | Disables checking, and spreads to everything it touches |
| `as T` | A cast nothing verifies — the classic "works until the API changes" |
| `value!` | A crash waiting for `null`; `useParams()` is `string \| undefined` for a reason |
| `@ts-expect-error` | Better than `@ts-ignore` (it fails when the error goes away) |
| `JSON.parse(x) as T` | A claim, not a check — validate with Zod at the boundary |

```tsx
const { id = '' } = useParams();     // ✅ an explicit fallback beats `id!`
```

## `satisfies` — the pattern for maps and configs

```ts
const rules = {
  'tasks:read':  (s) => s !== null,
  'tasks:write': (s) => s?.user.roles.includes('editor') ?? false,
  'admin:view':  (s) => s?.user.roles.includes('admin') ?? false,
} satisfies Record<string, (session: Session | null) => boolean>;

type Permission = keyof typeof rules;   // a typo'd permission is now a compile error
```

`satisfies` validates the shape **and** keeps the literal keys, which `: Record<…>` would erase.

## Strict-mode flags that change how you write React

| Flag | What it catches |
| --- | --- |
| `strictNullChecks` | Using `T \| null` without a guard — the top source of runtime crashes |
| `noImplicitAny` | Untyped parameters |
| `noUnusedLocals` / `noUnusedParameters` | Dead code |
| `noUncheckedIndexedAccess` | `arr[i]` is `T \| undefined`, which it always was at runtime |
| `exactOptionalPropertyTypes` | Passing `undefined` where a property is optional |

## The recurring type errors, decoded

| Error | Cause → fix |
| --- | --- |
| `Argument of type 'never[]' is not assignable` | `useState([])` → `useState<Item[]>([])` |
| `Type 'string \| undefined' is not assignable to 'string'` | `useParams()` → `const { id = '' } = useParams()` |
| `Type 'MutableRefObject<T>' is not assignable to 'Ref<T>'` | Wrong `useRef` overload — use `useRef<T>(null)` for DOM refs |
| `Property 'children' does not exist` | Declare `children: ReactNode` |
| `Effect callbacks are synchronous to prevent race conditions` | An `async` effect — move the async work inside |
| `Type 'null' is not assignable to type 'T'` | A missing `\| null` in the state type |
| `Object is possibly 'null'` | Add a guard, not a `!` |
| `'X' is declared but its value is never read` | `noUnusedLocals` — delete it |
