# 04 — Project Structure: Where Does Everything Go?

> **Part 3 · React Fundamentals · File 4 of 12**
> Why this file exists: a React project has no enforced layout, so beginners invent one per file and end up with `App.tsx` at 900 lines and a `utils.ts` nobody understands. This file gives you a structure that survives growth — and explains *why* each rule exists, using real files and a real lint warning from our lab.

---

## 1. The destination: the tree we will build in this part

Before the rules, look at the target. This is the MegaShop app as it stands at the end of Part 3 — **17 files, 735 lines, of which 678 lines are TypeScript/TSX**:

```text
megashop/
├── index.html                       ← the mount point + entry script
├── package.json                     ← scripts + dependency ranges
├── package-lock.json                ← exact resolved versions (commit this)
├── vite.config.ts                   ← bundler/dev-server config
├── tsconfig.json                    ← solution file (references the two below)
├── tsconfig.app.json                ← options for src/ (jsx: react-jsx, strict, noUnused*)
├── tsconfig.node.json               ← options for vite.config.ts (Node env)
├── .oxlintrc.json                   ← React correctness lint rules
└── src/
    ├── main.tsx                    13 lines  ← bootstrap: createRoot + <App /> + StrictMode
    ├── index.css                   57 lines  ← global styles (dark theme, layout primitives)
    ├── App.tsx                     66 lines  ← the page: state + composition
    ├── data/
    │   ├── products.ts             52 lines  ← types + fake data + formatMoney + ratingPercent
    │   └── stock.ts                22 lines  ← stockLevel() + STOCK_LABELS
    ├── components/
    │   ├── Header.tsx              20 lines  ← title/subtitle + children slot
    │   ├── SearchBar.tsx           50 lines  ← controlled input + form submit
    │   ├── CategoryFilter.tsx      35 lines  ← chips with counts (array → list)
    │   ├── ProductList.tsx         35 lines  ← list + early-return empty state
    │   ├── ProductCard.tsx         64 lines  ← composition of 4 smaller components
    │   ├── PriceTag.tsx            29 lines  ← money formatting + discount branch
    │   ├── Rating.tsx              23 lines  ← derived percentage + optional count
    │   ├── StockBadge.tsx          33 lines  ← exhaustive switch over a union
    │   ├── Tag.tsx                 19 lines  ← children-or-default text
    │   └── EmptyState.tsx          18 lines  ← title + optional message + action slot
    └── dev/                         (dev-only harnesses, never bundled)
        ├── render-static.tsx      104 lines  ← renders every component to HTML
        └── interact.tsx            95 lines  ← drives the app in a headless DOM
```

Two things to notice before the theory:

1. **Nothing is in `App.tsx` that is not page-level.** `App.tsx` holds three `useState` calls, two derived values and the composition of four components — 66 lines for a page with search, filtering, a cart counter and an empty state. That is the payoff of the structure.
2. **The tree is organised by *responsibility*, not by file type.** `data/` holds types-and-data, `components/` holds UI, `dev/` holds developer tooling. There is no `types.ts` at the root, no `utils.ts`, no `services/` for a file that is not a service.

If you create the files in this part in the order these chapters introduce them, you will arrive exactly here.

---

## 2. The one rule that generates all the others

> **Put a file where a reader would look for it when the feature breaks.**

That is the entire design principle. Everything below is a consequence of it:

- When the price looks wrong, you look in `PriceTag.tsx` — not "somewhere in the components folder".
- When the filter is wrong, you look in `App.tsx` (state) or `CategoryFilter.tsx` (control) — two predictable places.
- When a TypeScript error names a product field, you look in `data/products.ts` — the single source of truth for that shape.
- When the app's HTML looks wrong, you open `render-static.tsx` (dev harness) and print it.

A structure is good if it makes "where do I look?" answerable in one guess, and "where do I put this new thing?" answerable without a meeting.

---

## 3. Two organising strategies (and when each wins)

### 3.1 Layer-first (what we use)

Files grouped by *kind*:

```text
src/
├── components/     ← all UI components
├── data/           ← types, constants, fake data
├── hooks/          ← custom hooks            (Part 4 adds this)
├── lib/            ← pure helpers with no React
└── pages/          ← route-level components  (Part 6 adds this)
```

**Strengths:** trivially understandable; a new developer can guess where things live; great up to roughly 30–60 files; perfect for a single feature area or a small app.

**Weakness:** past a certain size, "components" becomes a bag of 80 unrelated files, and a single *feature* is spread across four layers. That is when teams switch.

### 3.2 Feature-first

Files grouped by *what they do for the user*:

```text
src/
├── app/                    ← app shell, routes, providers
├── features/
│   ├── catalog/
│   │   ├── ProductCard.tsx
│   │   ├── ProductList.tsx
│   │   ├── useCatalogFilters.ts
│   │   └── catalog.test.tsx
│   ├── cart/
│   │   ├── CartBadge.tsx
│   │   ├── useCart.ts
│   │   └── cart.test.tsx
│   └── checkout/
├── shared/                 ← genuinely cross-cutting: Button, money format, api client
└── data/
```

**Strengths:** a feature is a folder; deleting the feature deletes the folder; teams rarely collide because they own different folders; tests sit beside the code they test.

**Weakness:** more structure to maintain; "is this shared or feature-local?" becomes a recurring judgement call; over-engineering risk for small apps (three folders for one button).

| Decide by | Layer-first | Feature-first |
| --- | --- | --- |
| Number of files | < ~40 | > ~60, or growing fast |
| Number of teams | 1–2 | 3+ (ownership matters) |
| Feature independence | Features touch the same data | Features are largely separable |
| Onboarding | Newcomers, juniors | Experienced team, own conventions |

**Migration is cheap and should be deliberate:** start layer-first (it is what most tutorials, this part, and small projects use), and move to feature folders when you notice two things — (a) you are scrolling to find files, (b) two people keep editing the same folder. Do **not** start with feature folders on a 10-file app; you will spend your energy on folders instead of features.

---

## 4. What goes where: the decision table

| You are writing… | It goes in | Our example | Why there |
| --- | --- | --- | --- |
| A visible piece of UI | `src/components/Name.tsx` | `PriceTag.tsx` | One component per file, name matches the export |
| A page / route-level screen | `src/pages/NamePage.tsx` (later: `src/routes/`) | `App.tsx` for now | Pages compose components; they are a different *kind* of thing |
| Types + data for a domain | `src/data/domain.ts` | `products.ts`, `stock.ts` | One source of truth for shapes and fake/real data |
| A pure function with no React | `src/lib/name.ts` (or next to its data) | `formatMoney`, `stockLevel` | Testable without a DOM; usable from anywhere |
| A reusable stateful behaviour | `src/hooks/useThing.ts` | `useProductFilters()` (Part 4 exercise) | Hooks are not components; different rules apply |
| Freshly-fetched server data | `src/api/` + a query library | Part 7 / Part 14 | Network code is not view code |
| App-wide types not tied to one domain | `src/types/` | Part 15 | Only when they are genuinely shared |
| Dev-only tooling | `src/dev/` | `render-static.tsx` | Clearly not part of the shipped app |
| Tests | next to the file: `PriceTag.test.tsx` | Part 13 | Colocation: the test moves when the file moves |
| Global CSS | `src/index.css` | our theme | Imported once in `main.tsx` |
| Component-scoped CSS | beside the component (`PriceTag.module.css`) | Part 12 | Colocated, no global namespace pollution |
| Static files that keep their name | `public/` | `favicon.svg` | Served as-is; no hashing |
| Images/fonts the bundler should hash | `src/assets/` | template's `hero.png` | Imported, hashed, optimised |

---

## 5. Naming conventions

Consistency beats preference: any team's convention is better than each developer's own. These are the conventions used in these notes and in the wider React ecosystem.

| Thing | Convention | Example | Reason |
| --- | --- | --- | --- |
| Component file | `PascalCase.tsx` | `ProductCard.tsx` | The file exports a component of that exact name; imports read like the JSX they produce |
| Non-component file | `camelCase.ts` or `kebab-case.ts` | `products.ts`, `stock.ts` | Signals "no JSX here"; a lowercase filename in a folder of PascalCase files is a useful flag |
| Component | `PascalCase` | `function ProductCard()` | Required by JSX: lowercase tags mean DOM elements |
| Hook | `use` + `PascalCase` | `useCart()` | Required by the lint rules and by convention; also visually distinguishes hooks |
| Plain function | `camelCase`, verb-first | `formatMoney`, `stockLevel` | Says what it does |
| Boolean | `is/has/can/should` prefix | `isDiscounted`, `soldOut` | `if (isDiscounted)` reads like English; avoids `flag`/`status`-style ambiguity |
| Event handler prop | `on` + Event | `onAddToCart`, `onSearch` | The *component* decides when; the *parent* decides what |
| Event handler inside the component | `handle` + Event | `handleSubmit`, `handleChange` | Distinguishes "what I was given" from "what I wrote" |
| CSS class | `kebab-case`, BEM-ish | `.card__name`, `.price--lg` | Matches CSS conventions; `.card__name` reads as "part of card" |
| Constant | `SCREAMING_SNAKE_CASE` | `COMPARE_AT`, `PRICE_MINOR` | Signals a module-level constant, not a local |
| Type / interface | `PascalCase`; props end in `Props` | `ProductCardProps` | Props type is discoverable from the component name |

Two conventions that carry unusual weight:

- **`on*` vs `handle*`.** This pair removes most "which function is this?" confusion in props-heavy code. `<ProductCard onAddToCart={handleAddToCart} />` tells you at a glance which side of the boundary you are on.
- **Booleans read well.** `featured`, `disabled`, `open` are acceptable as *props* (short, obvious). Local variables should be readable: `const soldOut = product.stock <= 0;` — then `<button disabled={soldOut}>` says exactly what it means.

---

## 6. One component per file (and the two exceptions)

**The rule:** one exported component per file, filename = component name.

**Why:** the file is the unit of reading, reviewing and navigating. "Where is `PriceTag`?" must have one answer. It also keeps diffs small and reviewable, and it is a precondition for the Fast Refresh behaviour in section 8.

**Exception 1 — tiny private helpers.** A component used *only* by the file's main component and too small to be reused can live in the same file, unexported:

```tsx
// src/components/PriceTag.tsx (illustrative)
function Currency({ minor }: { minor: number }) {
  return <span className="price__now">{formatMoney(minor)}</span>;
}

export function PriceTag({ priceMinor, compareAtMinor, size = 'sm' }: PriceTagProps) { /* uses Currency */ }
```

If a second file ever needs `Currency`, promote it to its own file. **Never export both** — that is exactly what the lint warning in section 8 is about.

**Exception 2 — tightly coupled compound components.** A `Tabs` file that exports `Tabs.List`/`Tabs.Panel` as a namespace object, or a `Select` that exports `Select` and `Select.Option`. This is an advanced pattern (Part 10); it keeps the pieces in one file *because* they only make sense together.

### 6.1 When to split a component

Split when **any** of these is true:

- It exceeds roughly 150 lines of JSX/logic (our largest component is `ProductCard` at 64 lines).
- It has more than one *reason to change* (e.g. pricing rules **and** add-to-cart behaviour **and** layout).
- A chunk of its JSX is repeated two or more times.
- It has more than ~4 hooks (a sign it is doing several jobs).
- You cannot name it in three words.

Do **not** split when:

- The pieces would need 10 props to communicate — that means the seam is wrong, not that the file is too big.
- You are splitting "for testability" but the pieces have no independent behaviour.
- You are creating a component that takes `children` and 12 boolean flags to be reusable "someday". **Premature abstracting is worse than a long file**, because it hides logic behind indirection nobody asked for.

Our `ProductCard` is the healthy middle: 64 lines, composed of four small components (`Rating`, `PriceTag`, `StockBadge`, `Tag`), each of which is independently understandable in under 30 lines.

---

## 7. Colocation: keep related things together

Three kinds of colocation pay off immediately:

**1. State next to the UI that owns it.** `SearchBar` keeps its draft query internally and tells the parent only when the user submits (`onSearch(query.trim())`). The alternative — lifting every keystroke into `App` — makes `App` responsible for a draft value that only the search box cares about. Part 4 (state design) turns this into a complete rule set with "lift state up" as the balance.

**2. Styles next to the component.** Once you use CSS Modules or Tailwind (Part 12) this becomes literal: `PriceTag.module.css` sits beside `PriceTag.tsx`. Even with a global sheet (our current lab), the *class names* are colocated: `.price--lg` exists only because `PriceTag` uses it.

**3. Tests next to the file.** `PriceTag.test.tsx` beside `PriceTag.tsx` means deleting the component means deleting the test, and reviewers see both in the same diff (Part 13).

Our lab adds a fourth: **dev harnesses** in `src/dev/`. `render-static.tsx` renders every component to an HTML string; `interact.tsx` drives the whole app in a headless DOM. They are not tests (no assertions), but they catch what reading cannot: what the markup actually is, and what a sequence of interactions actually does. Because they are not imported by `main.tsx`, Vite never bundles them. They do need three dev-only packages:

```bash
npm i -D tsx jsdom @types/jsdom
```

then run them with the app's tsconfig so JSX resolves correctly:

```bash
npx tsx --tsconfig tsconfig.app.json src/dev/render-static.tsx
```

> 💡 Keep the harness out of your app's dependency graph. `src/dev/*` imports `react-dom/server` and `jsdom`, which should never reach a browser bundle. The way we guarantee that is simply *not importing* those files from `main.tsx`. (Part 16 shows how to assert this in CI.)

---

## 8. A real lint warning, and what it teaches about structure

While building the lab we wrote `StockBadge.tsx` with a helper function in the same file and both exported:

```tsx
// src/components/StockBadge.tsx — BEFORE
export type StockLevel = 'out' | 'low' | 'in' | 'unknown';

/** Turn a raw number into a named level. Plain function — no React needed. */
export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'out';
  if (stock < 5) return 'low';
  return 'in';
}

export function StockBadge({ product }: StockBadgeProps) { /* … */ }
```

`npm run lint` said (real output):

```text
  ! react(only-export-components): Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components.
   ,-[src/components/StockBadge.tsx:6:17]
 5 | /** Turn a raw number into a named level. Plain function — no React needed. */
 6 | export function stockLevel(stock: number): StockLevel {
   :                 ^^^^^^^^^^
   `----

Found 1 warning and 0 errors.
Finished in 37ms on 16 files with 116 rules using 2 threads.
```

**Why the rule exists (the real reason).** Fast Refresh works by swapping a module in place and re-rendering its components while preserving state. It can only do that reliably if the module's exports are *all* components. A module that also exports a plain function or constant makes the tooling conservative: it may fall back to a full page reload, so the counter you were testing resets every time you save. The rule is not bureaucracy; it is protecting your iteration speed.

**The fix** — move the data logic to the data layer, where it also belongs on its own merits (it is reusable, it is testable without a DOM, and it has nothing to do with rendering):

**File: `src/data/stock.ts`**

```ts
// Stock rules live in their own module: they are plain logic, they are reusable,
// and keeping them out of the component file keeps Fast Refresh happy
// (see the oxlint "only-export-components" note in file 07).

export type StockLevel = 'out' | 'low' | 'in' | 'unknown';

/**
 * Turn a raw stock number into a named level.
 * 0 or less → 'out' · 1–4 → 'low' · 5 or more → 'in'.
 */
export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'out';
  if (stock < 5) return 'low';
  return 'in';
}

export const STOCK_LABELS: Record<StockLevel, string> = {
  out: 'Sold out',
  low: 'Few left',
  in: 'In stock',
  unknown: 'Checking…',
};
```

**File: `src/components/StockBadge.tsx`** (after)

```tsx
import type { Product } from '../data/products';
import { STOCK_LABELS, stockLevel } from '../data/stock';

export interface StockBadgeProps {
  product: Pick<Product, 'stock'>;
}

export function StockBadge({ product }: StockBadgeProps) {
  const level = stockLevel(product.stock);

  switch (level) {
    case 'out':
      return <span className="badge badge--out">{STOCK_LABELS.out}</span>;
    case 'low':
      return (
        <span className="badge badge--low">
          {STOCK_LABELS.low} — only {product.stock} left
        </span>
      );
    case 'in':
      return <span className="badge badge--in">{STOCK_LABELS.in}</span>;
    case 'unknown':
      return <span className="badge">{STOCK_LABELS.unknown}</span>;
    default: {
      // Unreachable today — but if someone adds a level to StockLevel, `level`
      // is no longer `never` and this line stops compiling until it is handled.
      const unhandled: never = level;
      throw new Error(`Unhandled stock level: ${String(unhandled)}`);
    }
  }
}
```

**Expected result** after the move:

```text
$ npm run lint

Found 0 warnings and 0 errors.
Finished in 26ms on 17 files with 116 rules using 2 threads.
```

Note what the fix bought us beyond silencing a warning:

- `stockLevel` is now usable by anything (a future cart screen, a test, a sorting function) without importing a component.
- `STOCK_LABELS` gives every level exactly one label, so the badge, a future filter chip and a screen reader all say the same words.
- The component file has one reason to change: markup. The data file has one reason to change: business rules.

That is the general shape of "where does this go?" answers: **logic to `data/` or `lib/`, view to `components/`, glue to `App.tsx`.**

---

## 9. Barrel files: tempting, usually a mistake

A **barrel** is an `index.ts` that re-exports a folder:

```ts
// src/components/index.ts  ← think twice
export * from './ProductCard';
export * from './ProductList';
export * from './PriceTag';
```

It looks tidy (`import { ProductCard, PriceTag } from './components'`) and it costs you:

- **Circular imports.** `index.ts` imports every component; a component that (through any path) imports `index.ts` closes a cycle. Cycles produce "undefined is not a function" at runtime and are miserable to debug.
- **Slower dev.** Every import of the barrel pulls the whole folder into the module graph, so Vite transforms files you did not touch.
- **Worse Fast Refresh**, for the same reason as the lint rule in section 8: the barrel module is not a component module.
- **Worse tree-shaking** in some bundler configurations, because `export *` obscures what is used.

**Rule:** import what you use, from the file that defines it (`import { PriceTag } from '../components/PriceTag'`). Paths are longer; everything else is better. (Part 17 revisits this once a real app has deep feature folders where a *feature-level* public API genuinely helps.)

---

## 10. Relative paths, `../..`, and path aliases

As depth grows, relative imports get ugly:

```tsx
import { ProductCard } from '../../../../components/ProductCard';   // how deep am I?
```

Two mitigations, in order of preference:

1. **Keep the tree shallow** (layer-first does this naturally: at most `src/components/…`).
2. **Path aliases** for genuinely deep trees — a `@/` prefix mapped to `src/`:

```ts
// vite.config.ts               (aliases live in the bundler…)
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

```json
// tsconfig.app.json           (…and TypeScript must agree, or the editor shows errors)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

```tsx
import { ProductCard } from '@/components/ProductCard';   // same import from any depth
```

> ⚠️ **Two configs, one truth.** An alias that exists only in `vite.config.ts` builds fine and shows red squiggles in the editor; an alias that exists only in `tsconfig.app.json` type-checks and fails at build. Set both, or neither. We add aliases in Part 16 when the project is deep enough to need them; the lab does not use them.

---

## 11. Growing past Part 3

When the app grows, add structure **on demand**, never in advance:

| Trigger | Structural response |
| --- | --- |
| A component needs state that two files share | Lift it to their common parent, or extract a hook into `src/hooks/` (Part 4) |
| Something must be shared app-wide (theme, auth user, cart) | A Context provider in `src/app/` or `src/providers/` (Part 5) |
| A second screen appears | `src/pages/` + a router (Part 6) |
| Server data appears | `src/api/` + TanStack Query with a query-key module (Parts 7, 14) |
| More than ~40 files, or 3+ developers | Migrate to feature folders (section 3.2) |
| CSS starts colliding | CSS Modules per component, or Tailwind (Part 12) |
| Types get shared across domains | Extract to `src/types/` — but only the genuinely shared ones (Part 15) |

The failure mode in the other direction is real too: **do not create `hooks/`, `lib/`, `types/`, `services/`, `contexts/` on day one.** Empty folders are instructions to fill them with speculative code. Create a folder the day the second file needs it.

---

## 12. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Everything in `App.tsx` | One 800-line file; merge conflicts on every feature | Extract one component at a time, starting with leaf components (`PriceTag`, `Rating`) |
| `utils.ts` / `helpers.ts` junk drawer | Nobody knows what is in it; everyone adds to it | Name files after their domain: `money.ts`, `stock.ts`, `format.ts` |
| One `types.ts` for the whole app | `types.ts` imports from everywhere; everything imports `types.ts` | Types live beside their domain (`data/products.ts`); promote to `types/` only when genuinely shared |
| Barrel `index.ts` files everywhere | Circular imports, slow HMR, "undefined is not a function" | Import from the defining file |
| Exporting helpers from component files | oxlint warning; Fast Refresh falls back to full reloads | Move logic to `data/`/`lib/` (section 8) |
| Deep relative paths (`../../../..`) | Unreadable imports; moving a file breaks many imports | Keep trees shallow; add a `@/` alias when justified (section 10) |
| Component files named `productcard.tsx` | Inconsistent imports; hard to spot components; case-sensitivity bugs in CI | `PascalCase.tsx` matching the exported component |
| `components/ProductCard/index.tsx` for everything | Five file trees for five components; imports end in `/index` | Flat files under `components/`; use folders when a component has *assets* (CSS module, test, sub-components) |
| Test files far from code (`__tests__/` mirror tree) | Tests and code drift apart; refactors break imports that "look fine" | Colocate: `PriceTag.test.tsx` beside `PriceTag.tsx` (Part 13) |
| Mixing styles approaches randomly | `.price` global here, inline style there, a CSS module somewhere else | Pick one strategy per app, with inline styles only for *dynamic numeric* values (Part 12) |
| Putting `jsdom`-using dev files next to app code | Accidental bundle damage, or extra deps in production | `src/dev/`, never imported by `main.tsx` |

---

## 13. Practice

### Beginner

Create the folder structure from section 1 and add the files you have so far (from file 03's skeleton). You do not need the MegaShop components yet — just `src/components/` with one `Header.tsx` that renders the title, `src/data/products.ts` with a `Product` interface and two products, and `App.tsx` using them.

**Expected result:** `npm run dev` shows the title and two product names; `npx tsc -b` is silent; `npm run lint` reports `0 warnings and 0 errors`.

### Intermediate

Take the component below (a deliberately mixed-up file) and split it into the structure from section 1. State, for each piece, where it went and why.

```tsx
// src/ProductStuff.tsx
export const currencies = { INR: '₹', USD: '$' };

export function formatMoney(minor: number, currency: 'INR' | 'USD') {
  return `${currencies[currency]}${(minor / 100).toFixed(2)}`;
}

export default function ProductStuff({ name, priceMinor }: { name: string; priceMinor: number }) {
  const isExpensive = priceMinor > 1000000;
  return (
    <article>
      <h3>{name}</h3>
      {isExpensive ? <strong>{formatMoney(priceMinor, 'INR')}</strong> : <span>{formatMoney(priceMinor, 'INR')}</span>}
    </article>
  );
}
```

**Solution**

```text
src/data/money.ts        → `currencies` and `formatMoney` (pure logic, no React, reusable
                           by emails, tests, PDFs — anywhere money is displayed)
src/components/ProductStuff.tsx (rename to ProductCard.tsx)
                         → the component, importing formatMoney from '../data/money'
                           (also: rename, because "Stuff" tells a reader nothing)
```

```ts
// src/data/money.ts
export const currencies = { INR: '₹', USD: '$' } as const;

export type CurrencyCode = keyof typeof currencies;

export function formatMoney(minor: number, currency: CurrencyCode = 'INR'): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}
```

```tsx
// src/components/ProductCard.tsx
import { formatMoney } from '../data/money';

export interface ProductCardProps {
  name: string;
  priceMinor: number;
}

export function ProductCard({ name, priceMinor }: ProductCardProps) {
  const isExpensive = priceMinor > 1000000;
  return (
    <article>
      <h3>{name}</h3>
      {isExpensive ? <strong>{formatMoney(priceMinor)}</strong> : <span>{formatMoney(priceMinor)}</span>}
    </article>
  );
}
```

Reasons: the currency logic has nothing to do with rendering, is pure, and belongs in the data layer (it is now usable and testable without React). The component file exports exactly one component, matching its name. Note also the small type upgrade: `'INR' | 'USD'` derived from the `currencies` object via `as const` + `keyof typeof` (Part 2) removes a duplicated union that would otherwise need editing in two places.

### Challenge

You are handed a codebase with these three problems. Decide the *minimum* structural change that fixes each — and say what you would deliberately **not** do yet.

```text
a) src/components/ has 42 files, and `ProductCard.tsx` imports
   `../data/filters.ts`, which imports `./components/index.ts`.
b) A new developer needs 20 minutes to find where "out of stock" is decided.
c) The team wants to add a second screen (a product detail page) and a
   third developer, next month.
```

**Solution**

```text
a) Circular import through a barrel. Minimum fix: delete `components/index.ts`
   and import each component from its own file. Do NOT restructure into feature
   folders yet — the cycle is the problem, not the folder layout.

b) The rule lives in a component (or in three places). Minimum fix: move it into
   a named function in the data layer (`stockLevel()` in `src/data/stock.ts`)
   and use it everywhere, so "where is this decided?" has exactly one answer and
   the function is greppable by name. This is precisely the fix we did in §8.

c) A second screen needs a page boundary and a router. Minimum change now:
   create `src/pages/` and move the current screen into `src/pages/CatalogPage.tsx`,
   keeping `App.tsx` as the shell. Add React Router in Part 6. For the third
   developer: introduce feature folders then, when ownership actually collides —
   with 40-ish files and two people, layer-first is still fine. Deliberately NOT
   done: migrating to `src/features/*` pre-emptively, and adding path aliases
   before imports get unwieldy.
```

The pattern in all three: **fix the cause with the smallest structural edit, and let real pressure create the next structure.**

---

## 14. Summary

- There is no enforced layout, so choose one and follow it: **layer-first** (`components/`, `data/`, later `hooks/`, `pages/`), migrating to feature folders when a folder becomes a bag of unrelated files or teams collide.
- The single test for any placement decision: **where would a reader look when this breaks?**
- **One component per file**, filename = component name. Private helpers in the same file are fine; *exported* non-components are not (Fast Refresh + `react/only-export-components`).
- Put **logic** in `data/`/`lib/`, **view** in `components/`, **glue** in `App.tsx`/pages. `App.tsx` should compose, not compute.
- **Colocate**: state with the component that owns it, styles with the component that uses them, tests beside the file, dev harnesses in `src/dev/` (never imported by `main.tsx`).
- Avoid barrels; import from the defining file. Add path aliases only when depth justifies them — and configure **both** Vite and TypeScript.
- Grow the structure on demand (second screen → `pages/`, shared state → context/hooks, server data → `api/`), and never create empty folders for a future you have not met yet.

---

**What's next →** [`05-jsx.md`](./05-jsx.md)
