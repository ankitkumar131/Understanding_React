# TypeScript + React Cheatsheet — Typing Everything

> **Part 18 · Reference · Cheatsheet 3 of 9**
> Baseline: TypeScript 5.x, React 19, `strict: true`. If `strict` is off, most of these guarantees do not exist — turn it on first.

---

## 1. tsconfig for a React app

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",                 // required for .tsx (TS17004 without it)
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,       // forces `import type` where only types are used
    "erasableSyntaxOnly": true,         // no enums / namespaces / constructor parameter properties
    "noEmit": true,                     // Vite/esbuild does the emitting

    "strict": true,                     // the whole point
    "noUncheckedIndexedAccess": true,   // arr[0] is T | undefined
    "exactOptionalPropertyTypes": true, // "absent" ≠ "present but undefined"
    "noImplicitOverride": true,
    "noUnusedLocals": true,             // TS6133 fails a real build (this repo enforces it)
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "paths": { "@/*": ["./src/*"] }     // alias — no `baseUrl` needed (TS5101 if you add it)
  },
  "include": ["src"]
}
```

---

## 2. Components

```tsx
// ✅ The default pattern: typed props, named export, plain function
interface ButtonProps {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'danger';
  disabled?: boolean;
}

export function Button({ label, onClick, tone = 'primary', disabled = false }: ButtonProps) {
  return (
    <button type="button" className={`btn btn--${tone}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
```

| Do | Don't |
| --- | --- |
| `function C(props: Props)` | `const C: React.FC<Props> = …` |
| Export the props type when consumers need it | Reach into component internals |
| `children: ReactNode` explicitly | Assume `children` exists |
| Defaults in the parameter list | `defaultProps` (legacy) |

---

## 3. Common type imports

```tsx
import type {
  ReactNode,            // anything renderable (JSX, string, number, null, arrays)
  ReactElement,         // exactly one element
  ComponentType,        // a component (function or class)
  PropsWithChildren,    // T & { children?: ReactNode }
  CSSProperties,        // style objects
  ChangeEvent, FormEvent, MouseEvent, KeyboardEvent, FocusEvent,
  Dispatch, SetStateAction,       // setState types
  RefObject, MutableRefObject,    // ref types (React 19 prefers RefObject)
} from 'react';
```

---

## 4. State, refs and hooks

```tsx
const [count, setCount] = useState(0);                                  // number
const [user, setUser] = useState<User | null>(null);                    // nullable
const [todos, setTodos] = useState<Todo[]>([]);                         // array (empty is fine: never infer as never[])
const [state, setState] = useState<FormState>(() => readStored());      // lazy initialiser
const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle'); // union keeps values legal

const inputRef = useRef<HTMLInputElement | null>(null);                 // React 19 requires the argument
const timerRef = useRef<number | null>(null);

const value = useContext(ThemeContext);                                 // Theme | null with a null default
const [state, dispatch] = useReducer(reducer, initialState);

// Exported types for setters passed as props:
interface FieldProps { value: string; onChange: Dispatch<SetStateAction<string>> }
```

---

## 5. Events

| Event | Type | `event.target` has |
| --- | --- | --- |
| text input change | `ChangeEvent<HTMLInputElement>` | `.value`, `.checked` |
| textarea | `ChangeEvent<HTMLTextAreaElement>` | `.value` |
| select | `ChangeEvent<HTMLSelectElement>` | `.value` |
| form submit | `FormEvent<HTMLFormElement>` | `.currentTarget.elements` |
| button click | `MouseEvent<HTMLButtonElement>` | `.currentTarget` |
| key press | `KeyboardEvent<HTMLInputElement>` | `.key`, `.code` |

```tsx
// Inline: let inference do it (the best default)
<input onChange={(e) => setQuery(e.target.value)} />

// Named: annotate
const handleChange = (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value);
const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save(); };

// You rarely need these:
// const handler: React.FormEventHandler<HTMLFormElement> = (event) => …
```

---

## 6. Typing API data (parse, never cast)

```ts
// 1. Declare the shape you actually rely on
export interface WeatherReport {
  now: { city: string; temperatureC: number; description: string };
  forecast: { date: string; minC: number; maxC: number }[];
}

// 2. Validate at the boundary — `unknown` in, typed value out
export function parseWeather(body: unknown): WeatherReport {
  if (typeof body !== 'object' || body === null) throw new Error('Malformed body');
  const now = (body as { now?: unknown }).now;
  if (typeof now !== 'object' || now === null) throw new Error('Missing `now`');
  const { city, temperatureC } = now as { city?: unknown; temperatureC?: unknown };
  if (typeof city !== 'string' || typeof temperatureC !== 'number') throw new Error('Bad fields');
  const forecast = Array.isArray((body as { forecast?: unknown }).forecast) ? … : [];
  return { now: { city, temperatureC, description: 'Unknown' }, forecast };
}

// 3. Zod does the same with less code and drives the type
import { z } from 'zod';
export const WeatherSchema = z.object({
  now: z.object({ city: z.string(), temperatureC: z.number() }),
  forecast: z.array(z.object({ date: z.string(), minC: z.number(), maxC: z.number() })),
});
export type WeatherReport = z.infer<typeof WeatherSchema>;      // one source of truth
```

**Never** `const data = (await response.json()) as WeatherReport;`

---

## 7. Discriminated unions: the state machine type

```ts
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string; retryable: boolean };

function render(state: RequestState<WeatherReport>) {
  switch (state.status) {
    case 'idle': return 'Search for a city';
    case 'loading': return 'Loading…';
    case 'success': return `${state.data.now.city}: ${state.data.now.temperatureC}°C`;
    case 'error': return state.retryable ? `${state.message} (try again)` : state.message;
  }
}
```

Why it beats `{ isLoading; error; data }`: impossible combinations cannot be written, and TypeScript tells you when a new state is not handled.

---

## 8. Context, typed and safe

```tsx
export interface AuthValue {
  status: 'loading' | 'anonymous' | 'authenticated';
  session: Session | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);      // null default = "must be provided"

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthValue>(() => ({ status, session, login, logout }), [status, session, login, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;   // React 19: no `.Provider`
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;                                                  // callers never see `| null`
}
```

---

## 9. Generics in components and hooks

```tsx
// Generic list: the item type flows into renderItem
interface ListProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  empty?: ReactNode;
}

export function List<T>({ items, renderItem, getKey, empty = <p>Nothing here.</p> }: ListProps<T>) {
  if (items.length === 0) return <>{empty}</>;
  return <ul>{items.map((item, index) => <li key={getKey(item)}>{renderItem(item, index)}</li>)}</ul>;
}

<List items={tasks} getKey={(t) => t.id} renderItem={(task) => <span>{task.title}</span>} />

// Generic hook with a tuple return (as const is required)
export function useToggle(initial = false): readonly [boolean, () => void] {
  const [value, setValue] = useState(initial);
  return [value, useCallback(() => setValue((v) => !v), [])] as const;
}

// Constraint: "anything with an id"
function upsert<T extends { id: string }>(items: readonly T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next];
}

// Key-valued helper
function setField<T, K extends keyof T>(object: T, key: K, value: T[K]): T {
  return { ...object, [key]: value };
}
```

---

## 10. Utility types you will actually use

```ts
interface Task { id: string; title: string; status: Status; assignee: string; points: number }

type TaskDraft        = Pick<Task, 'title' | 'assignee' | 'points'>;  // what a form submits
type TaskPatch        = Partial<TaskDraft>;                           // PATCH body
type TaskWithoutId     = Omit<Task, 'id'>;                            // create payload
type StatusLabels      = Record<Status, string>;                      // exhaustive map (new status breaks the build)
type ReadonlyTask      = Readonly<Task>;                              // no top-level writes
type RequiredDraft     = Required<TaskDraft>;                         // all fields present
type NonNullSession    = NonNullable<Session | null>;                 // Session
type ApiResult         = Awaited<ReturnType<typeof fetchTasks>>;      // the resolved type of an async function
type Handler           = Parameters<typeof onClick>[0];               // the first parameter's type
```

---

## 11. Narrowing recipes

```ts
if (typeof value === 'string') { /* string here */ }
if (value instanceof Error) setMessage(value.message);
if ('report' in state) { /* state.report exists */ }
if (Array.isArray(body)) { /* unknown → unknown[] */ }
if (status === 'error') { /* discriminated union */ }

function isTask(value: unknown): value is Task {
  return typeof value === 'object' && value !== null && typeof (value as Task).id === 'string';
}
const tasks = (body as unknown[]).filter(isTask);        // typed as Task[]

// Exhaustiveness: a new variant becomes a compile error
default: { const never: never = state; return never; }
```

---

## 12. Error decoder (React edition)

| Code | Full message (short) | Usual cause in React code | Fix |
| --- | --- | --- | --- |
| TS2322 | Type 'X' is not assignable to type 'Y' | `string` from an input where a `number` is expected; wrong prop type | convert (`Number(...)`) or fix the model |
| TS2339 | Property 'x' does not exist on type 'Y' | typo, or a union you have not narrowed | narrow, or fix the type |
| TS2345 | Argument of type 'X' is not assignable… | callback/variant mismatch (often `defaultValue` vs `value`) | make the callback match the prop type |
| TS7006 | Parameter implicitly has an 'any' type | un-annotated callback with `noImplicitAny` | write the handler inline or annotate |
| TS7053 | Element implicitly has 'any' because 'string' can't index | `obj[dynamicKey]` | `Record<K, V>`, `keyof`, or narrow the key |
| TS18048 / TS2532 | 'x' is possibly 'undefined' | `ref.current`, `arr[0]`, an optional prop | `?.`, `??`, early return, or narrow |
| TS2554 | Expected N arguments, but got M | React 19's `useRef` requires an argument | `useRef<T \| null>(null)` |
| TS2786 | 'X' cannot be used as a JSX component | `async` component (returns a promise) | return elements; do async work in an action/effect |
| TS6133 | 'x' is declared but never read | unused import after a refactor | delete it (it fails the build by design) |
| TS1294 | Not allowed with `erasableSyntaxOnly` | `enum`, `namespace`, constructor parameter property | union of literals, plain object, explicit field |
| TS5101 | Option 'baseUrl' is deprecated | old tsconfig | use `paths` without `baseUrl` |
| TS17004 | Cannot use JSX unless '--jsx' is provided | `.tsx` without `"jsx"` | set `"jsx": "react-jsx"` |

**Reading strategy:** read inside-out — the quoted types are the two sides, the caret is the position, the outer sentence is the relationship (“not assignable”, “possibly undefined”, “does not exist”).

---

## 13. Type-only imports and module hygiene

```ts
import type { Task } from './types';        // erased at build → no runtime import, no cycles
import { createTask } from './types';       // a value import

// Barrel (index.ts) — convenient, but beware of cycles and bundle bloat
export type { Task } from './types';
export { TaskList } from './components/TaskList';
```

`verbatimModuleSyntax` forces `import type` where only types are used, which keeps the emitted output predictable and helps bundlers drop type-only edges.

---

## 14. Ten rules of thumb

1. **Parse at the boundary.** `unknown` in, validated value out; never `as` on an API response.
2. **Make invalid states unrepresentable** — unions, not optional-prop soup.
3. **`readonly T[]` for props** you do not mutate; it propagates immutability through the codebase.
4. **Let inference work**; annotate public surfaces (props, hooks, API clients).
5. **No `any`.** If you must, use `unknown` and narrow — `any` spreads and hides the next bug.
6. **Export props types** so consumers and tests can use them.
7. **Type the *values*, not the *syntax***: `Record<Status, string>` beats `{ [key: string]: string }`.
8. **`satisfies` for config objects** — checked against a type without widening the literals.
9. **Discriminate on a literal field** (`status`, `kind`, `variant`) rather than checking several booleans.
10. **Turn on `noUncheckedIndexedAccess`** once your codebase can take it — it catches real crash bugs at the cost of a few `?.`.
