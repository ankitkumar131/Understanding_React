# 02 — Project Architecture: Layers, Features and the Direction of Dependencies

> **Part 15 · Production · File 2 of 8**

Why this file exists: at twenty components, any structure works; at two hundred, structure is the difference between a codebase you can change in an afternoon and one where every change requires reading fifteen files. This file is about the invisible part of structure — not which folder a file sits in (file 03), but **which way the arrows point**: what is allowed to import what, where the boundaries are, and how a feature stays a unit you can reason about, test and delete. Two common architectures are described (layer-based and feature-based), with the trade-offs stated honestly, and one rule that prevents most of the mess: dependencies must flow one way, through defined entry points.

---

## 1. Why architecture is about arrows, not folders

```text
❌ everything imports everything            ✅ dependencies point one direction
feature A ◄──► feature B                                pages
   │                │                                      │
   └──► utils ◄─────┘                                   features ──► shared ──► lib
   │                                   ▲                    ▲
   └──► components ◄── feature C       └── imports flow this way: down, never sideways
```

An arrow is an import. When features import each other, three things happen: a change to A breaks B; you cannot delete A without checking B; and tests for A must set up B. The fix is not more folders — it is *fewer arrows*, pointing one way.

**The rule in one line:** UI may depend on state, state may depend on the API layer, the API layer may depend on shared utilities — and nothing depends on a feature except the page that renders it (or an explicit, documented boundary).

| Layer | May import | Must not import |
| --- | --- | --- |
| Pages / routes | features, shared | other pages |
| Features | shared, lib, API | other features (except via a published entry) |
| Shared UI + hooks | lib | features, pages |
| API layer | lib, types | React components |
| `lib` (pure helpers) | nothing app-specific | everything else |

💡 The most useful test of a boundary is **deletability**: can you delete the `orders` feature folder and have the app still build (with the route removed)? If not, the arrows are pointing the wrong way.

---

## 2. Layer-based architecture, and where it breaks

```text
src/
  components/        # Button, Modal, Table … (all features mixed together)
  hooks/             # useProducts, useCart, useOrders … (all features mixed)
  api/               # products.ts, orders.ts …
  pages/             # ProductsPage, OrdersPage …
  utils/
  types/
```

| Strengths | Weaknesses as the app grows |
| --- | --- |
| obvious at first glance | a feature is spread across five folders — you cannot see it whole |
| small cognitive overhead when the app is small | every change touches many folders and diff reviews lose context |
| easy for newcomers ("components are here") | deleting a feature means hunting every folder |
| shared pieces are naturally named the same | unrelated things collect (`components/` becomes a junk drawer) |

Layer-based architecture is a perfectly good **starting** structure. It fails at scale for one reason: it organises by *kind* rather than by *capability*, so a feature has no home.

---

## 3. Feature-based architecture

```text
src/
  app/                      # app shell: providers, router, error boundary, styles
  pages/                    # thin route components that compose features
  features/
    products/
      api.ts                # data access for this feature
      hooks.ts              # useProducts, useProductMutations
      components/           # ProductCard, ProductTable, ProductForm
      types.ts
      index.ts              # ← the feature's public API (what other code may import)
    orders/
    cart/
    auth/
  shared/
    ui/                     # Button, Input, Modal, Table (design-system level)
    hooks/                  # useDebouncedValue, useMediaQuery
    lib/                    # money.ts, dates.ts, cx.ts (pure, testable)
    api/                    # http client, error mapping
  test/                     # setup, render helpers, MSW handlers
```

Rules that make it work:

| Rule | Why |
| --- | --- |
| A feature owns its API calls, hooks, components and types | "Products" is one folder you can read, test and delete |
| **Features import only from `shared/`, never from each other** | prevents the tangle; the app stays a set of swappable parts |
| If two features need the same thing, it moves to `shared/` — or one feature exposes it explicitly | forces the decision instead of a stealth dependency |
| `index.ts` is the public API: everything else is private | reviewers can see the contract; deep imports are a smell |
| Pages compose features, they do not implement them | keeps routing thin and features portable |

```ts
// features/products/index.ts — the *only* file other folders may import
export { ProductTable } from './components/ProductTable';
export { useProducts } from './hooks';
export type { Product } from './types';
```

```tsx
// pages/ProductsPage.tsx — composition, no implementation detail
import { ProductTable, useProducts } from '../features/products';

export function ProductsPage() {
  const { data, error, isPending } = useProducts();
  if (isPending) return <ProductsSkeleton />;
  if (error !== null) return <ErrorPanel error={error} />;
  return <ProductTable products={data} />;
}
```

⚠️ **The `index.ts` (barrel) debate, honestly:** barrels make imports clean (`from '../features/products'`) but can hurt tree-shaking, create circular imports (if internal files import each other through the barrel), and slow down large builds. The working compromise: **one barrel per feature boundary** (not one per folder, not nested barrels), and internal files import their siblings directly (`./components/ProductCard`), never through the barrel.

---

## 4. The three-way split that keeps most apps clean

Beyond features and shared code, three more separations prevent the classic messes:

| Split | Rule | Symptom when missing |
| --- | --- | --- |
| **UI vs logic** | components render; hooks compute; `lib/` is pure | a 600-line component mixing fetch, business rules and JSX |
| **Server state vs client state** | server data lives in the data layer (TanStack Query / RTK Query); client state in stores/context (Part 9) | the same list fetched twice, cache and store disagreeing |
| **Config vs code** | environment and feature flags in one module (file 01) | `import.meta.env` reads scattered through components |

```tsx
// UI vs logic, in practice
// features/cart/lib/totals.ts — pure, unit-testable, no React
export function cartTotalMinor(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
}

// features/cart/hooks/useCartTotal.ts — React glue
export function useCartTotal(): number {
  const items = useCartStore((state) => state.items);
  return cartTotalMinor(items);
}

// features/cart/components/CartSummary.tsx — rendering only
export function CartSummary() {
  return <p>{formatMinor(useCartTotal())}</p>;
}
```

The payoff is in testing: the totals function gets exhaustive unit tests (Part 13, file 01), the hook gets one test, and the component test asserts what the user sees.

---

## 5. Refactoring a layer-based mess, in order

| Step | Action | Verification |
| --- | --- | --- |
| 1 | Create `features/` and start with **the feature you are working on** | the PR is small and shippable |
| 2 | Move the feature's components, hooks, api and types together | imports inside the feature become relative and short |
| 3 | Create the feature's `index.ts` and switch external imports to it | grep for deep imports into the feature — should be zero |
| 4 | Move genuinely shared code to `shared/` **when a second feature needs it** | no speculative moves |
| 5 | Repeat per feature, in the order you touch them | the folder count in `components/` and `hooks/` shrinks every sprint |
| 6 | Add a lint rule to keep it true | `import/no-restricted-paths` or an eslint-plugin-boundaries rule (see below) |

```js
// eslint.config.js (excerpt) — make the architecture enforceable, not aspirational
{
  files: ['src/features/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['**/features/*/*'], message: 'Import another feature through its index.ts (public API).' },
        { group: ['**/pages/*'], message: 'Features must not import pages.' },
      ],
    }],
  },
}
```

💡 An architecture that is only in a document rots in a month. One lint rule per boundary — features via index, no feature→feature imports, no `shared` importing features — keeps it alive for free, and it fails in review instead of in six months.

---

## 6. Where the hard calls are

| Situation | Options | Recommendation |
| --- | --- | --- |
| Two features need the same component | duplicate it, or promote it to `shared/ui` | promote when the *requirements* are the same; duplicate while they are visibly diverging (a shared component that grows a `variant` for each caller is worse than two copies) |
| A "feature" that is really a page | keep it in `pages/`, do not create a feature folder with one file | features earn their folder by having several files |
| Cross-cutting state (auth, theme) | `app/` or `shared/` with a provider in the shell | not a feature — nothing renders it directly |
| A shared type used by API and UI | `shared/types` or the feature's `types.ts` if only one feature uses it | avoid a global `types.ts` dumping ground |
| A utility used once | keep it next to its user | `lib/` is for genuinely reusable, pure helpers |
| A big feature with sub-parts (checkout: cart, payment, address) | sub-folders inside the feature | one public `index.ts` at the feature boundary; sub-parts may import each other freely |
| A monorepo / shared design system | a workspace package (`packages/ui`) with its own exports and CI | only when multiple apps need it — the cost is real (versioning, build) |

⚠️ **The most expensive mistake in this area is premature structure**: a `packages/` monorepo, five layers and a dependency-injection container for an app with six screens. Architecture should be *one step ahead* of discomfort — enough to keep the code navigable, not so much that the structure itself needs documentation to use.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Features importing each other | changes ripple, nothing is deletable | shared code goes to `shared/`, or a defined entry point |
| 2 | Deep imports into another feature | the internal structure becomes public API | import via `index.ts` |
| 3 | A global `components/` and `hooks/` that keep growing | no feature is readable on its own | move on touch; feature folders |
| 4 | Nested barrels everywhere | circular imports, tree-shaking problems | one barrel per boundary |
| 5 | A `utils.ts` with 40 unrelated functions | nobody knows what is there | `lib/money.ts`, `lib/dates.ts`, `shared/hooks/…` |
| 6 | Shared components with a `variant` per caller | every change risks another consumer | duplicate while requirements diverge |
| 7 | Business logic inside components | untestable, duplicated | `lib/` (pure) + hooks (glue) |
| 8 | Server state in a global store *and* a data library | two sources of truth | one owner per kind of state (Part 9) |
| 9 | Architecture documented but not enforced | it drifts within a quarter | lint rules for the boundaries |
| 10 | Refactoring everything at once | a huge unmergeable PR | migrate on touch, one feature per PR |
| 11 | One-folder-per-file trees (`Button/Button.tsx`, `Button/index.ts`) | deep paths, extra ceremony | `components/Button.tsx` until a component needs siblings |
| 12 | Never deleting a feature | dead code accumulates | deletability is the metric; delete quarterly |

---

## 8. Best practices

1. **Draw the arrows first**, then the folders: dependencies flow down (pages → features → shared → lib), never sideways.
2. **Organise by capability** once the app has more than a handful of screens: a feature is a folder you can read, test and delete.
3. **One public API per feature** (`index.ts`), and lint the boundary.
4. **Promote to `shared/` on the second real use**, never on a guess.
5. **Keep `lib/` pure** and React-free so it is trivially testable.
6. **One owner per kind of state** (server state in the data layer, client state in stores, form state in the form).
7. **Keep pages thin**: composition and loading/error branches, not logic.
8. **Migrate on touch**, with the lint rule enforcing what you have already migrated.
9. **Delete something every quarter**, and celebrate it — a codebase that only grows is a codebase nobody understands.
10. **Match structure to team size**: two developers need fewer rules than twenty; a growing team needs boundaries more than it needs cleverness.

---

## 9. Practice

### Beginner

1. List five folders in your project and, for each, say which layer it belongs to (page, feature, shared, lib, api) and what it may import.
2. Take one feature and write down every file it consists of. Is it one folder, or is it scattered?
3. For each of these imports, say whether it is legal under the rules in section 1: `features/orders → features/products`, `pages/OrdersPage → features/orders`, `shared/ui/Button → features/cart`, `features/cart/components/Row → shared/lib/money`.

### Intermediate

1. Convert one feature to a feature folder with an `index.ts`, and count the deep imports that disappear.
2. Write the lint rule for your boundaries and fix the violations it finds (the list is your migration backlog).
3. Split a component that mixes fetching, business logic and rendering into `lib/`, a hook, and a component, then write one test per layer.

### Challenge

1. Design the architecture for a product with four areas (catalogue, checkout, account, admin) and a shared design system. Specify the folders, the allowed arrows, the state ownership, and where auth and flags live. Then implement the skeleton and one feature in it.
2. Take an existing codebase and measure its boundaries: count imports that violate the rules, feature-to-feature imports, components over 300 lines, and hooks that call `fetch` directly. Present the numbers as a migration plan with the first three PRs.
3. Decide, with evidence, whether your project should have a shared UI package: how many components are used by more than one consumer, what the versioning cost would be, and what you would gain. Then write the decision record (context, options, decision, consequences).

---

## 10. Solutions

### Beginner

1. `components/` (shared UI) may import `lib/`; `hooks/` (shared logic) may import `lib/` and the API layer; `api/` may import `lib/` and types; `pages/` may import features and shared; `utils/` imports nothing app-specific. Anything importing *up* the list is a violation.
2. Typical answer: a feature is 5–15 files spread across `components/`, `hooks/`, `api/` and `types/` — which is exactly why layer-based structures become hard to change.
3. Legal: `pages → features`, `features/cart/components/Row → shared/lib/money`. Illegal: `features/orders → features/products` (should go through a shared module or a documented entry), `shared/ui/Button → features/cart` (shared code must never depend on a feature).

### Intermediate

1. Moving files and adding the barrel typically removes 10–30 deep import paths in the feature's own files and makes external imports one line each. Count both numbers before/after — they are the evidence that the boundary is real.
2. `no-restricted-imports` (or `eslint-plugin-boundaries`) with the rules from section 5; the first run usually finds a handful of feature-to-feature imports and one or two `shared → feature` violations (often a "helper" that belongs to the feature).
3. `lib` gets the pure function with unit tests (`cartTotalMinor`), the hook gets one test (mocking the store), and the component gets a rendering/interaction test. The component's test no longer needs to know the maths, and the maths test no longer needs a DOM — the split reduced both coupling and runtime.

### Challenge

1. A defensible design: `pages/` for routes, `features/{catalogue,checkout,account,admin}/` with barrels, `shared/{ui,lib,hooks,api}/`, `app/` for the shell (providers, router, error boundary), and auth/theme/flags in `app/` (cross-cutting, not features). Arrows: pages → features → shared → lib; features never import features; `app/` may import everything (it is the composition root). State: server state in the query layer keyed by feature; client state local unless it is cross-cutting; form state in forms.
2. Measure with grep/scripts: `rg "from '.*features/" | wc -l` for cross-feature imports, `rg "fetch\(|axios" src/features` for direct network calls, and a line-count report for components. A migration plan orders by risk: first the lint rule (cheap, stops the bleeding), then the feature you touch most (visible win), then the ones with the most violations.
3. Decide with numbers: if only three components are truly shared, a package is overhead — put them in `shared/ui` and revisit later; a package becomes worth it when two *applications* need the same components with independent release cycles, at which point versioning, CI and a build pipeline are the real costs (and the real benefits, too: independent versioning and clear ownership).

---

## 11. Summary

- **Architecture is the direction of dependencies**, not the shape of folders: pages → features → shared → lib, one way only, with no feature-to-feature imports.
- **Layer-based structure works while the app is small** and fails at scale because a feature has no home; feature-based structure gives you deletable units and readable change sets.
- **One public API per feature** (`index.ts`), with internal files importing their siblings directly, avoids the barrel pitfalls (circular imports, tree-shaking) while keeping boundaries visible.
- **Three splits prevent most messes**: UI vs logic (`lib/` pure), server state vs client state (one owner each), config vs code (one env module — file 01).
- **Enforce the boundaries with lint**, or they drift within a quarter; the rule is also the migration backlog, because every violation it reports is a file to move.
- **The hard calls have defaults**: promote on the second real use, duplicate while requirements diverge, keep cross-cutting concerns in `app/`, and avoid premature structure (a monorepo and five layers for six screens is a cost, not an achievement).
- **The metric that matters is deletability**: if removing a feature's folder leaves the app building and the tests green, the arrows are right.

---

**What's next →** [`03-folder-structure.md`](./03-folder-structure.md) turns the arrows into an actual tree: every folder and file explained, naming conventions, colocating tests and styles with components, path aliases, where `index.ts` belongs and where it does not, and the practical rules that keep a real project navigable.
