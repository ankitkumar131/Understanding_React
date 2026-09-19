# 10 — Utility Types

> **Part 2 · TypeScript · File 10 of 11**
>
> **Why this file exists:** utility types are how you avoid writing the same shape
> twice. In React they appear everywhere — `Partial<Props>`, `Omit<ComponentProps<'button'>, 'children'>`,
> `ReturnType<typeof useAuth>`, `Record<Status, Config>` — and understanding the
> **mapped types** behind them lets you build your own (`Optional<T, K>`,
> `DeepPartial<T>`, `DistributiveOmit<T, K>`) when the built-ins run out.

---

## 1. Derive, don't duplicate

The problem utility types solve:

```ts
interface Product {
  id: string;
  sku: string;
  name: string;
  priceMinor: number;
  status: 'draft' | 'live' | 'archived';
}

// ❌ Hand-written "same thing, but for a form" — and now it can drift
interface ProductDraft {
  sku: string;
  name: string;
  priceMinor: number;
  status: 'draft' | 'live' | 'archived';   // if Product gains 'scheduled', this is stale
}

// ✅ Derived: it cannot drift, because there is only one definition
type ProductDraft = Omit<Product, 'id'>;
```

**The rule:** two types that describe the same data will eventually disagree. Derive
one from the other, and the compiler keeps them in sync — the same "single source of
truth" discipline as the enums file, applied to types.

---

## 2. The object shapers

```ts
interface Order {
  id: string;
  status: 'open' | 'paid';
  totalMinor: number;
  note?: string;
  items?: string[];
}

type AllOptional   = Partial<Order>;             // every property optional
type AllRequired   = Required<Order>;            // every property required
type Immutable     = Readonly<Order>;            // every property readonly (SHALLOW)
type JustTwo       = Pick<Order, 'id' | 'status'>;              // only these
type EverythingElse = Omit<Order, 'items' | 'note'>;            // all but these
type ByStatus      = Record<'open' | 'paid', Order[]>;          // exhaustive map
type Definite      = NonNullable<Order['note']>;                // string
```

Verified behaviour (`@ts-expect-error` lines mean "this line MUST be an error"):

```ts
const partialOk: Partial<Order> = {};                     // ✅ everything optional
// @ts-expect-error — `priceMinor` must be a number when present
const partialBad: Partial<Order> = { priceMinor: 'free' };

const picked: Pick<Order, 'id' | 'status'> = { id: 'o1', status: 'open' };   // ✅
// @ts-expect-error — `name` was not picked
const pickedExtra: Pick<Order, 'id' | 'status'> = { id: 'o1', status: 'open', name: 'n' };

const recordOk: Record<'open' | 'paid', number> = { open: 1, paid: 2 };      // ✅
// @ts-expect-error — 'paid' is missing; Record is exhaustive over its keys
const recordMissing: Record<'open' | 'paid', number> = { open: 1 };
```

**Three behaviours that surprise people**, all verified:

1. **`Partial` and `Readonly` are shallow.** `Partial<Nested>` makes `inner` optional
   but leaves `inner.a` required; `Readonly<Nested>` blocks reassigning `nested.inner`
   (`TS2540`) yet still allows `nested.inner.a = 99`. Deep versions need a recursive
   mapped type (section 4).
2. **`Omit` does not enforce "no extra properties" the way an interface does.** An
   object *literal* assigned to `Omit<Order, 'id'>` still gets excess-property
   checking, but a value that came from a variable will pass even if it carries the
   omitted field. `Omit` removes keys from the *type*; it does not strip them from
   the *value*:

   ```ts
   const full = { id: 'o1', status: 'open', totalMinor: 5, extra: true } as const;
   const withoutId: Omit<Order, 'id'> = full;   // ✅ compiles — `id` and `extra` ride along!
   delete (withoutId as Partial<Order>).id;     // ← you must strip fields yourself
   ```

   Stripping at runtime is a separate, explicit step (see `toDraft` in the exercise,
   which destructures rather than trusting `Omit`).
3. **`Required<T>` changes optionality, not `undefined`.** With
   `exactOptionalPropertyTypes` (file 3), `{ note?: string | undefined }` becomes
   `{ note: string | undefined }` — required to be *present*, but still allowed to be
   `undefined`.

### `Record<K, V>` — the exhaustive map

```ts
type ProductsByStatus = Record<'draft' | 'live' | 'archived', Product[]>;

const groups: ProductsByStatus = { draft: [], live: [], archived: [] };   // must list all three
groups['live'].push(product);        // ✅ typed
// groups['pending']                  ❌ TS2339: Property 'pending' does not exist
```

Compare with `Record<string, Product[]>` — that accepts any key, `groups['typo']`
compiles, and the value is `Product[] | undefined` only under
`noUncheckedIndexedAccess`. **Prefer the literal-key union** whenever the set of keys
is known: exhaustiveness for free. This is the pattern behind "config per state",
"copy per locale", and "component per variant".

---

## 3. How they work: mapped types

`Partial` is not magic. It is a **mapped type**: a type built by iterating over the
keys of another type.

```ts
// The built-in definition, simplified
type Partial<T> = { [K in keyof T]?: T[K] };

// Read it as: "for every key K in T, produce an optional property T[K]"
```

That one idea lets you write your own:

```ts
// Add a modifier: `?` makes optional, `-?` removes optionality (Required's trick)
type Required<T> = { [K in keyof T]-?: T[K] };

// Add readonly: `readonly` adds it, `-readonly` removes it
type Readonly<T> = { readonly [K in keyof T]: T[K] };
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// Restrict to a subset of keys with an intersection
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Recurse for a deep version — a conditional + a mapped type together
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
```

Verified results from the exercise:

```ts
type TaglessProduct = Optional<Product, 'tags'>;         // only `tags` becomes optional
type NeedsPrice = WithRequired<ProductPatch, 'priceMinor'>;  // one key promoted to required
const settings: DeepPartial<{ theme: { colours: { accent: string } } }> = {
  theme: { colours: {} },                                // ✅ partial at every level
};
```

### Key remapping with `as`

The `as` clause transforms each key while mapping:

```ts
type ChangeHandlers<T> = {
  [K in keyof T & string as `on${Capitalize<K>}Change`]: (value: T[K]) => void;
};

type Handlers = ChangeHandlers<{ email: string; age: number }>;
// { onEmailChange: (value: string) => void; onAgeChange: (value: number) => void }
```

Verified in the challenge, where the payload type comes along too:

```ts
type AppEvents = {
  created: Product;
  updated: { product: Product; changedFields: Array<keyof Product> };
  deleted: { id: string };
  'bulk-imported': { count: number; source: string };
};

type EventHandlers = {
  [K in keyof AppEvents & string as `on${Capitalize<K>}`]: (payload: AppEvents[K]) => void;
};

// At runtime the generated keys are:
//   onCreate? NO — 'created' becomes 'onCreated'. A typo is a compile error:
//   TS2561: Object literal may only specify known properties, but 'onCreate'
//           does not exist in type 'EventHandlers'. Did you mean to write 'onCreated'?
//  and 'bulk-imported' keeps its dash: 'onBulk-imported'
```

Note `keyof T & string` — the `& string` is required because `keyof T` may include
`number`/`symbol`, and template literal types only accept string keys.

---

## 4. Union transformers

```ts
type Sizes = 'sm' | 'md' | 'lg';
type Result = 'ok' | 'error';

type EverythingBut = Exclude<Sizes, 'md'>;             // 'sm' | 'lg'
type Only = Extract<Sizes | Result, 'ok' | 'error'>;   // 'ok' | 'error'
type NoNulls = NonNullable<string | null | undefined>; // string
```

`Exclude` and `Extract` are **distributive conditional types**: they apply to each
member of a union separately.

```ts
type Exclude<T, U> = T extends U ? never : T;
type Extract<T, U> = T extends U ? T : never;
```

### The non-distributivity trap (verified, and nastier than it looks)

`Pick` and `Omit` operate on **keys of the whole union**, and `keyof (A | B)` is only
the *common* keys:

```ts
type A = { id: string; a: number };
type B = { id: string; b: string };

type Common = Pick<A | B, 'id'>;          // { id: string } — only the shared key
type Remaining = Omit<A | B, 'id'>;       // {} — EVERYTHING was removed!

const erased: Remaining = { a: 1, b: 'x' };   // ⚠️ COMPILES: `{}` accepts any object
```

That last line is the dangerous part: `Omit<A | B, 'id'>` is **not** "A and B without
id". It is the empty object type, which happily accepts *anything*, so you get no
checking at all. The fix is to distribute the operation yourself:

```ts
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Proper = DistributiveOmit<A | B, 'id'>;    // { a: number } | { b: string }
const properOk: Proper = { a: 1 };              // ✅
// @ts-expect-error — in this branch `a` must be a number
const properBad: Proper = { a: 'nope' };
```

The `T extends unknown ?` looks pointless — and it is exactly what makes the type
distribute over the union. Whenever a utility type over a union gives you something
that accepts everything, suspect non-distributivity.

---

## 5. Function and promise utilities

```ts
type Fn = (a: string, b?: number) => Promise<Order[]>;

type Args = Parameters<Fn>;              // [a: string, b?: number]
type Returns = ReturnType<Fn>;           // Promise<Order[]>
type Resolved = Awaited<Returns>;        // Order[]

type CtorArgs = ConstructorParameters<typeof Map>;   // [entries?: readonly (readonly [K, V])[] | null]
type Instance = InstanceType<typeof Map>;            // Map<unknown, unknown>
```

Why these matter in application code:

```ts
// Derive the return type of a hook instead of writing it twice
type AuthValue = ReturnType<typeof useAuth>;

// Wrap a function without re-declaring its signature
function withLogging<F extends (...args: never[]) => unknown>(fn: F): F {
  return ((...args: Parameters<F>) => {
    console.log('calling', fn.name);
    return fn(...args);
  }) as F;
}

// Get the resolved type of an async function one `await` deep
type Users = Awaited<ReturnType<typeof fetchUsers>>;   // User[]
```

> ⚠️ **With overloaded functions, `Parameters`/`ReturnType` use the LAST overload
> signature.** Verified: for a function overloaded as
> `(x: string) => number` / `(x: number, y: boolean) => string`,
> `Parameters<typeof f>` is `[x: number, y: boolean]`. If your helper leans on
> `Parameters` and the target is overloaded (many DOM and React APIs are — think
> `document.querySelector`), add an explicit type instead of trusting the inference.

---

## 6. String utilities and template literal types

```ts
type Shout = Uppercase<'hello'>;        // 'HELLO'
type Quiet = Lowercase<'HELLO'>;        // 'hello'
type Title = Capitalize<'hello'>;       // 'Hello'
type Untitle = Uncapitalize<'Hello'>;   // 'hello'
```

These are most useful *inside* template literal types, where they let you synthesise
new string literal unions:

```ts
type MethodAndPath<R extends string> = R extends `${infer Method} ${infer Path}`
  ? { method: Lowercase<Method>; path: Path }
  : never;

type ApiRoutes = {
  'GET /products': { response: Product[] };
  'POST /products': { body: NewProduct; response: Product };
  'DELETE /products/:id': { params: { id: string }; response: void };
};

type MethodOf<R extends keyof ApiRoutes> = MethodAndPath<R>['method'];  // 'get' | 'post' | 'delete'
```

Verified at the value level:

```ts
const method: MethodOf<'DELETE /products/:id'> = 'delete';      // ✅
// @ts-expect-error — MethodOf<'DELETE …'> is exactly 'delete'
const wrongMethod: MethodOf<'DELETE /products/:id'> = 'get';
```

### Conditional types and `infer`, explained

Both appear inside every utility type above, so they are worth naming:

```ts
type ElementType<T> = T extends (infer Item)[] ? Item : never;
//                     └── condition ──┘  └── the inferred part ──┘

type ElementType2<T> = T extends Array<infer Item> ? Item : never;      // equivalent
type ElementType3<T> = T extends ArrayLike<infer Item> ? Item : never;  // wider

type Name = ElementType<string[]>;   // string
```

- **`T extends X ? A : B`** is a conditional type: it selects `A` or `B` by whether
  `T` is assignable to `X`.
- **`infer U`** declares a type variable *inside* the condition and binds it to
  whatever occupies that position.
- Conditionals over a bare type parameter **distribute** over unions, which is how
  `Exclude` works and why `DistributiveOmit` needs `T extends unknown`.

Read the challenge's route options type with that vocabulary:

```ts
type ResponseOf<R extends RouteName> = ApiRoutes[R] extends { response: infer Res } ? Res : never;
// "if this route declares a response, use its type; otherwise never"
```

---

## 7. React's own utility types (a preview of file 11)

These come from `@types/react` and are used constantly:

```tsx
import type { ComponentProps, ComponentPropsWithoutRef, PropsWithChildren, ElementType } from 'react';

// Every prop a native <button> accepts (including onClick, type, disabled…)
type ButtonProps = ComponentProps<'button'>;

// …minus `children`, plus your own required prop
type IconButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
  icon: React.ReactNode;
  label: string;          // required for accessibility
};

// A polymorphic component: `as` can be 'a', 'button', 'div'…
interface BoxProps<T extends ElementType> {
  as?: T;
  children?: React.ReactNode;
}
function Box<T extends ElementType>({ as, children }: BoxProps<T>) {
  const Component = as ?? 'div';
  return <Component>{children}</Component>;
}

type WithKids = PropsWithChildren<{ title: string }>;   // { title: string; children?: ReactNode }
```

Also worth knowing on sight:

| Type | Meaning |
| --- | --- |
| `React.ReactNode` | anything renderable (JSX, string, number, null, arrays) |
| `React.ReactElement` | an element object (`<div />`), no strings/numbers |
| `React.Dispatch<React.SetStateAction<T>>` | the type of `setState` |
| `React.RefObject<T>` / `React.MutableRefObject<T>` | what `useRef` returns |
| `React.ComponentProps<typeof SomeComponent>` | a component's props, derived |
| `React.ComponentPropsWithoutRef<'div'>` | intrinsic props without a ref prop |

**The pattern to remember:** `ComponentProps<typeof X>` means "the same props as X".
Never re-declare a component's props by hand — derive them, and the day X changes,
your wrapper follows. File 11 builds real components with all of these.

---

## 8. Derive or declare? A fair comparison

| Approach | Use when | Cost |
| --- | --- | --- |
| **Derive** (`Omit`, `Pick`, `Partial`) | the new type is genuinely "the same data, subset/variant of it" | coupling: a change to the base changes every derivation |
| **Declare a new interface** | the new type is *conceptually separate* (a DTO, a domain model, a props shape) | duplication; the two can drift |
| **`Pick` a small subset** | a component needs 3 of 20 fields | the base's shape leaks into the component's API |
| **Hand-written props interface** | a component's props (they are its public API) | you must update it when props change |
| **`ComponentProps<typeof X>`** | wrapping/forwarding another component | ties you to X's implementation details |

Some guidance, since there is no universal winner:

- **Props interfaces: write them by hand.** A component's props are its contract with
  the world; `Omit<SomeUnrelatedModel, 'a' | 'b'>` as a props type is a smell, because
  the component's API now changes whenever the model does.
- **Draft/patch/update shapes: derive them.** `Omit<Model, 'id' | 'createdAt'>` and
  `Partial<Model>` are exactly "the same data, less of it".
- **Wrappers around existing components: derive.** `Omit<ComponentProps<'input'>, 'onChange'>`
  is precise and stays correct.
- **Anything crossing a module or service boundary: declare it explicitly**, even if
  it costs a few lines. Independent types at boundaries are a feature — that is what
  lets the API change without breaking your app.
- **When in doubt, ask: "if the base type changes, do I *want* this type to change?"**
  Yes → derive. No → declare.

---

## 9. Common mistakes

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Treating `Partial` as deep | `TS2741: Property 'a' is missing` inside a nested object | recursive `DeepPartial<T>` |
| Treating `Readonly` as deep | Nested mutation succeeds; `nested.inner.x = 1` compiles | own the object; freeze at runtime if needed |
| `Omit<Union, K>` | Result is `{}` and accepts **anything** | `DistributiveOmit<T, K> = T extends unknown ? Omit<T, K> : never` |
| `Pick<Union, K>` | Only common keys survive; surprising errors | distribute, or use a discriminant |
| Believing `Omit` strips runtime fields | Extra properties ride along from variables | destructure explicitly (`const { id, ...rest } = obj`) |
| `Required<T>` expected to remove `undefined` | `note: string \| undefined` still allows `undefined` | use `NonNullable` too, or a stricter source type |
| `Parameters`/`ReturnType` on an overloaded function | You get the **last** overload only | declare an explicit type alias |
| `Record<string, X>` for a known key set | Typos compile; `X \| undefined` surprises | `Record<'a' \| 'b', X>` |
| `keyof T` without `& string` in a template literal | `TS2322: Type 'string \| number \| symbol' …` | `keyof T & string` |
| Deriving props from an unrelated model | Component's API changes when the model changes | write the props interface |
| `as` casts to escape a utility-type mismatch | Silent wrong types | fix the derivation, or declare the type |
| Over-deriving "for DRYness" | Readers must chase five aliases to learn one shape | prefer clarity; direct beats clever |

---

## 10. Practice exercises

### Beginner

1. Predict the type of each alias, then check with `tsc`:

```ts
interface Task { id: string; title: string; done: boolean; dueAt?: string }

type A = Pick<Task, 'title' | 'done'>;
type B = Omit<Task, 'id'>;
type C = Partial<Omit<Task, 'id'>>;
type D = Required<Task>;
type E = Readonly<Task>['title'];
type F = Record<'todo' | 'doing' | 'done', Task[]>;
type G = NonNullable<Task['dueAt']>;
type H = Exclude<keyof Task, 'id' | 'dueAt'>;
```

2. Which of these compile?

```ts
const a: A = { title: 'x', done: false };
const b: A = { title: 'x', done: false, id: 't1' };
const c: C = { title: 'x' };
const d: C = {};
const e: D = { id: 't1', title: 'x', done: false };
const f: F = { todo: [], doing: [] };
```

3. Why is `Omit<Task, 'id'>` dangerous when `Task` is a **union**, and what replaces it?

**Solution**

**1.** Resolved types:

```text
A = { title: string; done: boolean }
B = { title: string; done: boolean; dueAt?: string }
C = { title?: string; done?: boolean; dueAt?: string }
D = { id: string; title: string; done: boolean; dueAt: string }      ← `dueAt` now REQUIRED
                                                                       (and, with
                                                                        exactOptionalPropertyTypes,
                                                                        `string | undefined`)
E = string
F = { todo: Task[]; doing: Task[]; done: Task[] }
G = string
H = 'title' | 'done'
```

**2.**

```text
const a: A = { title: 'x', done: false };                      ✅
const b: A = { title: 'x', done: false, id: 't1' };            ❌ TS2353: 'id' does not exist
                                                                  in type 'Pick<Task, "title" | "done">'
const c: C = { title: 'x' };                                   ✅
const d: C = {};                                               ✅ (every field optional)
const e: D = { id: 't1', title: 'x', done: false };            ❌ TS2741: Property 'dueAt' is missing
                                                                  in type … but required in 'Required<Task>'
const f: F = { todo: [], doing: [] };                          ❌ TS2739: 'done' is missing —
                                                                  Record with literal keys is exhaustive
```

The two instructive failures: `b` shows `Pick` rejecting an omitted field in a fresh
object literal, and `e` shows `Required` demanding the optional field that nobody
thinks about.

**3.** `keyof (A | B)` is the **intersection** of the keys, so
`Omit<Union, K>` keeps only the common keys — and if the union's members share just
`id`, the result is `{}`, which accepts **any** object:

```ts
type A = { id: string; a: number };
type B = { id: string; b: string };

type Remaining = Omit<A | B, 'id'>;          // {}  ← accepts { a: 1, b: 'x' } happily!
const oops: Remaining = { a: 1, b: 'x' };    // ⚠️ compiles, no protection at all

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Proper = DistributiveOmit<A | B, 'id'>; // { a: number } | { b: string }
const good: Proper = { a: 1 };               // ✅
// @ts-expect-error — `a` must be a number in this branch
const bad: Proper = { a: 'nope' };
```

### Intermediate

Build a **product form module** where every type is derived from one `Product`
model: the form draft, the patch body, the "new product" payload, the validation
errors, the grouped catalogue, and a set of generated change handlers.

```text
ts-playground/src/product-form.ts
```

Requirements:

1. `Product` with `id`, `sku`, `name`, `priceMinor`, `tags`, `status` (`'draft' | 'live' | 'archived'`), `updatedAt`.
2. Derived: `ProductDraft = Omit<Product, 'id' | 'updatedAt'>`,
   `ProductPatch = Partial<ProductDraft>`,
   `NewProduct = Pick<Product, 'sku' | 'name'> & Partial<Omit<ProductDraft, 'sku' | 'name'>>`.
3. Custom utilities: `WithRequired<T, K extends keyof T>`, `Optional<T, K extends keyof T>`,
   `DeepPartial<T>`, `Mutable<T>`, and `ChangeHandlers<T>` (key remapping).
4. `ProductsByStatus = Record<ProductStatus, Product[]>`.
5. Functions: `toDraft` (destructuring, not trusting `Omit`), `applyPatch` (immutable),
   `isPatchEmpty`, `validate(draft): Partial<Record<keyof ProductDraft, string>>`,
   `groupByStatus`, `makeChangeHandlers(log)`, and a factory typed via
   `Parameters<typeof makeProduct>` / `ReturnType<typeof makeProduct>`.
6. A demo covering: draft keys, creation with only required fields, two sequential
   patches proving immutability, validation errors, exhaustive grouping, generated
   handler keys and their log, `Mutable<Readonly<Product>>`, `DeepPartial` nesting,
   and the two custom utilities in action.
7. A **type-level test suite** at the bottom: `@ts-expect-error` assertions for
   `Partial`, `Required`, `Pick`, `Omit`, `Record`, `NonNullable`, `Exclude`,
   `Extract`, non-distributive unions, and `Parameters` on the factory.

**Solution**

```text
ts-playground/src/product-form.ts
```

```ts
export {};

// ============================================================================
// One source-of-truth model. Everything else is DERIVED from it.
// ============================================================================
type ProductStatus = 'draft' | 'live' | 'archived';

interface Product {
  id: string;
  sku: string;
  name: string;
  priceMinor: number;
  tags: string[];
  status: ProductStatus;
  updatedAt: string;
}

// ============================================================================
// Derived types — no duplicated field lists anywhere
// ============================================================================
// A form edits everything except the server-owned fields.
type ProductDraft = Omit<Product, 'id' | 'updatedAt'>;

// A PATCH body may contain any subset of the editable fields.
type ProductPatch = Partial<ProductDraft>;

// Required for a new product: sku + name. Optional: everything else.
type NewProduct = Pick<Product, 'sku' | 'name'> & Partial<Omit<ProductDraft, 'sku' | 'name'>>;

// A required-field extractor: "these specific keys must be present".
type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Grouped products, exhaustive over the status union (file 8 pattern).
type ProductsByStatus = Record<ProductStatus, Product[]>;

// A custom Optional<T, K>: make only the listed keys optional.
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Deep partial for nested settings — recursive mapped type with a conditional.
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

// Key remapping: turn a data shape into an event-handler shape.
type ChangeHandlers<T> = {
  [K in keyof T & string as `on${Capitalize<K>}Change`]: (value: T[K]) => void;
};

// A Mutable<T>: remove readonly from every property (`-readonly`).
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ============================================================================
// Functions built on the derived types
// ============================================================================
function toDraft(product: Product): ProductDraft {
  const { id, updatedAt, ...draft } = product;   // destructure to drop server fields
  void id;
  void updatedAt;
  return draft;
}

function applyPatch(product: Product, patch: ProductPatch): Product {
  // `patch` may hold any subset: spreading it over a copy is exactly right.
  return { ...product, ...patch, updatedAt: new Date().toISOString().slice(0, 10) };
}

function isPatchEmpty(patch: ProductPatch): boolean {
  return Object.keys(patch).length === 0;
}

// The validation result keys itself to the draft's own fields (keyof flows through).
type FieldErrors = Partial<Record<keyof ProductDraft, string>>;

function validate(draft: ProductDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.sku.trim() === '') errors.sku = 'SKU is required';
  if (draft.name.trim() === '') errors.name = 'Name is required';
  if (!Number.isInteger(draft.priceMinor) || draft.priceMinor < 0) {
    errors.priceMinor = 'Price must be a non-negative integer (minor units)';
  }
  if (draft.tags.some((tag) => tag.trim() === '')) errors.tags = 'Tags cannot be blank';
  if (draft.status === 'live' && draft.priceMinor === 0) {
    errors.status = 'A live product needs a price above zero';
  }
  return errors;
}

function groupByStatus(products: readonly Product[]): ProductsByStatus {
  const groups: ProductsByStatus = { draft: [], live: [], archived: [] };
  for (const product of products) {
    groups[product.status].push(product);
  }
  return groups;
}

function makeChangeHandlers(log: string[]): ChangeHandlers<ProductDraft> {
  return {
    onSkuChange: (value) => log.push(`sku → ${value}`),
    onNameChange: (value) => log.push(`name → ${value}`),
    onPriceMinorChange: (value) => log.push(`priceMinor → ${value}`),
    onTagsChange: (value) => log.push(`tags → ${value.join('/')}`),
    onStatusChange: (value) => log.push(`status → ${value}`),
  };
}

// ReturnType + Parameters: derive a factory and a wrapper without repeating types.
function makeProduct(input: NewProduct): Product {
  return {
    id: `p${Math.random().toString(36).slice(2, 7)}`,
    sku: input.sku,
    name: input.name,
    priceMinor: input.priceMinor ?? 0,
    tags: input.tags ?? [],
    status: input.status ?? 'draft',
    updatedAt: '2026-09-19',
  };
}

type MakeProductArgs = Parameters<typeof makeProduct>;        // [input: NewProduct]
type MadeProduct = ReturnType<typeof makeProduct>;            // Product

// ============================================================================
// Demo
// ============================================================================
const seed: Product = {
  id: 'p-1001',
  sku: 'KBD-1',
  name: 'Mechanical Keyboard',
  priceMinor: 499900,
  tags: ['input', 'mechanical'],
  status: 'draft',
  updatedAt: '2026-09-01',
};

function main(): void {
  console.log('=== toDraft drops server-owned fields ===');
  const draft = toDraft(seed);
  console.log('  draft keys :', Object.keys(draft).join(', '));
  console.log('  has id?    :', 'id' in draft, '| has updatedAt?:', 'updatedAt' in draft);

  console.log('\n=== new products use NewProduct (sku + name required) ===');
  const created: MadeProduct = makeProduct({ sku: 'MOU-1', name: 'Wireless Mouse' });
  console.log(`  created: ${created.sku} / ${created.name} / price ${created.priceMinor} / status ${created.status}`);
  const argCheck: MakeProductArgs = [{ sku: 'MON-1', name: '27" Monitor', priceMinor: 1899900 }];
  console.log(`  same type via Parameters<typeof makeProduct>: ${argCheck[0]?.name}`);

  console.log('\n=== patches are partial, and applied immutably ===');
  const patch1: ProductPatch = { priceMinor: 449900 };
  const patch2: ProductPatch = { tags: ['input', 'mechanical', 'sale'], status: 'live' };
  const afterFirst = applyPatch(seed, patch1);
  const afterSecond = applyPatch(afterFirst, patch2);
  console.log(`  original still ${seed.priceMinor}, tags [${seed.tags.join(', ')}]`);
  console.log(`  after patch 1 : ${afterFirst.priceMinor}`);
  console.log(`  after patch 2 : ${afterSecond.priceMinor}, [${afterSecond.tags.join(', ')}], ${afterSecond.status}, updated ${afterSecond.updatedAt}`);
  console.log('  empty patch is detectable:', isPatchEmpty({}), '|', isPatchEmpty({ name: 'x' }));

  console.log('\n=== validation keys itself to ProductDraft ===');
  const badDraft: ProductDraft = { sku: '  ', name: '', priceMinor: 0, tags: [''], status: 'live' };
  const errors = validate(badDraft);
  for (const [field, message] of Object.entries(errors)) {
    console.log(`  ${field}: ${message}`);
  }
  console.log('  validate(valid draft) →', Object.keys(validate({ ...draft, status: 'live' })).length, 'errors');

  console.log('\n=== Record<ProductStatus, …> is exhaustive ===');
  const catalogue: Product[] = [
    seed,
    afterSecond,
    makeProduct({ sku: 'MON-1', name: '27" Monitor', status: 'archived', priceMinor: 1899900 }),
  ];
  const grouped = groupByStatus(catalogue);
  for (const status of Object.keys(grouped) as ProductStatus[]) {
    console.log(`  ${status.padEnd(9)}: ${grouped[status].length}`);
  }

  console.log('\n=== key remapping: data type → handler names ===');
  const log: string[] = [];
  const handlers = makeChangeHandlers(log);
  console.log('  generated keys:', Object.keys(handlers).join(', '));
  handlers.onNameChange('Mechanical Keyboard (TKL)');
  handlers.onTagsChange(['input', 'tkl']);
  console.log('  log:', log);

  console.log('\n=== custom Optional<T, K>: make only SOME keys optional ===');
  type TaglessProduct = Optional<Product, 'tags'>;
  const tagless: TaglessProduct = {
    id: 'p-2',
    sku: 'MON-1',
    name: '27" Monitor',
    priceMinor: 1899900,
    status: 'draft',
    updatedAt: '2026-09-19',
  };
  console.log('  has a `tags` property:', 'tags' in tagless, '| keys:', Object.keys(tagless).join(', '));

  console.log('\n=== custom WithRequired<T, K>: make SOME keys required ===');
  // Inside a Partial, promote one key back to required:
  const needsPrice: WithRequired<ProductPatch, 'priceMinor'> = { priceMinor: 449900 };
  console.log('  productMinor is guaranteed present:', needsPrice.priceMinor);

  console.log('\n=== Readonly / Mutable / DeepPartial ===');
  const frozen: Readonly<Product> = seed;
  const thawed: Mutable<Readonly<Product>> = { ...frozen };
  thawed.name = 'Renamed via Mutable<T>';
  console.log('  thawed.name:', thawed.name, '| original untouched:', seed.name);

  const settings: DeepPartial<{ theme: { colours: { accent: string } } }> = {
    theme: { colours: {} },
  };
  console.log('  DeepPartial allows partial nesting:', JSON.stringify(settings));
}

main();

/* ---------------------------------------------------------------------------
   TYPE-LEVEL TESTS — @ts-expect-error FAILS THE BUILD if the next line is legal.
   This is how you test types (Part 13 covers the tooling).
---------------------------------------------------------------------------- */

// 1. Partial makes everything optional
const partialOk: Partial<Product> = {};                        // ✅
// @ts-expect-error — `priceMinor` must be a number when present
const partialBad: Partial<Product> = { priceMinor: 'free' };

// 2. Required removes optionality (note?: string is not in Product, so use Order-like)
interface WithOptional { id: string; note?: string }
const requiredOk: Required<WithOptional> = { id: 'x', note: 'set' };   // ✅
// @ts-expect-error — `note` is now required
const requiredBad: Required<WithOptional> = { id: 'x' };

// 3. Pick / Omit
const picked: Pick<Product, 'id' | 'sku'> = { id: 'p1', sku: 'S-1' };  // ✅
// @ts-expect-error — `name` was not picked
const pickedExtra: Pick<Product, 'id' | 'sku'> = { id: 'p1', sku: 'S-1', name: 'n' };
// @ts-expect-error — `id` was omitted
const omittedBad: Omit<Product, 'id' | 'updatedAt'> = { id: 'p1', sku: 'S-1', name: 'n', priceMinor: 0, tags: [], status: 'draft' };
const omittedOk: Omit<Product, 'id' | 'updatedAt'> = { sku: 'S-1', name: 'n', priceMinor: 0, tags: [], status: 'draft' };  // ✅

// 4. Record is exhaustive over the key union
const recordOk: Record<ProductStatus, number> = { draft: 1, live: 2, archived: 3 };  // ✅
// @ts-expect-error — 'archived' is missing
const recordMissing: Record<ProductStatus, number> = { draft: 1, live: 2 };

// 5. NonNullable / Exclude / Extract
type MaybeId = string | null | undefined;
const definite: NonNullable<MaybeId> = 'x';                          // ✅
// @ts-expect-error — null is not assignable to NonNullable<…>
const definiteBad: NonNullable<MaybeId> = null;
type WithoutDraft = Exclude<ProductStatus, 'draft'>;                  // 'live' | 'archived'
const excluded: WithoutDraft = 'live';                                // ✅
// @ts-expect-error — 'draft' was excluded
const excludedBad: WithoutDraft = 'draft';
type OnlyDraft = Extract<ProductStatus, 'draft'>;                     // 'draft'
// @ts-expect-error
const extractedBad: OnlyDraft = 'live';

// 6. Utility types over unions are NOT distributive (a famous surprise)
type A = { id: string; a: number };
type B = { id: string; b: string };

type Common = Pick<A | B, 'id'>;                    // keyof (A|B) is only 'id'
const common: Common = { id: 'x' };                 // ✅
// @ts-expect-error — `a` does not exist on Pick<A | B, 'id'>
const commonBad: Common = { id: 'x', a: 1 };

type Remaining = Omit<A | B, 'id'>;                 // = {} — EVERYTHING was omitted
const erased: Remaining = { a: 1, b: 'x' };         // ⚠️ COMPILES! `{}` accepts any object,
                                                    //    so this silently gives NO safety.
// The fix: distribute the Omit over the union manually.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Proper = DistributiveOmit<A | B, 'id'>;        // { a: number } | { b: string }
const properOk: Proper = { a: 1 };                  // ✅
// @ts-expect-error — in this branch `a` must be a number
const properBad: Proper = { a: 'nope' };

// 7. Parameters/ReturnType on an OVERLOADED function uses the LAST signature
const params: Parameters<typeof makeProduct> = [{ sku: 'S', name: 'N' }];   // ✅
// @ts-expect-error — sku is required
const paramsBad: Parameters<typeof makeProduct> = [{ name: 'N' }];

void [partialOk, requiredOk, picked, omittedOk, recordOk, definite, excluded, common, params,
      partialBad, requiredBad, pickedExtra, omittedBad, recordMissing, definiteBad,
      excludedBad, extractedBad, commonBad, erased, properOk, properBad, paramsBad];
```

**Run it**

```bash
npx tsx src/product-form.ts
```

**Expected output**

```text
=== toDraft drops server-owned fields ===
  draft keys : sku, name, priceMinor, tags, status
  has id?    : false | has updatedAt?: false

=== new products use NewProduct (sku + name required) ===
  created: MOU-1 / Wireless Mouse / price 0 / status draft
  same type via Parameters<typeof makeProduct>: 27" Monitor

=== patches are partial, and applied immutably ===
  original still 499900, tags [input, mechanical]
  after patch 1 : 449900
  after patch 2 : 449900, [input, mechanical, sale], live, updated 2026-09-19
  empty patch is detectable: true | false

=== validation keys itself to ProductDraft ===
  sku: SKU is required
  name: Name is required
  tags: Tags cannot be blank
  status: A live product needs a price above zero
  validate(valid draft) → 0 errors

=== Record<ProductStatus, …> is exhaustive ===
  draft    : 1
  live     : 1
  archived : 1

=== key remapping: data type → handler names ===
  generated keys: onSkuChange, onNameChange, onPriceMinorChange, onTagsChange, onStatusChange
  log: [ 'name → Mechanical Keyboard (TKL)', 'tags → input/tkl' ]

=== custom Optional<T, K>: make only SOME keys optional ===
  built without `tags`: false | keys: id, sku, name, priceMinor, status, updatedAt

=== custom WithRequired<T, K>: make SOME keys required ===
  productMinor is guaranteed present: 449900

=== Readonly / Mutable / DeepPartial ===
  thawed.name: Renamed via Mutable<T> | original untouched: Mechanical Keyboard
  DeepPartial allows partial nesting: {"theme":{"colours":{}}}
```

**What to learn from the tests at the bottom of the file**

- **`@ts-expect-error` is a real assertion.** It *fails the build if the next line
  compiles*. That is how you prove a type restriction exists — far better than a
  comment claiming it. Write these for your own utility types; Part 13 wires them
  into `vitest` so they run in CI.
- **They caught a wrong assumption while writing this exercise.** The first draft
  asserted that `Omit<A | B, 'id'>` would reject `{ a: 1 }`. It does not — the type is
  `{}`, so it accepts everything. The suite failed, the claim was corrected, and the
  `DistributiveOmit` helper was added. **That is the entire value of type-level
  tests: they fail loudly when your mental model is wrong.**
- **The handler keys are checked at compile time.** `ChangeHandlers<ProductDraft>`
  demands exactly `onSkuChange`, `onNameChange`, `onPriceMinorChange`, `onTagsChange`,
  `onStatusChange` — miss one and the object literal fails, invent one and it fails
  with "did you mean…".
- **`validate` returns `Partial<Record<keyof ProductDraft, string>>`**, so the UI can
  look up `errors.sku`, typos are compile errors, and absent fields are legal. Two
  utility types composed into a form-friendly result.
- **`toDraft` destructures rather than trusting `Omit`** — because `Omit` is a
  compile-time view. Runtime stripping is always explicit.

### Challenge

Build a **fully derived, typed API client**: one route map produces per-route request
option types, response types, an error type, a client object, and an event-handler
interface.

```text
ts-playground/src/api-types.ts
```

Requirements:

1. `ApiRoutes` map with four routes: `'GET /products'` (optional `query`, `response: Product[]`),
   `'GET /products/:id'` (`params`, `response: Product`), `'POST /products'` (`body: NewProduct`, `response: Product`),
   `'DELETE /products/:id'` (`params`, `response: void`).
2. Derive with conditional + `infer`: `ResponseOf<R>`, `ParamsOf<R>`, `BodyOf<R>`,
   `QueryOf<R>`, `HasKey<R, K>`, and a composed `RequestOptions<R>` where params/body
   are **required** only when the route declares them.
3. Template literal types: `MethodAndPath<R>`, `MethodOf<R>`, `PathOf<R>`.
4. Key remapping: `EventHandlers` from an `AppEvents` map, including a dashed key
   (`'bulk-imported'`).
5. `ApiError extends Error` carrying `status` and `route`; a fake in-memory backend;
   an `async function request<R extends RouteName>(route, options): Promise<ResponseOf<R>>`
   with **one documented internal cast**.
6. A mapped `ApiClient` type (`{ [R in RouteName]: (options: RequestOptions<R>) => Promise<ResponseOf<R>> }`)
   with an object satisfying it.
7. Demo: each route once (with and without options), a 404 caught and printed with
   `instanceof`, the client object's method list, generated event handlers driven by
   data, `Awaited<ReturnType<typeof request<'GET /products'>>>` + `Parameters<…>`
   re-issuing a call, and a template-literal parser printing `method`/`path`.
8. A comment block with the type-level rejections (unknown route, missing params,
   missing body, body on a GET, wrong field type, response misuse, handler typos).

**Solution**

```text
ts-playground/src/api-types.ts
```

```ts
export {};

// ============================================================================
// Domain
// ============================================================================
type ProductStatus = 'draft' | 'live' | 'archived';

interface Product {
  id: string;
  sku: string;
  name: string;
  priceMinor: number;
  status: ProductStatus;
}

interface NewProduct {
  sku: string;
  name: string;
  priceMinor: number;
}

// ============================================================================
// ONE route map describes the whole API. Every client type is derived from it.
// ============================================================================
type ApiRoutes = {
  'GET /products': {
    query: { status?: ProductStatus | undefined; limit?: number | undefined };
    response: Product[];
  };
  'GET /products/:id': {
    params: { id: string };
    response: Product;
  };
  'POST /products': {
    body: NewProduct;
    response: Product;
  };
  'DELETE /products/:id': {
    params: { id: string };
    response: void;
  };
};

type RouteName = keyof ApiRoutes;

// ============================================================================
// Conditional types + `infer`: extract one property's type from the map.
// Reading `T extends { response: infer R } ? R : never` as:
//   "if T has a response property, name its type R and use it; otherwise never".
// ============================================================================
type ResponseOf<R extends RouteName> = ApiRoutes[R] extends { response: infer Res } ? Res : never;
type ParamsOf<R extends RouteName> = ApiRoutes[R] extends { params: infer P } ? P : never;
type BodyOf<R extends RouteName> = ApiRoutes[R] extends { body: infer B } ? B : never;
type QueryOf<R extends RouteName> = ApiRoutes[R] extends { query: infer Q } ? Q : never;

type HasKey<R extends RouteName, K extends string> = K extends keyof ApiRoutes[R] ? true : false;

// Options shape per route: params/body are REQUIRED when the route declares them,
// and forbidden-but-optional otherwise. `params?: undefined` is how you say
// "this key may be absent, but if present it must be undefined".
type RequestOptions<R extends RouteName> =
  (HasKey<R, 'params'> extends true ? { params: ParamsOf<R> } : { params?: undefined }) &
  (HasKey<R, 'body'> extends true ? { body: BodyOf<R> } : { body?: undefined }) &
  (HasKey<R, 'query'> extends true ? { query?: QueryOf<R> } : { query?: undefined });

// ============================================================================
// Template literal types: split "GET /products" into a method and a path.
// ============================================================================
type MethodAndPath<R extends string> = R extends `${infer Method} ${infer Path}`
  ? { method: Lowercase<Method>; path: Path }
  : never;

type MethodOf<R extends RouteName> = MethodAndPath<R>['method'];   // 'get' | 'post' | 'delete'
type PathOf<R extends RouteName> = MethodAndPath<R>['path'];       // '/products' | …

// ============================================================================
// Key remapping with `as`: derive an event-handler shape from an event map.
// ============================================================================
type AppEvents = {
  created: Product;
  updated: { product: Product; changedFields: Array<keyof Product> };
  deleted: { id: string };
  'bulk-imported': { count: number; source: string };
};

type EventName = keyof AppEvents;

// `Capitalize` on 'bulk-imported' leaves the dash, so the handler name keeps it.
type EventHandlers = {
  [K in EventName & string as `on${Capitalize<K>}`]: (payload: AppEvents[K]) => void;
};

// A mapped type over the route map builds a client object, one method per route.
type ApiClient = {
  [R in RouteName]: (options: RequestOptions<R>) => Promise<ResponseOf<R>>;
};

// ============================================================================
// Errors
// ============================================================================
class ApiError extends Error {
  constructor(readonly status: number, readonly route: string, message: string) {
    super(`${route} failed with ${status}: ${message}`);
    this.name = 'ApiError';
  }
}

// ============================================================================
// A fake backend
// ============================================================================
const db: { products: Product[]; seq: number } = {
  products: [
    { id: 'p1', sku: 'KBD-1', name: 'Mechanical Keyboard', priceMinor: 499900, status: 'live' },
    { id: 'p2', sku: 'MOU-1', name: 'Wireless Mouse', priceMinor: 129900, status: 'draft' },
    { id: 'p3', sku: 'MON-1', name: '27" Monitor', priceMinor: 1899900, status: 'live' },
  ],
  seq: 3,
};

// The implementation is intentionally loosely typed inside, with ONE documented
// cast at the boundary — the same pattern as the event bus in file 7.
function transport(route: string, options: Record<string, unknown>): unknown {
  switch (route) {
    case 'GET /products': {
      const query = options['query'] as { status?: ProductStatus; limit?: number } | undefined;
      let results = db.products;
      if (query?.status !== undefined) {
        results = results.filter((product) => product.status === query.status);
      }
      if (query?.limit !== undefined) {
        results = results.slice(0, query.limit);
      }
      return results;
    }
    case 'GET /products/:id': {
      const { id } = options['params'] as { id: string };
      const found = db.products.find((product) => product.id === id);
      if (found === undefined) throw new ApiError(404, route, `no product ${id}`);
      return found;
    }
    case 'POST /products': {
      const body = options['body'] as NewProduct;
      db.seq += 1;
      const created: Product = { id: `p${db.seq}`, status: 'draft', ...body };
      db.products.push(created);
      return created;
    }
    case 'DELETE /products/:id': {
      const { id } = options['params'] as { id: string };
      const index = db.products.findIndex((product) => product.id === id);
      if (index === -1) throw new ApiError(404, route, `no product ${id}`);
      db.products.splice(index, 1);
      return undefined;
    }
    default:
      throw new Error(`Unhandled route: ${route}`);
  }
}

// ============================================================================
// The typed client. Note the single cast: the route map promises the shape,
// and transport() upholds it case by case.
// ============================================================================
async function request<R extends RouteName>(
  route: R,
  options: RequestOptions<R>
): Promise<ResponseOf<R>> {
  const result = transport(route, options as Record<string, unknown>);
  return result as ResponseOf<R>;
}

// ============================================================================
// Demo
// ============================================================================
async function main(): Promise<void> {
  console.log('=== one call per route, fully typed ===');

  const live = await request('GET /products', { query: { status: 'live' } });
  console.log(`  GET /products?status=live → ${live.length}: ${live.map((p) => p.sku).join(', ')}`);

  const limited = await request('GET /products', { query: { limit: 2 } });
  console.log(`  GET /products?limit=2 → ${limited.length}: ${limited.map((p) => p.sku).join(', ')}`);

  const none = await request('GET /products', {});
  console.log(`  GET /products (no options) → ${none.length} products`);

  const one = await request('GET /products/:id', { params: { id: 'p2' } });
  console.log(`  GET /products/p2 → ${one.name} (${one.status})`);

  const created = await request('POST /products', {
    body: { sku: 'CAM-1', name: '1080p Webcam', priceMinor: 349900 },
  });
  console.log(`  POST /products → created ${created.id} ${created.sku} as ${created.status}`);

  const deleted = await request('DELETE /products/:id', { params: { id: 'p1' } });
  console.log(`  DELETE /products/p1 → response is ${String(deleted)} (void)`);

  console.log('\n=== errors carry the route and status ===');
  try {
    await request('GET /products/:id', { params: { id: 'nope' } });
  } catch (error) {
    if (error instanceof ApiError) {
      console.log(`  ApiError ${error.status} on ${error.route}`);
      console.log(`  message: ${error.message}`);
    }
  }

  console.log('\n=== the client object is a mapped type over the route map ===');
  const client: ApiClient = {
    'GET /products': (options) => request('GET /products', options),
    'GET /products/:id': (options) => request('GET /products/:id', options),
    'POST /products': (options) => request('POST /products', options),
    'DELETE /products/:id': (options) => request('DELETE /products/:id', options),
  };
  console.log('  methods:', Object.keys(client).join(', '));
  const viaClient = await client['GET /products']({ query: { status: 'draft' } });
  console.log(`  client['GET /products']({ query: { status: 'draft' } }) → ${viaClient.length}: ${viaClient.map((p) => p.sku).join(', ')}`);

  console.log('\n=== event handlers derived by key remapping ===');
  const log: string[] = [];
  const handlers: EventHandlers = {
    onCreated: (product) => log.push(`created ${product.sku}`),
    onUpdated: ({ product, changedFields }) => log.push(`updated ${product.sku}: ${changedFields.join(', ')}`),
    onDeleted: ({ id }) => log.push(`deleted ${id}`),
    'onBulk-imported': ({ count, source }) => log.push(`imported ${count} from ${source}`),
  };
  console.log('  handler keys:', Object.keys(handlers).join(', '));
  handlers.onCreated(created);
  handlers.onUpdated({ product: one, changedFields: ['name', 'priceMinor'] });
  handlers.onDeleted({ id: 'p1' });
  handlers['onBulk-imported']({ count: 12, source: 'csv' });
  console.log('  log:', log);

  console.log('\n=== Awaited / ReturnType / Parameters compose ===');
  type GetProducts = typeof request<'GET /products'>;
  type GetProductsResult = Awaited<ReturnType<GetProducts>>;
  type GetProductsArgs = Parameters<GetProducts>;
  const args: GetProductsArgs = ['GET /products', { query: { status: 'live' } }];
  const again: GetProductsResult = await request(...args);
  console.log(`  re-issued from Parameters<…> → ${again.length} products`);

  console.log('\n=== template literal types split the route string ===');
  // A typed helper: the generic R keeps the LITERAL route, so the returned
  // method/path types are literal unions per call site.
  function splitRoute<R extends RouteName>(route: R): MethodAndPath<R> {
    const [method, path] = route.split(' ') as [string, string];
    return { method: method.toLowerCase(), path } as MethodAndPath<R>;
  }

  const parsedGet = splitRoute('GET /products');
  const parsedPost = splitRoute('POST /products');
  console.log(`  ${'GET /products'.padEnd(12)} → ${parsedGet.method} ${parsedGet.path}`);
  console.log(`  ${'POST /products'.padEnd(12)} → ${parsedPost.method} ${parsedPost.path}`);

  // The point of the template literal type: each route yields exact literals.
  const method: MethodOf<'DELETE /products/:id'> = 'delete';      // ✅
  const path: PathOf<'DELETE /products/:id'> = '/products/:id';   // ✅
  console.log(`  MethodOf<'DELETE …'> = "${method}", PathOf<'DELETE …'> = "${path}"`);
  // @ts-expect-error — MethodOf<'DELETE …'> is exactly 'delete', not any method
  const wrongMethod: MethodOf<'DELETE /products/:id'> = 'get';
  void wrongMethod;
}

void main();

/* ---------------------------------------------------------------------------
   TYPE-LEVEL TESTS (@ts-expect-error fails the build if the line is legal)

   // 1. A route that does not exist
   // @ts-expect-error
   request('GET /orders', {});
   //   TS2345: Argument of type '"GET /orders"' is not assignable to parameter of
   //           type 'RouteName'.

   // 2. Missing required params
   // @ts-expect-error
   request('GET /products/:id', {});
   //   TS2345: Argument of type '{}' is not assignable to parameter of type
   //           '{ params: { id: string; }; … }'.

   // 3. Body required for POST
   // @ts-expect-error
   request('POST /products', {});
   //   TS2345: Property 'body' is missing.

   // 4. Body on a GET is rejected
   // @ts-expect-error
   request('GET /products', { body: { sku: 'X', name: 'X', priceMinor: 0 } });
   //   TS2322: Type '{ sku: string; … }' is not assignable to type 'undefined'.

   // 5. Wrong body field type
   // @ts-expect-error
   request('POST /products', { body: { sku: 'X', name: 'X', priceMinor: 'free' } });
   //   TS2322: Type 'string' is not assignable to type 'number'.

   // 6. The response type follows the route
   const products = request('GET /products', {});
   // @ts-expect-error — a Product[] has no `.name`
   products.then((list) => list.name);
   // @ts-expect-error — but DELETE resolves to void, so no property access at all
   request('DELETE /products/:id', { params: { id: 'x' } }).then((r) => r.id);

   // 7. Event handler keys and payloads come from the event map. The key is
   //    `onCreated` (from `created`), so `onCreate` is a typo the compiler catches:
   //    TS2561: Object literal may only specify known properties, but 'onCreate'
   //            does not exist in type 'EventHandlers'. Did you mean to write 'onCreated'?
   // @ts-expect-error — wrong payload shape
   handlers.onDeleted({ product: 'x' });
   // @ts-expect-error — unknown event name
   handlers.onRenamed(() => {});
---------------------------------------------------------------------------- */
```

**Run it**

```bash
npx tsx src/api-types.ts
```

**Expected output**

```text
=== one call per route, fully typed ===
  GET /products?status=live → 2: KBD-1, MON-1
  GET /products?limit=2 → 2: KBD-1, MOU-1
  GET /products (no options) → 3 products
  GET /products/p2 → Wireless Mouse (draft)
  POST /products → created p4 CAM-1 as draft
  DELETE /products/p1 → response is undefined (void)

=== errors carry the route and status ===
  ApiError 404 on GET /products/:id
  message: GET /products/:id failed with 404: no product nope

=== the client object is a mapped type over the route map ===
  methods: GET /products, GET /products/:id, POST /products, DELETE /products/:id
  client['GET /products']({ query: { status: 'draft' } }) → 2: MOU-1, CAM-1

=== event handlers derived by key remapping ===
  handler keys: onCreated, onUpdated, onDeleted, onBulk-imported
  log: [
  'created CAM-1',
  'updated MOU-1: name, priceMinor',
  'deleted p1',
  'imported 12 from csv'
]

=== Awaited / ReturnType / Parameters compose ===
  re-issued from Parameters<…> → 1 products

=== template literal types split the route string ===
  GET /products → get /products
  POST /products → post /products
  MethodOf<'DELETE …'> = "delete", PathOf<'DELETE …'> = "/products/:id"
```

**Why this design is worth understanding**

- **The route map is the single source of truth.** Add `'PATCH /products/:id'` to
  `ApiRoutes` and: `RouteName` grows, `ApiClient` demands a new method, `RequestOptions`
  produces the right option shape, and `ResponseOf` types the return — no other file
  edited, and nothing forgotten.
- **`RequestOptions<R>` forbids what a route does not accept.** `body` on a GET is
  `body?: undefined`, so passing one is a compile error rather than a silently ignored
  argument. Verified in the comment block.
- **`Awaited<ReturnType<typeof request<'GET /products'>>>`** shows three utilities
  composing with TypeScript's *instantiation expressions*: the type argument is
  supplied to a value, and the result is a concrete type. `Parameters<…>` then lets
  the demo re-issue a call from a stored argument array.
- **One cast, documented.** `transport()` is loosely typed internally and
  `request()` casts at the boundary — the pattern from file 7's event bus. The public
  API remains fully checked; the escape hatch is one line, in one place, with a
  comment explaining the contract that makes it safe.
- **The generated handler keys are printed at runtime** (`onCreated`, `onUpdated`,
  `onDeleted`, `onBulk-imported`), so you can see the mapping the compiler is
  enforcing. Two details worth noticing: the key is `onCreated`, **not** `onCreate`
  (the map key is `created`), and `'bulk-imported'` keeps its dash because
  `Capitalize` only uppercases the first character. The compiler told us about the
  first one — `TS2561 … Did you mean to write 'onCreated'?` — which is exactly the
  kind of typo a hand-written interface would have let through.
- **`ApiError` carries structured data** (`status`, `route`) instead of a formatted
  string, so callers can branch on `status === 404` while still having a good
  `message` for logs. In Part 15 this becomes the error type your data layer
  re-exports.

> 🏭 **Where this leads.** Part 15 builds the same idea with real `fetch`, TanStack
> Query keys, and Zod-validated responses. What you have here is the *type* half:
> routes as types, responses derived, options constrained per route. That habit —
> deriving from a single map instead of hand-writing parallel types — is the single
> biggest reason large TypeScript codebases stay consistent.

---

## 11. Summary

- **Derive types instead of duplicating them.** Types that describe the same data
  drift; a derived type cannot.
- **Object shapers:** `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`,
  `NonNullable` — with `Partial`/`Readonly` **shallow**, and `Omit` removing keys from
  the *type*, never from the *value*.
- **`Record<Union, V>` is exhaustive**; plain string keys lose that protection.
- They are all **mapped types** (`{ [K in keyof T]?: T[K] }`). You can write your own:
  `Optional<T, K>`, `WithRequired<T, K>`, `DeepPartial<T>`, `Mutable<T>`.
- **Key remapping** (`as \`on${Capitalize<K>}\``) generates interfaces such as event
  handlers straight from a data map — remember `keyof T & string`.
- **`Exclude`/`Extract` distribute** over unions; **`Pick`/`Omit` do not**, and
  `Omit<Union, K>` can collapse to `{}` and accept anything. Use `DistributiveOmit`.
- **Function utilities:** `Parameters`, `ReturnType`, `Awaited`,
  `ConstructorParameters`, `InstanceType` — with **`Parameters` using the last
  overload**.
- **Conditional types + `infer`** are the machinery underneath: read
  `T extends { response: infer R } ? R : never` as "if it has a response, use its type".
- **Template literal types** (`Uppercase`, `Capitalize`, `${infer X} ${infer Y}`) turn
  string literals into unions, which is how you model routes and generated names.
- **React's own:** `ComponentProps`, `ComponentPropsWithoutRef`, `PropsWithChildren`,
  `ElementType`, `ReactNode`, `Dispatch<SetStateAction<T>>`, `RefObject<T>` — derive,
  never re-declare.
- **Test your types.** `@ts-expect-error` fails the build when the error it expects
  does not happen. It caught a wrong assumption in this very file.

**What's next →** [`11-typescript-react.md`](./11-typescript-react.md): everything from
this part applied to React — typing props, events, refs, hooks, children, generic
components, `useReducer`, context, and the `.tsx`-specific gotchas, all verified
against React 19.
