# 03 — TypeScript Interview Questions (with React Context)

> **Part 18 · Interview Preparation · File 3 of 4**

Why this file exists: TypeScript interviews are not about memorising utility types — they are about whether your types *catch bugs* or merely decorate code. Every answer here is framed as: what does this buy me, and what error would I have shipped without it? Same four parts as the rest of Part 18:

```text
Question
Short interview answer      ← the sentence you say first
Detailed explanation        ← the mechanism and the trade-off
Example                     ← typed, compilable code
```

The compiler errors named in this file are the ones you will actually meet in a React project (`TS2322`, `TS2339`, `TS2345`, `TS7053`, `TS18048`, `TS7006`), and each one is decoded.

---

## 1. Types and interfaces

### Q1.1 — `interface` vs `type` — which do you use?

**Short answer:** Both describe object shapes and are largely interchangeable. Use `interface` for objects and public APIs (it can be extended and merged), `type` for unions, tuples, function types and anything that needs computed or mapped types.

**Detailed explanation:** Three real differences: (1) declaration merging — two `interface` declarations with the same name combine, which is useful for library augmentation and dangerous for typos; `type` cannot merge, so a duplicate name is an error; (2) `interface extends` has slightly friendlier errors than intersection types; (3) `type` can express unions, tuples and conditional/mapped types that `interface` cannot. The pragmatic team rule that interviewers like: **be consistent, and use `type` for React props and unions, `interface` for domain models you expect to extend.** Either way, `prefer-interface` versus `prefer-type` is a lint preference, not a correctness question — say that out loud and you avoid a pointless argument.

**Example:**

```ts
// Union: only `type` can express this
type Status = 'todo' | 'doing' | 'done';

// Domain model: interface extends naturally
interface Entity { id: string; createdAt: number }
interface Task extends Entity { title: string; status: Status; points: number }

// Intersection as an alternative — same shape, different errors
type Task2 = Entity & { title: string; status: Status };
```

### Q1.2 — What is structural typing, and why does it make `interface` mismatches hard to debug?

**Short answer:** TypeScript compares shapes, not names. If two types have the same members, they are assignable — which is a feature (duck typing) and a debugging hazard (an object with an extra `id: number` can still be wrong in a subtle way).

**Detailed explanation:** Structural typing is why `{ id: '1', title: 'x' }` satisfies an interface named differently, and why excess property checks only fire for *object literals* (a variable with extra properties passes). It also explains why branded types exist: to make `UserId` and `OrderId` (both strings) not interchangeable when a mix-up would be a production bug.

**Example:**

```ts
interface UserId { readonly __brand: 'UserId'; id: string }   // branded type

type PlainUserId = string;
type OrderId = string;
declare function loadOrder(id: OrderId): Promise<Order>;

const userId = 'u_1' as unknown as UserId;
// loadOrder(userId);        // ❌ with branding this is impossible to mix up by accident

// Excess property checking (literals only):
interface Task { id: string; title: string }
const withExtra = { id: '1', title: 'x', points: 3 };
const task: Task = withExtra;                 // ✅ allowed: not a literal
// const literal: Task = { id: '1', title: 'x', points: 3 };   // ❌ object literal, excess property
```

### Q1.3 — When should a prop be optional, and what does `?` do?

**Short answer:** `?` makes a property optional (its type includes `undefined`). For props, optional means "callers may omit it" — and every component that reads it must handle `undefined`, or supply a default in destructuring.

**Detailed explanation:** The distinction that matters in React: optional *with a default* (`step = 1`) means the caller's world is simple and the component's world never sees `undefined`; optional *without* a default means every read site needs a check. Prefer defaults for numbers/strings/booleans, and consider a union of required shapes when the component genuinely behaves differently (see discriminated props in Q2.3).

**Example:**

```tsx
interface ButtonProps {
  label: string;                     // required
  tone?: 'primary' | 'danger';       // optional, no default below → must be handled
  onClick?: () => void;              // optional, handled with `?.`
}

function Button({ label, tone = 'primary', onClick }: ButtonProps) {
  return <button type="button" className={`btn btn--${tone}`} onClick={onClick}>{label}</button>;
}
```

### Q1.4 — What is `readonly`, and what does it protect?

**Short answer:** `readonly` prevents assigning to a property after creation (and `ReadonlyArray<T>` prevents mutation methods). It is compile-time only — it makes intent explicit and stops accidental writes, not determined ones.

**Detailed explanation:** In React, `readonly` documents the rule "props are not yours to change" and catches the mistake at the API boundary: an array typed as `readonly Task[]` cannot be passed to something that calls `push`, which is exactly the feature that forces immutability through the codebase. Note the limits: it is shallow (a `readonly` object's nested object is still mutable) and it disappears at runtime.

**Example:**

```ts
interface Task {
  readonly id: string;                 // ids do not change
  title: string;
  readonly tags: readonly string[];    // no push/pop allowed
}

function TaskRow({ task }: { task: Task }) {
  // task.id = 'other';                // ❌ Cannot assign to 'id' because it is a read-only property
  // task.tags.push('urgent');         // ❌ Property 'push' does not exist on type 'readonly string[]'
  return <span>{task.title}</span>;
}
```

---

## 2. Typing React specifically

### Q2.1 — How do you type props without repeating yourself?

**Short answer:** Declare a `Props` interface/type next to the component and destructure with that type in the signature: `function Card({ title, children }: CardProps)`. Export the props type when consumers need it.

**Detailed explanation:** Avoid `React.FC` — it is not required, has a historical implicit `children`, and composes badly with generics; a plain function with a typed parameter is clearer and infers the return type correctly. Also open `strict: true` in `tsconfig.json`: without `strictNullChecks`, half of these guarantees vanish.

**Example:**

```tsx
export interface CardProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Card({ title, children, footer }: CardProps) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {children}
      {footer !== undefined && <footer>{footer}</footer>}
    </section>
  );
}

// ❌ Legacy style: implicit children, poorer error messages, extra indirection
// const Card: React.FC<CardProps> = ({ title, children }) => …
```

### Q2.2 — How do you type events and refs?

**Short answer:** Use `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`, `React.MouseEvent<HTMLButtonElement>`, and `useRef<HTMLInputElement | null>(null)`. Better: let TypeScript infer by writing the handler inline.

**Detailed explanation:** The generic parameter is the *element* type, which is why `event.target.value` exists on `ChangeEvent<HTMLInputElement>` but not on `ChangeEvent<HTMLDivElement>`. Inferring (writing the arrow function directly in `onChange`) is usually the best style — the fewest annotations and the best errors. For refs, React 19 requires an initial argument and function components accept `ref` as a normal prop (no `forwardRef`).

**Example:**

```tsx
function SearchField({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Named handlers with explicit types
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query.trim());
    inputRef.current?.focus();                 // ref.current is possibly null — hence `?.`
  };

  return (
    <form onSubmit={handleSubmit}>
      <input ref={inputRef} value={query} onChange={handleChange} aria-label="Search" />
      <button type="submit">Search</button>
    </form>
  );
}
```

### Q2.3 — What are discriminated (union) props and why are they better than optional props?

**Short answer:** Make variants explicit so TypeScript rejects impossible combinations: `type Props = { variant: 'link'; href: string } | { variant: 'button'; onClick: () => void }`.

**Detailed explanation:** With optional props you can pass `href` *and* `onClick` (or neither) and the compiler will not complain. With a discriminated union, the component's implementation narrows on `variant`, and callers get an error the moment they mix variants — a compile-time version of "make invalid states unrepresentable" (the same idea as the weather app's four-state union).

**Example:**

```tsx
type ActionProps =
  | { variant: 'link'; href: string; children: ReactNode }
  | { variant: 'button'; onClick: () => void; children: ReactNode; disabled?: boolean };

function Action(props: ActionProps) {
  if (props.variant === 'link') return <a href={props.href}>{props.children}</a>;   // narrowed here
  return <button type="button" onClick={props.onClick} disabled={props.disabled}>{props.children}</button>;
}

// <Action variant="link" onClick={fn} />   ❌ 'onClick' does not exist on the 'link' variant
```

### Q2.4 — How do you type a custom hook that returns a tuple?

**Short answer:** Return `[value, setValue] as const` so TypeScript infers a tuple (not an array), and document the API by naming the pieces the caller will destructure.

**Detailed explanation:** Without `as const`, `[value, setValue]` infers as `(T | Dispatch<...>)[]`, and destructuring gives you a union — the classic "TS2345" for a hook that looks fine. `as const` freezes the tuple order and keeps each element's own type. For hooks with more than three returns, prefer an object: named properties survive reordering and adding.

**Example:**

```ts
export function useToggle(initial = false): readonly [boolean, () => void, (next: boolean) => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((current) => !current), []);
  return [value, toggle, setValue] as const;      // ← without `as const`, destructuring types are wrong
}

const [open, toggleOpen, setOpen] = useToggle();
```

### Q2.5 — When do you need generics in a component or hook?

**Short answer:** When the component/hook must preserve the type of its input — a list that works for any item type, a form field bound to a key, a storage hook for any value.

**Detailed explanation:** Generics make "the same code, type-safe for many shapes" possible without `any`. The two places worth showing in an interview: a generic list component whose `renderItem` receives a correctly typed item, and a generic hook whose return type follows its argument. Also show that you know the alternative — sometimes a plain union or `unknown` plus a narrowing function is simpler than a type parameter.

**Example:**

```tsx
interface ListProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
  getKey: (item: T) => string;
}

export function List<T>({ items, renderItem, emptyMessage = 'Nothing here', getKey }: ListProps<T>) {
  if (items.length === 0) return <p>{emptyMessage}</p>;
  return <ul>{items.map((item, index) => <li key={getKey(item)}>{renderItem(item, index)}</li>)}</ul>;
}

// Usage — `task` is inferred as Task, `book` as Book; no annotations at the call site:
<List items={tasks} getKey={(task) => task.id} renderItem={(task) => <span>{task.title}</span>} />
<List items={books} getKey={(book) => book.isbn} renderItem={(book) => <span>{book.title}</span>} />
```

---

## 3. Narrowing, unions and runtime reality

### Q3.1 — How does narrowing work?

**Short answer:** Control-flow analysis: inside an `if`, `switch`, `typeof`, `in`, `instanceof` or an array `filter` type-predicate check, TypeScript refines the type of the value for that block.

**Detailed explanation:** Narrowing is why discriminated unions are so pleasant — after `if (state.status === 'error')`, `state.message` is available and `state.report` is not. The limits: narrowing is lost across function boundaries unless you use a type predicate or a discriminant, and asynchronous code does not re-narrow after `await` in the same way people expect.

**Example:**

```ts
type Result =
  | { status: 'success'; data: Task[] }
  | { status: 'error'; message: string };

function render(result: Result) {
  switch (result.status) {
    case 'success': return `${result.data.length} tasks`;      // narrowed
    case 'error': return `Failed: ${result.message}`;          // narrowed
    default: {
      const never: never = result;                             // exhaustiveness: a new variant breaks the build
      return never;
    }
  }
}

function isTask(value: unknown): value is Task {
  return typeof value === 'object' && value !== null && typeof (value as Task).id === 'string';
}
const tasks = (body as unknown[]).filter(isTask);              // the array's type narrows correctly here
```

### Q3.2 — `any` vs `unknown` vs `never`?

**Short answer:** `any` disables checking and spreads; `unknown` is "something, prove it first"; `never` is "no value is possible" (used for exhaustiveness and impossible branches).

**Detailed explanation:** At boundaries — `JSON.parse`, `catch`, third-party events — the honest type is `unknown` followed by a parse function; `any` is how a typo in a field name becomes a production incident. A good interview answer includes how you would *remove* an existing `any`: add a validation function, or use a library (Zod) when the shape is complicated.

**Example:**

```ts
// ❌ `any` silences the compiler and then travels through your code
const body = (await response.json()) as any;
console.log(body.temperatureC.toFixed(1));          // compiles, crashes at runtime

// ✅ `unknown` + a parse function: one place to fix when the API changes
function parseTemperature(body: unknown): number {
  if (typeof body !== 'object' || body === null) throw new Error('Malformed body');
  const value = (body as { temperatureC?: unknown }).temperatureC;
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error('Missing temperatureC');
  return value;
}

// `catch` gives `unknown` in strict mode — narrow before using it
try { await save(); } catch (cause) {
  const message = cause instanceof Error ? cause.message : 'Something went wrong';
  setError(message);
}
```

### Q3.3 — What does `strict: true` actually turn on?

**Short answer:** A bundle of strict checks: `strictNullChecks` (the big one), `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `alwaysStrict`, `useUnknownInCatchVariables`, and more.

**Detailed explanation:** The two flags that change day-to-day React code are `strictNullChecks` (every possibly-missing value must be handled — this is where `?.` and `??` come from) and `noImplicitAny` (untyped parameters are errors). Teams adopting strict mode in an existing codebase usually enable it file-by-file or add `noUncheckedIndexedAccess` later, because `array[0]` becomes `T | undefined`. Mentioning that flag is a strong signal: it is the difference between "checked" and "actually checked" for array access and record lookups.

**Example:**

```json
// tsconfig.json (the parts that matter for a React app)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,     // arr[0] is T | undefined — catches the classic off-by-one
    "exactOptionalPropertyTypes": true,   // "absent" and "present but undefined" are different
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,         // forces `import type` where only types are used
    "erasableSyntaxOnly": true            // forbids enums/parameter properties/namespaces (Node type stripping)
  }
}
```

### Q3.4 — How do you type an API response safely?

**Short answer:** Do not cast. Parse: fetch as `unknown`, validate the shape, and return a typed value or throw a typed error. Use Zod if the shape is non-trivial, and derive the TypeScript type from the schema (`z.infer`) so there is one source of truth.

**Detailed explanation:** `as MyType` is a promise to the compiler that it cannot verify — and APIs change, return partial objects on errors, and differ between environments. A parse function (or schema) turns "the UI shows `undefined°`" into "the boundary rejected the response with a clear message". Bonus talking point: deriving types from schemas means you cannot drift from the runtime check.

**Example:**

```ts
import { z } from 'zod';

const WeatherSchema = z.object({
  now: z.object({ city: z.string(), temperatureC: z.number(), description: z.string().default('Unknown') }),
  forecast: z.array(z.object({ date: z.string(), minC: z.number(), maxC: z.number(), description: z.string() })).max(5),
});

export type WeatherReport = z.infer<typeof WeatherSchema>;      // one source of truth: schema → type

export async function fetchWeather(city: string, signal?: AbortSignal): Promise<WeatherReport> {
  const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, { signal });
  if (!response.ok) throw new ApiError(`Weather service failed (${response.status})`, response.status);
  const parsed = WeatherSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('Malformed weather response', 502);   // a real, reportable failure
  return parsed.data;
}
```

---

## 4. Generics and utility types in practice

### Q4.1 — Which utility types do you actually use?

**Short answer:** `Partial<T>`, `Required<T>`, `Pick<T, K>`, `Omit<T, K>`, `Record<K, V>`, `ReturnType<typeof fn>`, `Parameters<typeof fn>`, `Awaited<T>`, `NonNullable<T>`, and `Readonly<T>`.

**Detailed explanation:** The interview answer is strongest when it is about *intent*: `Pick<Task, 'title' | 'assignee'>` says "a draft is the user-editable subset"; `Omit<Task, 'id'>` says "everything except the server-assigned id"; `Record<TaskStatus, string>` says "one label for every status, and a new status breaks the build". That last one is the most useful pair in React UI code — exhaustive maps.

**Example:**

```ts
interface Task { id: string; title: string; status: TaskStatus; assignee: string; points: number }

type TaskDraft = Pick<Task, 'title' | 'assignee' | 'points'>;     // what a form may submit
type TaskUpdate = Partial<TaskDraft>;                             // PATCH bodies
type TaskWithServerFields = Omit<Task, 'id'> & { id?: string };    // create payload

const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };
// Add a fourth status to TaskStatus → this line becomes a compile error until you label it. That is the point.

type LoadResult = Awaited<ReturnType<typeof fetchWeather>>;        // the type of the resolved value
```

### Q4.2 — How do you type generic constraints?

**Short answer:** `extends` restricts what a type parameter may be: `<T extends { id: string }>` guarantees the `id` field exists, so the function body can use it.

**Detailed explanation:** Constraints let a generic function use a *capability* while staying generic. In React, the common cases are "an item with an id" (for keys), "a value with a `toString`", and "a key of T" (`K extends keyof T`) for update helpers where the value type follows the key.

**Example:**

```ts
function updateAt<T extends { id: string }>(items: readonly T[], id: string, patch: Partial<T>): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function setField<T, K extends keyof T>(object: T, key: K, value: T[K]): T {
  return { ...object, [key]: value };
}

const task = { id: '1', title: 'Write', points: 3 };
const updated = setField(task, 'points', 5);      // ✅ value must be a number
// setField(task, 'points', 'five');              // ❌ Argument of type 'string' is not assignable to 'number'
```

### Q4.3 — What do you do with the `as` assertion, and when is it justified?

**Short answer:** Use it when you know more than the compiler and cannot express it otherwise — `as const` for literal types, `as unknown as X` in tests or when narrowing is impossible. Never use it to silence an error you do not understand, and never at an API boundary.

**Detailed explanation:** Assertions are unchecked: the compiler trusts you. The safe alternatives are type predicates, discriminated unions, parse functions, and `satisfies` (which checks a value against a type *without* widening it). `as const` is the harmless, extremely common case — it turns a literal into a literal type, which is what makes `['tasks', 'list']` a stable query key.

**Example:**

```ts
const taskKeys = {
  all: ['tasks'] as const,
  list: () => [...taskKeys.all, 'list'] as const,           // readonly ['tasks', 'list']
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

const config = {
  retries: 2,
  mode: 'test',
} satisfies { retries: number; mode: 'test' | 'prod' };    // checked, but `mode` stays the literal 'test'
```

### Q4.4 — How do you type third-party or DOM values you do not control?

**Short answer:** Wrap them: declare a module augmentation, a minimal interface for the part you use, or convert at the boundary with a parse. Do not spread `any` from a library through your app.

**Detailed explanation:** Examples that come up: `window` extensions (adding `window.__APP_CONFIG__`), a library that ships no types (`declare module 'thing'`), and event payloads from a socket. The discipline is the same as API parsing: one adapter that returns your types, so the rest of the app never sees the foreign shape.

**Example:**

```ts
// global.d.ts
declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl: string; release: string };
  }
}
export {};                                     // makes the file a module so `declare global` works

// One adapter reads it, with a default when it is absent (tests, local dev)
export const appConfig = {
  apiUrl: window.__APP_CONFIG__?.apiUrl ?? '/api',
  release: window.__APP_CONFIG__?.release ?? 'dev',
};

// Untyped package:
// types/thing.d.ts
declare module 'thing' {
  export function createThing(options: { size: number }): { resize(size: number): void };
}
```

---

## 5. Decoding the errors you will actually see

| Error | Message (shortened) | What it usually means | Fix |
| --- | --- | --- | --- |
| `TS2322` | Type 'X' is not assignable to type 'Y' | a value of the wrong type reached a slot that expects another | read both types; adapt the value (`String()`, `Number()`, `??`), or widen the target honestly |
| `TS2339` | Property 'x' does not exist on type 'Y' | typo, or the type does not carry that field (often `unknown`/a union) | narrow first, or fix the model |
| `TS2345` | Argument of type 'X' is not assignable to parameter of type 'Y' | the callback/shape does not match | check optional/required fields and the element type of events |
| `TS7006` | Parameter 'x' implicitly has an 'any' type | an untyped callback parameter with `noImplicitAny` | annotate, or let the context infer (e.g. write the handler inline) |
| `TS7053` | Element implicitly has an 'any' type because expression of type 'string' can't index type | indexing an object with an arbitrary string | `Record<K, V>`, `keyof`, or narrow the key |
| `TS18048` | 'x' is possibly 'undefined' | `strictNullChecks` doing its job | handle it (`?.`, default, early return, or narrow) |
| `TS2532` | Object is possibly 'undefined' | same as above for an object | same |
| `TS2554` | Expected N arguments, but got M | a signature changed (React 19's `useRef` requires an argument) | pass the argument (often `null`) |
| `TS2786` | 'X' cannot be used as a JSX component | the return type is wrong (often `Promise<JSX>` from an `async` component) | components must return elements, not promises |
| `TS6133` | 'x' is declared but its value is never read | unused import/variable (`noUnusedLocals`) | delete it — in this repo it fails the production build, deliberately |
| `TS1294` | This syntax is not allowed when 'erasableSyntaxOnly' is enabled | an `enum`, `namespace`, or constructor parameter property | use a union, plain object, or explicit field |
| `TS5101` | Option 'baseUrl' is deprecated | old tsconfig with new TS | use `paths` without `baseUrl` |
| `TS17004` | Cannot use JSX unless the '--jsx' flag is provided | `.tsx` compiled without the JSX setting | set `"jsx": "react-jsx"` |
| `TS17008` | JSX element 'X' has no corresponding closing tag | mismatched tags | fix the markup (the error points at the opening tag) |
| `TS1005` | '…' expected | syntax error, frequently a stray `>` or missing `)` in JSX | look one line above the caret |

**The meta-answer for any TS error in an interview:** read it inside-out. The outermost sentence names the relationship ("not assignable"); the quoted types name the two sides; the caret names the position. Most React-related type errors are one of three things: a `null`/`undefined` you did not handle, a callback whose parameter types do not match the expected signature, or a value that is `string` where the model says `number` (usually from an input's `value`).

---

## 6. Rapid-fire round

| # | Question | One-line answer |
| --- | --- | --- |
| 1 | Does TypeScript check anything at runtime? | No — types are erased; runtime checks need code (schemas, guards) |
| 2 | What is `satisfies`? | checks a value against a type without widening it to that type |
| 3 | `keyof Task` for `{ id: string; title: string }`? | `'id' \| 'title'` |
| 4 | `T[K]`? | an indexed access type — the type of property `K` on `T` |
| 5 | What is a mapped type? | `{ [K in keyof T]: … }` — transform every property |
| 6 | What does `Readonly<T>` do? | makes every top-level property readonly (shallow) |
| 7 | `Partial<T>` on nested objects? | only one level — nested objects stay required |
| 8 | `Omit<T, 'id'>` and `Pick<T, 'a'>`? | the two halves of "subset of properties" |
| 9 | Why `import type`? | erased at build time, so types never create runtime imports or circular deps |
| 10 | What is declaration merging? | interfaces with the same name combine (used to augment libraries) |
| 11 | `noUncheckedIndexedAccess` effect? | `arr[0]` becomes `T \| undefined` — catches real bugs, needs handling |
| 12 | How do you type `JSON.parse`? | as `unknown`, then parse/validate — never `as` |
| 13 | `as const` on an array? | gives a `readonly` tuple of literal types |
| 14 | Type predicate syntax? | `function isTask(value: unknown): value is Task` |
| 15 | What is `never` used for in React code? | exhaustiveness checks in switches over unions |
| 16 | Does `enum` work with `erasableSyntaxOnly`? | no — use a union of literals or an `as const` object |
| 17 | How do you type a context value? | an explicit interface + a `null` default + a `useX()` hook that throws when unset |
| 18 | Why is `React.FC` discouraged? | not required, implicit `children` historically, poor generic support |
| 19 | How do you type `children`? | `ReactNode` (JSX, strings, arrays, `null`) — or `ReactElement` for exactly one element |
| 20 | What does `verbatimModuleSyntax` do? | requires `import type` where only types are used, so output stays predictable |

---

## 7. Summary — typing React well, in six rules

1. **Types exist to prevent a specific bug.** If a type cannot be described as "this stops me from…", it is decoration — delete it.
2. **Make invalid states unrepresentable.** Discriminated unions for request states and component variants beat a pile of optional props (`loading` + `error` + `data` can all be set; a union cannot).
3. **Parse at the boundary.** `unknown` in, validated type out — never `as` on an API response, and never `any` at a boundary.
4. **Let inference work.** Write handlers inline, export props types, avoid `React.FC`, and reach for annotations where they add information (public APIs, hooks, complex callbacks).
5. **Know the two structural limits**: `strictNullChecks` for missing values and `noUncheckedIndexedAccess` for missing array items — the flags that turn "the types compile" into "the code is safe".
6. **Quote your errors.** `TS2322` from a string/`number` mismatch after a form submit, `TS18048` from `ref.current`, `TS1294` from a constructor parameter property under `erasableSyntaxOnly` — real errors from real projects are the most convincing answers you can give.

---

**What's next →** [`scenario-based-questions.md`](./scenario-based-questions.md) is the file interviewers actually enjoy: "why is my component rendering twice?", "why is my API called repeatedly?", "the state does not update immediately", "how would you structure a large app?", "would you use Context or Redux?" — each answered as a diagnosis, with the fix and the reasoning.
