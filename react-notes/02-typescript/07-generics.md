# 07 — Generics

> **Part 2 · TypeScript · File 7 of 11**
>
> **Why this file exists:** generics are how you write one function that works for
> *many* types **without throwing type information away**. `useState`, `.map`,
> `Promise`, `Record`, your API layer, your custom hooks — generic. This file takes
> you from "I can read `<T>`" to "I can design it", including the places where
> TypeScript's generic system genuinely cannot help you.

---

## 1. The problem generics solve

Say you need "return the first item of a list". Three attempts:

```ts
// Attempt 1: one function per type — duplication that grows forever
function firstString(items: string[]): string | undefined { return items[0]; }
function firstNumber(items: number[]): number | undefined { return items[0]; }
// …and now for Product, Order, User, and the 40 types you add next year.

// Attempt 2: `any` — no duplication, but the information is destroyed
function firstAny(items: any[]): any { return items[0]; }
const value = firstAny(['a', 'b']);
// value.length;      // compiles, but there is NO checking: value is `any`

// Attempt 3: generic — no duplication, and the type is preserved
function first<T>(items: readonly T[]): T | undefined { return items[0]; }
const firstStringValue = first(['a', 'b']);
// firstStringValue.length;    // ✅ string — the type came back
```

`<T>` declares a **type parameter**: a placeholder for a type that will be supplied
by the caller. TypeScript **infers** it from the arguments, so callers usually never
write it.

```ts
function identity<T>(value: T): T { return value; }

identity('x');            // T inferred as 'x'      → returns 'x'
identity([1, 2]);         // T inferred as number[] → returns number[]
identity({ id: 1 });      // T inferred as { id: number }
identity(null);           // T inferred as null
identity<string>('x');    // explicitly T = string  → returns string
```

The last line is an **explicit type argument**. You add it when inference cannot
work — most often when there are no arguments to infer from:

```ts
const emptyMap = new Map();          // Map<any, any>   ← no checking at all
const emptySet = new Set();          // Set<unknown>    ← checks, but awkward
const stringMap = new Map<string, number>();  // ✅ what you almost always want

const populatedMap = new Map([['a', 1] as const]);  // Map<"a", 1> — literal types!
```

> ⚠️ **`new Map()` with no type arguments is the single most common untyped hole in
> modern React codebases.** It becomes `Map<any, any>`: `get` returns `any`, so
> typos and type mismatches sail through. Always write both type arguments (or
> `new Map<string, User>()`).

### Naming conventions

| Letter | Convention | Example |
| --- | --- | --- |
| `T`, `U`, `V` | a general type / successive types | `function pair<T, U>(a: T, b: U)` |
| `K` | a **k**ey | `groupBy<T, K extends string>` |
| `V` | a **v**alue | `createCache<K, V>` |
| `E` | an **e**rror, or an **e**vent map | `Result<T, E>`, `EventBus<E>` |
| `P`, `R` | **p**rops / **r**esult | `mapProps<P, R>` |
| `S` | **s**tate | `useState<S>` |

Single letters are conventional for one or two parameters. For public APIs with
several parameters, **descriptive names are kinder**: `createCache<KeyType, ValueType>`
is easier to read in editor popups than `Cache<K, V>` if you have never seen the file.

---

## 2. Generic constraints: `extends`

A type parameter with no constraint may be *any* type, so you may not assume
anything about it:

```ts
function longest<T>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
  // ❌ TS2339: Property 'length' does not exist on type 'T'.
}
```

`extends` states a **requirement** — the minimum every `T` must provide:

```ts
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}

longest('abc', 'ab');      // ✅ "abc"
longest([1, 2], [1]);      // ✅ [1, 2]
longest(1, 2);
// ❌ TS2345: Argument of type 'number' is not assignable to parameter of type '{ length: number; }'.
```

This is the generic equivalent of a parameter type annotation: it makes the
requirement checkable at the call site and usable inside the body. In React you
will meet it as `<T extends object>` (props), `<T extends HTMLElement>`
(`useRef<HTMLDivElement>`), and `<T extends unknown[]>` (tuple-returning helpers).

### `keyof` constraints and indexed access — the killer combination

```ts
function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

pluck(users, 'name');        // string[]      ← T[K] resolved to string
pluck(users, 'age');         // number[]      ← and here to number
pluck(users, 'email');
// ❌ TS2345: Argument of type '"email"' is not assignable to parameter of type 'keyof User'.
```

Read the two moving parts slowly, because they unlock a whole class of APIs:

- **`K extends keyof T`** — "K must be one of T's own property names". The compiler
  therefore knows `item[key]` is legal *and* that typos are impossible.
- **`T[K]`** — an **indexed access type**: "the type of T at key K". The return type
  is *computed per call*, which is why `pluck(users, 'name')` is `string[]` and
  `pluck(users, 'age')` is `number[]` from one signature.

This pattern is everywhere: `Object.keys`, form libraries that return
`{ [K in keyof T]: string }` for errors, table components whose `columns` array is
typed `Array<{ key: K extends keyof T ? K : never }>`, and React Hook Form's
`register('email')`.

### Default type parameters

```ts
interface Box<T = string> { value: T }

const implicit: Box = { value: 'hello' };   // Box<string>
const numeric: Box<number> = { value: 42 }; // Box<number>
```

Defaults make a generic optional: `useState<S>()` and `Result<T, E = Error>` both
rely on this. They must come **after** parameters without defaults.

---

## 3. Generic functions, types, and classes

```ts
// generic function
function first<T>(items: readonly T[]): T | undefined { return items[0]; }

// generic type alias
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
type Pair<T> = readonly [T, T];
type Handler<P> = (payload: P) => void;

// generic interface
interface Cache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
}

// generic class
class EventBus<E extends Record<string, unknown>> {
  on<K extends keyof E & string>(event: K, handler: (payload: E[K]) => void): () => void { /* … */ return () => {}; }
}

// generic factory function — often nicer than `new Class<…>()`
function createEventBus<E extends Record<string, unknown>>(): EventBus<E> {
  return new EventBus<E>();
}
```

The **generic factory** deserves a highlight: it is how you get a generic *object*
while still allowing inference:

```ts
const bus = createEventBus<AppEvents>();   // one type argument, one place
```

### Generics and variance, briefly

Two facts from file 6 apply to generic positions too, and they explain some
otherwise-baffling errors:

- **Type parameters are not "any type"** — inside the body, `T` is an unknown type
  that only satisfies its constraint. That is why `a.length` fails without
  `extends { length: number }`.
- **Method syntax is bivariant, property syntax is contravariant.** This is why a
  listener declared `(payload: { sku: string }) => void` is *accepted* by a method
  `on(...)` expecting `(payload: { sku: string; quantity: number }) => void`, while
  a completely unrelated parameter type like `(payload: number) => void` is
  rejected in **both** syntaxes (verified in the lab).

**You cannot fully seal a heterogeneous container with generics.** The challenge
below stores listeners per event name in one `Map`, which forces two documented
casts. That is normal: when a data structure maps *different keys to different
value types*, TypeScript needs help at the boundary. The trick is to keep the
escape hatch **inside** the implementation and keep the public API fully typed.

---

## 4. Generics in React (why you care)

You will read and write these constantly:

```tsx
const [count, setCount] = useState<number>(0);            // useState<S>(initial: S)
const [user, setUser] = useState<User | null>(null);      // explicit: null is ambiguous
const inputRef = useRef<HTMLInputElement>(null);          // useRef<T>(initial: T | null)

const ids = users.map((user) => user.id);                 // map<U>(cb: (value: T) => U): U[]
const lookup = new Map<string, User>();                   // Map<K, V>
const byId: Record<string, User> = {};                    // Record<K, V>
const theme = createContext<Theme>('light');              // createContext<T>(default: T)
```

Then in your own code:

```tsx
// A typed list component — one component, any item type
interface ListProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;   // React types arrive in file 11
}

function List<T>({ items, keyOf, renderItem }: ListProps<T>) {
  return (
    <ul>
      {items.map((item) => (
        <li key={keyOf(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

<List items={products} keyOf={(p) => p.sku} renderItem={(p) => p.name} />       // T = Product
<List items={users} keyOf={(u) => u.id} renderItem={(u) => u.email} />          // T = User
```

A generic **hook**:

```ts
function useToggle(initial = false): [boolean, () => void] { /* … */ }        // no generics needed
function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] { /* … */ }
// The second function is generic: T is inferred from `initial` and used in both positions.
```

> 💡 **The generic `.tsx` gotcha:** in a `.tsx` file, `<T>` at the start of an arrow
> function is parsed as JSX. Write a comma or a constraint:
> `const identity = <T,>(value: T) => value;` — or better, use a `function`
> declaration, which has no ambiguity. File 11 covers this with a live example.

---

## 5. Inference pitfalls you will actually hit

**Pitfall 1 — the empty array literal.** `const names = [];` is an "evolving array":
TypeScript tracks what you push and infers the type later, which works until you
use the variable in a position where the type must already be known:

```ts
export function makeNames(): string[] {
  const names = [];
  return names;
  // ❌ TS7034: Variable 'names' implicitly has type 'any[]' in some locations where
  //            its type cannot be determined.
  // ❌ TS7005: Variable 'names' implicitly has an 'any[]' type.
}
```

Fix: `const names: string[] = [];` — the annotation stops the evolution. (In React
this is exactly the `useState([])` bug from Part 4: it becomes `never[]`, so nothing
can be pushed into it. Write `useState<string[]>([])`.)

**Pitfall 2 — `readonly T[]` vs `T[]`.** A generic parameter typed `T[]` *rejects*
readonly arrays:

```ts
function first<T>(items: T[]): T | undefined { return items[0]; }
const nums = [1, 2, 3] as const;
first(nums);
// ❌ TS2345: Argument of type 'readonly [1, 2, 3]' is not assignable to parameter of type 'any[]'.
```

Fix: type array parameters as `readonly T[]` so both mutable and readonly arrays
are accepted — the same rule as Part 1's "return copies, accept readonly".

**Pitfall 3 — inference happens per call, left to right (currying).**

```ts
const makePair = <T>(first: T) => (second: T): [T, T] => [first, second];

makePair('a')('b');   // ✅ T = string
makePair('a')(1);
// ❌ TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.
```

`T` is fixed at the **first** call. There is no "infer later" — if the two values
must be independent, they are two type parameters:

```ts
const makePairAny = <A, B>(first: A) => (second: B): [A, B] => [first, second];
makePairAny('a')(1);   // ✅ [string, number]
```

**Pitfall 4 — inference picks the "widest common type" of a union.**

```ts
const mixed = [1, 'two'];         // (string | number)[]
const picked = first(mixed);      // string | number | undefined — narrow before use
```

**Pitfall 5 — no type arguments and nothing to infer from.** `createCache()` with
no arguments cannot know `K`/`V`; write `createCache<string, number>()`. The first
version of the intermediate example below hit exactly this.

---

## 6. Common mistakes

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `function f<T>(x: T) { return x.length }` | `TS2339: Property 'length' does not exist on type 'T'` | constrain: `T extends { length: number }` |
| `new Map()` with no type arguments | Silent `Map<any, any>`; no checking anywhere | `new Map<string, User>()` |
| `const xs = []` then used as a value | `TS7034` / `TS7005`, or an unusable `never[]` in React state | annotate: `const xs: string[] = []` |
| Array parameter typed `T[]` | readonly arrays rejected (`TS2345`) | `readonly T[]` |
| Inferring `T` from two unrelated arguments | Wrong/widened inference | use two type parameters (`<A, B>`) |
| Currying into the wrong order | `T` locked before you meant it | reorder, or use separate parameters |
| `<T>` in a `.tsx` arrow function | Parsed as JSX (`TS1005`) | write `<T,>` or use a `function` declaration |
| Generic purely to look clever | Callers must annotate everything; errors get worse | use `unknown` + narrowing, or a concrete type |
| `any` inside a generic body to "make it work" | Whole generic becomes a lie | cast locally with a comment, or reshape the data |
| Constraint `extends string` when keys are needed | `keyof T` errors | use `K extends keyof T` |
| Default type parameter before a non-default one | `TS2706: Required type parameters may not follow optional type parameters` | reorder |
| Assuming a type parameter "exists" at runtime | `T` is erased; `typeof T` impossible | pass a value (a validator/constructor) instead |

---

## 7. Practice exercises

### Beginner

1. Predict the inferred `T` for each call, then check with `tsc --declaration`:

```ts
function wrap<T>(value: T): { value: T } { return { value }; }
wrap('a');
wrap([1, 2]);
wrap({ id: 1 });
wrap(null);
wrap<string | null>(null);
```

2. Why does this not compile, and what is the smallest constraint that fixes it?

```ts
function lastItem<T>(items: T[]): T | undefined { return items[items.length - 1]; }
console.log(lastItem([1, 2, 3] as const));
```

3. What is the inferred type of `cache` — and why is that dangerous?

```ts
const cache = new Map();
cache.set('a', 1);
const value = cache.get('a');
```

**Solution**

**1.** Verified with `--declaration`:

```text
wrap('a')              → { value: "a" }          (the literal, since `const`-like inference)
wrap([1, 2])           → { value: number[] }
wrap({ id: 1 })        → { value: { id: number } }
wrap(null)             → { value: null }         ← T is inferred as `null`, not `unknown`
wrap<string | null>(null) → { value: string | null }   ← explicit argument widens it
```

The `null` case is the important one: **inference takes the argument at face value**.
When the initial value is `null` but the eventual value is a `User`, you must say so
— exactly the reason React code is full of `useState<User | null>(null)`.

**2.** `T[]` does not accept `readonly [1, 2, 3]`:

```text
TS2345: Argument of type 'readonly [1, 2, 3]' is not assignable to parameter of type 'any[]'.
```

Smallest fix — accept readonly arrays:

```ts
function lastItem<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}
```

(There is no constraint needed; `readonly T[]` is the fix. Constraint variants like
`T extends unknown[]` exist for different problems — tuple-rest helpers.)

**3.**

```text
cache: Map<any, any>
value: any
```

`new Map()` with no arguments gives TypeScript nothing to infer from, so the
parameters default to `any`. Every `set` and `get` is then unchecked: `cache.set(1, 'x')`
would silently work alongside `cache.set('a', 1)`, and `value` is `any` — so typos
like `value.lenght` compile fine and fail at runtime. Fix:
`new Map<string, number>()`.

### Intermediate

Build a **generic utility toolkit** plus a **generic cache**. This is the code you
would otherwise copy-paste into every project.

```text
ts-playground/src/collections.ts
```

Requirements:

1. `groupBy<T, K extends string>(items: readonly T[], keyOf: (item: T) => K): Record<K, T[]>`.
2. `partition<T>(items: readonly T[], predicate: (item: T) => boolean): [T[], T[]]`.
3. `pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][]`.
4. `uniqueBy<T, K>(items: readonly T[], keyOf: (item: T) => K): T[]`.
5. `firstOrNull<T>(items: readonly T[]): T | null`.
6. `sortBy<T, K extends keyof T>(items: readonly T[], key: K, direction?: 'asc' | 'desc'): T[]`
   — non-mutating, handling numbers, booleans and strings.
7. `createCache<K, V>(options?)` returning a `Cache<K, V>` interface with
   `get/set/has/delete/size/stats()/entries()`, supporting `maxSize` (LRU eviction),
   `ttlMs`, an **injected `now` clock**, and an `onEvict` callback.
8. Demo on a `Product[]` list, and show the cache evicting by LRU and expiring by TTL
   — deterministically, thanks to the injected clock.
9. Comment block with compile-time rejections.

**Solution**

```text
ts-playground/src/collections.ts
```

```ts
export {};

// ---------------------------------------------------------------- domain
interface Product {
  sku: string;
  name: string;
  category: string;
  priceMinor: number;
  inStock: boolean;
}

// ---------------------------------------------------------------- generic helpers
// T is captured from the argument; K is captured from the callback's return type.
// The result type `Record<K, T[]>` is computed from BOTH type parameters.
function groupBy<T, K extends string>(
  items: readonly T[],
  keyOf: (item: T) => K
): Record<K, T[]> {
  const groups = {} as Record<K, T[]>;
  for (const item of items) {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}

// A tuple return type: the first element passed, the second failed.
function partition<T>(items: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  const passed: T[] = [];
  const failed: T[] = [];
  for (const item of items) (predicate(item) ? passed : failed).push(item);
  return [passed, failed];
}

// K extends keyof T + the indexed access type T[K] = "the type of that property".
// `pluck(products, 'name')` returns string[]; `pluck(products, 'priceMinor')` number[].
function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

function uniqueBy<T, K>(items: readonly T[], keyOf: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function firstOrNull<T>(items: readonly T[]): T | null {
  return items.length > 0 ? items[0] ?? null : null;
}

function sortBy<T, K extends keyof T>(
  items: readonly T[],
  key: K,
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (typeof left === 'number' && typeof right === 'number') return sign * (left - right);
    if (typeof left === 'boolean' && typeof right === 'boolean') {
      return sign * (Number(left) - Number(right));
    }
    return sign * String(left).localeCompare(String(right));
  });
}

// ---------------------------------------------------------------- a generic cache
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
}

interface Cache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  readonly size: number;
  stats(): CacheStats;
  entries(): Array<[K, V]>;
}

interface CacheOptions<K, V> {
  maxSize?: number;
  ttlMs?: number;
  /** Injected clock: makes expiry testable and deterministic. */
  now?: () => number;
  onEvict?: (key: K, value: V, reason: 'lru' | 'expired') => void;
}

function createCache<K, V>(options: CacheOptions<K, V> = {}): Cache<K, V> {
  const maxSize = options.maxSize ?? Infinity;
  const ttlMs = options.ttlMs ?? Infinity;
  const now = options.now ?? Date.now;
  const onEvict = options.onEvict;

  const store = new Map<K, { value: V; expiresAt: number }>();
  const stats: CacheStats = { hits: 0, misses: 0, evictions: 0, expirations: 0 };

  const isExpired = (entry: { expiresAt: number }): boolean => entry.expiresAt <= now();

  return {
    get(key) {
      const entry = store.get(key);
      if (entry === undefined) {
        stats.misses += 1;
        return undefined;
      }
      if (isExpired(entry)) {
        store.delete(key);
        stats.expirations += 1;
        stats.misses += 1;
        onEvict?.(key, entry.value, 'expired');
        return undefined;
      }
      // Refresh recency: delete + re-insert moves the key to the end of the Map.
      store.delete(key);
      store.set(key, entry);
      stats.hits += 1;
      return entry.value;
    },

    set(key, value) {
      if (store.has(key)) store.delete(key);
      store.set(key, { value, expiresAt: now() + ttlMs });
      while (store.size > maxSize) {
        const oldest = store.keys().next();
        if (oldest.done === true) break;
        const evicted = store.get(oldest.value);
        store.delete(oldest.value);
        stats.evictions += 1;
        if (evicted !== undefined) onEvict?.(oldest.value, evicted.value, 'lru');
      }
    },

    has(key) {
      const entry = store.get(key);
      return entry !== undefined && !isExpired(entry);
    },

    delete(key) {
      return store.delete(key);
    },

    get size() {
      return store.size;
    },

    stats() {
      return { ...stats };
    },

    entries() {
      return [...store.entries()].map(([key, entry]) => [key, entry.value] as [K, V]);
    },
  };
}

// ---------------------------------------------------------------- demo
const products: readonly Product[] = [
  { sku: 'KBD-1', name: 'Mechanical Keyboard', category: 'input', priceMinor: 499900, inStock: true },
  { sku: 'MOU-1', name: 'Wireless Mouse', category: 'input', priceMinor: 129900, inStock: false },
  { sku: 'MON-1', name: '27" Monitor', category: 'display', priceMinor: 1899900, inStock: true },
  { sku: 'MON-2', name: '32" Monitor', category: 'display', priceMinor: 2499900, inStock: true },
  { sku: 'KBD-2', name: 'Mechanical Keyboard', category: 'input', priceMinor: 499900, inStock: true },
];

function main(): void {
  console.log('=== groupBy: K comes from the callback return type ===');
  const byCategory = groupBy(products, (product) => product.category);
  for (const category of Object.keys(byCategory).sort()) {
    console.log(`  ${category}: ${byCategory[category].map((p) => p.sku).join(', ')}`);
  }

  console.log('\n=== partition ===');
  const [inStock, outOfStock] = partition(products, (product) => product.inStock);
  console.log(`  in stock (${inStock.length}): ${inStock.map((p) => p.sku).join(', ')}`);
  console.log(`  out of stock (${outOfStock.length}): ${outOfStock.map((p) => p.sku).join(', ')}`);

  console.log('\n=== pluck: T[K][] ===');
  console.log('  names:', pluck(products, 'name').join(' | '));
  console.log('  prices:', pluck(products, 'priceMinor'));

  console.log('\n=== uniqueBy ===');
  const uniqueNames = uniqueBy(products, (product) => product.name);
  console.log(`  ${products.length} products → ${uniqueNames.length} unique names`);

  console.log('\n=== sortBy + firstOrNull ===');
  console.log('  cheapest first:', sortBy(products, 'priceMinor').map((p) => p.priceMinor));
  console.log('  most expensive:', sortBy(products, 'priceMinor', 'desc')[0]?.name);
  console.log('  first or null (empty):', firstOrNull([]));

  console.log('\n=== createCache: explicit type arguments, because there are no arguments to infer from ===');
  let clock = 0;
  const evictions: string[] = [];

  const priceCache = createCache<string, number>({
    maxSize: 2,
    ttlMs: 100,
    now: () => clock,
    onEvict: (key, value, reason) => {
      evictions.push(`${key} (${reason}) was ₹${(value / 100).toFixed(2)}`);
    },
  });

  priceCache.set('KBD-1', 499900);
  priceCache.set('MOU-1', 129900);
  console.log('  size after two inserts:', priceCache.size);
  console.log('  read KBD-1 (a hit, refreshes recency):', priceCache.get('KBD-1'));
  priceCache.set('MON-1', 1899900);
  console.log('  size stays at maxSize:', priceCache.size, '| evicted:', evictions);
  console.log('  cache content:', priceCache.entries().map(([key, value]) => `${key}=${value}`).join(', '));

  console.log('\n  --- time passes (clock is injected, so this is deterministic) ---');
  clock = 50;
  console.log('  at t=50, MON-1:', priceCache.get('MON-1'));
  clock = 150;
  console.log('  at t=150, MON-1 (ttl was 100ms):', priceCache.get('MON-1'));
  console.log('  eviction log:', evictions);
  console.log('  stats:', priceCache.stats());
}

main();

/* ---------------------------------------------------------------------------
   REJECTED AT COMPILE TIME (uncomment to see each error)

   // 1. An unknown property name
   // pluck(products, 'price');
   //   TS2345: Argument of type '"price"' is not assignable to parameter of type
   //           'keyof Product'.

   // 2. The wrong value type in a cache with explicit type arguments
   // const strictCache = createCache<string, number>();
   // strictCache.set('KBD-1', 'free');
   //   TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

   // 3. A callback that returns the wrong key type
   // groupBy(products, (product) => product.priceMinor);
   //   TS2345: Argument of type '(product: Product) => number' is not assignable to
   //           parameter of type '(item: T) => K'  — K is constrained to string.

   // 4. Destructuring partition into the wrong shape
   // const [a, b, c] = partition(products, (p) => p.inStock);
   //   TS2493: Tuple type '[Product[], Product[]]' of length '2' has no element at index '2'.
---------------------------------------------------------------------------- */
```

**Run it**

```bash
npx tsx src/collections.ts
```

**Expected output**

```text
=== groupBy: K comes from the callback return type ===
  display: MON-1, MON-2
  input: KBD-1, MOU-1, KBD-2

=== partition ===
  in stock (4): KBD-1, MON-1, MON-2, KBD-2
  out of stock (1): MOU-1

=== pluck: T[K][] ===
  names: Mechanical Keyboard | Wireless Mouse | 27" Monitor | 32" Monitor | Mechanical Keyboard
  prices: [ 499900, 129900, 1899900, 2499900, 499900 ]

=== uniqueBy ===
  5 products → 4 unique names

=== sortBy + firstOrNull ===
  cheapest first: [ 129900, 499900, 499900, 1899900, 2499900 ]
  most expensive: 32" Monitor
  first or null (empty): null

=== createCache: explicit type arguments, because there are no arguments to infer from ===
  size after two inserts: 2
  read KBD-1 (a hit, refreshes recency): 499900
  size stays at maxSize: 2 | evicted: [ 'MOU-1 (lru) was ₹1299.00' ]
  cache content: KBD-1=499900, MON-1=1899900

  --- time passes (clock is injected, so this is deterministic) ---
  at t=50, MON-1: 1899900
  at t=150, MON-1 (ttl was 100ms): undefined
  eviction log: [ 'MOU-1 (lru) was ₹1299.00', 'MON-1 (expired) was ₹18999.00' ]
  stats: { hits: 2, misses: 1, evictions: 1, expirations: 1 }
```

**Design notes worth absorbing**

- **`Record<K, T[]>` is a computed return type.** `groupBy(products, (p) => p.category)`
  returns something typed `Record<'input' | 'display', Product[]>` — and editor
  completion on `byCategory.` lists exactly those two keys.
- **`pluck<T, K extends keyof T>` returns `T[K][]`**, so the element type follows the
  key. One function, fully typed results, no overloads.
- **`partition` returns a tuple `[T[], T[]]`,** which makes `const [inStock, out] = …`
  work and rejects destructuring a third element
  (`TS2493: Tuple type '[Product[], Product[]]' of length '2' has no element at index '2'`).
- **`sortBy` reuses the null-safe comparison style from file 4** but is now generic;
  note it copies with `[...items]` before sorting so callers' arrays are untouched.
- **`createCache<K, V>` needs explicit type arguments** (`createCache<string, number>(…)`)
  for the same reason `new Map()` does: there are no value arguments to infer from.
- **The injected `now` clock is a testing decision, not a type decision** — and it is
  why the expected output above is reproducible. Time-dependent code without an
  injected clock produces flaky tests and unexplainable demos.
- **`onEvict?: (key: K, value: V, reason: 'lru' | 'expired') => void`** uses `K` and
  `V` from the enclosing generic — a callback parameter typed by the *same* type
  parameters as the factory. That is the pattern React hooks use for their callbacks.
- **`get` re-inserts on a hit** (`store.delete(key); store.set(key, entry)`) because a
  `Map` preserves insertion order — that single trick is what makes LRU eviction a
  one-liner (`store.keys().next()` is the least recently used key).

### Challenge

Build a **fully typed event bus** with an event map. This is the pattern behind
typed pub/sub libraries, `mitt`, and — most importantly — the mental model for
Redux/context/reducer actions you will write in Parts 4 and 9.

```text
ts-playground/src/event-bus.ts
```

Requirements:

1. An `AppEvents` **type** map: `'cart:item-added': { sku: string; quantity: number }`,
   `'cart:item-removed': { sku: string }`, `'cart:cleared': undefined`,
   `'user:logged-in': { userId: string; displayName: string }`,
   `'search:changed': { query: string; resultCount: number }`.
2. `EventBus<E extends Record<string, unknown>>` as a **class** with:
   `on<K extends keyof E & string>(event, handler)` returning an **unsubscribe
   function**, `once(...)`, `emit<K>(event, payload: E[K])`, `listenerCount(event?)`,
   a generic `reduce<T>(initial, step)` over the registered event names, `clear()`,
   and a `get emitted()` counter.
3. `createEventBus<E>()` — a generic factory.
4. Demo: multiple listeners on one event; a self-removing `once` listener; unsubscribing
   by calling the returned function; listener counts; a `reduce` over remaining
   listeners; and confirming a later `emit` still reaches an earlier-registered listener.
5. A comment block listing the compile-time rejections **with their real error codes**.

**Solution**

```text
ts-playground/src/event-bus.ts
```

```ts
export {};

// ---------------------------------------------------------------- the event map
// One interface describes EVERYTHING the bus can carry. Each key is an event
// name; each value is that event's payload type.
// NOTE: this is a `type`, not an `interface`. Interfaces do not receive an
// implicit index signature, so `EventBus<AppEvents>` fails with
//   TS2344: Type 'AppEvents' does not satisfy the constraint 'Record<string, unknown>'.
//   Index signature for type 'string' is missing in type 'AppEvents'.
// A type alias of an object literal shape DOES satisfy it. See the note below.
type AppEvents = {
  'cart:item-added': { sku: string; quantity: number };
  'cart:item-removed': { sku: string };
  'cart:cleared': undefined;
  'user:logged-in': { userId: string; displayName: string };
  'search:changed': { query: string; resultCount: number };
};

type EventName<E> = keyof E & string;
type Handler<P> = (payload: P) => void;

// ---------------------------------------------------------------- the bus
// E extends Record<string, unknown> guarantees "an object whose values are
// payloads". Everything else is derived from it with keyof + indexed access.
class EventBus<E extends Record<string, unknown>> {
  // One map holds every listener. The values are widened to `(payload: never) => void`
  // because TypeScript cannot prove a per-key handler type for a Map — see the note
  // after the output for why, and why the two casts below are safe.
  private readonly listeners = new Map<EventName<E>, Set<Handler<never>>>();
  private emitCount = 0;

  on<K extends EventName<E>>(event: K, handler: Handler<E[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set<Handler<never>>();
    set.add(handler as Handler<never>);
    this.listeners.set(event, set);

    // Returning the unsubscribe function is the same contract as useEffect's
    // cleanup (Part 4): the caller stores it and calls it to detach.
    return () => {
      set.delete(handler as Handler<never>);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  once<K extends EventName<E>>(event: K, handler: Handler<E[K]>): () => void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  emit<K extends EventName<E>>(event: K, payload: E[K]): void {
    this.emitCount += 1;
    const set = this.listeners.get(event);
    if (set === undefined) return;
    // Copy first: a listener may unsubscribe itself, which mutates `set`.
    for (const handler of [...set]) {
      (handler as Handler<E[K]>)(payload);
    }
  }

  listenerCount<K extends EventName<E>>(event?: K): number {
    if (event === undefined) {
      let total = 0;
      for (const set of this.listeners.values()) total += set.size;
      return total;
    }
    return this.listeners.get(event)?.size ?? 0;
  }

  // A generic method with its own type parameter, independent of E.
  reduce<T>(initial: T, step: (accumulator: T, event: EventName<E>, count: number) => T): T {
    let accumulator = initial;
    for (const [event, set] of this.listeners) {
      accumulator = step(accumulator, event, set.size);
    }
    return accumulator;
  }

  clear(): void {
    this.listeners.clear();
  }

  get emitted(): number {
    return this.emitCount;
  }
}

// A generic factory: no class keyword at the call site, return type inferred.
function createEventBus<E extends Record<string, unknown>>(): EventBus<E> {
  return new EventBus<E>();
}

// ---------------------------------------------------------------- demo
function main(): void {
  const bus = createEventBus<AppEvents>();
  const log: string[] = [];

  // Several listeners on the same event, each with the payload type for THAT key.
  const offWelcome = bus.on('user:logged-in', ({ displayName }) => log.push(`welcome ${displayName}`));
  bus.on('user:logged-in', ({ userId }) => log.push(`loading prefs for ${userId}`));
  const offAudit = bus.on('cart:item-added', ({ sku, quantity }) => log.push(`+ ${quantity} × ${sku}`));

  bus.once('cart:cleared', () => log.push('cart cleared (once only)'));

  bus.emit('user:logged-in', { userId: 'u1', displayName: 'Ada' });
  console.log('=== after login ===');
  console.log(' ', log);

  bus.emit('cart:item-added', { sku: 'KBD-1', quantity: 2 });
  bus.emit('cart:item-added', { sku: 'MOU-1', quantity: 1 });
  bus.emit('cart:cleared', undefined);
  bus.emit('cart:cleared', undefined);   // the `once` listener is gone

  console.log('\n=== after cart traffic ===');
  for (const line of log) console.log(`  ${line}`);

  console.log('\n=== unsubscribing works ===');
  offAudit();                                   // stop auditing cart additions
  offWelcome();                                 // stop the welcome message
  bus.emit('cart:item-added', { sku: 'MON-1', quantity: 1 });
  bus.emit('user:logged-in', { userId: 'u2', displayName: 'Grace' });
  console.log(' ', log.slice(-2));

  console.log('\n=== counts ===');
  console.log('  listeners on cart:item-added:', bus.listenerCount('cart:item-added'));
  console.log('  listeners on user:logged-in:', bus.listenerCount('user:logged-in'));
  console.log('  total listeners:', bus.listenerCount());
  console.log('  emits so far:', bus.emitted);

  console.log('\n=== generic reduce() over the listeners that remain ===');
  bus.on('search:changed', ({ query, resultCount }) => {
    console.log(`  "${query}" → ${resultCount} results`);
  });
  const summary = bus.reduce<string[]>([], (lines, event, count) => [
    ...lines,
    `${event} → ${count} listener${count === 1 ? '' : 's'}`,
  ]);
  for (const line of summary) console.log(`  ${line}`);

  console.log('\n=== the search listener registered above is still attached ===');
  bus.emit('search:changed', { query: 'mechanical keyboard', resultCount: 4 });

  console.log('\n=== after clear() ===');
  bus.clear();
  console.log('  total listeners:', bus.listenerCount());
}

main();

/* ---------------------------------------------------------------------------
   REJECTED AT COMPILE TIME (uncomment to see each error)

   const bus = new EventBus<AppEvents>();

   // 1. Unknown event name
   // bus.emit('cart:checkout', {});
   //   TS2345: Argument of type '"cart:checkout"' is not assignable to parameter of
   //           type '"cart:item-added" | "cart:item-removed" | "cart:cleared" |
   //                  "user:logged-in" | "search:changed"'.

   // 2. Missing a required field in the payload
   // bus.emit('cart:item-added', { sku: 'KBD-1' });
   //   TS2345: Argument of type '{ sku: string; }' is not assignable to parameter of
   //           type '{ sku: string; quantity: number; }'.
   //           Property 'quantity' is missing.

   // 3. Wrong payload field type (the error points INSIDE the literal, hence TS2322)
   // bus.emit('cart:item-added', { sku: 'KBD-1', quantity: 'two' });
   //   TS2322: Type 'string' is not assignable to type 'number'.

   // 4. A payload for an event that carries none
   // bus.emit('cart:cleared', {});
   //   TS2345: Argument of type '{}' is not assignable to parameter of type 'undefined'.

   // 5. A handler whose parameter is unrelated to the event payload.
   //    (Note: a NARROWER handler parameter, e.g. (p: { sku: string }), is ACCEPTED,
   //    because `on` is declared with method syntax and methods are bivariant — the
   //    rule from file 06. An unrelated type is rejected in both directions.)
   // bus.on('cart:item-added', (payload: number) => console.log(payload));
   //   TS2345: Argument of type '(payload: number) => void' is not assignable to
   //           parameter of type '(payload: { sku: string; quantity: number; }) => void'.

   // 6. Forgetting an argument
   // bus.emit('cart:cleared');
   //   TS2554: Expected 2 arguments, but got 1.
---------------------------------------------------------------------------- */
```

**Run it**

```bash
npx tsx src/event-bus.ts
```

**Expected output**

```text
=== after login ===
  [ 'welcome Ada', 'loading prefs for u1' ]

=== after cart traffic ===
  welcome Ada
  loading prefs for u1
  + 2 × KBD-1
  + 1 × MOU-1
  cart cleared (once only)

=== unsubscribing works ===
  [ 'cart cleared (once only)', 'loading prefs for u2' ]

=== counts ===
  listeners on cart:item-added: 0
  listeners on user:logged-in: 1
  total listeners: 1
  emits so far: 7

=== generic reduce() over the listeners that remain ===
  user:logged-in → 1 listener
  search:changed → 1 listener

=== the search listener registered above is still attached ===
  "mechanical keyboard" → 4 results

=== after clear() ===
  total listeners: 0
```

**Why the two casts are necessary (and why they are safe)**

```ts
private readonly listeners = new Map<EventName<E>, Set<Handler<never>>>();
//                                                        ^^^^^^^^^^^^^^^^^^
// on():  set.add(handler as Handler<never>);
// emit(): (handler as Handler<E[K]>)(payload);
```

A `Map<K, V>` has **one** value type. The bus needs *different* value types per key —
`Set<Handler<{ sku: string; quantity: number }>>` for one event and
`Set<Handler<{ userId: string; displayName: string }>>` for another. TypeScript has no
way to express "a map whose value type depends on the key" (you would need
dependent types). So the implementation stores the widest safe shape
(`Handler<never>`, since every handler accepts *something*) and casts at the two
boundaries:

- **`on`**: a `Handler<E[K]>` is added. The cast is safe because only `emit` will
  ever call it, and `emit` is constrained to the same `K`.
- **`emit`**: the stored `Handler<never>` is called with `E[K]`. Safe for the same
  reason, from the other side.

**Everything a caller can write is still checked** — unknown event names, wrong
payload shapes, missing fields, and unrelated handler parameters are all compile
errors (the comment block proves it). That is the rule: *push the cast inside,
keep the public surface honest.* If you ever see a cast in a `.ts` file, the right
question is not "how do I remove it?" but "is it encapsulated, and is it safe for
the reasons documented next to it?"

> 🔍 **The `interface` vs `type` trap that this file hit.** The first version declared
> `interface AppEvents { … }` and `EventBus<E extends Record<string, unknown>>`. It
> failed to compile:
>
> ```text
> TS2344: Type 'AppEvents' does not satisfy the constraint 'Record<string, unknown>'.
>   Index signature for type 'string' is missing in type 'AppEvents'.
> ```
>
> **Interfaces do not get implicit index signatures; object-literal type aliases do.**
> So `type AppEvents = { … }` satisfies `Record<string, unknown>` while
> `interface AppEvents { … }` does not — even though both describe the same shape.
> Two fixes, both correct:
>
> ```ts
> type AppEvents = { … };                       // 1. use a type alias (chosen here)
> class EventBus<E extends object> { … }        // 2. relax the constraint
> ```
>
> This is one of the few places where `interface` and `type` are **not**
> interchangeable (file 3 said "interfaces for object shapes" — this is the caveat).
> When a generic constraint rejects an interface that clearly *looks* right, suspect
> a missing index signature before suspecting anything else.

---

## 8. Summary

- **Generics** let one implementation serve many types while **preserving** type
  information. The alternative — `any` — works at runtime and loses everything at
  compile time.
- **`<T>`** declares a type parameter; it is usually **inferred** from arguments.
  Add explicit type arguments when there is nothing to infer from
  (`new Map<string, User>()`, `createCache<string, number>()`, `useState<User | null>(null)`).
- **Constraints** (`T extends { length: number }`) are the generic form of a
  parameter type: they make the body legal and the call site checkable.
- **`K extends keyof T`** plus the indexed access **`T[K]`** produce per-call return
  types — the combination behind `pluck`, `groupBy`, form field typing, and table
  columns.
- **Default type parameters** (`<T = string>`, `E = Error`) make a generic optional;
  they must follow non-defaulted ones.
- Generic **functions**, **types**, **interfaces**, **classes** and **factories**
  all exist; the factory is often the friendliest API
  (`createEventBus<AppEvents>()`).
- **Pitfalls:** `new Map()` → `Map<any, any>`; `const xs = []` → `TS7034` / `never[]`;
  `T[]` rejects readonly arrays; curried generics lock `T` at the first call; `<T>`
  in `.tsx` needs `<T,>`.
- **Heterogeneous containers cannot be fully typed** — a per-key value type needs
  dependent types. Store the widest safe shape, cast at the two internal boundaries,
  and document why; callers still get full checking.
- **React is generic all the way down:** `useState<S>`, `useRef<T>`, `map<U>`,
  `createContext<T>`, `Record<K, V>`, and every well-written custom hook.

**What's next →** [`08-enums.md`](./08-enums.md): `enum`, `const enum`, and the
modern alternatives — with a clear-eyed verdict on when each is right (and why most
React codebases now reach for union types instead).
