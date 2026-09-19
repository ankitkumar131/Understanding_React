# 04 — Type Aliases

> **Part 2 · TypeScript · File 4 of 11**
>
> **Why this file exists:** file 3 gave you `interface` for object shapes. But
> unions, tuples, function types, primitives and "types computed from other types"
> cannot be interfaces. Those are **type aliases** — and they are everywhere in
> React code (`type Props = ...`, `type Status = 'idle' | 'loading'`,
> `type Handler = (e: React.FormEvent) => void`).

---

## 1. What a type alias is

A **type alias** gives a name to *any* type.

```ts
type UserId = string;
type Status = 'idle' | 'loading' | 'success' | 'error';
type Point = { x: number; y: number };
type Coordinates = [number, number];
type Handler = (event: React.MouseEvent) => void;
type UserMap = Record<string, User>;
```

Read `type Name = ...` as: "`Name` is another way of writing `...`."

```ts
type UserId = string;

function getUser(id: UserId) { /* ... */ }

getUser('u1');        // ✅
// getUser(1);        // ❌ TS2345: Argument of type 'number' is not assignable to
                      //           parameter of type 'string'
```

Aliases exist for three reasons:

1. **Readability** — `UserId` documents intent; `string` does not.
2. **Single source of truth** — change the alias once, and every usage follows.
3. **Composition** — you can build new types *from* other types
   (`type Partial<User>`, `type Keys = keyof User`), which is where TypeScript
   starts to feel powerful.

> 💡 **A type alias is not a new type at runtime**, and it is **not** a distinct
> type in the type system either. `type UserId = string` is exactly `string`;
> TypeScript will happily let you pass any other `string` where a `UserId` is
> expected. (That "branded types" trick exists precisely to work around this, and
> is out of scope here.)

---

## 2. Unions — the most important thing aliases do

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';
```

This means: "a `Status` is exactly one of those four strings — nothing else."

```ts
let status: Status = 'idle';       // ✅
status = 'loading';                // ✅
// status = 'done';                // ❌ TS2322: Type '"done"' is not assignable to type 'Status'
```

**Why this is one of the highest-value lines of TypeScript you will write in
React:**

```tsx
type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User[] }
  | { status: 'error'; error: Error };
```

Read that again: **`data` only exists in the success case**, and **`error` only
exists in the error case**. The compiler will refuse to let you read
`state.data` without first checking `state.status === 'success'`. That is
impossible to get subtly wrong, in a way that a `{ isLoading: boolean; error: Error | null; data: User[] | null }` object is very easy to get wrong (all four
combinations are representable, including nonsensical ones).

You will build this exact pattern in Part 7 for API calls. File 5 goes deeper on
unions; file 9 covers the narrowing that makes them usable.

### Union of literals from a value

```ts
const TABS = ['overview', 'activity', 'settings'] as const;
type Tab = (typeof TABS)[number];        // 'overview' | 'activity' | 'settings'

// Or from an object's values
const STATUS = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
} as const;
type Status = (typeof STATUS)[keyof typeof STATUS];   // 'idle' | 'loading' | 'error'
```

The advantage over writing the union by hand: **the runtime value and the type can
never drift apart.** Add `'archived'` to the `TABS` array and `Tab` updates
automatically — and every `switch` that no longer covers all cases becomes a
compile error (the `never` tripwire from file 2).

---

## 3. Tuples and function types

```ts
// Tuples
type Coordinates = [number, number];
type KeyValue = [key: string, value: string];
type Range = [min: number, max?: number];       // optional second element
type Variadic = [first: string, ...rest: number[]];

// Function types
type Handler = () => void;
type Formatter = (value: number) => string;
type Predicate<T> = (value: T) => boolean;              // uses a generic (file 7)
type AsyncHandler<T> = (input: T) => Promise<void>;
type EventHandler<E extends React.SyntheticEvent> = (event: E) => void;
```

**Function types as aliases are the trick to keeping props readable:**

```tsx
// ❌ Noisy: the callback type is written inline twice
interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
}

// ✅ Named handlers document intent and are reusable across components
type ToggleTodo = (id: string, done: boolean) => void;
type DeleteTodo = (id: string) => void;
type EditTodo = (id: string, title: string) => void;

interface TodoListProps {
  todos: Todo[];
  onToggle: ToggleTodo;
  onDelete: DeleteTodo;
  onEdit: EditTodo;
}
```

The named version also gives you a better error message: "Argument of type `(id: string) => void` is not assignable to parameter of type `ToggleTodo`" names your
concept instead of dumping a signature.

---

## 4. Aliases for primitives and domain concepts

This is underused and highly valuable: aliases make your code speak your domain.

```ts
// ❌ Everything is a string; nothing prevents mixing them up
function transfer(from: string, to: string, amount: number) { /* ... */ }
transfer(accountId, userId, 100);    // compiles, and is nonsense

// ✅ Names say what they are
type UserId = string;
type AccountId = string;
type Money = number;         // in paise, always
type IsoDateString = string; // 'YYYY-MM-DDTHH:mm:ss.sssZ'

function transfer(from: AccountId, to: AccountId, amount: Money) { /* ... */ }

// Still compiles (aliases of the same primitive are interchangeable)...
transfer(accountId, userId, 100);
// ...but now the signature DOCUMENTS what it wants, and reviewers catch it.
// For hard enforcement you need branded types — an advanced technique.
```

```ts
// A very common React example: typed ids in routes and props
type ProductId = string;
type OrderId = string;

interface Props {
  productId: ProductId;
  onSelect: (orderId: OrderId) => void;
}
```

> 💡 **A good alias name is a sentence fragment**: `IsoDateString`,
> `MinorUnits`, `SortDirection`, `TodoId`. If the alias is `Str` or `Num`, it adds
> nothing — delete it.

---

## 5. Composing aliases

```ts
type User = {
  id: UserId;
  name: string;
  email: string;
};

// Build new types from existing ones
type UserList = User[];
type UserMap = Record<UserId, User>;
type UserName = User['name'];                    // indexed access: 'string'
type UserKeys = keyof User;                      // 'id' | 'name' | 'email'
type Patch<T> = (changes: Partial<T>) => void;
type NewUser = Omit<User, 'id'>;                 // utility type (file 10)
type Maybe<T> = T | null;
type NullableUser = Maybe<User>;

// Discriminated unions built from smaller pieces — the workhorse pattern
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type Paged<T> = {
  items: T[];
  page: number;
  totalPages: number;
};

type UserPage = Paged<User>;
```

**`User['name']` (indexed access)** is worth noticing: it extracts the type of a
property. So `type UserName = User['name']` is `string`, and `User['address']['city']`
would reach into a nested shape. Combined with `keyof`, it lets you write types
that automatically follow changes to the source:

```ts
type SortKey = keyof User;                       // 'id' | 'name' | 'email'
type SortDirection = 'asc' | 'desc';
type SortState = { key: SortKey; direction: SortDirection };

// Add a field to User and SortKey grows automatically — no drift, no copy-paste.
```

---

## 6. `interface` vs `type`: how to choose

Both can describe an object:

```ts
interface UserI {
  id: number;
  name: string;
}

type UserT = {
  id: number;
  name: string;
};
```

These are almost interchangeable. The real differences:

| | `interface` | `type` |
| --- | --- | --- |
| Object shapes | ✅ | ✅ |
| Union (`A \| B`) | ❌ can't declare, but can `extends` a union alias | ✅ |
| Tuple | ❌ | ✅ |
| Primitive alias | ❌ | ✅ |
| Function type | ❌ (can describe a callable object, awkwardly) | ✅ |
| Mapped/conditional types | ❌ | ✅ |
| `extends` (inheritance) | ✅ clean | ✅ via intersection `&`, less clean |
| Implements a class | ✅ | ✅ (object types only) |
| Declaration merging | ✅ same-name interfaces merge | ❌ duplicate name is an error |
| Recursive types | ✅ | ✅ |
| Error messages | shows the interface name | often inlines the whole union |
| Performance in huge codebases | slightly better for interfaces | can be slower for deeply nested compositions |

### The rule that most React codebases follow

```text
Object / props shapes                         → interface
Unions, tuples, primitives, function types,
mapped/conditional/utility results            → type
Either works and it's a team preference       → be consistent, don't mix styles per file
```

Applied:

```tsx
// props: interface
interface UserCardProps {
  user: User;
  onFollow: (id: UserId) => void;
}

// data model: interface (it is an object)
interface User {
  id: UserId;
  name: string;
}

// union: type
type Status = 'idle' | 'loading' | 'success' | 'error';

// tuple: type
type Coordinates = [number, number];

// function: type
type FollowHandler = (id: UserId) => void;

// derived/utility: type
type UserUpdate = Partial<Omit<User, 'id'>>;
```

### Declaration merging: the one real "gotcha"

```ts
interface Window {
  myGlobal: string;      // merges into the existing Window interface
}

// Now `window.myGlobal` is typed. (This is how library authors augment types.)

interface Window {
  anotherGlobal: number; // a SECOND declaration with the same name merges
}
```

```ts
type Config = { a: number };
// type Config = { b: string };   // ❌ TS2300: Duplicate identifier 'Config'
```

Merging is useful for augmenting library/global types, and dangerous when it
happens by accident — two files declaring `interface Props` in the **same module
scope** would merge silently. (In separate files, each file is its own module, so
this does not happen. It only bites in `.d.ts` files and other global scopes.)

---

## 7. Type aliases in React

### 7.1 Component props — either is fine

```tsx
// interface style (most common in React docs and codebases)
interface ButtonProps {
  label: string;
  onClick: () => void;
}

// type style (equally valid; common in newer codebases)
type ButtonProps = {
  label: string;
  onClick: () => void;
};
```

Both give identical autocomplete and identical error messages for props. Pick one.

### 7.2 Unions for state and variants

```tsx
type Theme = 'light' | 'dark';
type Size = 'sm' | 'md' | 'lg';
type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: Size;
}
```

### 7.3 Discriminated unions for component state

```tsx
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function UserPanel({ state }: { state: RequestState<User[]> }) {
  switch (state.status) {
    case 'idle':
      return <p>Nothing loaded yet.</p>;
    case 'loading':
      return <p>Loading…</p>;
    case 'success':
      return <p>{state.data.length} users</p>;      // ✅ `data` exists here
    case 'error':
      return <p role="alert">{state.error.message}</p>; // ✅ `error` exists here
    default: {
      const unreachable: never = state;             // tripwire (file 2)
      return unreachable;
    }
  }
}
```

This one pattern removes an entire class of React bugs: "we rendered the success
branch while `data` was still null".

### 7.4 Typed event handlers

```tsx
type ChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) => void;
type SubmitHandler = (event: React.FormEvent<HTMLFormElement>) => void;
type ClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => void;
type KeyHandler = (event: React.KeyboardEvent<HTMLInputElement>) => void;
```

### 7.5 Utility type results

```tsx
type CreateUserInput = Omit<User, 'id' | 'createdAt'>;
type UserPatch = Partial<CreateUserInput>;
type UserFormErrors = Partial<Record<keyof CreateUserInput, string>>;
```

Notice how these compose: `Omit` → `Partial` → `Record`. **Add a field to `User`
and every one of these updates automatically.** File 10 covers the utility types
themselves.

---

## 8. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `type User = interface` confusion | Syntax error | `type User = { ... }` needs the `=` |
| Redeclaring the same alias twice | `TS2300: Duplicate identifier` | merge into one declaration (interfaces would merge silently — which is worse) |
| Using `type` for a union and then trying `extends` | confusing errors | intersect instead: `type A = B & C` |
| Expecting aliases to enforce domain rules | `UserId` and `string` are interchangeable | branded types, or accept that it is documentation |
| Huge inline unions repeated in five files | Drift as one copy changes | define the alias once, import it |
| `type Status = string` | No safety at all | union of literals: `'idle' \| 'loading'` |
| Aliases named `Str`, `Obj`, `T2` | Adds noise, no information | delete it or name the concept |
| Confusing `keyof T` with `T[keyof T]` | Error mentions the wrong union | `keyof` = keys, `[keyof]` = values (file 2, section 2) |
| Aliasing inside a function and re-declaring it | `Duplicate identifier` | types are module-scoped; declare at the top level |
| Forgetting `as const` when deriving a union from a value | The union becomes `string` | `as const` first |

---

## 9. Practice exercises

### Beginner

Write the type aliases, then fix each error.

```ts
// 1. A status that is one of four strings
// 2. A pair of numbers as a tuple
// 3. A function that takes a string and returns nothing
// 4. A user id that is a string, but named for what it is
// 5. The union of keys of an object: { id: string; title: string; done: boolean }
```

Then explain each error:

```ts
type Status = 'idle' | 'loading' | 'error';
let s: Status = 'done';

type Handler = (value: string) => void;
const h: Handler = (value: number) => console.log(value);

type Point = [number, number];
const p: Point = [1, 2, 3];

type UserId = string;
const id: UserId = 42;
```

**Solution**

```ts
// 1
type Status = 'idle' | 'loading' | 'error';

// 2
type Pair = [number, number];

// 3
type Notifier = (message: string) => void;

// 4
type UserId = string;

// 5
type Todo = { id: string; title: string; done: boolean };
type TodoKey = keyof Todo;               // 'id' | 'title' | 'done'
// and the values:
type TodoValue = Todo[keyof Todo];       // string | boolean
```

**The errors, explained:**

```text
let s: Status = 'done';
  TS2322: Type '"done"' is not assignable to type 'Status'.
  → The union lists exactly three allowed strings. This is the error doing its job.

const h: Handler = (value: number) => console.log(value);
  TS2322: Type '(value: number) => void' is not assignable to type '(value: string) => void'.
    Types of parameters 'value' and 'value' are incompatible.
      Type 'string' is not assignable to type 'number'.
  → Parameter types must be COMPATIBLE, not identical. A handler that demands a
    number cannot be used where a string will be supplied.

const p: Point = [1, 2, 3];
  TS2322: Source has 3 element(s), but target allows only 2.
  → Tuples are fixed-length. This is why tuples are good for positional data.

const id: UserId = 42;
  TS2322: Type 'number' is not assignable to type 'string'.
  → An alias of `string` IS `string`. It documents intent; it does not create a
    separate type.
```

### Intermediate

Refactor a **loosely typed todo app's type layer**. Start with this (which
compiles but gives no safety), and produce a properly aliased version:

```ts
// BEFORE — everything is string / any
interface Todo {
  id: string;
  title: string;
  status: string;        // any string at all
  priority: string;
  dueDate: string | null;
  tags: string[];
  assignee: any;         // whatever
}

function createTodo(input: any): Todo { /* ... */ }
function filterTodos(todos: any[], filter: string): any[] { /* ... */ }
function sortTodos(todos: any[], key: string): any[] { /* ... */ }
```

Requirements:

1. `TodoStatus` = `'todo' | 'open' | 'done' | 'archived'`, `Priority` =
   `'low' | 'normal' | 'high' | 'urgent'`.
2. `Assignee` is an object `{ id: string; name: string; avatarUrl?: string }` —
   or `null` when unassigned.
3. `SortKey` must be derived from `Todo` (`keyof Todo`), and `SortDirection` is
   `'asc' | 'desc'`.
4. `Filter` is a discriminated union supporting
   `{ kind: 'all' }`, `{ kind: 'status'; status: TodoStatus }`,
   `{ kind: 'tag'; tag: string }`, `{ kind: 'assignee'; assigneeId: string }`,
   `{ kind: 'overdue'; asOf: string }`.
5. `createTodo(input: NewTodoInput)` where `NewTodoInput` requires `title` and
   optional everything else, and returns a fully-populated `Todo`. Generate the id
   and default the status/priority/tags.
6. `filterTodos(todos: readonly Todo[], filter: Filter): Todo[]` — a `switch` on
   `filter.kind` with an exhaustiveness check.
7. `sortTodos(todos: readonly Todo[], key: SortKey, direction: SortDirection): Todo[]`
   — must not mutate the input.
8. `describeTodo(todo: Todo): string`.
9. Demonstrate every "impossible" state being rejected at compile time in a
   trailing comment block.

**Solution**

```text
ts-playground/src/todo-types.ts
```

```ts
export {};   // standalone script: this file has no imports, so make it a module

// ---------------------------------------------------------------- primitives & unions
type TodoId = string;
type TodoStatus = 'todo' | 'open' | 'done' | 'archived';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type SortDirection = 'asc' | 'desc';
type IsoDateString = string; // 'YYYY-MM-DD'

// ---------------------------------------------------------------- models
interface Assignee {
  id: string;
  name: string;
  avatarUrl?: string | undefined;
}

interface Todo {
  id: TodoId;
  title: string;
  status: TodoStatus;
  priority: Priority;
  dueDate: IsoDateString | null;   // null = no deadline
  tags: string[];
  assignee: Assignee | null;       // null = unassigned
  createdAt: IsoDateString;
}

// Derived from Todo, so it can never drift out of sync
type SortKey = keyof Todo;

// A discriminated union: each variant carries only the data it needs
type Filter =
  | { kind: 'all' }
  | { kind: 'status'; status: TodoStatus }
  | { kind: 'tag'; tag: string }
  | { kind: 'assignee'; assigneeId: string }
  | { kind: 'overdue'; asOf: IsoDateString };

// Input shape for creation: id/createdAt are generated, everything else optional
interface NewTodoInput {
  title: string;
  status?: TodoStatus | undefined;
  priority?: Priority | undefined;
  dueDate?: IsoDateString | null;
  tags?: string[];
  assignee?: Assignee | null;
}

// ---------------------------------------------------------------- operations
const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// Used correctly by topPriority() below — and forgotten by sortTodos(). See the note.
const isHigherPriority = (a: Priority, b: Priority): boolean =>
  PRIORITY_ORDER[a] < PRIORITY_ORDER[b];

let idCounter = 0;
const nextTodoId = (): TodoId => `t${++idCounter}`;

function createTodo(input: NewTodoInput): Todo {
  const title = input.title.trim();
  if (title === '') {
    throw new Error('Todo title is required');
  }

  return {
    id: nextTodoId(),
    title,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'normal',
    dueDate: input.dueDate ?? null,
    tags: input.tags ? [...input.tags] : [],   // copy: never share the caller's array
    assignee: input.assignee ?? null,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function isOverdue(todo: Todo, asOf: IsoDateString): boolean {
  if (todo.dueDate === null) return false;
  if (todo.status === 'done' || todo.status === 'archived') return false;
  return todo.dueDate < asOf;                  // ISO dates compare correctly as strings
}

function filterTodos(todos: readonly Todo[], filter: Filter): Todo[] {
  switch (filter.kind) {
    case 'all':
      return [...todos];
    case 'status':
      return todos.filter((todo) => todo.status === filter.status);
    case 'tag':
      return todos.filter((todo) => todo.tags.includes(filter.tag));
    case 'assignee':
      return todos.filter((todo) => todo.assignee?.id === filter.assigneeId);
    case 'overdue':
      return todos.filter((todo) => isOverdue(todo, filter.asOf));
    default: {
      // Exhaustiveness tripwire: adding a new Filter variant breaks the build here.
      const unreachable: never = filter;
      return unreachable;
    }
  }
}

function sortTodos(todos: readonly Todo[], key: SortKey, direction: SortDirection = 'asc'): Todo[] {
  const sign = direction === 'asc' ? 1 : -1;

  // Copy first: `sort` mutates, and the input is readonly by contract.
  return [...todos].sort((a, b) => {
    const left = a[key];
    const right = b[key];

    // Nested objects (assignee) are compared by their sortable field.
    if (key === 'assignee') {
      const leftName = a.assignee?.name ?? '';
      const rightName = b.assignee?.name ?? '';
      return sign * leftName.localeCompare(rightName);
    }

    // null sorts last, in both directions
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return left === null ? 0 : -1;

    if (typeof left === 'number' && typeof right === 'number') {
      return sign * (left - right);
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      return sign * left.join(',').localeCompare(right.join(','));
    }
    return sign * String(left).localeCompare(String(right));
  });
}

function topPriority(todos: readonly Todo[]): Todo | undefined {
  return todos
    .filter((todo) => todo.status !== 'done' && todo.status !== 'archived')
    .reduce<Todo | undefined>(
      (best, todo) =>
        best === undefined || isHigherPriority(todo.priority, best.priority) ? todo : best,
      undefined
    );
}

function describeTodo(todo: Todo): string {
  const owner = todo.assignee ? todo.assignee.name : 'unassigned';
  const due = todo.dueDate ? `due ${todo.dueDate}` : 'no due date';
  return `[${todo.priority}] ${todo.title} — ${todo.status}, ${owner}, ${due}`;
}

// ---------------------------------------------------------------- demo
function main(): void {
  const ada: Assignee = { id: 'u1', name: 'Ada' };
  const grace: Assignee = { id: 'u2', name: 'Grace' };

  const todos: readonly Todo[] = [
    createTodo({ title: 'Write type aliases', priority: 'high', assignee: ada, dueDate: '2026-09-10', tags: ['docs'] }),
    createTodo({ title: 'Review PR', priority: 'urgent', assignee: grace, dueDate: '2026-09-25' }),
    createTodo({ title: 'Ship it', status: 'done', priority: 'low', tags: ['release'] }),
    createTodo({ title: 'Plan next sprint', assignee: ada, dueDate: '2026-09-30', tags: ['docs', 'planning'] }),
  ];

  console.log('--- filters ---');
  console.log('all:', filterTodos(todos, { kind: 'all' }).length);                        // 4
  console.log('done:', filterTodos(todos, { kind: 'status', status: 'done' }).length);   // 1
  console.log('tag docs:', filterTodos(todos, { kind: 'tag', tag: 'docs' }).length);     // 2
  console.log('assignee u1:', filterTodos(todos, { kind: 'assignee', assigneeId: 'u1' }).length); // 2
  console.log('overdue:', filterTodos(todos, { kind: 'overdue', asOf: '2026-09-19' })
    .map((todo) => todo.title));                                                          // [ 'Write type aliases' ]

  console.log('\n--- sorting ---');
  console.log('by priority:', sortTodos(todos, 'priority').map((t) => t.priority));
  console.log('by dueDate:', sortTodos(todos, 'dueDate').map((t) => t.dueDate));
  console.log('by title desc:', sortTodos(todos, 'title', 'desc').map((t) => t.title));

  console.log('\n--- top priority (uses PRIORITY_ORDER correctly) ---');
  const next = topPriority(todos);
  console.log('  ', next ? describeTodo(next) : 'nothing to do 🎉');

  console.log('\n--- describe ---');
  for (const todo of todos) console.log(' ', describeTodo(todo));

  console.log('\n--- immutability check ---');
  const before = todos.map((t) => t.id).join(',');
  sortTodos(todos, 'title');
  console.log('input order unchanged:', todos.map((t) => t.id).join(',') === before); // true
}

main();
```

**Expected output**

```text
--- filters ---
all: 4
done: 1
tag docs: 2
assignee u1: 2
overdue: [ 'Write type aliases' ]

--- sorting ---
by priority: [ 'high', 'low', 'normal', 'urgent' ]
by dueDate: [ '2026-09-10', '2026-09-25', '2026-09-30', null ]
by title desc: [ 'Write type aliases', 'Ship it', 'Review PR', 'Plan next sprint' ]

--- top priority (uses PRIORITY_ORDER correctly) ---
   [urgent] Review PR — todo, Grace, due 2026-09-25

--- describe ---
  [high] Write type aliases — todo, Ada, due 2026-09-10
  [urgent] Review PR — todo, Grace, due 2026-09-25
  [low] Ship it — done, unassigned, no due date
  [normal] Plan next sprint — todo, Ada, due 2026-09-30

--- immutability check ---
input order unchanged: true
```

> ⚠️ **Look closely at the priority sort: `[ 'high', 'low', 'normal', 'urgent' ]`.**
> That is *alphabetical*, not by importance. `sortTodos` falls through to its
> generic `String(left).localeCompare(String(right))` branch, so `PRIORITY_ORDER`
> — the whole point of that constant — is never consulted. **This is a genuine bug
> in this solution**, left in deliberately because it is such a realistic one: the
> types are perfect, the code compiles, the tests you would think to write
> ("does it return all four?") pass, and the output is still wrong.
>
> Two things make this bug instructive:
>
> 1. **`topPriority()` right below uses `PRIORITY_ORDER` correctly** and returns
>    `[urgent] Review PR` — proof that the constant is right and only one code path
>    forgot it. This is exactly how such bugs survive review: the reviewer sees the
>    constant being used and assumes it is used everywhere.
> 2. **The types cannot save you.** `priority` is a four-member union; the compiler
>    is satisfied. Types describe **shapes**, not **business rules**.
>
> The fix is one branch, placed before the generic comparison:
>
> ```ts
> if (key === 'priority') {
>   return sign * (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
> }
> // …then the existing assignee / null / number / array / string branches
> ```
>
> With that branch, the output becomes `[ 'urgent', 'high', 'normal', 'low' ]`.
> A test asserting the order (Part 13) would have caught it in seconds — which is
> the real lesson: **write a test for every rule your type cannot express.**
>
> One more detail worth noticing in the verified output: `by dueDate` puts `null`
> **last** (`[ '2026-09-10', '2026-09-25', '2026-09-30', null ]`), because the
> `left === null → 1` branch is not multiplied by `sign`. That is a deliberate
> choice — "no deadline" sorting last is usually what you want in both directions —
> but note it makes the comparator *inconsistent* for descending sorts, so if you
> need nulls first when descending, handle the direction explicitly.

**Why this refactor is a real improvement**

- **The union types make invalid states unrepresentable.** `status: 'finish'` and
  `priority: 'medium'` are compile errors now, where before any string was
  accepted and only the database would complain.
- **`NewTodoInput` vs `Todo`** separates "what a caller provides" from "what the
  system stores". That distinction is the backbone of every API layer (Part 7).
- **`Filter` is a discriminated union**: each variant carries only what it needs,
  and `switch (filter.kind)` is exhaustiveness-checked.
- **`SortKey = keyof Todo`** means adding a field to `Todo` makes it sortable for
  free — and if a `switch` needed updating, the compiler would say so.
- **`readonly Todo[]` inputs with copies on output** guarantees callers' arrays are
  never mutated, which is exactly what React state requires (Part 1, file 6).

---

## 10. Summary

- `type Name = ...` aliases **any** type: objects, unions, tuples, primitives,
  functions, and computed types.
- **Unions of literals** (`'idle' | 'loading' | 'error'`) are the highest-value
  aliases you will write.
- **Discriminated unions** let you make invalid states unrepresentable — the
  single best tool for typed component state.
- Aliases for **primitives** (`UserId`, `IsoDateString`) document intent; they do
  not enforce it.
- **Compose** aliases: `keyof`, indexed access (`User['name']`), `Partial`,
  `Omit`, `Record`. Adding a field to the source type propagates everywhere.
- **`interface` for object/props shapes, `type` for everything else.** Be
  consistent; the difference rarely matters, but declaration merging does.
- **Types describe shapes, not rules** — the priority-sort bug above is the proof.

**What's next →** [`05-union-intersection.md`](./05-union-intersection.md): unions
and intersections in depth — discriminated unions, exhaustive switches, and how to
model "one of these" versus "all of these".
