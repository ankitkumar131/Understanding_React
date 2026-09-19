# 01 — Introduction to TypeScript

> **Part 2 · TypeScript · File 1 of 11**
>
> **Why this file exists:** these notes are React **with TypeScript**, so before
> you write a single line of typed React, you need to know what TypeScript
> actually is, what it does at compile time, what it does *not* do at runtime, and
> how the type checker fits into the React toolchain. Get this mental model right
> and everything afterwards is just syntax.

---

## 1. What TypeScript is

**TypeScript is JavaScript plus a type system.**

```text
TypeScript  =  JavaScript  +  types  +  a compiler that checks them
```

Every valid JavaScript file is *almost* a valid TypeScript file — you can rename
`.js` to `.ts` and it will usually work. TypeScript adds:

- **Type annotations** you write: `let age: number = 36;`
- **Type inference** it works out for you: `let age = 36;` → `age` is a `number`
- **A compiler (`tsc`)** that reports mistakes *before* your code runs
- **Editor intelligence** — autocomplete, hover types, rename, find references

What it is **not**:

- ❌ A different language that replaces JavaScript
- ❌ A runtime that makes your code faster
- ❌ A security tool, or a replacement for validating data from the network

> **The one-sentence mental model:** TypeScript is a **linter for shapes**. You
> describe what your data looks like; it complains when the code disagrees.
> Then the types are thrown away and the plain JavaScript runs.

---

## 2. Why it exists: the bug class it deletes

Imagine a tiny React-ish function in plain JavaScript:

```js
// price.js
export function formatPrice(amount) {
  return `₹${amount.toFixed(2)}`;
}
```

```js
// cart.js
import { formatPrice } from './price.js';

const quantity = '2';                       // ⚠️ a STRING, from a form input
const unitPrice = 4999;
const total = unitPrice * quantity;         // works: JS coerces "2" → 2
console.log(formatPrice(total));            // "₹9998.00" ✅
console.log(formatPrice(quantity));         // 💥 runtime crash
```

```text
TypeError: amount.toFixed is not a function
```

The crash happens **when the user opens the page** — possibly in production.

Now the same code in TypeScript:

```ts
// price.ts
export function formatPrice(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}
```

```ts
// cart.ts
import { formatPrice } from './price';

const quantity = '2';               // typed as string by inference
// formatPrice(quantity);
//     ^ ❌ error TS2345: Argument of type 'string' is not assignable
//          to parameter of type 'number'.
```

**The same bug, caught in the editor, before running anything.** That is the
entire value proposition.

Other bug classes TypeScript removes:

| Bug | In JavaScript | In TypeScript |
| --- | --- | --- |
| Typo in a property name (`user.emial`) | `undefined`, silent | error: property does not exist |
| Calling a function with wrong arguments | weird runtime behaviour | error at the call site |
| Forgetting to handle `null` | `Cannot read properties of null` | "possibly null" error |
| Renaming a prop and forgetting a usage | broken component | every usage flagged by rename refactor |
| Passing the wrong shape to a component | blank UI or crash | error listing the missing prop |
| Changing an API response shape | breaks at runtime | error at every consumer |
| Adding a new value to a union | nothing warns you | `never` exhaustiveness error (file 9) |

> 💡 It is not about typing *more*. It is about **failing at 10am in your editor
> instead of failing at 2am in production.**

---

## 3. Types are erased: the most important thing to understand

TypeScript has **no runtime**. The types you write are for the checker only, and
they **disappear completely** when the code runs.

Here is a real, executed demonstration. The file `demo.ts`:

```ts
function add(a: number, b: number): number {
  return a + b;
}

console.log(add(2, 3));
console.log(add('2', 3));   // deliberate type error
```

**The compiler catches the mistake:**

```bash
npx tsc --noEmit --strict demo.ts
```

```text
demo.ts(5,17): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

**But if you ignore the error and run the file anyway, JavaScript runs it:**

```bash
npx tsx demo.ts          # tsx strips the types and runs the JS
```

```text
5
23
```

`add('2', 3)` printed `"23"` — JavaScript's `+` concatenated, because at runtime
there is no such thing as a `number` parameter. The types were stripped, and
`'2' + 3` is `'23'`.

> ⚠️ **Consequences of type erasure you must internalise:**
> 1. **Types cannot validate data from the outside world.** `const data: User = await response.json()` does *nothing* at runtime. If the API sends `{ name: 42 }`, `data.name` is a number and TypeScript is lying to you. Real validation needs a runtime check (Zod — Part 8) or a type guard (file 9).
> 2. **`instanceof` and `typeof` still work** — those are JavaScript.
> 3. **Interfaces and type aliases do not exist at runtime**, so you cannot `console.log(SomeInterface)`.
> 4. **Enums** *do* generate runtime code (file 8 explains why that matters).

---

## 4. How TypeScript fits into a React project

`tsc` is a *checker*, not a bundler, and modern React projects split those jobs:

```text
Your .ts / .tsx source
        │
        ├─── Editor (VS Code) ──────▶ shows red squiggles as you type
        │
        ├─── Vite dev server ───────▶ strips types with esbuild, serves fast
        │                            ⚠️ does NOT type check!
        │
        └─── npm run build ─────────▶ 1. tsc -b      ← type checks the project
                                       2. vite build  ← strips + bundles
```

Three consequences you will actually feel:

1. **Your dev server can run code with type errors.** Vite doesn't block you; the
   errors appear in the editor and in CI. This is deliberate — it keeps the dev
   server fast.
2. **`npm run build` is where type errors become failures.** That is why CI runs
   it, and why you should run it before pushing.
3. **The editor is the main feedback loop.** Run `tsc --noEmit --watch` in a
   terminal if you want project-wide checks as you type.

A typical Vite React + TS `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

> 🏭 **Production habit:** add `"typecheck": "tsc --noEmit"` and run it in CI. It
> gives you the compiler's full opinion without producing build output.

---

## 5. Setting up TypeScript on its own

Before touching React, get it working in a plain folder.

```bash
mkdir ts-playground
cd ts-playground
npm init -y
npm install --save-dev typescript tsx

# Create a starting tsconfig
npx tsc --init
```

`tsx` is a TypeScript runner: it strips types and runs your file, so you can
execute `.ts` files directly like Node runs `.js`. (Node 22.6+ can also run TS
with `node --experimental-strip-types file.ts`, and newer Node versions do it by
default for type-strippable syntax.)

Create your first file:

```text
ts-playground/src/basics.ts
```

```ts
const greeting: string = 'Hello, TypeScript';
const year: number = 2026;
const isReady: boolean = true;

console.log(greeting, year, isReady);

function greet(name: string): string {
  return `${greeting}, ${name}!`;
}

console.log(greet('Ada'));
```

**Run it:**

```bash
npx tsx src/basics.ts
```

**Expected output:**

```text
Hello, TypeScript 2026 true
Hello, TypeScript, Ada!
```

**Check the types:**

```bash
npx tsc --noEmit
```

**Expected output:** nothing at all. Silence means success — a habit worth
noticing, because `tsc` only speaks up when something is wrong.

---

## 6. `tsconfig.json`, explained

`tsconfig.json` is the compiler's configuration. Here is a small, strict,
modern config suitable for a Vite React project, with every option explained:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    "noEmit": true
  },
  "include": ["src"]
}
```

| Option | What it does | Why it is here |
| --- | --- | --- |
| `target` | Which JavaScript version to *emit* (or assume) | `ES2022` keeps modern syntax; React apps ship to modern browsers |
| `lib` | Which built-in APIs exist | `DOM` gives you `document`, `fetch`, `HTMLElement` |
| `module` / `moduleResolution` | How imports are resolved | `bundler` matches what Vite actually does |
| `jsx` | How JSX is compiled | `react-jsx` is the modern automatic runtime (no `import React` needed) |
| **`strict`** | Turns on **all** the important checks | **Never turn this off.** Everything in these notes assumes it |
| `noUnusedLocals` / `noUnusedParameters` | Flags dead variables/parameters | Catches leftovers from refactors |
| `noFallthroughCasesInSwitch` | Flags `switch` cases that fall through | Prevents a classic bug class |
| `noUncheckedIndexedAccess` | `arr[0]` becomes `T \| undefined` | Honest about possibly-missing items |
| `exactOptionalPropertyTypes` | Distinguishes `{a?: string}` from `{a: string \| undefined}` | Prevents subtle optional-prop bugs |
| `verbatimModuleSyntax` | Requires `import type` for type-only imports | Vite/isolated modules need it (see Part 1 file 9) |
| `isolatedModules` | Each file must be transformable alone | Required by bundlers |
| `esModuleInterop` | Lets you import CommonJS modules naturally | Needed for some packages |
| `skipLibCheck` | Skips checking `.d.ts` files in `node_modules` | Much faster builds; library types are already tested |
| `forceConsistentCasingInFileNames` | Case-sensitive imports everywhere | Prevents macOS-works/Linux-fails bugs |
| `noEmit` | Do not write `.js` files | Vite does the emitting; `tsc` only checks |

### What `strict` actually enables

`strict: true` is a shortcut for a group of checks:

| Flag (inside `strict`) | What it prevents |
| --- | --- |
| `noImplicitAny` | Silently treating untyped values as `any` |
| `strictNullChecks` | Using `null`/`undefined` as if they were real values |
| `strictFunctionTypes` | Unsafe function-parameter variance |
| `strictBindCallApply` | Wrong arguments to `bind`/`call`/`apply` |
| `strictPropertyInitialization` | Class fields used before being assigned |
| `noImplicitThis` | `this` with an implied `any` type |
| `alwaysStrict` | Emits `"use strict"` in every file |
| `useUnknownInCatchVariables` | `catch (e)` is `unknown`, not `any` — you must narrow it |

`strictNullChecks` alone removes what may be the single most common runtime crash
in JavaScript: `Cannot read properties of undefined`.

> ⚠️ Turning `strict` off "to get it working" is how projects end up with types
> that provide no safety. If a large existing codebase can't adopt `strict`
> immediately, migrate *uphill*: turn on one flag at a time, file by file, rather
> than never.

---

## 7. Annotations vs inference: how much do you write?

TypeScript works out types from your code. This is **inference**, and it means
you write far fewer annotations than beginners expect.

```ts
// ❌ Noise: the type is obvious from the value
const name: string = 'Ada';
const count: number = 0;
const isOpen: boolean = false;
const items: string[] = ['a', 'b'];

// ✅ Idiomatic: let inference do it
const name2 = 'Ada';         // string
const count2 = 0;            // number
const isOpen2 = false;       // boolean
const items2 = ['a', 'b'];   // string[]
```

**Annotate when inference cannot know your intent:**

```ts
// 1. Function parameters — inference cannot guess callers' arguments
function greet(name: string) { /* ... */ }

// 2. Function return types — recommended for exported functions
export function parsePrice(text: string): number { /* ... */ }

// 3. Empty containers — `[]` would infer `never[]`
const users: User[] = [];

// 4. Values that are wider than you want
let status: 'idle' | 'loading' | 'error' = 'idle';   // not just `string`

// 5. API/DTO shapes you want the compiler to enforce
const payload: CreateUserInput = { name: 'Ada', email: 'ada@example.com' };
```

**Rule of thumb:** annotate **boundaries** (function signatures, exported APIs,
empty collections, state that holds unions), and let inference handle the inside
of functions.

```ts
// Boundary typed once…
interface User {
  id: number;
  name: string;
  email: string;
}

function findUser(users: User[], id: number): User | undefined {
  // …and no annotations needed inside: inference knows `user` is a User
  return users.find((user) => user.id === id);
}
```

---

## 8. Reading a TypeScript error

The first time you see a long TS error it looks hostile. It is actually a precise
sentence. Take the one we produced earlier:

```text
demo.ts(5,17): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

Breaking it down:

```text
demo.ts            the file
(5,17)             line 5, column 17 — exactly where the bad value is
error TS2345       the error code (searchable; stable across versions)
Argument of type   what you passed
'string'           …the actual type
is not assignable  "does not fit"
to parameter of    what was expected
type 'number'.     …the expected type
```

**A reading strategy for any TS error:**

1. Read it **from the bottom up**: the last line usually names the expected type.
2. Open the file at the given line/column — the squiggle is on the *argument*, not
   the function.
3. Ask: "what does this thing expect, and what did I actually give it?"
4. Hover the value in the editor to see its inferred type — often it is not what
   you assumed.
5. When a message is very long, the *first* line is the message and the following
   lines are the chain of types; the important part is usually "Type X is missing
   the following properties from type Y".

**The errors you will meet most:**

| Code | Message | Usual cause |
| --- | --- | --- |
| TS2345 | `Argument of type 'X' is not assignable to parameter of type 'Y'` | Wrong argument type |
| TS2322 | `Type 'X' is not assignable to type 'Y'` | Wrong assignment |
| TS2339 | `Property 'x' does not exist on type 'Y'` | Typo, or the type does not have that field |
| TS18048 | `'x' is possibly 'undefined'` | Missing null check |
| TS2532 | `Object is possibly 'undefined'` | Same, on a nested access |
| TS7006 | `Parameter 'x' implicitly has an 'any' type` | Missing annotation (with `noImplicitAny`) |
| TS2741 | `Property 'x' is missing in type ... but required in type ...` | Missing required prop/field |
| TS2554 | `Expected N arguments, but got M` | Wrong number of arguments |
| TS2769 | `No overload matches this call` | Often an event-handler type mismatch |
| TS2307 | `Cannot find module 'x'` | Wrong import path or missing package |

---

## 9. What TypeScript does *not* do (so you don't trust it wrongly)

| Belief | Reality |
| --- | --- |
| "Types validate API responses" | No. Types are erased; runtime data is unchecked. Validate with Zod or a guard. |
| "Types make my app secure" | No. Security is server-side (Part 15). Types are developer tooling. |
| "Types make code slower" | No. They do not exist at runtime. (Only the *build* is slower.) |
| "Types catch every bug" | No. They catch *shape* mistakes. Logic, off-by-one and business-rule bugs remain. |
| "I need to type everything" | No. Inference handles most of it; annotate boundaries. |
| "`any` is fine for now" | `any` switches the checker off *for everything it touches*. Use `unknown` and narrow. |
| "The build fails, so the runtime would break" | Not necessarily: Vite strips types and runs. Type errors mean "this is probably wrong", not "this cannot run". |

```ts
// The trap in one snippet: this compiles because of an assertion, and crashes at runtime
interface User {
  id: number;
  name: string;
}

async function loadUser(): Promise<User> {
  const response = await fetch('/api/user');
  return (await response.json()) as User;   // ⚠️ a PROMISE from the compiler, not a check
}

const user = await loadUser();
console.log(user.name.toUpperCase());       // crashes if the API sent `{ user_name: 'Ada' }`
```

The fix is **runtime validation** at the boundary (Part 7 for typed API layers,
Part 8 for Zod). TypeScript tells you what you *expect*; validation confirms what
you *received*.

---

## 10. Why React teams use TypeScript

```tsx
// JavaScript: nothing tells you what this component needs
function UserCard({ user }) {
  return <h2>{user.name}</h2>;
}

// Caller forgets `user`, or passes the wrong shape → blank screen at runtime
```

```tsx
// TypeScript: the contract is explicit and enforced
interface User {
  id: number;
  name: string;
  email: string;
}

interface UserCardProps {
  user: User;
  isAdmin?: boolean;
  onFollow: (userId: number) => void;
}

function UserCard({ user, isAdmin = false, onFollow }: UserCardProps) {
  return (
    <article>
      <h2>{user.name}</h2>
      <button type="button" onClick={() => onFollow(user.id)}>Follow</button>
    </article>
  );
}
```

```tsx
// ✅ Editor autocompletes the props; missing `user` is a compile error
<UserCard user={currentUser} onFollow={handleFollow} />

// ❌ error TS2741: Property 'user' is missing in type '{ onFollow: ... }'
//    but required in type 'UserCardProps'.
<UserCard onFollow={handleFollow} />
```

What that buys you in React specifically:

- **Component contracts.** Props are documented by the compiler, not by comments.
- **Refactor confidence.** Rename a prop and TS lists every caller to update.
- **Fewer runtime crashes.** Nullable data must be handled before it is used.
- **Better autocomplete.** You discover props and hook options by typing.
- **Self-documenting data flow.** `useState<User | null>(null)` says "not loaded
  yet" out loud.
- **Vite integration** means no extra build step to babysit.

That is why these notes are TSX, and why Part 3 teaches components with types from
the very first example.

---

## 11. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Thinking types are checked at runtime | "But TypeScript should have caught it" in production | Validate external data; types vanish |
| Turning `strict` off to silence errors | The safety you wanted disappears | Fix the errors, or narrow them with a plan |
| Using `any` to make an error go away | The error disappears but so does checking, silently | Use `unknown` + narrowing, or the correct type |
| Annotating everything | Noisy code, redundant types | Let inference work; annotate boundaries |
| `const x: number = '5'` | TS2322 | Annotations are promises you must keep |
| `arr[0]` assumed to exist with `noUncheckedIndexedAccess` | `possibly 'undefined'` | Check it, or use `arr.at(0)` with a guard |
| Ignoring a red squiggle because "it compiles in the browser" | Vite runs it anyway; the bug ships | Treat type errors as failures; add `typecheck` to CI |
| Renaming `.ts` to `.tsx` (or the reverse) carelessly | JSX in `.ts` fails to parse | JSX requires `.tsx` (file 11) |
| Assuming a library's types match its docs | Confusing errors | Read the `.d.ts`; hover in the editor |
| Mixing up error TS2345 vs TS2322 | "Which one is bad?" | 2345 = wrong argument; 2322 = wrong assignment |

---

## 12. Practice exercises

### Beginner

1. Create the `ts-playground` project from section 5 and run the `basics.ts`
   example. Confirm it prints the expected output and that `npx tsc --noEmit`
   prints nothing.
2. Now add these lines to the same file, run `npx tsc --noEmit`, and explain each
   error in your own words. Then fix each one properly (no `any`).

```ts
const userName: string = 42;
const items: string[] = ['a', 'b'];
// items.push(3);

function double(n: number) {
  return n * 2;
}
// double('5');

let total = 0;
total = 'zero';
```

3. Run the broken file anyway with `npx tsx src/basics.ts` **before** fixing it.
   What happens, and why? (This is the type-erasure lesson.)

**Solution**

```ts
// 2. Fixed versions, with the reason for each
const userName: string = 'Ada';          // was: assigned a number to a string

const items: string[] = ['a', 'b'];
items.push('c');                          // was: pushing a number into string[]

function double(n: number): number {
  return n * 2;
}
double(5);                                // was: passing a string to a number parameter

let total = 0;                            // inferred as number
total = 42;                               // was: assigning a string to a number
```

**Explanations of the original errors:**

```text
const userName: string = 42;
  TS2322: Type 'number' is not assignable to type 'string'.
  → The annotation is a promise; 42 breaks it. Either change the value or the type.

items.push(3);
  TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.
  → This is the GOOD error: it stops the array becoming ['a','b',3].

double('5');
  TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
  → Exactly the bug class from section 2, caught before running.

total = 'zero';
  TS2322: Type 'string' is not assignable to type 'number'.
  → `let total = 0` inferred `number`; you cannot reassign it to a string.
```

**3. What happens when you run it anyway?**

```text
Hello, TypeScript 2026 true
Hello, TypeScript, Ada!
```

The file runs fine, because `tsx` strips the types without checking them. Then, if
you push it further (for example `double('5')` returns `'55'` because `*` coerces
the string), you get a wrong answer instead of an error.

**The lesson:** *the compiler and the runtime are separate systems.* The compiler
is your safety net, and it only works while you keep it on.

### Intermediate

Build a small **typed financial helper** module in the playground. Requirements:

```text
ts-playground/src/money.ts
```

1. Define a `Money` type with `amount` (in paise, an integer) and `currency`
   (`'INR' | 'USD'`).
2. `createMoney(amount: number, currency: Currency): Money` — throws an `Error`
   if `amount` is negative or not an integer.
3. `add(a: Money, b: Money): Money` — throws if the currencies differ.
4. `multiply(money: Money, factor: number): Money` — rounds to the nearest paise.
5. `format(money: Money): string` — `₹1,299.00` for 129900 paise; `$12.50` for
   1250 cents. Use `Intl.NumberFormat`.
6. `split(money: Money, ways: number): Money[]` — divides as evenly as possible
   **without losing a single paise** (the remainder must be distributed).
7. A `main()` demonstrating each function, plus the two error cases caught with
   `try`/`catch`.

Then run `npx tsc --noEmit` and `npx tsx src/money.ts`.

*Hint for `format`: `Intl.NumberFormat(locale, { style: 'currency', currency })`
expects the amount in major units, so divide paise by 100.*

**Solution**

```text
ts-playground/src/money.ts
```

```ts
export type Currency = 'INR' | 'USD';

export interface Money {
  /** Amount in the smallest unit: paise for INR, cents for USD. */
  amount: number;
  currency: Currency;
}

const LOCALES: Record<Currency, string> = {
  INR: 'en-IN',
  USD: 'en-US',
};

export function createMoney(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) {
    throw new Error(`Amount must be an integer (minor units), received ${amount}`);
  }
  if (amount < 0) {
    throw new Error(`Amount cannot be negative, received ${amount}`);
  }
  return { amount, currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function multiply(money: Money, factor: number): Money {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new Error(`Factor must be a non-negative finite number, received ${factor}`);
  }
  return { amount: Math.round(money.amount * factor), currency: money.currency };
}

export function format(money: Money): string {
  return new Intl.NumberFormat(LOCALES[money.currency], {
    style: 'currency',
    currency: money.currency,
  }).format(money.amount / 100);
}

export function split(money: Money, ways: number): Money[] {
  if (!Number.isInteger(ways) || ways <= 0) {
    throw new Error(`Ways must be a positive integer, received ${ways}`);
  }

  const base = Math.floor(money.amount / ways);
  const remainder = money.amount % ways;   // 0..ways-1 extra minor units to hand out

  return Array.from({ length: ways }, (_, index) =>
    // The first `remainder` shares get one extra unit, so the total is exact
    ({ amount: base + (index < remainder ? 1 : 0), currency: money.currency })
  );
}

// ---------------------------------------------------------------- demo
function main(): void {
  const keyboard = createMoney(499900, 'INR');   // ₹4,999.00
  const mouse = createMoney(129900, 'INR');      // ₹1,299.00
  const discount = multiply(mouse, 0.5);

  console.log(format(keyboard));                 // ₹4,999.00
  console.log(format(add(keyboard, mouse)));     // ₹6,298.00
  console.log(format(discount));                 // ₹649.50

  const shares = split(createMoney(10000, 'INR'), 3); // ₹100 split 3 ways
  console.log(shares.map(format));               // [ '₹33.34', '₹33.33', '₹33.33' ]
  console.log(
    'total preserved:',
    shares.reduce((sum, share) => sum + share.amount, 0) === 10000 // true
  );

  // Errors are caught, not crashed
  try {
    createMoney(-5, 'INR');
  } catch (error) {
    console.log('rejected:', error instanceof Error ? error.message : error);
  }

  try {
    add(keyboard, createMoney(100, 'USD'));
  } catch (error) {
    console.log('rejected:', error instanceof Error ? error.message : error);
  }
}

main();
```

**Expected output**

```text
₹4,999.00
₹6,298.00
₹649.50
[ '₹33.34', '₹33.33', '₹33.33' ]
total preserved: true
rejected: Amount cannot be negative, received -5
rejected: Cannot add INR to USD
```

**TypeScript-specific lessons in this solution**

- **Money is stored as an integer in minor units.** Floating point cannot
  represent `0.1 + 0.2` exactly (Part 1 file 3), so financial code works in paise
  and only converts for display. The type documents the unit in a comment — good
  types plus one good comment beat a vague `number`.
- **`Currency` is a union of two literals**, not `string`. That means
  `createMoney(100, 'EUR')` is a **compile error** — you cannot typo a currency.
- **`Record<Currency, string>`** forces the locale map to cover every currency. If
  you add `'EUR'` to the union, the compiler immediately tells you the map is
  incomplete. (This is the "exhaustiveness" idea file 9 formalises.)
- **`error instanceof Error ? error.message : error`** is needed because `catch`
  variables are `unknown` under `strict` — you must narrow before using them.
- **`split` preserves the total**, which is the kind of business rule types cannot
  enforce — the runtime assertion in the demo proves it.

### Challenge

Write a **typed mini migration script**: take an array of loosely-typed "legacy
user" records, validate and transform them into a strict application type, and
produce a report. This is the real job TypeScript does for you at the boundary
between messy external data and your clean app — and it sets up file 9 (narrowing)
and file 10 (utility types).

```text
ts-playground/src/migrate.ts
```

Input (note the deliberate mess — this is what real API/CRM data looks like):

```ts
const legacyRecords: unknown[] = [
  { id: '1', full_name: '  ada lovelace ', email: 'ADA@EXAMPLE.COM', age: '36', role: 'admin', created: '2026-01-15T10:00:00Z' },
  { id: 2, full_name: 'Grace Hopper', email: 'grace@example.com', age: 45, role: 'user', created: '2026-03-02T09:30:00Z' },
  { id: '3', full_name: '', email: 'not-an-email', age: null, role: 'superadmin', created: 'yesterday' },
  { id: '4', full_name: 'Alan Turing', email: 'alan@example.com', age: '41', role: 'user', created: '2026-04-20T14:00:00Z' },
  { full_name: 'No Id', email: 'nobody@example.com' },
  { id: '5', full_name: 'Ada Again', email: 'ada2@example.com', age: 30, role: 'ADMIN', created: '2026-05-01T08:00:00Z' },
];
```

Requirements:

1. Define the target type:

```ts
type Role = 'admin' | 'user';

interface AppUser {
  id: string;
  name: string;
  email: string;
  age: number | null;
  role: Role;
  createdAt: string;   // ISO string, normalised
  isVerified: boolean; // derived: has an id, a valid email and a parsed date
}
```

2. `migrateRecord(raw: unknown): { ok: true; user: AppUser } | { ok: false; errors: string[] }`
   — a **manual** validator that:
   - rejects non-objects and `null`;
   - requires a non-empty `id` (string or number → string);
   - trims the name, title-cases it, rejects empty names;
   - lowercases the email, requires exactly one `@` with text on both sides;
   - parses `age` from string or number, allows `null`/missing, rejects negative or
     non-numeric;
   - normalises `role`: `'admin'`/`'ADMIN'` → `'admin'`, anything not recognised →
     `'user'` (and note it as a warning, not an error);
   - parses `created` with `Date`, rejects an invalid date;
   - `isVerified` = has id **and** valid email **and** valid date.
3. `migrateAll(records: unknown[]): { users: AppUser[]; problems: Array<{ index: number; errors: string[] }> }`
   — no exceptions; every bad record is reported with its index.
4. `report(result)` — prints a summary: how many migrated, how many failed, and the
   errors per failed record.
5. `main()` — run it on the input above and print the report plus the migrated
   users as JSON.
6. Add a final comment: which parts of this would you replace with Zod in a real
   project, and why you might keep a hand-written validator for a one-off script.

**Solution**

```text
ts-playground/src/migrate.ts
```

```ts
// ---------------------------------------------------------------- target types
type Role = 'admin' | 'user';

interface AppUser {
  id: string;
  name: string;
  email: string;
  age: number | null;
  role: Role;
  createdAt: string;
  isVerified: boolean;
}

type MigrateResult =
  | { ok: true; user: AppUser; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

// ---------------------------------------------------------------- helpers
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const titleCase = (text: string): string =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const isValidEmail = (email: string): boolean => {
  const parts = email.split('@');
  return parts.length === 2 && parts[0]!.length > 0 && parts[1]!.includes('.');
};

// ---------------------------------------------------------------- the validator
export function migrateRecord(raw: unknown): MigrateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['Record is not an object'], warnings: [] };
  }

  // ---- id -----------------------------------------------------------------
  const rawId = raw['id'];
  const id =
    typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId).trim() : '';
  if (id === '') errors.push('Missing or empty id');

  // ---- name ---------------------------------------------------------------
  const rawName = raw['full_name'];
  const name = typeof rawName === 'string' ? titleCase(rawName.trim()) : '';
  if (name === '') errors.push('Missing or empty full_name');

  // ---- email --------------------------------------------------------------
  const rawEmail = raw['email'];
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!isValidEmail(email)) errors.push(`Invalid email: "${String(rawEmail)}"`);

  // ---- age (nullable, never a hard failure) -------------------------------
  const rawAge = raw['age'];
  let age: number | null = null;
  if (rawAge === null || rawAge === undefined || rawAge === '') {
    age = null;
  } else if (typeof rawAge === 'number' && Number.isFinite(rawAge) && rawAge >= 0) {
    age = Math.trunc(rawAge);
  } else if (typeof rawAge === 'string' && rawAge.trim() !== '' && !Number.isNaN(Number(rawAge))) {
    age = Math.trunc(Number(rawAge));
  } else {
    warnings.push(`Unusable age ignored: ${JSON.stringify(rawAge)}`);
  }

  // ---- role (normalise; unknown values are a warning, not an error) -------
  const rawRole = typeof raw['role'] === 'string' ? raw['role'].toLowerCase() : '';
  let role: Role = 'user';
  if (rawRole === 'admin') {
    role = 'admin';
  } else if (rawRole !== '' && rawRole !== 'user') {
    warnings.push(`Unknown role "${String(raw['role'])}" downgraded to "user"`);
  }

  // ---- created ------------------------------------------------------------
  const rawCreated = raw['created'];
  let createdAt = '';
  if (typeof rawCreated === 'string') {
    const parsed = new Date(rawCreated);
    if (!Number.isNaN(parsed.getTime())) {
      createdAt = parsed.toISOString();
    }
  }
  if (createdAt === '') errors.push(`Invalid created date: "${String(rawCreated)}"`);

  // ---- verdict ------------------------------------------------------------
  // Warnings are returned even when the record is rejected: knowing that a
  // rejected record also had a bad role is useful when debugging source data.
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    user: {
      id,
      name,
      email,
      age,
      role,
      createdAt,
      isVerified: id !== '' && isValidEmail(email) && createdAt !== '',
    },
  };
}

// ---------------------------------------------------------------- batch
export interface MigrationOutcome {
  users: AppUser[];
  problems: Array<{ index: number; errors: string[] }>;
  warnings: Array<{ index: number; message: string }>;
}

export function migrateAll(records: unknown[]): MigrationOutcome {
  const outcome: MigrationOutcome = { users: [], problems: [], warnings: [] };

  records.forEach((record, index) => {
    const result = migrateRecord(record);

    // Warnings are collected in BOTH cases — a rejected record can still tell us
    // something useful about the source data.
    result.warnings.forEach((message) => outcome.warnings.push({ index, message }));

    if (result.ok) {
      outcome.users.push(result.user);
    } else {
      outcome.problems.push({ index, errors: result.errors });
    }
  });

  return outcome;
}

// ---------------------------------------------------------------- reporting
function report(outcome: MigrationOutcome, total: number): void {
  console.log('=== Migration report ===');
  console.log(`Records processed: ${total}`);
  console.log(`Migrated:          ${outcome.users.length}`);
  console.log(`Rejected:          ${outcome.problems.length}`);
  console.log(`Warnings:          ${outcome.warnings.length}`);

  if (outcome.problems.length > 0) {
    console.log('\nRejected records:');
    for (const { index, errors } of outcome.problems) {
      console.log(`  #${index}: ${errors.join('; ')}`);
    }
  }

  if (outcome.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const { index, message } of outcome.warnings) {
      console.log(`  #${index}: ${message}`);
    }
  }
}

// ---------------------------------------------------------------- demo
const legacyRecords: unknown[] = [
  { id: '1', full_name: '  ada lovelace ', email: 'ADA@EXAMPLE.COM', age: '36', role: 'admin', created: '2026-01-15T10:00:00Z' },
  { id: 2, full_name: 'Grace Hopper', email: 'grace@example.com', age: 45, role: 'user', created: '2026-03-02T09:30:00Z' },
  { id: '3', full_name: '', email: 'not-an-email', age: null, role: 'superadmin', created: 'yesterday' },
  { id: '4', full_name: 'Alan Turing', email: 'alan@example.com', age: '41', role: 'user', created: '2026-04-20T14:00:00Z' },
  { full_name: 'No Id', email: 'nobody@example.com' },
  { id: '5', full_name: 'Ada Again', email: 'ada2@example.com', age: 30, role: 'ADMIN', created: '2026-05-01T08:00:00Z' },
];

function main(): void {
  const outcome = migrateAll(legacyRecords);
  report(outcome, legacyRecords.length);

  console.log('\nMigrated users:');
  console.log(JSON.stringify(outcome.users, null, 2));
}

main();

/* ---------------------------------------------------------------------------
   IN A REAL PROJECT
   - Replace the hand-written checks with Zod:
       const AppUserSchema = z.object({ id: z.string().min(1), email: z.string().email(), ... })
       const parsed = AppUserSchema.safeParse(raw)   // same { ok, errors } shape
     You get the validator AND the type (z.infer<typeof AppUserSchema>) from one
     declaration, plus consistent error messages. Part 8 covers it.
   - Keep a hand-written validator for scripts like this one when you want:
       * zero dependencies,
       * custom normalisation (title-casing, role downgrades) that a schema
         library would express more awkwardly,
       * full control over which problems are hard errors vs warnings.
---------------------------------------------------------------------------- */
```

**Expected output**

```text
=== Migration report ===
Records processed: 6
Migrated:          4
Rejected:          2
Warnings:          1

Rejected records:
  #2: Missing or empty full_name; Invalid email: "not-an-email"; Invalid created date: "yesterday"
  #4: Missing or empty id; Invalid created date: "undefined"

Warnings:
  #2: Unknown role "superadmin" downgraded to "user"

Migrated users:
[
  {
    "id": "1",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "age": 36,
    "role": "admin",
    "createdAt": "2026-01-15T10:00:00.000Z",
    "isVerified": true
  },
  {
    "id": "2",
    "name": "Grace Hopper",
    "email": "grace@example.com",
    "age": 45,
    "role": "user",
    "createdAt": "2026-03-02T09:30:00.000Z",
    "isVerified": true
  },
  {
    "id": "4",
    "name": "Alan Turing",
    "email": "alan@example.com",
    "age": 41,
    "role": "user",
    "createdAt": "2026-04-20T14:00:00.000Z",
    "isVerified": true
  },
  {
    "id": "5",
    "name": "Ada Again",
    "email": "ada2@example.com",
    "age": 30,
    "role": "admin",
    "createdAt": "2026-05-01T08:00:00.000Z",
    "isVerified": true
  }
]
```

> Notes on the output — both of these are details I got wrong on my first pass and
> fixed after running the script, which is exactly why you should run yours:
>
> 1. **`#4` has two errors, not one.** It has no `created` field at all, so the
>    date check also fails and reports `Invalid created date: "undefined"`. A
>    missing required field is an error like any other.
> 2. **A rejected record can still produce a warning.** `#2` fails on three counts
>    *and* gets a role warning, because warnings are collected *before* the verdict
>    is decided. If `migrateAll` only gathered warnings from successful records,
>    the `superadmin` line would vanish — hiding exactly the information you need
>    when fixing the source data. That is why the failure branch of `MigrateResult`
>    carries `warnings` too.

**Why this challenge matters more than it looks**

- **This is the "types do not validate data" lesson made practical.** `raw` arrives
  as `unknown`, and the only way to reach `AppUser` is through checks the compiler
  can verify.
- **`unknown` forces discipline.** If `raw` had been typed `any`, every
  `raw.full_name` would compile and crash. With `unknown`, each access is a type
  error until you narrow it — which is exactly the point of file 9.
- **Union return types** (`{ ok: true } | { ok: false }`) make failure an explicit
  part of the API. The caller cannot forget that migration might fail.
- **`isValidEmail` is a type guard in disguise.** Note `(value: unknown): value is Record<string, unknown>` — `isRecord` narrows the type for every line after it.
- **Warnings vs errors is a product decision**, and the type encodes it: `errors`
  stops the record, `warnings` is informative. Real migrations need both.

---

## 13. Summary

- TypeScript is **JavaScript + a type system + a compiler**. It is not a runtime.
- It removes whole bug classes — wrong arguments, typos, missing null checks,
  broken refactors — **at compile time**.
- **Types are erased at runtime.** `tsx`, Vite and Node strip them; the JS still
  runs even if the types are wrong.
- Therefore: **types never validate external data.** Use runtime validation at the
  boundary.
- Vite **does not type check** — the editor and `npm run build` (`tsc -b`) do. Add
  a `typecheck` script and run it in CI.
- `strict: true` is non-negotiable; it includes `strictNullChecks` and
  `noImplicitAny`, the two flags that catch the most real bugs.
- Use **inference inside** functions and **annotations at boundaries**.
- Read errors from the bottom up: line/column, code (TS2345 = bad argument,
  TS2322 = bad assignment), expected type, actual type.
- React teams use TypeScript for **component contracts**, refactor safety,
  autocomplete and fewer runtime crashes.

**What's next →** [`02-types.md`](./02-types.md): the actual type vocabulary —
primitives, arrays, tuples, objects, `any` vs `unknown` vs `never`, and how
inference behaves in the details.
