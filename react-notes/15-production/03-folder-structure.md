# 03 — Folder Structure: Every Folder, Every Convention

> **Part 15 · Production · File 3 of 8**

Why this file exists: file 02 decided the arrows; this file decides where the boxes go. It is deliberately concrete — a full tree with every folder explained, the naming rules that make imports predictable, where tests and styles sit, when to create a folder versus a file, path aliases instead of `../../../..`, and the small conventions that decide whether a new developer finds things by guessing correctly. Nothing here is sacred: the value is *consistency*, not the specific layout, so the file also explains how to choose a different structure and still keep it navigable.

---

## 1. A complete tree for a real app

```text
product-app/
├── public/                       # static files copied as-is (favicon, robots.txt, config.js)
├── src/
│   ├── app/                      # the shell: everything that wraps the app
│   │   ├── App.tsx               # providers + router + layout
│   │   ├── router.tsx            # route table (Part 6)
│   │   ├── providers.tsx         # AuthProvider, QueryClientProvider, ThemeProvider
│   │   ├── ErrorBoundary.tsx     # the top-level boundary (Part 10, file 08)
│   │   └── styles/               # global css, tokens, tailwind entry (Part 12)
│   ├── pages/                    # one file per route — thin composition
│   │   ├── ProductsPage.tsx
│   │   ├── ProductDetailPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── features/                 # one folder per capability (Part 15, file 02)
│   │   ├── products/
│   │   │   ├── api.ts            # fetch/mutation functions for this feature
│   │   │   ├── hooks.ts          # useProducts, useProductMutations
│   │   │   ├── types.ts          # Product, ProductDraft, filters
│   │   │   ├── lib/              # pure helpers used only by this feature
│   │   │   ├── components/
│   │   │   │   ├── ProductTable.tsx
│   │   │   │   ├── ProductTable.test.tsx     # tests colocated
│   │   │   │   └── ProductForm.tsx
│   │   │   └── index.ts          # the feature's public API
│   │   ├── cart/
│   │   └── orders/
│   ├── shared/
│   │   ├── ui/                   # design-system primitives (Button, Input, Modal, Table)
│   │   ├── hooks/                # reusable hooks (useDebouncedValue, useMediaQuery)
│   │   ├── lib/                  # pure utilities (money.ts, dates.ts, cx.ts)
│   │   ├── api/                  # http client, error mapping, query keys factory
│   │   └── types/                # cross-feature types (ApiError, Paginated<T>)
│   ├── test/                     # test-only helpers
│   │   ├── setup.ts              # matchers, MSW lifecycle, cleanup
│   │   ├── render.tsx            # render with providers
│   │   └── handlers.ts           # default MSW handlers
│   ├── main.tsx                  # the entry: createRoot + <App />
│   └── vite-env.d.ts             # environment types (Part 15, file 01)
├── e2e/                          # browser tests (Playwright)
├── .env / .env.production
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

---

## 2. Every folder, and what it is for

| Folder | Contains | Does **not** contain | Rule of thumb |
| --- | --- | --- | --- |
| `public/` | files served verbatim (`favicon.ico`, `robots.txt`, `config.js`) | anything processed by the bundler | if it has a hash or an import, it belongs in `src/` |
| `src/app/` | providers, router, layout, global styles, the top error boundary | business logic, feature components | the composition root — the one place allowed to know everything |
| `src/pages/` | one thin file per route | logic, data fetching details, large JSX trees | a page = guards + layout + a feature component |
| `src/features/` | one folder per capability, self-contained | code shared by two features | deletable as a unit |
| `src/shared/ui/` | generic, reusable primitives with no product knowledge | `ProductCard`, `CartSummary` | if it mentions a domain concept, it is not shared UI |
| `src/shared/hooks/` | reusable hooks with no domain logic | `useProducts` | `useMediaQuery` yes, `useCartTotal` no |
| `src/shared/lib/` | **pure** functions (no React, no network) | side effects, hooks | trivially unit-testable |
| `src/shared/api/` | the HTTP client, error types, base URL handling, key factories | feature endpoints | one client, one place where auth headers live |
| `src/test/` | setup, render helpers, default handlers | tests themselves | colocate tests with the code they test |
| `e2e/` | browser specs and fixtures | unit tests | a handful of critical journeys only (Part 13, file 01) |

💡 **The colocation rule covers tests, styles and stories**: `ProductTable.tsx`, `ProductTable.test.tsx` and `ProductTable.module.css` sit together. If a test lives in a parallel `__tests__` tree, the file you edit and the file you must update are never on screen at the same time — and the test drifts.

---

## 3. Naming conventions

| Kind | Convention | Example | Why |
| --- | --- | --- | --- |
| Component file | `PascalCase.tsx` | `ProductTable.tsx` | matches the export, sorts predictably, obvious in a file list |
| One component per file | yes, unless it is a private helper | `ProductRow` inside `ProductTable.tsx` is fine if not exported | the file name is the component name; searching works |
| Hook file | `useThing.ts` | `useDebouncedValue.ts` | greppable, and the export matches |
| Pure module | `camelCase.ts` | `money.ts`, `formatDate.ts` | it is a module of functions |
| Test file | `<subject>.test.tsx` | `ProductTable.test.tsx` | the runner's default include pattern |
| Styles | `<Component>.module.css` | `ProductTable.module.css` | scoped, adjacent (Part 12, file 02) |
| Constants | `SCREAMING_SNAKE_CASE` for true constants; `camelCase` objects otherwise | `const MAX_RETRIES = 3` | signals "do not mutate" |
| Type | `PascalCase`, no `I` prefix | `Product`, `CartItem` | matches the ecosystem (this book's convention throughout) |
| Boolean prop | `is/has/can` prefix | `isLoading`, `hasError`, `canEdit` | reads correctly in JSX |
| Handler prop | `on` + event | `onSelect`, `onChange` | distinguishes the prop from the local `handleSelect` |
| Feature folder | `kebab-case` or `camelCase`, plural when it is a collection | `products/`, `checkout/` | consistent within the project |

⚠️ **Pick kebab or camel for folders once.** Mixed conventions (`userProfile/` next to `product-list/`) are the most common small inconsistency in React codebases, and they make imports guesswork.

---

## 4. File versus folder

| Create a file | Create a folder |
| --- | --- |
| a component with a test and a style? → **folder or files?** | see the rule below |
| one component, no siblings | the component has sub-components, styles, tests and a hook |
| a pure helper module | a module with several related helpers and its own tests |
| a hook | a group of hooks that belong together (`cart/hooks/`) |

The pragmatic rule used by most teams: **one component = one file** until it needs siblings, then promote it to a folder *without* an `index.ts` unless the folder is a feature boundary:

```text
# before: three files in components/
components/ProductTable.tsx
components/ProductTable.test.tsx
components/ProductTable.module.css

# after (only if more siblings appear): a folder keeps them together
features/products/components/ProductTable/
  ProductTable.tsx
  ProductTable.test.tsx
  ProductTable.module.css
  ProductRow.tsx          # private helper
  index.ts                # ← optional; only if external code imports the folder
```

⚠️ `Button/Button.tsx` + `Button/index.ts` for a single-file component is pure ceremony: longer paths, more clicks, and an `index.ts` that does nothing. Reserve barrels for feature boundaries (Part 15, file 02) and for genuinely multi-file public modules.

---

## 5. Path aliases instead of `../../..`

```ts
// tsconfig.app.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["src/shared/*"],
      "@features/*": ["src/features/*"]
    }
  }
}
```

```ts
// vite.config.ts — Vite needs the same mapping (TypeScript does not resolve imports at runtime)
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
    },
  },
});
```

```tsx
// before                                     // after
import { Button } from '../../../shared/ui/Button';       import { Button } from '@shared/ui/Button';
import { useProducts } from '../../features/products';    import { useProducts } from '@features/products';
```

| Benefit | Cost |
| --- | --- |
| imports survive file moves | two configs to keep in sync (TS + Vite) |
| no `../../../` counting | some tools (and Jest configs) need the mapping too |
| boundaries are visible in the import itself (`@features/…`) | aliases can hide architecture violations unless linted |

💡 Add **one** alias (`@/`) rather than five. Fewer aliases means fewer configs to keep in sync and less ambiguity; if you need to *enforce* boundaries, use lint rules (file 02, section 5) rather than alias names.

---

## 6. Where the "misc" goes

The folders that ruin otherwise tidy projects are the catch-alls. Replace them deliberately:

| Instead of | Put it in |
| --- | --- |
| `utils.ts` with 40 functions | `shared/lib/money.ts`, `shared/lib/dates.ts`, … (one concern per file) |
| `types.ts` at the root with every type | the feature's `types.ts`; only cross-feature types in `shared/types` |
| `constants.ts` | next to the code that uses them, or `shared/lib/config.ts` for app-wide ones |
| `helpers/` | same problem as `utils/` — name the concern, not the vagueness |
| `components/` at the root | `shared/ui/` for primitives, `features/*/components/` for the rest |
| `misc/`, `temp/`, `old/` | nothing: delete it (git remembers) |

⚠️ Every `utils.ts` becomes the drawer where things are put because the author could not decide — which means nobody can find anything in it. Naming the concern (`money.ts`) is a five-second decision that saves a five-minute search later.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Tests in a parallel `__tests__` tree | the test and the code are never open together | colocate |
| 2 | `index.ts` in every folder | circular imports, slower builds, no benefit | barrels only at boundaries |
| 3 | `../../../..` imports | move one file and everything breaks | path aliases |
| 4 | Root-level `components/`, `hooks/`, `utils/` growing forever | nothing is findable | feature folders; promote on second use |
| 5 | Mixed folder casing | imports become guesswork | pick one convention |
| 6 | Domain components in `shared/ui` | "shared" becomes the junk drawer | shared UI is generic only |
| 7 | A `pages/` folder with business logic | pages become untestable and duplicated | composition only |
| 8 | Deep nesting for its own sake (`components/product/table/row/`) | paths longer than the code | flatten to the level that reads well |
| 9 | Case-insensitive filesystem bugs (`Table.tsx` vs `table.tsx`) | works on macOS, breaks in CI/Linux | names must differ by more than case |
| 10 | `src/assets/` mixing icons, fonts and photos | unclear ownership and hashing strategy | `public/` for verbatim files, `src/assets/` for imported ones, feature-owned if only one feature uses them |
| 11 | An `e2e/` folder inside `src/` | the bundler tries to include it | keep it outside `src/` |
| 12 | Reorganising the whole repo in one PR | an unmergeable diff | migrate on touch (file 02) |

---

## 8. Best practices

1. **Write the tree in the README** and keep it current — it is the fastest way for a newcomer to become productive.
2. **Colocate** tests, styles and stories with the component.
3. **One component per file**, named like its export.
4. **Feature folders own their API, hooks, types and components**, with one public `index.ts`.
5. **Use one path alias** (or one per layer at most), and keep TS and Vite in sync.
6. **Name concerns, not vagueness**: `money.ts`, not `utils.ts`.
7. **Keep pages thin**; the folder name should tell you that before you open the file.
8. **Make the structure match the domain**, not the framework's vocabulary (`features/products`, not `features/crud`).
9. **Delete dead folders** quarterly; an empty `old/` folder is an invitation to put something there.
10. **Change structure when it hurts**, in small PRs, with lint enforcing what has already moved.

---

## 9. Practice

### Beginner

1. Draw your project's tree and label each folder with its layer (app, page, feature, shared, lib, test).
2. Rename one component file to match its export, and move one test next to its component.
3. Count the `../` depth in your five deepest imports; propose alias mappings for them.

### Intermediate

1. Set up a path alias in both `tsconfig` and `vite.config.ts`, convert ten imports, and confirm the tests still resolve the paths.
2. Take a root `utils.ts` and split it into three named modules with tests; measure how many imports change.
3. Introduce the feature-folder pattern for one feature, including its `index.ts`, and update the README's tree.

### Challenge

1. Design the folder structure for the multi-area app from file 02's challenge, including where flags, auth, i18n, and shared types live. Then justify each top-level folder in one sentence, and write the README section a new developer would read first.
2. Add an architectural test: a script (or lint rule) that fails when `shared/` imports from `features/` or when a feature imports another feature. Wire it into CI and prove it fails on a deliberate violation.
3. Measure the discoverability of your structure: ask a teammate (or yourself, cold) to find where "the code that formats prices" and "the code that uploads an avatar" live. If either takes more than 30 seconds, redesign the relevant part and measure again.

---

## 10. Solutions

### Beginner

1. Labels: `app/` (shell), `pages/` (routes), `features/*` (capabilities), `shared/{ui,hooks,lib,api,types}` (reusable, domain-free), `test/` (helpers), `e2e/` (browser tests outside `src/`).
2. Renaming means the import path and the file both change; the win is that "find file by component name" works in an editor or a search. Colocating the test means a change to the component shows the test in the same diff.
3. Typical results: `../../../../shared/ui/Button` and `../../../features/products` → `@shared/ui/Button` and `@features/products`. The alias config needs to exist in `tsconfig.app.json` (for the type-checker/editor) and `vite.config.ts` (for the bundler) — missing the second produces "failed to resolve import" at build time.

### Intermediate

1. Alias configured as in section 5. After conversion, `npx tsc -b` and `npx vitest run` both resolve; if Vitest reports unresolved imports, it is using a stale config cache — it reads `vite.config.ts`, so a `resolve.alias` addition usually just works (a leftover `test.alias` is where projects get into trouble).
2. Splitting `utils.ts` into `money.ts` (formatting/parsing), `dates.ts` (relative time, formatting) and `strings.ts` (truncate, slugify) usually touches 10–30 import sites, and the change is mechanical. The win shows up later: a change to money formatting now touches one file with one test file.
3. Feature folder: `features/products/{api.ts,hooks.ts,types.ts,components/*,index.ts}`; the README tree is updated in the same PR, which is also the moment to notice any folder that no longer matches reality.

### Challenge

1. Suggested top level: `app/` (shell, providers, router, flags, i18n setup), `pages/`, `features/{catalogue,checkout,account,admin}/`, `shared/{ui,hooks,lib,api,types}/`, `test/`, `e2e/`. Each sentence should name the *capability*: "features/catalogue: everything needed to browse and search products, with its own API, hooks, types and components; deletable without touching other features."
2. A minimal architectural test: a Node script that walks `src/` and flags imports matching `/from ['"]@features\/(\w+)/` where the importing file is inside a different feature, plus any `@features/` import from `shared/`. Run it in CI after lint; a deliberate violation (add a bad import) proves the guard works — and the error message should say what to do instead, which is what makes it educational rather than annoying.
3. The test is real: if the answer to "where does price formatting live?" is "probably utils.ts, let me search", you have found a structure problem. The fix is usually naming a concern (`shared/lib/money.ts`) and updating the README — after which the same question takes seconds.

---

## 11. Summary

- **A concrete tree beats a philosophy**: `app/` (shell), `pages/` (thin routes), `features/` (one capability each, with its own API, hooks, types and components), `shared/` (generic UI, hooks, pure lib, the HTTP client), `test/`, `e2e/`.
- **Every folder has a rule**: `public/` is verbatim files; `shared/ui` is domain-free primitives; `shared/lib` is pure; `features/` is deletable as a unit; `pages/` is composition only.
- **Colocation is the default**: tests, styles and stories live next to the component, so a change and its verification are in one place.
- **Conventions make imports predictable**: PascalCase components, `useThing.ts` hooks, `<Subject>.test.tsx`, `is/has/can` booleans, `on*` props — and one casing style for folders.
- **One component is one file** until it needs siblings; barrels belong at feature boundaries, not in every folder.
- **Path aliases** replace `../../../..`, with the cost of keeping TS and Vite in sync — and lint rules, not alias names, are what enforce the architecture.
- **Name concerns, not vagueness**: `money.ts` beats `utils.ts`, and every catch-all folder is a decision deferred to the person who can least make it.

---

**What's next →** [`04-error-handling.md`](./04-error-handling.md) covers production failure: the taxonomy of errors a React app can produce (render, async, network, user input), where each one is caught (boundaries, the HTTP client, the action, the handler), what the user should see in each case, the global handlers that catch what boundaries miss, and how to make failures that reach users report themselves.
