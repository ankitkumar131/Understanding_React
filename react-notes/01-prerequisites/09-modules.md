# 09 — Modules: `import` and `export`

> **Part 1 · Prerequisites · File 9 of 11**
>
> **Why this file exists:** a React app is hundreds of files, and they only work
> together because of modules. Every error like
> `Module not found: Can't resolve './components/UserCard'` or
> `does not provide an export named 'default'` is a module problem. This file
> makes those errors boring.

---

## 1. Why modules exist

Before modules, every script shared one global scope:

```html
<script src="utils.js"></script>       <!-- defines: formatPrice -->
<script src="cart.js"></script>        <!-- uses: formatPrice -->
<script src="checkout.js"></script>    <!-- accidentally also defines: formatPrice -->
```

Problems:

- **Name collisions.** Two files defining `formatPrice` — the last one wins.
- **Load order matters.** Forget one `<script>` and everything breaks at runtime.
- **Hidden dependencies.** You cannot tell what a file needs just by reading it.
- **No privacy.** Everything is a global.

**A module is a file with its own scope.** Nothing is shared unless it is
explicitly exported, and nothing is available unless it is explicitly imported.

```text
file A (exports: formatPrice)  ──import──▶  file B
        └─ everything else stays private ─┘
```

Two module systems matter to you:

| System | Syntax | Where |
| --- | --- | --- |
| **ESM** (ECMAScript Modules) | `import` / `export` | browsers, Vite, modern Node, **all React code** |
| CommonJS (CJS) | `require()` / `module.exports` | old Node code, some tools |

**All React code uses ESM.** If a tutorial shows `const React = require('react')`,
it is old or it is about Node tooling. This file covers ESM only, plus the few
CJS facts you need to read error messages.

---

## 2. Named exports and named imports

```text
src/utils/format.ts
```

```ts
// Named export: the `export` keyword in front of the declaration
export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export const CURRENCY = '₹';

// You can also export later, in one block at the bottom
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN');
}

function truncate(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export { formatDate, truncate };
```

```text
src/components/Price.tsx
```

```tsx
// Named imports: curly braces, names must match exactly
import { formatPrice, CURRENCY } from '../utils/format';

export function Price({ amount }: { amount: number }) {
  return (
    <span>
      {CURRENCY}
      {formatPrice(amount).replace(CURRENCY, '')} {/* silly, just to show both */}
    </span>
  );
}
```

Rules for named exports:

1. **Curly braces are required** in the import.
2. **The name must match** (unless you alias it — see below).
3. **Order does not matter** in the import statement.
4. You can import several at once; you can also leave some out entirely.

> 💡 `formatPrice` and `truncate` are exported, but any *unexported* function in
> `format.ts` is invisible outside the file. That is module privacy, and it is how
> you keep an API surface small on purpose.

---

## 3. Default exports and default imports

A module can have **one default export**.

```text
src/components/UserCard.tsx
```

```tsx
export interface User {
  id: number;
  name: string;
}

// Default export: ONE per file
export default function UserCard({ user }: { user: User }) {
  return <h2>{user.name}</h2>;
}

// A file may have a default AND named exports
export const CARD_VERSION = '1.0.0';
```

```tsx
// Default import: NO curly braces, and YOU choose the local name
import UserCard from '../components/UserCard';
import MyCard from '../components/UserCard';        // legal, but confusing
import Card, { CARD_VERSION } from '../components/UserCard'; // both together

<UserCard user={{ id: 1, name: 'Ada' }} />;
```

| | Named export | Default export |
| --- | --- | --- |
| How many per file | many | exactly one |
| Import syntax | `import { X } from './m'` | `import X from './m'` |
| Name must match | yes (or alias) | no — you pick it |
| Editor auto-import | precise, refactor-safe | can be ambiguous |
| Used by React docs for… | most things | the main component of a file |

### Which should you use?

Both work. The practical guidance used by most modern React codebases and by
React's own documentation examples:

```tsx
// ✅ Common and recommended: named export for the component
export function UserCard({ user }: UserCardProps) { ... }

// ✅ Also fine, especially for route/page components: default export
export default function DashboardPage() { ... }
```

Reasons named exports are often preferred:

- **Refactor-safe renaming.** Rename `UserCard` and TypeScript updates every import.
- **Autocomplete is unambiguous.** Typing `User` shows you `UserCard`, `UserList`.
- **You can export types and helpers from the same file naturally.**

Reasons default exports are still common:

- **Route files.** Many routers (and some frameworks, e.g. Next.js pages) expect a
  default export.
- **One-component-per-file.** It reads as "the thing in this file".
- **Lazy loading.** `React.lazy(() => import('./Page'))` expects the module's
  default export to be the component (Part 10).

> ⚠️ **The single biggest source of confusion:** mixing them up.
> ```tsx
> // file exports: export default function UserCard()
> import { UserCard } from './UserCard';   // ❌ undefined!
> // SyntaxError or "does not provide an export named 'UserCard'"
>
> // file exports: export function UserCard()
> import UserCard from './UserCard';       // ❌ undefined!
> // "The requested module does not provide an export named 'default'"
> ```
> When you see either error, **look at the exporting file's first line.**

---

## 4. Aliasing, namespaces and re-exports

```ts
// Rename on import — useful when two modules export the same name
import { formatPrice as formatINR } from '../utils/format';
import { formatPrice as formatUSD } from '../utils/format-us';

// Rename on export
export { formatDate as formatDisplayDate };

// Import everything as a namespace object
import * as formatters from '../utils/format';
formatters.formatPrice(4999);
formatters.CURRENCY;
```

Namespace imports are handy for a module with many related functions, but they
defeat tree-shaking (the bundler cannot see which ones you use). Prefer named
imports for app code.

### Re-exports and "barrel" files

A **barrel file** re-exports several modules so importers have one path to
remember.

```text
src/components/
├── Button/Button.tsx
├── Card/Card.tsx
├── Input/Input.tsx
└── index.ts        ← the barrel
```

```ts
// src/components/index.ts
export { Button } from './Button/Button';
export { Card } from './Card/Card';
export { Input } from './Input/Input';
export type { ButtonProps } from './Button/Button';
```

```tsx
// Without a barrel: three import lines from three paths
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';

// With a barrel: one line
import { Button, Card, Input } from '../components';
```

**Trade-offs of barrels** (the honest version):

| Pros | Cons |
| --- | --- |
| Shorter, consistent import paths | Can create **circular imports** without you noticing |
| Easy to see a folder's public API | Slows down some bundlers' tree-shaking and dev-server startup in huge projects |
| One place to reorganise internals | An error in one re-exported file can break the whole barrel |

> 🏭 **Production advice:** use a barrel at the folder level for a *library-like*
> folder (`components/`, `ui/`), keep it shallow, and never let two barrels import
> each other. If your dev server starts feeling slow on a large project, deleting
> the deepest barrels is a common first fix.

---

## 5. Module paths: relative, alias, and package

```ts
// 1. Relative — from the CURRENT file's folder
import { Button } from './Button';        // same folder, Button.tsx
import { UserCard } from '../UserCard';   // one folder up
import { api } from '../../lib/api';      // two folders up

// 2. Bare specifier — a package in node_modules (or a configured alias)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

// 3. Alias — configured in tsconfig.json and vite.config.ts (Part 16)
import { Button } from '@/components/Button';       // '@/...' → 'src/...'
```

**Path resolution quirks to know:**

```ts
import { A } from './a.js';   // ⚠️ in ESM Node you sometimes need the extension
import { B } from './b';      // Vite/bundlers resolve this to ./b.ts or ./b.tsx
import { C } from './c/index.ts'; // equivalent to './c' in a bundler
```

- **Vite (React apps)** resolves extensions automatically: `.tsx`, `.ts`, `.jsx`,
  `.js` and `index` files. So `'./Button'` finds `Button.tsx` or
  `Button/index.tsx`.
- **Node ESM** is stricter and requires the file extension (`.js`), which is why
  server-side Node code and TS server code sometimes look different from React
  code.
- React's import paths never include `.tsx` — writing the extension is allowed but
  unusual in app code.

---

## 6. Type-only imports (TypeScript)

TypeScript distinguishes values from types. Types disappear at runtime, so
importing them should not create runtime dependencies.

```ts
// A type-only import: erased at compile time, zero runtime cost
import type { User } from '../types/user';

// Mixed: values and types from the same module
import { createUser, type User, type UserRole } from '../lib/users';

// ✅ Always correct (explicit)
import type { ReactNode } from 'react';

// ⚠️ Works, but imports the whole namespace at runtime in some setups
import { ReactNode } from 'react';
```

**Why it matters:** with `verbatimModuleSyntax` (a common modern `tsconfig`
setting) or `isolatedModules` (which Vite requires), a type imported without
`import type` can produce a runtime error like
`does not provide an export named 'User'`, because the bundler keeps the import
but the type does not exist at runtime.

```tsx
// ❌ Can break under isolatedModules if User is a type, not a value
import { User } from '../types/user';

// ✅ Always safe
import type { User } from '../types/user';
```

> 💡 **Habit to build:** if you are importing an `interface`, `type` alias, or a
> generic type parameter, write `import type`. If it is a component, function or
> constant, use a normal import. Part 2 covers TypeScript properly.

---

## 7. Module scope: what is shared and what is not

Each module is evaluated **once**, and its top-level variables live in that
module's scope.

```ts
// src/lib/counter.ts
let count = 0;                  // module-level: shared by all importers

export function increment() {
  count += 1;
  return count;
}

export function current() {
  return count;
}

export const version = '1.0.0'; // a value, created once
```

```ts
// file A
import { increment, current } from '../lib/counter';
increment();          // 1
current();            // 1

// file B — a DIFFERENT file, but the same module instance
import { current } from '../lib/counter';
current();            // 1 ← the module was evaluated once; state is shared

// file C — the module object itself
import * as counterA from '../lib/counter';
import * as counterB from '../lib/counter';
console.log(counterA === counterB); // true — the same module object
```

**Consequences you will actually meet:**

1. **Module-level variables are effectively shared globals** inside your app.
   Handy for caches and singletons; dangerous for per-component state. In React,
   per-component data belongs in `useState`/`useRef`, not in a module variable.
2. **Module initialisation runs once, on first import.** Import order affects the
   order of that initialisation, which is why circular imports can produce
   `undefined` values.
3. **Modules are singletons.** Your API client module (Part 7) is created once and
   reused everywhere — that is a feature.

```ts
// A real singleton pattern you will write in Part 7
// src/api/client.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10_000,
});
// Every module that imports { api } gets the SAME instance — one place to add
// interceptors, headers and error handling.
```

### Circular imports

```ts
// a.ts
import { b } from './b';
export const a = 'a';
console.log('a sees b as:', b);   // may be undefined if b is evaluated first

// b.ts
import { a } from './a';
export const b = 'b';
```

A imports B, B imports A. Whichever is evaluated first will see the other as
partially initialised. Symptoms: `undefined` in unexpected places, or
`Cannot access 'x' before initialization`.

Fixes, in order of preference:

1. **Break the cycle** by moving the shared piece into a third module
   (`shared.ts` that both import).
2. **Import lazily** inside the function that needs it (dynamic `import()`).
3. **Make one direction type-only** (`import type`) if only the type is needed.

---

## 8. Dynamic imports (preview of code-splitting)

Static imports are loaded up front. `import()` is a **function** that loads a
module on demand and returns a promise.

```ts
// Static: bundled with the initial download
import { heavyChart } from './heavyChart';

// Dynamic: a separate chunk, downloaded only when this runs
const { heavyChart } = await import('./heavyChart');
```

```tsx
// React's lazy loading uses exactly this (Part 10)
import { lazy, Suspense } from 'react';

const HeavyChart = lazy(() => import('./HeavyChart'));

function Dashboard() {
  return (
    <Suspense fallback={<p>Loading chart…</p>}>
      <HeavyChart />   {/* the chunk downloads only when this renders */}
    </Suspense>
  );
}
```

> ⚠️ **`React.lazy` requires a default export** (or a promise resolving to
> `{ default: Component }`). That is one place where the default export choice
> matters:
> ```tsx
> // Works with `export default function HeavyChart() {}`
> const HeavyChart = lazy(() => import('./HeavyChart'));
>
> // With a named export, map it to default:
> const HeavyChart = lazy(() =>
>   import('./HeavyChart').then((module) => ({ default: module.HeavyChart }))
> );
> ```

---

## 9. A complete multi-file example

```text
src/
├── lib/
│   ├── format.ts
│   └── api.ts
├── types/
│   └── product.ts
├── components/
│   ├── Price.tsx
│   ├── ProductCard.tsx
│   └── ProductList.tsx
└── App.tsx
```

```text
src/types/product.ts
```

```ts
export interface Product {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
}

export type SortKey = 'name' | 'price';
```

```text
src/lib/format.ts
```

```ts
export const CURRENCY = '₹';

export function formatPrice(amount: number): string {
  return `${CURRENCY}${amount.toLocaleString('en-IN')}`;
}

export function formatStock(inStock: boolean): string {
  return inStock ? 'In stock' : 'Out of stock';
}
```

```text
src/lib/api.ts
```

```ts
import type { Product } from '../types/product';

// A fake "API" so the example runs without a server.
const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Keyboard', price: 4999, inStock: true },
  { id: 'p2', name: 'Mouse', price: 1299, inStock: false },
  { id: 'p3', name: 'Monitor', price: 18999, inStock: true },
];

export async function fetchProducts(): Promise<Product[]> {
  return PRODUCTS; // later, this becomes: return (await fetch('/api/products')).json()
}
```

```text
src/components/Price.tsx
```

```tsx
import { formatPrice } from '../lib/format';

export function Price({ amount }: { amount: number }) {
  return <span className="price">{formatPrice(amount)}</span>;
}
```

```text
src/components/ProductCard.tsx
```

```tsx
// Type-only import: erased at build time
import type { Product } from '../types/product';
import { formatStock } from '../lib/format';
import { Price } from './Price';

interface ProductCardProps {
  product: Product;
}

// Default export: this is "the component" of this file
export default function ProductCard({ product }: ProductCardProps) {
  const { name, price, inStock } = product;

  return (
    <article className="card">
      <h3>{name}</h3>
      <Price amount={price} />
      <p className={inStock ? 'stock' : 'stock stock--out'}>{formatStock(inStock)}</p>
    </article>
  );
}
```

```text
src/components/ProductList.tsx
```

```tsx
import type { Product, SortKey } from '../types/product';
import ProductCard from './ProductCard';           // default import
import { ProductCard as NamedCard } from './ProductCard'; // ❌ would fail — no named export

export function ProductList({ products, sortKey }: { products: Product[]; sortKey: SortKey }) {
  const sorted = [...products].sort((a, b) =>
    sortKey === 'price' ? a.price - b.price : a.name.localeCompare(b.name)
  );

  if (sorted.length === 0) {
    return <p>No products found.</p>;
  }

  return (
    <div className="grid">
      {sorted.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

The line I marked ❌ is deliberate — a file with only a default export has no
named `ProductCard` export, so that import fails. Delete it; it is there to make
the error concrete.

```text
src/App.tsx
```

```tsx
import { useEffect, useState } from 'react';
import type { Product, SortKey } from './types/product';
import { fetchProducts } from './lib/api';
import { ProductList } from './components/ProductList';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');

  useEffect(() => {
    let cancelled = false;

    fetchProducts().then((data) => {
      if (!cancelled) setProducts(data);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Products</h1>

      <label>
        Sort by{' '}
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="name">Name</option>
          <option value="price">Price</option>
        </select>
      </label>

      <ProductList products={products} sortKey={sortKey} />
    </main>
  );
}
```

**How to read this example:**

- `types/product.ts` exports **types only** — imported everywhere with
  `import type`.
- `lib/format.ts` exports **pure functions and a constant**. Both are named
  exports because there are several.
- `lib/api.ts` simulates a network call; it imports a type, not a value.
- `components/Price.tsx` is small: a named export, one prop.
- `components/ProductCard.tsx` uses a **default export** because it is "the
  component" of the file, and imports `Product` as a type and `formatStock` as a
  value.
- `components/ProductList.tsx` imports the default (`ProductCard`) with any local
  name it likes.
- `App.tsx` composes everything and owns the state.

**Expected result:** a page showing three product cards, each with a name, price
and stock label; changing the select re-sorts the list.

---

## 10. Common errors, decoded

### `Module not found: Can't resolve './components/UserCard'`

```text
What it means: the bundler could not find a file at that path.
Likely causes:
  1. Typo in the path or the file name (case matters on Linux/macOS CI!).
  2. Wrong relative depth — './X' vs '../X' (this is the #1 cause).
  3. The file extension is one the bundler does not look for
     (e.g. you named it .ts but it contains JSX — it must be .tsx).
  4. The file was never created/saved.
Fix: click the import in your editor; if it cannot jump to the file, the path is wrong.
```

### `The requested module '/src/x.ts' does not provide an export named 'Y'`

```text
What it means: you imported something that is not exported.
Likely causes:
  1. You used { } for a default export, or omitted { } for a named export.
  2. A typo in the exported name (Y vs y).
  3. The export exists in another file.
Fix: open the exporting file and read the export line.
```

### `does not provide an export named 'default'`

```text
What it means: you wrote `import X from './m'` but ./m has no default export.
Fix: use a named import, or add a default export.
```

### `Cannot use import statement outside a module`

```text
What it means: Node or the browser is parsing your file as a CommonJS script.
Fix (Node): add "type": "module" to package.json, or use the .mjs extension.
Fix (browser): load your script with <script type="module" src="...">.
In a Vite React app you will never see this — Vite handles it.
```

### `Identifier 'X' has already been declared`

```text
What it means: you imported X and also defined a local X (or imported it twice).
Fix: rename with `import { X as XFromLib }` or delete the duplicate.
```

### `Cannot access 'X' before initialization` from an import

```text
What it means: a circular import — the module is only partially evaluated.
Fix: break the cycle by extracting the shared code into a third module.
```

### `require is not defined in ES module scope`

```text
What it means: you used CommonJS `require` inside an ESM module.
Fix: use `import`. (Or, for a config file that genuinely needs CJS, rename it
to .cjs.)
```

### `Module "x" was resolved to y, but '--allowImportingTsExtensions' is not set`

```text
What it means: in TypeScript you imported a file with a .ts/.tsx extension.
Fix: drop the extension in app code (`'./Button'`, not `'./Button.tsx'`).
```

---

## 11. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `import { X }` for a default export | `undefined`, or "does not provide an export named" | remove the braces |
| `import X` for a named export | "does not provide an export named 'default'" | add the braces |
| Wrong relative depth | `Module not found` | `./` for same folder, `../` per level up |
| Case mismatch (`userCard.tsx` vs `UserCard.tsx`) | Works locally on macOS/Windows, fails on Linux CI | match the filename exactly |
| JSX inside a `.ts` file | `Unexpected token` / `Cannot find name 'div'` and "did you mean .tsx?" | rename to `.tsx` |
| Importing a type without `import type` | Runtime "does not provide an export named" under `isolatedModules` | `import type { X }` |
| Circular imports | `undefined` values, "Cannot access before initialization" | extract shared code into a third module |
| Module-level mutable state used as component state | Data leaks between users/renders | use `useState`/`useRef` |
| Deep barrel chains | Slow dev server, hard-to-trace bugs | keep barrels one level deep |
| `React.lazy(() => import('./X'))` on a named-export-only file | "element type is invalid" | map to `{ default: X }` or use a default export |
| Forgetting to export a component you just created | `undefined` component, "Element type is invalid" | add `export` |
| Importing `React` when you do not use it | Lint warning; not needed unless you use `React.something` | modern JSX transform does not require it |

> 💡 **The "Element type is invalid" error** is nearly always a broken import:
> you imported `undefined` and tried to render it as a component. Check the
> import/export pair first, before anything else.

---

## 12. Practice exercises

### Beginner

Given these two files, write the correct imports in `App.tsx` so that everything
used is available, and predict what the page shows.

```ts
// ---------- src/lib/math.ts ----------
export const TAX_RATE = 0.18;

export function addTax(amount: number): number {
  return Math.round(amount * (1 + TAX_RATE));
}

export default function multiply(a: number, b: number): number {
  return a * b;
}
```

```ts
// ---------- src/lib/strings.ts ----------
export function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}
```

```tsx
// ---------- src/App.tsx ----------
// TODO: write the imports
import ???

export default function App() {
  const base = 4999;
  const total = addTax(base);
  const doubled = multiply(base, 2);

  return (
    <div>
      <h1>{titleCase('my react shop')}</h1>
      <p>Base: {base}</p>
      <p>With tax ({TAX_RATE * 100}%): {total}</p>
      <p>Doubled: {doubled}</p>
    </div>
  );
}
```

**Solution**

```tsx
// Named imports use braces; the default import does not.
import multiply, { TAX_RATE, addTax } from './lib/math';
import { titleCase } from './lib/strings';

export default function App() {
  const base = 4999;
  const total = addTax(base);        // 4999 * 1.18 = 5898.82 → 5899
  const doubled = multiply(base, 2); // 9998

  return (
    <div>
      <h1>{titleCase('my react shop')}</h1>  {/* "My React Shop" */}
      <p>Base: {base}</p>                    {/* "Base: 4999" */}
      <p>With tax ({TAX_RATE * 100}%): {total}</p> {/* "With tax (18%): 5899" */}
      <p>Doubled: {doubled}</p>              {/* "Doubled: 9998" */}
    </div>
  );
}
```

**Expected page content**

```text
My React Shop
Base: 4999
With tax (18%): 5899
Doubled: 9998
```

**Notes**

- `import multiply, { TAX_RATE, addTax } from './lib/math'` — default and named
  imports can share one statement: default first, then braces.
- `TAX_RATE * 100` prints `18` because `0.18 * 100` is `18` exactly. (Floating
  point is friendly here; `0.1 * 3` would not be.)
- `titleCase('my react shop')` → `"My React Shop"` because the regex replaces the
  first letter of each word.

If you had written `import { multiply } from './lib/math'` you would see:

```text
SyntaxError: The requested module './lib/math' does not provide an export named 'multiply'
```

### Intermediate

Reorganise this project into modules and produce a barrel file. Requirements:

```text
Before:
  src/everything.ts   ← one 300-line file with: types, formatting helpers,
                        a fake API, and three components

After:
  src/types/user.ts
  src/lib/format.ts
  src/lib/api.ts
  src/components/UserCard.tsx
  src/components/UserList.tsx
  src/components/UserStats.tsx
  src/components/index.ts     ← barrel: re-exports the three components
  src/App.tsx
```

Rules:

- Types are exported from `types/user.ts` and imported with `import type`.
- `format.ts` exports `formatDate` and `initials`.
- `api.ts` exports `fetchUsers()` returning `Promise<User[]>`, and imports the type.
- Each component file exports exactly one component: `UserCard` and `UserList` and
  `UserStats` as **named** exports.
- The barrel re-exports the components and their prop types.
- `App.tsx` imports the components **from the barrel**.

Write every file, then explain in one sentence why the barrel does not re-export
`fetchUsers`.

**Solution**

```text
src/types/user.ts
```

```ts
export interface User {
  id: number;
  name: string;
  email: string;
  joinedAt: string; // ISO date
}

export interface UserStatsData {
  total: number;
  active: number;
}
```

```text
src/lib/format.ts
```

```ts
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
```

```text
src/lib/api.ts
```

```ts
import type { User } from '../types/user';

const USERS: User[] = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', joinedAt: '2026-01-15' },
  { id: 2, name: 'Grace Hopper', email: 'grace@example.com', joinedAt: '2026-03-02' },
  { id: 3, name: 'Alan Turing', email: 'alan@example.com', joinedAt: '2026-04-20' },
];

export async function fetchUsers(): Promise<User[]> {
  // Simulated latency so you can see loading states in later chapters
  await new Promise((resolve) => setTimeout(resolve, 200));
  return USERS;
}
```

```text
src/components/UserCard.tsx
```

```tsx
import type { User } from '../types/user';
import { formatDate, initials } from '../lib/format';

export interface UserCardProps {
  user: User;
}

export function UserCard({ user }: UserCardProps) {
  const { name, email, joinedAt } = user;

  return (
    <article className="card">
      <div className="avatar" aria-hidden="true">
        {initials(name)}
      </div>
      <h3>{name}</h3>
      <p>{email}</p>
      <small>Joined {formatDate(joinedAt)}</small>
    </article>
  );
}
```

```text
src/components/UserList.tsx
```

```tsx
import type { User } from '../types/user';
import { UserCard } from './UserCard';

export interface UserListProps {
  users: User[];
}

export function UserList({ users }: UserListProps) {
  if (users.length === 0) {
    return <p>No users yet.</p>;
  }

  return (
    <div className="grid">
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

```text
src/components/UserStats.tsx
```

```tsx
import type { UserStatsData } from '../types/user';

export interface UserStatsProps {
  stats: UserStatsData;
}

export function UserStats({ stats }: UserStatsProps) {
  const { total, active } = stats;

  return (
    <dl className="stats">
      <div>
        <dt>Total</dt>
        <dd>{total}</dd>
      </div>
      <div>
        <dt>Active</dt>
        <dd>{active}</dd>
      </div>
    </dl>
  );
}
```

```text
src/components/index.ts
```

```ts
// The public surface of the components folder.
// One path to remember for everyone importing from '@/components'.
export { UserCard } from './UserCard';
export type { UserCardProps } from './UserCard';

export { UserList } from './UserList';
export type { UserListProps } from './UserList';

export { UserStats } from './UserStats';
export type { UserStatsProps } from './UserStats';

// Deliberately NOT re-exported here:
//   fetchUsers  — data access belongs to lib/api, not to the UI barrel
//   User        — the shared type lives in types/, so it has one canonical home
```

```text
src/App.tsx
```

```tsx
import { useEffect, useState } from 'react';
import type { User } from './types/user';
import { fetchUsers } from './lib/api';
import { UserList, UserStats } from './components'; // ← the barrel

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchUsers()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <p>Loading users…</p>;

  return (
    <main>
      <h1>Team</h1>
      <UserStats stats={{ total: users.length, active: users.length }} />
      <UserList users={users} />
    </main>
  );
}
```

**One-sentence answer for the barrel question:** `fetchUsers` is **data access**,
not UI, so re-exporting it from a components barrel would let any component pull
API code through a UI import path — keeping it in `lib/api` preserves the rule
that "components render, `api` fetches", which is the layering you will formalise
in Part 15.

**Expected result:** "Loading users…" for ~200ms, then a stats block and three
user cards showing initials, name, email and a formatted join date.

### Challenge

Build a **mini "framework"** out of modules to prove you understand module scope,
singletons and dynamic imports. Create:

```text
mini-framework/
├── package.json          { "type": "module" }
├── src/
│   ├── core/
│   │   ├── registry.ts     // a module-scoped registry (singleton)
│   │   ├── logger.ts       // a module-scoped logger with levels
│   │   └── index.ts        // barrel
│   ├── features/
│   │   ├── users.ts        // registers itself, lazily loads data
│   │   ├── orders.ts       // registers itself, lazily loads data
│   │   └── index.ts
│   ├── plugins/
│   │   └── analytics.ts    // auto-registers via a side-effect import
│   └── main.ts             // app entry
└── README.md               // 10 lines explaining the module graph
```

Requirements:

1. **`registry.ts`** exports a `register(name, loader)` function and a
   `load(name)` function. Registry data lives in a **module-scoped `Map`** — prove
   it is shared by importing the same module from two other files and showing both
   see the same entries.
2. **`logger.ts`** exports `createLogger(namespace)` returning
   `{ debug, info, warn, error }`, plus `setLogLevel(level)`. Logs are printed as
   `[level] namespace: message`, and messages below the current level are
   suppressed. Use a module-scoped level variable.
3. **`features/users.ts` and `features/orders.ts`** each `register()` themselves on
   import and export a `loadData()` function. They must import the logger and log
   their registration.
4. **`plugins/analytics.ts`** performs a **side-effect import with no exports**:
   importing it registers an analytics listener onto the registry.
5. **`main.ts`** must:
   - import the features barrel (which imports both features),
   - import the analytics plugin for its side effect
     (`import './plugins/analytics.js';`),
   - log all registered names,
   - **dynamically** import `features/orders` only when a condition is true,
     proving the module loads on demand,
   - show that the registry, populated in three different files, is one shared
     object.
6. Add a `README.md` with a diagram of the module graph and a note about which
   imports are static, which are side-effect-only, and which are dynamic.

**Solution**

```text
mini-framework/package.json
```

```json
{
  "name": "mini-framework",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node src/main.js"
  }
}
```

> ⚠️ In a plain Node project you either write JavaScript files or compile
> TypeScript first. To keep this runnable with `node src/main.js`, the solution
> uses `.js` files with JSDoc comments for types. (In Part 2 you will write the
> same thing in `.ts` and run it with `tsx` or a build step.)

```text
mini-framework/src/core/logger.js
```

```js
/** @typedef {'debug'|'info'|'warn'|'error'} LogLevel */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

// Module scope: one value shared by every importer (a singleton by design).
let currentLevel = 'info';

/** @param {LogLevel} level */
export function setLogLevel(level) {
  if (!(level in LEVELS)) throw new Error(`Unknown log level: ${level}`);
  currentLevel = level;
  // eslint-disable-next-line no-console
  console.log(`[logger] level set to ${level}`);
}

/**
 * Creates a logger bound to a namespace.
 * @param {string} namespace
 */
export function createLogger(namespace) {
  const write = (level, message, ...details) => {
    if (LEVELS[level] < LEVELS[currentLevel]) return; // suppressed
    const line = `[${level}] ${namespace}: ${message}`;
    // eslint-disable-next-line no-console
    console.log(line, ...details);
  };

  return {
    debug: (message, ...details) => write('debug', message, ...details),
    info: (message, ...details) => write('info', message, ...details),
    warn: (message, ...details) => write('warn', message, ...details),
    error: (message, ...details) => write('error', message, ...details),
  };
}
```

```text
mini-framework/src/core/registry.js
```

```js
import { createLogger } from './logger.js';

const logger = createLogger('registry');

// A module-scoped Map: created once, shared by every importer.
/** @type {Map<string, () => Promise<unknown>>} */
const loaders = new Map();

/** @type {Array<(name: string) => void>} */
const listeners = [];

/**
 * Registers a lazy loader under a name.
 * @param {string} name
 * @param {() => Promise<unknown>} loader
 */
export function register(name, loader) {
  if (loaders.has(name)) {
    throw new Error(`"${name}" is already registered`);
  }
  loaders.set(name, loader);
  logger.debug(`registered "${name}"`);

  // notify plugins (the analytics plugin subscribes below)
  for (const listener of [...listeners]) listener(name);
}

/**
 * Loads (dynamically imports) a registered feature and caches the result.
 * @param {string} name
 */
export async function load(name) {
  const loader = loaders.get(name);
  if (!loader) throw new Error(`"${name}" is not registered`);

  return loader();
}

/** @returns {string[]} */
export function registeredNames() {
  return [...loaders.keys()];
}

/**
 * Lets plugins observe registrations.
 * @param {(name: string) => void} listener
 */
export function onRegister(listener) {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}
```

```text
mini-framework/src/plugins/analytics.js
```

```js
// SIDE-EFFECT MODULE: no exports at all. Importing it is the whole point.
import { onRegister } from '../core/registry.js';

onRegister((name) => {
  // A real plugin would send this to an analytics endpoint.
  console.log(`[analytics] feature registered: ${name}`);
});
```

```text
mini-framework/src/features/users.js
```

```js
import { register } from '../core/registry.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('users');

const USERS = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
];

// Registration happens as a side effect of importing this module.
register('users', async () => {
  logger.info('loading users from the "API"');
  return USERS;
});

export async function loadData() {
  return USERS;
}

logger.debug('users module evaluated');
```

```text
mini-framework/src/features/orders.js
```

```js
import { register } from '../core/registry.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('orders');

const ORDERS = [
  { id: 'o1', total: 5998 },
  { id: 'o2', total: 1299 },
];

register('orders', async () => {
  logger.info('loading orders from the "API"');
  return ORDERS;
});

export async function loadData() {
  return ORDERS;
}

logger.debug('orders module evaluated');
```

```text
mini-framework/src/features/index.js
```

```js
// Barrel for the features folder. Importing this imports both features,
// which registers both of them as a side effect.
export * from './users.js';
export * from './orders.js';
```

```text
mini-framework/src/core/index.js
```

```js
export { register, load, registeredNames, onRegister } from './registry.js';
export { createLogger, setLogLevel } from './logger.js';
```

```text
mini-framework/src/main.js
```

```js
import { registeredNames, load, onRegister } from './core/index.js';
import { createLogger, setLogLevel } from './core/index.js';
import './plugins/analytics.js';      // side-effect import: registers the plugin
import './features/index.js';         // side-effect import: registers both features

const logger = createLogger('main');

async function main() {
  setLogLevel('debug');               // module-scoped state, shared everywhere

  logger.info('registered features:', registeredNames());

  // Prove the registry is a single shared instance: importing the module again
  // returns the SAME Map contents.
  const secondImport = await import('./core/registry.js');
  logger.info('same registry?', secondImport.registeredNames());

  // Static imports already evaluated both features...
  logger.debug('--- static path ---');
  const users = await load('users');
  logger.info('users:', users.length);

  // ...and a DYNAMIC import loads a module on demand.
  logger.debug('--- dynamic path ---');
  const shouldLoadOrders = true;
  if (shouldLoadOrders) {
    // The module is fetched at THIS moment, not at startup.
    const ordersModule = await import('./features/orders.js');
    logger.info('orders module evaluated on demand:', Object.keys(ordersModule));

    // ...and now the registry can load it too.
    const orders = await load('orders');
    logger.info('orders loaded dynamically:', orders.length);
  }

  // A local listener proves the plugin mechanism works both ways.
  const unsubscribe = onRegister((name) => logger.debug(`main saw registration: ${name}`));
  const { register } = secondImport;
  register('invoices', async () => [{ id: 'i1' }]);
  unsubscribe();

  logger.info('final registry:', registeredNames());
}

main().catch((error) => console.error('failed:', error));
```

```text
mini-framework/README.md
```

```markdown
# Mini framework

```text
main.js
├── (static)  core/index.js ──► registry.js  ← one shared Map
│                           └─► logger.js    ← one shared level
├── (static)  plugins/analytics.js  — side-effect only (no exports)
├── (static)  features/index.js
│             ├── features/users.js   → registers 'users'
│             └── features/orders.js  → registers 'orders'
└── (dynamic) features/orders.js      — imported on demand via import()
```
```

**Expected output (order may vary slightly with your Node version — module
evaluation order is deterministic but depends on the graph)**

```text
[analytics] feature registered: users
[analytics] feature registered: orders
[logger] level set to debug
[info] main: registered features: [ 'users', 'orders' ]
[info] main: same registry? [ 'users', 'orders' ]
[debug] main: --- static path ---
[info] users: loading users from the "API"
[info] main: users: 2
[debug] main: --- dynamic path ---
[info] main: orders module evaluated on demand: [ 'loadData' ]
[info] orders: loading orders from the "API"
[info] main: orders loaded dynamically: 2
[debug] registry: registered "invoices"
[analytics] feature registered: invoices
[debug] main: main saw registration: invoices
[info] main: final registry: [ 'users', 'orders', 'invoices' ]
```

Reading this output:

- The two `[analytics]` lines come first because the plugin module is evaluated
  before the features barrel — side-effect imports run in the order they appear.
- `[logger] level set to debug` appears after them because `setLogLevel` is called
  inside `main()`.
- `[debug] main: --- static path ---` is logged *before* `[info] users: ...`
  because debug output is now enabled, and the static path runs first.
- `[debug] registry: registered "invoices"` and `[analytics] feature registered:
  invoices` prove that the second import of the registry is the **same instance**
  and that the plugin listener is still active.
- Nothing above is printed twice (except registration notifications, which are
  intentional), which proves each module was evaluated **once**.

**What this challenge proves**

- **Module scope is shared per module, not per import.** `import()`-ing the
  registry a second time returns the *same* module instance, so the Map already
  contains `users` and `orders`.
- **Side-effect imports are a real tool.** `import './plugins/analytics.js'` has no
  bindings — it exists purely to run the module. Plugin systems, polyfills and
  style imports all work this way (`import './index.css'` in a React project is
  exactly this kind of import).
- **Static vs dynamic imports differ in *when* the code loads.** The static
  features barrel is evaluated before `main` runs; the dynamic `import()` of
  orders happens inside an `if`.
- **Barrels re-export**, and `export * from` is the shortest form — with the
  caveat that it also forwards names you might not want, which is why the earlier
  exercise listed exports explicitly.
- **Registration order is deterministic** because it follows the import graph,
  which is why module-level side effects are powerful *and* risky: an unused
  import can still change behaviour.

---

## 13. Summary

- Modules give every file its **own scope**; only exports are visible outside.
- **Named exports** use `{ }` in both directions; **default exports** do not.
- A module can have many named exports and **one** default export.
- Alias with `as`, re-export with `export ... from`, and gather with `export * from`
  (barrels — keep them shallow).
- Import paths: `'./x'` (same folder), `'../x'` (up one), bare specifiers for
  packages (`'react'`), and aliases like `'@/components'` when configured.
- Vite resolves `.tsx/.ts/.jsx/.js` and `index` files for you; Node ESM needs the
  extension.
- **`import type`** for types — erased at build time, and required under
  `isolatedModules`/`verbatimModuleSyntax`.
- A module is evaluated **once**; module-level variables are shared singletons.
- **Dynamic `import()`** loads on demand and powers `React.lazy` (which needs a
  default export or an explicit `{ default }` mapping).
- Most "Module not found" and "does not provide an export named" errors are a
  one-character problem in the import/export pair — read both sides.

**What's next →** [`10-promises.md`](./10-promises.md): asynchronous JavaScript —
the foundation for every API call React will make.
