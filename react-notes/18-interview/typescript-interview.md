# TypeScript Interview Questions, with React Context

> **Part 18 · Interview Preparation · File 3 of 4**

Why this file exists: TypeScript questions in a React interview are rarely about the type system
in the abstract — they are "how would you type this component?" Each answer here gives the
language fact and then the React application, because that pairing is what the interviewer is
actually probing for.

---

## 1. What does TypeScript actually do?

**Answer.** It is a static type checker that compiles to JavaScript by *erasing* types. Types
exist only at build time; at runtime you have ordinary JavaScript with no type information and
no runtime validation. Two consequences: type errors do not stop `vite dev` (esbuild strips
types without checking them), and a type is a **claim**, not a guarantee — data from an API,
`localStorage` or a URL is whatever it actually is, regardless of the interface you wrote.

**In React.** This is why `tsc -b` belongs in the build script and in CI, and why production
apps validate at the boundary (Zod) rather than trusting a cast. `const data = await res.json()
as User` is a promise to the compiler that nothing can enforce (Part 2 file 01; Part 8 file 05).

---

## 2. `interface` vs `type`

**Answer.** Both describe object shapes. Differences that matter:

| | `interface` | `type` |
| --- | --- | --- |
| Unions / intersections | ❌ no unions | ✅ `type A = B \| C`, `A & B` |
| Declaration merging | ✅ (same name merges) | ❌ |
| Extends | `extends` | `&` |
| Primitives / tuples / mapped types | ❌ | ✅ `type Id = string`, `type Pair = [a, b]` |
| Error messages | Often clearer for objects | Can be verbose |

**The practical rule:** `interface` for object shapes that others will extend (props, API
models); `type` for unions, tuples, primitives, mapped and conditional types. Consistency beats
the choice.

**In React.**

```tsx
// interface for props — extensible, better errors
interface ButtonProps {
  variant?: 'primary' | 'ghost';
  onClick: () => void;
  children: ReactNode;
}

// type for anything that is not a plain object shape
type Status = 'idle' | 'loading' | 'ready' | 'error';
type FormValues = z.infer<typeof schema>;
type TaskInput = Omit<Task, 'id' | 'updatedAt'>;
```

Also worth knowing: **never use `React.FC`** as the default. It implies `children` whether you
want it or not, makes generics awkward, and adds nothing over typing the parameter directly
(Part 2 files 03, 04; Part 3 file 08).

---

## 3. How do you type a component's props?

**Answer.** Type the destructured parameter directly.

```tsx
interface UserCardProps {
  user: User;
  /** Omit to render a compact card. */
  compact?: boolean;
  onSelect?: (id: string) => void;
  children?: ReactNode;
}

export function UserCard({ user, compact = false, onSelect, children }: UserCardProps) {
  return <article>{/* … */}</article>;
}
```

**Things that show depth**

- **Default values in the destructuring pattern**, not `defaultProps` (removed for function
  components in React 19) and not `||` (which replaces `0` and `false`).
- **`children` is not implicit.** Declare it: `children: ReactNode` for content you render, or
  omit it entirely if the component takes no children.
- **Event handler prop types:** `onClick: () => void` for your own callback;
  `onClick: MouseEventHandler<HTMLButtonElement>` when you forward the event.
- **`ReactNode` vs `ReactElement`:** `ReactNode` includes strings, numbers, `null`, fragments
  and arrays — use it for `children`. `ReactElement` is a single element.
- **Extend native element props** when wrapping:

```tsx
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string };

export function LabeledInput({ label, ...rest }: InputProps) {
  const id = useId();
  return <><label htmlFor={id}>{label}</label><input id={id} {...rest} /></>;
}
```

That one pattern — intersect with the native attributes and spread the rest — is what makes a
wrapper component feel native (Part 3 file 08; Part 2 file 11).

---

## 4. Generics

**Answer.** A generic is a type parameter: a placeholder filled in at the call site, so one
implementation stays type-safe for many shapes. Constraints (`extends`) restrict what may be
substituted; defaults make them optional.

```ts
function first<T>(items: T[]): T | undefined { return items[0]; }
first([1, 2, 3]);            // T inferred as number
first<string>(['a']);        // explicit

function pluck<T, K extends keyof T>(item: T, key: K): T[K] { return item[key]; }
pluck({ id: 1, name: 'a' }, 'name');   // string — and 'nam' is a compile error
```

**In React.** The four places generics earn their keep:

```tsx
// 1. A reusable list component that keeps the item type
interface ListProps<T> { items: T[]; renderItem: (item: T) => ReactNode; keyFor: (item: T) => string }
function List<T>({ items, renderItem, keyFor }: ListProps<T>) {
  return <ul>{items.map((item) => <li key={keyFor(item)}>{renderItem(item)}</li>)}</ul>;
}
<List items={users} renderItem={(u) => u.name} keyFor={(u) => u.id} />   // u: User, inferred

// 2. A typed API client
async function request<T>(path: string): Promise<T> { /* … */ }
const user = await request<User>('/me');        // user: User

// 3. Typed state
const [items, setItems] = useState<Task[]>([]);       // without <Task[]>, it is never[]
const ref = useRef<HTMLInputElement>(null);

// 4. A typed context
const AuthContext = createContext<AuthValue | null>(null);
```

⚠️ **`useState([])` infers `never[]`** and then refuses every `setItems` call. The generic
annotation is required — a daily occurrence (Part 2 file 07; Part 4 file 02).

---

## 5. Narrowing and discriminated unions

**Answer.** Narrowing is TypeScript following your runtime checks to a more specific type:
`typeof`, `instanceof`, `in`, truthiness, equality against a literal, and **discriminated
unions** — a union of object types sharing a literal "tag" field, which `switch` narrows
exhaustively.

```ts
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: User[] }
  | { status: 'error'; error: Error };

function render(state: State) {
  switch (state.status) {
    case 'idle':    return null;
    case 'loading': return <Spinner />;
    case 'ready':   return <List items={state.data} />;    // data exists here, and only here
    case 'error':   return <ErrorPanel error={state.error} />;
  }
}
```

**In React.** This is the single highest-value TypeScript pattern in a React codebase, because
it makes **impossible states unrepresentable**. Compare the bug-prone version:

```tsx
// ❌ Four booleans = 16 combinations, 12 of which are nonsense
{ isLoading: boolean; isError: boolean; data: User[] | null; error: Error | null }

// ✅ One tag = 4 states, and `data` cannot be accessed unless status is 'ready'
type ViewState = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: User[] };
```

With the boolean version, `if (!isLoading && !isError)` still leaves `data` possibly `null` and
you write `data!` — the non-null assertion that becomes a production crash. With the union, the
compiler proves the data exists. Add `never` for exhaustiveness and a new state becomes a
compile error until you handle it (Part 2 file 09; Part 15 file 04).

---

## 6. Utility types

| Type | Does | React example |
| --- | --- | --- |
| `Partial<T>` | All properties optional | Update payloads |
| `Required<T>` | All properties required | Post-validation config |
| `Pick<T, K>` | Keep selected keys | `Pick<Task, 'title' \| 'status'>` |
| `Omit<T, K>` | Remove keys | `Omit<Task, 'id' \| 'updatedAt'>` for create input |
| `Record<K, V>` | Object with keys `K` | `Record<TaskStatus, Task[]>` for board columns |
| `Readonly<T>` | All properties readonly | Props you must not mutate |
| `ReturnType<F>` | The return type of `F` | Typing a hook's return |
| `Parameters<F>` | Tuple of parameter types | Wrapping a callback |
| `Exclude` / `Extract` | Filter a union | `Exclude<Status, 'idle'>` |
| `NonNullable<T>` | Remove `null`/`undefined` | After a guard |

```ts
// The pattern you will use most: derive the "input" type from the entity
export interface Task { id: string; title: string; status: TaskStatus; updatedAt: string }
export type TaskInput  = Omit<Task, 'id' | 'updatedAt'>;        // for create
export type TaskPatch  = Partial<TaskInput>;                    // for update
export type TaskStatus = 'todo' | 'doing' | 'done';
export type Columns    = Record<TaskStatus, Task[]>;            // exhaustive by construction
```

**Why this is a strong interview answer:** deriving types means adding a field to `Task`
automatically updates the create form's payload type, the patch type and the board columns. One
source of truth, zero drift (Part 2 file 10).

---

## 7. `unknown`, `any`, `never`

**Answer.**

- **`any`** disables checking. It is contagious: one `any` silently un-types everything it
  touches.
- **`unknown`** is the type-safe `any`: you may hold anything, but you must **narrow before
  use**. It is the correct type for `catch` variables, `JSON.parse` results and external input.
- **`never`** is the empty type — a value that cannot exist. It appears as the return of a
  function that always throws, the element type of an exhausted union, and the tool for
  exhaustiveness checks.

```ts
function handle(error: unknown): string {
  if (error instanceof ApiError) return error.message;      // narrowed
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
```

**In React.** `catch (error)` gives you `unknown` under `strict`, which is exactly right — an
error can be anything, including a string, because `throw 'nope'` is legal JavaScript. The
pattern above is what a production `userMessage()` looks like. And `assertNever` in a
`switch`'s `default` turns "someone added a fourth status" into a build failure instead of a
silent fall-through (Part 2 file 09; Part 15 file 04).

---

## 8. `strict` mode and the flags that matter

**Answer.** `strict: true` enables a family of checks. The ones that change how you write React:

| Flag | What it catches |
| --- | --- |
| `strictNullChecks` | Using a `T \| null` without checking — the biggest source of runtime crashes |
| `noImplicitAny` | Parameters whose type could not be inferred |
| `strictFunctionTypes` | Unsound callback parameter types |
| `noUnusedLocals` / `noUnusedParameters` | Dead code |
| `exactOptionalPropertyTypes` | Passing `undefined` explicitly where a property is optional |
| `noUncheckedIndexedAccess` | `arr[i]` being `T` when it is really `T \| undefined` |

**In React.** `strictNullChecks` is the one that pays for itself daily:

```tsx
const { id } = useParams();          // id: string | undefined
useNote(id);                          // ❌ error — and it is RIGHT: the route may not have matched
const { id = '' } = useParams();      // ✅ explicit fallback
```

And the assertion operators are the escape hatches to avoid:

```tsx
document.getElementById('root')!     // the one place `!` is defensible (you control index.html)
user!.name                           // ❌ a crash waiting for a null user
data as User[]                       // ❌ a cast that nothing verifies
```

The honest answer in an interview: "`!` and `as` are how TypeScript bugs get into production. I
treat them as code smells and prefer a guard, a default, or a runtime validator." (Part 2 files
02, 11.)

---

## 9. Typing hooks — the reference answers

```tsx
// useState — annotate when the initial value does not imply the type
const [user, setUser] = useState<User | null>(null);
const [items, setItems] = useState<Task[]>([]);          // otherwise never[]

// useRef — three different signatures, and picking wrong is a compile error
const inputRef = useRef<HTMLInputElement>(null);         // DOM ref: .current is T | null
const timerRef = useRef<number | undefined>(undefined);  // mutable box, no DOM
const countRef = useRef(0);                              // initialised → .current is number

// useEffect — returns void or a cleanup function; an async function returns a Promise → error
useEffect(() => {
  let cancelled = false;
  fetchData().then((d) => { if (!cancelled) setData(d); });
  return () => { cancelled = true; };                    // cleanup, correctly typed
}, []);

// ❌ This is the classic mistake — the effect returns a Promise, not a cleanup function
useEffect(async () => { await fetchData(); }, []);

// useMemo / useCallback — usually inferred; annotate only when the inference is too wide
const sorted = useMemo(() => [...items].sort(byName), [items]);
const onSave = useCallback((task: Task) => api.update(task.id, task), []);

// useContext — type the context, not the call
const { user } = useAuth();     // from createContext<AuthValue | null>(null) + a throwing hook

// Custom hooks — annotate the return when it is a tuple, so consumers get a tuple not an array
function useToggle(initial = false): [boolean, () => void] {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle];
}
```

⚠️ **`useRef<HTMLInputElement>(null)` vs `useRef<HTMLInputElement | null>(null)`** — the first
gives a `RefObject` whose `current` is readonly-ish and is what JSX `ref={…}` expects; the
second is a mutable box. Getting them mixed up produces "Type 'MutableRefObject' is not
assignable to type 'Ref'" (Part 4 files 02, 04, 09).

---

## 10. Typing events

```tsx
import { useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';

function Form() {
  const [value, setValue] = useState('');

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);   // correctly typed as the form
      }}
    >
      <input
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') submit(); }}
      />
      <button onClick={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()}>Go</button>
    </form>
  );
}
```

Three facts worth stating:

1. **React events are synthetic**, wrapping the native event. `event.nativeEvent` gets you the
   original.
2. **`currentTarget` vs `target`:** `currentTarget` is the element the handler is attached to;
   `target` is the element that fired. In a delegated handler on a list, they differ.
3. **`event.target.value` is always a `string`** — even for `<select>` and `<input type="number">`.
   `Number(event.target.value)` is not optional, and forgetting it produces `"5" + 1 === "51"`.
4. `currentTarget` is **null if you read it asynchronously** — capture the value first.

(Part 3 file 12; Part 5 file 03.)

---

## 11. Common TypeScript-in-React interview tasks

**"Type a polymorphic `as` prop."**

```tsx
type AsProp<C extends ElementType> = { as?: C };
type PolymorphicProps<C extends ElementType, P = object> =
  P & AsProp<C> & Omit<ComponentPropsWithoutRef<C>, keyof P | 'as'>;

function Text<C extends ElementType = 'p'>({ as, ...rest }: PolymorphicProps<C, { size?: 'sm' | 'lg' }>) {
  const Tag = as ?? 'p';
  return <Tag {...rest} />;
}
<Text as="h1" size="lg">Hello</Text>     // href is rejected; as="a" accepts href
```

**"Type a discriminated button."**

```tsx
type ButtonProps =
  | { variant: 'link'; href: string; onClick?: never }
  | { variant: 'button'; onClick: () => void; href?: never };
// `onClick?: never` makes the illegal combination a compile error, not a runtime surprise
```

**"Why does `Object.keys(x)` return `string[]` and not `(keyof T)[]`?"** Because at runtime an
object may have more keys than the type declares (excess property checks only apply to literals).
The safe patterns: `(Object.keys(x) as (keyof T)[])` when you control the object, or iterate
`Object.entries` and narrow.

**"What is `satisfies` and why use it?"** It checks that a value matches a type **without
widening it to that type** — so you keep literal inference *and* get validation:

```ts
const routes = {
  home: { path: '/', permission: 'public' },
  admin: { path: '/admin', permission: 'admin:view' },
} satisfies Record<string, { path: string; permission: Permission }>;

routes.admin.permission    // 'admin:view' (literal), not string — and a typo'd permission fails
```

That is exactly how the permission map in Project 5 stays typo-proof (Part 2 files 05, 10; Part
14 file 06).

---

## 12. Quick answers to fast questions

| Question | Answer |
| --- | --- |
| Does TypeScript run in the browser? | No — types are erased at build time |
| Does `vite dev` type-check? | No, esbuild strips types. `tsc` in the build script and CI does |
| `enum` or a union? | Prefer a union of literals or an `as const` object; enums emit runtime code and have quirks |
| How do you type `children`? | `children: ReactNode` |
| `React.FC`? | Avoid it; type the props parameter directly |
| How do you type a ref to a DOM node? | `useRef<HTMLDivElement>(null)` |
| What is `keyof`? | A union of an object type's keys |
| What is `T[K]`? | Indexed access — the type of property `K` on `T` |
| How do you type an API response? | An interface for the shape you use, plus runtime validation at the boundary |
| `as const`? | Makes literals readonly and literal-typed instead of widened |
| What is declaration merging? | Two `interface` declarations with the same name combine — how you extend `ImportMetaEnv` |
| Can types be wrong at runtime? | Yes — a cast or an unvalidated boundary. Types are claims, validators are checks |

---

## 13. How to answer a TypeScript question well

1. **Give the rule**, briefly.
2. **Show the React code** where it applies — interviewers remember code, not definitions.
3. **Name the failure mode it prevents.** "`strictNullChecks` is what stops `useParams()` being
   used as if it always matched."
4. **Be honest about the limits.** "A cast is a promise; Zod is a check." Candidates who know
   where their types stop protecting them are the ones you hire.

---

**What's next →** [`scenario-based-questions.md`](./scenario-based-questions.md) — debugging
scenarios: "my component renders twice", "state resets for no reason", "the effect runs in a
loop". Symptom → diagnosis → fix, in the form interviews actually ask them.
